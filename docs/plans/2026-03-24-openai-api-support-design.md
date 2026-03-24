# OpenAI API 支持设计文档

**日期**: 2026-03-24
**版本**: 1.0
**状态**: 待实施

---

## 1. 概述

### 目标
为 ANDOS 平台增加对 OpenAI API 的支持，同时保持与 Anthropic Claude API 的兼容，并支持任何 OpenAI 兼容的 API 端点（包括本地模型如 Ollama、llama.cpp 等）。

### 关键决策
- **Provider 模式**: 统一的 LLMProvider 接口 + 工厂模式
- **配置级别**: 全局配置（所有 Agent 使用同一 Provider）
- **工具格式**: 统一抽象层，在 Provider 层自动转换格式

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentExecutionEngine                      │
│                     (业务逻辑层，无变化)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ uses
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                      LLMProvider                             │
│                   (统一接口抽象层)                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  interface LLMProvider {                             │   │
│  │    generate(request: LLMRequest): Promise<LLMResponse>│   │
│  │    stream(request: LLMRequest): AsyncGenerator<...>   │   │
│  │  }                                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │ implements
          ┌───────────┼───────────┐
          ▼           ▼           ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Anthropic      │ │ OpenAI         │ │ OpenAICompat   │
│ Provider       │ │ Provider       │ │ Provider       │
│                │ │                │ │ (通用兼容层)     │
│ @anthropic-ai/ │ │ openai         │ │ openai SDK +   │
│ sdk            │ │ SDK            │ │ custom baseURL │
└────────────────┘ └────────────────┘ └────────────────┘
```

### 2.2 核心组件

#### 2.2.1 LLMProvider 接口

```typescript
// src/llm/types.ts

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  tools?: LLMTool[];
  system?: string; // System prompt
}

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

export interface LLMStreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  content?: string;
  toolCall?: LLMToolCall;
  error?: string;
}

export interface LLMProvider {
  readonly name: string;
  generate(request: LLMRequest): Promise<LLMResponse>;
  stream?(request: LLMRequest): AsyncGenerator<LLMStreamEvent>;
}
```

#### 2.2.2 Provider 工厂

```typescript
// src/llm/LLMProviderFactory.ts

export interface LLMProviderConfig {
  provider: 'anthropic' | 'openai' | 'openai-compatible';
  apiKey: string;
  baseURL?: string; // 用于兼容模式
  defaultModel?: string;
  timeout?: number;
}

export class LLMProviderFactory {
  private static providers: Map<string, LLMProvider> = new Map();

  static create(config: LLMProviderConfig): LLMProvider {
    const cacheKey = `${config.provider}-${config.baseURL || 'default'}`;

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
        throw new Error(`Unknown provider: ${config.provider}`);
    }

    this.providers.set(cacheKey, provider);
    return provider;
  }

  static getGlobalProvider(): LLMProvider {
    const config = getGlobalLLMConfig(); // 从环境变量或配置读取
    return this.create(config);
  }
}
```

#### 2.2.3 Anthropic Provider 实现

```typescript
// src/llm/providers/AnthropicProvider.ts

import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(config: LLMProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
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
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
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
  }

  // 转换方法...
  private convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] { ... }
  private convertTool(tool: LLMTool): Anthropic.Tool { ... }
  private extractContent(response: Anthropic.Message): string { ... }
  private extractToolCalls(response: Anthropic.Message): LLMToolCall[] { ... }
}
```

#### 2.2.4 OpenAI Provider 实现

```typescript
// src/llm/providers/OpenAIProvider.ts

import OpenAI from 'openai';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  protected client: OpenAI;

  constructor(config: LLMProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL, // OpenAI SDK 支持自定义 baseURL
    });
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      messages: this.convertMessages(request),
      tools: request.tools?.map(this.convertTool),
      tool_choice: request.tools ? 'auto' : undefined,
    });

    const choice = response.choices[0];

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
  }

  async *stream(request: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      messages: this.convertMessages(request),
      tools: request.tools?.map(this.convertTool),
      stream: true,
    });

    for await (const chunk of stream) {
      yield this.convertStreamChunk(chunk);
    }
  }

  // 转换方法（Anthropic ↔ OpenAI 格式转换）...
  protected convertMessages(request: LLMRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    // 处理 system prompt 和消息转换
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
}
```

#### 2.2.5 OpenAI 兼容 Provider

```typescript
// src/llm/providers/OpenAICompatibleProvider.ts

export class OpenAICompatibleProvider extends OpenAIProvider {
  readonly name = 'openai-compatible';

  constructor(config: LLMProviderConfig) {
    super(config);
    // 可以添加兼容性处理，例如版本检测
  }

  // 继承 OpenAIProvider 的所有方法
  // 可以覆盖特定方法来处理兼容性差异
}
```

---

## 3. AgentExecutionEngine 改造

### 3.1 当前代码修改

```typescript
// src/services/AgentExecutionEngine.ts

// 移除直接依赖
// import Anthropic from '@anthropic-ai/sdk';
// const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 改为使用 LLMProvider
import { LLMProviderFactory } from '../llm/LLMProviderFactory';
import type { LLMRequest, LLMTool, LLMMessage } from '../llm/types';

export class AgentExecutionEngine {
  private llmProvider = LLMProviderFactory.getGlobalProvider();
  private toolRegistry: Map<string, ToolDefinition> = new Map();

  async execute(
    executionId: string,
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      tools?: string[];
    }
  ): Promise<...> {
    // ... 获取 execution, agent, skills ...

    // 构建 LLM 请求
    const request: LLMRequest = {
      model: agent.config?.model || 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? agent.config?.temperature ?? 0.7,
      system: this.buildSystemPrompt(agent, skills),
      tools: this.getAvailableTools(agent.config?.permissions, options?.tools)
        .map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        })),
    };

    try {
      // 使用 LLMProvider 而非直接调用 Anthropic
      const response = await this.llmProvider.generate(request);

      // 处理响应
      const result = await this.processLLMResponse(response, context);

      return {
        status: 'success',
        outputs: result.outputs,
        reasoning: result.reasoning,
        tokenUsed: response.usage.outputTokens,
      };
    } catch (error) {
      return { status: 'failed', tokenUsed: 0 };
    }
  }

  // 类似修改 streamExecute 方法
}
```

---

## 4. 配置管理

### 4.1 环境变量配置

```bash
# Provider 选择
LLM_PROVIDER=anthropic  # 或: openai, openai-compatible

# Anthropic 配置
ANTHROPIC_API_KEY=sk-ant-xxxxx

# OpenAI 配置
OPENAI_API_KEY=sk-xxxxx
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，用于兼容端点

# OpenAI 兼容模式（本地模型等）
# OPENAI_BASE_URL=http://localhost:11434/v1  # Ollama
# OPENAI_BASE_URL=http://localhost:8080/v1   # llama.cpp

# 默认模型
LLM_DEFAULT_MODEL=gpt-4  # 或 claude-3-5-sonnet-20241022

# 超时设置
LLM_TIMEOUT=30000
```

### 4.2 配置读取函数

```typescript
// src/llm/config.ts

export function getGlobalLLMConfig(): LLMProviderConfig {
  const provider = (process.env.LLM_PROVIDER as LLMProviderConfig['provider']) || 'anthropic';

  switch (provider) {
    case 'anthropic':
      return {
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY!,
        defaultModel: process.env.LLM_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
        timeout: parseInt(process.env.LLM_TIMEOUT || '30000'),
      };
    case 'openai':
    case 'openai-compatible':
      return {
        provider,
        apiKey: process.env.OPENAI_API_KEY!,
        baseURL: process.env.OPENAI_BASE_URL,
        defaultModel: process.env.LLM_DEFAULT_MODEL || 'gpt-4',
        timeout: parseInt(process.env.LLM_TIMEOUT || '30000'),
      };
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
```

---

## 5. 工具格式转换

### 5.1 格式对比

| 特性 | Anthropic | OpenAI |
|------|-----------|--------|
| 工具定义 | `name, description, input_schema` | `type: "function", function: {name, description, parameters}` |
| 工具调用 | `type: "tool_use", name, input` | `tool_calls: [{id, type, function: {name, arguments}}]` |
| 流式响应 | `content_block_delta`, `content_block_start` | 标准的 SSE 流 |

### 5.2 转换实现

已在各 Provider 的 `convertTool`, `convertToolCall` 方法中实现，详见第 2.2.3 和 2.2.4 节。

---

## 6. 错误处理

### 6.1 Provider 错误映射

```typescript
// src/llm/errors.ts

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

// Provider 内部错误转换
// AnthropicProvider: 捕获 Anthropic.APIError，映射到 LLMError
// OpenAIProvider: 捕获 OpenAI.APIError，映射到 LLMError
```

---

## 7. 目录结构

```
src/
├── llm/
│   ├── index.ts              # 统一导出
│   ├── types.ts              # LLM 类型定义
│   ├── config.ts             # 配置读取
│   ├── errors.ts             # 错误类型
│   ├── LLMProviderFactory.ts # Provider 工厂
│   └── providers/
│       ├── index.ts
│       ├── AnthropicProvider.ts
│       ├── OpenAIProvider.ts
│       └── OpenAICompatibleProvider.ts
├── services/
│   └── AgentExecutionEngine.ts  # 修改以使用 LLMProvider
```

---

## 8. 测试策略

### 8.1 Provider 单元测试

- Mock 各 SDK 的响应
- 测试格式转换逻辑
- 测试错误处理

### 8.2 集成测试

- 使用真实 API key 测试（可选，CI 中跳过）
- 测试流式响应

### 8.3 AgentExecutionEngine 测试

- 验证使用 LLMProvider 后的行为一致性
- 测试工具调用流程

---

## 9. 实施步骤

详见配套实施计划文档：
`docs/plans/2026-03-24-openai-api-support-implementation.md`

---

## 10. 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 工具格式转换 Bug | 中 | 高 | 全面测试转换逻辑，添加集成测试 |
| OpenAI 流式 API 差异 | 中 | 中 | 参考官方文档，测试多种场景 |
| 配置迁移问题 | 低 | 中 | 保持向后兼容，添加默认值 |
| 性能下降 | 低 | 低 | 保持 Provider 实例缓存 |

---

## 附录

### A. 依赖安装

```bash
npm install openai
```

### B. 向后兼容

- 默认 Provider 仍为 `anthropic`
- 现有 `ANTHROPIC_API_KEY` 配置无需修改
- Agent 配置中的 `model` 字段保持现有格式
