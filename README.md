# ANDOS - AI-Native DevOps System

<p align="center">
  <strong>AI原生的DevOps平台</strong>
</p>

<p align="center">
  <a href="#特性">特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#项目结构">项目结构</a> •
  <a href="#api文档">API文档</a> •
  <a href="#架构">架构</a>
</p>

---

## 📋 目录

- [简介](#简介)
- [特性](#特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [API文档](#api文档)
- [开发](#开发)
- [测试](#测试)
- [部署](#部署)
- [许可证](#许可证)

---

## 🎯 简介

ANDOS 是一个 **AI原生的DevOps台**，通过对项目资产的版本化管理、依赖追踪和智能影响分析，实现人+智能体的协同开发。
2025 年 12 月，是 AI Coding 发展史上的关键转折点，智能编程能力迎来阶跃式突破。在此之前，AI Coding 仍停留在辅助工具定位，行业普遍格局是：AI 生成约 20% 代码，人类承担 80% 的设计与编码工作。而随着 Agentic Coding、长上下文代码生成、多文件协同开发等技术成熟，这一比例正在快速逆转 —— 未来人类只需编写 20% 甚至完全无需手写代码，研发流程将进入 “AI 主导生成、人类主导治理” 的全新阶段。
这也带来一个核心问题：当代码高度自动化，人类在研发生命周期中的价值与介入点究竟在哪里？如果把全流程当作黑盒，只输入需求、输出结果，显然无法应对真实工程风险。尽管当前 AI Coding 能力极强，但仍存在逻辑偏差、安全隐患、合规不合规、上下文 “走偏” 等高频问题，一旦上线后修复，代价将呈指数级上升。传统思路依赖人工审查代码，但 AI 生成代码的速度与体量，早已让逐行人工评审变得不可行。
因此，Human In The Loop（人在回路） 的唯一可行、高效且可规模化的介入环节，便是研发全流程中各类工程与合规文档的审查。这既是管控 AI 生成内容风险的关键抓手，也是保障研发过程可追溯、可审计、可合规的核心底座，更是本项目最主要的出发点。


### 核心概念

- **资产 (Asset)**: 需求、设计、任务、代码、测试、流水线等
- **版本 (Version)**: 精确版本锁定，语义化版本控制
- **依赖 (Dependency)**: DAG 有向无环图，自动状态传播
- **Agent**: AI 助手，支持需求分析、设计生成、代码编写、测试生成
- **组织 (Organization)**: 多租户支持，层级组织结构（最多3层）

---

## ✨ 特性

### 核心平台

| 特性 | 说明 |
|------|------|
| ✅ **资产管理** | 完整的 CRUD、软删除/恢复、状态机管理 |
| ✅ **版本控制** | 语义化版本、精确锁定、版本对比 |
| ✅ **DAG 依赖** | 有向无环图依赖、自动环检测、影响分析 |
| ✅ **ltree 物化路径** | PostgreSQL ltree 扩展高效查询依赖关系 |
| ✅ **组织与 RBAC** | 多租户、层级组织、角色权限控制 |
| ✅ **Webhook 系统** | 事件订阅与推送、投递重试 |
| ✅ **幂等性** | `Idempotency-Key` 头部支持 |
| ✅ **限流控制** | 分级限流（匿名/用户/付费/内部） |
| ✅ **字段过滤** | 稀疏字段集，减少数据传输 |
| ✅ **表分区** | 按月分区，支持大规模数据 |

### Agent 生态

| Agent | 功能 | 状态 |
|-------|------|------|
| **RequirementAgent** | 需求分析、规格生成 | ✅ |
| **DesignAgent** | 系统设计、架构设计 | ✅ |
| **TaskAgent** | 任务拆分、Sprint 规划 | ✅ |
| **CodeAgent** | 代码生成、代码审查 | ✅ |
| **TestAgent** | 测试生成、覆盖率分析 | ✅ |
| **CompatibilityAgent** | 发布前兼容性检查 | ✅ |
| **ImpactAgent** | 发布后影响分析 | ✅ |

### 增强功能

- ✅ **大上下文存储** - 超过 100KB 自动存 S3/MinIO
- ✅ **Agent Memory API** - V1.5 记忆系统（工作记忆/长期记忆）
- ✅ **权限控制** - 工具级权限（allow/ask/deny）
- ✅ **Claude API 集成** - 支持 Claude 3.5 Sonnet
- ✅ **可视化依赖图谱** - DAG 图可视化（Cytoscape）
- ✅ **Web UI** - Vue 3 + Element Plus 管理界面

---

## 🛠️ 技术栈

### 后端 (`apps/server`)

| 技术 | 用途 | 版本 |
|------|------|------|
| **Node.js** | 运行时 | 18+ |
| **TypeScript** | 开发语言 | 5.3+ |
| **Fastify** | Web 框架 | 4.26+ |
| **PostgreSQL** | 主数据库 | 14+ |
| **Knex.js** | SQL 构建器 | 3.1+ |
| **Redis** | 缓存/限流 | 7+ |
| **S3/MinIO** | 对象存储 | - |
| **Claude API** | AI 对话与生成 | - |

### 前端 (`apps/web`)

| 技术 | 用途 | 版本 |
|------|------|------|
| **Vue 3** | 前端框架 | 3.4+ |
| **TypeScript** | 开发语言 | 5.3+ |
| **Vite** | 构建工具 | 5.0+ |
| **Element Plus** | UI 组件库 | 2.5+ |
| **Pinia** | 状态管理 | 2.1+ |
| **Cytoscape** | 图谱可视化 | 3.28+ |
| **Monaco Editor** | 代码编辑器 | 0.45+ |

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- PostgreSQL >= 14（需启用 ltree 扩展）
- Redis >= 7
- S3/MinIO（可选，用于大上下文存储）

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/andos.git
cd andos

# 安装依赖
npm install

# 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 .env 配置数据库、Redis、S3 等信息
```

### 环境变量配置

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

# S3/MinIO（可选）
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
S3_BUCKET_NAME=andos-contexts

# Claude API
ANTHROPIC_API_KEY=your_api_key

# JWT
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

# 种子数据
npm run db:seed
```

### 启动服务

```bash
# 同时启动前后端（开发模式）
npm run dev

# 单独启动后端
npm run dev:server

# 单独启动前端
npm run dev:web
```

- API 服务: `http://localhost:3000`
- Web 界面: `http://localhost:5173`

---

## 📁 项目结构

```
andos/
├── apps/
│   ├── server/              # Fastify 后端 API
│   │   ├── src/
│   │   │   ├── agents/      # Agent 实现
│   │   │   ├── db/          # 数据库连接和迁移
│   │   │   ├── middleware/  # 认证中间件
│   │   │   ├── plugins/     # Fastify 插件
│   │   │   ├── routes/      # API 路由
│   │   │   ├── services/    # 业务逻辑服务
│   │   │   ├── types/       # TypeScript 类型
│   │   │   └── utils/       # 工具函数
│   │   ├── tests/
│   │   │   ├── unit/        # 单元测试
│   │   │   └── integration/ # 集成测试
│   │   └── package.json
│   └── web/                 # Vue 3 前端
│       ├── src/
│       │   ├── components/  # Vue 组件
│       │   ├── views/       # 页面视图
│       │   ├── stores/      # Pinia 状态
│       │   ├── api/         # API 客户端
│       │   └── utils/       # 工具函数
│       └── package.json
├── packages/
│   └── shared-errors/       # 共享错误类型
├── database/
│   └── migrations/          # 数据库迁移文件
├── docs/
│   ├── architecture/        # 架构文档
│   ├── guides/              # 使用指南
│   ├── operations/          # 运维文档
│   └── plans/               # 设计文档和规划
└── package.json             # Monorepo 根配置
```

---

## 📚 API文档

### 基础信息

- **Base URL**: `http://localhost:3000/v1`
- **认证**: Bearer Token
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
| **Assets** | `/v1/assets/:id/graph` | GET | 获取依赖图谱 |
| **Assets** | `/v1/assets/:id/impact` | GET | 获取影响分析 |
| **Dependencies** | `/v1/dependencies` | POST/DELETE | 创建/删除依赖 |
| **Agents** | `/v1/agents` | GET/POST | Agent 管理 |
| **Agents** | `/v1/agents/:slug/executions` | POST | 创建执行 |
| **Agents** | `/v1/agents/executions/:id/run` | POST | 执行 Agent |
| **Agents** | `/v1/agents/:slug/memory` | GET/POST | Agent 记忆管理 |
| **Webhooks** | `/v1/webhooks` | GET/POST | Webhook 订阅 |
| **Organizations** | `/v1/orgs` | GET/POST | 组织管理 |
| **Projects** | `/v1/projects` | GET/POST | 项目管理 |
| **Users** | `/v1/users` | GET/POST | 用户管理 |

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
    "source_asset_id": "req-xxx",
    "trigger_event_type": "design.requested"
  }'
```

---

## 💻 开发

### 常用命令

```bash
# 开发模式
npm run dev              # 同时启动前后端
npm run dev:server       # 单独启动后端
npm run dev:web          # 单独启动前端

# 构建
npm run build            # 构建所有工作区
npm run build:server     # 仅构建后端
npm run build:web        # 仅构建前端

# 数据库
npm run db:migrate       # 运行迁移
npm run db:rollback      # 回滚迁移
npm run db:seed          # 运行种子
```

---

## 🧪 测试

```bash
# 运行所有测试
npm test

# 后端测试
cd apps/server
npm run test:unit        # 单元测试（使用 mock 数据库）
npm run test:integration # 集成测试（需要 PostgreSQL）
npm run test:coverage    # 覆盖率报告

# 前端测试
cd apps/web
npm run test             # 单元测试
```

---

## 🐳 部署

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: ./apps/server
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

  web:
    build: ./apps/web
    ports:
      - "80:80"
    depends_on:
      - api

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

---

## 🏗️ 架构

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Web UI (Vue 3) / CLI / IDE Plugins                         │
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
│  │ AssetService │  │ AgentService │  │ ProjectService   │  │
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

---

## 📄 许可证

[MIT](LICENSE)

---

## 🙏 致谢

- [Fastify](https://www.fastify.io/) - Web 框架
- [Knex.js](https://knexjs.org/) - SQL 构建器
- [Vue.js](https://vuejs.org/) - 前端框架
- [Element Plus](https://element-plus.org/) - UI 组件库
- [Anthropic](https://www.anthropic.com/) - Claude AI

---

<p align="center">
  <strong>ANDOS</strong> - Empowering AI-Native Development
</p>
