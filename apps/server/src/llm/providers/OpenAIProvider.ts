/**
 * OpenAI LLM Provider implementation
 *
 * Implements the LLMProvider interface for OpenAI's GPT API.
 */

import OpenAI from 'openai';
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
 * LLM Provider implementation for OpenAI
 */
export class OpenAIProvider implements LLMProvider {
  readonly name: string = 'openai';
  protected client: OpenAI;
  protected config: LLMProviderConfig;

  /**
   * Creates a new OpenAIProvider instance
   * @param config - The provider configuration
   */
  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout,
    });
  }

  /**
   * Converts unified LLM messages to OpenAI format
   */
  protected convertMessages(messages: LLMMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      if (message.role === 'tool') {
        result.push({
          role: 'tool',
          content: message.content,
          tool_call_id: message.toolCallId || 'unknown',
        });
      } else if (message.role === 'assistant' && message.toolCalls) {
        result.push({
          role: 'assistant',
          content: message.content,
          tool_calls: message.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else if (message.role === 'system' || message.role === 'user' || message.role === 'assistant') {
        result.push({
          role: message.role,
          content: message.content,
        });
      }
    }

    return result;
  }

  /**
   * Converts unified tools to OpenAI format
   */
  protected convertTools(tools: LLMTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Handles system prompt for OpenAI - adds as system message if provided
   */
  protected prepareMessages(
    messages: LLMMessage[],
    systemPrompt?: string
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const openaiMessages = this.convertMessages(messages);

    // If system prompt provided separately, prepend it
    if (systemPrompt) {
      // Check if there's already a system message
      const hasSystemMessage = openaiMessages.some((m) => m.role === 'system');
      if (!hasSystemMessage) {
        openaiMessages.unshift({
          role: 'system',
          content: systemPrompt,
        });
      }
    }

    return openaiMessages;
  }

  /**
   * Parses OpenAI response to extract tool calls
   */
  protected parseToolCalls(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
  ): LLMToolCall[] {
    return toolCalls.map((tc) => {
      // Type guard: check if it's a function tool call
      if (tc.type !== 'function') {
        return {
          id: tc.id,
          name: 'unknown',
          arguments: {},
        };
      }
      const fn = (tc as OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
        function: { name: string; arguments: string }
      }).function;
      let args: Record<string, unknown> = {};
      try {
        args = fn.arguments ? JSON.parse(fn.arguments) : {};
      } catch {
        // If parsing fails, use empty object
      }
      return {
        id: tc.id,
        name: fn.name,
        arguments: args,
      };
    });
  }

  /**
   * Maps OpenAI errors to unified LLMError types
   */
  protected mapError(error: unknown): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const err = error as Error & {
      status?: number;
      code?: string;
      error?: { code?: string; message?: string };
    };

    const status = err.status;
    const errorCode = err.code || err.error?.code;
    const message = err.error?.message || err.message || 'Unknown error';

    // Rate limit errors
    if (status === 429 || errorCode === 'rate_limit_exceeded') {
      return new LLMRateLimitError(message, this.name);
    }

    // Authentication errors
    if (status === 401 || errorCode === 'invalid_api_key') {
      return new LLMAuthenticationError(message, this.name);
    }

    // Token limit errors
    if (
      errorCode === 'context_length_exceeded' ||
      errorCode === 'max_tokens_exceeded' ||
      message.toLowerCase().includes('token')
    ) {
      return new LLMTokenLimitError(message, this.name);
    }

    // Service unavailable
    if (status === 503 || status === 502 || status === 500) {
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
      const messages = this.prepareMessages(request.messages, request.system);
      const tools = request.tools ? this.convertTools(request.tools) : undefined;

      const response = await this.client.chat.completions.create({
        model: request.model || this.config.defaultModel || 'gpt-4',
        messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        tools,
      });

      const choice = response.choices[0];
      const message = choice.message;

      const toolCalls = message.tool_calls
        ? this.parseToolCalls(message.tool_calls)
        : undefined;

      return {
        content: message.content || '',
        toolCalls,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
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
      const messages = this.prepareMessages(request.messages, request.system);
      const tools = request.tools ? this.convertTools(request.tools) : undefined;

      const stream = await this.client.chat.completions.create({
        model: request.model || this.config.defaultModel || 'gpt-4',
        messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        tools,
        stream: true,
      });

      // Track tool call accumulation for streaming
      const toolCallAccumulator: Map<
        number,
        { id: string; name: string; arguments: string }
      > = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Handle text content
        if (delta.content) {
          yield {
            type: 'text',
            content: delta.content,
          };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolDelta of delta.tool_calls) {
            const index = toolDelta.index;

            if (!toolCallAccumulator.has(index)) {
              // New tool call starting
              toolCallAccumulator.set(index, {
                id: toolDelta.id || `call_${Date.now()}_${index}`,
                name: toolDelta.function?.name || '',
                arguments: toolDelta.function?.arguments || '',
              });
            } else {
              // Accumulate existing tool call
              const accum = toolCallAccumulator.get(index)!;
              if (toolDelta.function?.name) {
                accum.name = toolDelta.function.name;
              }
              if (toolDelta.function?.arguments) {
                accum.arguments += toolDelta.function.arguments;
              }
            }
          }
        }

        // Check for tool call completion (when finish_reason is 'tool_calls')
        if (chunk.choices[0]?.finish_reason === 'tool_calls') {
          // Emit all accumulated tool calls
          for (const [, accum] of Array.from(toolCallAccumulator.entries())) {
            let args: Record<string, unknown> = {};
            try {
              args = accum.arguments ? JSON.parse(accum.arguments) : {};
            } catch {
              // If parsing fails, use empty object
            }
            yield {
              type: 'tool_call',
              toolCall: {
                id: accum.id,
                name: accum.name,
                arguments: args,
              },
            };
          }
          toolCallAccumulator.clear();
        }
      }

      // Emit any remaining tool calls
      for (const [, accum] of Array.from(toolCallAccumulator.entries())) {
        let args: Record<string, unknown> = {};
        try {
          args = accum.arguments ? JSON.parse(accum.arguments) : {};
        } catch {
          // If parsing fails, use empty object
        }
        yield {
          type: 'tool_call',
          toolCall: {
            id: accum.id,
            name: accum.name,
            arguments: args,
          },
        };
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
