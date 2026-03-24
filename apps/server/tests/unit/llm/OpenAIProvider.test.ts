/**
 * OpenAIProvider Tests
 *
 * Tests for the OpenAI LLM Provider implementation with mocked SDK.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider } from '../../../src/llm/providers/OpenAIProvider';
import type { LLMRequest, LLMProviderConfig } from '../../../src/llm/types';
import {
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMTokenLimitError,
  LLMValidationError,
} from '../../../src/llm/errors';

// Mock the OpenAI SDK
const mockChatCompletionsCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockChatCompletionsCreate,
        },
      };
    },
  };
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  const config: LLMProviderConfig = {
    provider: 'openai',
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-4',
    timeout: 30000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenAIProvider(config);
  });

  describe('generate()', () => {
    it('should generate a response successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello, I am GPT!',
              role: 'assistant',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
        model: 'gpt-4',
      };

      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      const request: LLMRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello!' }],
      };

      const response = await provider.generate(request);

      expect(response.content).toBe('Hello, I am GPT!');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(5);
      expect(response.usage.totalTokens).toBe(15);
      expect(response.model).toBe('gpt-4');
    });

    it('should handle tool calls in response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: null,
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'fetch_asset',
                    arguments: '{"asset_id": "asset-456"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 15,
          total_tokens: 35,
        },
        model: 'gpt-4',
      };

      mockChatCompletionsCreate.mockResolvedValue(mockResponse);

      const request: LLMRequest = {
        model: 'gpt-4',
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

      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].id).toBe('call_123');
      expect(response.toolCalls![0].name).toBe('fetch_asset');
      expect(response.toolCalls![0].arguments).toEqual({ asset_id: 'asset-456' });
    });

    it('should use default model from config if not specified', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response', role: 'assistant' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        model: 'gpt-4',
      });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await provider.generate(request);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
        })
      );
    });

    it('should handle system prompt correctly', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response', role: 'assistant' } }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        model: 'gpt-4',
      });

      const request: LLMRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        system: 'You are a helpful assistant',
      };

      await provider.generate(request);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' },
          ],
        })
      );
    });

    it('should convert tools to OpenAI format', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response', role: 'assistant' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4',
      });

      const request: LLMRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          {
            name: 'fetch_asset',
            description: 'Fetch an asset by ID',
            parameters: {
              type: 'object',
              properties: { asset_id: { type: 'string' } },
              required: ['asset_id'],
            },
          },
        ],
      };

      await provider.generate(request);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              type: 'function',
              function: {
                name: 'fetch_asset',
                description: 'Fetch an asset by ID',
                parameters: {
                  type: 'object',
                  properties: { asset_id: { type: 'string' } },
                  required: ['asset_id'],
                },
              },
            },
          ],
        })
      );
    });

    it('should map rate limit error', async () => {
      const error = new Error('Rate limit exceeded') as Error & { status: number; code?: string };
      error.status = 429;
      error.code = 'rate_limit_exceeded';

      mockChatCompletionsCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMRateLimitError);
    });

    it('should map authentication error', async () => {
      const error = new Error('Invalid API key') as Error & { status: number; code?: string };
      error.status = 401;
      error.code = 'invalid_api_key';

      mockChatCompletionsCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMAuthenticationError);
    });

    it('should map token limit error', async () => {
      const error = new Error('Context length exceeded') as Error & { code?: string };
      error.code = 'context_length_exceeded';

      mockChatCompletionsCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMTokenLimitError);
    });

    it('should map validation error', async () => {
      const error = new Error('Invalid request') as Error & { status: number };
      error.status = 400;

      mockChatCompletionsCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.generate(request)).rejects.toThrow(LLMValidationError);
    });
  });

  describe('stream()', () => {
    it('should stream text events', async () => {
      const mockChunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ];

      mockChatCompletionsCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const events: { type: string; content?: string }[] = [];
      for await (const event of provider.stream(request)) {
        events.push(event);
      }

      expect(events).toHaveLength(3); // 2 text + 1 done
      expect(events[0]).toEqual({ type: 'text', content: 'Hello' });
      expect(events[1]).toEqual({ type: 'text', content: ' world' });
      expect(events[2]).toEqual({ type: 'done' });
    });

    it('should stream tool call events', async () => {
      const mockChunks = [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_123', function: { name: 'fetch_asset' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"asset_id": "123"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ];

      mockChatCompletionsCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      });

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Fetch asset' }],
      };

      const events: { type: string; toolCall?: any }[] = [];
      for await (const event of provider.stream(request)) {
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

      mockChatCompletionsCreate.mockRejectedValue(error);

      const request: LLMRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const events: { type: string; error?: string }[] = [];
      for await (const event of provider.stream(request)) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].error).toContain('Stream failed');
    });
  });

  describe('name property', () => {
    it('should return openai as provider name', () => {
      expect(provider.name).toBe('openai');
    });
  });
});
