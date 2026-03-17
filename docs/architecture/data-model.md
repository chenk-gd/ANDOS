# 数据模型设计

**Date:** 2026-03-14
**Status:** Draft
**Version:** 1.1
**Database:** PostgreSQL 14+

---

## 1. 设计原则

1. **MVP 优先**：单 PostgreSQL 实例满足全部需求
2. **可扩展性**：预留迁移到专用存储的路径（图数据库、时序数据库）
3. **一致性**：核心数据使用事务保证，分析数据允许最终一致

---

## 2. 核心概念

### 2.1 资产分层模型

资产按 DevOps 生命周期分层，每层只能依赖上层：

```
Layer 1: requirement    (需求层)
Layer 2: design         (设计层)
Layer 3: task           (任务层)
Layer 4: code           (代码层)
Layer 5: test           (测试层)
Layer 6: pipeline       (流水线层)
```

**依赖规则**：
- 下层资产可以依赖上层资产（如 design 依赖 requirement）
- 同层资产可以相互依赖（如 design 之间）
- 禁止反向依赖（如 requirement 依赖 design）

### 2.2 资产状态机

```
┌─────────┐    publish    ┌─────────┐
│  draft  │──────────────►│  clean  │
└────┬────┘               └───┬─────┘
     │                        │
     │ update                 │ upstream publish
     ▼                        ▼
┌─────────┐              ┌─────────┐
│  draft  │              │  dirty  │
└─────────┘              └────┬────┘
                              │
                              │ manual clean
                              ▼
                         ┌─────────┐
                         │  clean  │
                         └─────────┘
```

---

## 3. Schema 设计

### 3.1 Core Schema

#### assets（资产主表）

```sql
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,           -- requirement, design, code, etc.
    state VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, clean, dirty, archived
    current_version VARCHAR(50),
    project_id UUID NOT NULL REFERENCES projects(id),
    org_id UUID NOT NULL REFERENCES organizations(id),
    path LTREE,                          -- ltree路径，用于层级查询

    -- 软删除
    deleted_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 约束
    CONSTRAINT valid_type CHECK (type IN ('requirement', 'design', 'task', 'code', 'test', 'pipeline')),
    CONSTRAINT valid_state CHECK (state IN ('draft', 'clean', 'dirty', 'archived')),
    CONSTRAINT unique_slug_per_project UNIQUE (project_id, slug) WHERE deleted_at IS NULL
);

-- 索引
CREATE INDEX idx_assets_project ON assets(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_type ON assets(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_state ON assets(state) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_path ON assets USING GIST(path);
```

#### asset_versions（版本表）

```sql
CREATE TABLE asset_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),
    version VARCHAR(50) NOT NULL,
    content TEXT,                        -- 小内容直接存储
    content_ref VARCHAR(255),            -- 大内容存储引用（S3/Git）
    content_type VARCHAR(50) DEFAULT 'markdown', -- markdown, code, json
    changelog TEXT NOT NULL,
    state VARCHAR(20) DEFAULT 'draft',   -- draft, published, deprecated
    published_by UUID REFERENCES users(id),
    published_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_asset_version UNIQUE (asset_id, version),
    CONSTRAINT valid_version_state CHECK (state IN ('draft', 'published', 'deprecated'))
);

CREATE INDEX idx_versions_asset ON asset_versions(asset_id);
CREATE INDEX idx_versions_state ON asset_versions(state);
```

#### dependencies（依赖关系表）

```sql
CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_asset_id UUID NOT NULL REFERENCES assets(id),    -- 下游（依赖者）
    source_version VARCHAR(50) NOT NULL,
    target_asset_id UUID NOT NULL REFERENCES assets(id),    -- 上游（被依赖者）
    target_version VARCHAR(50) NOT NULL,

    -- 依赖确认
    confirmed_at TIMESTAMP WITH TIME ZONE,
    confirmed_by UUID REFERENCES users(id),
    auto_confirmed BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT no_self_dependency CHECK (source_asset_id != target_asset_id),
    CONSTRAINT unique_dependency UNIQUE (source_asset_id, source_version, target_asset_id)
);

CREATE INDEX idx_deps_source ON dependencies(source_asset_id, source_version);
CREATE INDEX idx_deps_target ON dependencies(target_asset_id, target_version);
```

#### dirty_sources（Dirty 来源表）

```sql
CREATE TABLE dirty_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),           -- 受影响资产
    asset_version VARCHAR(50) NOT NULL,
    upstream_asset_id UUID NOT NULL REFERENCES assets(id),  -- 上游资产
    upstream_version VARCHAR(50) NOT NULL,
    upstream_published_at TIMESTAMP WITH TIME ZONE NOT NULL,

    impact_level VARCHAR(20) NOT NULL,   -- high, medium, low, none
    impact_analysis JSONB,               -- AI分析结果

    status VARCHAR(20) DEFAULT 'pending', -- pending, acknowledged, resolved
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_impact CHECK (impact_level IN ('high', 'medium', 'low', 'none')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'acknowledged', 'resolved'))
);

CREATE INDEX idx_dirty_asset ON dirty_sources(asset_id, status);
CREATE INDEX idx_dirty_upstream ON dirty_sources(upstream_asset_id);
```

### 3.2 RBAC Schema

```sql
-- 组织层级（使用ltree）
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES organizations(id),
    path LTREE,                          -- ltree路径
    level INTEGER DEFAULT 1 CHECK (level BETWEEN 1 AND 3), -- 层级限制1-3
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_org_path ON organizations USING GIST(path);
CREATE INDEX idx_org_parent ON organizations(parent_id);

-- 项目表
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_project_org ON projects(org_id);
CREATE INDEX idx_project_status ON projects(status);

-- 用户
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_username UNIQUE (username),
    CONSTRAINT unique_email UNIQUE (email)
);

CREATE INDEX idx_user_org ON users(org_id);
CREATE INDEX idx_user_status ON users(status);

-- 角色
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]', -- ['asset:crud', 'version:r']
    is_system BOOLEAN DEFAULT FALSE,         -- 系统预定义角色
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 预定义角色（系统初始化时插入）
-- org_admin: ['org:*', 'project:*', 'user:*']
-- project_admin: ['asset:crud', 'version:crud', 'dependency:crud', 'webhook:crud', 'agent:crud', 'member:crud']
-- project_manager: ['asset:crud', 'version:crud', 'dependency:crud', 'webhook:r', 'agent:r', 'member:r']
-- product_manager: ['asset:cr', 'version:cru', 'dependency:r', 'agent:r']
-- developer: ['asset:cru', 'version:cru', 'dependency:cru', 'agent:cu']
-- tester: ['asset:r', 'version:r', 'dependency:r', 'agent:r']
-- qa: ['asset:r', 'version:r', 'dependency:r', 'webhook:r', 'agent:r']

-- 项目成员
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_member_project ON project_members(project_id);
CREATE INDEX idx_member_user ON project_members(user_id);

-- API Keys（用于服务间认证）
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,          -- 哈希后的key
    permissions JSONB NOT NULL DEFAULT '[]', -- 权限列表
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_apikey_project ON api_keys(project_id);
CREATE INDEX idx_apikey_expires ON api_keys(expires_at);
```

**权限矩阵：**

| 角色 | 资产 | 版本 | 依赖 | Webhook | 成员 | Agent |
|------|------|------|------|---------|------|-------|
| org_admin | 组织树内所有 | - | - | - | 所有 | - |
| project_admin | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |
| project_manager | CRUD | CRUD | CRUD | R | R | R |
| product_manager | CR | CRU | R | - | - | R |
| developer | CRU | CRU | CRU | - | - | CU |
| tester | R | R | R | - | - | R |
| qa | R | R | R | R | - | R |

**说明**: C=Create, R=Read, U=Update, D=Delete

### 3.3 Agent Schema

```sql
-- Agent 执行记录（按月分区）
CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    agent_id VARCHAR(255) NOT NULL,
    agent_type VARCHAR(50) NOT NULL,     -- primary, subagent
    parent_session_id VARCHAR(255),      -- subagent时使用

    status VARCHAR(50) NOT NULL,         -- running, completed, failed
    input TEXT,
    output TEXT,
    token_usage INTEGER DEFAULT 0,

    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 创建分区（示例）
CREATE TABLE agent_executions_2026_03 PARTITION OF agent_executions
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Agent 工具调用记录
CREATE TABLE agent_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES agent_executions(id),
    tool_name VARCHAR(255) NOT NULL,
    parameters JSONB,
    result JSONB,
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.4 State Transition Schema

```sql
-- 资产状态变更记录
CREATE TABLE asset_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),
    from_state VARCHAR(20) NOT NULL,
    to_state VARCHAR(20) NOT NULL,
    triggered_by VARCHAR(50),            -- user, system, agent
    triggered_by_user_id UUID REFERENCES users(id),
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transitions_asset ON asset_state_transitions(asset_id, created_at DESC);
CREATE INDEX idx_transitions_from ON asset_state_transitions(from_state, to_state);
```

### 3.5 Webhook Schema

```sql
-- Webhook 订阅
CREATE TABLE webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    secret VARCHAR(255),                 -- 签名密钥
    events JSONB NOT NULL,               -- ['asset.created', 'version.published']
    active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook 投递记录
CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,         -- pending, success, failed
    response_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 创建分区（示例）
CREATE TABLE webhook_deliveries_2026_03 PARTITION OF webhook_deliveries
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX idx_webhook_sub_project ON webhook_subscriptions(project_id);
CREATE INDEX idx_webhook_delivery_sub ON webhook_deliveries(subscription_id, status);
CREATE INDEX idx_webhook_delivery_created ON webhook_deliveries(created_at DESC);
```

### 3.6 Platform Events Schema

```sql
-- 平台事件（用于审计和实时推送）
CREATE TABLE platform_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,    -- asset.created, version.published, etc.
    resource_type VARCHAR(50) NOT NULL,  -- asset, version, dependency
    resource_id UUID NOT NULL,
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES users(id),
    payload JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 创建分区（示例）
CREATE TABLE platform_events_2026_03 PARTITION OF platform_events
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX idx_events_type ON platform_events(event_type, created_at DESC);
CREATE INDEX idx_events_resource ON platform_events(resource_type, resource_id);
CREATE INDEX idx_events_project ON platform_events(project_id, created_at DESC);
```

### 3.7 Audit Log Schema

```sql
-- 审计日志（关键操作记录）
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,        -- create, update, delete, export
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES users(id),
    changes JSONB,                       -- 变更前后对比
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- 创建分区（示例）
CREATE TABLE audit_logs_2026_03 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX idx_audit_action ON audit_logs(action, resource_type);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
```

---

## 4. 关键查询模式

### 4.1 依赖图谱查询（ltree）

```sql
-- 查询下游依赖（递归）
WITH RECURSIVE downstream AS (
    SELECT d.*, 1 as depth
    FROM dependencies d
    WHERE target_asset_id = :asset_id
      AND target_version = :version

    UNION ALL

    SELECT d.*, ds.depth + 1
    FROM dependencies d
    JOIN downstream ds ON d.target_asset_id = ds.source_asset_id
                       AND d.target_version = ds.source_version
    WHERE ds.depth < :max_depth
)
SELECT * FROM downstream;

-- 查询组织树
SELECT * FROM organizations
WHERE path ~ 'root.*'::lquery
ORDER BY path;
```

### 4.2 Dirty 队列查询

```sql
-- 获取项目的 dirty 资产列表
SELECT
    a.id,
    a.name,
    a.type,
    a.current_version,
    COUNT(ds.id) as dirty_count,
    MAX(ds.impact_level) as max_impact
FROM assets a
LEFT JOIN dirty_sources ds ON a.id = ds.asset_id AND ds.status = 'pending'
WHERE a.project_id = :project_id
  AND a.state = 'dirty'
  AND a.deleted_at IS NULL
GROUP BY a.id
ORDER BY max_impact DESC, dirty_count DESC;
```

### 4.3 循环依赖检测

```sql
-- 使用递归CTE检测循环依赖
WITH RECURSIVE dependency_chain AS (
    -- 起点：直接依赖
    SELECT
        source_asset_id,
        target_asset_id,
        ARRAY[source_asset_id] as path,
        source_asset_id = target_asset_id as is_cycle
    FROM dependencies
    WHERE source_asset_id = :asset_id

    UNION ALL

    -- 递归：继续追踪下游
    SELECT
        dc.source_asset_id,
        d.target_asset_id,
        dc.path || d.source_asset_id,
        d.target_asset_id = ANY(dc.path) as is_cycle
    FROM dependency_chain dc
    JOIN dependencies d ON dc.target_asset_id = d.source_asset_id
    WHERE NOT dc.is_cycle
      AND array_length(dc.path, 1) < 10
)
SELECT * FROM dependency_chain WHERE is_cycle = true;
```

### 4.4 资产版本对比

```sql
-- 对比两个版本的依赖差异
WITH old_deps AS (
    SELECT target_asset_id, target_version
    FROM dependencies
    WHERE source_asset_id = :asset_id
      AND source_version = :old_version
),
new_deps AS (
    SELECT target_asset_id, target_version
    FROM dependencies
    WHERE source_asset_id = :asset_id
      AND source_version = :new_version
)
SELECT
    COALESCE(o.target_asset_id, n.target_asset_id) as asset_id,
    CASE
        WHEN o.target_asset_id IS NULL THEN 'added'
        WHEN n.target_asset_id IS NULL THEN 'removed'
        WHEN o.target_version != n.target_version THEN 'updated'
        ELSE 'unchanged'
    END as change_type,
    o.target_version as old_version,
    n.target_version as new_version
FROM old_deps o
FULL OUTER JOIN new_deps n ON o.target_asset_id = n.target_asset_id
WHERE o.target_asset_id IS NULL
   OR n.target_asset_id IS NULL
   OR o.target_version != n.target_version;
```

### 4.5 影响范围查询

```sql
-- 查询资产变更影响的所有下游资产（带深度）
WITH RECURSIVE impact_tree AS (
    -- 起点
    SELECT
        d.source_asset_id as asset_id,
        d.source_version as version,
        1 as depth,
        ARRAY[d.source_asset_id::text] as path
    FROM dependencies d
    WHERE d.target_asset_id = :changed_asset_id
      AND d.target_version = :changed_version

    UNION ALL

    -- 递归下游
    SELECT
        d.source_asset_id,
        d.source_version,
        it.depth + 1,
        it.path || d.source_asset_id::text
    FROM impact_tree it
    JOIN dependencies d ON it.asset_id = d.target_asset_id
    WHERE it.depth < 5
      AND NOT d.source_asset_id::text = ANY(it.path)  -- 避免循环
)
SELECT
    it.asset_id,
    a.name,
    a.type,
    it.version,
    it.depth,
    it.path
FROM impact_tree it
JOIN assets a ON it.asset_id = a.id
ORDER BY it.depth, a.type;

---

## 5. 触发器与函数

### 5.1 自动更新 updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 应用到各表
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 5.2 状态变更记录

```sql
-- 资产状态变更时自动记录
CREATE OR REPLACE FUNCTION record_asset_state_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.state IS DISTINCT FROM NEW.state THEN
        INSERT INTO asset_state_transitions (
            asset_id, from_state, to_state,
            triggered_by, reason
        ) VALUES (
            NEW.id, OLD.state, NEW.state,
            COALESCE(current_setting('app.triggered_by', true), 'system'),
            current_setting('app.transition_reason', true)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER asset_state_change
    AFTER UPDATE OF state ON assets
    FOR EACH ROW
    EXECUTE FUNCTION record_asset_state_transition();
```

### 5.3 ltree 路径自动维护

```sql
-- 组织层级路径自动更新
CREATE OR REPLACE FUNCTION update_org_path()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.path = NEW.id::text::ltree;
    ELSE
        SELECT path || NEW.id::text::ltree
        INTO NEW.path
        FROM organizations
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_path_update
    BEFORE INSERT OR UPDATE OF parent_id ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_org_path();
```

---

## 6. 分区策略

| 表名 | 分区键 | 分区策略 | 保留策略 |
|------|--------|----------|----------|
| `agent_executions` | `created_at` | 按月分区 | 保留6个月 |
| `agent_tool_calls` | `created_at` | 按月分区 | 保留6个月 |
| `platform_events` | `created_at` | 按月分区 | 保留3个月 |
| `webhook_deliveries` | `created_at` | 按月分区 | 保留3个月 |
| `audit_logs` | `created_at` | 按月分区 | 保留12个月 |

---

## 7. 扩展路径

| 场景 | 当前方案 | 未来扩展 |
|------|----------|----------|
| **图查询** | PostgreSQL ltree + 递归CTE | Neo4j / AGE |
| **全文搜索** | PostgreSQL trigram | Elasticsearch |
| **时序数据** | PostgreSQL + 分区 | TimescaleDB |
| **大内容存储** | S3/MinIO | - |

---

## 8. 参考资料

- [平台架构设计](./platform-overview.md)
- [Agent 系统设计](./agent-system.md)
- [API 设计](../api/openapi.yaml)
- [实施路线图](../plans/implementation-roadmap.md)
