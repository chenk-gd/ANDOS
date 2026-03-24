/**
 * Unified LLM type definitions for ANDOS
 *
 * This module provides a provider-agnostic interface for interacting with
 * Large Language Models (Anthropic, OpenAI, and OpenAI-compatible providers).
 */

/**
 * Represents a message in an LLM conversation
 */
export interface LLMMessage {
  /** The role of the message sender */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** The content of the message */
  content: string;
  /** Tool calls made by the assistant (for assistant messages) */
  toolCalls?: LLMToolCall[];
  /** The ID of the tool call being responded to (for tool messages) */
  toolCallId?: string;
}

/**
 * Represents a tool that can be made available to an LLM
 */
export interface LLMTool {
  /** The name of the tool */
  name: string;
  /** A description of what the tool does */
  description: string;
  /** JSON Schema for the tool's parameters */
  parameters: Record<string, unknown>;
}

/**
 * Represents a tool call from an LLM
 */
export interface LLMToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** The name of the tool being called */
  name: string;
  /** The arguments to pass to the tool */
  arguments: Record<string, unknown>;
}

/**
 * Represents a request to an LLM
 */
export interface LLMRequest {
  /** The model to use for generation */
  model: string;
  /** The conversation messages */
  messages: LLMMessage[];
  /** Maximum number of tokens to generate */
  maxTokens?: number;
  /** Sampling temperature (0-1) */
  temperature?: number;
  /** Tools available for the LLM to use */
  tools?: LLMTool[];
  /** System prompt (alternative to system message) */
  system?: string;
}

/**
 * Represents a response from an LLM
 */
export interface LLMResponse {
  /** The generated text content */
  content: string;
  /** Tool calls made by the model */
  toolCalls?: LLMToolCall[];
  /** Token usage information */
  usage: {
    /** Number of input tokens */
    inputTokens: number;
    /** Number of output tokens */
    outputTokens: number;
    /** Total token count */
    totalTokens: number;
  };
  /** The model that generated the response */
  model: string;
}

/**
 * Represents an event in an LLM streaming response
 */
export interface LLMStreamEvent {
  /** The type of event */
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  /** Text content (for text events) */
  content?: string;
  /** Tool call information (for tool_call events) */
  toolCall?: LLMToolCall;
  /** Error message (for error events) */
  error?: string;
}

/**
 * Interface for LLM provider implementations
 */
export interface LLMProvider {
  /** The name of the provider */
  readonly name: string;

  /**
   * Generate a response from the LLM
   * @param request - The request parameters
   * @returns A promise resolving to the LLM response
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Stream a response from the LLM
   * @param request - The request parameters
   * @returns An async generator yielding stream events
   */
  stream?(request: LLMRequest): AsyncGenerator<LLMStreamEvent>;
}

/**
 * Configuration for LLM providers
 */
export interface LLMProviderConfig {
  /** The provider type */
  provider: 'anthropic' | 'openai' | 'openai-compatible';
  /** API key for the provider */
  apiKey: string;
  /** Base URL for the API (for openai-compatible) */
  baseURL?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}
