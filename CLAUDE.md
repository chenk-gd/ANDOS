# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ANDOS (AI-Native DevOps System) is an AI-native asset management platform with version control, dependency tracking (DAG), and intelligent impact analysis. Built with TypeScript, Fastify, PostgreSQL, and Knex.js.

## Common Commands

```bash
# Development
npm run dev              # Start dev server with hot reload (tsx watch)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled production server

# Database
npm run db:migrate       # Run migrations
npm run db:migrate:test  # Run migrations in test environment
npm run db:rollback      # Rollback last migration
npm run db:seed          # Run seed files

# Testing
npm test                 # Run vitest in watch mode
npm run test:unit        # Run unit tests once
npm run test:integration # Run integration tests (requires PostgreSQL)
npm run test:coverage    # Run tests with coverage report

# Run specific test file
npx vitest run tests/unit/services/AssetService.mock.test.ts
npx vitest run -t "should create an asset"  # Run by test name
```

## Architecture

### Tech Stack
- **Runtime**: Node.js 18+, TypeScript 5.3+
- **Web Framework**: Fastify 4.26+ with plugins
- **Database**: PostgreSQL 14+ with Knex.js query builder
- **Cache/Rate Limiting**: Redis 7+
- **Object Storage**: S3/MinIO for large contexts (>100KB)
- **AI**: Anthropic Claude API via @anthropic-ai/sdk
- **Testing**: Vitest with mock database (no PostgreSQL required for unit tests)

### Directory Structure

```
src/
├── agents/           # AI Agent implementations (Requirement, Design, Task, Code, Test, Compatibility, Impact)
├── db/connection.ts  # Knex.js database connection
├── middleware/       # Express/Fastify middleware (auth)
├── plugins/          # Fastify plugins (errorHandler, idempotency, rateLimit)
├── routes/           # API routes (assets, versions, dependencies, agents, graph, webhooks, orgs, users, projects)
├── services/         # Business logic (AssetService, OrganizationService, UserService, ProjectService, PermissionService, etc.)
├── types/            # TypeScript type definitions
└── utils/            # Utility functions (fieldFiltering)

database/migrations/  # Knex.js migration files
scripts/              # Migration and utility scripts
tests/
├── unit/             # Unit tests with mock database
├── helpers/mockDb.ts # Mock database for unit testing
└── setupMock.ts      # Vitest setup file
```

### Key Architectural Patterns

1. **Soft Delete**: All assets use `deleted_at` timestamp for soft deletion. Unique constraints are partial: `WHERE deleted_at IS NULL`.

2. **Asset State Machine**: Assets have 5 states: `draft` → `clean` → `dirty` → `clean` → `archived`. State transitions are recorded in `asset_state_transitions`.

3. **DAG Dependencies**: Dependencies form a Directed Acyclic Graph using PostgreSQL `ltree` extension for efficient path queries. Cycles are prevented at the application level.

4. **Agent System**:
   - Agents configured via `IMPACT_AGENT_CONFIG`, `COMPATIBILITY_AGENT_CONFIG`, etc.
   - `AgentExecutionEngine` integrates with Claude API
   - Tools have permission levels: `allow`/`ask`/`deny`
   - Subagents inherit context from parent sessions

5. **Table Partitioning**: `agent_executions` and `platform_events` are partitioned by month for performance.

6. **Mock Testing**: Unit tests use `tests/helpers/mockDb.ts` instead of real PostgreSQL. Mock supports transactions, counts, and complex queries.

7. **Organization Hierarchy**: Organizations form a tree structure (max 3 levels) using PostgreSQL `ltree` for efficient queries.

8. **RBAC Permission System**: Role-based access control with predefined roles (org_admin, project_admin, developer, etc.) and permission strings like `asset:crud`.

### Organization & RBAC

- **organizations**: Hierarchical org structure with ltree path (max 3 levels)
- **users**: User accounts linked to organizations
- **projects**: Projects belong to organizations
- **roles**: Predefined RBAC roles with JSONB permissions
- **project_members**: User-role assignments per project

Permission format: `{resource}:{actions}` where actions can be `c,r,u,d` or wildcards like `crud`, `*`.

### Database Schema Highlights

- **assets**: Core asset table with soft delete, state, ltree path
- **asset_versions**: Versioned content with publishing workflow
- **dependencies**: DAG edges between assets
- **agent_executions**: Partitioned execution logs
- **webhook_subscriptions/deliveries**: Event delivery with retry logic
- **organizations**: Hierarchical org structure (max 3 levels) with ltree
- **users**: User accounts with org relationship
- **projects**: Projects within organizations
- **roles**: Predefined RBAC roles with JSONB permissions
- **project_members**: User-role assignments per project

### API Structure

Base URL: `/v1`

Key routes:
- `/assets` - CRUD, soft delete/restore, state transitions, versions
- `/dependencies` - Create/remove dependencies, upstream/downstream queries
- `/agents` - Agent management, sessions, executions
- `/webhooks` - Subscription management, delivery history
- `/orgs` - Organization CRUD and tree queries
- `/users` - User management within orgs
- `/projects` - Project management
- `/projects/:id/members` - Project member and role management

### Environment Variables

Required for development:
```
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
REDIS_HOST, REDIS_PORT
ANTHROPIC_API_KEY
PORT (default: 3000)
```

Optional:
```
S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME
JWT_SECRET
```

See `.env.example` for full list.

## Development Notes

- **TypeScript Path Mapping**: Use `@/` prefix for imports from `src/`
- **Testing**: Prefer mock tests for services. Integration tests require running PostgreSQL.
- **Database**: Uses Knex.js raw queries for complex operations (ltree, partitioning)
- **Idempotency**: API supports `Idempotency-Key` header for POST requests
- **Rate Limiting**: Tiered by user type (anonymous/user/premium/internal)
- **Field Filtering**: Use `?fields=name,state` for sparse field sets

## Design Documents

Architecture decisions and design specs are in `docs/plans/`:
- Database design: `2026-03-13-database-design.md`
- API design: `2026-03-13-api-design-mvp.md`
- Agent system: `2026-03-13-agent-system-design.md`
