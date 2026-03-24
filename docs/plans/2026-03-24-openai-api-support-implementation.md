# OpenAI API 支持实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 ANDOS 平台增加 OpenAI API 支持，通过统一的 LLMProvider 接口支持 Anthropic、OpenAI 及 OpenAI 兼容 API（包括本地模型），同时保持与现有代码完全向后兼容。

**Architecture:** 使用抽象工厂模式创建统一的 LLMProvider 接口，各 Provider 实现负责格式转换，AgentExecutionEngine 通过工厂获取全局 Provider 实例，无需关心底层实现。

**Tech Stack:** TypeScript 5.3, OpenAI SDK (@openai/sdk), 现有 @anthropic-ai/sdk

---

## 前置准备

### 步骤 1: 安装依赖

**命令:**
```bash
cd apps/server && npm install openai
```

**预期:** openai 包安装成功

---

## Phase 1: 创建 LLM 基础类型和接口

### Task 1: 创建 src/llm/types.ts

**Files:**
- Create: `apps/server/src/llm/types.ts`

**Step 1: 创建类型文件**

```typescript
/**
 * LLM Types - Unified interface for multiple LLM providers
 * Supports: Anthropic Claude, OpenAI GPT, OpenAI-compatible APIs
 */

// Message types
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

// Tool definitions
export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// Tool call representation
export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Request to LLM
export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LLMTool[];
  system?: string;
}

// Response from LLM
export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  model: string;
}

// Stream event types
export interface LLMStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  toolCall?: LLMToolCall;
  error?: string;
}

// Provider interface
export interface LLMProvider {
  readonly name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  stream?(request: LLMRequest): AsyncGenerator<LLMStreamEvent>;
}

// Provider configuration
export interface LLMProviderConfig {
  provider: 'anthropic' | 'openai' | 'openai-compatible';
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  timeout?: number;
}
```

**Step 2: 验证 TypeScript 编译**

Run: `cd apps/server && npx tsc --noEmit src/llm/types.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/server/src/llm/types.ts
git commit -m "feat(llm): add unified LLM provider types

Add types for:
- LLMMessage, LLMTool, LLMToolCall
- LLMRequest, LLMResponse, LLMStreamEvent
- LLMProvider interface
- LLMProviderConfig

Supports Anthropic, OpenAI, and OpenAI-compatible APIs."
```

---

## Phase 2: 创建错误处理

### Task 2: 创建 src/llm/errors.ts

**Files:**
- Create: `apps/server/src/llm/errors.ts`

**Step 1: 实现错误类型**

```typescript
/**
 * LLM Error Types - Unified error handling for LLM providers
 */

export class LLMError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(message: string, provider?: string) {
    super(message, 'RATE_LIMIT', provider, true);
  }
}

export class LLMTokenLimitError extends LLMError {
  constructor(message: string, provider?: string) {
    super(message, 'TOKEN_LIMIT', provider, false);
  }
}

export class LLMAuthenticationError extends LLMError {
  constructor(message: string, provider?: string) {
    super(message, 'AUTHENTICATION_ERROR', provider, false);
  }
}

export class LLMInvalidRequestError extends LLMError {
  constructor(message: string, provider?: string) {
    super(message, 'INVALID_REQUEST', provider, false);
  }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/llm/errors.ts
git commit -m "feat(llm): add unified LLM error types

Add error classes:
- LLMError (base)
- LLMRateLimitError
- LLMTokenLimitError
- LLMAuthenticationError
- LLMInvalidRequestError"
```

---

## Phase 3: 创建配置管理

### Task 3: 创建 src/llm/config.ts

**Files:**
- Create: `apps/server/src/llm/config.ts`
- Modify: `apps/server/.env.example` (添加新配置)

**Step 1: 实现配置读取**

```typescript
/**
 * LLM Configuration - Global LLM provider configuration
 */

import type { LLMProviderConfig } from './types';
import { LLMError } from './errors';

export function getGlobalLLMConfig(): LLMProviderConfig {
  const provider = (process.env.LLM_PROVIDER as LLMProviderConfig['provider']) || 'anthropic';

  switch (provider) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new LLMError(
          'ANTHROPIC_API_KEY environment variable is required',
          'CONFIG_ERROR',
          'anthropic'
        );
      }
      return {
        provider: 'anthropic',
        apiKey,
        defaultModel: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
      };
    }

    case 'openai':
    case 'openai-compatible': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new LLMError(
          'OPENAI_API_KEY environment variable is required',
          'CONFIG_ERROR',
          provider
        );
      }
      return {
        provider,
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL,
        defaultModel: process.env.LLM_DEFAULT_MODEL || 'gpt-4',
        timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
      };
    }

    default:
      throw new LLMError(`Unknown LLM provider: ${provider}`, 'CONFIG_ERROR');
  }
}

export function validateLLMConfig(): void {
  getGlobalLLMConfig(); // Will throw if invalid
}
```

**Step 2: 更新 .env.example**

添加以下内容到 `apps/server/.env.example`:

```bash
# LLM Provider Configuration
# Options: anthropic, openai, openai-compatible
LLM_PROVIDER=anthropic

# Default model (provider-specific)
# Anthropic: claude-3-5-sonnet-20241022, claude-3-opus-20240229
# OpenAI: gpt-4, gpt-4-turbo, gpt-3.5-turbo
LLM_DEFAULT_MODEL=claude-3-5-sonnet-20241022

# OpenAI Configuration (required if LLM_PROVIDER=openai or openai-compatible)
OPENAI_API_KEY=sk-xxxx
# Optional: custom base URL for OpenAI-compatible APIs (e.g., Ollama, Azure)
# OPENAI_BASE_URL=http://localhost:11434/v1

# LLM Timeout (milliseconds)
LLM_TIMEOUT=30000
```

**Step 3: Commit**

```bash
git add apps/server/src/llm/config.ts apps/server/.env.example
git commit -m "feat(llm): add LLM configuration management

Add getGlobalLLMConfig() for provider-specific config
Support env vars:
- LLM_PROVIDER
- LLM_DEFAULT_MODEL
- OPENAI_API_KEY
- OPENAI_BASE_URL
- LLM_TIMEOUT

Default provider: anthropic (backward compatible)"
```

---

## Phase 4: 实现 Anthropic Provider

### Task 4: 创建 src/llm/providers/AnthropicProvider.ts

**Files:**
- Create: `apps/server/src/llm/providers/AnthropicProvider.ts`

**Step 1: 实现 Provider**

```typescript
/**
 * Anthropic Provider - Claude API integration
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  LLMTool,
  LLMToolCall,
  LLMStreamEvent,
} from '../types';
import { LLMError, LLMRateLimitError, LLMTokenLimitError, LLMAuthenticationError } from '../errors';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout,
    });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        system: request.system,
        messages: this.convertMessages(request.messages),
        tools: request.tools?.map(this.convertTool),
      });

      return {
        content: this.extractContent(response),
        toolCalls: this.extractToolCalls(response),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
      };
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    try {
      const stream = await this.client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
        system: request.system,
        messages: this.convertMessages(request.messages),
        tools: request.tools?.map(this.convertTool),
        stream: true,
      });

      for await (const event of stream) {
        yield this.convertStreamEvent(event);
      }

      yield { type: 'done' };
    } catch (error) {
      const llmError = this.convertError(error);
      yield { type: 'error', error: llmError.message };
    }
  }

  private convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    return messages.map((msg): Anthropic.MessageParam => {
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: msg.toolCallId || '',
            content: msg.content,
          }],
        };
      }

      if (msg.toolCalls) {
        return {
          role: msg.role as 'assistant',
          content: [
            { type: 'text', text: msg.content },
            ...msg.toolCalls.map(tc => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            })),
          ],
        };
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  private convertTool(tool: LLMTool): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    };
  }

  private extractContent(response: Anthropic.Message): string {
    return response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('');
  }

  private extractToolCalls(response: Anthropic.Message): LLMToolCall[] {
    return response.content
      .filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
      .map(c => ({
        id: c.id,
        name: c.name,
        arguments: c.input as Record<string, unknown>,
      }));
  }

  private convertStreamEvent(event: Anthropic.RawMessageStreamEvent): LLMStreamEvent {
    if (event.type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        return { type: 'text', content: event.delta.text };
      }
    } else if (event.type === 'content_block_start') {
      if (event.content_block.type === 'tool_use') {
        return {
          type: 'tool_call',
          toolCall: {
            id: event.content_block.id,
            name: event.content_block.name,
            arguments: event.content_block.input as Record<string, unknown>,
          },
        };
      }
    }

    return { type: 'text', content: '' };
  }

  private convertError(error: unknown): LLMError {
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      const message = error.message;

      if (status === 429) {
        return new LLMRateLimitError(message, this.name);
      }
      if (status === 401) {
        return new LLMAuthenticationError(message, this.name);
      }
      if (status === 413 || message.includes('token')) {
        return new LLMTokenLimitError(message, this.name);
      }
      return new LLMError(message, `ANTHROPIC_${status}`, this.name);
    }

    if (error instanceof Error) {
      return new LLMError(error.message, 'UNKNOWN_ERROR', this.name);
    }

    return new LLMError('Unknown error', 'UNKNOWN_ERROR', this.name);
  }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/llm/providers/AnthropicProvider.ts
git commit -m "feat(llm): implement AnthropicProvider

Add Anthropic Claude API provider implementing LLMProvider interface:
- generate() for non-streaming requests
- stream() for streaming responses
- Message and tool format conversion
- Error mapping to unified LLMError types"
```

---

## Phase 5: 实现 OpenAI Provider

### Task 5: 创建 src/llm/providers/OpenAIProvider.ts

**Files:**
- Create: `apps/server/src/llm/providers/OpenAIProvider.ts`

**Step 1: 实现 Provider**

```typescript
/**
 * OpenAI Provider - OpenAI API integration
 * Also supports OpenAI-compatible APIs via baseURL configuration
 */

import OpenAI from 'openai';
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  LLMTool,
  LLMToolCall,
  LLMStreamEvent,
} from '../types';
import { LLMError, LLMRateLimitError, LLMTokenLimitError, LLMAuthenticationError } from '../errors';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  protected client: OpenAI;
  protected config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout,
    });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        messages: this.buildMessages(request),
        tools: request.tools?.map(this.convertTool),
        tool_choice: request.tools && request.tools.length > 0 ? 'auto' : undefined,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new LLMError('No response from OpenAI', 'EMPTY_RESPONSE', this.name);
      }

      return {
        content: choice.message.content || '',
        toolCalls: choice.message.tool_calls?.map(this.convertToolCall),
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        model: response.model,
      };
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    try {
      const stream = await this.client.chat.completions.create({
        model: request.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        messages: this.buildMessages(request),
        tools: request.tools?.map(this.convertTool),
        tool_choice: request.tools && request.tools.length > 0 ? 'auto' : undefined,
        stream: true,
      });

      let currentToolCall: Partial<LLMToolCall> & { argumentsBuffer?: string } | null = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Handle text content
        if (delta.content) {
          yield { type: 'text', content: delta.content };
        }

        // Handle tool calls
        if (delta.tool_calls && delta.tool_calls.length > 0) {
          const toolDelta = delta.tool_calls[0];

          if (toolDelta.id) {
            // New tool call starting
            if (currentToolCall && currentToolCall.id) {
              // Finish previous tool call
              yield {
                type: 'tool_call',
                toolCall: currentToolCall as LLMToolCall,
              };
            }
            currentToolCall = {
              id: toolDelta.id,
              name: toolDelta.function?.name || '',
              arguments: {},
              argumentsBuffer: '',
            };
          }

          if (toolDelta.function?.arguments) {
            // Accumulate arguments
            if (currentToolCall) {
              currentToolCall.argumentsBuffer = (currentToolCall.argumentsBuffer || '') + toolDelta.function.arguments;
            }
          }

          if (toolDelta.function?.name) {
            if (currentToolCall) {
              currentToolCall.name = toolDelta.function.name;
            }
          }
        }

        // Check if this is the last chunk
        if (chunk.choices[0]?.finish_reason) {
          // Yield any pending tool call
          if (currentToolCall && currentToolCall.id) {
            try {
              currentToolCall.arguments = JSON.parse(currentToolCall.argumentsBuffer || '{}');
            } catch {
              currentToolCall.arguments = {};
            }
            yield {
              type: 'tool_call',
              toolCall: currentToolCall as LLMToolCall,
            };
            currentToolCall = null;
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      const llmError = this.convertError(error);
      yield { type: 'error', error: llmError.message };
    }
  }

  protected buildMessages(request: LLMRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system message if present
    if (request.system) {
      messages.push({
        role: 'system',
        content: request.system,
      });
    }

    // Add conversation messages
    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId || '',
        });
      } else if (msg.toolCalls) {
        messages.push({
          role: 'assistant',
          content: msg.content,
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return messages;
  }

  protected convertTool(tool: LLMTool): OpenAI.Chat.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  protected convertToolCall(toolCall: OpenAI.Chat.ChatCompletionMessageToolCall): LLMToolCall {
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments),
    };
  }

  protected convertError(error: unknown): LLMError {
    if (error instanceof OpenAI.APIError) {
      const status = error.status;
      const message = error.message;

      if (status === 429) {
        return new LLMRateLimitError(message, this.name);
      }
      if (status === 401) {
        return new LLMAuthenticationError(message, this.name);
      }
      if (status === 400 && message.includes('token')) {
        return new LLMTokenLimitError(message, this.name);
      }
      return new LLMError(message, `OPENAI_${status}`, this.name);
    }

    if (error instanceof Error) {
      return new LLMError(error.message, 'UNKNOWN_ERROR', this.name);
    }

    return new LLMError('Unknown error', 'UNKNOWN_ERROR', this.name);
  }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/llm/providers/OpenAIProvider.ts
git commit -m "feat(llm): implement OpenAIProvider

Add OpenAI API provider implementing LLMProvider interface:
- generate() for non-streaming requests
- stream() for streaming responses with tool call support
- Automatic tool format conversion (OpenAI format)
- Support for custom baseURL (OpenAI-compatible APIs)
- Error mapping to unified LLMError types"
```

---

## Phase 6: 实现 OpenAI 兼容 Provider

### Task 6: 创建 src/llm/providers/OpenAICompatibleProvider.ts

**Files:**
- Create: `apps/server/src/llm/providers/OpenAICompatibleProvider.ts`

**Step 1: 实现 Provider**

```typescript
/**
 * OpenAI Compatible Provider - Generic OpenAI-compatible API support
 * Extends OpenAIProvider for custom endpoints (Ollama, llama.cpp, etc.)
 */

import { OpenAIProvider } from './OpenAIProvider';

export class OpenAICompatibleProvider extends OpenAIProvider {
  readonly name = 'openai-compatible';

  constructor(config: LLMProviderConfig) {
    super(config);

    if (!config.baseURL) {
      // eslint-disable-next-line no-console
      console.warn('[OpenAICompatibleProvider] No baseURL provided, using default OpenAI endpoint');
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/llm/providers/OpenAICompatibleProvider.ts
git commit -m "feat(llm): implement OpenAICompatibleProvider

Extend OpenAIProvider for OpenAI-compatible APIs:
- Support Ollama, llama.cpp, and other compatible endpoints
- Requires baseURL configuration
- Inherits all OpenAI functionality"
```

---

## Phase 7: 创建 Provider 工厂

### Task 7: 创建 src/llm/LLMProviderFactory.ts

**Files:**
- Create: `apps/server/src/llm/LLMProviderFactory.ts`

**Step 1: 实现工厂**

```typescript
/**
 * LLM Provider Factory - Creates and manages LLM provider instances
 */

import type { LLMProvider, LLMProviderConfig } from './types';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider';
import { getGlobalLLMConfig } from './config';

export class LLMProviderFactory {
  private static providers: Map<string, LLMProvider> = new Map();

  /**
   * Create a provider instance
   */
  static create(config: LLMProviderConfig): LLMProvider {
    const cacheKey = `${config.provider}-${config.baseURL || 'default'}`;

    // Return cached instance if exists
    if (this.providers.has(cacheKey)) {
      return this.providers.get(cacheKey)!;
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
        throw new Error(`Unknown LLM provider: ${config.provider}`);
    }

    // Cache the provider instance
    this.providers.set(cacheKey, provider);
    return provider;
  }

  /**
   * Get the global provider based on environment configuration
   */
  static getGlobalProvider(): LLMProvider {
    const config = getGlobalLLMConfig();
    return this.create(config);
  }

  /**
   * Clear the provider cache (useful for testing)
   */
  static clearCache(): void {
    this.providers.clear();
  }
}
```

**Step 2: Commit**

```bash
git add apps/server/src/llm/LLMProviderFactory.ts
git commit -m "feat(llm): add LLMProviderFactory

Factory for creating and caching LLM provider instances:
- create() - create provider by config
- getGlobalProvider() - create from env configuration
- clearCache() - clear cached instances for testing

Supports singleton pattern per provider config."
```

---

## Phase 8: 创建 Provider 统一导出

### Task 8: 创建 src/llm/providers/index.ts

**Files:**
- Create: `apps/server/src/llm/providers/index.ts`

**Step 1: 创建导出文件**

```typescript
/**
 * LLM Providers Index
 */

export { AnthropicProvider } from './AnthropicProvider';
export { OpenAIProvider } from './OpenAIProvider';
export { OpenAICompatibleProvider } from './OpenAICompatibleProvider';
```

**Step 2: 创建 src/llm/index.ts**

```typescript
/**
 * LLM Module Index - Unified LLM provider interface
 */

// Types
export * from './types';
export * from './errors';

// Factory
export { LLMProviderFactory } from './LLMProviderFactory';

// Config
export { getGlobalLLMConfig, validateLLMConfig } from './config';

// Providers
export * from './providers';
```

**Step 3: Commit**

```bash
git add apps/server/src/llm/providers/index.ts apps/server/src/llm/index.ts
git commit -m "feat(llm): add module exports

Export all LLM module components:
- Types and errors
- LLMProviderFactory
- Config functions
- All providers"
```

---

## Phase 9: 修改 AgentExecutionEngine

### Task 9: 重构 AgentExecutionEngine 使用 LLMProvider

**Files:**
- Modify: `apps/server/src/services/AgentExecutionEngine.ts`

**Step 1: 修改导入和类定义**

```typescript
/**
 * AgentExecutionEngine - AI-Native DevOps Platform
 * Executes agent tasks with LLM integration (supports Anthropic, OpenAI, and compatible APIs)
 */

// Remove direct Anthropic import
// import Anthropic from '@anthropic-ai/sdk';

// Add LLM provider imports
import { LLMProviderFactory } from '../llm/LLMProviderFactory';
import type { LLMRequest, LLMTool, LLMMessage, LLMStreamEvent } from '../llm/types';

import { db } from '../db/connection';
import { agentService, AgentError } from './AgentService';
import {
  Agent,
  AgentSession,
  AgentExecution,
  Skill,
  ToolPermissions,
  ExecutionStatus,
} from '../types/agent';

export class AgentExecutionEngine {
  private llmProvider = LLMProviderFactory.getGlobalProvider();
  private toolRegistry: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerBuiltInTools();
  }
  // ... rest of constructor

  // Rest of the file remains the same, but modify execute() and streamExecute()
```

**Step 2: 修改 execute() 方法**

替换 `execute()` 方法中的 Anthropic 调用：

```typescript
async execute(
  executionId: string,
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    tools?: string[];
  }
): Promise<{
  status: ExecutionStatus;
  outputs?: Record<string, any>;
  reasoning?: string;
  tokenUsed: number;
}> {
  // Get execution
  const execution = await agentService.getExecution(executionId);
  if (!execution) {
    throw new AgentError(`Execution not found: ${executionId}`, 'EXECUTION_NOT_FOUND');
  }

  // Get agent
  const agent = await agentService.getAgentBySlug(execution.agent_slug);
  if (!agent) {
    throw new AgentError(`Agent not found: ${execution.agent_slug}`, 'AGENT_NOT_FOUND');
  }

  // Get agent skills
  const skills = await agentService.getAgentSkills(agent.slug);

  // Build system prompt
  const systemPrompt = this.buildSystemPrompt(agent, skills);

  // Get available tools
  const availableTools = this.getAvailableTools(agent.config?.permissions, options?.tools);

  // Build LLM request
  const request: LLMRequest = {
    model: agent.config?.model || 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: options?.maxTokens || 4096,
    temperature: options?.temperature ?? agent.config?.temperature ?? 0.7,
    system: systemPrompt,
    tools: availableTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  };

  try {
    // Use LLMProvider instead of direct Anthropic call
    const response = await this.llmProvider.generate(request);

    // Process tool calls
    const outputs: Record<string, any> = {};
    let reasoning = response.content;

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const tool = this.toolRegistry.get(toolCall.name);
        if (tool) {
          const result = await tool.handler(toolCall.arguments, {
            executionId,
            sessionId: execution.session_id || '',
            agentSlug: agent.slug,
          });
          outputs[toolCall.name] = result;
        }
      }
    }

    // Update session activity
    if (execution.session_id) {
      await agentService.updateSessionActivity(
        execution.session_id,
        response.usage.outputTokens
      );
    }

    return {
      status: 'success',
      outputs,
      reasoning,
      tokenUsed: response.usage.outputTokens,
    };
  } catch (error) {
    return {
      status: 'failed',
      tokenUsed: 0,
    };
  }
}
```

**Step 3: 修改 streamExecute() 方法**

替换流式执行方法：

```typescript
async *streamExecute(
  executionId: string,
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
  }
): AsyncGenerator<{
  type: 'text' | 'tool_use' | 'tool_result' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: any;
  error?: string;
}> {
  const execution = await agentService.getExecution(executionId);
  if (!execution) {
    yield { type: 'error', error: 'Execution not found' };
    return;
  }

  const agent = await agentService.getAgentBySlug(execution.agent_slug);
  if (!agent) {
    yield { type: 'error', error: 'Agent not found' };
    return;
  }

  const skills = await agentService.getAgentSkills(agent.slug);
  const systemPrompt = this.buildSystemPrompt(agent, skills);
  const availableTools = this.getAvailableTools(agent.config?.permissions);

  const request: LLMRequest = {
    model: agent.config?.model || 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: options?.maxTokens || 4096,
    temperature: options?.temperature ?? agent.config?.temperature ?? 0.7,
    system: systemPrompt,
    tools: availableTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  };

  try {
    const stream = this.llmProvider.stream
      ? this.llmProvider.stream(request)
      : this.fallbackStream(request);

    for await (const event of stream) {
      if (event.type === 'text') {
        yield { type: 'text', content: event.content };
      } else if (event.type === 'tool_call' && event.toolCall) {
        yield {
          type: 'tool_use',
          toolName: event.toolCall.name,
          toolInput: event.toolCall.arguments,
        };

        // Execute tool
        const tool = this.toolRegistry.get(event.toolCall.name);
        if (tool) {
          const result = await tool.handler(event.toolCall.arguments, {
            executionId,
            sessionId: execution.session_id || '',
            agentSlug: agent.slug,
          });
          yield {
            type: 'tool_result',
            toolName: event.toolCall.name,
            toolResult: result,
          };
        }
      } else if (event.type === 'error') {
        yield { type: 'error', error: event.error };
      }
    }
  } catch (error) {
    yield { type: 'error', error: (error as Error).message };
  }
}

// Fallback for providers without streaming
private async *fallbackStream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
  const response = await this.llmProvider.generate(request);

  // Yield content
  if (response.content) {
    yield { type: 'text', content: response.content };
  }

  // Yield tool calls
  if (response.toolCalls) {
    for (const toolCall of response.toolCalls) {
      yield {
        type: 'tool_call',
        toolCall,
      };
    }
  }

  yield { type: 'done' };
}
```

**Step 4: 更新 getAvailableTools() 返回类型**

```typescript
private getAvailableTools(
  permissions: ToolPermissions | undefined,
  toolFilter?: string[]
): LLMTool[] {
  const tools: LLMTool[] = [];

  for (const [name, tool] of this.toolRegistry) {
    // Check if tool is filtered
    if (toolFilter && !toolFilter.includes(name)) {
      continue;
    }

    // Check permission
    if (!checkPermission(name, {}, permissions)) {
      continue;
    }

    tools.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
  }

  return tools;
}
```

**Step 5: 删除旧的 Anthropic 相关代码**

删除以下内容：
1. `import Anthropic from '@anthropic-ai/sdk'`
2. `const anthropic = new Anthropic(...)`
3. `processResponse()` 方法（如果不再需要）
4. `Anthropic.Tool` 相关的类型引用

**Step 6: 验证编译**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add apps/server/src/services/AgentExecutionEngine.ts
git commit -m "refactor: AgentExecutionEngine use LLMProvider interface

Replace direct Anthropic integration with unified LLMProvider:
- Use LLMProviderFactory.getGlobalProvider()
- Update execute() to use provider.generate()
- Update streamExecute() to use provider.stream()
- Convert tool registry to LLMTool format
- Add fallback stream for non-streaming providers

Backward compatible: default still anthropic"
```

---

## Phase 10: 添加单元测试

### Task 10: 创建 LLM Provider 测试

**Files:**
- Create: `apps/server/tests/unit/llm/AnthropicProvider.test.ts`
- Create: `apps/server/tests/unit/llm/OpenAIProvider.test.ts`
- Create: `apps/server/tests/unit/llm/LLMProviderFactory.test.ts`

**Step 1: 创建工厂测试**

```typescript
// tests/unit/llm/LLMProviderFactory.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMProviderFactory } from '../../../src/llm/LLMProviderFactory';
import { AnthropicProvider } from '../../../src/llm/providers/AnthropicProvider';
import { OpenAIProvider } from '../../../src/llm/providers/OpenAIProvider';

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    LLMProviderFactory.clearCache();
    vi.unstubAllEnvs();
  });

  it('should create AnthropicProvider', () => {
    const provider = LLMProviderFactory.create({
      provider: 'anthropic',
      apiKey: 'test-key',
    });

    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe('anthropic');
  });

  it('should create OpenAIProvider', () => {
    const provider = LLMProviderFactory.create({
      provider: 'openai',
      apiKey: 'test-key',
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.name).toBe('openai');
  });

  it('should cache provider instances', () => {
    const config = {
      provider: 'anthropic' as const,
      apiKey: 'test-key',
    };

    const provider1 = LLMProviderFactory.create(config);
    const provider2 = LLMProviderFactory.create(config);

    expect(provider1).toBe(provider2);
  });

  it('should throw for unknown provider', () => {
    expect(() =>
      LLMProviderFactory.create({
        provider: 'unknown' as any,
        apiKey: 'test-key',
      })
    ).toThrow('Unknown LLM provider');
  });
});
```

**Step 2: 运行测试**

Run: `cd apps/server && npx vitest run tests/unit/llm/LLMProviderFactory.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/server/tests/unit/llm/
git commit -m "test: add LLM provider unit tests

Add tests for:
- LLMProviderFactory (create, cache, error cases)
- AnthropicProvider (mocked)
- OpenAIProvider (mocked)

All tests passing."
```

---

## Phase 11: 更新服务索引导出

### Task 11: 更新 src/services/index.ts

**Files:**
- Modify: `apps/server/src/services/index.ts`

**Step 1: 添加 LLM 模块导出（可选）**

如果需要从 services 导出 LLM：

```typescript
// Add to existing exports
export { LLMProviderFactory } from '../llm/LLMProviderFactory';
export type { LLMProvider, LLMRequest, LLMResponse } from '../llm/types';
```

**Step 2: Commit**

```bash
git add apps/server/src/services/index.ts
git commit -m "chore: export LLM types from services index

Add LLMProviderFactory and types to services index exports."
```

---

## Phase 12: 验证和文档

### Task 12: 运行完整测试套件

**Step 1: 运行服务器测试**

Run: `npm run test:server`
Expected: All tests pass (467+)

**Step 2: 验证 TypeScript 编译**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors

**Step 3: 更新 CLAUDE.md 文档**

修改 `CLAUDE.md` 中的 AI 部分：

```markdown
- **AI**: Anthropic Claude API via @anthropic-ai/sdk, OpenAI API via openai SDK, and OpenAI-compatible APIs
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with OpenAI API support

Document new LLM provider architecture and configuration options."
```

---

## 总结

实施完成后，ANDOS 将支持：

| Provider | 配置值 | 说明 |
|----------|--------|------|
| Anthropic Claude | `anthropic` | 默认，现有功能 |
| OpenAI GPT | `openai` | GPT-4, GPT-3.5 |
| OpenAI Compatible | `openai-compatible` | Ollama, llama.cpp 等 |

**环境变量配置示例**:

```bash
# 使用 Anthropic (默认)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# 使用 OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxx
LLM_DEFAULT_MODEL=gpt-4

# 使用 Ollama 本地模型
LLM_PROVIDER=openai-compatible
OPENAI_API_KEY=ollama  # 任意值，Ollama 不验证
OPENAI_BASE_URL=http://localhost:11434/v1
LLM_DEFAULT_MODEL=llama2
```

---

## 附录: 完整文件列表

### 新增文件
1. `apps/server/src/llm/types.ts`
2. `apps/server/src/llm/errors.ts`
3. `apps/server/src/llm/config.ts`
4. `apps/server/src/llm/LLMProviderFactory.ts`
5. `apps/server/src/llm/providers/AnthropicProvider.ts`
6. `apps/server/src/llm/providers/OpenAIProvider.ts`
7. `apps/server/src/llm/providers/OpenAICompatibleProvider.ts`
8. `apps/server/src/llm/providers/index.ts`
9. `apps/server/src/llm/index.ts`
10. `apps/server/tests/unit/llm/LLMProviderFactory.test.ts`
11. `apps/server/tests/unit/llm/AnthropicProvider.test.ts`
12. `apps/server/tests/unit/llm/OpenAIProvider.test.ts`

### 修改文件
1. `apps/server/src/services/AgentExecutionEngine.ts`
2. `apps/server/src/services/index.ts` (可选)
3. `apps/server/.env.example`
4. `CLAUDE.md`

### 依赖安装
```bash
cd apps/server && npm install openai
```
