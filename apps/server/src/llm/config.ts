/**
 * LLM Configuration management for ANDOS
 *
 * Loads LLM configuration from environment variables with sensible defaults.
 * Backward compatible - defaults to Anthropic provider.
 */

import { LLMProviderConfig } from './types';

/**
 * LLM Configuration object containing all provider settings
 */
export interface LLMConfig {
  /** The default provider to use */
  defaultProvider: 'anthropic' | 'openai' | 'openai-compatible';
  /** The default model to use when none is specified */
  defaultModel: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Anthropic provider configuration */
  anthropic?: LLMProviderConfig;
  /** OpenAI provider configuration */
  openai?: LLMProviderConfig;
  /** OpenAI-compatible provider configuration */
  openaiCompatible?: LLMProviderConfig;
}

/**
 * Loads LLM configuration from environment variables
 * @returns The loaded LLM configuration
 */
export function loadLLMConfig(): LLMConfig {
  const defaultProvider = (process.env.LLM_PROVIDER as 'anthropic' | 'openai' | 'openai-compatible') || 'anthropic';
  const defaultModel = process.env.LLM_DEFAULT_MODEL || 'claude-3-opus-20240229';
  const timeout = parseInt(process.env.LLM_TIMEOUT || '60000', 10);

  const config: LLMConfig = {
    defaultProvider,
    defaultModel,
    timeout,
  };

  // Anthropic configuration
  if (process.env.ANTHROPIC_API_KEY) {
    config.anthropic = {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-opus-20240229',
      timeout,
    };
  }

  // OpenAI configuration
  if (process.env.OPENAI_API_KEY) {
    config.openai = {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4',
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      timeout,
    };
  }

  // OpenAI-compatible configuration
  if (process.env.OPENAI_COMPATIBLE_API_KEY) {
    config.openaiCompatible = {
      provider: 'openai-compatible',
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      defaultModel: process.env.OPENAI_COMPATIBLE_DEFAULT_MODEL || 'gpt-4',
      baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL,
      timeout,
    };
  }

  return config;
}

/**
 * Gets the configuration for a specific provider
 * @param provider - The provider name
 * @returns The provider configuration
 * @throws Error if the provider is not configured
 */
export function getProviderConfig(provider: string): LLMProviderConfig {
  const config = loadLLMConfig();

  switch (provider) {
    case 'anthropic':
      if (!config.anthropic) {
        throw new Error('Anthropic provider not configured. Set ANTHROPIC_API_KEY environment variable.');
      }
      return config.anthropic;
    case 'openai':
      if (!config.openai) {
        throw new Error('OpenAI provider not configured. Set OPENAI_API_KEY environment variable.');
      }
      return config.openai;
    case 'openai-compatible':
      if (!config.openaiCompatible) {
        throw new Error('OpenAI-compatible provider not configured. Set OPENAI_COMPATIBLE_API_KEY environment variable.');
      }
      return config.openaiCompatible;
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Gets the default provider configuration
 * @returns The default provider configuration
 * @throws Error if the default provider is not configured
 */
export function getDefaultProviderConfig(): LLMProviderConfig {
  const config = loadLLMConfig();
  return getProviderConfig(config.defaultProvider);
}

/**
 * Validates that the required configuration is present
 * @returns True if configuration is valid, false otherwise
 */
export function validateLLMConfig(): boolean {
  const config = loadLLMConfig();

  // At minimum, we need one configured provider
  if (config.anthropic || config.openai || config.openaiCompatible) {
    return true;
  }

  return false;
}

// Export singleton instance
export const llmConfig = loadLLMConfig();
