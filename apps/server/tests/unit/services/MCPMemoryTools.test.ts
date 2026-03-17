/**
 * MCPMemoryTools Tests
 * Tests for MCP-compatible memory tools (memory_remember, memory_forget, memory_search)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory storage for mock database
const mockStorage: Map<string, any[]> = new Map();

// Mock UUIDs for crypto.randomUUID
const mockUUIDs = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
];
let uuidIndex = 0;

// Mock crypto.randomUUID globally
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => {
    const uuid = mockUUIDs[uuidIndex % mockUUIDs.length];
    uuidIndex++;
    return uuid;
  }),
});

// Current mock time
let mockNow = new Date('2024-01-01T00:00:00Z');
vi.stubGlobal('Date', class extends Date {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super(mockNow);
    } else {
      super(...args);
    }
  }
  static now() {
    return mockNow.getTime();
  }
});

// Helper to create mock query builder
function createMockQueryBuilder(tableName: string) {
  const getTable = () => {
    if (!mockStorage.has(tableName)) {
      mockStorage.set(tableName, []);
    }
    return mockStorage.get(tableName)!;
  };

  const builder: any = {
    _filtered: null as any[] | null,
    _data: null as any | null,

    where: vi.fn(function (this: any, field: string | object | Function, op?: any, value?: any) {
      // Handle function-based where (for nested conditions)
      if (typeof field === 'function') {
        const subBuilder = createMockQueryBuilder(tableName);
        subBuilder._filtered = this._filtered ?? getTable();
        field.call(subBuilder);
        this._filtered = subBuilder._filtered;
        return this;
      }

      const table = this._filtered ?? getTable();
      let filtered = [...table];

      if (typeof field === 'object') {
        filtered = filtered.filter((row) => {
          return Object.entries(field).every(([k, v]) => {
            if (v === null) return row[k] === null;
            return row[k] === v;
          });
        });
      } else if (typeof field === 'string' && op !== undefined && value !== undefined) {
        if (op === 'like') {
          const prefix = value.replace(/%/g, '');
          filtered = filtered.filter((row) => row[field]?.startsWith(prefix));
        } else if (op === '=') {
          filtered = filtered.filter((row) => row[field] === value);
        }
      } else if (typeof field === 'string' && op !== undefined) {
        filtered = filtered.filter((row) => row[field] === op);
      }

      this._filtered = filtered;
      return this;
    }),

    whereNull: vi.fn(function (this: any, field: string) {
      const table = this._filtered ?? getTable();
      this._filtered = table.filter((row) => row[field] === null || row[field] === undefined);
      return this;
    }),

    orWhere: vi.fn(function (this: any, field: string, op: string, value: any) {
      this._orMode = true;
      const table = getTable();
      if (typeof field === 'string' && op === '>' && value) {
        const dateValue = value instanceof Date ? value : new Date(value);
        const matchingRows = table.filter((row) => {
          if (!row[field]) return false;
          return new Date(row[field]) > dateValue;
        });
        this._filtered = [...(this._filtered || []), ...matchingRows];
      }
      return this;
    }),

    orWhereNull: vi.fn(function (this: any, field: string) {
      return this;
    }),

    first: vi.fn(function (this: any, columns?: string[] | string) {
      const data = this._filtered || getTable();
      const result = data[0] || null;
      if (result && columns) {
        if (typeof columns === 'string') {
          return Promise.resolve({ [columns]: result[columns] });
        }
        if (Array.isArray(columns)) {
          const filtered: any = {};
          columns.forEach((col) => {
            filtered[col] = result[col];
          });
          return Promise.resolve(filtered);
        }
      }
      return Promise.resolve(result);
    }),

    insert: vi.fn(function (this: any, data: any) {
      this._data = data;
      return this;
    }),

    update: vi.fn(function (this: any, data: any) {
      const table = getTable();
      const targetRows = this._filtered || [];
      let count = 0;

      targetRows.forEach((targetRow: any) => {
        const idx = table.findIndex((r) => r.key === targetRow.key);
        if (idx !== -1) {
          table[idx] = { ...table[idx], ...data };
          count++;
        }
      });

      this._updateCount = count;
      return Promise.resolve(count);
    }),

    del: vi.fn(function (this: any) {
      const table = getTable();
      const targetRows = this._filtered || [];
      let count = 0;

      targetRows.forEach((targetRow: any) => {
        const idx = table.findIndex((r) => r.key === targetRow.key);
        if (idx !== -1) {
          table.splice(idx, 1);
          count++;
        }
      });

      return Promise.resolve(count);
    }),

    onConflict: vi.fn(function (this: any, field: string) {
      return {
        merge: vi.fn(async (mergeData: any) => {
          const table = getTable();
          const row = this._data;
          const existingIdx = table.findIndex((r) => r[field] === row[field]);

          if (existingIdx !== -1) {
            const merged = { ...table[existingIdx], ...row, ...mergeData };
            if (merged.value && typeof merged.value !== 'string') {
              merged.value = JSON.stringify(merged.value);
            }
            table[existingIdx] = merged;
          } else {
            if (row.value && typeof row.value !== 'string') {
              row.value = JSON.stringify(row.value);
            }
            table.push(row);
          }
        }),
        ignore: vi.fn(async () => {
          const table = getTable();
          const row = this._data;
          const existing = table.find((r) => r.key === row.key);
          if (!existing) {
            if (row.value && typeof row.value !== 'string') {
              row.value = JSON.stringify(row.value);
            }
            table.push(row);
          }
        }),
      };
    }),
  };

  builder.then = vi.fn(function (this: any, onFulfilled: any) {
    const data = this._filtered || getTable();
    this._filtered = null;
    return Promise.resolve(onFulfilled ? onFulfilled(data) : data);
  });

  return builder;
}

// Mock the db module
vi.mock('../../../src/db/connection', () => {
  const mockDb = vi.fn((tableName: string) => createMockQueryBuilder(tableName));

  mockDb.fn = {
    now: vi.fn(() => new Date()),
  };

  mockDb.raw = vi.fn((query: string) => {
    if (query === 'gen_random_uuid()') {
      return crypto.randomUUID();
    }
    return query;
  });

  return { db: mockDb };
});

// Import after mock
import {
  MCPMemoryTools,
  MEMORY_TOOLS,
  mcpMemoryTools,
} from '../../../src/services/MCPMemoryTools';

describe('MCPMemoryTools', () => {
  let tools: MCPMemoryTools;

  beforeEach(() => {
    mockStorage.clear();
    mockStorage.set('kv_memories', []);
    mockStorage.set('project_memories', []);
    mockStorage.set('learned_patterns', []);
    uuidIndex = 0;
    mockNow = new Date('2024-01-01T00:00:00Z');
    tools = new MCPMemoryTools();
  });

  describe('listTools', () => {
    it('should return all three memory tools', () => {
      const toolsList = tools.listTools();

      expect(toolsList).toHaveLength(3);
      expect(toolsList.map((t) => t.name)).toContain('memory_remember');
      expect(toolsList.map((t) => t.name)).toContain('memory_forget');
      expect(toolsList.map((t) => t.name)).toContain('memory_search');
    });

    it('should have correct tool definitions', () => {
      const rememberTool = MEMORY_TOOLS.find((t) => t.name === 'memory_remember');
      expect(rememberTool?.description).toContain('Store');
      expect(rememberTool?.inputSchema.required).toContain('content');
      expect(rememberTool?.inputSchema.required).toContain('level');

      const forgetTool = MEMORY_TOOLS.find((t) => t.name === 'memory_forget');
      expect(forgetTool?.description).toContain('Remove');
      expect(forgetTool?.inputSchema.required).toContain('key');

      const searchTool = MEMORY_TOOLS.find((t) => t.name === 'memory_search');
      expect(searchTool?.description).toContain('Search');
      expect(searchTool?.inputSchema.required).toContain('query');
    });
  });

  describe('remember', () => {
    it('should store session-level memory', async () => {
      const result = await tools.remember({
        content: 'User prefers dark mode',
        level: 'session',
        namespace: 'preferences',
        tags: ['ui', 'settings'],
      });

      expect(result.key).toBeDefined();
      expect(typeof result.key).toBe('string');

      // Verify it was stored
      const kvTable = mockStorage.get('kv_memories');
      expect(kvTable).toHaveLength(1);
      expect(kvTable![0].level).toBe('session');
      expect(kvTable![0].namespace).toBe('preferences');
    });

    it('should store project-level memory', async () => {
      const result = await tools.remember({
        content: 'Project uses React with TypeScript',
        level: 'project',
        projectId: 'proj-123',
        namespace: 'tech-stack',
        tags: ['framework', 'language'],
      });

      expect(result.key).toBeDefined();

      const kvTable = mockStorage.get('kv_memories');
      expect(kvTable).toHaveLength(1);
      expect(kvTable![0].level).toBe('project');
      expect(kvTable![0].project_id).toBe('proj-123');
    });

    it('should store organization-level memory', async () => {
      const result = await tools.remember({
        content: 'Company coding standards: 2-space indentation',
        level: 'organization',
        namespace: 'standards',
      });

      expect(result.key).toBeDefined();

      const kvTable = mockStorage.get('kv_memories');
      expect(kvTable).toHaveLength(1);
      expect(kvTable![0].level).toBe('organization');
    });

    it('should use default namespace when not specified', async () => {
      await tools.remember({
        content: 'Test content',
        level: 'session',
      });

      const kvTable = mockStorage.get('kv_memories');
      expect(kvTable![0].namespace).toBe('default');
    });

    it('should store content as JSON value', async () => {
      await tools.remember({
        content: 'Test memory content',
        level: 'session',
      });

      const kvTable = mockStorage.get('kv_memories');
      const parsedValue = JSON.parse(kvTable![0].value);
      expect(parsedValue.content).toBe('Test memory content');
      expect(parsedValue.tags).toEqual([]);
    });
  });

  describe('forget', () => {
    it('should remove an existing memory', async () => {
      // First store a memory
      const { key } = await tools.remember({
        content: 'Memory to delete',
        level: 'session',
        namespace: 'test',
      });

      // Then forget it
      const result = await tools.forget({ key, level: 'session' });

      expect(result.success).toBe(true);

      // Verify it was deleted
      const kvTable = mockStorage.get('kv_memories');
      expect(kvTable).toHaveLength(0);
    });

    it('should return success for non-existent key', async () => {
      const result = await tools.forget({
        key: 'non-existent-key',
        level: 'session',
      });

      expect(result.success).toBe(true);
    });

    it('should only delete at specified level', async () => {
      // Store same content at different levels
      const sessionKey = await tools.remember({
        content: 'Shared content',
        level: 'session',
      });
      const projectKey = await tools.remember({
        content: 'Shared content',
        level: 'project',
        projectId: 'proj-123',
      });

      // Forget only session level
      await tools.forget({ key: sessionKey.key, level: 'session' });

      // Project level should still exist
      const kvTable = mockStorage.get('kv_memories');
      expect(kvTable).toHaveLength(1);
      expect(kvTable![0].level).toBe('project');
    });
  });

  describe('search', () => {
    it('should search session-level memories by keyword', async () => {
      await tools.remember({ content: 'User likes dark mode', level: 'session' });
      await tools.remember({ content: 'User prefers light theme', level: 'session' });
      await tools.remember({ content: 'Database uses PostgreSQL', level: 'session' });

      const results = await tools.search({
        query: 'user',
        level: 'session',
      });

      expect(results.length).toBeGreaterThan(0);
      // Should find memories containing 'user'
      const userResults = results.filter((r) =>
        r.content.toLowerCase().includes('user')
      );
      expect(userResults.length).toBeGreaterThanOrEqual(2);
    });

    it('should respect limit parameter', async () => {
      // Store multiple memories
      for (let i = 0; i < 5; i++) {
        await tools.remember({
          content: `Memory ${i} about testing`,
          level: 'session',
        });
      }

      const results = await tools.search({
        query: 'memory',
        level: 'session',
        limit: 2,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array when no matches found', async () => {
      await tools.remember({ content: 'Something else', level: 'session' });

      const results = await tools.search({
        query: 'nonexistent-keyword',
        level: 'session',
      });

      expect(results).toEqual([]);
    });

    it('should include relevance score in results', async () => {
      await tools.remember({ content: 'Test memory', level: 'session' });

      const results = await tools.search({
        query: 'test',
        level: 'session',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('relevance');
      expect(typeof results[0].relevance).toBe('number');
      expect(results[0].relevance).toBeGreaterThanOrEqual(0);
      expect(results[0].relevance).toBeLessThanOrEqual(1);
    });

    it('should filter by projectId for project-level search', async () => {
      await tools.remember({
        content: 'Project A specific',
        level: 'project',
        projectId: 'proj-a',
      });
      await tools.remember({
        content: 'Project B specific',
        level: 'project',
        projectId: 'proj-b',
      });

      const results = await tools.search({
        query: 'specific',
        level: 'project',
        projectId: 'proj-a',
      });

      expect(results.length).toBe(1);
      expect(results[0].content).toContain('Project A');
    });

    it('should filter by sessionId for session-level search', async () => {
      await tools.remember({
        content: 'Session 1 context',
        level: 'session',
        sessionId: 'sess-1',
      });
      await tools.remember({
        content: 'Session 2 context',
        level: 'session',
        sessionId: 'sess-2',
      });

      const results = await tools.search({
        query: 'context',
        level: 'session',
        sessionId: 'sess-1',
      });

      expect(results.length).toBe(1);
      expect(results[0].content).toContain('Session 1');
    });

    it('should search organization-level memories', async () => {
      await tools.remember({
        content: 'Org-wide coding standards',
        level: 'organization',
      });

      const results = await tools.search({
        query: 'standards',
        level: 'organization',
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('standards');
    });
  });

  describe('MEMORY_TOOLS export', () => {
    it('should export tool definitions as array', () => {
      expect(Array.isArray(MEMORY_TOOLS)).toBe(true);
      expect(MEMORY_TOOLS).toHaveLength(3);
    });

    it('should have proper input schemas', () => {
      const rememberTool = MEMORY_TOOLS.find((t) => t.name === 'memory_remember');
      expect(rememberTool?.inputSchema.type).toBe('object');
      expect(rememberTool?.inputSchema.properties.content).toBeDefined();
      expect(rememberTool?.inputSchema.properties.level).toBeDefined();
    });
  });

  describe('singleton export', () => {
    it('should export singleton instance', () => {
      expect(mcpMemoryTools).toBeInstanceOf(MCPMemoryTools);
    });
  });
});
