# ANDOS 文档中心

欢迎使用 ANDOS (AI-Native DevOps System) 文档中心！

---

## 📚 文档导航

### 🏗️ 架构设计

| 文档 | 说明 |
|------|------|
| [平台架构概览](./architecture/platform-overview.md) | 系统整体架构、核心概念、设计原则 |
| [Agent 系统设计](./architecture/agent-system.md) | Primary/Subagent 架构、Skill 系统、权限模型 |
| [数据模型设计](./architecture/data-model.md) | 数据库 Schema、分层模型、查询模式 |
| [API 设计](./architecture/api-design.md) | REST API 规范、WebSocket 接口 |

### 📖 开发指南

| 文档 | 说明 |
|------|------|
| [快速开始](./guides/getting-started.md) | 本地环境搭建、首个 API 调用 |

### 🚀 运维指南

| 文档 | 说明 |
|------|------|
| [部署指南](./operations/deployment.md) | Docker/K8s 部署、监控、故障排查 |

### 📋 API 参考

| 文档 | 说明 |
|------|------|
| [OpenAPI 定义](./api/openapi.yaml) | 完整的 OpenAPI 3.0 规范 |

### 📅 项目规划

| 文档 | 说明 |
|------|------|
| [实施路线图](./plans/implementation-roadmap.md) | 各阶段功能计划、技术债务、风险分析 |

---

## 🎯 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/your-org/andos.git
cd andos

# 2. 安装依赖
npm install

# 3. 配置环境
cp .env.example .env
# 编辑 .env 文件

# 4. 初始化数据库
npm run db:migrate

# 5. 启动开发服务器
npm run dev
```

详细步骤请查看 [快速开始指南](./guides/getting-started.md)。

---

## 🏛️ 系统架构

ANDOS 是一个 AI-Native 资产管理系统，实现项目全生命周期资产的：

- **版本化管理** - 资产版本控制与内容存储
- **依赖追踪** - DAG 依赖图谱与影响分析
- **状态管理** - Clean/Dirty 状态传播机制
- **AI-Agent 集成** - Primary/Subagent 双模式架构

```
┌─────────────────────────────────────────────────────────┐
│                      ANDOS Platform                      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Web UI     │  │    CLI       │  │  Agent API   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │              API Gateway (Fastify)               │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │  Asset   │  │   Agent      │  │   Graph/Impact   │ │
│  │  Service │  │   Service    │  │   Services       │ │
│  └──────────┘  └──────────────┘  └──────────────────┘ │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │PostgreSQL│  │    Redis     │  │  S3/MinIO        │ │
│  └──────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🧠 核心概念

### 资产分层模型

```
Layer 1: requirement    ← 需求层
Layer 2: design         ← 设计层（依赖需求）
Layer 3: task           ← 任务层（依赖设计）
Layer 4: code           ← 代码层（依赖任务/设计）
Layer 5: test           ← 测试层（依赖代码）
Layer 6: pipeline       ← 流水线层（依赖测试）
```

### 资产状态机

```
     publish              upstream publish
[draft] ──────► [clean] ────────────► [dirty]
                      │                   │
                      │                   │ manual clean
                      └───────────────────► [clean]
```

---

## 📦 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **Runtime** | Node.js | 18+ |
| **Language** | TypeScript | 5.3+ |
| **Framework** | Fastify | 4.26+ |
| **Database** | PostgreSQL | 14+ |
| **Cache** | Redis | 7+ |
| **AI** | Claude API | - |

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送分支 (`git push origin feature/xxx`)
5. 创建 Pull Request

---

## 📄 License

[MIT License](../LICENSE)

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/your-org/andos)
- [API 文档](https://api.andos.dev/docs)
- [Agent Skills 规范](https://docs.anthropic.com/en/docs/agents)

---

**Last Updated:** 2026-03-14
