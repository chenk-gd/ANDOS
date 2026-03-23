# Memory System 用户指南

本文档介绍如何使用 ANDOS Agent Memory System v1.5 来管理会话记忆、项目记忆和组织级记忆。

---

## 目录

1. [概述](#概述)
2. [记忆层级](#记忆层级)
3. [核心功能](#核心功能)
4. [Web UI 使用指南](#web-ui-使用指南)
5. [MCP 集成](#mcp-集成)
6. [API 使用](#api-使用)
7. [最佳实践](#最佳实践)
8. [故障排查](#故障排查)

---

## 概述

ANDOS Memory System 是一个多层级的记忆管理系统，为 AI Agent 提供持久化记忆能力：

- **Session Memory**: 临时会话上下文和检查点
- **Project Memory**: 项目级共享知识和模式
- **Organization Memory**: 组织级标准和约定

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Memory System v1.5                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Session    │  │   Project    │  │     Org      │      │
│  │   Memory     │  │   Memory     │  │   Memory     │      │
│  │              │  │              │  │              │      │
│  │ • Checkpoints│  │ • Patterns   │  │ • Standards  │      │
│  │ • Context    │  │ • Context    │  │ • Policies   │      │
│  │ • KV Store   │  │ • Decisions  │  │ • Conventions│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └─────────────────┼─────────────────┘               │
│                           ▼                                 │
│              ┌─────────────────────────┐                    │
│              │    Memory Services      │                    │
│              │  (Session/Project/KV)   │                    │
│              └───────────┬─────────────┘                    │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              │      Database         │                      │
│              │  (PostgreSQL + Redis) │                      │
│              └───────────────────────┘                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 记忆层级

### Session Memory（会话记忆）

**用途**: 单个对话会话的临时上下文

**适用场景**:
- 跟踪会话中的工作文件和错误
- 保存会话检查点以便恢复
- 存储临时决策和思路

**数据类型**:
```typescript
interface SessionMemory {
  checkpoints: Checkpoint[];      // 会话检查点
  working_context: {              // 工作上下文
    assets: string[];             // 涉及的资源
    dependencies: string[];       // 依赖关系
    dirty_files: string[];        // 修改中的文件
    recent_errors: ErrorInfo[];   // 最近的错误
  };
  turns: Turn[];                  // 对话历史
}
```

**生命周期**: 会话期间有效，可配置过期时间

### Project Memory（项目记忆）

**用途**: 项目级别的共享知识和模式

**适用场景**:
- 记录代码风格偏好
- 存储 API 使用模式
- 保存常见错误和解决方案
- 记录架构决策

**数据类型**:
```typescript
interface ProjectMemory {
  shared_context: {
    code_style_preferences: CodeStylePreferences;
    api_patterns: APIPattern[];
    common_errors: CommonError[];
    team_conventions: TeamConvention[];
    architecture_decisions: ArchitectureDecision[];
  };
  patterns: LearnedPattern[];     // 学习到的模式
}
```

**生命周期**: 长期存储，随项目存在

### Organization Memory（组织记忆）

**用途**: 组织级别的标准和策略

**适用场景**:
- 编码规范
- 安全策略
- 审批流程
- 通用约定

**生命周期**: 长期存储，跨项目共享

---

## 核心功能

### 1. 记忆管理

#### 创建记忆

**Web UI**:
1. 进入 Memory Manager 页面
2. 选择记忆层级（Session/Project/Organization）
3. 点击 "新建记忆"
4. 填写内容、标签等信息
5. 保存

**API**:
```bash
curl -X POST http://localhost:3000/v1/memory/kv \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "key": "user-preference-vue",
    "value": {
      "content": "User prefers Vue 3 Composition API",
      "tags": ["vue", "preference"]
    },
    "level": "project",
    "project_id": "proj-xxx"
  }'
```

#### 搜索记忆

**Web UI**:
1. 在 Memory Manager 中输入搜索关键词
2. 选择过滤条件（层级、标签、时间范围）
3. 查看结果列表

**API**:
```bash
curl "http://localhost:3000/v1/memory/kv?level=project&query=vue&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 删除记忆

**Web UI**:
1. 在记忆列表中找到要删除的记忆
2. 点击 "删除" 按钮
3. 确认删除

**API**:
```bash
curl -X DELETE "http://localhost:3000/v1/memory/kv/user-preference-vue" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 2. 会话检查点

#### 创建检查点

检查点用于保存会话状态，便于恢复:

**自动创建**:
- 工具调用前（pre_tool_call）
- 按时间间隔（auto）

**手动创建**:
```bash
curl -X POST http://localhost:3000/v1/memory/sessions/{session_id}/checkpoints \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "trigger": "manual",
    "state": {
      "current_task": "implementing auth",
      "modified_files": ["src/auth.ts"]
    }
  }'
```

#### 恢复检查点

```bash
curl -X POST http://localhost:3000/v1/memory/sessions/{session_id}/checkpoints/{checkpoint_id}/restore \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 列出检查点

```bash
curl "http://localhost:3000/v1/memory/sessions/{session_id}/checkpoints" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. 项目模式学习

系统自动从用户交互中学习模式:

#### 查看学习到的模式

```bash
curl "http://localhost:3000/v1/memory/projects/{project_id}/patterns" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 添加自定义模式

```bash
curl -X POST http://localhost:3000/v1/memory/projects/{project_id}/patterns \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "type": "code",
    "name": "prefer-composition-api",
    "description": "Prefer Vue 3 Composition API over Options API",
    "pattern": {
      "language": "vue",
      "preference": "composition"
    }
  }'
```

### 4. 记忆候选

系统会自动提取潜在有价值的记忆候选:

#### 查看候选列表

```bash
curl "http://localhost:3000/v1/memory/candidates?status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 批准/拒绝候选

```bash
# 批准
curl -X PATCH http://localhost:3000/v1/memory/candidates/{candidate_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "status": "approved",
    "user_feedback": "This is a useful pattern"
  }'

# 拒绝
curl -X PATCH http://localhost:3000/v1/memory/candidates/{candidate_id} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "status": "rejected",
    "user_feedback": "Not applicable to this project"
  }'
```

---

## Web UI 使用指南

### Memory Manager 界面

Memory Manager 是管理所有记忆的中心界面：

#### 访问方式

1. 登录 ANDOS Web UI
2. 从侧边栏选择 "记忆管理"

#### 界面功能

```
┌─────────────────────────────────────────────────────────────┐
│ Memory Manager                                    [+ 新建]  │
├─────────────────────────────────────────────────────────────┤
│ 层级: [全部 ▼]  标签: [选择...]  搜索: [____________] [🔍]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏢 组织级                                                │ │
│ │    ├─ 编码规范 (3)                                       │ │
│ │    └─ 安全策略 (1)                                       │ │
│ │                                                          │ │
│ │ 📁 项目级 (当前: MyProject)                               │ │
│ │    ├─ API 模式 (5)                                       │ │
│ │    ├─ 代码风格 (2)                                       │ │
│ │    └─ 常见错误 (3)                                       │ │
│ │                                                          │ │
│ │ 💬 会话级 (当前: session-xxx)                             │ │
│ │    ├─ 检查点 (4)                                         │ │
│ │    └─ 上下文记忆 (10)                                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ 记忆候选 (2 个待审核) [查看]                                │
└─────────────────────────────────────────────────────────────┘
```

#### 记忆详情视图

点击任意记忆可查看详情:

```
┌─────────────────────────────────────────────────────────────┐
│ ← 返回                    记忆详情                    [编辑]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 层级: 项目级                                                 │
│ 项目: MyProject                                             │
│ 命名空间: preferences                                       │
│                                                              │
│ ─────────────────────────────────────────────────────────   │
│                                                              │
│ 内容:                                                        │
│ User prefers Vue 3 Composition API with <script setup>      │
│ syntax for all new components.                              │
│                                                              │
│ ─────────────────────────────────────────────────────────   │
│                                                              │
│ 标签: vue, composition-api, preference                      │
│ 创建: 2024-03-15 14:30:00                                   │
│ 更新: 2024-03-15 14:30:00                                   │
│                                                              │
│ [删除]                                            [关闭]   │
└─────────────────────────────────────────────────────────────┘
```

### Agent Session History 界面

查看和管理 Agent 会话历史:

```
┌─────────────────────────────────────────────────────────────┐
│ Agent Session History                               [筛选 ▼]│
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────┬─────────────────────────────────────────┐ │
│ │ Sessions     │  Chat with Build Agent                  │ │
│ │              │  ────────────────────────────────────   │ │
│ ├──────────────┤                                          │ │
│ │ 🔵 Build     │  User: Create a login form              │ │
│ │    14:30     │                                          │ │
│ │              │  Agent: I'll help you create...         │ │
│ │ 🔵 Design    │  [Tool Call: read_file]                 │ │
│ │    14:15     │  [Tool Result: ...]                     │ │
│ │              │                                          │ │
│ │ ⚪ Test      │  User: Make it responsive               │ │
│ │    14:00     │                                          │ │
│ │              │  [Checkpoint: auto-created]             │ │
│ ├──────────────┤                                          │ │
│ │ Checkpoints  │  ── Checkpoints ──                      │ │
│ │ (4)          │  [14:20] Before responsive changes      │ │
│ │              │  [14:15] Initial implementation         │ │
│ │ Tokens:      │                                          │ │
│ │ 15,234       │  ── Token Usage ──                      │ │
│ │              │  Input: 8,234 | Output: 7,000           │ │
│ └──────────────┴─────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## MCP 集成

ANDOS 支持通过 MCP (Model Context Protocol) 与外部工具集成。

### 连接配置

**Claude Desktop 配置** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "andos": {
      "command": "npx",
      "args": ["-y", "@andos/mcp-client"],
      "env": {
        "ANDOS_URL": "http://localhost:3000",
        "ANDOS_TOKEN": "your_api_token"
      }
    }
  }
}
```

### 可用工具

#### memory_remember

存储新记忆:

```json
{
  "name": "memory_remember",
  "arguments": {
    "content": "User prefers dark theme for all UI components",
    "level": "project",
    "namespace": "ui-preferences",
    "tags": ["ui", "theme", "preference"]
  }
}
```

#### memory_forget

删除记忆:

```json
{
  "name": "memory_forget",
  "arguments": {
    "key": "project:ui-preferences:abc123",
    "level": "project"
  }
}
```

#### memory_search

搜索记忆:

```json
{
  "name": "memory_search",
  "arguments": {
    "query": "dark theme",
    "level": "project",
    "limit": 5
  }
}
```

### 资源访问

通过 MCP 资源访问记忆:

```
memory://project/{project_id}      # 项目记忆
memory://session/{session_id}      # 会话记忆
memory://organization/{org_id}     # 组织记忆
```

### 提示模板

#### memory_context

加载项目上下文到对话:

```json
{
  "name": "memory_context",
  "arguments": {
    "project_id": "proj-xxx",
    "query": "coding preferences"
  }
}
```

#### memory_assist

基于学习到的模式提供协助:

```json
{
  "name": "memory_assist",
  "arguments": {
    "task": "Implement user authentication"
  }
}
```

---

## API 使用

### 认证

所有 Memory API 需要 Bearer Token:

```bash
curl http://localhost:3000/v1/memory/kv \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 完整 API 列表

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1/memory/kv` | GET | 查询记忆列表 |
| `/v1/memory/kv` | POST | 创建记忆 |
| `/v1/memory/kv/:key` | GET | 获取单个记忆 |
| `/v1/memory/kv/:key` | DELETE | 删除记忆 |
| `/v1/memory/search` | POST | 搜索记忆 |
| `/v1/memory/sessions/:id/checkpoints` | GET | 列出检查点 |
| `/v1/memory/sessions/:id/checkpoints` | POST | 创建检查点 |
| `/v1/memory/sessions/:id/checkpoints/:cp/restore` | POST | 恢复检查点 |
| `/v1/memory/projects/:id/patterns` | GET | 获取项目模式 |
| `/v1/memory/projects/:id/patterns` | POST | 添加模式 |
| `/v1/memory/candidates` | GET | 获取候选列表 |
| `/v1/memory/candidates/:id` | PATCH | 更新候选状态 |

---

## 最佳实践

### 1. 记忆组织

**使用命名空间**: 按功能组织记忆

```
preferences/        # 用户偏好
patterns/          # 学习到的模式
errors/            # 错误记录
decisions/         # 架构决策
standards/         # 代码规范
```

**添加标签**: 便于搜索和过滤

```json
{
  "tags": ["vue", "frontend", "performance", "critical"]
}
```

### 2. 记忆生命周期

| 层级 | 保留策略 | 过期时间 |
|------|----------|----------|
| Session | 自动清理 | 7-30 天 |
| Project | 长期保留 | 无 |
| Organization | 永久保留 | 无 |

### 3. 检查点策略

**何时创建检查点**:
- 重要操作前（大规模重构、依赖更新）
- 定期自动保存（每 15 分钟）
- 关键决策点

**检查点命名**:
```
"Before auth refactor"
"Stable state - login working"
"Pre-dependency upgrade"
```

### 4. 候选审核

**批准标准**:
- 具有复用价值的知识
- 项目特定的约定
- 常见错误和解决方案

**拒绝标准**:
- 一次性信息
- 过于具体的实现细节
- 敏感信息

---

## 故障排查

### 常见问题

#### Q: 记忆搜索无结果

**可能原因**:
- 搜索关键词不匹配
- 记忆层级选择错误
- 权限不足

**解决方案**:
```bash
# 检查记忆是否存在
curl "http://localhost:3000/v1/memory/kv/my-key" \
  -H "Authorization: Bearer TOKEN"

# 列出所有记忆
curl "http://localhost:3000/v1/memory/kv?limit=100" \
  -H "Authorization: Bearer TOKEN"
```

#### Q: 检查点创建失败

**可能原因**:
- 会话不存在
- 存储空间不足
- 会话已过期

**解决方案**:
```bash
# 检查会话状态
curl "http://localhost:3000/v1/memory/sessions/{session_id}" \
  -H "Authorization: Bearer TOKEN"

# 清理过期检查点
curl -X POST "http://localhost:3000/v1/memory/sessions/{session_id}/checkpoints/cleanup" \
  -H "Authorization: Bearer TOKEN"
```

#### Q: MCP 连接失败

**可能原因**:
- SSE 端点不可访问
- 认证失败
- 会话超时

**解决方案**:
```bash
# 检查 MCP 健康状态
curl http://localhost:3000/mcp/health

# 预期响应
{
  "status": "healthy",
  "protocol": "mcp",
  "version": "1.5.0",
  "connections": 5
}
```

### 调试命令

```bash
# 查看记忆统计
curl "http://localhost:3000/v1/memory/stats" \
  -H "Authorization: Bearer TOKEN"

# 检查 MCP 工具列表
curl -X POST http://localhost:3000/mcp/messages?sessionId=test \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'

# 数据库直接查询
psql -U andos -c "SELECT COUNT(*) FROM kv_memories WHERE level = 'project';"
```

---

## 参考资料

- [MCP 协议文档](./mcp-protocol.md)
- [OpenAPI 规范](./openapi.json)
- [Agent Memory System 架构](../architecture/agent-memory-system.md)
- [API 设计文档](../architecture/api-design.md)
