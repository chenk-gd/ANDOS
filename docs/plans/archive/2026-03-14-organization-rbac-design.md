# 组织层级与 RBAC 权限设计

**Date:** 2026-03-14
**Status:** Approved
**Version:** 1.0

---

## 1. 设计目标

引入组织、项目、用户的层级关系，以及基于 RBAC 的细粒度权限控制，满足企业级多租户场景需求。

---

## 2. 核心概念

### 2.1 组织层级（Organization Hierarchy）

- **树型结构**：组织之间是父子关系，形成树
- **层级限制**：最多 3 层（根组织 → 子组织 → 叶组织）
- **项目归属**：项目可以在任意层级的组织下创建
- **组织管理员**：可以管理整个组织树下的所有资源

### 2.2 用户归属（User Membership）

- **组织归属**：一个人只能属于一个组织（强制约束）
- **项目参与**：一个人可以参与多个项目
- **角色分配**：按项目分配角色，不同项目可以有不同的角色

### 2.3 角色与权限（RBAC）

**预定义角色**：
1. **组织管理员** (org_admin)：管理整个组织树
2. **项目管理员** (project_admin)：管理项目所有资源
3. **项目经理** (project_manager)：管理项目大部分资源
4. **产品经理** (product_manager)：管理需求相关资源
5. **开发人员** (developer)：开发和版本管理
6. **测试人员** (tester)：测试相关操作
7. **QA**：质量保证，查看和审核

**权限粒度**：
- 资源：asset, version, dependency, webhook, agent_execution
- 操作：create (c), read (r), update (u), delete (d)

---

## 3. 数据库 Schema

### 3.1 组织表

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
    path LTREE, -- 树路径，如：1.2.3
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_org_path ON organizations USING GIST (path);
CREATE INDEX idx_org_parent ON organizations(parent_id);
```

### 3.2 用户表

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_org ON users(org_id);
CREATE INDEX idx_user_status ON users(status);
```

### 3.3 角色表

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]', -- 权限列表
    is_system BOOLEAN DEFAULT false, -- 系统预定义角色
    created_at TIMESTAMP DEFAULT NOW()
);

-- 预定义角色
INSERT INTO roles (name, description, permissions, is_system) VALUES
('org_admin', '组织管理员', '["org:*", "project:*", "user:*"]', true),
('project_admin', '项目管理员', '["asset:crud", "version:crud", "dependency:crud", "webhook:crud", "agent:crud", "member:crud"]', true),
('project_manager', '项目经理', '["asset:crud", "version:crud", "dependency:crud", "webhook:r", "agent:r", "member:r"]', true),
('product_manager', '产品经理', '["asset:cr", "version:cru", "dependency:r", "agent:r"]', true),
('developer', '开发人员', '["asset:cru", "version:cru", "dependency:cru", "agent:cu"]', true),
('tester', '测试人员', '["asset:r", "version:r", "dependency:r", "agent:r"]', true),
('qa', 'QA', '["asset:r", "version:r", "dependency:r", "webhook:r", "agent:r"]', true);
```

### 3.4 项目表

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_project_org ON projects(org_id);
CREATE INDEX idx_project_status ON projects(status);
```

### 3.5 项目成员表

```sql
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id),
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_member_project ON project_members(project_id);
CREATE INDEX idx_member_user ON project_members(user_id);
```

---

## 4. 权限矩阵

| 角色 | 资产 | 版本 | 依赖 | Webhook | 成员 | Agent |
|------|------|------|------|---------|------|-------|
| 组织管理员 | 组织树内所有项目 | - | - | - | 所有用户 | - |
| 项目管理员 | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |
| 项目经理 | CRUD | CRUD | CRUD | R | R | R |
| 产品经理 | CR | CRU | R | - | - | R |
| 开发人员 | CRU | CRU | CRU | - | - | CU |
| 测试人员 | R | R | R | - | - | R |
| QA | R | R | R | R | - | R |

**权限说明**：
- C = Create, R = Read, U = Update, D = Delete
- "-" 表示无权限

---

## 5. API 设计

### 5.1 组织管理

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /v1/orgs | 创建组织 | 系统管理员 |
| GET | /v1/orgs | 获取组织树 | 登录用户 |
| GET | /v1/orgs/:id | 获取组织详情 | 组织成员 |
| PATCH | /v1/orgs/:id | 更新组织 | 组织管理员 |
| DELETE | /v1/orgs/:id | 删除组织 | 系统管理员（仅限空组织） |

### 5.2 用户管理

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /v1/orgs/:orgId/users | 创建用户 | 组织管理员 |
| GET | /v1/orgs/:orgId/users | 列出组织用户 | 组织成员 |
| GET | /v1/users/:id | 获取用户详情 | 本人或组织管理员 |
| PATCH | /v1/users/:id | 更新用户 | 本人或组织管理员 |
| DELETE | /v1/users/:id | 删除用户 | 组织管理员 |

### 5.3 项目管理

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /v1/orgs/:orgId/projects | 创建项目 | 组织管理员 |
| GET | /v1/orgs/:orgId/projects | 列出组织项目 | 组织成员 |
| GET | /v1/projects/:id | 获取项目详情 | 项目成员 |
| PATCH | /v1/projects/:id | 更新项目 | 项目管理员 |
| DELETE | /v1/projects/:id | 归档项目 | 项目管理员 |

### 5.4 项目成员管理

| 方法 | 路径 | 描述 | 权限 |
|------|------|------|------|
| POST | /v1/projects/:id/members | 添加成员 | 项目管理员 |
| GET | /v1/projects/:id/members | 列出成员 | 项目成员 |
| PATCH | /v1/projects/:id/members/:userId | 修改角色 | 项目管理员 |
| DELETE | /v1/projects/:id/members/:userId | 移除成员 | 项目管理员 |

---

## 6. 权限检查流程

```
1. 解析 JWT Token → 获取 user_id
2. 获取请求参数 → 确定 target_project_id
3. 查询项目信息 → 获取 org_id
4. 验证组织权限:
   - 查询用户所属组织
   - 检查用户组织是否在项目组织树中
   - 如果是组织管理员 → 跳过项目权限检查
5. 验证项目权限:
   - 查询 project_members 获取用户角色
   - 检查角色 permissions 是否包含所需操作
6. 资源级别检查（可选）:
   - 检查是否是资源创建者（owner）
   - 某些敏感操作仅允许 owner 执行
```

---

## 7. 关键业务规则

1. **组织层级限制**：最多 3 层，超出拒绝创建
2. **用户组织唯一性**：一个用户只能属于一个组织
3. **项目成员唯一性**：一个用户在一个项目中只能有一个角色
4. **组织管理员权限**：可以访问组织树内所有项目的资源
5. **系统角色保护**：is_system=true 的角色不可删除、不可修改权限
6. **删除限制**：非空组织不可删除（包含子组织、用户或项目）

---

## 8. 与现有系统的关系

### 8.1 资产表修改

需要在 assets 表中增加 `project_id` 字段：

```sql
ALTER TABLE assets ADD COLUMN project_id UUID REFERENCES projects(id);
CREATE INDEX idx_asset_project ON assets(project_id);
```

### 8.2 权限中间件

新增 `src/middleware/auth.ts`：
- JWT 认证
- 权限检查
- 组织层级验证

### 8.3 数据迁移

现有数据需要：
1. 创建默认组织
2. 将现有用户迁移到默认组织
3. 创建默认项目
4. 将现有资产关联到默认项目
5. 为现有用户分配项目管理员角色

---

## 9. 未来扩展

1. **自定义角色**：允许项目管理员创建自定义角色
2. **资源级权限**：支持对单个资产设置权限
3. **审计日志**：记录所有权限变更操作
4. **组织配额**：限制组织下的项目数、用户数
