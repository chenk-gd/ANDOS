# API 接口设计文档（MVP）

**Date:** 2026-03-13
**Status:** Draft
**Version:** 1.0
**Base URL:** `https://api.andos.dev/v1`

---

## 1. 设计原则

1. **RESTful 风格**：使用标准 HTTP 方法（GET/POST/PUT/DELETE）
2. **JSON 格式**：请求/响应统一使用 JSON
3. **资源导向**：URL 表示资源，而非动作
4. **版本化**：URL 中包含版本号（`/v1/`）
5. **分页**：列表接口支持分页（cursor-based）
6. **幂等性**：关键操作支持幂等（使用 `Idempotency-Key` 头部）
7. **扁平化**：避免过深嵌套，使用复合 ID（如 `asset-xxx:v1.0`）

---

## 2. 基础规范

### 2.1 认证方式

**JWT Bearer Token**

```http
Authorization: Bearer <jwt_token>
```

Token 包含：
- `sub`: 用户ID
- `exp`: 过期时间
- `scope`: 权限范围

### 2.1.1 幂等性机制（P0）

关键操作（创建、更新）支持幂等，防止重复提交：

```http
POST /assets
Headers:
  Idempotency-Key: <uuid>           # 客户端生成的唯一键
  Idempotency-Expiry: 3600          # 可选，幂等窗口期（秒）

Request:
{
  "name": "用户登录模块",
  "slug": "user-login"
}
```

**服务端行为**：
1. 首次请求：创建资源，缓存请求体和响应
2. 重复请求（Key 存在且在窗口期内）：返回首次响应，不创建新资源
3. 重复请求（Key 存在但请求体不同）：返回 409 Conflict

**响应示例（首次）**：
```json
{
  "data": {"id": "asset-xxx", ...},
  "meta": {
    "idempotency_key": "key-xxx",
    "idempotency_expires_at": "2026-03-13T11:00:00Z"
  }
}
```

**响应示例（重复）**：
```json
{
  "data": {"id": "asset-xxx", ...},
  "meta": {
    "idempotency_key": "key-xxx",
    "idempotent": true          # 标记为幂等命中
  }
}
```

### 2.2 请求格式

```http
Content-Type: application/json
Accept: application/json
```

### 2.2.1 字段过滤（P1）

支持稀疏字段集，减少数据传输：

```http
GET /assets/{asset_id}?fields=name,state,current_version,owners
```

**响应（仅返回指定字段）**：
```json
{
  "data": {
    "name": "用户登录模块",
    "state": "clean",
    "current_version": "v1.0",
    "owners": ["user-xxx"]
  }
}
```

**嵌套资源字段过滤**：
```http
GET /assets/{asset_id}?include=versions&fields[versions]=version,published_at
```

### 2.3 响应格式

**成功响应（2xx）**

```json
{
  "data": { ... },           // 响应数据
  "meta": {                  // 元信息（分页等）
    "page": 1,
    "per_page": 20,
    "total": 100
  }
}
```

**列表响应**

```json
{
  "data": [
    { ... },
    { ... }
  ],
  "meta": {
    "cursor": "eyJpZCI6...",
    "has_more": true
  }
}
```

**错误响应（4xx/5xx）**

```json
{
  "error": {
    "code": "ASSET_NOT_FOUND",
    "message": "Asset with id 'xxx' not found",
    "details": { ... },       // 额外错误信息
    "request_id": "req_xxx"   // 用于追踪
  }
}
```

### 2.4 HTTP 状态码

| 状态码 | 使用场景 |
|--------|----------|
| 200 OK | 成功 |
| 201 Created | 创建成功 |
| 204 No Content | 删除成功，无返回体 |
| 400 Bad Request | 请求参数错误 |
| 401 Unauthorized | 未认证 |
| 403 Forbidden | 无权限 |
| 404 Not Found | 资源不存在 |
| 409 Conflict | 资源冲突（如重复创建） |
| 422 Unprocessable Entity | 业务逻辑错误 |
| 429 Too Many Requests | 限流 |
| 500 Internal Server Error | 服务器错误 |

### 2.4.1 限流与配额（P1）

**响应头声明限流状态**：

```http
X-RateLimit-Limit: 1000        # 每小时限额
X-RateLimit-Remaining: 999     # 剩余
X-RateLimit-Reset: 1710327600  # 重置时间戳（Unix timestamp）
```

**超过限额响应**：
```http
Status: 429 Too Many Requests
Retry-After: 3600  # 秒
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "API rate limit exceeded",
    "details": {
      "limit": 1000,
      "window": "1h",
      "retry_after": 3600
    }
  }
}
```

**分级限流**：

| 用户类型 | 限额 | 突发 |
|----------|------|------|
| 匿名 | 60/h | 10 |
| 普通用户 | 1000/h | 100 |
| 付费用户 | 10000/h | 1000 |
| 内部服务 | 无限制 | - |

### 2.5 错误码定义

```yaml
# 通用错误
COMMON:
  INVALID_REQUEST: "请求格式错误"
  UNAUTHORIZED: "未认证"
  FORBIDDEN: "无权限访问"
  NOT_FOUND: "资源不存在"
  RATE_LIMITED: "请求过于频繁"
  INTERNAL_ERROR: "服务器内部错误"
  IDEMPOTENCY_KEY_CONFLICT: "幂等键与请求不匹配"
  PRECONDITION_FAILED: "资源已被修改"  # 乐观锁失败

# 批量操作错误
BATCH:
  BATCH_TOO_LARGE: "批量操作数量超限"
  PARTIAL_FAILURE: "部分操作失败"

# 资产错误
ASSET:
  ASSET_NOT_FOUND: "资产不存在"
  ASSET_ALREADY_EXISTS: "资产已存在"
  INVALID_ASSET_TYPE: "无效的资产类型"
  INVALID_STATE_TRANSITION: "无效的状态转换"
  CIRCULAR_DEPENDENCY: "检测到循环依赖"
  VERSION_ALREADY_EXISTS: "版本已存在"
  DIRTY_NOT_RESOLVED: "存在未处理的dirty依赖"

# 依赖错误
DEPENDENCY:
  DEPENDENCY_NOT_FOUND: "依赖关系不存在"
  INVALID_DEPENDENCY: "无效的依赖关系"
  CROSS_LAYER_NOT_ALLOWED: "不允许跨层依赖"

# 权限错误
PERMISSION:
  INSUFFICIENT_PERMISSION: "权限不足"
  ASSET_LOCKED: "资产被锁定"
```

---

## 3. 接口清单

### 3.1 资产接口（Assets）

#### 创建资产

```http
POST /assets
```

**请求**

```json
{
  "name": "用户登录模块需求",
  "slug": "user-login-requirement",
  "description": "实现用户登录功能的需求规格",
  "type": "requirement",
  "tags": ["auth", "login", "user"],
  "project_id": "proj-xxx",
  "owners": ["user-xxx"],
  "metadata": {
    "priority": "high",
    "due_date": "2026-03-30"
  }
}
```

**响应 201**

```json
{
  "data": {
    "id": "asset-xxx",
    "name": "用户登录模块需求",
    "slug": "user-login-requirement",
    "description": "实现用户登录功能的需求规格",
    "type": "requirement",
    "tags": ["auth", "login", "user"],
    "state": "draft",
    "project_id": "proj-xxx",
    "owners": ["user-xxx"],
    "metadata": {
      "priority": "high",
      "due_date": "2026-03-30"
    },
    "created_at": "2026-03-13T10:00:00Z",
    "updated_at": "2026-03-13T10:00:00Z"
  }
}
```

#### 获取资产详情

```http
GET /assets/{asset_id}
```

**查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `fields` | string | 指定返回字段：`name,state,owners`（P1：稀疏字段集） |
| `include` | string | 包含的关联数据：`versions`, `dependencies`, `upstream`, `downstream` |

**响应 200**

```json
{
  "data": {
    "id": "asset-xxx",
    "name": "用户登录模块需求",
    "type": "requirement",
    "state": "clean",
    "current_version": "v1.0",
    "versions": [
      {
        "version": "v1.0",
        "state": "published",
        "published_at": "2026-03-13T10:00:00Z"
      }
    ],
    "dependencies": {
      "upstream": [],
      "downstream": [
        {
          "asset_id": "asset-yyy",
          "name": "登录模块设计",
          "version": "v1.0",
          "type": "design"
        }
      ]
    },
    "created_at": "2026-03-13T10:00:00Z",
    "updated_at": "2026-03-13T10:00:00Z"
  }
}
```

#### 更新资产（P2：支持乐观锁）

```http
PUT /assets/{asset_id}
Headers:
  If-Match: "v1.0-abc123"  # 可选，上次获取的 ETag
```

**请求**

```json
{
  "name": "用户登录模块需求（更新）",
  "description": "更新后的描述",
  "tags": ["auth", "login", "user", "oauth"],
  "owners": ["user-xxx", "user-yyy"]
}
```

**响应 200**

```json
{
  "data": {
    "id": "asset-xxx",
    "name": "用户登录模块需求（更新）",
    "updated_at": "2026-03-13T11:00:00Z",
    "version": "v1.1"
  }
}
```

**乐观锁失败响应 412**（If-Match 与服务端版本不匹配）
```json
{
  "error": {
    "code": "RESOURCE_MODIFIED",
    "message": "Asset has been modified by another user",
    "details": {
      "current_version": "v1.1",
      "conflict_fields": ["description"]
    }
  }
}
```

> **注意**：在 `GET /assets/{id}` 响应头中获取 `ETag: "v1.0-abc123"`

#### 批量操作资产（P1）

```http
POST /assets/batch
```

**请求**
```json
{
  "operations": [
    {
      "id": "op-1",
      "method": "POST",
      "data": {
        "name": "需求1",
        "type": "requirement",
        "project_id": "proj-xxx"
      }
    },
    {
      "id": "op-2",
      "method": "POST",
      "data": {
        "name": "需求2",
        "type": "requirement",
        "project_id": "proj-xxx"
      }
    }
  ]
}
```

**响应 207 Multi-Status**
```json
{
  "data": {
    "results": [
      {
        "id": "op-1",
        "status": 201,
        "data": {"id": "asset-1", ...}
      },
      {
        "id": "op-2",
        "status": 400,
        "error": {
          "code": "INVALID_ASSET_TYPE",
          "message": "..."
        }
      }
    ],
    "summary": {
      "succeeded": 1,
      "failed": 1,
      "total": 2
    }
  }
}
```

**批量限制**：
```http
X-Batch-Limit: 100  # 单次最多 100 个操作
X-Batch-Timeout: 30  # 超时秒数
```

#### 列出资产

```http
GET /assets
```

**查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID（必需） |
| `type` | string | 资产类型过滤 |
| `state` | string | 状态过滤 |
| `tag` | string | 标签过滤 |
| `cursor` | string | 分页游标 |
| `limit` | integer | 每页数量（默认20，最大100） |

**响应 200**

```json
{
  "data": [
    {
      "id": "asset-xxx",
      "name": "用户登录模块需求",
      "type": "requirement",
      "state": "clean",
      "current_version": "v1.0",
      "updated_at": "2026-03-13T10:00:00Z"
    }
  ],
  "meta": {
    "cursor": "eyJpZCI6ImFzc2V0LXh4eCIsInRzIjoxNzQxODYxNjAwfQ==",
    "has_more": true
  }
}
```

---

### 3.2 版本接口（Versions）

#### 发布版本

```http
POST /assets/{asset_id}/versions
```

**请求**

```json
{
  "version": "v1.1",
  "content": "# 用户登录模块\n\n## 需求描述\n...",
  "content_type": "markdown",
  "changelog": "增加OAuth2.0支持，修复密码重置问题",
  "dependencies": [
    {
      "asset_id": "asset-upstream",
      "version": "v2.0"
    }
  ]
}
```

**响应 201**

```json
{
  "data": {
    "id": "version-xxx",
    "asset_id": "asset-xxx",
    "version": "v1.1",
    "state": "published",
    "content_ref": "commit-xxx",
    "changelog": "增加OAuth2.0支持，修复密码重置问题",
    "dependencies": [
      {
        "asset_id": "asset-upstream",
        "version": "v2.0",
        "confirmed_at": "2026-03-13T10:00:00Z",
        "auto_confirmed": false
      }
    ],
    "published_at": "2026-03-13T10:00:00Z",
    "published_by": "user-xxx"
  }
}
```

#### 获取版本详情

```http
GET /assets/{asset_id}/versions/{version}
```

**响应 200**

```json
{
  "data": {
    "id": "version-xxx",
    "asset_id": "asset-xxx",
    "version": "v1.1",
    "state": "published",
    "content": "# 用户登录模块\n\n## 需求描述\n...",
    "content_type": "markdown",
    "changelog": "增加OAuth2.0支持",
    "dependencies": [...],
    "published_at": "2026-03-13T10:00:00Z",
    "published_by": "user-xxx"
  }
}
```

#### 获取版本内容（P0：扁平化接口）

```http
GET /contents/{version_ref}
```

**version_ref 格式**：`{asset_id}:{version}` Base64URL 编码

```typescript
// 编码示例
const versionRef = btoa(`${assetId}:${version}`).replace(/=/g, '');
// 结果: YXNzZXQteHh4OnYxLjE

// 解码示例
const [assetId, version] = atob(versionRef).split(':');
```

**替代方案**（直接传参）：
```http
GET /contents?asset_id={asset_id}&version={version}
```

**查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `format` | string | `raw`, `rendered`, `diff` |
| `compare_with` | string | 对比版本（用于diff） |

**内容协商（P2）**：
```http
GET /contents/{version_ref}
Accept: text/markdown        # 返回纯 Markdown
Accept: text/html            # 返回渲染后的 HTML
Accept: application/json     # 返回 JSON 包装（默认）
```

**响应 200** (application/json)

```json
{
  "data": {
    "content": "# 用户登录模块\n\n## 需求描述\n...",
    "content_type": "markdown",
    "rendered_html": "<h1>用户登录模块</h1>...",
    "size": 1024,
    "hash": "sha256-xxx"
  }
}
```

**响应 200** (text/markdown)
```markdown
# 用户登录模块

## 需求描述
...
```

#### 列出版本

```http
GET /assets/{asset_id}/versions
```

**查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `state` | string | `published`, `draft` |
| `cursor` | string | 分页游标 |
| `limit` | integer | 每页数量 |

**响应 200**

```json
{
  "data": [
    {
      "version": "v1.1",
      "state": "published",
      "changelog": "增加OAuth2.0支持",
      "published_at": "2026-03-13T10:00:00Z"
    },
    {
      "version": "v1.0",
      "state": "published",
      "changelog": "初始版本",
      "published_at": "2026-03-12T10:00:00Z"
    }
  ],
  "meta": {
    "cursor": "...",
    "has_more": false
  }
}
```

---

### 3.3 依赖接口（Dependencies）

#### 创建依赖

```http
POST /assets/{asset_id}/dependencies
```

**请求**

```json
{
  "target_asset_id": "asset-upstream",
  "target_version": "v2.0",
  "source_version": "v1.1"
}
```

**响应 201**

```json
{
  "data": {
    "id": "dep-xxx",
    "source_asset_id": "asset-xxx",
    "source_version": "v1.1",
    "target_asset_id": "asset-upstream",
    "target_version": "v2.0",
    "confirmed_at": "2026-03-13T10:00:00Z",
    "confirmed_by": "user-xxx",
    "created_at": "2026-03-13T10:00:00Z"
  }
}
```

#### 获取依赖图谱（P0：异步任务模式）

> 复杂图谱查询可能耗时较长，采用异步任务模式避免超时。

**提交图谱查询任务**：
```http
POST /graph-queries
```

**请求**
```json
{
  "root_asset_id": "asset-xxx",
  "direction": "downstream",
  "max_depth": 10,
  "include_versions": true,
  "analysis_type": "impact"
}
```

**响应 202 Accepted**
```json
{
  "data": {
    "query_id": "query-xxx",
    "status": "queued",
    "estimated_seconds": 5,
    "expires_at": "2026-03-13T11:00:00Z"
  }
}
```

**轮询查询结果**：
```http
GET /graph-queries/{query_id}
```

**响应 200（处理中）**
```json
{
  "data": {
    "query_id": "query-xxx",
    "status": "processing",
    "progress": 45
  }
}
```

**响应 200（已完成）**
```json
{
  "data": {
    "query_id": "query-xxx",
    "status": "completed",
    "result": {
      "nodes": [
        {"id": "asset-xxx", "name": "用户登录模块", "type": "requirement"}
      ],
      "edges": [
        {"from": "asset-xxx", "to": "asset-yyy", "type": "depends_on"}
      ],
      "analysis": {
        "affected_count": 5,
        "critical_paths": [["asset-xxx", "asset-yyy", "asset-zzz"]]
      }
    },
    "expires_at": "2026-03-13T11:00:00Z"
  }
}
```

**缓存支持**：
```http
GET /graph-queries/{query_id}
ETag: "abc123"

# 客户端下次请求
If-None-Match: "abc123"
# 服务端返回 304 Not Modified（依赖未变更时）
```

#### 轻量依赖查询（同步）

如需仅查询直接依赖（快速响应）：
```http
GET /assets/{asset_id}/dependencies?direction=upstream&depth=1
```

#### 删除依赖

```http
DELETE /assets/{asset_id}/dependencies/{dep_id}
```

**响应 204**

---

### 3.4 状态接口（State）

#### 获取资产状态

```http
GET /assets/{asset_id}/state
```

**响应 200**

```json
{
  "data": {
    "asset_id": "asset-xxx",
    "state": "dirty",
    "current_version": "v1.0",
    "upstream_versions": {
      "asset-upstream": "v2.0"
    },
    "dirty_sources": [
      {
        "upstream_asset_id": "asset-upstream",
        "upstream_version": "v2.0",
        "upstream_published_at": "2026-03-13T09:00:00Z",
        "impact_level": "high"
      }
    ],
    "last_transition": {
      "from": "clean",
      "to": "dirty",
      "at": "2026-03-13T09:00:00Z",
      "triggered_by": "system"
    }
  }
}
```

#### 手动 Clean

```http
POST /assets/{asset_id}/clean
```

**请求**

```json
{
  "version": "v1.0",
  "update_dependencies": true,
  "reason": "确认上游变更不影响当前实现"
}
```

**响应 200**

```json
{
  "data": {
    "asset_id": "asset-xxx",
    "previous_state": "dirty",
    "current_state": "clean",
    "updated_dependencies": [
      {
        "asset_id": "asset-upstream",
        "old_version": "v1.0",
        "new_version": "v2.0"
      }
    ],
    "transition_id": "trans-xxx"
  }
}
```

#### 获取 Dirty 队列

```http
GET /dirty-queue
```

**查询参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | string | 项目ID |
| `impact_level` | string | `high`, `medium`, `low` |
| `cursor` | string | 分页游标 |
| `limit` | integer | 每页数量 |

**响应 200**

```json
{
  "data": [
    {
      "asset_id": "asset-yyy",
      "asset_name": "登录模块设计",
      "asset_type": "design",
      "current_version": "v1.0",
      "state": "dirty",
      "upstream_asset_id": "asset-xxx",
      "upstream_name": "用户登录模块需求",
      "upstream_version": "v1.1",
      "upstream_published_at": "2026-03-13T09:00:00Z",
      "impact_level": "high",
      "hours_waiting": 2.5
    }
  ],
  "meta": {
    "cursor": "...",
    "has_more": false
  }
}
```

---

### 3.5 项目接口（Projects）MVP简化

#### 创建项目

```http
POST /projects
```

**请求**

```json
{
  "name": "我的项目",
  "slug": "my-project",
  "description": "项目描述"
}
```

**响应 201**

```json
{
  "data": {
    "id": "proj-xxx",
    "name": "我的项目",
    "slug": "my-project",
    "created_at": "2026-03-13T10:00:00Z"
  }
}
```

#### 获取项目

```http
GET /projects/{project_id}
```

**响应 200**

```json
{
  "data": {
    "id": "proj-xxx",
    "name": "我的项目",
    "slug": "my-project",
    "asset_count": 42,
    "dirty_count": 5,
    "created_at": "2026-03-13T10:00:00Z"
  }
}
```

#### 列出项目

```http
GET /projects
```

**响应 200**

```json
{
  "data": [
    {
      "id": "proj-xxx",
      "name": "我的项目",
      "slug": "my-project",
      "asset_count": 42
    }
  ]
}
```

---

### 3.6 用户接口（Users）MVP简化

#### 获取当前用户

```http
GET /users/me
```

**响应 200**

```json
{
  "data": {
    "id": "user-xxx",
    "email": "user@example.com",
    "username": "username",
    "display_name": "张三",
    "preferences": {}
  }
}
```

#### 更新用户

```http
PUT /users/me
```

**请求**

```json
{
  "display_name": "张三（更新）",
  "preferences": {
    "theme": "dark"
  }
}
```

---

## 4. WebSocket 实时接口（P1：完整连接管理）

### 4.1 连接建立

```http
wss://api.andos.dev/v1/realtime
Headers:
  Authorization: Bearer <jwt_token>
  X-Client-Version: 1.0.0  # 用于兼容性控制
```

**连接成功响应**：
```json
{
  "type": "connection.established",
  "data": {
    "connection_id": "conn-xxx",
    "heartbeat_interval": 30,    // 秒
    "server_time": "2026-03-13T10:00:00Z",
    "session_timeout": 300        // 无活动 5 分钟断开
  }
}
```

### 4.2 心跳机制

**客户端心跳**（每 30 秒）：
```json
{
  "type": "ping",
  "timestamp": 1710324000
}
```

**服务端响应**：
```json
{
  "type": "pong",
  "timestamp": 1710324000
}
```

**超时处理**：
- 服务端 60 秒未收到 ping，断开连接
- 客户端 60 秒未收到 pong，触发重连

### 4.3 断线重连

**重连时发送最后收到的消息 ID**：
```json
{
  "type": "subscribe",
  "channels": ["asset:xxx"],
  "resume_from": "msg-xxx"  // 服务端推送该 ID 之后的消息
}
```

**消息确认（QoS）**：
```json
{
  "type": "ack",
  "message_ids": ["msg-1", "msg-2"]
}
```

### 4.4 消息格式

**客户端订阅**：
```json
{
  "type": "subscribe",
  "channels": ["asset:asset-xxx", "project:proj-xxx"]
}
```

**服务端推送**：
```json
{
  "id": "msg-xxx",              // 消息唯一 ID（用于确认和重连）
  "channel": "asset:asset-xxx",
  "type": "state.changed",
  "data": {
    "from": "clean",
    "to": "dirty",
    "triggered_by": "upstream:asset-yyy"
  },
  "timestamp": "2026-03-13T10:00:00Z"
}
```

### 4.5 连接状态机

```
connecting → connected → subscribed → active
                ↓           ↓            ↓
             disconnected  unsubscribed  idle
                ↓           ↓            ↓
             reconnecting   closed      closed
```

### 4.6 事件类型

| 事件 | 说明 |
|------|------|
| `asset.created` | 资产创建 |
| `asset.updated` | 资产更新 |
| `asset.deleted` | 资产删除 |
| `asset.state.changed` | 资产状态变更 |
| `version.published` | 版本发布 |
| `dependency.created` | 依赖创建 |
| `dirty.created` | dirty来源新增 |
| `dirty.resolved` | dirty已处理 |

---

## 5. 数据模型定义

### 5.1 Asset

```typescript
interface Asset {
  id: string;                    // UUID
  name: string;                  // 显示名称
  slug: string;                  // URL友好的标识
  description?: string;          // 描述
  type: 'requirement' | 'design' | 'task' | 'code' | 'test' | 'pipeline';
  tags: string[];                // 标签数组
  state: 'draft' | 'clean' | 'dirty' | 'modified' | 'archived';
  current_version?: string;      // 当前版本号
  project_id: string;            // 所属项目
  owners: string[];              // 责任人ID列表
  metadata?: Record<string, any>; // 扩展元数据
  created_at: string;            // ISO 8601
  updated_at: string;
}
```

### 5.2 AssetVersion

```typescript
interface AssetVersion {
  id: string;
  asset_id: string;
  version: string;               // SemVer格式
  content: string;               // 内容（markdown/code）
  content_type: 'markdown' | 'code' | 'json';
  content_ref: string;           // 存储引用（Git commit/S3 key）
  changelog: string;             // 变更说明
  state: 'draft' | 'published' | 'deprecated';
  dependencies: Dependency[];    // 依赖列表
  published_at?: string;
  published_by?: string;
  created_at: string;
}
```

### 5.3 Dependency

```typescript
interface Dependency {
  id: string;
  source_asset_id: string;       // 下游资产（依赖者）
  source_version: string;
  target_asset_id: string;       // 上游资产（被依赖者）
  target_version: string;
  confirmed_at?: string;         // 确认时间
  confirmed_by?: string;         // 确认人
  auto_confirmed: boolean;       // 是否自动确认
  created_at: string;
}
```

### 5.4 DirtySource

```typescript
interface DirtySource {
  id: string;
  asset_id: string;              // 受影响资产
  upstream_asset_id: string;     // 上游资产
  upstream_version: string;
  upstream_published_at: string;
  impact_level: 'high' | 'medium' | 'low' | 'none';
  impact_analysis?: object;      // AI分析结果
  status: 'pending' | 'acknowledged' | 'processing' | 'resolved';
  created_at: string;
  resolved_at?: string;
}
```

---

## 6. MVP 范围界定

### 6.1 MVP 包含

✅ **核心资产管理**
- 资产的CRUD
- 版本的发布与管理
- 依赖关系的建立与查询

✅ **状态管理**
- 5种状态的转换
- dirty传播机制
- 手动clean

✅ **基础查询**
- 资产列表（分页）
- 依赖图谱（递归CTE）
- dirty队列

✅ **简单权限**
- JWT认证
- 资产owner/editor/viewer

### 6.2 MVP 不包含（推迟到V1.0）

❌ **Agent集成**
- Agent执行API
- Skill调用
- 事件驱动的自动化

❌ **高级权限**
- RBAC角色管理
- 字段级权限
- API Key

❌ **高级搜索**
- 全文检索（Elasticsearch）
- 标签搜索
- 内容搜索

❌ **WebSocket**
- 实时推送
- 状态变更通知

❌ **导入导出**
- Markdown批量导入
- JSON导出
- 与其他工具集成

---

## 7. 开发顺序建议

```
Phase 1: 基础框架
  - 数据库迁移脚本
  - 基础中间件（认证、日志、错误处理）
  - 健康检查接口

Phase 2: 核心资产
  - POST /assets
  - GET /assets/{id}
  - PUT /assets/{id}
  - DELETE /assets/{id}

Phase 3: 版本管理
  - POST /assets/{id}/versions
  - GET /assets/{id}/versions/{version}
  - GET /assets/{id}/versions

Phase 4: 依赖关系
  - POST /assets/{id}/dependencies
  - GET /assets/{id}/graph
  - DELETE /assets/{id}/dependencies/{id}

Phase 5: 状态管理
  - GET /assets/{id}/state
  - POST /assets/{id}/clean
  - GET /dirty-queue

Phase 6: 项目与用户
  - GET /projects
  - GET /users/me
```

---

## 附录：OpenAPI 3.0 定义片段

```yaml
openapi: 3.0.0
info:
  title: ANDOS API
  version: 1.0.0

paths:
  /assets:
    get:
      summary: List assets
      parameters:
        - name: project_id
          in: query
          required: true
          schema:
            type: string
        - name: cursor
          in: query
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AssetListResponse'

    post:
      summary: Create asset
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateAssetRequest'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Asset'

components:
  schemas:
    Asset:
      type: object
      required:
        - id
        - name
        - type
        - state
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        type:
          type: string
          enum: [requirement, design, task, code, test, pipeline]
        state:
          type: string
          enum: [draft, clean, dirty, modified, archived]
        # ...其他字段
```

完整 OpenAPI 定义可导出为 `openapi.yaml` 用于代码生成。

---

## 附录 B：API 变更对照表（审查后）

| 原接口 | 建议变更 | 优先级 | 状态 |
|--------|----------|--------|------|
| `GET /assets/{id}/versions/{v}/content` | `GET /contents/{version_ref}` | P0 | ✅ 已更新 |
| `GET /assets/{id}/graph` | `POST /graph-queries` + `GET /graph-queries/{id}` | P0 | ✅ 已更新 |
| `POST /assets` | 增加 `Idempotency-Key` 支持 | P0 | ✅ 已更新 |
| WebSocket 基础 | 增加心跳、重连、QoS | P1 | ✅ 已更新 |
| `GET /assets/{id}?include=...` | 增加 `?fields=...` 参数 | P1 | ✅ 已更新 |
| `PUT /assets/{id}` | 增加 `If-Match` 乐观锁 | P2 | ✅ 已更新 |
| 无 | 新增 `POST /assets/batch` | P1 | ✅ 已新增 |
| 无 | 新增限流响应头 | P1 | ✅ 已新增 |

### 关键决策调整

| 决策项 | 原决策 | **调整后** | 理由 |
|--------|--------|-----------|------|
| 资源嵌套 | 深度嵌套 | **扁平化**（复合 ID） | 缓存友好、权限简化 |
| Graph 查询 | 同步接口 | **异步任务 + 轮询** | 避免超时、支持复杂分析 |
| 幂等性 | 未明确 | **Idempotency-Key 标准机制** | 防止重复创建 |
| WebSocket | 基础消息格式 | **完整连接管理** | 生产级可靠性 |
| 批量操作 | 无 | **批量接口（207 Multi-Status）** | 提升效率 |
| 字段过滤 | `include` 参数 | **增加 `fields` 稀疏字段集** | 减少数据传输 |

---

**文档版本**: 1.1 (审查后更新)
**最后更新**: 2026-03-13
