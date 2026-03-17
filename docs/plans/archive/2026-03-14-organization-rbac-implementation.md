# Organization & RBAC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现组织层级结构和 RBAC 权限控制系统，支持最多3层组织树、用户归属、项目管理和角色权限控制

**Architecture:** 使用 PostgreSQL ltree 扩展支持组织树查询，RBAC 采用角色-权限 JSONB 存储，权限检查通过中间件实现

**Tech Stack:** PostgreSQL 14+, Knex.js, Fastify, TypeScript, JWT

---

## 前置条件

**必须首先更新现有数据库设计文档**，修改 `docs/plans/2026-03-13-database-design.md` 检查是否存在，并更新assets表增加project_id字段

---

## Task 1: 创建数据库迁移文件 - 组织表

**Files:**
- Create: `database/migrations/004_create_organizations.rb`
- Test: `tests/integration/migrations/004_test.rb`

**Step 1: 创建迁移文件**

```ruby
// database/migrations/004_create_organizations.rb
exports.up = function(knex) {
  return knex.schema
    .createTable('organizations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('parent_id').references('id').inTable('organizations');
      table.string('name', 100).notNullable();
      table.text('description');
      table.integer('level').notNullable().checkBetween([1, 3]);
      table.specificType('path', 'ltree'); // PostgreSQL ltree
      table.timestamps(true, true);
    })
    .raw('CREATE INDEX idx_org_path ON organizations USING GIST (path)')
    .raw('CREATE INDEX idx_org_parent ON organizations(parent_id)')
    .raw('CREATE TRIGGER org_path_update BEFORE INSERT OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_org_path()');
};

exports.down = function(knex) {
  return knex.schema.dropTable('organizations');
};
```

**Step 2: 创建 ltree 路径更新函数**

```sql
CREATE OR REPLACE FUNCTION update_org_path()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path = text2ltree(NEW.id::text);
    NEW.level = 1;
  ELSE
    SELECT path || text2ltree(NEW.id::text), level + 1
    INTO NEW.path, NEW.level
    FROM organizations
    WHERE id = NEW.parent_id;

    IF NEW.level > 3 THEN
      RAISE EXCEPTION 'Organization level cannot exceed 3';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Step 3: 运行迁移**

```bash
npm run db:migrate
```

**Expected:** 迁移成功执行，organizations 表创建

**Step 4: 提交**

```bash
git add database/migrations/004_create_organizations.rb
git commit -m "feat: add organizations table with ltree support"
```

---

## Task 2: 创建数据库迁移 - 用户表

**Files:**
- Create: `database/migrations/005_create_users.rb`
- Modify: `docs/plans/2026-03-13-database-design.md` (更新用户相关部分)

**Step 1: 创建用户表迁移**

```ruby
exports.up = function(knex) {
  return knex.schema
    .createTable('users', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('org_id').notNullable().references('id').inTable('organizations');
      table.string('username', 50).notNullable().unique();
      table.string('email', 100).notNullable().unique();
      table.string('phone', 20).notNullable().unique();
      table.string('name', 100).notNullable();
      table.string('avatar_url', 500);
      table.enum('status', ['active', 'inactive', 'suspended']).defaultTo('active');
      table.timestamp('last_login_at');
      table.timestamps(true, true);

      table.index('org_id');
      table.index('status');
    });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
```

**Step 2: 运行迁移**

```bash
npm run db:migrate
```

**Step 3: 提交**

```bash
git add database/migrations/005_create_users.rb
git commit -m "feat: add users table with org relationship"
```

---

## Task 3: 创建数据库迁移 - 角色表

**Files:**
- Create: `database/migrations/006_create_roles.rb`

**Step 1: 创建角色表并插入预定义角色**

```ruby
exports.up = async function(knex) {
  await knex.schema.createTable('roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name', 50).notNullable().unique();
    table.text('description');
    table.jsonb('permissions').notNullable().defaultTo('[]');
    table.boolean('is_system').defaultTo(false);
    table.timestamps(true, true);
  });

  // 插入预定义角色
  await knex('roles').insert([
    {
      name: 'org_admin',
      description: '组织管理员，可管理整个组织树',
      permissions: JSON.stringify(['org:*', 'project:*', 'user:*']),
      is_system: true
    },
    {
      name: 'project_admin',
      description: '项目管理员',
      permissions: JSON.stringify(['asset:crud', 'version:crud', 'dependency:crud', 'webhook:crud', 'agent:crud', 'member:crud']),
      is_system: true
    },
    {
      name: 'project_manager',
      description: '项目经理',
      permissions: JSON.stringify(['asset:crud', 'version:crud', 'dependency:crud', 'webhook:r', 'agent:r', 'member:r']),
      is_system: true
    },
    {
      name: 'product_manager',
      description: '产品经理',
      permissions: JSON.stringify(['asset:cr', 'version:cru', 'dependency:r', 'agent:r']),
      is_system: true
    },
    {
      name: 'developer',
      description: '开发人员',
      permissions: JSON.stringify(['asset:cru', 'version:cru', 'dependency:cru', 'agent:cu']),
      is_system: true
    },
    {
      name: 'tester',
      description: '测试人员',
      permissions: JSON.stringify(['asset:r', 'version:r', 'dependency:r', 'agent:r']),
      is_system: true
    },
    {
      name: 'qa',
      description: 'QA',
      permissions: JSON.stringify(['asset:r', 'version:r', 'dependency:r', 'webhook:r', 'agent:r']),
      is_system: true
    }
  ]);
};

exports.down = function(knex) {
  return knex.schema.dropTable('roles');
};
```

**Step 2: 运行迁移**

```bash
npm run db:migrate
```

**Step 3: 验证数据**

```bash
psql -d andos -c "SELECT name, permissions FROM roles;"
```

**Expected:** 7 条预定义角色记录

**Step 4: 提交**

```bash
git add database/migrations/006_create_roles.rb
git commit -m "feat: add roles table with predefined RBAC roles"
```

---

## Task 4: 创建数据库迁移 - 项目表

**Files:**
- Create: `database/migrations/007_create_projects.rb`

**Step 1: 创建项目表**

```ruby
exports.up = function(knex) {
  return knex.schema
    .createTable('projects', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('org_id').notNullable().references('id').inTable('organizations');
      table.string('name', 100).notNullable();
      table.text('description');
      table.enum('status', ['active', 'archived']).defaultTo('active');
      table.uuid('created_by').references('id').inTable('users');
      table.timestamps(true, true);

      table.index('org_id');
      table.index('status');
    });
};

exports.down = function(knex) {
  return knex.schema.dropTable('projects');
};
```

**Step 2: 运行迁移**

```bash
npm run db:migrate
```

**Step 3: 提交**

```bash
git add database/migrations/007_create_projects.rb
git commit -m "feat: add projects table"
```

---

## Task 5: 创建数据库迁移 - 项目成员表

**Files:**
- Create: `database/migrations/008_create_project_members.rb`

**Step 1: 创建项目成员表**

```ruby
exports.up = function(knex) {
  return knex.schema
    .createTable('project_members', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('role_id').notNullable().references('id').inTable('roles');
      table.timestamp('joined_at').defaultTo(knex.fn.now());

      table.unique(['project_id', 'user_id']);
      table.index('project_id');
      table.index('user_id');
    });
};

exports.down = function(knex) {
  return knex.schema.dropTable('project_members');
};
```

**Step 2: 运行迁移**

```bash
npm run db:migrate
```

**Step 3: 提交**

```bash
git add database/migrations/008_create_project_members.rb
git commit -m "feat: add project_members table for RBAC"
```

---


## Task 6: 修改资产表 - 增加 project_id

**Files:**
- Modify: `database/migrations/009_add_project_to_assets.rb`
- Modify: `docs/plans/2026-03-13-database-design.md`

**Step 1: 创建迁移修改 assets 表**

```ruby
exports.up = function(knex) {
  return knex.schema
    .table('assets', (table) => {
      table.uuid('project_id').references('id').inTable('projects');
      table.index('project_id');
    });
};

exports.down = function(knex) {
  return knex.schema.table('assets', (table) => {
    table.dropColumn('project_id');
  });
};
```

**Step 2: 更新数据库设计文档**

在 `docs/plans/2026-03-13-database-design.md` 中 assets 表定义添加：
```sql
project_id UUID REFERENCES projects(id), -- 新增
```

**Step 3: 运行迁移**

```bash
npm run db:migrate
```

**Step 4: 提交**

```bash
git add database/migrations/009_add_project_to_assets.rb docs/plans/2026-03-13-database-design.md
git commit -m "feat: add project_id to assets table"
```

---

## Task 7: 创建类型定义

**Files:**
- Create: `src/types/organization.ts`
- Create: `src/types/user.ts`
- Create: `src/types/project.ts`
- Create: `src/types/role.ts`

**Step 1: 创建组织类型**

```typescript
// src/types/organization.ts
export interface Organization {
  id: string;
  parent_id: string | null;
  name: string;
  description?: string;
  level: number;
  path: string;
  created_at: Date;
  updated_at: Date;
}

export interface OrganizationTree {
  id: string;
  name: string;
  level: number;
  children: OrganizationTree[];
}

export interface CreateOrganizationInput {
  parent_id?: string;
  name: string;
  description?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  description?: string;
}
```

**Step 2: 创建用户类型**

```typescript
// src/types/user.ts
export interface User {
  id: string;
  org_id: string;
  username: string;
  email: string;
  phone: string;
  name: string;
  avatar_url?: string;
  status: 'active' | 'inactive' | 'suspended';
  last_login_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  org_id: string;
  username: string;
  email: string;
  phone: string;
  name: string;
  password: string; // 明文，存储时加密
}

export interface UpdateUserInput {
  email?: string;
  phone?: string;
  name?: string;
  avatar_url?: string;
  status?: 'active' | 'inactive' | 'suspended';
}
```

**Step 3: 创建项目类型**

```typescript
// src/types/project.ts
export interface Project {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  org_id: string;
  name: string;
  description?: string;
  created_by: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
}
```

**Step 4: 创建角色和权限类型**

```typescript
// src/types/role.ts
export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  is_system: boolean;
  created_at: Date;
}

export type Permission = string; // 如: "asset:crud", "version:r"

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role_id: string;
  joined_at: Date;
}

export interface AddProjectMemberInput {
  project_id: string;
  user_id: string;
  role_id: string;
}

export interface UpdateProjectMemberInput {
  role_id: string;
}
```

**Step 5: 提交**

```bash
git add src/types/*.ts
git commit -m "feat: add types for organization, user, project, role"
```

---

## Task 8: 创建 OrganizationService

**Files:**
- Create: `src/services/OrganizationService.ts`
- Create: `tests/unit/services/OrganizationService.test.ts`

**Step 1: 编写测试**

```typescript
// tests/unit/services/OrganizationService.test.ts
describe('OrganizationService', () => {
  describe('create', () => {
    it('should create root organization (level 1)', async () => {
      // 测试创建根组织
    });

    it('should create child organization', async () => {
      // 测试创建子组织
    });


    it('should reject level > 3', async () => {
      // 测试层级限制
    });
  });

  describe('getTree', () => {
    it('should return organization tree', async () => {
      // 测试获取组织树
    });
  });
});
```

**Step 2: 实现 OrganizationService**


```typescript
// src/services/OrganizationService.ts
import { db } from '../db/connection';
import { Organization, CreateOrganizationInput, UpdateOrganizationInput, OrganizationTree } from '../types/organization';

export class OrganizationService {
  async create(input: CreateOrganizationInput): Promise<Organization> {
    // 检查层级限制
    if (input.parent_id) {
      const parent = await db('organizations').where('id', input.parent_id).first();
      if (!parent) throw new Error('Parent organization not found');
      if (parent.level >= 3) {
        throw new Error('Cannot create organization beyond level 3');
      }
    }

    const [org] = await db('organizations')
      .insert({
        parent_id: input.parent_id,
        name: input.name,
        description: input.description,
      })
      .returning('*');

    return org;
  }

  async getById(id: string): Promise<Organization | null> {
    return db('organizations').where('id', id).first();
  }

  async getTree(rootId?: string): Promise<OrganizationTree[]> {
    // 使用 ltree 查询组织树
    let query = db('organizations').orderBy('path');

    if (rootId) {
      const root = await this.getById(rootId);
      if (!root) return [];
      query = query.where('path', '~', `${root.path}.*`);
    }

    const orgs = await query;
    return this.buildTree(orgs);
  }

  private buildTree(orgs: Organization[]): OrganizationTree[] {
    const map = new Map<string, OrganizationTree>();
    const roots: OrganizationTree[] = [];

    // 初始化节点
    orgs.forEach(org => {
      map.set(org.id, {
        id: org.id,
        name: org.name,
        level: org.level,
        children: []
      });
    });

    // 构建树结构
    orgs.forEach(org => {
      const node = map.get(org.id)!;
      if (org.parent_id && map.has(org.parent_id)) {
        const parent = map.get(org.parent_id)!;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async update(id: string, input: UpdateOrganizationInput): Promise<Organization> {
    const [updated] = await db('organizations')
      .where('id', id)
      .update({ ...input, updated_at: new Date() })
      .returning('*');

    if (!updated) throw new Error('Organization not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    // 检查是否有子组织、用户或项目
    const hasChildren = await db('organizations').where('parent_id', id).first();
    if (hasChildren) throw new Error('Cannot delete organization with children');

    const hasUsers = await db('users').where('org_id', id).first();
    if (hasUsers) throw new Error('Cannot delete organization with users');

    const hasProjects = await db('projects').where('org_id', id).first();
    if (hasProjects) throw new Error('Cannot delete organization with projects');

    await db('organizations').where('id', id).delete();
  }
}

export const organizationService = new OrganizationService();
```

**Step 3: 运行测试**

```bash
npm run test:unit tests/unit/services/OrganizationService.test.ts
```

**Step 4: 提交**

```bash
git add src/services/OrganizationService.ts tests/unit/services/OrganizationService.test.ts
git commit -m "feat: add OrganizationService with tree support"
```

---

## Task 9: 创建 UserService

**Files:**
- Create: `src/services/UserService.ts`
- Create: `tests/unit/services/UserService.test.ts`

**Step 1: 编写测试**

```typescript
// tests/unit/services/UserService.test.ts
describe('UserService', () => {
  describe('create', () => {
    it('should create user with unique phone', async () => {
      // 测试创建用户
    });

    it('should reject duplicate phone', async () => {
      // 测试手机号唯一性
    });
  });
});
```

**Step 2: 实现 UserService**

```typescript
// src/services/UserService.ts
import { db } from '../db/connection';
import { User, CreateUserInput, UpdateUserInput } from '../types/user';
import bcrypt from 'bcrypt';

export class UserService {
  async create(input: CreateUserInput): Promise<User> {
    // 检查用户名、邮箱、手机号唯一性
    const existing = await db('users')
      .where('username', input.username)
      .orWhere('email', input.email)
      .orWhere('phone', input.phone)
      .first();

    if (existing) {
      if (existing.username === input.username) throw new Error('Username already exists');
      if (existing.email === input.email) throw new Error('Email already exists');
      if (existing.phone === input.phone) throw new Error('Phone already exists');
    }

    // 密码加密
    const passwordHash = await bcrypt.hash(input.password, 10);

    const [user] = await db('users')
      .insert({
        org_id: input.org_id,
        username: input.username,
        email: input.email,
        phone: input.phone,
        name: input.name,
        password_hash: passwordHash,
      })
      .returning('*');

    return user;
  }

  async getById(id: string): Promise<User | null> {
    return db('users').where('id', id).first();
  }

  async getByUsername(username: string): Promise<User | null> {
    return db('users').where('username', username).first();
  }

  async listByOrg(orgId: string): Promise<User[]> {
    return db('users').where('org_id', orgId).orderBy('name');
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const [updated] = await db('users')
      .where('id', id)
      .update({ ...input, updated_at: new Date() })
      .returning('*');

    if (!updated) throw new Error('User not found');
    return updated;
  }

  async delete(id: string): Promise<void> {
    // 检查是否是项目成员
    const memberOf = await db('project_members').where('user_id', id).first();
    if (memberOf) throw new Error('Cannot delete user who is a project member');

    await db('users').where('id', id).delete();
  }

  async updateLastLogin(id: string): Promise<void> {
    await db('users').where('id', id).update({ last_login_at: new Date() });
  }
}

export const userService = new UserService();
```

**Step 3: 提交**

```bash
git add src/services/UserService.ts tests/unit/services/UserService.test.ts
git commit -m "feat: add UserService with auth support"
```

---

## Task 10: 创建 ProjectService

**Files:**
- Create: `src/services/ProjectService.ts`
- Create: `tests/unit/services/ProjectService.test.ts`

**Step 1: 实现 ProjectService**

```typescript
// src/services/ProjectService.ts
import { db } from '../db/connection';
import { Project, CreateProjectInput, UpdateProjectInput } from '../types/project';

export class ProjectService {
  async create(input: CreateProjectInput): Promise<Project> {
    const [project] = await db('projects')
      .insert({
        org_id: input.org_id,
        name: input.name,
        description: input.description,
        created_by: input.created_by,
      })
      .returning('*');

    // 自动将创建者设为项目管理员
    const adminRole = await db('roles').where('name', 'project_admin').first();
    if (adminRole) {
      await db('project_members').insert({
        project_id: project.id,
        user_id: input.created_by,
        role_id: adminRole.id,
      });
    }

    return project;
  }

  async getById(id: string): Promise<Project | null> {
    return db('projects').where('id', id).first();
  }

  async listByOrg(orgId: string): Promise<Project[]> {
    return db('projects').where('org_id', orgId).orderBy('name');
  }

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const [updated] = await db('projects')
      .where('id', id)
      .update({ ...input, updated_at: new Date() })
      .returning('*');

    if (!updated) throw new Error('Project not found');
    return updated;
  }

  async archive(id: string): Promise<void> {
    await db('projects').where('id', id).update({ status: 'archived' });
  }
}

export const projectService = new ProjectService();
```

**Step 2: 提交**

```bash
git add src/services/ProjectService.ts tests/unit/services/ProjectService.test.ts
git commit -m "feat: add ProjectService"
```

---

## Task 11: 创建权限服务

**Files:**
- Create: `src/services/PermissionService.ts`
- Create: `tests/unit/services/PermissionService.test.ts`

**Step 1: 实现 PermissionService**

```typescript
// src/services/PermissionService.ts
import { db } from '../db/connection';
import { Role, Permission } from '../types/role';

export class PermissionService {
  /**
   * 检查用户是否有指定权限
   */
  async checkPermission(
    userId: string,
    projectId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    // 1. 获取用户的项目角色
    const member = await db('project_members')
      .where({ project_id: projectId, user_id: userId })
      .first();

    if (!member) return false;

    // 2. 获取角色权限
    const role = await db('roles').where('id', member.role_id).first();
    if (!role) return false;

    // 3. 检查权限
    const requiredPermission = `${resource}:${action}`;
    return this.hasPermission(role.permissions, requiredPermission);
  }

  /**
   * 检查是否是组织管理员
   */
  async isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
    const user = await db('users').where('id', userId).first();
    if (!user) return false;

    // 检查用户是否属于该组织树
    const org = await db('organizations').where('id', orgId).first();
    if (!org) return false;

    // 使用 ltree 检查用户组织是否在目标组织树中
    const userOrg = await db('organizations').where('id', user.org_id).first();
    if (!userOrg) return false;

    const isInTree = await db.raw(
      'SELECT 1 WHERE ?::ltree @> ?::ltree',
      [org.path, userOrg.path]
    );

    if (!isInTree.rows.length) return false;

    // 检查是否是 org_admin 角色
    const member = await db('project_members')
      .join('roles', 'project_members.role_id', 'roles.id')
      .where({
        'project_members.user_id': userId,
        'roles.name': 'org_admin'
      })
      .first();

    return !!member;
  }

  /**
   * 解析权限字符串，支持通配符
   */
  private hasPermission(permissions: Permission[], required: string): boolean {
    for (const perm of permissions) {
      // 完全匹配
      if (perm === required) return true;

      // 通配符匹配，如 "asset:crud" 匹配 "asset:c"
      const [permResource, permActions] = perm.split(':');
      const [reqResource, reqAction] = required.split(':');

      if (permResource === reqResource || permResource === '*') {
        if (permActions === '*' || permActions.includes(reqAction)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 获取用户的所有项目角色
   */
  async getUserRoles(userId: string, projectId: string): Promise<Role[]> {
    return db('project_members')
      .join('roles', 'project_members.role_id', 'roles.id')
      .where({
        'project_members.user_id': userId,
        'project_members.project_id': projectId
      })
      .select('roles.*');
  }
}

export const permissionService = new PermissionService();
```

**Step 2: 提交**

```bash
git add src/services/PermissionService.ts tests/unit/services/PermissionService.test.ts
git commit -m "feat: add PermissionService for RBAC"
```

---

## Task 12: 创建认证中间件

**Files:**
- Create: `src/middleware/auth.ts`
- Modify: `src/index.ts` (注册中间件)

**Step 1: 实现认证中间件**

```typescript
// src/middleware/auth.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

interface JWTPayload {
  userId: string;
  username: string;
}

// 扩展 FastifyRequest 类型
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

/**
 * JWT 认证中间件
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as JWTPayload;

    request.user = decoded;
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}

/**
 * 权限检查中间件工厂
 */
export function requirePermission(resource: string, action: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // 从路由参数获取 project_id
    const projectId = (request.params as any).projectId || (request.body as any).project_id;
    if (!projectId) {
      return reply.status(400).send({ error: 'Project ID required' });
    }

    const { permissionService } = await import('../services/PermissionService');
    const hasPermission = await permissionService.checkPermission(
      request.user.userId,
      projectId,
      resource,
      action
    );

    if (!hasPermission) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
}
```

**Step 2: 注册中间件**

在 `src/index.ts` 中添加：

```typescript
import { authMiddleware } from './middleware/auth';

// 全局认证中间件（登录接口除外）
app.addHook('onRequest', async (request, reply) => {
  // 跳过登录和注册接口
  if (request.url.startsWith('/v1/auth/')) return;

  await authMiddleware(request, reply);
});
```

**Step 3: 提交**

```bash
git add src/middleware/auth.ts
git commit -m "feat: add auth middleware with JWT and permission check"
```

---

## Task 13: 创建组织路由

**Files:**
- Create: `src/routes/orgs.ts`

**Step 1: 实现组织路由**

```typescript
// src/routes/orgs.ts
import { FastifyInstance } from 'fastify';
import { organizationService } from '../services/OrganizationService';
import { permissionService } from '../services/PermissionService';

export async function orgRoutes(app: FastifyInstance) {
  // 创建组织（系统管理员）
  app.post('/', async (request, reply) => {
    const { parent_id, name, description } = request.body as any;

    try {
      const org = await organizationService.create({
        parent_id,
        name,
        description,
      });
      return reply.status(201).send(org);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 获取组织树
  app.get('/', async (request, reply) => {
    const { root_id } = request.query as any;
    const tree = await organizationService.getTree(root_id);
    return reply.send(tree);
  });

  // 获取组织详情
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const org = await organizationService.getById(id);
    if (!org) {
      return reply.status(404).send({ error: 'Organization not found' });
    }
    return reply.send(org);
  });

  // 更新组织（组织管理员）
  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, description } = request.body as any;

    try {
      const org = await organizationService.update(id, { name, description });
      return reply.send(org);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 删除组织（系统管理员）
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;

    try {
      await organizationService.delete(id);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
```

**Step 2: 在 index.ts 注册路由**

```typescript
import { orgRoutes } from './routes/orgs';

app.register(orgRoutes, { prefix: '/v1/orgs' });
```

**Step 3: 提交**

```bash
git add src/routes/orgs.ts

git commit -m "feat: add organization routes"
```

---

## Task 14: 创建用户路由

**Files:**
- Create: `src/routes/users.ts`

**Step 1: 实现用户路由**

```typescript
// src/routes/users.ts
import { FastifyInstance } from 'fastify';
import { userService } from '../services/UserService';

export async function userRoutes(app: FastifyInstance) {
  // 创建用户（组织管理员）
  app.post('/', async (request, reply) => {
    const { org_id, username, email, phone, name, password } = request.body as any;

    try {
      const user = await userService.create({
        org_id,
        username,
        email,
        phone,
        name,
        password,
      });
      return reply.status(201).send(user);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 获取组织用户列表
  app.get('/orgs/:orgId/users', async (request, reply) => {
    const { orgId } = request.params as any;
    const users = await userService.listByOrg(orgId);
    return reply.send(users);
  });

  // 获取用户详情
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const user = await userService.getById(id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send(user);
  });

  // 更新用户
  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as any;

    try {
      const user = await userService.update(id, request.body as any);
      return reply.send(user);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 删除用户
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;

    try {
      await userService.delete(id);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
```

**Step 2: 注册路由**

```typescript
import { userRoutes } from './routes/users';

app.register(userRoutes, { prefix: '/v1' });
```

**Step 3: 提交**

```bash
git add src/routes/users.ts
git commit -m "feat: add user routes"
```

---

## Task 15: 创建项目路由

**Files:**
- Create: `src/routes/projects.ts`

**Step 1: 实现项目路由**

```typescript
// src/routes/projects.ts
import { FastifyInstance } from 'fastify';
import { projectService } from '../services/ProjectService';

export async function projectRoutes(app: FastifyInstance) {
  // 创建项目
  app.post('/', async (request, reply) => {
    const { org_id, name, description } = request.body as any;
    const created_by = request.user!.userId;

    try {
      const project = await projectService.create({
        org_id,
        name,
        description,
        created_by,
      });
      return reply.status(201).send(project);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 获取组织项目列表
  app.get('/orgs/:orgId/projects', async (request, reply) => {
    const { orgId } = request.params as any;
    const projects = await projectService.listByOrg(orgId);
    return reply.send(projects);
  });

  // 获取项目详情
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const project = await projectService.getById(id);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }
    return reply.send(project);
  });

  // 更新项目
  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as any;

    try {
      const project = await projectService.update(id, request.body as any);
      return reply.send(project);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // 归档项目
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;

    try {
      await projectService.archive(id);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
```

**Step 2: 注册路由**

```typescript
import { projectRoutes } from './routes/projects';

app.register(projectRoutes, { prefix: '/v1' });
```

**Step 3: 提交**

```bash
git add src/routes/projects.ts
git commit -m "feat: add project routes"
```

---

## Task 16: 创建项目成员路由

**Files:**
- Create: `src/routes/projectMembers.ts`

**Step 1: 实现项目成员路由**

```typescript
// src/routes/projectMembers.ts
import { FastifyInstance } from 'fastify';
import { db } from '../db/connection';

export async function projectMemberRoutes(app: FastifyInstance) {
  // 添加项目成员
  app.post('/:projectId/members', async (request, reply) => {
    const { projectId } = request.params as any;
    const { user_id, role_id } = request.body as any;

    try {
      const [member] = await db('project_members')
        .insert({
          project_id: projectId,
          user_id,
          role_id,
        })
        .returning('*');

      return reply.status(201).send(member);
    } catch (err: any) {
      if (err.message.includes('unique')) {
        return reply.status(409).send({ error: 'User is already a member of this project' });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // 获取项目成员列表
  app.get('/:projectId/members', async (request, reply) => {
    const { projectId } = request.params as any;

    const members = await db('project_members')
      .join('users', 'project_members.user_id', 'users.id')
      .join('roles', 'project_members.role_id', 'roles.id')
      .where('project_members.project_id', projectId)
      .select(
        'project_members.*',
        'users.username',
        'users.name as user_name',
        'users.email',
        'roles.name as role_name'
      );

    return reply.send(members);
  });

  // 更新成员角色
  app.patch('/:projectId/members/:userId', async (request, reply) => {
    const { projectId, userId } = request.params as any;
    const { role_id } = request.body as any;

    const [updated] = await db('project_members')
      .where({ project_id: projectId, user_id: userId })
      .update({ role_id })
      .returning('*');

    if (!updated) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    return reply.send(updated);
  });

  // 移除项目成员
  app.delete('/:projectId/members/:userId', async (request, reply) => {
    const { projectId, userId } = request.params as any;

    await db('project_members')
      .where({ project_id: projectId, user_id: userId })
      .delete();

    return reply.status(204).send();
  });
}
```

**Step 2: 注册路由**

```typescript
import { projectMemberRoutes } from './routes/projectMembers';

app.register(projectMemberRoutes, { prefix: '/v1/projects' });
```

**Step 3: 提交**

```bash
git add src/routes/projectMembers.ts
git commit -m "feat: add project member routes"
```

---

## Task 17: 更新资产路由添加权限控制

**Files:**
- Modify: `src/routes/assets.ts`

**Step 1: 添加权限控制到资产路由**

```typescript
// src/routes/assets.ts
import { requirePermission } from '../middleware/auth';

export async function assetRoutes(app: FastifyInstance) {
  // 创建资产 - 需要 asset:create 权限
  app.post('/', {
    preHandler: [requirePermission('asset', 'c')],
  }, async (request, reply) => {
    // 原有实现...
  });

  // 获取资产 - 需要 asset:read 权限
  app.get('/:id', {
    preHandler: [requirePermission('asset', 'r')],
  }, async (request, reply) => {
    // 原有实现...
  });

  // 更新资产 - 需要 asset:update 权限
  app.patch('/:id', {
    preHandler: [requirePermission('asset', 'u')],
  }, async (request, reply) => {
    // 原有实现...
  });

  // 删除资产 - 需要 asset:delete 权限
  app.delete('/:id', {
    preHandler: [requirePermission('asset', 'd')],
  }, async (request, reply) => {
    // 原有实现...
  });
}
```

**Step 2: 提交**

```bash
git add src/routes/assets.ts
git commit -m "feat: add permission control to asset routes"
```

---

## Task 18: 创建数据迁移脚本

**Files:**
- Create: `scripts/migrate-existing-data.ts`

**Step 1: 创建迁移脚本**

```typescript
// scripts/migrate-existing-data.ts
import { db } from '../src/db/connection';

async function migrate() {
  console.log('Starting data migration...');

  // 1. 创建默认组织
  const [defaultOrg] = await db('organizations')
    .insert({ name: 'Default Organization', level: 1 })
    .returning('*');
  console.log('Created default organization:', defaultOrg.id);

  // 2. 创建默认项目
  const [defaultProject] = await db('projects')
    .insert({
      org_id: defaultOrg.id,
      name: 'Default Project',
      status: 'active',
    })
    .returning('*');
  console.log('Created default project:', defaultProject.id);

  // 3. 获取 project_admin 角色
  const adminRole = await db('roles').where('name', 'project_admin').first();

  // 4. 将现有资产关联到默认项目
  await db('assets').update({ project_id: defaultProject.id });
  console.log('Updated existing assets');

  console.log('Migration completed!');
  console.log(`Default Org ID: ${defaultOrg.id}`);
  console.log(`Default Project ID: ${defaultProject.id}`);
}

migrate().catch(console.error).finally(() => process.exit(0));
```

**Step 2: 提交**

```bash
git add scripts/migrate-existing-data.ts
git commit -m "feat: add data migration script"
```

---

## Task 19: 运行完整测试

**Files:**
- All test files

**Step 1: 运行所有单元测试**

```bash
npm run test:unit
```

**Expected:** 所有测试通过

**Step 2: 运行集成测试（需要 PostgreSQL）**

```bash
npm run test:integration
```

**Step 3: 提交（如有修改）**

```bash
git add .
git commit -m "test: update tests for organization and RBAC"
```

---

## Task 20: 更新文档

**Files:**
- Modify: `docs/plans/2026-03-14-organization-rbac-design.md` (添加实现说明)
- Modify: `CLAUDE.md` (更新架构信息)

**Step 1: 更新设计文档**

在设计文档中添加实现说明章节。

**Step 2: 更新 CLAUDE.md**

添加组织、用户、项目、权限相关的架构信息。

**Step 3: 提交**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: update documentation for organization and RBAC"
```

---

## 总结

**实施计划完成！**

共 20 个任务，涵盖：
1. 数据库迁移（5 个表）
2. 类型定义（4 个文件）
3. 服务层（4 个服务）
4. 中间件（1 个认证中间件）
5. 路由层（4 个路由文件）
6. 数据迁移（1 个脚本）
7. 测试和文档

**执行选项：**
1. **Subagent-Driven (推荐)** - 在当前会话中逐个任务执行，使用 `superpowers:subagent-driven-development`
2. **Parallel Session** - 在新会话中使用 `superpowers:executing-plans` 批量执行

**建议从哪个选项开始？**
