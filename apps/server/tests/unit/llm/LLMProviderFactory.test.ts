/**
 * LLMProviderFactory Tests
 *
 * Tests for the LLM Provider Factory which manages provider instances
 * and caching.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLMProviderFactory } from '../../../src/llm/LLMProviderFactory';
import { AnthropicProvider } from '../../../src/llm/providers/AnthropicProvider';
import { OpenAIProvider } from '../../../src/llm/providers/OpenAIProvider';
import { OpenAICompatibleProvider } from '../../../src/llm/providers/OpenAICompatibleProvider';
import type { LLMProviderConfig } from '../../../src/llm/types';

// Mock environment variables
const originalEnv = process.env;

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    // Clear cache before each test
    LLMProviderFactory.clearCache();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    // Clear cache after each test
    LLMProviderFactory.clearCache();
  });

  describe('create()', () => {
    it('should create an AnthropicProvider for anthropic type', () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-api-key',
        defaultModel: 'claude-3-5-sonnet-20241022',
      };

      const provider = LLMProviderFactory.create(config);

      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.name).toBe('anthropic');
    });

    it('should create an OpenAIProvider for openai type', () => {
      const config: LLMProviderConfig = {
        provider: 'openai',
        apiKey: 'test-openai-key',
        defaultModel: 'gpt-4',
      };

      const provider = LLMProviderFactory.create(config);

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.name).toBe('openai');
    });

    it('should create an OpenAICompatibleProvider for openai-compatible type', () => {
      const config: LLMProviderConfig = {
        provider: 'openai-compatible',
        apiKey: 'test-compatible-key',
        baseURL: 'https://custom.api.com/v1',
        defaultModel: 'custom-model',
      };

      const provider = LLMProviderFactory.create(config);

      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
      expect(provider.name).toBe('openai-compatible');
    });

    it('should throw an error for unsupported provider type', () => {
      const config = {
        provider: 'unsupported' as any,
        apiKey: 'test-key',
      };

      expect(() => LLMProviderFactory.create(config)).toThrow('Unsupported provider: unsupported');
    });
  });

  describe('caching', () => {
    it('should return the same instance for identical config', () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-api-key',
        defaultModel: 'claude-3-5-sonnet-20241022',
      };

      const provider1 = LLMProviderFactory.create(config);
      const provider2 = LLMProviderFactory.create(config);

      expect(provider1).toBe(provider2);
    });

    it('should return different instances for different apiKeys', () => {
      const config1: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'AAAAA-test-key-1',  // Different first 5 chars
        defaultModel: 'claude-3-5-sonnet-20241022',
      };

      const config2: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'BBBBB-test-key-2',  // Different first 5 chars
        defaultModel: 'claude-3-5-sonnet-20241022',
      };

      const provider1 = LLMProviderFactory.create(config1);
      const provider2 = LLMProviderFactory.create(config2);

      expect(provider1).not.toBe(provider2);
    });

    it('should return different instances for different baseURLs', () => {
      const config1: LLMProviderConfig = {
        provider: 'openai-compatible',
        apiKey: 'test-api-key',
        baseURL: 'https://api1.example.com',
      };

      const config2: LLMProviderConfig = {
        provider: 'openai-compatible',
        apiKey: 'test-api-key',
        baseURL: 'https://api2.example.com',
      };

      const provider1 = LLMProviderFactory.create(config1);
      const provider2 = LLMProviderFactory.create(config2);

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('getGlobalProvider()', () => {
    it('should create provider from environment variables', () => {
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';
      process.env.LLM_PROVIDER = 'anthropic';
      process.env.LLM_MODEL = 'claude-3-opus-20240229';

      const provider = LLMProviderFactory.getGlobalProvider();

      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.name).toBe('anthropic');
    });

    it('should return cached instance on subsequent calls', () => {
      process.env.ANTHROPIC_API_KEY = 'env-anthropic-key';
      process.env.LLM_PROVIDER = 'anthropic';

      const provider1 = LLMProviderFactory.getGlobalProvider();
      const provider2 = LLMProviderFactory.getGlobalProvider();

      expect(provider1).toBe(provider2);
    });
  });

  describe('clearCache()', () => {
    it('should clear all cached providers', () => {
      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-api-key',
      };

      const provider1 = LLMProviderFactory.create(config);

      LLMProviderFactory.clearCache();

      const provider2 = LLMProviderFactory.create(config);

      expect(provider1).not.toBe(provider2);
    });

    it('should allow creating new providers after clearing', () => {
      LLMProviderFactory.clearCache();

      const config: LLMProviderConfig = {
        provider: 'anthropic',
        apiKey: 'test-api-key',
      };

      const provider = LLMProviderFactory.create(config);

      expect(provider).toBeInstanceOf(AnthropicProvider);
    });
  });

  describe('getProvider()', () => {
    it('should get provider by name from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'anthropic-env-key';
      process.env.OPENAI_API_KEY = 'openai-env-key';

      const anthropicProvider = LLMProviderFactory.getProvider('anthropic');
      const openaiProvider = LLMProviderFactory.getProvider('openai');

      expect(anthropicProvider).toBeInstanceOf(AnthropicProvider);
      expect(openaiProvider).toBeInstanceOf(OpenAIProvider);
    });

    it('should throw error if provider is not configured', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.LLM_PROVIDER;

      expect(() => LLMProviderFactory.getProvider('anthropic')).toThrow();
    });
  });
});
