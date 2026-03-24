/**
 * LLM Module for ANDOS
 *
 * Unified interface for interacting with Large Language Models.
 * Supports Anthropic, OpenAI, and OpenAI-compatible providers.
 *
 * @example
 * ```typescript
 * import { LLMProvider, LLMRequest, LLMError } from '@/llm';
 *
 * // Use the unified types
 * const request: LLMRequest = {
 *   model: 'claude-3-opus-20240229',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * };
 * ```
 */

// Types
export {
  LLMMessage,
  LLMTool,
  LLMToolCall,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  LLMProvider,
  LLMProviderConfig,
} from './types';

// Errors
export {
  LLMError,
  LLMRateLimitError,
  LLMTokenLimitError,
  LLMAuthenticationError,
  LLMValidationError,
  LLMServiceUnavailableError,
} from './errors';

// Config
export {
  LLMConfig,
  loadLLMConfig,
  getProviderConfig,
  getDefaultProviderConfig,
  validateLLMConfig,
  llmConfig,
} from './config';
