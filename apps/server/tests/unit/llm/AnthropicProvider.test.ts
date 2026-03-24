/**
 * AnthropicProvider Tests
 *
 * Tests for the Anthropic LLM Provider implementation with mocked SDK.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicProvider } from '../../../src/llm/providers/AnthropicProvider';
import type { LLMRequest, LLMProviderConfig } from '../../../src/llm/types';
import {
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMTokenLimitError,
  LLMValidationError,
} from '../../../src/llm/errors';

// Mock the Anthropic SDK
const mockMessagesCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockMessagesCreate,
      };
    },
  };
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  const config: LLMProviderConfig = {
    provider: 'anthropic',
    apiKey: 'test-api-key',
    defaultModel: 'claude-3-5-sonnet-20241022',
    timeout: 30000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicProvider(config);
  });

  describe('generate()', () => {
    it('should generate a response successfully', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Hello, I am Claude!' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
        model: 'claude-3-5-sonnet-20241022',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const request: LLMRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const response = await provider.generate(request);

      expect(response.content).toBe('Hello, I am Claude!');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(5);
      expect(response.usage.totalTokens).toBe(15);
      expect(response.model).toBe('claude-3-5-sonnet-20241022');
    });

    it('should handle tool calls in response', async () => {
      const mockResponse = {
        content: [
          { type: 'text', text: 'I will fetch the asset for you.' },
          {
            type: 'tool_use',
            id: 'tool_123',
            name: 'fetch_asset',
            input: { asset_id: 'asset-456' },
          },
        ],
        usage: {
          input_tokens: 20,
          output_tokens: 15,
        },
        model: 'claude-3-5-sonnet-20241022',
      };

      mockMessagesCreate.mockResolvedValue(mockResponse);

      const request: LLMRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Get asset 456' }],
        tools: [
          {
            name: 'fetch_asset',
            description: 'Fetch an asset',
            parameters: {
              type: 'object',
              properties: { asset_id: { type: 'string' } },
              required: ['asset_id'],
            },
          },
        ],
      };

      const response = await provider.generate(request);

      expect(response.content).toBe('I will fetch the asset for you.');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].id).toBe('tool_123');
      expect(response.toolCalls![0].name).toBe('fetch_asset');
      expect(response.toolCalls![0].arguments).toEqual({ asset_id: 'asset-456' });
    });

    it('should use default model from config if not specified', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        model: 'claude-3-5-sonnet-20241022',
      });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await provider.generate(request);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-5-sonnet-20241022',
        })
      );
    });

    it('should handle system message correctly', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        usage: { input_tokens: 5, output_tokens: 5 },
        model: 'claude-3-5-sonnet-20241022',
      });

      const request: LLMRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
        ],
      };

      await provider.generate(request);

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
    });

    it('should map rate limit error', async () => {
      const error = new Error('Rate limit exceeded') as Error & { status: number; error?: { error?: { type: string; message: string } } };
      error.status = 429;
      error.error = { error: { type: 'rate_limit_error', message: 'Rate limit exceeded' } };

      mockMessagesCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMRateLimitError);
    });

    it('should map authentication error', async () => {
      const error = new Error('Invalid API key') as Error & { status: number; error?: { error?: { type: string; message: string } } };
      error.status = 401;
      error.error = { error: { type: 'authentication_error', message: 'Invalid API key' } };

      mockMessagesCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMAuthenticationError);
    });

    it('should map token limit error', async () => {
      const error = new Error('Token limit exceeded') as Error & { error?: { error?: { type: string; message: string } } };
      error.error = { error: { type: 'invalid_request_error', message: 'Token limit exceeded' } };

      mockMessagesCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMTokenLimitError);
    });

    it('should map validation error', async () => {
      const error = new Error('Invalid request') as Error & { status: number };
      error.status = 400;

      mockMessagesCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMValidationError);
    });
  });

  describe('stream()', () => {
    it('should stream text events', async () => {
      const mockStream = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
      ];

      mockMessagesCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const item of mockStream) {
            yield item;
          }
        },
      });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const events: { type: string; content?: string }[] = [];
      for await (const event of provider.stream!(request)) {
        events.push(event);
      }

      expect(events).toHaveLength(3); // 2 text + 1 done
      expect(events[0]).toEqual({ type: 'text', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'text', content: ' world' });
      expect(events[2]).toEqual({ type: 'done' });
    });

    it('should stream tool call events', async () => {
      const mockStream = [
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_123', name: 'fetch_asset' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"asset_id": "123"}' } },
        { type: 'content_block_stop', index: 0 },
      ];

      mockMessagesCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const item of mockStream) {
            yield item;
          }
        },
      });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Fetch asset' }],
      };

      const events: { type: string; toolCall?: any }[] = [];
      for await (const event of provider.stream!(request)) {
        events.push(event);
      }

      const toolCallEvent = events.find(e => e.type === 'tool_call');
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent!.toolCall!.name).toBe('fetch_asset');
      expect(toolCallEvent!.toolCall!.arguments).toEqual({ asset_id: '123' });
    });

    it('should yield error event on stream failure', async () => {
      const error = new Error('Stream failed') as Error & { status: number };
      error.status = 500;

      mockMessagesCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const events: { type: string; error?: string }[] = [];
      for await (const event of provider.stream!(request)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].error).toContain('Stream failed');
    });
  });

  describe('name property', () => {
    it('should return anthropic as provider name', () => {
      expect(provider.name).toBe('anthropic');
    });
  });
});
