# 数据库设计文档

**Date:** 2026-03-13
**Status:** Draft
**Version:** 1.0
**Database:** PostgreSQL 14+

---

## 1. 设计原则

1. **MVP 优先**：单 PostgreSQL 实例满足全部需求
2. **可扩展性**：预留迁移到专用存储的路径（图数据库、时序数据库）
3. **一致性**：核心数据使用事务保证，分析数据允许最终一致
4. **版本化**：所有变更表保留历史版本

---

## 2. 数据库架构

```
┌─────────────────────────────────────────────────────────┐
│                   PostgreSQL (单实例)                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │              核心数据 (Core Schema)                │  │
│  │  assets · versions · dependencies · states        │  │
│  │  要求: 强一致、事务、高可用                          │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
│  ┌───────────────────────┼──────────────────────────┐  │
│  ▼                       ▼                          ▼  │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │  Agent   │    │   时序数据    │    │    配置      │ │
│  │  执行    │    │   (轻量)      │    │   元数据     │ │
│  │  记录    │    │              │    │             │ │
│  └──────────┘    └──────────────┘    └──────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘

后期扩展:
- 图数据 → Neo4j/AGE (依赖关系分析)
- 时序数据 → TimescaleDB (执行日志)
- 搜索 → Elasticsearch (全文检索)
```

---

## 3. Schema 设计

### 3.1 Core Schema - 资产与版本

```sql
-- 资产主表
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,           -- URL友好的标识
    description TEXT,
    tags VARCHAR(100)[],                -- PG数组类型
    type VARCHAR(50) NOT NULL,          -- requirement/design/code/test/pipeline

    -- 当前状态
    current_version VARCHAR(50),
    state VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft', 'clean', 'dirty', 'modified', 'archived')),

    -- 归属
    owners UUID[],                      -- 责任人列表
    team_id UUID,                       -- 所属团队
    project_id UUID NOT NULL,           -- 所属项目

    -- 自动审批配置
    auto_approval_enabled BOOLEAN DEFAULT false,
    auto_approval_threshold VARCHAR(20) CHECK (auto_approval_threshold IN ('off', 'high', 'medium', 'low')),

    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,

    -- 软删除（P0：防止误删）
    deleted_at TIMESTAMPTZ,
    deleted_by UUID,

    -- 部分唯一索引：允许删除后复用 slug
    CONSTRAINT uq_asset_slug_active UNIQUE (project_id, slug)
        WHERE (deleted_at IS NULL)
);

-- 资产版本表
CREATE TABLE asset_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,  -- P0：改为 RESTRICT，应用层软删
    version VARCHAR(50) NOT NULL,

    -- 内容引用（实际内容存储在Git/S3）
    content_ref VARCHAR(500) NOT NULL,   -- commit_hash 或 s3://bucket/key
    content_hash VARCHAR(64),            -- 用于去重验证
    content_size BIGINT,                 -- 内容大小（字节）

    -- 变更说明
    changelog TEXT NOT NULL,
    changelog_summary VARCHAR(500),      -- AI生成的摘要

    -- 发布信息
    state VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft', 'published', 'deprecated')),
    published_at TIMESTAMPTZ,
    published_by UUID,

    -- 创建信息
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,

    UNIQUE(asset_id, version)
);

-- 资产元数据扩展表（JSONB灵活存储）
CREATE TABLE asset_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    version VARCHAR(50),                -- NULL表示当前资产级元数据

    -- 扩展字段
    metadata JSONB NOT NULL DEFAULT '{}',

    -- 类型化索引字段（从JSONB提取，用于查询）
    priority VARCHAR(20),               -- 优先级
    status VARCHAR(50),                 -- 业务状态
    due_date TIMESTAMPTZ,               -- 截止日期
    estimated_effort INTEGER,           -- 预估工时

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(asset_id, version)
);
```

### 3.2 Core Schema - 依赖关系

```sql
-- 依赖关系表（MVP使用，后期可迁移到图数据库）
CREATE TABLE dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 源资产（下游，依赖者）
    source_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,  -- P0：RESTRICT 防止级联误删
    source_version VARCHAR(50) NOT NULL,

    -- 目标资产（上游，被依赖者）
    target_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    target_version VARCHAR(50) NOT NULL,

    -- 确认信息
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID,
    auto_confirmed BOOLEAN DEFAULT false,

    -- 创建信息
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,

    -- 约束：防止重复依赖
    UNIQUE(source_asset_id, source_version, target_asset_id, target_version)
);

-- 依赖关系变更历史（审计）
CREATE TABLE dependency_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dependency_id UUID,

    source_asset_id UUID NOT NULL,
    source_version VARCHAR(50) NOT NULL,
    target_asset_id UUID NOT NULL,
    target_version VARCHAR(50) NOT NULL,

    operation VARCHAR(20) NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by UUID,
    reason TEXT
);

-- P1：启用 ltree 扩展，使用物化路径替代递归 CTE
CREATE EXTENSION IF NOT EXISTS ltree;

-- 资产路径表（物化路径，避免递归查询）
CREATE TABLE asset_paths (
    asset_id UUID PRIMARY KEY REFERENCES assets(id),
    path LTREE NOT NULL,                    -- 如 '0001.0003.0005.0009'（使用短ID节省空间）
    root_id UUID NOT NULL,                  -- 根节点（requirement）
    depth INTEGER NOT NULL DEFAULT 0,       -- 深度（根为0）

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ltree 索引：支持祖先/后代查询
CREATE INDEX idx_asset_paths_path ON asset_paths USING GIST (path);
CREATE INDEX idx_asset_paths_root ON asset_paths (root_id);

/*
-- ltree 查询示例（替代递归 CTE）：

-- 1. 查询所有上游（路径包含当前资产前缀）
SELECT a.*
FROM assets a
JOIN asset_paths ap ON a.id = ap.asset_id
WHERE ap.path @> (SELECT path FROM asset_paths WHERE asset_id = :target_id);

-- 2. 查询所有下游（路径是子路径）
SELECT a.*
FROM assets a
JOIN asset_paths ap ON a.id = ap.asset_id
WHERE ap.path <@ (SELECT path FROM asset_paths WHERE asset_id = :source_id);

-- 3. 查询直接子节点（depth = 当前 + 1）
SELECT a.*
FROM assets a
JOIN asset_paths ap ON a.id = ap.asset_id
WHERE ap.path ~ (SELECT path::text || '.*{1}' FROM asset_paths WHERE asset_id = :source_id);
*/
```

### 3.3 Core Schema - 状态管理

```sql
-- 资产状态变更历史
CREATE TABLE asset_state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    version VARCHAR(50),                -- NULL表示资产级状态变更

    from_state VARCHAR(20) NOT NULL,
    to_state VARCHAR(20) NOT NULL,

    -- 触发来源
    triggered_by VARCHAR(100) NOT NULL, -- user/system/agent/event
    actor_id UUID,                      -- 操作人（user/agent）
    actor_type VARCHAR(20),             -- user/agent

    -- 上下文
    upstream_asset_id UUID,             -- 触发dirty的上游资产
    upstream_version VARCHAR(50),

    reason TEXT,
    metadata JSONB,                     -- 扩展信息

    transitioned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dirty 来源队列（每个资产的待处理上游变更）
CREATE TABLE dirty_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,

    -- 上游变更来源
    upstream_asset_id UUID NOT NULL REFERENCES assets(id),
    upstream_version VARCHAR(50) NOT NULL,
    upstream_published_at TIMESTAMPTZ,

    -- 影响分析
    impact_level VARCHAR(20) CHECK (impact_level IN ('high', 'medium', 'low', 'none')),
    impact_analysis JSONB,              -- AI分析结果

    -- 处理状态
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'processing', 'resolved')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    UNIQUE(asset_id, upstream_asset_id, upstream_version)
);
```

### 3.4 Agent Schema - Agent 与执行

```sql
-- Agent 定义
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,  -- P0：统一命名（原 agent_id），对外使用 slug
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- 能力
    capabilities VARCHAR(100)[],        -- 能力列表
    trigger_mode VARCHAR(50) CHECK (trigger_mode IN ('event', 'schedule', 'manual')),
    subscribed_events VARCHAR(100)[],    -- 订阅的事件类型

    -- 配置
    config JSONB DEFAULT '{}',
    model_config JSONB,                 -- 模型配置
    prompt_template TEXT,               -- 系统提示模板

    -- 状态
    status VARCHAR(20) DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- P0：立即启用分区（年增 1000 万+，必须分区）
CREATE TABLE agent_executions (
    id UUID NOT NULL,
    execution_id UUID UNIQUE NOT NULL,  -- 外部引用ID

    agent_slug VARCHAR(100) NOT NULL REFERENCES agents(slug),  -- P0：改为 slug
    session_id UUID,                    -- 所属会话
    parent_execution_id UUID,           -- 父执行（Subagent）

    -- 触发信息
    trigger_event_type VARCHAR(100),
    trigger_event_payload JSONB,
    source_asset_id UUID,               -- 触发的资产

    -- 上下文（执行时的快照）
    context_snapshot JSONB,             -- upstream_assets, dependency_graph等
    context_ref VARCHAR(500),           -- P1：大上下文存外部存储(S3)
    context_size INTEGER,               -- P1：上下文大小

    -- 执行结果
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'pending_approval', 'cancelled')),
    outputs JSONB,                      -- 输出内容
    actions JSONB,                      -- 请求的操作
    confidence FLOAT,
    reasoning TEXT,

    -- 性能指标
    started_at TIMESTAMPTZ NOT NULL,    -- P0：分区键
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    token_used INTEGER,

    -- 错误信息
    error_code VARCHAR(50),
    error_message TEXT,
    stack_trace TEXT,

    -- 主键包含分区键
    PRIMARY KEY (id, started_at)
) PARTITION BY RANGE (started_at);

-- P0：预创建分区（应用层自动管理）
CREATE TABLE agent_execs_2026_03 PARTITION OF agent_executions
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE agent_execs_2026_04 PARTITION OF agent_executions
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- ... 每月自动创建新分区

/*
-- 使用 pg_partman 自动管理（推荐生产环境）
SELECT partman.create_parent('public.agent_executions', 'started_at', 'native', 'monthly');

-- 配置自动归档（保留12个月）
UPDATE partman.part_config
SET retention = '12 months',
    retention_keep_table = false,
    retention_keep_index = false
WHERE parent_table = 'public.agent_executions';
*/

-- Agent 审批记录
CREATE TABLE agent_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES agent_executions(execution_id),

    -- 审批信息
    level INTEGER NOT NULL,             -- 审批层级
    approver_id UUID,                   -- 审批人
    approver_type VARCHAR(20),          -- user/system

    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'rejected', 'timeout')),
    feedback TEXT,                      -- 反馈/原因

    -- 自动检查规则结果
    auto_checks JSONB,                  -- [{rule, passed, message}]

    created_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ
);
```

### 3.5 Agent Schema - Session 与 Skill

```sql
-- Agent 会话
CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL,

    agent_slug VARCHAR(100) NOT NULL REFERENCES agents(slug),  -- P0：改为 slug
    parent_session_id UUID REFERENCES agent_sessions(session_id), -- Subagent

    -- 状态
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'expired')),

    -- 上下文
    context_assets UUID[],              -- 关联的资产ID列表
    skill_snapshot JSONB,               -- 会话开始时加载的Skill

    -- 统计
    turn_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- 存储路径（JSONL文件）
    transcript_path VARCHAR(500)
);

-- Skill 定义
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    version VARCHAR(50) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,

    -- 来源
    source VARCHAR(50) NOT NULL CHECK (source IN ('bundled', 'managed', 'workspace', 'remote')),
    source_path VARCHAR(500),           -- 本地路径或URL

    -- 元数据（用于gating）
    manifest JSONB,                     -- SKILL.md frontmatter
    requires_bins VARCHAR(100)[],
    requires_env VARCHAR(100)[],
    requires_config VARCHAR(100)[],

    -- 工具定义
    tool_definitions JSONB,             -- [{name, description, parameters}]

    -- 状态
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'ineligible')),
    ineligible_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent-Skill 关联
CREATE TABLE agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_slug VARCHAR(100) NOT NULL REFERENCES agents(slug),  -- P0：改为 slug
    skill_id UUID NOT NULL REFERENCES skills(id),

    -- 覆盖配置
    config_override JSONB,
    enabled BOOLEAN DEFAULT true,

    UNIQUE(agent_id, skill_id)
);
```

### 3.6 Event Schema - 事件与通知

```sql
-- P0：事件总线表立即分区（年增 5000 万+）
CREATE TABLE platform_events (
    id UUID NOT NULL,
    event_id UUID UNIQUE NOT NULL,

    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(50),         -- asset/agent/stage
    aggregate_id UUID,                  -- 关联的实体ID

    payload JSONB NOT NULL,
    payload_hash VARCHAR(64),           -- 完整性校验

    -- 发布信息
    published_at TIMESTAMPTZ NOT NULL,  -- P0：分区键
    published_by VARCHAR(100),          -- service/agent/user

    -- 消费追踪
    processed_by VARCHAR(100)[],        -- 已处理的消费者
    processing_status VARCHAR(20) DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

    -- 重试信息
    retry_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,

    -- 主键包含分区键
    PRIMARY KEY (id, published_at)
) PARTITION BY RANGE (published_at);

-- P0：预创建分区
CREATE TABLE platform_events_2026_03 PARTITION OF platform_events
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE platform_events_2026_04 PARTITION OF platform_events
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- 通知记录
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    recipient_id UUID NOT NULL,         -- 接收人
    recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('user', 'agent', 'team')),

    -- 通知内容
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    content TEXT,

    -- 关联上下文
    related_asset_id UUID,
    related_event_id UUID,
    action_url VARCHAR(500),

    -- 状态
    status VARCHAR(20) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'acknowledged')),

    -- 渠道
    channels VARCHAR(50)[],             -- email/webhook/slack等
    delivery_status JSONB,              -- {channel: status}

    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);
```

### 3.7 配置与用户 Schema

```sql
-- 项目配置
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    description TEXT,

    -- DAG 配置
    dependency_rules JSONB,             -- {allow_cross_layer: false, ...}
    stage_config JSONB,                 -- 环节配置

    -- 状态
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 环节配置（项目级别）
CREATE TABLE stage_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),

    stage_name VARCHAR(50) NOT NULL,    -- requirement/design/code
    next_stage VARCHAR(50),

    delegation_mode VARCHAR(20) CHECK (delegation_mode IN ('manual', 'agent', 'hybrid')),
    default_agent_slug VARCHAR(100) REFERENCES agents(slug),  -- P0：改为 slug
    auto_execute BOOLEAN DEFAULT false,
    approval_chain JSONB,               -- [{level, approvers}]

    UNIQUE(project_id, stage_name)
);

-- 用户与权限
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    display_name VARCHAR(255),

    -- P1：时区与国际化
    timezone VARCHAR(50) DEFAULT 'UTC',
    locale VARCHAR(10) DEFAULT 'zh-CN',

    preferences JSONB,                  -- 用户偏好设置

    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 团队成员
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50),

    UNIQUE(team_id, user_id)
);

-- 资产权限
CREATE TABLE asset_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),

    -- 权限主体
    principal_id UUID NOT NULL,         -- user_id 或 team_id
    principal_type VARCHAR(20) NOT NULL CHECK (principal_type IN ('user', 'team')),

    -- 权限
    permission VARCHAR(50) NOT NULL,    -- read/write/publish/admin
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID,
    expires_at TIMESTAMPTZ,

    UNIQUE(asset_id, principal_id, permission)
);
```

---

## 4. 索引设计

```sql
-- 资产表索引
CREATE INDEX idx_assets_project ON assets(project_id);
CREATE INDEX idx_assets_type ON assets(type);
CREATE INDEX idx_assets_state ON assets(state);
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX idx_assets_owners ON assets USING GIN(owners);
CREATE INDEX idx_assets_updated ON assets(updated_at DESC);

-- 版本表索引
CREATE INDEX idx_versions_asset ON asset_versions(asset_id, version);
CREATE INDEX idx_versions_published ON asset_versions(published_at DESC);
CREATE INDEX idx_versions_state ON asset_versions(state);

-- 依赖关系索引
CREATE INDEX idx_deps_source ON dependencies(source_asset_id, source_version);
CREATE INDEX idx_deps_target ON dependencies(target_asset_id, target_version);

-- 状态变更索引
CREATE INDEX idx_state_transitions_asset ON asset_state_transitions(asset_id, transitioned_at DESC);
CREATE INDEX idx_state_transitions_to ON asset_state_transitions(to_state, transitioned_at);

-- Dirty 队列索引
CREATE INDEX idx_dirty_sources_asset ON dirty_sources(asset_id, status);
CREATE INDEX idx_dirty_sources_upstream ON dirty_sources(upstream_asset_id, upstream_version);

-- Agent 执行索引
CREATE INDEX idx_agent_execs_agent ON agent_executions(agent_slug, started_at DESC);
CREATE INDEX idx_agent_execs_session ON agent_executions(session_id);
CREATE INDEX idx_agent_execs_status ON agent_executions(status, started_at);
CREATE INDEX idx_agent_execs_asset ON agent_executions(source_asset_id, started_at);

-- P1：JSONB 部分索引（减少索引大小）
CREATE INDEX idx_agent_execs_context ON agent_executions
USING GIN ((context_snapshot->'upstream_assets'))
WHERE (context_snapshot->'upstream_assets') IS NOT NULL;

-- P1：针对常用查询的表达式索引
CREATE INDEX idx_dirty_impact ON dirty_sources((impact_analysis->>'severity'))
WHERE impact_analysis IS NOT NULL;

-- 事件索引
CREATE INDEX idx_events_type ON platform_events(event_type, published_at DESC);
CREATE INDEX idx_events_aggregate ON platform_events(aggregate_type, aggregate_id, published_at DESC);
CREATE INDEX idx_events_status ON platform_events(processing_status, next_retry_at);

-- JSONB 索引示例（针对常用查询字段）
CREATE INDEX idx_assets_metadata ON assets USING GIN(metadata);

-- P1：移除通用 GIN，改为部分索引（已移到上面）
```

---

## 5. 分区策略（P0：MVP 立即启用）

> **关键调整**：`agent_executions`（年增 1000 万+）和 `platform_events`（年增 5000 万+）从**建表时就启用分区**，避免后期在线迁移风险。

```yaml
# 应用层连接池配置（P1：读写分离）
database:
  primary:
    host: pg-primary.internal
    port: 5432
    pool_size: 20
    max_overflow: 10
    pool_timeout: 30

  replica:
    host: pg-replica.internal
    port: 5432
    pool_size: 50      # 读多写少，读库连接更多
    max_overflow: 20

  routing:
    # 自动路由策略
    writes: primary
    reads: replica      # 非实时查询走从库
    realtime_reads: primary  # 刚写入的数据查主库

  # 查询路由示例
  query_routing:
    # 实时性要求高的查询强制走主库
    getAssetWithLatestState: primary
    getDirtyQueue: primary

    # 报表查询可走从库
    getExecutionStats: replica
    getAssetHistory: replica
```

**分区表列表：**

| 表名 | 分区策略 | 分区键 | 预创建 |
|------|----------|--------|--------|
| agent_executions | RANGE | started_at | 按月，预创建未来3个月 |
| platform_events | RANGE | published_at | 按月，预创建未来3个月 |

```sql
-- 自动分区管理（使用 pg_partman）
SELECT partman.create_parent('public.agent_executions', 'started_at', 'native', 'monthly');

-- 配置自动归档（保留12个月）
UPDATE partman.part_config
SET retention = '12 months',
    retention_keep_table = false,
    retention_keep_index = false
WHERE parent_table = 'public.agent_executions';

-- 历史数据归档脚本
-- 每月自动执行：detach 旧分区 → 压缩 → 转存冷存储 → 删除
```

---

## 6. 迁移策略

### 6.1 图数据库迁移（依赖关系）

```sql
-- 创建迁移视图
CREATE VIEW dependency_graph_export AS
SELECT
    source_asset_id as from_id,
    source_version as from_version,
    target_asset_id as to_id,
    target_version as to_version,
    created_at as created_at
FROM dependencies
WHERE created_at > :last_sync_time;

-- 使用逻辑复制或CDC（Debezium）同步到Neo4j/AGE
```

---

## 6.3 软删除与数据清理（P0）

**软删除机制**：

```typescript
// AssetService.ts - 软删除资产
async softDeleteAsset(assetId: string, userId: string): Promise<void> {
    await this.db.transaction(async (trx) => {
        // 1. 标记资产为已删除
        await trx('assets')
            .where('id', assetId)
            .update({
                deleted_at: new Date(),
                deleted_by: userId,
                state: 'archived'
            });

        // 2. 清理关联的 dirty_sources
        await trx('dirty_sources')
            .where('asset_id', assetId)
            .orWhere('upstream_asset_id', assetId)
            .delete();

        // 3. 发布删除事件（异步清理执行）
        await this.eventBus.publish('asset.deleted', {
            assetId,
            deletedBy: userId,
            gracePeriod: '30d'  // 30天后物理删除
        });
    });
}

// 异步清理服务（30天后物理删除）
async cleanupSoftDeletedAssets(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const toDelete = await this.db('assets')
        .where('deleted_at', '<', cutoff)
        .select('id');

    // 级联清理关联表（应用层控制，可审计）
    for (const asset of toDelete) {
        await this.db.transaction(async (trx) => {
            // 1. 删除版本记录
            await trx('asset_versions')
                .where('asset_id', asset.id)
                .delete();

            // 2. 删除依赖关系
            await trx('dependencies')
                .where('source_asset_id', asset.id)
                .orWhere('target_asset_id', asset.id)
                .delete();

            // 3. 删除路径记录
            await trx('asset_paths')
                .where('asset_id', asset.id)
                .delete();

            // 4. 删除元数据
            await trx('asset_metadata')
                .where('asset_id', asset.id)
                .delete();

            // 5. 最后删除资产本身
            await trx('assets').where('id', asset.id).delete();
        });
    }
}
```

---

## 7. 数据质量监控（P1）

```sql
-- 数据质量检查表
CREATE TABLE data_quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    check_name VARCHAR(100) NOT NULL,
    check_query TEXT NOT NULL,
    expected_result JSONB,
    actual_result JSONB,
    passed BOOLEAN,
    checked_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(table_name, check_name, checked_at)
);

-- 定期执行数据质量检查
INSERT INTO data_quality_checks (table_name, check_name, check_query, passed)
SELECT
    'assets' as table_name,
    'orphan_versions_check' as check_name,
    'SELECT count(*) FROM asset_versions av LEFT JOIN assets a ON av.asset_id = a.id WHERE a.id IS NULL' as check_query,
    NOT EXISTS (
        SELECT 1 FROM asset_versions av
        LEFT JOIN assets a ON av.asset_id = a.id
        WHERE a.id IS NULL
    ) as passed;

-- 常见数据质量检查项：
-- 1. 孤立版本（version 无主 asset）
-- 2. 循环依赖（dependencies 中出现循环）
-- 3. 未关闭的 dirty_sources（asset 已 clean 但 dirty_sources 未清理）
-- 4. 超时的 agent_executions（status='running' 但 started_at 超过 1 小时）
```

### 6.2 时序数据库迁移（Agent执行日志）

```sql
-- 创建归档策略
-- 1. 原表保留最近7天
-- 2. 历史数据迁移到TimescaleDB
-- 3. 使用pg_dump导出，timescaledb-parallel-copy导入

-- 连续聚合示例（在TimescaleDB中）
CREATE MATERIALIZED VIEW agent_execs_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', started_at) as bucket,
    agent_id,
    count(*) as exec_count,
    avg(duration_ms) as avg_duration,
    sum(token_used) as total_tokens
FROM agent_executions
GROUP BY bucket, agent_id;
```

---

## 7. 关键查询示例

```sql
-- 1. 查询资产及其完整依赖链（递归CTE）
WITH RECURSIVE dependency_chain AS (
    -- 起始资产
    SELECT
        target_asset_id as asset_id,
        target_version as version,
        0 as depth
    FROM dependencies
    WHERE source_asset_id = :asset_id

    UNION ALL

    -- 递归上游
    SELECT
        d.target_asset_id,
        d.target_version,
        dc.depth + 1
    FROM dependencies d
    JOIN dependency_chain dc ON d.source_asset_id = dc.asset_id
    WHERE dc.depth < 10  -- 防止循环
)
SELECT * FROM dependency_chain;

-- 2. 查询需要处理的 dirty 资产（按优先级排序）
SELECT
    a.id,
    a.name,
    a.type,
    COUNT(ds.id) as dirty_count,
    MAX(ds.impact_level) as max_impact
FROM assets a
JOIN dirty_sources ds ON a.id = ds.asset_id
WHERE ds.status = 'pending'
GROUP BY a.id
ORDER BY
    CASE MAX(ds.impact_level)
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
    END,
    COUNT(ds.id) DESC;

-- 3. 查询 Agent 执行统计（最近30天）
SELECT
    agent_id,
    status,
    COUNT(*) as exec_count,
    AVG(duration_ms) as avg_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration
FROM agent_executions
WHERE started_at > NOW() - INTERVAL '30 days'
GROUP BY agent_id, status;

-- 4. 查询资产版本演进路径
SELECT
    v.version,
    v.state,
    v.published_at,
    st.from_state,
    st.to_state,
    st.transitioned_at,
    st.actor_id
FROM asset_versions v
LEFT JOIN asset_state_transitions st
    ON v.asset_id = st.asset_id
    AND v.version = st.version
WHERE v.asset_id = :asset_id
ORDER BY v.published_at, st.transitioned_at;
```

---

## 8. 性能预估与容量规划

| 表 | 预估行数（年） | 增长策略 | 分区策略 | 状态 |
|-----|---------------|---------|---------|------|
| assets | 10万 | 正常增长 | 无需分区 | ✅ 软删除支持 |
| asset_versions | 100万 | 线性增长 | 无需分区 | ✅ RESTRICT 外键 |
| dependencies | 500万 | 快速增长 | 无需分区（后期转图库） | ✅ ltree 物化路径 |
| asset_paths | 10万 | 与 assets 同步 | 无需分区 | ✅ ltree 索引 |
| **agent_executions** | **1000万+** | **快速增长** | **按月分区（MVP启用）** | **✅ 已分区** |
| **platform_events** | **5000万+** | **快速增长** | **按月分区（MVP启用）** | **✅ 已分区** |
| notifications | 1000万 | 快速增长 | 按时间分区，定期归档 | ⏳ V1.0 启用 |

**关键调整：**
- `agent_executions` 和 `platform_events` 从**MVP阶段即启用分区**，避免后期在线迁移
- 使用 `pg_partman` 自动管理分区创建和归档
- 软删除机制保护核心数据，30天后异步物理清理

---

## 10. 业务逻辑实现（P0：应用层为主，DB层仅保留审计）

> **关键调整**：复杂的业务逻辑（如 dirty 传播）从 PostgreSQL 存储过程迁移到应用层，数据库仅保留数据一致性触发器。

### 10.1 应用层业务逻辑（推荐）

```typescript
// AssetService.ts - 发布版本并传播 dirty
async publishVersion(assetId: string, version: string, userId: string): Promise<void> {
    return await this.db.transaction(async (trx) => {
        // 1. 更新版本状态
        await trx('asset_versions')
            .where({ asset_id: assetId, version })
            .update({
                state: 'published',
                published_at: new Date(),
                published_by: userId
            });

        // 2. 更新资产当前版本和状态
        await trx('assets')
            .where('id', assetId)
            .update({
                current_version: version,
                state: 'clean',
                updated_at: new Date()
            });

        // 3. 查询直接依赖者（应用层控制，更易优化）
        const downstreamAssets = await trx('dependencies')
            .where({ target_asset_id: assetId })
            .select('source_asset_id');

        // 4. 批量更新下游状态（单条 UPDATE，避免触发器递归）
        if (downstreamAssets.length > 0) {
            const downstreamIds = downstreamAssets.map(d => d.source_asset_id);

            await trx('assets')
                .whereIn('id', downstreamIds)
                .update({
                    state: 'dirty',
                    updated_at: new Date()
                });

            // 5. 批量插入 dirty_sources
            await trx('dirty_sources').insert(
                downstreamAssets.map(d => ({
                    asset_id: d.source_asset_id,
                    upstream_asset_id: assetId,
                    upstream_version: version,
                    upstream_published_at: new Date(),
                    status: 'pending',
                    created_at: new Date()
                }))
            );
        }

        // 6. 发布事件（应用层控制事务边界）
        await this.eventBus.publish('asset.version.published', {
            assetId,
            version,
            downstreamCount: downstreamAssets.length
        });
    });
}

// AssetService.ts - 手动 clean 资产
async cleanAssetManually(
    assetId: string,
    version: string,
    userId: string,
    options: { updateDependencies?: boolean; reason?: string }
): Promise<{ updatedDependencies: number }> {
    return await this.db.transaction(async (trx) => {
        // 1. 验证资产当前为 dirty 状态
        const asset = await trx('assets')
            .where('id', assetId)
            .first('state');

        if (asset.state !== 'dirty') {
            throw new Error(`Asset ${assetId} is not in dirty state`);
        }

        // 2. 获取当前依赖的快照
        const currentDeps = await trx('dependencies')
            .where({ source_asset_id: assetId, source_version: version })
            .select('target_asset_id', 'target_version');

        let updatedCount = 0;

        if (options.updateDependencies) {
            // 3. 查询上游最新版本
            for (const dep of currentDeps) {
                const latestVersion = await trx('asset_versions')
                    .where('asset_id', dep.target_asset_id)
                    .where('state', 'published')
                    .orderBy('published_at', 'desc')
                    .first('version');

                if (latestVersion && latestVersion.version !== dep.target_version) {
                    // 4. 更新依赖版本
                    await trx('dependencies')
                        .where({
                            source_asset_id: assetId,
                            source_version: version,
                            target_asset_id: dep.target_asset_id
                        })
                        .update({
                            target_version: latestVersion.version,
                            confirmed_at: new Date(),
                            confirmed_by: userId,
                            auto_confirmed: false
                        });
                    updatedCount++;
                }
            }
        }

        // 5. 清理 dirty_sources 中已处理的来源
        await trx('dirty_sources')
            .where('asset_id', assetId)
            .whereIn('upstream_asset_id', currentDeps.map(d => d.target_asset_id))
            .update({
                status: 'resolved',
                resolved_at: new Date()
            });

        // 6. 检查是否还有未处理的 dirty 来源
        const remainingDirty = await trx('dirty_sources')
            .where('asset_id', assetId)
            .where('status', 'pending')
            .count('* as count')
            .first();

        // 7. 如果没有待处理来源，恢复 clean 状态
        if (remainingDirty.count === 0) {
            await trx('assets')
                .where('id', assetId)
                .update({
                    state: 'clean',
                    updated_at: new Date()
                });
        }

        return { updatedDependencies: updatedCount };
    });
}
```

### 10.2 数据库层保留的触发器（仅审计）

```sql
-- 触发器：状态变更审计（纯数据层）
CREATE OR REPLACE FUNCTION audit_state_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.state IS DISTINCT FROM NEW.state THEN
        INSERT INTO asset_state_transitions (
            asset_id,
            version,
            from_state,
            to_state,
            triggered_by,
            actor_id,
            actor_type,
            upstream_asset_id,
            upstream_version,
            reason,
            transitioned_at
        ) VALUES (
            NEW.id,
            NEW.current_version,
            OLD.state,
            NEW.state,
            COALESCE(current_setting('app.triggered_by', true), 'system'),
            COALESCE(current_setting('app.actor_id', true)::UUID, NULL),
            COALESCE(current_setting('app.actor_type', true), 'system'),
            COALESCE(current_setting('app.upstream_asset_id', true)::UUID, NULL),
            current_setting('app.upstream_version', true),
            current_setting('app.reason', true),
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 触发器：更新时间戳
CREATE TRIGGER tr_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 触发器：资产软删除时清理关联数据（仅标记，不物理删除）
CREATE OR REPLACE FUNCTION handle_asset_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        -- 清理待处理通知
        UPDATE notifications
        SET status = 'cancelled'
        WHERE related_asset_id = NEW.id
          AND status IN ('unread', 'read');

        -- 取消运行中的 Agent 任务
        UPDATE agent_executions
        SET status = 'cancelled',
            completed_at = NOW()
        WHERE source_asset_id = NEW.id
          AND status = 'running';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_assets_soft_delete
    AFTER UPDATE ON assets
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    EXECUTE FUNCTION handle_asset_soft_delete();
```

### 10.3 已移除的存储过程（迁移到应用层）

以下存储过程**不再使用**，业务逻辑已迁移到应用层：

- ~~`propagate_dirty_on_publish()`~~ → `AssetService.publishVersion()`
- ~~`clean_asset_manually()`~~ → `AssetService.cleanAssetManually()`
- ~~`check_circular_dependency()`~~ → `DAGService.validateNoCycle()`

**迁移理由**：
1. **可测试性**：应用层代码单元测试更简单
2. **可调试性**：错误堆栈清晰，支持断点调试
3. **版本控制**：业务逻辑与代码一起版本管理
4. **批量优化**：应用层可实现批量 UPDATE 代替逐行触发器
5. **复杂业务规则**：支持优先级队列、条件判断等复杂逻辑

### 10.1 状态传播核心逻辑

```sql
-- 存储过程：资产发布时触发下游dirty传播
CREATE OR REPLACE FUNCTION propagate_dirty_on_publish()
RETURNS TRIGGER AS $$
BEGIN
    -- 只有发布新版本时才触发dirty传播
    IF NEW.state = 'published' AND OLD.state != 'published' THEN
        -- 更新所有直接依赖者的状态为dirty
        UPDATE assets
        SET state = 'dirty',
            updated_at = NOW()
        WHERE id IN (
            SELECT source_asset_id
            FROM dependencies
            WHERE target_asset_id = NEW.asset_id
              AND target_version = NEW.version
        );

        -- 记录dirty来源
        INSERT INTO dirty_sources (
            asset_id,
            upstream_asset_id,
            upstream_version,
            upstream_published_at,
            created_at
        )
        SELECT
            d.source_asset_id,
            NEW.asset_id,
            NEW.version,
            NEW.published_at,
            NOW()
        FROM dependencies d
        WHERE d.target_asset_id = NEW.asset_id
          AND d.target_version = NEW.version
        ON CONFLICT (asset_id, upstream_asset_id, upstream_version) DO NOTHING;

        -- 发布事件到Event Bus
        INSERT INTO platform_events (
            event_id,
            event_type,
            aggregate_type,
            aggregate_id,
            payload,
            published_at
        ) VALUES (
            gen_random_uuid(),
            'asset.version.published',
            'asset',
            NEW.asset_id,
            jsonb_build_object(
                'asset_id', NEW.asset_id,
                'version', NEW.version,
                'downstream_count', (
                    SELECT COUNT(*) FROM dependencies
                    WHERE target_asset_id = NEW.asset_id
                )
            ),
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 触发器：版本发布时自动触发
CREATE TRIGGER tr_asset_version_published
    AFTER UPDATE ON asset_versions
    FOR EACH ROW
    WHEN (NEW.state = 'published' AND OLD.state != 'published')
    EXECUTE FUNCTION propagate_dirty_on_publish();
```

### 10.2 手动clean处理

```sql
-- 存储过程：手动clean资产（更新依赖版本，但不触发下游dirty）
CREATE OR REPLACE FUNCTION clean_asset_manually(
    p_asset_id UUID,
    p_version VARCHAR(50),
    p_user_id UUID
)
RETURNS TABLE (
    updated_count INTEGER,
    new_dependencies JSONB
) AS $$
DECLARE
    v_updated INTEGER := 0;
    v_deps JSONB;
BEGIN
    -- 获取上游最新版本
    SELECT jsonb_agg(jsonb_build_object(
        'asset_id', d.target_asset_id,
        'version', av.version
    ))
    INTO v_deps
    FROM dependencies d
    JOIN asset_versions av ON d.target_asset_id = av.asset_id
    WHERE d.source_asset_id = p_asset_id
      AND d.source_version = p_version
      AND av.state = 'published'
      AND av.published_at = (
          SELECT MAX(published_at)
          FROM asset_versions
          WHERE asset_id = av.asset_id
            AND state = 'published'
      );

    -- 更新依赖关系中的版本号
    UPDATE dependencies
    SET target_version = (
        SELECT version
        FROM asset_versions
        WHERE asset_id = dependencies.target_asset_id
          AND state = 'published'
        ORDER BY published_at DESC
        LIMIT 1
    ),
    confirmed_at = NOW(),
    confirmed_by = p_user_id,
    auto_confirmed = false
    WHERE source_asset_id = p_asset_id
      AND source_version = p_version;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- 从dirty_sources中移除已处理的来源
    DELETE FROM dirty_sources
    WHERE asset_id = p_asset_id;

    -- 更新资产状态为clean
    UPDATE assets
    SET state = 'clean',
        updated_at = NOW()
    WHERE id = p_asset_id;

    -- 记录状态变更
    INSERT INTO asset_state_transitions (
        asset_id,
        version,
        from_state,
        to_state,
        triggered_by,
        actor_id,
        actor_type,
        reason
    ) VALUES (
        p_asset_id,
        p_version,
        'dirty',
        'clean',
        'user',
        p_user_id,
        'user',
        'Manual clean: updated dependencies to latest versions'
    );

    RETURN QUERY SELECT v_updated, COALESCE(v_deps, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;
```

### 10.3 状态变更审计触发器

```sql
-- 触发器函数：记录所有状态变更
CREATE OR REPLACE FUNCTION audit_state_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- 只在状态变化时记录
    IF OLD.state IS DISTINCT FROM NEW.state THEN
        INSERT INTO asset_state_transitions (
            asset_id,
            version,
            from_state,
            to_state,
            triggered_by,
            actor_id,
            actor_type,
            reason,
            transitioned_at
        ) VALUES (
            NEW.id,
            NEW.current_version,
            OLD.state,
            NEW.state,
            COALESCE(current_setting('app.triggered_by', true), 'system'),
            COALESCE(current_setting('app.actor_id', true)::UUID, NULL),
            COALESCE(current_setting('app.actor_type', true), 'system'),
            COALESCE(current_setting('app.transition_reason', true), 'State changed'),
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用到资产表
CREATE TRIGGER tr_asset_state_audit
    AFTER UPDATE OF state ON assets
    FOR EACH ROW
    EXECUTE FUNCTION audit_state_transition();

-- 应用到版本表
CREATE TRIGGER tr_version_state_audit
    AFTER UPDATE OF state ON asset_versions
    FOR EACH ROW
    EXECUTE FUNCTION audit_state_transition();
```

### 10.4 依赖关系一致性约束

```sql
-- 触发器：防止循环依赖
CREATE OR REPLACE FUNCTION check_circular_dependency()
RETURNS TRIGGER AS $$
DECLARE
    v_cycle_found BOOLEAN := false;
BEGIN
    -- 使用递归CTE检查循环
    WITH RECURSIVE dependency_chain AS (
        -- 起始节点
        SELECT
            NEW.source_asset_id as start_id,
            NEW.target_asset_id as current_id,
            1 as depth

        UNION ALL

        -- 递归查找下游
        SELECT
            dc.start_id,
            d.source_asset_id,
            dc.depth + 1
        FROM dependencies d
        JOIN dependency_chain dc ON d.target_asset_id = dc.current_id
        WHERE dc.depth < 100  -- 防止无限递归
    )
    SELECT EXISTS (
        SELECT 1 FROM dependency_chain
        WHERE current_id = NEW.source_asset_id
    ) INTO v_cycle_found;

    IF v_cycle_found THEN
        RAISE EXCEPTION 'Circular dependency detected: asset % cannot depend on %',
            NEW.source_asset_id, NEW.target_asset_id;
    END IF;

    -- 检查层级约束（可选，根据业务规则）
    -- IF EXISTS (
    --     SELECT 1 FROM assets a1, assets a2
    --     WHERE a1.id = NEW.source_asset_id
    --       AND a2.id = NEW.target_asset_id
    --       AND a1.type = a2.type  -- 同层级不能依赖
    -- ) THEN
    --     RAISE EXCEPTION 'Cross-layer dependency not allowed';
    -- END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_check_circular_dependency
    BEFORE INSERT OR UPDATE ON dependencies
    FOR EACH ROW
    EXECUTE FUNCTION check_circular_dependency();
```

### 10.5 时间戳自动更新

```sql
-- 通用触发器函数：自动更新updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 应用到所有需要自动更新的表
CREATE TRIGGER tr_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tr_agent_executions_updated_at
    BEFORE UPDATE ON agent_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 其他表类似...
```

---

## 11. 关键业务视图

### 11.1 资产完整信息视图

```sql
-- 视图：资产完整信息（含当前版本、元数据、状态）
CREATE OR REPLACE VIEW v_asset_full_info AS
SELECT
    a.id,
    a.name,
    a.slug,
    a.description,
    a.tags,
    a.type,
    a.state,
    a.owners,
    a.team_id,
    a.project_id,
    a.created_at,
    a.updated_at,

    -- 当前版本信息
    av.version as current_version,
    av.content_ref,
    av.changelog,
    av.published_at,
    av.published_by,

    -- 元数据
    COALESCE(am.metadata, '{}') as metadata,
    am.priority,
    am.status as business_status,
    am.due_date,

    -- 统计
    (
        SELECT COUNT(*)
        FROM dependencies
        WHERE source_asset_id = a.id
    ) as upstream_count,
    (
        SELECT COUNT(*)
        FROM dependencies
        WHERE target_asset_id = a.id
    ) as downstream_count,
    (
        SELECT COUNT(*)
        FROM dirty_sources
        WHERE asset_id = a.id AND status = 'pending'
    ) as pending_dirty_count

FROM assets a
LEFT JOIN asset_versions av
    ON a.id = av.asset_id
    AND a.current_version = av.version
LEFT JOIN asset_metadata am
    ON a.id = am.asset_id
    AND (am.version IS NULL OR am.version = a.current_version)
WHERE a.state != 'archived';
```

### 11.2 依赖图谱导出视图（用于图数据库）

```sql
-- 视图：依赖关系导出格式（兼容Neo4j/AGE导入）
CREATE OR REPLACE VIEW v_dependency_graph_export AS
WITH asset_nodes AS (
    SELECT DISTINCT
        id,
        name,
        type,
        current_version,
        state
    FROM assets
    WHERE state != 'archived'
),
dependency_edges AS (
    SELECT
        d.source_asset_id as from_id,
        d.target_asset_id as to_id,
        d.source_version as from_version,
        d.target_version as to_version,
        d.created_at,
        d.confirmed_at,
        d.auto_confirmed
    FROM dependencies d
    JOIN assets sa ON d.source_asset_id = sa.id AND sa.state != 'archived'
    JOIN assets ta ON d.target_asset_id = ta.id AND ta.state != 'archived'
)
SELECT
    'node' as record_type,
    id::text as id,
    name,
    type,
    current_version,
    state,
    NULL::text as from_id,
    NULL::text as to_id
FROM asset_nodes

UNION ALL

SELECT
    'edge' as record_type,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    from_id::text,
    to_id::text
FROM dependency_edges;
```

### 11.3 Dirty队列处理视图

```sql
-- 视图：待处理的dirty资产（按优先级排序）
CREATE OR REPLACE VIEW v_dirty_queue AS
SELECT
    a.id as asset_id,
    a.name as asset_name,
    a.type as asset_type,
    a.state,
    a.owners,

    -- dirty来源信息
    ds.upstream_asset_id,
    ua.name as upstream_name,
    ds.upstream_version,
    ds.upstream_published_at,
    ds.impact_level,
    ds.impact_analysis,

    -- 优先级计算
    CASE ds.impact_level
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 4
    END as priority_rank,

    -- 等待时间
    EXTRACT(EPOCH FROM (NOW() - ds.upstream_published_at))/3600 as hours_waiting,

    ds.created_at as added_to_queue_at,
    ds.status

FROM assets a
JOIN dirty_sources ds ON a.id = ds.asset_id
LEFT JOIN assets ua ON ds.upstream_asset_id = ua.id
WHERE ds.status = 'pending'
ORDER BY priority_rank, ds.upstream_published_at;
```

---

## 12. 数据一致性约束

### 12.1 检查约束（CHECK Constraints）

```sql
-- 版本号格式（SemVer）
ALTER TABLE asset_versions
ADD CONSTRAINT chk_version_format
CHECK (version ~ '^v\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$');

-- 状态有效性
ALTER TABLE assets
ADD CONSTRAINT chk_asset_state
CHECK (state IN ('draft', 'clean', 'dirty', 'modified', 'archived'));

-- 资产类型有效性
ALTER TABLE assets
ADD CONSTRAINT chk_asset_type
CHECK (type IN ('requirement', 'design', 'task', 'code', 'test', 'pipeline'));

-- 自动审批阈值有效性
ALTER TABLE assets
ADD CONSTRAINT chk_auto_approval_threshold
CHECK (auto_approval_threshold IN ('off', 'high', 'medium', 'low'));
```

### 12.2 唯一约束（UNIQUE Constraints）

```sql
-- 资产slug项目内唯一
ALTER TABLE assets
ADD CONSTRAINT uq_asset_slug_project
UNIQUE (project_id, slug);

-- 版本号资产内唯一
ALTER TABLE asset_versions
ADD CONSTRAINT uq_asset_version
UNIQUE (asset_id, version);

-- 依赖关系唯一
ALTER TABLE dependencies
ADD CONSTRAINT uq_dependency
UNIQUE (source_asset_id, source_version, target_asset_id, target_version);

-- dirty来源唯一
ALTER TABLE dirty_sources
ADD CONSTRAINT uq_dirty_source
UNIQUE (asset_id, upstream_asset_id, upstream_version);
```

### 12.3 外键约束（Foreign Key Constraints）

```sql
-- 版本引用资产（级联删除）
ALTER TABLE asset_versions
ADD CONSTRAINT fk_version_asset
FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;

-- 依赖关系引用资产（级联删除）
ALTER TABLE dependencies
ADD CONSTRAINT fk_dep_source
FOREIGN KEY (source_asset_id) REFERENCES assets(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_dep_target
FOREIGN KEY (target_asset_id) REFERENCES assets(id) ON DELETE CASCADE;

-- Agent执行引用Agent（限制删除）
ALTER TABLE agent_executions
ADD CONSTRAINT fk_exec_agent
FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE RESTRICT;
```

---

## 13. 系统初始化数据

### 13.1 内置Agent

```sql
-- 系统内置Agent（系统启动必需）
INSERT INTO agents (
    id,
    slug,  -- P0：统一改为 slug
    name,
    description,
    capabilities,
    trigger_mode,
    subscribed_events,
    config,
    model_config,
    prompt_template,
    status
) VALUES
(
    gen_random_uuid(),
    'requirement-agent',
    '需求分析师',
    '将原始需求转化为规范的需求规格说明',
    ARRAY['generate_spec', 'analyze_requirement', 'create_asset'],
    'event',
    ARRAY['stage.transition.requested'],
    '{"auto_execute": false, "approval_chain": ["product_owner"]}',
    '{"model": "anthropic/claude-sonnet-4-20250514", "temperature": 0.3}',
    '你是专业的需求分析师...',
    'enabled'
),
(
    gen_random_uuid(),
    'design-agent',
    '系统架构师',
    '根据需求规格生成系统设计文档',
    ARRAY['generate_design', 'create_architecture', 'define_api'],
    'event',
    ARRAY['asset.version.published'],
    '{"auto_execute": false, "approval_chain": ["tech_lead"]}',
    '{"model": "anthropic/claude-sonnet-4-20250514", "temperature": 0.2}',
    '你是经验丰富的系统架构师...',
    'enabled'
),
(
    gen_random_uuid(),
    'code-agent',
    '代码生成器',
    '根据设计生成代码实现',
    ARRAY['generate_code', 'implement_feature', 'write_tests'],
    'event',
    ARRAY['stage.transition.requested'],
    '{"auto_execute": true}',
    '{"model": "anthropic/claude-sonnet-4-20250514", "temperature": 0.1}',
    '你是资深的软件工程师...',
    'enabled'
),
(
    gen_random_uuid(),
    'impact-agent',
    '影响分析师',
    '分析版本变更对下游资产的影响',
    ARRAY['analyze_impact', 'assess_risk', 'generate_report'],
    'event',
    ARRAY['asset.version.published'],
    '{"auto_execute": true}',
    '{"model": "anthropic/claude-haiku-4-20250514", "temperature": 0.1}',
    '你是细致的影响分析师...',
    'enabled'
),
(
    gen_random_uuid(),
    'compatibility-agent',
    '兼容性检查器',
    '检查新版本与依赖资产的兼容性',
    ARRAY['check_compatibility', 'verify_contract', 'detect_conflict'],
    'event',
    ARRAY['asset.version.pre_publish'],
    '{"auto_execute": true}',
    '{"model": "anthropic/claude-haiku-4-20250514", "temperature": 0.1}',
    '你是严格的兼容性检查员...',
    'enabled'
);
```

### 13.2 内置Skill

```sql
-- 系统内置Skill
INSERT INTO skills (
    id,
    name,
    version,
    display_name,
    description,
    source,
    source_path,
    manifest,
    tool_definitions,
    status
) VALUES
(
    gen_random_uuid(),
    'fetch-asset',
    '1.0.0',
    '获取资产',
    '获取指定资产的完整内容或摘要信息',
    'bundled',
    '/opt/andos/skills/fetch-asset',
    '{"emoji": "📄", "requires": {"bins": [], "env": [], "config": []}}',
    '[{"name": "fetch_asset", "description": "获取资产内容", "parameters": {"type": "object", "properties": {"asset_id": {"type": "string"}, "version": {"type": "string"}, "format": {"type": "string", "enum": ["full", "summary", "metadata"]}}}}]',
    'active'
),
(
    gen_random_uuid(),
    'get-design-contract',
    '1.0.0',
    '获取设计契约',
    '提取设计的结构化信息（API定义、数据模型、时序图）',
    'bundled',
    '/opt/andos/skills/get-design-contract',
    '{"emoji": "📐", "requires": {"bins": [], "env": [], "config": []}}',
    '[{"name": "get_design_contract", "description": "获取设计契约", "parameters": {"type": "object", "properties": {"design_asset_id": {"type": "string"}, "contract_type": {"type": "string", "enum": ["api", "model", "sequence", "all"]}}}}]',
    'active'
),
(
    gen_random_uuid(),
    'query-dependency-path',
    '1.0.0',
    '查询依赖路径',
    '查询两个资产间的依赖路径',
    'bundled',
    '/opt/andos/skills/query-dependency-path',
    '{"emoji": "🔍", "requires": {"bins": [], "env": [], "config": []}}',
    '[{"name": "query_dependency_path", "description": "查询依赖路径", "parameters": {"type": "object", "properties": {"from_asset": {"type": "string"}, "to_asset": {"type": "string"}, "max_depth": {"type": "integer", "default": 10}}}}]',
    'active'
);
```

### 13.3 Agent-Skill 关联

```sql
-- 为Agent分配Skill
INSERT INTO agent_skills (id, agent_slug, skill_id, enabled)  -- P0：改为 agent_slug
SELECT
    gen_random_uuid(),
    a.slug,  -- P0：改为 slug
    s.id,
    true
FROM agents a, skills s
WHERE a.slug IN ('requirement-agent', 'design-agent', 'code-agent')  -- P0：改为 slug
  AND s.name IN ('fetch-asset', 'get-design-contract', 'query-dependency-path');
```

### 13.4 默认项目配置

```sql
-- 默认项目
INSERT INTO projects (id, name, slug, description, dependency_rules, status)
VALUES (
    gen_random_uuid(),
    'Default Project',
    'default',
    '默认项目',
    '{"allow_cross_layer": false, "max_depth": 100}',
    'active'
);

-- 默认环节配置
INSERT INTO stage_configs (id, project_id, stage_name, next_stage, delegation_mode, default_agent_slug, auto_execute)  -- P0：改为 default_agent_slug
VALUES
-- 注意：这里假设有一个默认项目ID，实际使用时需要替换为真实ID
(gen_random_uuid(), (SELECT id FROM projects WHERE slug = 'default'), 'requirement', 'design', 'agent', 'design-agent', true),
(gen_random_uuid(), (SELECT id FROM projects WHERE slug = 'default'), 'design', 'code', 'agent', 'code-agent', true),
(gen_random_uuid(), (SELECT id FROM projects WHERE slug = 'default'), 'code', 'test', 'manual', NULL, false),
(gen_random_uuid(), (SELECT id FROM projects WHERE slug = 'default'), 'test', 'pipeline', 'manual', NULL, false);
```


```sql
-- 1. 逻辑备份（pg_dump）
-- 每天全量备份
pg_dump -h localhost -U andos andos_db > backup_$(date +%Y%m%d).sql

-- 2. 物理备份（WAL归档）
-- 启用WAL归档，支持PITR（时间点恢复）
archive_mode = on
archive_command = 'cp %p /backup/wal/%f'

-- 3. 关键表单独备份
pg_dump -t assets -t asset_versions andos_db > core_backup.sql
```

---

## 15. 关键决策汇总（审查后调整）

| 决策项 | 原决策 | **调整后** | 理由 |
|--------|--------|-----------|------|
| 业务逻辑位置 | PostgreSQL 存储过程 | **应用层为主，DB层仅保留审计** | 可测试、可调试、便于版本控制 |
| 表分区时机 | 后期扩展 | **MVP立即启用** | `agent_executions` 和 `platform_events` 年增千万级，后期迁移风险高 |
| 删除策略 | `ON DELETE CASCADE` | **软删除 + RESTRICT + 异步清理** | 防止误删，支持审计恢复 |
| 依赖查询 | 递归 CTE | **ltree 物化路径** | 性能可预测，避免深度限制 |
| 字段命名 | `agents.id` + `agents.agent_id` | **`agents.id` + `agents.slug`** | 消除歧义，统一外键命名 |
| JSONB 索引 | 通用 GIN | **部分索引 + 表达式索引** | 减少索引大小，提高查询效率 |
| 连接管理 | 单实例直连 | **连接池 + 读写分离预留** | 支持扩展，读多写少场景优化 |

### 数据量与分区策略

| 表 | 年增数据量 | 分区策略 | 状态 |
|---|-----------|---------|------|
| assets | 10万 | 无需分区 | ✅ 软删除保护 |
| asset_versions | 100万 | 无需分区 | ✅ RESTRICT 外键 |
| dependencies | 500万 | 无需分区 | ✅ ltree 优化 |
| **agent_executions** | **1000万+** | **按月分区（MVP启用）** | ✅ 已分区 |
| **platform_events** | **5000万+** | **按月分区（MVP启用）** | ✅ 已分区 |

### 迁移的存储过程

| 原存储过程 | 新位置 | 说明 |
|-----------|--------|------|
| `propagate_dirty_on_publish()` | `AssetService.publishVersion()` | 应用层事务控制 |
| `clean_asset_manually()` | `AssetService.cleanAssetManually()` | 应用层验证逻辑 |
| `check_circular_dependency()` | `DAGService.validateNoCycle()` | ltree 路径检测 |

### 保留的数据库触发器

| 触发器 | 用途 |
|--------|------|
| `audit_state_transition()` | 状态变更审计 |
| `tr_assets_updated_at` | 时间戳自动更新 |
| `handle_asset_soft_delete()` | 软删除时清理关联数据 |

---

**文档版本**: 1.1 (审查后更新)
**最后更新**: 2026-03-13
