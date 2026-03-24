/**
 * LLM Provider Factory
 *
 * Factory for creating and caching LLM provider instances.
 * Provides a centralized way to get provider instances with configuration.
 */

import {
  LLMProvider,
  LLMProviderConfig,
} from './types';
import {
  AnthropicProvider,
  OpenAIProvider,
  OpenAICompatibleProvider,
} from './providers';
import { loadLLMConfig, getProviderConfig, getDefaultProviderConfig } from './config';

/**
 * Factory for creating and managing LLM provider instances
 */
export class LLMProviderFactory {
  private static providerCache: Map<string, LLMProvider> = new Map();

  /**
   * Creates a provider instance from configuration
   * @param config - The provider configuration
   * @returns The created provider instance
   * @throws Error if the provider type is not supported
   */
  static create(config: LLMProviderConfig): LLMProvider {
    // Check cache first
    const cacheKey = this.getCacheKey(config);
    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    let provider: LLMProvider;

    switch (config.provider) {
      case 'anthropic':
        provider = new AnthropicProvider(config);
        break;
      case 'openai':
        provider = new OpenAIProvider(config);
        break;
      case 'openai-compatible':
        provider = new OpenAICompatibleProvider(config);
        break;
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }

    // Cache the provider instance
    this.providerCache.set(cacheKey, provider);

    return provider;
  }

  /**
   * Gets the global provider instance from environment configuration
   * Uses the default provider configured in environment variables
   * @returns The global provider instance
   * @throws Error if no provider is configured
   */
  static getGlobalProvider(): LLMProvider {
    const config = getDefaultProviderConfig();
    return this.create(config);
  }

  /**
   * Gets a provider instance by name from environment configuration
   * @param providerName - The name of the provider ('anthropic', 'openai', 'openai-compatible')
   * @returns The provider instance
   * @throws Error if the provider is not configured
   */
  static getProvider(providerName: string): LLMProvider {
    const config = getProviderConfig(providerName);
    return this.create(config);
  }

  /**
   * Clears the provider cache
   * Useful for testing to ensure fresh instances
   */
  static clearCache(): void {
    this.providerCache.clear();
  }

  /**
   * Gets the cache key for a provider configuration
   * @param config - The provider configuration
   * @returns A unique cache key
   */
  private static getCacheKey(config: LLMProviderConfig): string {
    // Create a cache key based on provider type and API key (first 8 chars for privacy)
    const keyPrefix = config.apiKey.substring(0, 8);
    const baseUrl = config.baseURL || 'default';
    return `${config.provider}:${keyPrefix}:${baseUrl}`;
  }
}
