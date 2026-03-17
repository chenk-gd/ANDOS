# AI-Native DevOps Platform (ANDOS)

<p align="center">
  <strong>AI驱动的全生命周期资产管理平台</strong>
</p>

<p align="center">
  <a href="#特性">特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#api文档">API文档</a> •
  <a href="#agent生态">Agent生态</a> •
  <a href="#架构">架构</a>
</p>

---

## 📋 目录

- [简介](#简介)
- [特性](#特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [API文档](#api文档)
- [Agent生态](#agent生态)
- [架构](#架构)
- [开发](#开发)
- [部署](#部署)
- [贡献](#贡献)
- [许可证](#许可证)

---

## 🎯 简介

ANDOS (AI-Native DevOps System) 是一个 **AI原生的全生命周期资产管理平台**，实现项目资产的版本化管理、依赖追踪和智能影响分析。

### 核心概念

- **资产 (Asset)**: 需求、设计、任务、代码、测试、流水线等
- **版本 (Version)**: 精确版本锁定，语义化版本控制
- **依赖 (Dependency)**: DAG 有向无环图，自动状态传播
- **Agent**: AI 助手，支持需求分析、设计生成、代码编写、测试生成

---

## ✨ 特性

### 核心平台 (V1.0)

- ✅ **软删除机制** - PostgreSQL 原生支持，支持删除后恢复
- ✅ **表分区** - 按月分区，支持大规模数据
- ✅ **ltree 物化路径** - 高效的依赖图查询
- ✅ **RESTful API** - 36 个端点，完整的 CRUD 支持
- ✅ **幂等性** - `Idempotency-Key` 头部支持
- ✅ **限流控制** - 分级限流 (匿名/用户/付费/内部)
- ✅ **字段过滤** - 稀疏字段集，减少数据传输

### Agent 生态 (V1.0-V1.5)

| Agent | 功能 | 版本 |
|-------|------|------|
| **RequirementAgent** | 需求分析、规格生成 | V1.0 |
| **DesignAgent** | 系统设计、架构设计 | V1.0 |
| **TaskAgent** | 任务拆分、Sprint 规划 | V1.0 |
| **CodeAgent** | 代码生成、代码审查 | V1.5 |
| **TestAgent** | 测试生成、覆盖率分析 | V1.5 |
| **CompatibilityAgent** | 发布前兼容性检查 | V1.5 |
| **ImpactAgent** | 发布后影响分析 | V1.5 |

### 增强功能 (V1.5)

- ✅ **大上下文存储** - 超过 100KB 自动存 S3/MinIO
- ✅ **Agent Service 框架** - 完整的 Agent 生命周期管理
- ✅ **权限控制** - 工具级权限 (allow/ask/deny)
- ✅ **Claude API 集成** - 支持 Claude 3.5 Sonnet
- ✅ **可视化依赖图谱** - DAG 图可视化 API (Cytoscape/Mermaid/DOT)
- ✅ **Webhook 系统** - 事件订阅与推送
- ✅ **兼容性检查** - 发布前自动检测 breaking changes
- ✅ **影响分析** - 发布后下游资产影响评估

### 规划功能 (V2.0)

- ⏳ **Webhook 系统** - 事件订阅与推送
- ⏳ **可视化依赖图谱** - 交互式 DAG 展示
- ⏳ **GraphQL API** - 灵活查询接口
- ⏳ **CompatibilityAgent** - 发布前兼容性检查
- ⏳ **ImpactAgent** - 发布后影响分析

---

## 🛠️ 技术栈

### 后端

| 技术 | 用途 | 版本 |
|------|------|------|
| **Node.js** | 运行时 | 18+ |
| **TypeScript** | 开发语言 | 5.3+ |
| **Fastify** | Web 框架 | 4.26+ |
| **PostgreSQL** | 主数据库 | 14+ |
| **Knex.js** | SQL 构建器 | 3.1+ |
| **Redis** | 缓存/限流 | 7+ |
| **S3/MinIO** | 对象存储 | - |

### AI/ML

| 技术 | 用途 |
|------|------|
| **Claude API** | AI 对话与生成 |
| **Anthropic SDK** | 官方客户端 |

### 基础设施

| 技术 | 用途 |
|------|------|
| **Docker** | 容器化 |
| **Git** | 版本控制 |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 7
- S3/MinIO (可选，用于大上下文存储)

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/andos.git
cd andos

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 配置数据库、Redis、S3 等信息
```

### 配置环境变量

```env
# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_NAME=andos_dev
DB_USER=andos
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# S3 (可选)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
S3_BUCKET_NAME=andos-contexts

# Claude API
ANTHROPIC_API_KEY=your_api_key

# JWT (可选)
JWT_SECRET=your_jwt_secret

# 服务器
PORT=3000
NODE_ENV=development
```

### 数据库迁移

```bash
# 运行迁移
npm run db:migrate

# 回滚
npm run db:rollback
```

### 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

服务将在 `http://localhost:3000` 启动。

---

## 📚 API文档

### 基础信息

- **Base URL**: `http://localhost:3000/v1`
- **认证**: Bearer Token (可选)
- **内容类型**: `application/json`

### 端点概览

| 资源 | 端点 | 方法 | 描述 |
|------|------|------|------|
| **Health** | `/health` | GET | 健康检查 |
| **Assets** | `/v1/assets` | GET/POST | 资产列表/创建 |
| **Assets** | `/v1/assets/:id` | GET/PATCH/DELETE | 资产操作 |
| **Assets** | `/v1/assets/:id/restore` | POST | 恢复已删除资产 |
| **Assets** | `/v1/assets/:id/transition` | POST | 状态转换 |
| **Assets** | `/v1/assets/:id/versions` | GET | 获取版本列表 |
| **Assets** | `/v1/assets/:id/dependencies/*` | GET | 获取依赖关系 |
| **Assets** | `/v1/assets/:id/descendants` | GET | 获取下游资产 (ltree) |
| **Assets** | `/v1/assets/:id/ancestors` | GET | 获取上游资产 (ltree) |
| **Assets** | `/v1/assets/:id/graph` | GET | 获取依赖图谱 (多种格式) |
| **Assets** | `/v1/assets/:id/impact` | GET | 获取影响分析 |
| **Assets** | `/v1/assets/:id/graph/export` | GET | 导出图谱 (Mermaid/DOT/JSON) |
| **Dependencies** | `/v1/dependencies` | POST/DELETE | 创建/删除依赖 |
| **Agents** | `/v1/agents` | GET/POST | Agent 列表/创建 |
| **Agents** | `/v1/agents/:slug/sessions` | POST | 创建会话 |
| **Agents** | `/v1/agents/:slug/executions` | POST | 创建执行 |
| **Agents** | `/v1/agents/executions/:id/run` | POST | 执行 Agent |
| **Webhooks** | `/v1/webhooks` | GET/POST | Webhook 订阅管理 |
| **Webhooks** | `/v1/webhooks/:id` | GET/PATCH/DELETE | 订阅操作 |
| **Webhooks** | `/v1/webhooks/:id/deliveries` | GET | 投递历史 |
| **Webhooks** | `/v1/webhooks/deliveries/:id/retry` | POST | 重试投递 |
| **Webhooks** | `/v1/webhooks/stats` | GET | 统计信息 |

### 示例请求

#### 创建资产

```bash
curl -X POST http://localhost:3000/v1/assets \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "name": "用户登录模块需求",
    "slug": "user-login-requirement",
    "description": "实现用户登录功能",
    "type": "requirement",
    "project_id": "proj-xxx",
    "tags": ["auth", "login"]
  }'
```

#### 触发 Agent

```bash
curl -X POST http://localhost:3000/v1/agents/design-agent/executions \
  -H "Content-Type: application/json" \
  -d '{
    "execution_id": "exec-001",
    "source_asset_id": "req-xxx",
    "trigger_event_type": "design.requested"
  }'
```

#### 执行 Agent

```bash
curl -X POST http://localhost:3000/v1/agents/executions/exec-001/run \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "根据需求生成系统设计",
    "max_tokens": 4096
  }'
```

---

## 🤖 Agent生态

### Agent 类型

| 类型 | 说明 | 触发方式 |
|------|------|----------|
| **Primary** | 主助手，用户直接交互 | 手动触发 |
| **Subagent** | 专项代理，处理特定任务 | `@name` 调用 |

### Agent 配置

Agent 支持通过 `SKILL.md` 或 API 配置：

```yaml
# SKILL.md 示例
---
name: design-agent
description: 系统设计专家
mode: primary
model: anthropic/claude-3-5-sonnet-20241022
temperature: 0.2
tools:
  - fetch_asset
  - query_dag
  - create_design
permissions:
  read: allow
  write: allow
  bash:
    "git *": allow
    "*": deny
---
```

### 初始化 Agent

```typescript
import { initializeAllAgents } from './src/agents';

// 应用启动时初始化
await initializeAllAgents();
```

---

## 🏗️ 架构

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Web UI / CLI / IDE Plugins                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        API Gateway                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Fastify    │  │   Rate      │  │   Idempotency       │ │
│  │  Server     │  │   Limit     │  │   Middleware        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Service Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ AssetService │  │ AgentService │  │ PartitionService │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          AgentExecutionEngine (Claude API)             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Data Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  PostgreSQL  │  │    Redis     │  │   S3/MinIO       │  │
│  │  (Core)      │  │  (Cache)     │  │  (Context)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 数据库架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Core Schema                             │
├─────────────────────────────────────────────────────────────┤
│  assets          - 资产主表                                   │
│  asset_versions  - 版本表                                     │
│  dependencies    - 依赖关系                                   │
│  asset_paths     - ltree 物化路径                             │
│  asset_metadata  - 扩展元数据                                 │
│  asset_state_transitions - 状态变更历史                       │
│  dirty_sources   - dirty 来源队列                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Schema                            │
├─────────────────────────────────────────────────────────────┤
│  agents          - Agent 定义                                 │
│  agent_sessions  - 会话管理                                   │
│  agent_executions - 执行记录 (按月分区)                        │
│  agent_approvals - 审批记录                                   │
│  skills          - Skill 定义                                 │
│  agent_skills    - Agent-Skill 关联                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Event Schema                            │
├─────────────────────────────────────────────────────────────┤
│  platform_events - 平台事件 (按月分区)                         │
│  notifications   - 通知记录                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 💻 开发

### 项目结构

```
andos/
├── src/
│   ├── agents/           # Agent 实现
│   │   ├── RequirementAgent.ts
│   │   ├── DesignAgent.ts
│   │   ├── TaskAgent.ts
│   │   ├── CodeAgent.ts
│   │   ├── TestAgent.ts
│   │   └── index.ts
│   ├── db/
│   │   └── connection.ts
│   ├── plugins/          # Fastify 插件
│   │   ├── errorHandler.ts
│   │   ├── idempotency.ts
│   │   └── rateLimit.ts
│   ├── routes/           # API 路由
│   │   ├── assets.ts
│   │   ├── versions.ts
│   │   ├── dependencies.ts
│   │   └── agents.ts
│   ├── services/         # 业务逻辑
│   │   ├── AssetService.ts
│   │   ├── AgentService.ts
│   │   ├── AgentExecutionEngine.ts
│   │   ├── PartitionService.ts
│   │   └── ContextStorageService.ts
│   ├── types/            # TypeScript 类型
│   │   ├── asset.ts
│   │   └── agent.ts
│   ├── utils/            # 工具函数
│   │   └── fieldFiltering.ts
│   └── index.ts          # 入口
├── database/
│   └── migrations/       # 数据库迁移
├── tests/
│   ├── unit/
│   └── fixtures/
├── docs/
│   └── plans/            # 设计文档
└── package.json
```

### 运行测试

```bash
# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# 覆盖率
npm run test:coverage
```

---

## 🐳 部署

### Docker Compose

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: andos
      POSTGRES_PASSWORD: andos
      POSTGRES_DB: andos
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123

volumes:
  postgres_data:
```

### Kubernetes

```yaml
# k8s/deployment.yaml 示例
apiVersion: apps/v1
kind: Deployment
metadata:
  name: andos-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: andos-api
  template:
    metadata:
      labels:
        app: andos-api
    spec:
      containers:
      - name: api
        image: andos/api:latest
        ports:
        - containerPort: 3000
```

---

## 📄 许可证

[MIT](LICENSE)

---

## 🙏 致谢

- [Fastify](https://www.fastify.io/) - Web 框架
- [Knex.js](https://knexjs.org/) - SQL 构建器
- [Anthropic](https://www.anthropic.com/) - Claude AI

---

<p align="center">
  <strong>ANDOS</strong> - Empowering AI-Native Development
</p>
