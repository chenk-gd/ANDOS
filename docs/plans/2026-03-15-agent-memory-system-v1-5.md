# Agent Memory System V1.5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement V1.5 Agent Memory System with Session Memory (checkpoints + recovery), Project Static Memory (shared context), MCP-compatible memory tools, Auto Memory Extraction, and File Transparency Layer.

**Architecture:** KV-first architecture using PostgreSQL for persistent storage and Redis for ephemeral/session data. Follows the design from `docs/architecture/agent-memory-system.md` with Vector storage deferred to V3.0.

**Tech Stack:** TypeScript, Knex.js, PostgreSQL, Redis, Vitest for testing

---

## Prerequisites

- Existing AgentService at `src/services/AgentService.ts` with session management
- Database migrations in `database/migrations/`
- Test pattern using mock database (see `tests/unit/services/AssetService.mock.test.ts`)
- Redis client available via `ioredis`

---

## Task 1: Database Migration for Session Memory

**Files:**
- Create: `database/migrations/010_create_session_memory_tables.ts`
- Test: `tests/unit/migrations/session_memory.migration.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/migrations/session_memory.migration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Session Memory Migration', () => {
  it('should have session_checkpoints table', async () => {
    // This will fail until migration is created
    const result = await vi.importActual('../../../database/migrations/010_create_session_memory_tables.ts');
    expect(result.up).toBeDefined();
  });

  it('should have kv_memories table', async () => {
    const result = await vi.importActual('../../../database/migrations/010_create_session_memory_tables.ts');
    expect(result.up).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/migrations/session_memory.migration.test.ts
```
Expected: FAIL - module not found

**Step 3: Create migration file**

Create `database/migrations/010_create_session_memory_tables.ts` with these tables:

1. `session_checkpoints` - Store session checkpoints for recovery
2. `kv_memories` - Key-value storage for memory system
3. `memory_candidates` - Auto-extracted memory candidates waiting for approval

See design doc section 4.2 for full schema. Key fields:
- `session_checkpoints`: session_id, sequence, state (JSONB), trigger, created_at
- `kv_memories`: key (PK), value (JSONB), namespace, level, project_id, session_id, etag, expires_at
- `memory_candidates`: id, type, content, confidence, source, status, user_feedback

**Step 4: Run test to verify it passes**

```bash
npm test -- tests/unit/migrations/session_memory.migration.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add database/migrations/010_create_session_memory_tables.ts tests/unit/migrations/
git commit -m "feat(memory): add session memory database migration"
```

---

## Task 2: Database Migration for Project Memory

**Files:**
- Create: `database/migrations/011_create_project_memory_tables.ts`
- Test: `tests/unit/migrations/project_memory.migration.test.ts`

**Step 1: Write the failing test**

Create test file similar to Task 1.

**Step 2: Run test**

Expected: FAIL

**Step 3: Create migration file**

Create `database/migrations/011_create_project_memory_tables.ts` with:

1. `project_memories` - Project-level static context (shared_context JSONB)
2. `learned_patterns` - Learned patterns (without embedding for V1.5)
3. `project_memory_files` - File transparency layer tracking

See design doc section 4.2 for schema.

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**

```bash
git add database/migrations/011_create_project_memory_tables.ts
git commit -m "feat(memory): add project memory database migration"
```

---

## Task 3: Create Memory Types

**Files:**
- Create: `src/types/memory.ts`
- Modify: `src/types/index.ts`
- Test: `tests/unit/types/memory.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/types/memory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  SessionCheckpoint,
  KVMemory,
  ProjectMemory,
  MemoryCandidate,
  CheckpointTrigger,
  MemoryLevel,
} from '../../../src/types/memory';

describe('Memory Types', () => {
  it('should define CheckpointTrigger union', () => {
    const trigger: CheckpointTrigger = 'auto';
    expect(trigger).toBe('auto');
  });

  it('should define MemoryLevel union', () => {
    const level: MemoryLevel = 'session';
    expect(level).toBe('session');
  });
});
```

**Step 2: Run test**

Expected: FAIL - module not found

**Step 3: Create types file**

Create `src/types/memory.ts` with all types from design doc sections 3.2 and 6:

- `SessionCheckpoint`, `Turn`, `WorkingContext`, `Checkpoint`
- `KVMemory`, `KVMemoryMetadata`, `KVQueryOptions`
- `ProjectMemory`, `SharedContext`
- `MemoryCandidate`, `CandidateStatus`
- `MCPMemoryTool`, `MCPMemoryResource`

**Step 4: Run test**

Expected: PASS

**Step 5: Update index.ts**

Add export to `src/types/index.ts`:
```typescript
export * from './memory';
```

**Step 6: Commit**

```bash
git add src/types/memory.ts src/types/index.ts tests/unit/types/memory.test.ts
git commit -m "feat(memory): add memory type definitions"
```

---

## Task 4: Session Memory Service

**Files:**
- Create: `src/services/SessionMemoryService.ts`
- Test: `tests/unit/services/SessionMemoryService.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/services/SessionMemoryService.test.ts` with tests for:
- `createCheckpoint` - saves checkpoint to database
- `restoreFromCheckpoint` - loads checkpoint and restores session state
- `listCheckpoints` - returns checkpoints for a session
- `cleanupExpiredSessions` - removes sessions older than 24h

**Step 2: Run test**

Expected: FAIL - SessionMemoryService not found

**Step 3: Create service**

Create `src/services/SessionMemoryService.ts`:

```typescript
import { db } from '../db/connection';
import { SessionCheckpoint, Checkpoint, WorkingContext } from '../types/memory';

export class SessionMemoryService {
  /**
   * Create a checkpoint for session recovery
   */
  async createCheckpoint(
    sessionId: string,
    state: Record<string, any>,
    trigger: 'auto' | 'manual' | 'pre_tool_call'
  ): Promise<SessionCheckpoint> {
    // Implementation
  }

  /**
   * Restore session from checkpoint
   */
  async restoreFromCheckpoint(sessionId: string, checkpointId: string): Promise<Record<string, any>> {
    // Implementation
  }

  /**
   * List all checkpoints for a session
   */
  async listCheckpoints(sessionId: string): Promise<SessionCheckpoint[]> {
    // Implementation
  }

  /**
   * Clean up expired sessions (24h TTL)
   */
  async cleanupExpiredSessions(): Promise<number> {
    // Implementation
  }
}

export const sessionMemoryService = new SessionMemoryService();
```

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/SessionMemoryService.ts tests/unit/services/SessionMemoryService.test.ts
git commit -m "feat(memory): implement SessionMemoryService with checkpoint management"
```

---

## Task 5: KV Memory Service

**Files:**
- Create: `src/services/KVMemoryService.ts`
- Test: `tests/unit/services/KVMemoryService.test.ts`

**Step 1: Write the failing test**

Test cases:
- `set` - stores key-value with optional TTL
- `get` - retrieves value by key
- `delete` - removes key
- `scan` - prefix search
- `update` - atomic update with optimistic locking

**Step 2: Run test**

Expected: FAIL

**Step 3: Create service**

Create `src/services/KVMemoryService.ts`:

```typescript
import { db } from '../db/connection';
import { KVMemory, MemoryLevel } from '../types/memory';
import crypto from 'crypto';

export class KVMemoryService {
  /**
   * Store a key-value pair
   */
  async set<T = any>(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      namespace?: string;
      level?: MemoryLevel;
      projectId?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    // Implementation with etag generation
  }

  /**
   * Get value by key
   */
  async get<T = any>(key: string): Promise<T | null> {
    // Implementation with TTL check
  }

  /**
   * Delete key
   */
  async delete(key: string): Promise<void> {
    // Implementation
  }

  /**
   * Scan keys by prefix
   */
  async scan(prefix: string): Promise<Array<{ key: string; value: any }>> {
    // Implementation using LIKE query
  }

  /**
   * Atomic update with optimistic locking
   */
  async update<T = any>(
    key: string,
    updater: (current: T | null) => T
  ): Promise<T> {
    // Implementation with retry logic
  }
}

export const kvMemoryService = new KVMemoryService();
```

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/KVMemoryService.ts tests/unit/services/KVMemoryService.test.ts
git commit -m "feat(memory): implement KVMemoryService with atomic updates"
```

---

## Task 6: Project Memory Service

**Files:**
- Create: `src/services/ProjectMemoryService.ts`
- Test: `tests/unit/services/ProjectMemoryService.test.ts`

**Step 1: Write the failing test**

Test cases:
- `getProjectContext` - retrieves shared context
- `updateProjectContext` - updates shared context fields
- `recordPattern` - stores learned pattern
- `queryPatterns` - keyword-based pattern search (V1.5, no vector)

**Step 2: Run test**

Expected: FAIL

**Step 3: Create service**

Create `src/services/ProjectMemoryService.ts`:

```typescript
import { db } from '../db/connection';
import { ProjectMemory, SharedContext, LearnedPattern } from '../types/memory';

export class ProjectMemoryService {
  /**
   * Get or create project memory
   */
  async getProjectMemory(projectId: string): Promise<ProjectMemory> {
    // Implementation
  }

  /**
   * Get project shared context
   */
  async getProjectContext(projectId: string): Promise<SharedContext> {
    // Implementation
  }

  /**
   * Update project shared context
   */
  async updateProjectContext(
    projectId: string,
    context: Partial<SharedContext>
  ): Promise<void> {
    // Implementation with versioning
  }

  /**
   * Record a learned pattern
   */
  async recordPattern(
    projectId: string,
    pattern: Omit<LearnedPattern, 'id' | 'created_at'>
  ): Promise<LearnedPattern> {
    // Implementation (no embedding for V1.5)
  }

  /**
   * Query patterns by keywords (V1.5: no vector search)
   */
  async queryPatterns(
    projectId: string,
    keywords: string[],
    options?: { limit?: number; type?: string }
  ): Promise<LearnedPattern[]> {
    // Implementation using ILIKE for keyword matching
  }
}

export const projectMemoryService = new ProjectMemoryService();
```

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/ProjectMemoryService.ts tests/unit/services/ProjectMemoryService.test.ts
git commit -m "feat(memory): implement ProjectMemoryService with pattern storage"
```

---

## Task 7: MCP Memory Tools

**Files:**
- Create: `src/services/MCPMemoryTools.ts`
- Test: `tests/unit/services/MCPMemoryTools.test.ts`

**Step 1: Write the failing test**

Test cases:
- `memory_remember` tool - stores memory
- `memory_forget` tool - removes memory
- `memory_search` tool - searches memories (keyword-based for V1.5)

**Step 2: Run test**

Expected: FAIL

**Step 3: Create tools**

Create `src/services/MCPMemoryTools.ts`:

```typescript
import { MCPMemoryTool } from '../types/memory';
import { kvMemoryService } from './KVMemoryService';
import { projectMemoryService } from './ProjectMemoryService';

export const MEMORY_TOOLS: MCPMemoryTool[] = [
  {
    name: 'memory_remember',
    description: 'Store a new memory at session, project, or organization level',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Memory content' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
        namespace: { type: 'string', default: 'default' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content', 'level'],
    },
  },
  {
    name: 'memory_forget',
    description: 'Remove a memory by key',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
      },
      required: ['key', 'level'],
    },
  },
  {
    name: 'memory_search',
    description: 'Search memories by keywords (V1.5: keyword-based, V3.0: semantic)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query/keywords' },
        level: { type: 'string', enum: ['session', 'project', 'organization'] },
        limit: { type: 'number', default: 10 },
      },
      required: ['query', 'level'],
    },
  },
];

export class MCPMemoryTools {
  /**
   * Execute memory_remember tool
   */
  async remember(args: {
    content: string;
    level: 'session' | 'project' | 'organization';
    namespace?: string;
    tags?: string[];
    projectId?: string;
    sessionId?: string;
  }): Promise<{ key: string }> {
    // Implementation using kvMemoryService
  }

  /**
   * Execute memory_forget tool
   */
  async forget(args: {
    key: string;
    level: 'session' | 'project' | 'organization';
  }): Promise<{ success: boolean }> {
    // Implementation
  }

  /**
   * Execute memory_search tool
   */
  async search(args: {
    query: string;
    level: 'session' | 'project' | 'organization';
    limit?: number;
    projectId?: string;
    sessionId?: string;
  }): Promise<Array<{ key: string; content: string; relevance: number }>> {
    // Implementation using keyword search for V1.5
  }

  /**
   * List available tools
   */
  listTools(): MCPMemoryTool[] {
    return MEMORY_TOOLS;
  }
}

export const mcpMemoryTools = new MCPMemoryTools();
```

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/MCPMemoryTools.ts tests/unit/services/MCPMemoryTools.test.ts
git commit -m "feat(memory): implement MCP-compatible memory tools"
```

---

## Task 8: Auto Memory Extraction Service

**Files:**
- Create: `src/services/AutoMemoryExtractionService.ts`
- Test: `tests/unit/services/AutoMemoryExtractionService.test.ts`

**Step 1: Write the failing test**

Test cases:
- `extractInBackground` - identifies candidates without blocking
- `identifyCandidates` - uses LLM to extract decisions/patterns/errors
- `storeCandidates` - saves to candidate pool

**Step 2: Run test**

Expected: FAIL

**Step 3: Create service**

Create `src/services/AutoMemoryExtractionService.ts`:

```typescript
import { db } from '../db/connection';
import { MemoryCandidate, AgentSession } from '../types/memory';

export interface ExtractionPolicy {
  tokenThresholds: { first: number; subsequent: number };
  toolCallInterval: number;
  timeInterval: number;
  events: string[];
}

export const DEFAULT_EXTRACTION_POLICY: ExtractionPolicy = {
  tokenThresholds: { first: 10000, subsequent: 5000 },
  toolCallInterval: 3,
  timeInterval: 5 * 60 * 1000, // 5 minutes
  events: ['asset_published', 'dirty_resolved', 'error_occurred', 'decision_made'],
};

export class AutoMemoryExtractionService {
  private policy: ExtractionPolicy;

  constructor(policy: ExtractionPolicy = DEFAULT_EXTRACTION_POLICY) {
    this.policy = policy;
  }

  /**
   * Extract memories in background (non-blocking)
   */
  async extractInBackground(sessionId: string, turns: any[]): Promise<void> {
    // Implementation - identify candidates and store to pool
  }

  /**
   * Identify memory candidates from session
   */
  async identifyCandidates(
    sessionId: string,
    turns: any[]
  ): Promise<MemoryCandidate[]> {
    // Implementation using LLM prompts for decisions/patterns/errors
    // See design doc section 6.5 for prompt templates
    return []; // Placeholder
  }

  /**
   * Store candidates to pool
   */
  async storeCandidates(candidates: MemoryCandidate[]): Promise<void> {
    // Implementation - insert to memory_candidates table
  }

  /**
   * Get pending candidates for user review
   */
  async getPendingCandidates(userId: string): Promise<MemoryCandidate[]> {
    // Implementation
  }

  /**
   * Process user feedback on candidates
   */
  async processCandidateFeedback(
    candidateId: string,
    action: 'approve' | 'reject' | 'edit',
    editedContent?: string
  ): Promise<void> {
    // Implementation - update status, optionally upgrade to project memory
  }
}

export const autoMemoryExtractionService = new AutoMemoryExtractionService();
```

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/AutoMemoryExtractionService.ts tests/unit/services/AutoMemoryExtractionService.test.ts
git commit -m "feat(memory): implement Auto Memory Extraction service"
```

---

## Task 9: File Transparency Layer Service

**Files:**
- Create: `src/services/FileTransparencyService.ts`
- Test: `tests/unit/services/FileTransparencyService.test.ts`

**Step 1: Write the failing test**

Test cases:
- `exportProjectMemory` - exports to PROJECT_MEMORY.md
- `exportSessionSummaries` - exports to sessions/YYYY-MM-DD.md
- `syncFromFile` - imports user edits from Markdown

**Step 2: Run test**

Expected: FAIL

**Step 3: Create service**

Create `src/services/FileTransparencyService.ts`:

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { ProjectMemory, SharedContext } from '../types/memory';
import { projectMemoryService } from './ProjectMemoryService';

export interface TransparencyConfig {
  outputDir: string;
  autoExport: {
    onSessionEnd: boolean;
    onPatternLearned: boolean;
  };
}

export const DEFAULT_TRANSPARENCY_CONFIG: TransparencyConfig = {
  outputDir: '.andos/memory',
  autoExport: {
    onSessionEnd: true,
    onPatternLearned: true,
  },
};

export class FileTransparencyService {
  private config: TransparencyConfig;

  constructor(config: TransparencyConfig = DEFAULT_TRANSPARENCY_CONFIG) {
    this.config = config;
  }

  /**
   * Export all project memory to Markdown files
   */
  async exportAll(projectId: string, projectRoot: string): Promise<void> {
    // Implementation - export project memory, session summaries, standards
  }

  /**
   * Export project memory to PROJECT_MEMORY.md
   */
  async exportProjectMemory(projectId: string, projectRoot: string): Promise<void> {
    // Implementation using format from design doc section 6.6.2
    const memory = await projectMemoryService.getProjectMemory(projectId);
    const content = this.formatProjectMemory(memory);
    const outputPath = path.join(projectRoot, this.config.outputDir, 'PROJECT_MEMORY.md');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
  }

  /**
   * Format project memory as Markdown
   */
  formatProjectMemory(memory: ProjectMemory): string {
    // Implementation - see design doc for template
    return `# Project Memory: ${memory.projectId}\n\n...`;
  }

  /**
   * Sync user edits from file back to database
   */
  async syncFromFile(filePath: string): Promise<void> {
    // Implementation - parse markdown, detect user-editable changes, apply to DB
  }

  /**
   * Parse PROJECT_MEMORY.md content
   */
  parseProjectMemory(content: string): Partial<ProjectMemory> {
    // Implementation - extract sections from markdown
    return {};
  }
}

export const fileTransparencyService = new FileTransparencyService();
```

**Step 4: Run test**

Expected: PASS

**Step 5: Commit**

```bash
git add src/services/FileTransparencyService.ts tests/unit/services/FileTransparencyService.test.ts
git commit -m "feat(memory): implement File Transparency Layer service"
```

---

## Task 10: Integrate Memory Service into AgentService

**Files:**
- Modify: `src/services/AgentService.ts`
- Modify: `src/services/index.ts`
- Test: `tests/unit/services/AgentService.memory.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/services/AgentService.memory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentService } from '../../../src/services/AgentService';
import { sessionMemoryService } from '../../../src/services/SessionMemoryService';

describe('AgentService Memory Integration', () => {
  it('should create checkpoint when session is created', async () => {
    // Test checkpoint creation
  });

  it('should restore session from checkpoint', async () => {
    // Test session restoration
  });
});
```

**Step 2: Run test**

Expected: FAIL

**Step 3: Update AgentService**

Modify `src/services/AgentService.ts`:

```typescript
// Add imports
import { sessionMemoryService } from './SessionMemoryService';
import { kvMemoryService } from './KVMemoryService';

// In createSession method - add checkpoint creation
async createSession(input: CreateSessionInput): Promise<AgentSession> {
  // ... existing code ...

  // Create initial checkpoint for recovery
  await sessionMemoryService.createCheckpoint(
    sessionId,
    { agent_slug: input.agent_slug, context_assets: input.context_assets },
    'auto'
  );

  return session as AgentSession;
}

// Add new method for session recovery
async restoreSession(sessionId: string, checkpointId?: string): Promise<AgentSession> {
  // Implementation - restore session from checkpoint
}
```

**Step 4: Update services index**

Modify `src/services/index.ts` to export memory services:

```typescript
export * from './SessionMemoryService';
export * from './KVMemoryService';
export * from './ProjectMemoryService';
export * from './MCPMemoryTools';
export * from './AutoMemoryExtractionService';
export * from './FileTransparencyService';
```

**Step 5: Run test**

Expected: PASS

**Step 6: Commit**

```bash
git add src/services/AgentService.ts src/services/index.ts tests/unit/services/AgentService.memory.test.ts
git commit -m "feat(memory): integrate memory services into AgentService"
```

---

## Task 11: Memory API Routes

**Files:**
- Create: `src/routes/memory.ts`
- Modify: `src/routes/index.ts`
- Test: `tests/unit/routes/memory.routes.test.ts`

**Step 1: Write the failing test**

Test cases:
- `POST /sessions/:id/checkpoints` - create checkpoint
- `GET /sessions/:id/checkpoints` - list checkpoints
- `POST /sessions/:id/restore` - restore from checkpoint
- `GET /projects/:id/memory` - get project context
- `PUT /projects/:id/memory` - update project context
- `POST /memory/remember` - MCP tool
- `POST /memory/forget` - MCP tool
- `GET /memory/candidates` - get pending candidates
- `POST /memory/candidates/:id/approve` - approve candidate

**Step 2: Run test**

Expected: FAIL

**Step 3: Create routes**

Create `src/routes/memory.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { sessionMemoryService } from '../services/SessionMemoryService';
import { projectMemoryService } from '../services/ProjectMemoryService';
import { mcpMemoryTools } from '../services/MCPMemoryTools';
import { autoMemoryExtractionService } from '../services/AutoMemoryExtractionService';

export async function memoryRoutes(fastify: FastifyInstance) {
  // Session checkpoints
  fastify.post('/sessions/:sessionId/checkpoints', async (request, reply) => {
    // Implementation
  });

  fastify.get('/sessions/:sessionId/checkpoints', async (request, reply) => {
    // Implementation
  });

  fastify.post('/sessions/:sessionId/restore', async (request, reply) => {
    // Implementation
  });

  // Project memory
  fastify.get('/projects/:projectId/memory', async (request, reply) => {
    // Implementation
  });

  fastify.put('/projects/:projectId/memory', async (request, reply) => {
    // Implementation
  });

  // MCP tools
  fastify.post('/memory/remember', async (request, reply) => {
    // Implementation
  });

  fastify.post('/memory/forget', async (request, reply) => {
    // Implementation
  });

  fastify.post('/memory/search', async (request, reply) => {
    // Implementation
  });

  // Candidates
  fastify.get('/memory/candidates', async (request, reply) => {
    // Implementation
  });

  fastify.post('/memory/candidates/:id/approve', async (request, reply) => {
    // Implementation
  });

  fastify.post('/memory/candidates/:id/reject', async (request, reply) => {
    // Implementation
  });
}
```

**Step 4: Update routes index**

Modify `src/routes/index.ts` to register memory routes.

**Step 5: Run test**

Expected: PASS

**Step 6: Commit**

```bash
git add src/routes/memory.ts src/routes/index.ts tests/unit/routes/memory.routes.test.ts
git commit -m "feat(memory): add memory API routes"
```

---

## Task 12: Run All Tests

**Step 1: Run all tests**

```bash
npm test:unit
```

Expected: All tests pass

**Step 2: Run lint/type check**

```bash
npm run build
```

Expected: No errors

**Step 3: Commit**

```bash
git commit -m "feat(memory): V1.5 Agent Memory System complete

- Session Memory with checkpoint and recovery
- KV Memory with atomic updates
- Project Memory with pattern storage
- MCP-compatible memory tools
- Auto Memory Extraction
- File Transparency Layer
- Full test coverage"
```

---

## Summary

This plan implements V1.5 Agent Memory System with the following components:

1. **Database Layer**: Session checkpoints, KV storage, project memory, candidate pool
2. **Session Memory Service**: Checkpoints with 24h TTL, session recovery
3. **KV Memory Service**: Key-value storage with optimistic locking
4. **Project Memory Service**: Shared context and learned patterns
5. **MCP Memory Tools**: `memory_remember`, `memory_forget`, `memory_search`
6. **Auto Memory Extraction**: Background extraction with candidate pool
7. **File Transparency Layer**: Markdown export and bidirectional sync
8. **API Routes**: RESTful endpoints for all memory operations

**Deferred to V2.0+**:
- Vector storage and semantic search (V3.0)
- Real-time collaboration with WebSocket/CRDT (V2.0)
- Graph Memory with Neo4j (V2.5)
- Organization Memory with inheritance (V2.5)
- Hybrid search engine (V3.0)

---

## Testing Strategy

Each service has corresponding unit tests using mock database pattern (see `AssetService.mock.test.ts` for reference). Tests should cover:

- Happy path operations
- Error handling
- Edge cases (empty results, invalid inputs)
- TTL expiration handling
- Optimistic locking conflicts
