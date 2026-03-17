# Agent Memory System 设计方案

**Date:** 2026-03-15
**Status:** Draft
**Version:** 1.1

---

## 1. 设计目标

构建一个**三层架构**的Agent Memory System，支持Session、Project、Organization三个层级的记忆管理，满足准实时共享、层级继承和持久化恢复的需求。

**核心原则**：
1. **Memory ≠ Skill**：记忆是Agent工作的上下文指引，Skill是Agent具备的能力
2. **Memory ≠ RBAC**：记忆指导"如何工作"，RBAC控制"谁能访问"
3. **准实时同步**：Project级记忆需要在团队内快速共享
4. **层级继承**：Organization记忆向下继承，支持覆盖和扩展
5. **KV优先**：以KV存储为核心，Graph存储补充关系推理，简化实现复杂度
6. **MCP兼容**：遵循Model Context Protocol标准，支持生态互通

---

## 2. 研究基础 (2024-2026)

### 2.1 学术研究

**MemGPT (UC Berkeley, 2023-2024)**
- 提出虚拟上下文管理概念
- 核心架构：Main Context + Recall Storage + Archival Storage
- LLM通过显式READ/WRITE操作管理记忆
- 适用于超长对话和持久化Agent

**Key Insight**：LLM有限的上下文窗口需要通过显式的记忆管理来扩展。

### 2.2 工业实践

| 平台 | 记忆机制 | 特点 |
|------|----------|------|
| **OpenAI** | Thread-based + File Search | 对话线程独立，支持RAG文件检索 |
| **Anthropic** | Context Window + Implicit Summarization | 依赖模型自身的上下文压缩能力 |
| **LangChain** | Memory Classes (Buffer/Vector/Summary) | 多种记忆类型可组合使用 |
| **AutoGPT** | Workspace + Long-term Vector Store | 本地文件+向量数据库存储 |
| **CrewAI** | Shared Memory between Agents | 团队内Agent共享记忆 |

### 2.3 存储技术

| 类型 | 技术 | 适用场景 |
|------|------|----------|
| **向量数据库** | Weaviate, Pinecone, Chroma | 语义检索、相似度匹配 |
| **知识图谱** | Neo4j, RDF | 关系推理、实体关联 |
| **内存数据库** | Redis | 高速读写、Pub/Sub |
| **时序数据库** | TimescaleDB | 会话历史、时间序列 |
| **对象存储** | S3, MinIO | 大文件、归档数据 |

### 2.4 2024-2025 最新进展

**Mem0 (2024)**
- 结构化记忆 + 动态遗忘机制
- 支持用户/对话/全局三级记忆
- 自动冲突解决和记忆合并
- 关键创新：`remember`/`forget`显式操作

**Letta (2024-2025)**
- 多Agent共享记忆架构
- 支持工具调用记忆持久化
- 内存快照与恢复机制
- 提供RESTful Memory API

**MCP (Model Context Protocol, Anthropic 2024)**
- 标准化AI-data source连接协议
- Server/Client架构，支持工具、资源、Prompts
- 生态互通，降低集成成本
- 支持记忆管理作为Resource类型

**Context Engineering (2025趋势)**
- 从Prompt Engineering向Context Engineering演进
- 动态上下文组装而非静态Prompt模板
- 多模态上下文融合（代码+文档+图谱）

---

## 3. 架构设计

### 3.1 三层记忆架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORGANIZATION MEMORY LAYER                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Standards  │  │   Patterns   │  │  Hierarchical Config │  │
│  │   (Static)   │  │   (Static)   │  │   (Static+Dynamic)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                    Inheritance: Parent → Child                  │
│                    Scope: Org → Sub-org → Project               │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PROJECT MEMORY LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Shared       │  │ Learned      │  │ Real-time            │  │
│  │ Context      │  │ Patterns     │  │ Collaboration        │  │
│  │ (Static)     │  │ (Dynamic)    │  │ State                │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                    Sync: WebSocket / SSE / Polling              │
│                    Scope: Project Members                       │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SESSION MEMORY LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Conversation │  │ Working      │  │ Recoverable          │  │
│  │ History      │  │ Context      │  │ State                │  │
│  │ (Ephemeral)  │  │ (Ephemeral)  │  │ (Persisted)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                    Lifecycle: User Session                       │
│                    Recovery: 24h retention                       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 记忆类型定义

```typescript
// ==================== SESSION LEVEL ====================

interface SessionMemory {
  sessionId: string;
  userId: string;
  projectId: string;
  organizationId: string;

  // Ephemeral - In memory only
  conversationHistory: Turn[];
  workingContext: WorkingContext;

  // Persisted - For recovery
  checkpoints: Checkpoint[];
  tokenUsage: TokenUsage;

  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;  // 24h TTL
}

interface Turn {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: Date;
  metadata?: TurnMetadata;
}

interface WorkingContext {
  currentAssetId?: string;
  currentTask?: string;
  userIntent?: string;
  pendingOperations: Operation[];
  activeSkills: string[];
  contextReferences: ContextReference[];
}

interface Checkpoint {
  id: string;
  sequence: number;
  state: SessionState;
  timestamp: Date;
  trigger: 'auto' | 'manual' | 'pre_tool_call';
}

// ==================== PROJECT LEVEL ====================

interface ProjectMemory {
  projectId: string;
  organizationId: string;

  // Static - Manual configuration
  sharedContext: SharedContext;

  // Dynamic - Learned from interactions
  learnedPatterns: LearnedPattern[];
  userPreferences: UserPreference[];

  // Real-time - Active collaboration
  collaborationState: CollaborationState;

  // Version tracking
  version: number;
  lastUpdatedAt: Date;
}

interface SharedContext {
  codingStandards?: string;
  architectureDecisions?: ArchitectureDecision[];
  domainTerminology?: DomainTerm[];
  apiConventions?: ApiConvention[];
  projectGuidelines?: string;
}

interface LearnedPattern {
  id: string;
  type: 'error_pattern' | 'solution_pattern' | 'user_preference' | 'asset_relation';
  pattern: string;
  embedding: number[];  // For vector search
  frequency: number;
  lastUsedAt: Date;
  confidence: number;  // 0.0 - 1.0
  metadata: Record<string, any>;
}

interface CollaborationState {
  activeUsers: Map<string, ActiveUser>;
  editingAssets: Map<string, EditingAsset>;
  draftContents: Map<string, DraftContent>;
  cursorPositions: Map<string, CursorPosition[]>;
  lastSyncAt: Date;
}

interface ActiveUser {
  userId: string;
  userName: string;
  sessionId: string;
  currentAssetId?: string;
  joinedAt: Date;
  lastActivityAt: Date;
}

// ==================== ORGANIZATION LEVEL ====================

interface OrganizationMemory {
  organizationId: string;
  parentOrganizationId?: string;

  // Static standards
  standards: OrganizationStandards;

  // Inheritance chain
  inheritedFrom?: string[];
  overrides: StandardOverride[];

  // Version tracking
  version: number;
  updatedAt: Date;
}

interface OrganizationStandards {
  codingStandards: CodingStandard[];
  securityPolicies: SecurityPolicy[];
  reviewGuidelines: ReviewGuideline[];
  agentConfigurations: AgentConfiguration[];
}

interface StandardOverride {
  path: string;  // Dot-notation path, e.g., "codingStandards.indentation"
  value: any;
  reason: string;
  overriddenAt: Date;
  overriddenBy: string;
}

interface InheritanceChain {
  organizations: string[];  // From root to current
  effectiveStandards: OrganizationStandards;
  resolutionLog: ResolutionLogEntry[];
}

// ==================== HYBRID MEMORY INTERFACES ====================

/**
 * Vector Memory - 语义检索层 (V3.0)
 * 用于：相似度匹配、语义搜索、Embedding检索
 * NOTE: Vector存储延期至V3.0实现，V1.5-V2.5使用KV索引+关键词检索
 */
interface VectorMemory {
  id: string;
  content: string;
  embedding: number[];  // 1536维 (OpenAI) / 1024维 (其他)
  metadata: VectorMetadata;
  score?: number;  // 相似度分数
}

interface VectorMetadata {
  level: 'session' | 'project' | 'organization';
  type: 'pattern' | 'conversation' | 'document' | 'code';
  projectId?: string;
  organizationId?: string;
  sessionId?: string;
  createdAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
  tags: string[];
}

interface VectorSearchOptions {
  limit?: number;
  threshold?: number;  // 最小相似度 (0-1)
  filter?: VectorFilter;
  includeMetadata?: boolean;
}

interface VectorFilter {
  level?: ('session' | 'project' | 'organization')[];
  type?: string[];
  projectId?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

/**
 * KV Memory - 精确状态存储
 * 用于：配置、状态、检查点、工作上下文
 */
interface KVMemory {
  key: string;
  value: any;
  metadata: KVMemoryMetadata;
  ttl?: number;  // 过期时间(秒)
}

interface KVMemoryMetadata {
  level: 'session' | 'project' | 'organization';
  namespace: string;  // 命名空间，如 "checkpoints", "config"
  version: number;
  createdAt: Date;
  updatedAt: Date;
  etag: string;  // 乐观锁
}

interface KVQueryOptions {
  prefix?: string;
  namespace?: string;
  level?: 'session' | 'project' | 'organization';
  includeTTL?: boolean;
}

/**
 * Graph Memory - 关系推理层
 * 用于：依赖关系、实体关联、多跳查询
 */
interface GraphMemory {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;
  type: 'asset' | 'task' | 'agent' | 'user' | 'pattern' | 'concept';
  properties: Record<string, any>;
  labels: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, any>;
  directed: boolean;
}

interface GraphQuery {
  // Cypher-like查询
  match: NodePattern[];
  where?: WhereClause;
  return: ReturnField[];
  limit?: number;
}

interface NodePattern {
  alias: string;
  type?: string;
  labels?: string[];
}

interface GraphTraversalOptions {
  maxDepth: number;
  edgeTypes?: string[];
  nodeTypes?: string[];
  direction: 'outgoing' | 'incoming' | 'both';
}
```

---

## 4. 存储方案

### 4.1 混合存储矩阵

| 记忆类型 | Vector存储 (V3.0) | KV存储 | Graph存储 | 同步机制 |
|----------|-------------------|--------|-----------|----------|
| **Session** | - | Redis + PostgreSQL | - | - |
| **Project Patterns** | ~~Weaviate/pgvector~~ (V3.0) | PostgreSQL | - | Event-driven |
| **Project Dependencies** | - | PostgreSQL | Neo4j | Real-time |
| **Organization** | - | PostgreSQL | - | - |

**详细存储映射：**

| 数据类型 | 存储系统 | 访问模式 | 用途 |
|----------|----------|----------|------|
| **Vector Memory (V3.0)** | Weaviate / pgvector | ANN语义检索 | 模式匹配、相似查询 |
| **KV Memory** | Redis (Hot) / PostgreSQL (Warm) | 精确读写 | 状态、配置、检查点 |
| **Graph Memory** | Neo4j / RedisGraph | 图遍历 | 依赖关系、实体关联 |
| **Ephemeral** | Redis | 高频读写 | 会话状态、协作状态 |
| **Persistent** | PostgreSQL | 事务写入 | 检查点、历史记录 |

### 4.2 数据库 Schema

```sql
-- Session Memory Table
CREATE TABLE session_memories (
    session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    project_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    conversation_history JSONB DEFAULT '[]',
    working_context JSONB DEFAULT '{}',
    checkpoints JSONB DEFAULT '[]',
    token_usage JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_session_project ON session_memories(project_id);
CREATE INDEX idx_session_user ON session_memories(user_id);
CREATE INDEX idx_session_expires ON session_memories(expires_at);

-- Project Memory - Static
CREATE TABLE project_memories (
    project_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    shared_context JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Project Memory - Dynamic (Learned Patterns) - V3.0
-- NOTE: embedding字段和Vector索引延期至V3.0实现
CREATE TABLE learned_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    pattern TEXT NOT NULL,
    -- embedding VECTOR(1536),  -- V3.0: 启用pgvector支持
    frequency INTEGER DEFAULT 1,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confidence FLOAT DEFAULT 0.5,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_patterns_project ON learned_patterns(project_id);
CREATE INDEX idx_patterns_type ON learned_patterns(type);
-- V3.0: CREATE INDEX idx_patterns_embedding ON learned_patterns USING ivfflat (embedding vector_cosine_ops);

-- Organization Memory with Inheritance
CREATE TABLE organization_memories (
    organization_id UUID PRIMARY KEY,
    parent_organization_id UUID REFERENCES organization_memories(organization_id),
    standards JSONB DEFAULT '{}',
    overrides JSONB DEFAULT '[]',
    version INTEGER DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time Collaboration State (Redis only, not persisted)
-- Stored in Redis with pattern: "collab:{project_id}:{user_id}"

-- KV Memory Table (Hot + Warm storage)
CREATE TABLE kv_memories (
    key VARCHAR(512) PRIMARY KEY,
    value JSONB NOT NULL,
    namespace VARCHAR(100) NOT NULL DEFAULT 'default',
    level VARCHAR(20) NOT NULL CHECK (level IN ('session', 'project', 'organization')),
    project_id UUID,
    organization_id UUID,
    session_id UUID,
    version INTEGER DEFAULT 1,
    etag VARCHAR(64),
    ttl_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_kv_namespace ON kv_memories(namespace);
CREATE INDEX idx_kv_level ON kv_memories(level);
CREATE INDEX idx_kv_project ON kv_memories(project_id);
CREATE INDEX idx_kv_expires ON kv_memories(expires_at);

-- Graph Memory - Nodes
CREATE TABLE graph_nodes (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    properties JSONB DEFAULT '{}',
    labels TEXT[] DEFAULT '{}',
    project_id UUID,
    organization_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_graph_nodes_type ON graph_nodes(type);
CREATE INDEX idx_graph_nodes_project ON graph_nodes(project_id);
CREATE INDEX idx_graph_nodes_labels ON graph_nodes USING GIN(labels);
CREATE INDEX idx_graph_nodes_properties ON graph_nodes USING GIN(properties);

-- Graph Memory - Edges
CREATE TABLE graph_edges (
    id VARCHAR(255) PRIMARY KEY,
    source_id VARCHAR(255) NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_id VARCHAR(255) NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    properties JSONB DEFAULT '{}',
    directed BOOLEAN DEFAULT true,
    project_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_id, target_id, type)
);

CREATE INDEX idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX idx_graph_edges_target ON graph_edges(target_id);
CREATE INDEX idx_graph_edges_type ON graph_edges(type);
CREATE INDEX idx_graph_edges_project ON graph_edges(project_id);

-- Memory Access Log (用于动态遗忘和统计)
CREATE TABLE memory_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_type VARCHAR(50) NOT NULL,  -- 'vector', 'kv', 'graph'
    memory_id VARCHAR(255) NOT NULL,
    action VARCHAR(20) NOT NULL,  -- 'read', 'write', 'delete'
    user_id UUID,
    session_id UUID,
    project_id UUID,
    metadata JSONB DEFAULT '{}',
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_access_logs_memory ON memory_access_logs(memory_type, memory_id);
CREATE INDEX idx_access_logs_time ON memory_access_logs(accessed_at);
CREATE INDEX idx_access_logs_project ON memory_access_logs(project_id);
```

---

## 5. 服务接口

### 5.1 Memory Service API

```typescript
interface MemoryService {
  // ==================== Session Level ====================

  /**
   * 创建新会话记忆
   */
  createSession(sessionId: string, config: SessionConfig): Promise<SessionMemory>;

  /**
   * 获取会话记忆（自动恢复）
   */
  getSession(sessionId: string): Promise<SessionMemory | null>;

  /**
   * 追加对话轮次
   */
  appendTurn(sessionId: string, turn: Turn): Promise<void>;

  /**
   * 更新工作上下文
   */
  updateWorkingContext(sessionId: string, context: Partial<WorkingContext>): Promise<void>;

  /**
   * 创建检查点（用于恢复）
   */
  createCheckpoint(sessionId: string, state: SessionState): Promise<Checkpoint>;

  /**
   * 恢复到指定检查点
   */
  restoreToCheckpoint(sessionId: string, checkpointId: string): Promise<SessionMemory>;

  /**
   * 延长会话有效期
   */
  extendSession(sessionId: string, ttl: number): Promise<void>;

  // ==================== Project Level ====================

  /**
   * 获取项目静态上下文
   */
  getProjectContext(projectId: string): Promise<SharedContext>;

  /**
   * 更新项目静态上下文
   */
  updateProjectContext(projectId: string, context: Partial<SharedContext>): Promise<void>;

  /**
   * 记录学习到的模式
   */
  recordPattern(projectId: string, pattern: LearnedPatternInput): Promise<LearnedPattern>;

  /**
   * 查询相似模式（语义检索）
   */
  querySimilarPatterns(
    projectId: string,
    query: string,
    options?: QueryOptions
  ): Promise<LearnedPattern[]>;

  /**
   * 获取项目内活跃用户
   */
  getActiveUsers(projectId: string): Promise<ActiveUser[]>;

  /**
   * 订阅项目记忆更新
   */
  subscribeToProject(
    projectId: string,
    callback: (update: MemoryUpdate) => void
  ): Subscription;

  // ==================== Organization Level ====================

  /**
   * 获取组织的有效标准（包含继承解析）
   */
  getEffectiveStandards(organizationId: string): Promise<OrganizationStandards>;

  /**
   * 更新组织标准
   */
  updateStandards(
    organizationId: string,
    updates: StandardUpdate[],
    options?: UpdateOptions
  ): Promise<OrganizationMemory>;

  /**
   * 获取继承链
   */
  getInheritanceChain(organizationId: string): Promise<InheritanceChain>;

  /**
   * 覆盖父级标准
   */
  overrideStandard(
    organizationId: string,
    path: string,
    value: any,
    reason: string
  ): Promise<void>;

  // ==================== Hybrid Memory Operations ====================

  /**
   * Vector Memory - 语义存储与检索
   */
  vector: VectorMemoryService;

  /**
   * KV Memory - 键值存储
   */
  kv: KVMemoryService;

  /**
   * Graph Memory - 图存储与遍历
   */
  graph: GraphMemoryService;
}

// ==================== Vector Memory Service (V3.0) ====================
// NOTE: Vector存储延期至V3.0实现

interface VectorMemoryService {
  /**
   * 存储向量记忆
   */
  store(memory: Omit<VectorMemory, 'id'>): Promise<VectorMemory>;

  /**
   * 语义检索
   */
  search(
    query: string | number[],
    options: VectorSearchOptions
  ): Promise<VectorMemory[]>;

  /**
   * 根据ID获取
   */
  get(id: string): Promise<VectorMemory | null>;

  /**
   * 删除向量记忆
   */
  delete(id: string): Promise<void>;

  /**
   * 更新访问统计
   */
  recordAccess(id: string): Promise<void>;
}

// ==================== KV Memory Service ====================

interface KVMemoryService {
  /**
   * 存储键值
   */
  set<T = any>(
    key: string,
    value: T,
    options?: { ttl?: number; namespace?: string }
  ): Promise<void>;

  /**
   * 获取键值
   */
  get<T = any>(key: string): Promise<T | null>;

  /**
   * 删除键值
   */
  delete(key: string): Promise<void>;

  /**
   * 原子更新
   */
  update<T = any>(
    key: string,
    updater: (current: T | null) => T
  ): Promise<T>;

  /**
   * 前缀扫描
   */
  scan(prefix: string): Promise<Array<{ key: string; value: any }>>;
}

// ==================== Graph Memory Service ====================

interface GraphMemoryService {
  /**
   * 创建节点
   */
  createNode(node: Omit<GraphNode, 'id'>): Promise<GraphNode>;

  /**
   * 创建边
   */
  createEdge(edge: Omit<GraphEdge, 'id'>): Promise<GraphEdge>;

  /**
   * 图查询 (Cypher-like)
   */
  query(query: GraphQuery): Promise<GraphQueryResult>;

  /**
   * 图遍历
   */
  traverse(
    startNodeId: string,
    options: GraphTraversalOptions
  ): Promise<GraphPath[]>;

  /**
   * 最短路径
   */
  shortestPath(
    fromNodeId: string,
    toNodeId: string,
    edgeTypes?: string[]
  ): Promise<GraphPath | null>;

  /**
   * 子图导出
   */
  subgraph(
    centerNodeId: string,
    depth: number
  ): Promise<GraphMemory>;
}

interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    queryTime: number;
    nodeCount: number;
    edgeCount: number;
  };
}

interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  length: number;
}

// ==================== MCP-Compatible Interfaces ====================

/**
 * MCP Resource 类型 - 记忆作为资源暴露
 */
interface MCPMemoryResource {
  uri: string;  // memory://{level}/{projectId}/{memoryId}
  name: string;
  mimeType: 'application/json' | 'text/plain' | 'application/vnd.graph+json';
  description?: string;
  metadata: {
    level: 'session' | 'project' | 'organization';
    type: 'vector' | 'kv' | 'graph';
    createdAt: Date;
    updatedAt: Date;
    accessCount: number;
  };
}

/**
 * MCP Tool 定义 - 记忆操作工具
 */
interface MCPMemoryTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP Server 接口
 */
interface MCPMemoryServer {
  /**
   * 列出可用记忆资源
   */
  listResources(
    level: 'session' | 'project' | 'organization',
    projectId?: string
  ): Promise<MCPMemoryResource[]>;

  /**
   * 读取记忆资源
   */
  readResource(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType: string;
      text?: string;
      blob?: string;  // base64
    }>;
  }>;

  /**
   * 列出可用工具
   */
  listTools(): Promise<MCPMemoryTool[]>;

  /**
   * 调用记忆工具
   */
  callTool(
    name: string,
    args: Record<string, any>
  ): Promise<{
    content: Array<{
      type: 'text' | 'image' | 'resource';
      text?: string;
      data?: string;
      mimeType?: string;
    }>;
  }>;
}

/**
 * 标准记忆操作工具集
 */
const STANDARD_MEMORY_TOOLS: MCPMemoryTool[] = [
  {
    name: 'memory_search',
    description: 'Search memories by semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
        limit: { type: 'number', default: 10 },
      },
      required: ['query', 'level'],
    },
  },
  {
    name: 'memory_remember',
    description: 'Store a new memory',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content', 'level'],
    },
  },
  {
    name: 'memory_forget',
    description: 'Remove a memory by ID',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
      },
      required: ['memoryId', 'level'],
    },
  },
  {
    name: 'memory_graph_query',
    description: 'Query the graph memory using Cypher-like syntax',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cypher query' },
        projectId: { type: 'string' },
      },
      required: ['query'],
    },
  },
];

// ==================== Real-time Collaboration ====================

interface CollaborationService {
  /**
   * 加入项目协作
   */
  joinProject(projectId: string, user: ActiveUser): Promise<void>;

  /**
   * 离开项目协作
   */
  leaveProject(projectId: string, userId: string): Promise<void>;

  /**
   * 更新光标位置
   */
  updateCursor(
    projectId: string,
    userId: string,
    position: CursorPosition
  ): Promise<void>;

  /**
   * 广播草稿内容
   */
  broadcastDraft(
    projectId: string,
    assetId: string,
    content: string,
    version: number
  ): Promise<void>;

  /**
   * 订阅协作事件
   */
  onCollaborationEvent(
    projectId: string,
    eventType: CollaborationEventType,
    callback: (event: CollaborationEvent) => void
  ): void;
}
```

### 5.2 WebSocket Protocol

```typescript
// Client -> Server
interface MemoryClientMessage {
  type: 'join_project' | 'leave_project' | 'cursor_update' | 'draft_update' | 'heartbeat';
  projectId: string;
  payload: any;
  timestamp: Date;
}

// Server -> Client
interface MemoryServerMessage {
  type: 'user_joined' | 'user_left' | 'cursor_moved' | 'draft_changed' | 'pattern_learned' | 'context_updated';
  projectId: string;
  payload: any;
  timestamp: Date;
}

// 示例：用户加入项目
type JoinProjectMessage = {
  type: 'join_project';
  projectId: string;
  payload: {
    userId: string;
    userName: string;
    sessionId: string;
  };
};

// 示例：光标位置更新
type CursorUpdateMessage = {
  type: 'cursor_update';
  projectId: string;
  payload: {
    userId: string;
    assetId: string;
    position: { line: number; column: number };
    selection?: { start: Position; end: Position };
  };
};
```

---

## 6. 与 Agent System 的集成

### 6.1 Bootstrap 文件增强

现有的Bootstrap文件（AGENTS.md, SOUL.md等）将与Memory System集成：

```typescript
interface EnhancedBootstrapConfig {
  // 从Organization Memory加载
  organizationStandards: OrganizationStandards;

  // 从Project Memory加载
  projectContext: SharedContext;
  relevantPatterns: LearnedPattern[];

  // 从Session Memory加载
  conversationHistory: Turn[];
  workingContext: WorkingContext;

  // 动态组装Bootstrap内容
  assemble(): string;
}
```

### 6.2 Context Engineering 系统

Context Engineering是从Prompt Engineering演进而来的新范式，强调动态上下文组装而非静态模板。

#### 6.2.1 上下文组装管道

```
┌─────────────────────────────────────────────────────────────────┐
│                 Context Assembly Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│  Step 1: 需求分析                                                │
│    └─→ 分析用户意图、当前任务、所需资源                            │
│                                                                  │
│  Step 2: 记忆检索                                                │
│    └─→ Keyword: 关键词匹配 (V1.5-V2.5)                            │
│    └─→ Vector: 语义相似度匹配 (V3.0)                              │
│    └─→ KV: 精确状态查询                                          │
│    └─→ Graph: 关系推理查询 (V2.5)                                 │
│                                                                  │
│  Step 3: 相关性排序                                              │
│    └─→ 基于任务相关性和记忆置信度                                   │
│    └─→ 应用记忆优先级策略                                         │
│                                                                  │
│  Step 4: 上下文裁剪                                              │
│    └─→ 按优先级选择记忆                                           │
│    └─→ 确保在Token预算内                                          │
│                                                                  │
│  Step 5: 格式组装                                                │
│    └─→ 生成最终上下文文本                                         │
│    └─→ 注入到Agent Bootstrap                                      │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.2 记忆注入策略

| 策略 | 描述 | 适用场景 |
|------|------|----------|
| **Static** | 固定注入，每次必含 | 编码规范、项目基础信息 |
| **Keyword** | 基于关键词匹配检索 (V1.5-V2.5) | 相关模式、历史对话 |
| **Semantic** | 基于语义相似度动态检索 (V3.0) | 相关模式、历史对话 |
| **Graph** | 基于关系路径注入 (V2.5) | 依赖关系、影响分析 |
| **Recency** | 最近使用优先 | 当前会话上下文 |
| **Frequency** | 高频使用优先 | 常用模式、用户偏好 |

#### 6.2.3 Token预算管理

```typescript
interface ContextBudget {
  maxTokens: number;
  allocations: {
    systemPrompt: number;      // 系统提示词 (固定)
    organizationStandards: number;  // 组织标准
    projectContext: number;    // 项目上下文
    learnedPatterns: number;   // 学习模式
    conversationHistory: number;  // 对话历史
    workingContext: number;    // 工作上下文
    reserve: number;           // 预留
  };
}

// 默认预算分配 (128K tokens)
const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxTokens: 128000,
  allocations: {
    systemPrompt: 4000,
    organizationStandards: 8000,
    projectContext: 12000,
    learnedPatterns: 16000,
    conversationHistory: 40000,
    workingContext: 8000,
    reserve: 40000,  // 用于动态调整
  },
};
```

#### 6.2.4 记忆优先级计算

```typescript
interface MemoryPriority {
  // 基础分 (0-1)
  relevance: number;      // 语义相关性
  recency: number;        // 时效性 (时间衰减)
  frequency: number;      // 使用频率
  confidence: number;     // 置信度

  // 调整因子
  userFeedback: number;   // 用户反馈调整 (+/- 0.2)
  contextBoost: number;   // 上下文匹配提升

  // 最终分数
  calculate(): number {
    return (
      this.relevance * 0.35 +
      this.recency * 0.25 +
      this.frequency * 0.20 +
      this.confidence * 0.15 +
      this.userFeedback * 0.05
    ) * this.contextBoost;
  }
}
```

### 6.3 动态遗忘与压缩机制

基于Mem0和Letta的研究，实现智能记忆管理，避免记忆无限增长。

#### 6.3.1 遗忘策略

| 策略 | 触发条件 | 操作 |
|------|----------|------|
| **TTL过期** | 超过预设生存时间 | 自动删除 |
| **容量溢出** | 达到存储上限 | 按优先级淘汰 |
| **用户显式** | 调用forget操作 | 立即删除 |
| **冲突合并** | 检测到矛盾记忆 | 合并或标记冲突 |
| **低频淘汰** | 长期未访问 | 归档或删除 |

#### 6.3.2 记忆压缩

```typescript
interface CompressionStrategy {
  // 对话压缩
  compressConversation(turns: Turn[]): CompressedConversation;

  // 模式抽象
  abstractPatterns(patterns: LearnedPattern[]): AbstractPattern[];

  // 摘要生成
  generateSummary(content: string, maxLength: number): string;
}

// 对话压缩实现
interface CompressedConversation {
  originalCount: number;
  compressedCount: number;
  summary: string;
  keyPoints: string[];
  fullHistory: Turn[];  // 保留原始，按需加载
}

// 压缩触发条件
const COMPRESSION_TRIGGERS = {
  conversationLength: 50,   // 超过50轮触发
  tokenThreshold: 80000,    // Token使用超过阈值触发
  timeInterval: 3600000,    // 每小时检查一次
};
```

#### 6.3.3 冲突解决

```typescript
interface ConflictResolver {
  // 检测记忆冲突
  detectConflicts(memories: VectorMemory[]): Conflict[];

  // 解决策略
  resolve(conflict: Conflict): Resolution {
    switch (conflict.type) {
      case 'contradiction':
        // 矛盾：保留高置信度，标记待确认
        return this.keepHigherConfidence(conflict);
      case 'redundancy':
        // 冗余：合并内容，更新元数据
        return this.mergeRedundant(conflict);
      case 'superseded':
        // 过时：标记为历史版本
        return this.markSuperseded(conflict);
    }
  }
}
```

### 6.4 CRDT实时协作架构

采用Conflict-free Replicated Data Types实现分布式实时协作，确保最终一致性。

#### 6.4.1 CRDT类型选择

| 数据类型 | CRDT类型 | 应用场景 |
|----------|----------|----------|
| 光标位置 | LWW-Element-Set | 最后写入获胜 |
| 草稿内容 | YATA / Peritext | 文本协同编辑 |
| 用户状态 | G-Counter | 在线计数 |
| 协作事件 | Event Sourcing | 事件流 |

#### 6.4.2 协作状态同步

```typescript
interface CRDTState {
  // 文档状态 (YATA)
  document: YATADocument;

  //  presence状态 (LWW)
  presence: Map<string, LWWPresence>;

  // 版本向量
  versionVector: Map<string, number>;
}

interface YATADocument {
  // 基于YATA算法的文本CRDT
  content: YATANode[];
  clientId: string;
  clock: number;
}

interface LWWPresence {
  userId: string;
  cursor: CursorPosition;
  selection?: SelectionRange;
  timestamp: number;  // 用于LWW比较
}

// 同步消息格式
interface SyncMessage {
  type: 'delta' | 'full' | 'ack';
  projectId: string;
  clientId: string;
  payload: CRDTDelta | CRDTState;
  versionVector: Map<string, number>;
}
```

#### 6.4.3 同步策略

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sync Strategy                               │
├─────────────────────────────────────────────────────────────────┤
│  1. 乐观本地更新                                                  │
│     └─→ 用户操作立即应用本地状态                                   │
│                                                                  │
│  2. 异步广播                                                      │
│     └─→ 通过WebSocket广播CRDT操作                                  │
│                                                                  │
│  3. 冲突解决                                                      │
│     └─→ CRDT自动合并，无冲突需要手动解决                             │
│                                                                  │
│  4. 状态补偿                                                      │
│     └─→ 检测到丢失消息时请求全量同步                                 │
│                                                                  │
│  5. 心跳检测                                                      │
│     └─→ 30秒无消息触发状态校验                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 记忆更新触发点

| 事件 | 触发记忆更新 |
|------|-------------|
| 对话结束 | Session Memory → Persistent Storage |
| 工具调用 | Working Context更新 |
| 用户反馈 | Learned Pattern记录 |
| 资产编辑 | Real-time Collaboration广播 |
| 标准变更 | Organization Memory版本更新 |

### 6.5 自动记忆提取 (Auto Memory Extraction)

参考Claude Code Session Memory和OpenClaw的自动提取机制，实现用户无感知的智能记忆捕获。

#### 6.5.1 自动提取策略

```typescript
interface AutoMemoryExtractor {
  // 提取触发条件（可配置）
  extractionPolicy: {
    // 基于Token阈值（Claude Code策略）
    tokenThresholds: {
      first: 10000;      // 首次提取：10k tokens
      subsequent: 5000;  // 后续更新：每5k tokens
    };
    // 基于工具调用
    toolCallInterval: 3;  // 每3次工具调用
    // 基于时间
    timeInterval: 5 * 60 * 1000;  // 5分钟间隔
    // 基于关键事件
    events: [
      'asset_published',
      'dirty_resolved',
      'error_occurred',
      'decision_made',
      'user_feedback'
    ];
  };

  // 后台提取（不阻塞用户）
  async extractInBackground(session: SessionMemory): Promise<void> {
    const candidates = await this.identifyCandidates(session);
    if (candidates.length > 0) {
      // 存入候选池，等待用户确认
      await this.candidatePool.store(candidates);
      // 通知用户有新记忆待确认
      this.notifyUser(candidates.length);
    }
  }

  // 候选识别
  async identifyCandidates(session: SessionMemory): Promise<MemoryCandidate[]> {
    const recentTurns = session.getRecentTurns(20);
    const toolCalls = session.getRecentToolCalls(10);

    const [decisions, patterns, errors] = await Promise.all([
      // 关键决策提取
      this.llm.extractDecisions(recentTurns),
      // 模式识别
      this.llm.extractPatterns(toolCalls),
      // 错误学习
      this.llm.extractErrors(session.errorLogs),
    ]);

    return [...decisions, ...patterns, ...errors];
  }
}

// LLM提取提示词模板
const EXTRACTION_PROMPTS = {
  decisions: `
分析以下对话，提取关键决策点：
- 用户做出的技术选择
- 架构决策
- 弃用的方案及原因
输出JSON格式：{ "decisions": [{"decision": "", "rationale": "", "confidence": 0-1}] }
`,
  patterns: `
分析以下工具调用序列，识别可复用模式：
- 常见工作流程
- 有效的解决路径
- 用户偏好
输出JSON格式：{ "patterns": [{"pattern": "", "context": "", "confidence": 0-1}] }
`,
  errors: `
分析以下错误日志，提取避免方案：
- 错误根因
- 解决方案
- 预防措施
输出JSON格式：{ "errors": [{"error": "", "solution": "", "prevention": ""}] }
`,
};
```

#### 6.5.2 候选记忆管理

```typescript
interface MemoryCandidate {
  id: string;
  type: 'decision' | 'pattern' | 'error' | 'preference';
  content: string;
  confidence: number;
  source: {
    sessionId: string;
    turnRange: [number, number];
    timestamp: Date;
  };
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  userFeedback?: {
    action: 'approve' | 'reject' | 'edit';
    editedContent?: string;
    timestamp: Date;
  };
}

interface CandidatePool {
  // 存储候选
  async store(candidates: MemoryCandidate[]): Promise<void>;

  // 获取待确认列表
  async getPending(userId: string): Promise<MemoryCandidate[]>;

  // 批量确认（类似GitHub批量操作）
  async batchProcess(
    candidateIds: string[],
    action: 'approve' | 'reject',
    options?: { autoUpgrade?: boolean }
  ): Promise<void>;

  // 自动升级高置信度候选
  async autoUpgrade(threshold: number = 0.9): Promise<void> {
    const highConfidence = await this.query({
      confidence: { $gte: threshold },
      status: 'pending',
      age: { $gte: 7 * 24 * 60 * 60 * 1000 }, // 7天未处理
    });

    for (const candidate of highConfidence) {
      await this.upgradeToProjectMemory(candidate);
    }
  }
}
```

### 6.6 文件透明度层 (File Transparency Layer)

参考OpenClaw的"Markdown即记忆"哲学，增加人类可读、可编辑、可审计的文件层。

#### 6.6.1 核心原则

> "Everything the agent knows is plain Markdown on disk. If it hasn't been written down, the agent doesn't remember it." — OpenClaw Philosophy

**优势**：
- **人类可读**：无需工具即可查看记忆内容
- **可编辑**：用户可直接修改Markdown文件
- **可审计**：`git diff` 追踪记忆变更
- **无黑盒**：完全透明，可调试

#### 6.6.2 自动导出机制

```typescript
interface FileTransparencyLayer {
  // 导出配置
  config: {
    // 导出路径（相对于项目根目录）
    outputDir: '.andos/memory';
    // 自动导出触发
    autoExport: {
      onSessionEnd: true;
      onPatternLearned: true;
      onSchedule: '0 0 * * *';  // 每日凌晨
    };
    // 文件分割策略
    splitStrategy: 'by-type' | 'by-date' | 'single-file';
  };

  // 主要导出方法
  async exportAll(projectId: string): Promise<void> {
    const project = await this.loadProjectMemory(projectId);

    // 1. Project Memory → PROJECT_MEMORY.md
    await this.exportProjectMemory(project);

    // 2. Session Summary → sessions/YYYY-MM-DD.md
    await this.exportSessionSummaries(project);

    // 3. Organization Standards → STANDARDS.md（继承链展开）
    await this.exportEffectiveStandards(project);

    // 4. Graph Memory → DEPENDENCIES.mermaid
    await this.exportGraphVisualization(project);
  }

  // Project Memory 导出
  async exportProjectMemory(project: ProjectMemory): Promise<void> {
    const content = this.formatProjectMemory(project);
    await fs.writeFile(
      path.join(this.config.outputDir, 'PROJECT_MEMORY.md'),
      content
    );
  }

  // Markdown格式模板
  formatProjectMemory(memory: ProjectMemory): string {
    return `# Project Memory: ${memory.projectId}

> **Last Updated**: ${new Date().toISOString()}
> **Auto-generated by**: Agent Memory System
> **Version**: ${memory.version}

## 📋 Table of Contents

- [Learned Patterns](#learned-patterns) (Auto-extracted)
- [User Preferences](#user-preferences) (Confirmed)
- [Architecture Decisions](#architecture-decisions)
- [Active Sessions](#active-sessions)

---

## 🧠 Learned Patterns

<!-- AUTO-EXTRACTED: Review and confirm in UI -->

${memory.learnedPatterns.map(p => `
### ${p.type}: ${p.id}

**Pattern**: ${p.pattern}

**Confidence**: ${(p.confidence * 100).toFixed(1)}% | **Frequency**: ${p.frequency} | **Last Used**: ${p.lastUsedAt.toISOString()}

**Metadata**:
\`\`\`json
${JSON.stringify(p.metadata, null, 2)}
\`\`\`
`).join('\n---\n')}

## 👤 User Preferences

<!-- CONFIRMED: Safe to edit manually -->

${memory.userPreferences.map(pref => `- **${pref.key}**: ${pref.value} *(confirmed: ${pref.confirmedAt})*`).join('\n')}

## 🏗️ Architecture Decisions

| Date | Decision | Rationale | Status |
|------|----------|-----------|--------|
${memory.decisions.map(d => `| ${d.date} | ${d.decision} | ${d.rationale} | ${d.status} |`).join('\n')}

## 📊 Active Sessions

| Session | User | Started | Last Activity |
|---------|------|---------|---------------|
${memory.activeSessions.map(s => `| ${s.id} | ${s.userName} | ${s.startedAt} | ${s.lastActivityAt} |`).join('\n')}

---

*This file is automatically generated. You can:*
- *View it to understand what the agent knows*
- *Edit "User Preferences" section manually*
- *Use \`/memory confirm\` to approve pending patterns*
`;
  }
}
```

#### 6.6.3 双向同步

```typescript
interface BidirectionalSync {
  // 数据库 → 文件（自动）
  async syncToFile(change: MemoryChange): Promise<void> {
    const filePath = this.resolveFilePath(change);
    const current = await this.readFile(filePath);
    const updated = this.applyChange(current, change);
    await this.writeFile(filePath, updated);
    await this.gitTrack(filePath, change);
  }

  // 文件 → 数据库（用户手动编辑后）
  async syncFromFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = this.parseMarkdown(content);

    // 验证格式
    if (!this.validateFormat(parsed)) {
      throw new Error('Invalid markdown format');
    }

    // 检测变更
    const current = await this.loadFromDatabase(parsed.id);
    const diff = this.computeDiff(current, parsed);

    // 应用安全变更（仅用户可编辑区域）
    for (const change of diff.userEditable) {
      await this.applyToDatabase(change);
    }

    // 标记冲突（自动生成的区域被修改）
    if (diff.autoGenerated.length > 0) {
      await this.flagConflicts(diff.autoGenerated);
    }
  }

  // Git集成
  async gitTrack(filePath: string, change: MemoryChange): Promise<void> {
    const message = `memory: ${change.type} ${change.action}

- Pattern: ${change.patternId || 'N/A'}
- Confidence: ${change.confidence || 'N/A'}
- Auto-extracted: ${change.autoExtracted}
`;
    await git.add(filePath);
    await git.commit(message, { allowEmpty: false });
  }
}
```

### 6.7 混合检索引擎 (Hybrid Search) - V3.0

> **NOTE**: 混合检索引擎(Vector + BM25)延期至V3.0实现。
> V1.5-V2.5阶段使用关键词检索 + KV索引满足基本需求。

实现Vector + BM25混合检索，参考OpenClaw的70/30权重策略。

#### 6.7.1 RRF融合算法

```typescript
interface HybridSearchEngine {
  // 混合搜索配置
  config: {
    weights: {
      vector: 0.7;    // 语义相似度
      keyword: 0.3;   // BM25关键词
    };
    rrfK: 60;         // RRF融合参数
    timeDecay: {
      enabled: true;
      halfLife: 7;    // 7天半衰期
    };
  };

  // 主搜索接口
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // 1. 并行执行两种检索
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, { limit: options.limit * 2 }),
      this.bm25Search(query, { limit: options.limit * 2 }),
    ]);

    // 2. 应用时间衰减
    const decayedVector = this.applyTimeDecay(vectorResults);
    const decayedKeyword = this.applyTimeDecay(keywordResults);

    // 3. RRF融合排序
    const fused = this.reciprocalRankFusion([
      { results: decayedVector, weight: this.config.weights.vector },
      { results: decayedKeyword, weight: this.config.weights.keyword },
    ]);

    // 4. 返回Top-K
    return fused.slice(0, options.limit);
  }

  // Vector语义搜索
  async vectorSearch(query: string, options: { limit: number }): Promise<RawResult[]> {
    const embedding = await this.embeddings.create(query);
    return this.vectorDB.search(embedding, {
      limit: options.limit,
      threshold: 0.7,
    });
  }

  // BM25关键词搜索
  async bm25Search(query: string, options: { limit: number }): Promise<RawResult[]> {
    // 使用PostgreSQL FTS5或Elasticsearch
    return this.keywordDB.search(query, {
      limit: options.limit,
      useBm25: true,
    });
  }

  // 时间衰减（指数衰减）
  applyTimeDecay(results: RawResult[]): RawResult[] {
    return results.map(r => {
      const daysSinceAccess = (Date.now() - r.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);
      const decayFactor = Math.exp(-0.1 * daysSinceAccess); // λ = 0.1
      return {
        ...r,
        score: r.score * decayFactor,
      };
    });
  }

  // RRF融合（Reciprocal Rank Fusion）
  reciprocalRankFusion(lists: WeightedResult[]): SearchResult[] {
    const scores = new Map<string, number>();
    const k = this.config.rrfK;

    for (const { results, weight } of lists) {
      for (let i = 0; i < results.length; i++) {
        const id = results[i].id;
        const rank = i + 1;
        // RRF公式: score = weight * (1 / (k + rank))
        const rrfScore = weight * (1 / (k + rank));
        scores.set(id, (scores.get(id) || 0) + rrfScore);
      }
    }

    return Array.from(scores.entries())
      .map(([id, score]) => ({
        id,
        score,
        ...this.getMetadata(id),
      }))
      .sort((a, b) => b.score - a.score);
  }
}
```

#### 6.7.2 检索结果解释

```typescript
interface SearchExplainability {
  // 为每个结果生成解释
  explain(result: SearchResult, query: string): Explanation {
    return {
      // 为什么匹配
      matchReason: this.analyzeMatch(result, query),
      // 分数组成
      scoreBreakdown: {
        vector: result.vectorScore,
        keyword: result.keywordScore,
        timeDecay: result.decayFactor,
        final: result.score,
      },
      // 相关片段
      relevantSnippets: result.highlights,
      // 建议
      suggestions: this.generateSuggestions(result, query),
    };
  }
}
```

### 6.8 记忆升级工作流 (Memory Upgrade Workflow)

实现从自动提取到永久确认的升级路径，参考Claude Code的`/remember`机制。

#### 6.8.1 升级路径设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     Memory Upgrade Pipeline                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Session (临时) → Candidate (候选) → Project (永久) → Org (标准)  │
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            │
│  │  Auto       │   │  User       │   │  Admin      │            │
│  │  Extracted  │──▶│  Confirmed  │──▶│  Promoted   │            │
│  │             │   │             │   │             │            │
│  │ • Decisions │   │ • Approved  │   │ • Standards │            │
│  │ • Patterns  │   │ • Edited    │   │ • Policies  │            │
│  │ • Errors    │   │ • Rejected  │   │             │            │
│  └─────────────┘   └─────────────┘   └─────────────┘            │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                  Storage Target                       │       │
│  │  Session: Redis (24h) → Project: PostgreSQL → Org: PG │       │
│  │  File: 自动导出        → 手动确认      → 版本控制      │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.8.2 升级接口

```typescript
interface MemoryUpgradeWorkflow {
  // 自动提取 → 候选池
  async autoExtract(session: SessionMemory): Promise<void>;

  // 候选池 → 用户确认
  async proposeForReview(userId: string): Promise<ReviewBatch> {
    const candidates = await this.candidatePool.getPending(userId);

    return {
      total: candidates.length,
      highConfidence: candidates.filter(c => c.confidence >= 0.9),
      mediumConfidence: candidates.filter(c => c.confidence >= 0.7 && c.confidence < 0.9),
      lowConfidence: candidates.filter(c => c.confidence < 0.7),
      preview: candidates.slice(0, 5).map(this.formatForReview),
    };
  }

  // 用户确认 → Project Memory
  async confirmUpgrade(
    candidateId: string,
    action: 'approve' | 'reject' | 'edit',
    editedContent?: string
  ): Promise<void> {
    const candidate = await this.candidatePool.get(candidateId);

    switch (action) {
      case 'approve':
        await this.upgradeToProjectMemory(candidate);
        break;
      case 'reject':
        await this.candidatePool.reject(candidateId);
        break;
      case 'edit':
        await this.upgradeToProjectMemory({
          ...candidate,
          content: editedContent,
          status: 'edited',
        });
        break;
    }
  }

  // Project Memory → Organization Standards（管理员）
  async promoteToOrganization(
    patternId: string,
    organizationId: string,
    adminId: string
  ): Promise<void> {
    const pattern = await this.projectMemory.get(patternId);

    // 创建组织级标准
    await this.organizationMemory.createStandard({
      type: 'learned_pattern',
      content: pattern,
      promotedFrom: pattern.projectId,
      promotedBy: adminId,
      promotedAt: new Date(),
    });

    // 更新项目记忆的upstream引用
    await this.projectMemory.updateUpstream(patternId, organizationId);
  }

  // 批量操作（类似GitHub批量处理PR）
  async batchProcess(
    candidateIds: string[],
    action: 'approve' | 'reject'
  ): Promise<BatchResult> {
    const results = await Promise.all(
      candidateIds.map(id => this.confirmUpgrade(id, action).catch(e => ({ id, error: e })))
    );

    return {
      processed: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).map(r => ({ id: r.id, error: r.error })),
    };
  }
}

// UI组件接口
interface MemoryReviewUI {
  // 显示确认弹窗
  showConfirmationDialog(batch: ReviewBatch): Promise<UserAction>;

  // 内联编辑
  enableInlineEdit(candidateId: string): Promise<string>;

  // 差异对比
  showDiff(original: string, edited: string): void;

  // 批量选择
  enableBatchSelect(candidates: MemoryCandidate[]): Promise<string[]>;
}
```

#### 6.8.3 `/remember` 风格命令

```typescript
// 类似Claude Code的/remember命令
interface RememberCommand {
  // 显式记住当前内容
  async execute(content?: string, options?: RememberOptions): Promise<void> {
    const toRemember = content || this.inferFromContext();

    const memory: MemoryCandidate = {
      id: generateUUID(),
      type: options?.type || 'manual',
      content: toRemember,
      confidence: 1.0,  // 用户显式输入，置信度最高
      source: {
        sessionId: this.currentSession.id,
        turnRange: [this.currentTurn - 5, this.currentTurn],
        timestamp: new Date(),
      },
      status: 'approved',  // 直接批准，跳过候选池
    };

    // 直接升级到Project Memory
    await this.upgradeToProjectMemory(memory);

    // 立即导出到文件
    await this.fileLayer.exportPattern(memory);

    // 刷新Agent Bootstrap
    await this.agentSystem.refreshBootstrap();

    // 用户反馈
    this.notifyUser(`✅ 已记住: "${toRemember.slice(0, 50)}..."`);
  }

  // 从上下文推断
  inferFromContext(): string {
    const recentTurns = this.session.getRecentTurns(3);
    return this.llm.summarize(recentTurns);
  }
}
```

---

## 7. 关键决策

### 7.1 架构决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| **存储架构** | KV + Graph (Phase 1) | KV存储满足精确查询，Graph支持关系推理 |
| **MCP兼容** | 原生支持 | 遵循行业标准，降低生态集成成本 |
| **Session TTL** | 24小时 | 平衡恢复需求与存储成本 |
| **向量维度** | 1536 (OpenAI) | 与当前Embedding模型兼容 |
| **Project Sync** | WebSocket + CRDT | 实时协作+最终一致性 |
| **Pattern Confidence** | 动态计算 | 基于频率、时效性、用户反馈 |
| **Inheritance Resolution** | 启动时计算 | 避免运行时性能开销 |
| **Storage Separation** | 按层分离 | 不同层有不同访问模式和生命周期 |

### 7.2 技术选型决策

| 决策项 | 选择 | 备选 | 理由 |
|--------|------|------|------|
| **Vector DB** | Weaviate | Pinecone, Chroma | 开源、自托管、GraphQL接口 |
| **Graph DB** | Neo4j | RedisGraph | 成熟稳定、Cypher查询、企业级 |
| **KV Store** | Redis | KeyDB | 成熟、Pub/Sub、广泛支持 |
| **CRDT实现** | YATA | Automerge | 文本协同专用、性能好 |
| **Embedding** | OpenAI | Local模型 | 质量优先、成本可控 |

### 7.3 记忆管理决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| **遗忘策略** | TTL + 容量 + 显式 + 冲突 | Mem0风格多策略组合 |
| **压缩触发** | 50轮 / 80K tokens | 平衡性能与上下文完整性 |
| **冲突解决** | 自动 + 人工确认 | 高置信度自动，低置信度人工 |
| **上下文预算** | 128K默认分配 | 基于Claude 3.5上下文窗口 |
| **记忆优先级** | 多因子加权 | 相关性35% + 时效25% + 频率20% + 置信15% + 反馈5% |

### 7.4 协作决策

| 决策项 | 决策 | 理由 |
|--------|------|------|
| **同步模式** | 乐观更新 + 异步广播 | 低延迟用户体验 |
| **一致性模型** | 最终一致性 | CRDT保证，无需全局锁 |
| **心跳间隔** | 30秒 | 平衡实时性与网络开销 |
| **离线支持** | 本地队列 + 重连同步 | 断网可用，恢复后同步 |

### 7.5 行业对齐决策

基于对Claude Code、OpenClaw、Mem0等业界方案的研究，做出以下对齐决策：

| 决策项 | 对齐方案 | 业界参考 | 差异化设计 |
|--------|----------|----------|------------|
| **自动提取策略** | Token阈值 + 后台提取 | Claude Code Session Memory | 增加候选池机制，用户确认后升级 |
| **文件透明度** | Markdown自动导出 + 双向同步 | OpenClaw Philosophy | 增加结构化数据导出，不仅限于文本 |
| **混合检索** | ~~Vector 70% + BM25 30% + RRF融合~~ **(Deferred to V3.0)** | OpenClaw Hybrid Search | V1.5-V2.5阶段使用KV索引 + 关键词检索，V3.0引入Vector |
| **记忆升级** | Session → Candidate → Project → Org | Claude Code `/remember` + Mem0 | 增加批量处理界面和自动升级机制 |
| **提取触发** | 10K/5K tokens + 关键事件 | Claude Code阈值策略 | 增加工具调用间隔和时间间隔作为辅助触发 |
| **候选管理** | 置信度分层 + 用户确认 | Mem0 Pattern确认 | 增加7天自动升级高置信度候选 |
| **检索解释** | 分数拆解 + 匹配原因 | OpenClaw透明度 | 增加相关片段高亮和改进建议 |

**关键对齐原则：**

1. **Claude Code风格提取**：采用相同的Token阈值（10K首次/5K后续），确保与成熟实践一致
2. **OpenClaw透明度**：Markdown即记忆，人类可读、可编辑、可审计
3. **Mem0风格管理**：显式remember/forget操作，动态遗忘，冲突解决
4. **增量创新**：在业界验证的模式上增加ANDOS特有的层级架构和升级工作流

---

## 8. 实施建议

### Phase 1: V1.5 - Session Memory + KV Storage (Week 1-3)

**目标**: 实现会话级记忆恢复和精确状态存储

- [x] **KV Storage基础**
  - [x] Redis + PostgreSQL双写实现
  - [x] Namespace隔离机制
  - [x] TTL过期管理

- [ ] **Session Memory核心**
  - [ ] Session数据模型
  - [ ] 检查点机制 (Checkpoint)
  - [ ] 24h过期恢复
  - [ ] Conversation History存储

- [ ] **Context Engineering基础**
  - [ ] Token预算管理
  - [ ] 基础记忆注入策略
  - [ ] 上下文组装管道

- [ ] **MCP兼容接口**
  - [ ] MCP Server基础框架
  - [ ] memory_remember/memory_forget工具
  - [ ] Resource URI规范

### Phase 2: V1.5 - Project Static Memory (Week 4-5)

**目标**: 实现项目级静态上下文共享

- [ ] **Project Context存储**
  - [ ] Shared Context数据模型
  - [ ] CRUD API实现
  - [ ] 与Agent Bootstrap集成

- [ ] **Agent集成增强**
  - [ ] 启动时记忆加载
  - [ ] Bootstrap文件动态生成
  - [ ] Organization标准继承

### Phase 3: V2.0 - Pattern Learning + Collaboration Prep (Week 6-8)

**目标**: 实现模式学习和协作准备

- [ ] **Pattern Learning (KV-based)**
  - [ ] Pattern识别与存储（基于关键词和规则）
  - [ ] 置信度计算
  - [ ] 用户反馈收集

- [ ] **File Transparency Layer**
  - [ ] Markdown自动导出机制
  - [ ] 双向同步实现
  - [ ] Git集成

- [ ] **Context Engineering增强**
  - [ ] 关键词记忆检索
  - [ ] 基于频率/时效的相关性排序
  - [ ] 动态上下文裁剪

### Phase 4: V2.0 - Real-time Collaboration (Week 9-11)

**目标**: 实现多用户实时协作

- [ ] **WebSocket服务**
  - [ ] Socket.io/WebSocket服务
  - [ ] Presence管理
  - [ ] 房间管理

- [ ] **CRDT实现**
  - [ ] YATA文档协同
  - [ ] LWW光标同步
  - [ ] 版本向量管理

- [ ] **协作功能**
  - [ ] 光标位置同步
  - [ ] 草稿内容协同
  - [ ] 用户活动广播

### Phase 5: V2.5 - Graph Memory + Organization (Week 12-14)

**目标**: 实现图记忆和组织级继承

- [ ] **Graph Storage**
  - [ ] Neo4j集成
  - [ ] Cypher查询接口
  - [ ] 依赖关系建模

- [ ] **Organization Memory**
  - [ ] 继承链解析
  - [ ] Override机制
  - [ ] 标准版本管理

- [ ] **Graph Memory应用**
  - [ ] 资产依赖查询
  - [ ] 影响分析
  - [ ] 关键路径识别

### Phase 6: V2.5 - Dynamic Forgetting + Optimization (Week 15-16)

**目标**: 实现智能记忆管理和性能优化

- [ ] **Dynamic Forgetting**
  - [ ] TTL自动清理
  - [ ] 容量溢出淘汰
  - [ ] 冲突检测与解决

- [ ] **Memory Compression**
  - [ ] 对话压缩
  - [ ] 模式抽象
  - [ ] 摘要生成

- [ ] **Performance Optimization**
  - [ ] 缓存策略优化
  - [ ] 查询性能调优
  - [ ] 存储分层优化

### Phase 7: V3.0 - Vector Memory (Future)

> **NOTE**: Vector存储和语义检索延期至V3.0实现

**目标**: 实现基于Embedding的语义检索和混合搜索

- [ ] **Vector Storage**
  - [ ] Weaviate/pgvector集成
  - [ ] Embedding服务集成
  - [ ] 向量索引管理

- [ ] **Semantic Retrieval**
  - [ ] 语义相似度搜索
  - [ ] 混合检索引擎 (Vector + BM25 + RRF)
  - [ ] 语义缓存策略

- [ ] **Pattern Learning增强**
  - [ ] 基于语义相似度的模式匹配
  - [ ] 自动模式发现
  - [ ] 模式聚类分析

### 版本对照表

| 版本 | 核心功能 | 存储类型 | 主要特性 |
|------|----------|----------|----------|
| **V1.5** | Session + Project Static | KV (Redis) + PostgreSQL | 会话恢复、项目上下文、MCP接口、自动提取 |
| **V2.0** | Real-time Collaboration | + CRDT + WebSocket | 实时协作、Pattern学习、文件透明度层 |
| **V2.5** | Graph + Organization | + Graph (Neo4j) | 依赖分析、组织继承、智能遗忘 |
| **V3.0** | Vector Memory (Future) | + Vector DB | 语义检索、混合搜索、Embedding |

---

## 9. 附录

### 9.1 与现有Agent System的关系

```
┌─────────────────────────────────────────┐
│           Agent System                  │
├─────────────────────────────────────────┤
│  - Primary/Subagent Manager             │
│  - Skill System                         │
│  - Permission & Sandbox                 │
│  - Session Engine                       │
│  - Tool Controller                      │
├─────────────────────────────────────────┤
│  - Memory Service (New)                 │
│    ├─ Session Memory                    │
│    ├─ Project Memory                    │
│    └─ Organization Memory               │
├─────────────────────────────────────────┤
│  - Collaboration Service (New)          │
│    ├─ Real-time Sync                    │
│    └─ Presence Management               │
└─────────────────────────────────────────┘
```

### 9.2 参考资料

**学术研究**
- [MemGPT Paper](https://arxiv.org/abs/2310.08560)
- [YATA: Efficient Text CRDT](https://www.researchgate.net/publication/362250143_YATA_Efficient_Text_CRDT)

**工业实践**
- [LangChain Memory](https://python.langchain.com/docs/concepts/memory/)
- [OpenAI Assistants API](https://platform.openai.com/docs/assistants/overview)
- [AutoGPT Memory](https://github.com/Significant-Gravitas/AutoGPT)
- [CrewAI Memory](https://docs.crewai.com/concepts/memory)

**2024-2025 新进展**
- [Mem0 - Memory Layer for AI Apps](https://github.com/mem0ai/mem0)
- [Letta - Memory-Augmented LLMs](https://github.com/letta-ai/letta)
- [MCP - Model Context Protocol](https://modelcontextprotocol.io/)
- [Context Engineering - Beyond Prompting](https://www.anthropic.com/research)

**行业最佳实践参考**
- [Claude Code Session Memory](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) - 自动记忆提取、Token阈值策略
- [Claude Code Skills](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/skills) - `/remember` 命令、技能记忆机制
- [OpenClaw - Markdown as Source of Truth](https://openclaw.io/) - 文件透明度层、人类可读记忆
- [OpenClaw Hybrid Search](https://openclaw.io/docs/search) - Vector + BM25混合检索、RRF融合

**存储技术**
- [Weaviate Vector Search](https://weaviate.io/)
- [Neo4j Graph Database](https://neo4j.com/)
- [Yjs - CRDT Framework](https://github.com/yjs/yjs)
- [Automerge - CRDT Library](https://automerge.org/)

---

*本文档是Agent Memory System的独立设计方案，与主Agent System文档[agent-system.md](./agent-system.md)配合使用。*
