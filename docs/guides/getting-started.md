# 快速开始

本文档帮助你快速搭建 ANDOS 开发环境并运行项目。

---

## 1. 环境要求

- **Node.js**: 18+
- **PostgreSQL**: 14+
- **Redis**: 7+ (可选，用于缓存)
- **Git**: 2.x

---

## 2. 安装步骤

### 2.1 克隆项目

```bash
git clone https://github.com/your-org/andos.git
cd andos
```

### 2.2 安装依赖

```bash
npm install
```

### 2.3 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=andos
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI
ANTHROPIC_API_KEY=your_api_key

# Server
PORT=3000
JWT_SECRET=your_jwt_secret
```

### 2.4 初始化数据库

```bash
# 创建数据库
createdb andos

# 运行迁移
npm run db:migrate

# 运行种子数据（可选）
npm run db:seed
```

### 2.5 启动开发服务器

```bash
npm run dev
```

服务将在 `http://localhost:3000` 启动。

---

## 3. 验证安装

### 3.1 健康检查

```bash
curl http://localhost:3000/health
```

### 3.2 创建测试资产

```bash
curl -X POST http://localhost:3000/v1/assets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "测试需求",
    "slug": "test-requirement",
    "type": "requirement",
    "project_id": "proj-xxx"
  }'
```

---

## 4. 开发工作流

### 4.1 常用命令

```bash
# 开发模式（热重载）
npm run dev

# 编译 TypeScript
npm run build

# 生产模式
npm start

# 运行测试
npm test
npm run test:unit
npm run test:integration

# 数据库
npm run db:migrate
npm run db:rollback
npm run db:seed
```

### 4.2 项目结构

```
src/
├── agents/           # AI Agent 实现
├── db/               # 数据库连接和迁移
├── plugins/          # Fastify 插件
├── routes/           # API 路由
├── services/         # 业务逻辑
├── types/            # TypeScript 类型
└── utils/            # 工具函数
```

---

## 5. 配置 Agent

### 5.1 创建 Agent 配置

在项目根目录创建 `.andos/agent.json`：

```json
{
  "agents": {
    "build": {
      "mode": "primary",
      "model": "anthropic/claude-sonnet-4",
      "temperature": 0.3,
      "prompt": "你是 ANDOS 平台的构建助手",
      "tools": {
        "read": true,
        "write": true
      }
    }
  }
}
```

### 5.2 测试 Agent

```bash
# 启动 Agent 会话
andos agent chat --agent build
```

---

## 6. 常见问题

### Q: 数据库连接失败

检查 `.env` 中的数据库配置，确保 PostgreSQL 已启动。

### Q: AI API 调用失败

确认 `ANTHROPIC_API_KEY` 已正确设置。

### Q: 端口被占用

修改 `.env` 中的 `PORT` 或使用：

```bash
PORT=3001 npm run dev
```

---

## 7. 下一步

- 阅读 [平台架构设计](../architecture/platform-overview.md)
- 了解 [Agent 系统](../architecture/agent-system.md)
- 了解 [Memory System](./memory-system.md)
- 查看 [API 文档](../api/openapi.json)
- 了解 [部署指南](../operations/deployment.md)
