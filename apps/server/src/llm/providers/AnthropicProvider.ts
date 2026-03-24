/**
 * Anthropic LLM Provider implementation
 *
 * Implements the LLMProvider interface for Anthropic's Claude API.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  LLMMessage,
  LLMTool,
  LLMToolCall,
  LLMProviderConfig,
} from '../types';
import {
  LLMError,
  LLMRateLimitError,
  LLMTokenLimitError,
  LLMAuthenticationError,
  LLMValidationError,
  LLMServiceUnavailableError,
} from '../errors';

/**
 * LLM Provider implementation for Anthropic Claude
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private config: LLMProviderConfig;

  /**
   * Creates a new AnthropicProvider instance
   * @param config - The provider configuration
   */
  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout,
    });
  }

  /**
   * Converts unified LLM messages to Anthropic format
   * Anthropic doesn't support 'system' or 'tool' roles in messages array,
   * so we extract system messages and convert tool messages
   */
  private convertMessages(messages: LLMMessage[]): {
    anthropicMessages: Anthropic.Messages.MessageParam[];
    systemPrompt?: string;
  } {
    let systemPrompt: string | undefined;
    const anthropicMessages: Anthropic.Messages.MessageParam[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Anthropic uses a separate system parameter
        systemPrompt = message.content;
        continue;
      }

      if (message.role === 'tool') {
        // Convert tool result to Anthropic format
        const toolResultContent: Anthropic.Messages.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: message.toolCallId || 'unknown',
          content: message.content,
        };
        anthropicMessages.push({
          role: 'user',
          content: [toolResultContent],
        });
        continue;
      }

      if (message.role === 'assistant' && message.toolCalls) {
        // Convert assistant message with tool calls
        const content: Anthropic.Messages.ContentBlockParam[] = [];
        if (message.content) {
          content.push({ type: 'text', text: message.content });
        }
        for (const toolCall of message.toolCalls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          });
        }
        anthropicMessages.push({ role: 'assistant', content });
        continue;
      }

      // Regular user/assistant messages
      if (message.role === 'user' || message.role === 'assistant') {
        anthropicMessages.push({
          role: message.role,
          content: message.content,
        });
      }
    }

    return { anthropicMessages, systemPrompt };
  }

  /**
   * Converts unified tools to Anthropic format
   */
  private convertTools(tools: LLMTool[]): Anthropic.Messages.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: (tool.parameters.properties || {}) as Record<string, unknown>,
        required: (tool.parameters.required as string[]) || [],
      },
    }));
  }

  /**
   * Parses Anthropic response content to extract text and tool calls
   */
  private parseResponseContent(content: Anthropic.Messages.ContentBlock[]): {
    text: string;
    toolCalls?: LLMToolCall[];
  } {
    let text = '';
    const toolCalls: LLMToolCall[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        text += block.text || '';
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: block.name || 'unknown',
          arguments: (block.input as Record<string, unknown>) || {},
        });
      }
    }

    return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  /**
   * Maps Anthropic errors to unified LLMError types
   */
  private mapError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const err = error as Error & {
      status?: number;
      error?: { error?: { type?: string; message?: string } };
    };

    const status = err.status;
    const errorType = err.error?.error?.type;
    const message = err.error?.error?.message || err.message || 'Unknown error';

    // Rate limit errors
    if (status === 429 || errorType === 'rate_limit_error') {
      return new LLMRateLimitError(message, this.name);
    }

    // Authentication errors
    if (status === 401 || errorType === 'authentication_error') {
      return new LLMAuthenticationError(message, this.name);
    }

    // Token limit errors
    if (errorType === 'invalid_request_error' && message.toLowerCase().includes('token')) {
      return new LLMTokenLimitError(message, this.name);
    }

    // Service unavailable
    if (status === 503 || status === 502 || errorType === 'api_error') {
      return new LLMServiceUnavailableError(message, this.name);
    }

    // Validation errors
    if (status === 400) {
      return new LLMValidationError(message, this.name);
    }

    return new LLMError(message, 'UNKNOWN_ERROR', this.name, true);
  }

  /**
   * Generates a response from the LLM
   * @param request - The request parameters
   * @returns A promise resolving to the LLM response
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const { anthropicMessages, systemPrompt } = this.convertMessages(request.messages);
      const tools = request.tools ? this.convertTools(request.tools) : undefined;

      // Use system from request or extracted from messages
      const system = request.system || systemPrompt;

      const response = await this.client.messages.create({
        model: request.model || this.config.defaultModel || 'claude-3-opus-20240229',
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature,
        messages: anthropicMessages,
        system,
        tools,
      });

      const { text, toolCalls } = this.parseResponseContent(response.content);

      return {
        content: text,
        toolCalls,
        usage: {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
          totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        },
        model: response.model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Streams a response from the LLM
   * @param request - The request parameters
   * @returns An async generator yielding stream events
   */
  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    try {
      const { anthropicMessages, systemPrompt } = this.convertMessages(request.messages);
      const tools = request.tools ? this.convertTools(request.tools) : undefined;
      const system = request.system || systemPrompt;

      const stream = await this.client.messages.create({
        model: request.model || this.config.defaultModel || 'claude-3-opus-20240229',
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature,
        messages: anthropicMessages,
        system,
        tools,
        stream: true,
      });

      // Track accumulated tool call data for streaming
      const toolCallBuffer: Map<string, {
        id: string;
        name: string;
        arguments: string;
      }> = new Map();

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              type: 'text',
              content: event.delta.text,
            };
          } else if (event.delta.type === 'input_json_delta') {
            // Accumulate partial JSON for tool calls
            const blockIndex = event.index.toString();
            const buffer = toolCallBuffer.get(blockIndex);
            if (buffer) {
              buffer.arguments += event.delta.partial_json || '';
            }
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            // Start tracking a new tool call
            toolCallBuffer.set(event.index.toString(), {
              id: event.content_block.id,
              name: event.content_block.name,
              arguments: '',
            });
          }
        } else if (event.type === 'content_block_stop') {
          // Tool call complete, emit it
          const buffer = toolCallBuffer.get(event.index.toString());
          if (buffer) {
            try {
              const args = buffer.arguments ? JSON.parse(buffer.arguments) : {};
              yield {
                type: 'tool_call',
                toolCall: {
                  id: buffer.id,
                  name: buffer.name,
                  arguments: args,
                },
              };
            } catch {
              // If JSON parsing fails, emit with empty args
              yield {
                type: 'tool_call',
                toolCall: {
                  id: buffer.id,
                  name: buffer.name,
                  arguments: {},
                },
              };
            }
            toolCallBuffer.delete(event.index.toString());
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      const mappedError = this.mapError(error);
      yield {
        type: 'error',
        error: mappedError.message,
      };
    }
  }
}
