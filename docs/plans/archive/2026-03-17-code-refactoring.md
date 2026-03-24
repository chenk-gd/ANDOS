# ANDOS Project Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the ANDOS monorepo to improve code organization, type safety, and maintainability while preserving all existing behavior.

**Architecture:** Incremental refactoring following the REFACTOR.md principles - single responsibility changes, behavior-preserving modifications, and independent verification at each step.

**Tech Stack:** TypeScript 5.3, Fastify 4.26, Vue 3.4, Vitest, Knex.js, PostgreSQL

---

## Overview

This refactoring plan addresses code organization issues, type safety improvements, and code duplication elimination across the ANDOS monorepo (18,751 lines of code).

**Key Principles (from REFACTOR.md):**
- Behavior unchanged: Same inputs produce same outputs
- Public API unchanged: Class/function signatures preserved
- Data契约不变: Database schema and query semantics preserved
- Single responsibility: One structural change at a time
- Small steps: Each change independently verifiable
- Preserve: Original variable names, error messages, log formats

---

## Phase 1: Code Organization (Priority: High)

### Task 1: Complete Services Index Exports

**Files:**
- Modify: `apps/server/src/services/index.ts`
- Test: Run `npm run test:server` to verify no breaking changes

**Current State:** Only 11 of 17 services are exported

**Step 1: Add missing service exports**

```typescript
/**
 * Services Index - AI-Native DevOps Platform
 */

export * from './AssetService';
export * from './PartitionService';
export * from './ContextStorageService';
export * from './AgentService';
export * from './AgentExecutionEngine';
export * from './AutoMemoryExtractionService';
export * from './FileTransparencyService';
export * from './DependencyGraphService';
export * from './KVMemoryService';
export * from './MCPMemoryTools';
export * from './OrganizationService';
export * from './PermissionService';
export * from './ProjectMemoryService';
export * from './ProjectService';
export * from './SessionMemoryService';
export * from './UserService';
export * from './WebhookService';
```

**Step 2: Verify no naming conflicts**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run tests**

Run: `npm run test:server`
Expected: All 330 tests pass

**Step 4: Commit**

```bash
git add apps/server/src/services/index.ts
git commit -m "refactor(services): complete index exports for all 17 services

Add missing exports:
- DependencyGraphService
- KVMemoryService
- MCPMemoryTools
- OrganizationService
- PermissionService
- ProjectMemoryService
- ProjectService
- SessionMemoryService
- UserService
- WebhookService

All existing exports preserved, no breaking changes."
```

---

### Task 2: Complete Types Index Exports

**Files:**
- Modify: `apps/server/src/types/index.ts`

**Current State:** Only 4 type modules exported

**Step 1: Add missing type exports**

```typescript
/**
 * Types Index - AI-Native DevOps Platform
 */

export * from './asset';
export * from './agent';
export * from './memory';
export * from './organization';
export * from './project';
export * from './role';
```

**Step 2: Verify no naming conflicts**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors

**Step 3: Run tests**

Run: `npm run test:server`
Expected: All 330 tests pass

**Step 4: Commit**

```bash
git add apps/server/src/types/index.ts
git commit -m "refactor(types): complete index exports for all type modules

Add missing exports:
- organization
- project
- role

All existing exports preserved, no breaking changes."
```

---

## Phase 2: Error Handling Consolidation (Priority: High)

### Task 3: Create Shared Error Types Package

**Files:**
- Create: `packages/shared-errors/src/index.ts`
- Create: `packages/shared-errors/package.json`
- Modify: Root `package.json` workspaces

**Rationale:** Both web and server define similar error classes. Consolidate to shared package while preserving behavior.

**Step 1: Create shared-errors package structure**

Create directory: `packages/shared-errors`

**Step 2: Create shared error types**

Create: `packages/shared-errors/src/index.ts`

```typescript
/**
 * Shared Error Types - ANDOS Platform
 * Used by both @andos/server and @andos/web
 */

// Base API Error
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Validation Error
export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

// Not Found Error
export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

// Conflict Error
export class ConflictError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

// Network Error
export class NetworkError extends Error {
  constructor(message = '网络连接失败') {
    super(message);
    this.name = 'NetworkError';
  }
}

// Timeout Error
export class TimeoutError extends Error {
  constructor(message = '请求超时') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Idempotency Error
export class IdempotencyError extends ApiError {
  constructor(message: string) {
    super(message, 'IDEMPOTENCY_KEY_CONFLICT', 409);
    this.name = 'IdempotencyError';
  }
}
```

**Step 3: Create package.json**

Create: `packages/shared-errors/package.json`

```json
{
  "name": "@andos/shared-errors",
  "version": "0.1.0",
  "description": "Shared error types for ANDOS platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**Step 4: Create tsconfig.json**

Create: `packages/shared-errors/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

**Step 5: Update root workspaces**

Modify: Root `package.json`

```json
"workspaces": [
  "apps/*",
  "packages/*"
]
```

**Step 6: Install dependencies**

Run: `npm install`
Expected: Package installed successfully

**Step 7: Build shared package**

Run: `cd packages/shared-errors && npm run build`
Expected: dist/index.js and dist/index.d.ts created

**Step 8: Commit**

```bash
git add packages/shared-errors/
git add package.json
git commit -m "feat(shared-errors): create shared error types package

Extract common error classes from server and web:
- ApiError (base class)
- ValidationError
- NotFoundError
- ConflictError
- NetworkError
- TimeoutError
- IdempotencyError

Preserves all original error messages and behavior."
```

---

### Task 4: Migrate Server Error Types

**Files:**
- Modify: `apps/server/package.json` (add dependency)
- Modify: `apps/server/src/plugins/errorHandler.ts`

**Step 1: Add shared-errors dependency**

Modify: `apps/server/package.json`

Add to dependencies:
```json
"@andos/shared-errors": "^0.1.0"
```

**Step 2: Update errorHandler.ts to use shared types**

Modify: `apps/server/src/plugins/errorHandler.ts`

Replace local error class definitions with imports:

```typescript
/**
 * Error Handler Plugin - AI-Native DevOps Platform
 * Centralized error handling for Fastify
 */

import type { FastifyPluginAsync, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import {
  ApiError,
  ValidationError,
  NotFoundError,
  ConflictError,
  IdempotencyError,
} from '@andos/shared-errors';

// Error code mapping from service layer
const serviceErrorToHttp: Record<string, { code: string; status: number }> = {
  ASSET_NOT_FOUND: { code: 'ASSET_NOT_FOUND', status: 404 },
  HAS_DEPENDENCIES: { code: 'ASSET_HAS_DEPENDENCIES', status: 422 },
  DUPLICATE_SLUG: { code: 'ASSET_ALREADY_EXISTS', status: 409 },
  INVALID_STATE_TRANSITION: { code: 'INVALID_STATE_TRANSITION', status: 422 },
  VERSION_NOT_FOUND: { code: 'VERSION_NOT_FOUND', status: 404 },
};

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  // Set error handler
  fastify.setErrorHandler((error: FastifyError & { code?: string }, request, reply) => {
    const requestId = request.id as string;

    // Log error
    fastify.log.error({
      err: error,
      requestId,
      url: request.url,
      method: request.method,
    }, 'Error occurred');

    // Handle ApiError
    if (error instanceof ApiError) {
      const response: ErrorResponse = {
        error: {
          code: error.code,
          message: error.message,
          request_id: requestId,
        },
      };
      if (error.details) {
        response.error.details = error.details;
      }
      return reply.status(error.statusCode).send(response);
    }

    // Handle service layer errors
    const serviceError = serviceErrorToHttp[error.code || ''];
    if (serviceError) {
      const response: ErrorResponse = {
        error: {
          code: serviceError.code,
          message: error.message,
          request_id: requestId,
        },
      };
      return reply.status(serviceError.status).send(response);
    }

    // Handle validation errors (Zod, etc.)
    if (error.validation) {
      const response: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { errors: error.validation },
          request_id: requestId,
        },
      };
      return reply.status(400).send(response);
    }

    // Handle 404
    if (error.statusCode === 404) {
      const response: ErrorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
          request_id: requestId,
        },
      };
      return reply.status(404).send(response);
    }

    // Default: internal server error
    const response: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
        request_id: requestId,
      },
    };

    return reply.status(500).send(response);
  });

  // Set not found handler
  fastify.setNotFoundHandler((request, reply) => {
    const response: ErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        request_id: request.id as string,
      },
    };
    reply.status(404).send(response);
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });
```

**Step 3: Install dependencies**

Run: `npm install`
Expected: No errors

**Step 4: Verify TypeScript compilation**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors

**Step 5: Run tests**

Run: `npm run test:server`
Expected: All 330 tests pass

**Step 6: Commit**

```bash
git add apps/server/package.json
git add apps/server/src/plugins/errorHandler.ts
git commit -m "refactor(server): migrate to shared error types

Replace local error class definitions with @andos/shared-errors:
- ApiError
- ValidationError
- NotFoundError
- ConflictError
- IdempotencyError

Preserves all error handling behavior and response formats."
```

---

### Task 5: Migrate Web Error Types

**Files:**
- Modify: `apps/web/package.json` (add dependency)
- Modify: `apps/web/src/services/api.ts`

**Step 1: Add shared-errors dependency**

Modify: `apps/web/package.json`

Add to dependencies:
```json
"@andos/shared-errors": "^0.1.0"
```

**Step 2: Update api.ts to use shared types**

Modify: `apps/web/src/services/api.ts`

Replace local error class definitions with imports:

```typescript
import type { Asset, AssetVersion } from '@/types/asset'
import { useNotificationStore } from '@/stores/notification'
import { ApiError, NetworkError, TimeoutError } from '@andos/shared-errors'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1'

interface RequestOptions extends RequestInit {
  showError?: boolean
  errorMessage?: string
  timeout?: number
  retries?: number
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const {
    showError = true,
    errorMessage,
    timeout = 30000,
    retries = 0,
    ...fetchOptions
  } = options || {}

  const url = `${API_BASE}${path}`
  const notificationStore = useNotificationStore()

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
        ...fetchOptions,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
        const message = errorData.message || errorData.error || `HTTP ${response.status}`
        const requestId = response.headers.get('x-request-id') || errorData.requestId

        throw new ApiError(
          message,
          errorData.code || 'HTTP_ERROR',
          response.status,
          errorData.details
        )
      }

      return response.json()
    } catch (err) {
      clearTimeout(timeoutId)

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new TimeoutError()
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        lastError = new NetworkError()
      } else {
        lastError = err instanceof Error ? err : new Error(String(err))
      }

      if (attempt === retries) {
        break
      }

      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }

  if (showError && lastError) {
    const title = lastError instanceof ApiError
      ? `请求失败 (${lastError.statusCode})`
      : lastError instanceof NetworkError
        ? '网络错误'
        : lastError instanceof TimeoutError
          ? '请求超时'
          : '请求失败'

    notificationStore.showNotification({
      type: 'error',
      title,
      message: errorMessage || lastError.message,
    })
  }

  throw lastError
}

// ... rest of the file (createCrudApi, assetsApi, etc.) remains unchanged
```

**Step 3: Update test file imports**

Modify: `apps/web/src/__tests__/apiService.spec.ts`

Update imports:
```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { request, createCrudApi, assetsApi } from '@/services/api'
import { ApiError, NetworkError, TimeoutError } from '@andos/shared-errors'
import { useNotificationStore } from '@/stores/notification'

// ... rest of file
```

**Step 4: Install dependencies**

Run: `npm install`
Expected: No errors

**Step 5: Verify TypeScript compilation**

Run: `cd apps/web && npx vue-tsc --noEmit`
Expected: No errors

**Step 6: Run tests**

Run: `npm run test:web`
Expected: All 104 tests pass

**Step 7: Commit**

```bash
git add apps/web/package.json
git add apps/web/src/services/api.ts
git add apps/web/src/__tests__/apiService.spec.ts
git commit -m "refactor(web): migrate to shared error types

Replace local error class definitions with @andos/shared-errors:
- ApiError
- NetworkError
- TimeoutError

Preserves all error handling behavior and user-facing messages."
```

---

## Phase 3: Type Safety Improvements (Priority: Medium)

### Task 6: Remove `any` Types from Route Handlers

**Files:**
- Modify: `apps/server/src/routes/assets.ts`
- Search for other routes with `any` types

**Step 1: Identify `any` usage in route files**

Run: `grep -n "any" apps/server/src/routes/*.ts | head -30`

**Step 2: Replace `any` with proper types in assets.ts**

Look for patterns like:
- `request.user as any`
- Casting to `any` for request params

Replace with proper Fastify type definitions:

```typescript
// Instead of:
const userId = (request.user as any)?.id || 'system';

// Use:
interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    [key: string]: unknown;
  };
}

const userId = (request as AuthenticatedRequest).user?.id || 'system';
```

**Step 3: Repeat for other route files**

Apply same pattern to:
- agents.ts
- dependencies.ts
- versions.ts
- webhooks.ts
- orgs.ts
- projects.ts
- users.ts

**Step 4: Verify compilation**

Run: `cd apps/server && npx tsc --noEmit`
Expected: No errors

**Step 5: Run tests**

Run: `npm run test:server`
Expected: All 330 tests pass

**Step 6: Commit**

```bash
git add apps/server/src/routes/
git commit -m "refactor(routes): replace any types with proper Fastify types

Remove unsafe any casts in route handlers:
- assets.ts
- agents.ts
- dependencies.ts
- versions.ts
- webhooks.ts
- orgs.ts
- projects.ts
- users.ts

Preserves all runtime behavior, improves type safety."
```

---

## Phase 4: Code Structure Improvements (Priority: Medium)

### Task 7: Split Large Route Files

**Files:**
- Analyze: `apps/server/src/routes/assets.ts`
- Create: `apps/server/src/routes/assets/*.ts` modules

**Criteria:**
- Files >500 lines should be split
- Group related endpoints into modules

**Step 1: Check file sizes**

Run: `wc -l apps/server/src/routes/*.ts`

**Step 2: For files >500 lines, create split plan**

Example for assets.ts:
- `assets/index.ts` - Main route registration
- `assets/crud.ts` - Create, read, update, delete
- `assets/versions.ts` - Version endpoints
- `assets/dependencies.ts` - Dependency endpoints
- `assets/state.ts` - State transition endpoints

**Step 3: Implement split (if needed)**

If assets.ts >500 lines:
1. Extract CRUD operations to `assets/crud.ts`
2. Extract version operations to `assets/versions.ts`
3. Update `assets/index.ts` to import and register sub-routes

**Step 4: Verify behavior preserved**

Run all tests and compare before/after behavior.

**Step 5: Commit**

```bash
git add apps/server/src/routes/assets/
git commit -m "refactor(routes): split assets.ts into modular structure

Split monolithic assets.ts into focused modules:
- assets/index.ts - Route registration
- assets/crud.ts - CRUD operations
- assets/versions.ts - Version management
- assets/state.ts - State transitions

Preserves all endpoints and behavior."
```

---

## Phase 5: Utilities Consolidation (Priority: Low)

### Task 8: Create Shared Utils Package

**Files:**
- Create: `packages/shared-utils/src/index.ts`
- Create: `packages/shared-utils/package.json`
- Analyze: Common utilities between web and server

**Step 1: Identify common utilities**

Search for:
- Date formatting functions
- Validation helpers
- ID generation utilities
- String manipulation functions

**Step 2: Create shared-utils package**

Similar structure to shared-errors.

**Step 3: Migrate utilities incrementally**

Start with low-risk, pure functions.

---

## Testing Strategy

**After Each Task:**
1. TypeScript compilation: `npx tsc --noEmit`
2. Run unit tests: `npm run test:server` / `npm run test:web`
3. Verify no behavioral changes
4. Commit with descriptive message

**Verification Checklist:**
- [ ] All existing tests pass
- [ ] No new TypeScript errors
- [ ] Public APIs unchanged
- [ ] Error messages preserved
- [ ] Log formats unchanged

---

## Rollback Plan

**If issues arise:**
1. Each commit is independent - can revert individually
2. Keep REFACTOR.md principles - behavior unchanged
3. Git history preserves original code
4. Tests verify behavior preservation

---

## Summary

| Phase | Tasks | Priority | Est. Time |
|-------|-------|----------|-----------|
| 1 - Code Organization | 2 tasks | High | 1-2 hours |
| 2 - Error Consolidation | 3 tasks | High | 3-4 hours |
| 3 - Type Safety | 1 task | Medium | 2-3 hours |
| 4 - Structure | 1 task | Medium | 2-3 hours |
| 5 - Utilities | 1 task | Low | 1-2 hours |
| **Total** | **8 tasks** | | **9-14 hours** |

**Recommended Execution Order:**
1. Phase 1 first (low risk, high value)
2. Phase 2 after Phase 1 completes
3. Phase 3 can be done in parallel with Phase 2
4. Phase 4 and 5 can be deferred

**Success Criteria:**
- All 330 server tests pass
- All 104 web tests pass
- No TypeScript compilation errors
- Zero behavioral changes
- Improved code organization and maintainability
