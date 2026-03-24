/**
 * OpenAI Compatible LLM Provider implementation
 *
 * Extends OpenAIProvider for OpenAI-compatible APIs (custom endpoints).
 */

import { LLMProviderConfig } from '../types';
import { OpenAIProvider } from './OpenAIProvider';

/**
 * LLM Provider implementation for OpenAI-compatible endpoints
 * This provider extends OpenAIProvider and only changes the provider name
 * to support custom base URLs for services like Ollama, vLLM, etc.
 */
export class OpenAICompatibleProvider extends OpenAIProvider {
  readonly name = 'openai-compatible';

  /**
   * Creates a new OpenAICompatibleProvider instance
   * @param config - The provider configuration (must include baseURL)
   */
  constructor(config: LLMProviderConfig) {
    super(config);

    if (!config.baseURL) {
      throw new Error(
        'OpenAI-compatible provider requires a baseURL to be configured'
      );
    }
  }
}
