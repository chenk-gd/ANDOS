# 部署与运维

本文档介绍 ANDOS 的生产环境部署和运维管理。

---

## 1. 部署架构

### 1.1 推荐架构

```
┌─────────────────────────────────────────────────────────┐
│                         CDN                              │
│                    (Static Assets)                       │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                         │
│                     (Nginx/ALB)                          │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │  App 1  │       │  App 2  │       │  App 3  │
   │ (Docker)│       │ (Docker)│       │ (Docker)│
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   PostgreSQL Cluster                     │
│              (Primary + Read Replicas)                   │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                    Redis Cluster                         │
│                (Cache + Session)                         │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                    S3 / MinIO                            │
│                  (Object Storage)                        │
└─────────────────────────────────────────────────────────┘
```

### 1.2 资源需求

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| App Server | 2 vCPU, 4GB RAM | 4 vCPU, 8GB RAM |
| PostgreSQL | 2 vCPU, 4GB RAM | 4 vCPU, 16GB RAM |
| Redis | 1 vCPU, 2GB RAM | 2 vCPU, 4GB RAM |
| Storage | 20GB SSD | 100GB SSD |

---

## 2. Docker 部署

### 2.1 使用 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=andos
      - DB_USER=andos
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - ANTROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:14-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=andos
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=andos
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### 2.2 启动服务

```bash
# 创建环境变量文件
cat > .env.production << EOF
DB_PASSWORD=secure_password
ANTHROPIC_API_KEY=your_api_key
JWT_SECRET=secure_jwt_secret
EOF

# 启动
docker-compose up -d

# 运行数据库迁移
docker-compose exec app npm run db:migrate
```

---

## 3. Kubernetes 部署

### 3.1 配置文件

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: andos-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: andos
  template:
    metadata:
      labels:
        app: andos
    spec:
      containers:
      - name: andos
        image: andos:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            secretKeyRef:
              name: andos-secrets
              key: db-host
        # ... 其他环境变量
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
```

### 3.2 部署命令

```bash
# 创建 Secrets
kubectl create secret generic andos-secrets \
  --from-literal=db-password=xxx \
  --from-literal=anthropic-api-key=xxx \
  --from-literal=jwt-secret=xxx

# 部署
kubectl apply -f k8s/

# 检查状态
kubectl get pods
kubectl logs -l app=andos
```

---

## 4. 数据库运维

### 4.1 备份策略

```bash
# 自动备份脚本
#!/bin/bash
BACKUP_DIR="/backup/postgres"
DATE=$(date +%Y%m%d_%H%M%S)

# 全量备份
pg_dump -h localhost -U andos andos | gzip > "$BACKUP_DIR/andos_$DATE.sql.gz"

# 保留最近 7 天备份
find $BACKUP_DIR -name "andos_*.sql.gz" -mtime +7 -delete
```

### 4.2 监控指标

| 指标 | 告警阈值 | 说明 |
|------|----------|------|
| DB CPU | > 70% | 数据库CPU使用率 |
| DB Memory | > 80% | 数据库内存使用 |
| Connections | > 80% | 连接数使用率 |
| Slow Queries | > 1s | 慢查询数量 |
| Replication Lag | > 10s | 主从延迟 |

### 4.3 常用维护命令

```bash
# 查看活跃连接
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

# 查看慢查询
SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;

# 清理旧数据（按日期）
DELETE FROM agent_executions WHERE created_at < NOW() - INTERVAL '6 months';

# 更新统计信息
ANALYZE assets;
```

---

## 5. 监控与日志

### 5.1 健康检查

```bash
# 健康检查端点
curl http://localhost:3000/health

# 详细健康检查
curl http://localhost:3000/health/detail
```

### 5.2 日志管理

```bash
# Docker 日志
docker-compose logs -f app

# Kubernetes 日志
kubectl logs -f deployment/andos-app

# 结构化日志查询（使用 jq）
docker-compose logs app | jq 'select(.level == "error")'
```

### 5.3 Prometheus 指标

```yaml
# 暴露指标
- name: METRICS_ENABLED
  value: "true"

# 访问指标
# http://localhost:3000/metrics
```

关键指标：

| 指标 | 类型 | 说明 |
|------|------|------|
| `http_requests_total` | Counter | HTTP请求总数 |
| `http_request_duration_seconds` | Histogram | HTTP请求耗时 |
| `db_query_duration_seconds` | Histogram | 数据库查询耗时 |
| `agent_executions_total` | Counter | Agent执行次数 |

---

## 6. 安全加固

### 6.1 网络安全

- 使用 HTTPS（TLS 1.3）
- 配置 WAF（Web应用防火墙）
- 限制内网访问（安全组/防火墙）
- DDoS 防护

### 6.2 数据安全

- 数据库加密（TLS）
- 敏感数据加密存储
- 定期轮换密钥
- 访问日志审计

### 6.3 容器安全

```dockerfile
# 使用非 root 用户
USER node

# 只读文件系统
readOnlyRootFilesystem: true

# 安全上下文
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  capabilities:
    drop:
      - ALL
```

---

## 7. 故障排查

### 7.1 常见故障

| 故障 | 可能原因 | 解决方案 |
|------|----------|----------|
| 启动失败 | 数据库连接失败 | 检查DB配置和网络 |
| 502错误 | 应用崩溃 | 查看日志，重启服务 |
| 慢响应 | 数据库慢查询 | 优化查询，加索引 |
| 内存溢出 | 内存泄漏 | 重启容器，调优GC |
| 高CPU | 死循环/大量计算 | 查看火焰图，优化代码 |

### 7.2 紧急回滚

```bash
# Docker 回滚
docker-compose down
docker-compose pull
docker-compose up -d

# Kubernetes 回滚
kubectl rollout undo deployment/andos-app
```

### 7.3 灾难恢复

```bash
# 从备份恢复数据库
gunzip < backup.sql.gz | psql -h localhost -U andos andos

# 验证数据完整性
SELECT count(*) FROM assets;
```

---

## 8. 性能优化

### 8.1 数据库优化

```sql
-- 添加常用索引
CREATE INDEX CONCURRENTLY idx_assets_project_type ON assets(project_id, type) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_versions_asset_state ON asset_versions(asset_id, state);

-- 表分区（大表）
CREATE TABLE agent_executions_2026_03 PARTITION OF agent_executions
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### 8.2 缓存策略

```typescript
// Redis 缓存配置
const cacheConfig = {
  ttl: 3600,  // 1小时
  checkPeriod: 600,  // 10分钟
  maxKeys: 10000
};
```

### 8.3 连接池

```typescript
// 数据库连接池
const dbConfig = {
  pool: {
    min: 5,
    max: 20,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  }
};
```

---

## 9. MCP 与 Memory System 配置

### 9.1 MCP Server 配置

#### 环境变量

```env
# MCP Server
MCP_ENABLED=true
MCP_SSE_ENDPOINT=/mcp/sse
MCP_KEEPALIVE_INTERVAL=30000
MCP_MAX_CONNECTIONS=100
MCP_SESSION_TIMEOUT=3600000

# Memory System
MEMORY_SYSTEM_ENABLED=true
MEMORY_DEFAULT_TTL=604800  # 7 days for session memories
MEMORY_MAX_CHECKPOINTS=50
MEMORY_CANDIDATE_REVIEW_ENABLED=true
```

#### Docker Compose 配置

```yaml
services:
  app:
    environment:
      - MCP_ENABLED=true
      - MCP_SSE_ENDPOINT=/mcp/sse
      - MCP_KEEPALIVE_INTERVAL=30000
      - MCP_MAX_CONNECTIONS=100
      - MEMORY_SYSTEM_ENABLED=true
      - MEMORY_DEFAULT_TTL=604800
      - MEMORY_MAX_CHECKPOINTS=50
    # ...
```

### 9.2 Memory System 数据存储

#### 数据库表分区

```sql
-- Session 检查点表分区
CREATE TABLE session_checkpoints_2026_03 PARTITION OF session_checkpoints
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- KV Memory 索引
CREATE INDEX CONCURRENTLY idx_kv_memories_level_namespace
    ON kv_memories(level, namespace)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_kv_memories_project_session
    ON kv_memories(project_id, session_id)
    WHERE deleted_at IS NULL;

-- Memory candidates 索引
CREATE INDEX CONCURRENTLY idx_memory_candidates_status
    ON memory_candidates(status, created_at)
    WHERE status = 'pending';
```

### 9.3 MCP 客户端配置

#### Claude Desktop

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "andos": {
      "command": "npx",
      "args": ["-y", "@andos/mcp-client"],
      "env": {
        "ANDOS_URL": "https://your-andos-instance.com",
        "ANDOS_TOKEN": "your_api_token"
      }
    }
  }
}
```

#### Claude Code

```bash
# 配置 MCP
export MCP_SSE_URL=http://localhost:3000/mcp/sse
export MCP_TOKEN=your_api_token

# 启动 with MCP
claude --mcp-server andos
```

### 9.4 Memory System 运维

#### 清理过期记忆

```bash
#!/bin/bash
# cleanup-memories.sh
# 清理过期 session memories

curl -X POST http://localhost:3000/v1/memory/cleanup \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "session",
    "older_than_days": 30,
    "dry_run": false
  }'
```

#### 备份项目记忆

```bash
#!/bin/bash
# backup-project-memories.sh
# 备份特定项目的记忆

PROJECT_ID="proj-xxx"
BACKUP_DIR="/backup/memories"
DATE=$(date +%Y%m%d_%H%M%S)

# 导出项目记忆
curl "http://localhost:3000/v1/memory/projects/$PROJECT_ID/export" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  > "$BACKUP_DIR/project_${PROJECT_ID}_$DATE.json"

# 压缩
gzip "$BACKUP_DIR/project_${PROJECT_ID}_$DATE.json"

# 保留最近 30 天
find $BACKUP_DIR -name "project_*.json.gz" -mtime +30 -delete
```

#### 监控 Memory System

```yaml
# Prometheus 规则
- alert: MCPConnectionsHigh
  expr: mcp_active_connections > 80
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "MCP connections high"
    description: "Active MCP connections: {{ $value }}"

- alert: MemoryStorageFull
  expr: memory_storage_usage_percent > 80
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Memory storage nearly full"
    description: "Memory storage usage: {{ $value }}%"
```

### 9.5 Memory System 性能调优

#### Redis 缓存配置

```conf
# redis.conf
# Memory System 专用配置
maxmemory 2gb
maxmemory-policy allkeys-lru

# Session 记忆缓存
tcp-keepalive 60
```

#### 数据库连接池

```typescript
// Memory System 专用连接池配置
const memoryDbConfig = {
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    // Memory queries can be long-running
    statement_timeout: 60000
  }
};
```

---

## 10. 参考资料

- [快速开始](../guides/getting-started.md)
- [Memory System 用户指南](../guides/memory-system.md)
- [平台架构设计](../architecture/platform-overview.md)
- [数据模型设计](../architecture/data-model.md)
- [API 设计](../api/openapi.yaml)
