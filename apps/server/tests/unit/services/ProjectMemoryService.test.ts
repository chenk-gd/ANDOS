/**
 * ProjectMemoryService Tests
 * Tests for project memory management and learned patterns
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PatternType, SharedContext } from '../../../src/types/memory';

// In-memory storage for mock database - must be at top level for hoisted mock
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

  // Track orderBy calls for multi-column sorting
  const _orderByCalls: Array<{ column: string; direction: 'asc' | 'desc' }> = [];

  const builder: any = {
    _filtered: null as any[] | null,
    _inserted: null as any[] | null,
    _maxResult: null as any | null,

    where: vi.fn(function (this: any, field: string | object, op?: any, value?: any) {
      const table = getTable();
      let filtered = table;

      if (typeof field === 'object') {
        // Handle object filter like { project_id: 'xyz', id: 'abc' }
        filtered = table.filter((row) => {
          return Object.entries(field).every(([k, v]) => row[k] === v);
        });
      } else if (typeof field === 'string' && op !== undefined && value !== undefined) {
        if (op === '=') {
          filtered = table.filter((row) => row[field] === value);
        } else if (op === 'like' || op === 'ilike') {
          const searchValue = value.replace(/%/g, '');
          filtered = table.filter((row) => {
            const rowValue = String(row[field] || '').toLowerCase();
            return rowValue.includes(searchValue.toLowerCase());
          });
        }
      } else if (typeof field === 'string' && op !== undefined) {
        filtered = table.filter((row) => row[field] === op);
      }

      this._filtered = filtered;
      return this;
    }),

    andWhere: vi.fn(function (this: any, callback: Function) {
      // Get the filtered results or full table
      const currentFiltered = this._filtered ?? getTable();
      // Create a combined filtered result by executing the callback
      // The callback uses builder.orWhere which adds to _filtered
      const subBuilder = createMockQueryBuilder(tableName);
      subBuilder._filtered = [...currentFiltered]; // Start with current filtered
      callback(subBuilder);  // Pass subBuilder as the builder parameter
      // Merge results - OR logic means we combine unique rows
      const newResults = subBuilder._filtered || [];
      const combined = [...currentFiltered];
      for (const row of newResults) {
        if (!combined.find((r: any) => r.id === row.id)) {
          combined.push(row);
        }
      }
      this._filtered = combined;
      return this;
    }),

    orWhere: vi.fn(function (this: any, field: string, op?: string, value?: any) {
      const table = getTable();
      let matchingRows: any[] = [];

      if (typeof field === 'string' && (op === 'like' || op === 'ilike') && value) {
        const searchValue = value.replace(/%/g, '');
        matchingRows = table.filter((row) => {
          const rowValue = String(row[field] || '').toLowerCase();
          return rowValue.includes(searchValue.toLowerCase());
        });
      }

      // Combine with existing filtered results (OR logic)
      const existing = this._filtered || [];
      const combined = [...existing];
      for (const row of matchingRows) {
        if (!combined.find((r: any) => r.id === row.id)) {
          combined.push(row);
        }
      }
      this._filtered = combined;
      return this;
    }),

    orWhereRaw: vi.fn(function (this: any, raw: string, bindings?: any[]) {
      // ILIKE for pattern::text search
      if (raw.includes('ILIKE') && bindings && bindings[0]) {
        const searchValue = bindings[0].replace(/%/g, '').toLowerCase();
        const table = getTable();
        const matchingRows = table.filter((row) => {
          const patternText = JSON.stringify(row.pattern || {}).toLowerCase();
          return patternText.includes(searchValue);
        });

        const existing = this._filtered || [];
        const combined = [...existing];
        for (const row of matchingRows) {
          if (!combined.find((r: any) => r.id === row.id)) {
            combined.push(row);
          }
        }
        this._filtered = combined;
      }
      return this;
    }),

    first: vi.fn(function (this: any, columns?: string[]) {
      if (this._maxResult) {
        return this._maxResult;
      }
      const table = getTable();
      const data = this._filtered || table;
      if (data.length === 0) return null;
      // Return a copy to prevent reference issues
      const row = { ...data[0] };
      if (!columns) return row;
      const selected: any = {};
      columns.forEach((col) => {
        selected[col] = row[col];
      });
      return selected;
    }),

    insert: vi.fn(function (this: any, data: any) {
      const table = getTable();
      const rows = Array.isArray(data) ? data : [data];
      rows.forEach((row) => {
        table.push({ ...row });
      });
      mockStorage.set(tableName, table);
      this._inserted = rows;
      return this;
    }),

    returning: vi.fn(function (this: any, columns: string[]) {
      const rows = this._inserted || [];
      return Promise.resolve(rows.map((row: any) => {
        const selected: any = {};
        columns.forEach((col) => {
          selected[col] = row[col];
        });
        return selected;
      }));
    }),

    update: vi.fn(function (this: any, data: any) {
      const table = getTable();
      const filtered = this._filtered || table;
      filtered.forEach((row: any) => {
        Object.assign(row, data);
      });
      return Promise.resolve(filtered.length);
    }),

    increment: vi.fn(function (this: any, field: string, amount: number) {
      const table = getTable();
      const filtered = this._filtered || table;
      filtered.forEach((row: any) => {
        row[field] = (row[field] || 0) + amount;
      });
      // Return this for chaining with .update() - knex allows .increment().update()
      return {
        update: vi.fn((updateData: any) => {
          filtered.forEach((row: any) => {
            Object.assign(row, updateData);
          });
          return Promise.resolve(filtered.length);
        }),
      };
    }),

    del: vi.fn(function (this: any) {
      const table = getTable();
      const filtered = this._filtered || [];
      const count = filtered.length;
      const remaining = table.filter((row) => !filtered.includes(row));
      mockStorage.set(tableName, remaining);
      return Promise.resolve(count);
    }),

    max: vi.fn(function (this: any, column: string) {
      const table = getTable();
      const data = this._filtered || table;
      const colName = column.replace(/\s+as\s+\w+$/, '').trim();
      const max = data.reduce((acc: number, row: any) => {
        const val = row[colName];
        return Math.max(acc, val || 0);
      }, 0);
      const alias = column.match(/as\s+(\w+)$/)?.[1] || 'max';
      this._maxResult = { [alias]: max };
      return this;
    }),

    count: vi.fn(function (this: any, column: string) {
      const table = getTable();
      const data = this._filtered || table;
      return [{ count: data.length }];
    }),

    orderBy: vi.fn(function (this: any, column: string, direction: 'asc' | 'desc' = 'asc') {
      _orderByCalls.push({ column, direction });

      const table = getTable();
      let data = this._filtered || [...table];

      // Sort by all accumulated orderBy calls (first = primary, last = secondary)
      data = data.sort((a: any, b: any) => {
        for (let i = 0; i < _orderByCalls.length; i++) {
          const { column: col, direction: dir } = _orderByCalls[i];
          let comparison = 0;
          if (dir === 'desc') {
            comparison = b[col] > a[col] ? 1 : b[col] < a[col] ? -1 : 0;
          } else {
            comparison = a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0;
          }
          if (comparison !== 0) return comparison;
        }
        return 0;
      });

      this._filtered = data;
      return this;
    }),

    limit: vi.fn(function (this: any, n: number) {
      const data = this._filtered || [];
      this._filtered = data.slice(0, n);
      return this;
    }),

    join: vi.fn(function (this: any) {
      return this;
    }),
  };

  // Make the builder thenable to return filtered results when awaited
  builder.then = vi.fn(function (this: any, onFulfilled: any) {
    const data = this._filtered || getTable();
    this._filtered = null;
    this._inserted = null;
    this._maxResult = null;
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

  mockDb.raw = vi.fn((query: string, bindings?: any[]) => {
    if (query === 'gen_random_uuid()') {
      return crypto.randomUUID();
    }
    return query;
  });

  return { db: mockDb };
});

// Import after mock
import {
  ProjectMemoryService,
  ProjectMemoryError,
  PatternNotFoundError,
  ProjectMemoryNotFoundError,
  projectMemoryService,
} from '../../../src/services/ProjectMemoryService';

describe('ProjectMemoryService', () => {
  let service: ProjectMemoryService;

  beforeEach(() => {
    mockStorage.clear();
    mockStorage.set('project_memories', []);
    mockStorage.set('learned_patterns', []);
    uuidIndex = 0;
    mockNow = new Date('2024-01-01T00:00:00Z');
    service = new ProjectMemoryService();
  });

  describe('getProjectMemory', () => {
    it('should create new project memory if not exists', async () => {
      const projectId = 'proj-123';
      const memory = await service.getProjectMemory(projectId);

      expect(memory).toBeDefined();
      expect(memory.project_id).toBe(projectId);
      expect(memory.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(memory.version).toBe(1);
      expect(memory.shared_context).toBeDefined();
      expect(memory.shared_context.code_style_preferences).toBeDefined();
    });

    it('should return existing project memory if exists', async () => {
      const projectId = 'proj-123';

      // First call creates
      await service.getProjectMemory(projectId);

      // Second call should return same memory
      const memory = await service.getProjectMemory(projectId);

      const table = mockStorage.get('project_memories');
      expect(table).toHaveLength(1);
      expect(memory.project_id).toBe(projectId);
    });

    it('should initialize with default empty shared context', async () => {
      const memory = await service.getProjectMemory('proj-123');

      expect(memory.shared_context.code_style_preferences).toEqual({
        naming_conventions: {},
        formatting_rules: {},
        language_specific: {},
      });
      expect(memory.shared_context.api_patterns).toEqual([]);
      expect(memory.shared_context.common_errors).toEqual([]);
      expect(memory.shared_context.team_conventions).toEqual([]);
      expect(memory.shared_context.architecture_decisions).toEqual([]);
    });
  });

  describe('getProjectContext', () => {
    it('should return shared context for project', async () => {
      const projectId = 'proj-123';
      const context = await service.getProjectContext(projectId);

      expect(context).toBeDefined();
      expect(context.code_style_preferences).toBeDefined();
    });
  });

  describe('updateProjectContext', () => {
    it('should merge new context with existing', async () => {
      const projectId = 'proj-123';

      // First get/create the memory
      await service.getProjectMemory(projectId);

      // Update with new context
      const update: Partial<SharedContext> = {
        code_style_preferences: {
          naming_conventions: { camelCase: 'true' },
          formatting_rules: { indent: 2 },
          language_specific: {},
        },
      };

      await service.updateProjectContext(projectId, update);

      // Verify the update
      const table = mockStorage.get('project_memories');
      expect(table).toHaveLength(1);
      expect(table![0].version).toBe(2);

      const context = JSON.parse(table![0].shared_context);
      expect(context.code_style_preferences.naming_conventions.camelCase).toBe('true');
    });

    it('should increment version on each update', async () => {
      const projectId = 'proj-123';

      await service.getProjectMemory(projectId);
      await service.updateProjectContext(projectId, { api_patterns: [] });
      await service.updateProjectContext(projectId, { common_errors: [] });

      const table = mockStorage.get('project_memories');
      expect(table![0].version).toBe(3);
    });

    it('should update updated_at timestamp', async () => {
      const projectId = 'proj-123';

      await service.getProjectMemory(projectId);

      // Advance time
      mockNow = new Date('2024-01-02T00:00:00Z');

      await service.updateProjectContext(projectId, { api_patterns: [] });

      const table = mockStorage.get('project_memories');
      const updatedAt = new Date(table![0].updated_at);
      expect(updatedAt.getTime()).toBe(mockNow.getTime());
    });

    it('should deep merge nested objects', async () => {
      const projectId = 'proj-123';

      // Setup initial context
      await service.getProjectMemory(projectId);
      await service.updateProjectContext(projectId, {
        code_style_preferences: {
          naming_conventions: { camelCase: 'true' },
          formatting_rules: {},
          language_specific: {},
        },
      });

      // Update with additional naming conventions
      await service.updateProjectContext(projectId, {
        code_style_preferences: {
          naming_conventions: { PascalCase: 'true' },
          formatting_rules: { indent: 2 },
          language_specific: {},
        },
      });

      const memory = await service.getProjectMemory(projectId);
      expect(memory.shared_context.code_style_preferences?.naming_conventions).toEqual({
        camelCase: 'true',
        PascalCase: 'true',
      });
    });
  });

  describe('recordPattern', () => {
    it('should create new pattern', async () => {
      const projectId = 'proj-123';
      const pattern = {
        type: 'code' as PatternType,
        name: 'error-handling-pattern',
        description: 'Common error handling pattern',
        pattern: { tryCatch: true, logErrors: true },
        frequency: 1,
        confidence: 0.85,
        last_observed_at: new Date(),
      };

      const result = await service.recordPattern(projectId, pattern);

      expect(result).toBeDefined();
      expect(result.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(result.project_id).toBe(projectId);
      expect(result.name).toBe('error-handling-pattern');
      expect(result.frequency).toBe(1);
    });

    it('should increment frequency for existing pattern with same name and type', async () => {
      const projectId = 'proj-123';
      const pattern = {
        type: 'code' as PatternType,
        name: 'error-handling-pattern',
        description: 'Common error handling pattern',
        pattern: { tryCatch: true },
        frequency: 1,
        confidence: 0.85,
        last_observed_at: new Date(),
      };

      // Record first pattern
      await service.recordPattern(projectId, pattern);

      // Record same pattern again - should increment frequency
      const result = await service.recordPattern(projectId, pattern);

      const table = mockStorage.get('learned_patterns');
      expect(table).toHaveLength(1);
      expect(result.frequency).toBe(2);
    });

    it('should create separate patterns for different names', async () => {
      const projectId = 'proj-123';

      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'pattern-1',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'pattern-2',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      const table = mockStorage.get('learned_patterns');
      expect(table).toHaveLength(2);
    });

    it('should create separate patterns for different types with same name', async () => {
      const projectId = 'proj-123';

      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'pattern',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      await service.recordPattern(projectId, {
        type: 'api' as PatternType,
        name: 'pattern',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      const table = mockStorage.get('learned_patterns');
      expect(table).toHaveLength(2);
    });

    it('should update last_observed_at when incrementing frequency', async () => {
      const projectId = 'proj-123';
      const pattern = {
        type: 'code' as PatternType,
        name: 'pattern',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date('2024-01-01T00:00:00Z'),
      };

      await service.recordPattern(projectId, pattern);

      // Advance time
      mockNow = new Date('2024-01-02T00:00:00Z');

      const result = await service.recordPattern(projectId, pattern);

      expect(result.last_observed_at.getTime()).toBe(mockNow.getTime());
    });
  });

  describe('queryPatterns', () => {
    beforeEach(async () => {
      const projectId = 'proj-123';

      // Create test patterns
      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'error-handling-pattern',
        description: 'Handles errors gracefully',
        pattern: { type: 'try-catch' },
        frequency: 5,
        confidence: 0.9,
        last_observed_at: new Date(),
      });

      await service.recordPattern(projectId, {
        type: 'api' as PatternType,
        name: 'rest-api-pattern',
        description: 'REST API design pattern',
        pattern: { method: 'GET' },
        frequency: 3,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      await service.recordPattern(projectId, {
        type: 'error' as PatternType,
        name: 'null-reference-error',
        description: 'Null reference handling',
        pattern: { check: 'null' },
        frequency: 10,
        confidence: 0.95,
        last_observed_at: new Date(),
      });
    });

    it('should query patterns by keywords', async () => {
      const results = await service.queryPatterns('proj-123', ['error']);

      // Should match error-handling-pattern and null-reference-error
      expect(results.length).toBeGreaterThanOrEqual(2);
      const names = results.map(r => r.name);
      expect(names).toContain('error-handling-pattern');
      expect(names).toContain('null-reference-error');
    });

    it('should query patterns by keyword in description', async () => {
      const results = await service.queryPatterns('proj-123', ['handles']);

      expect(results.some(r => r.name === 'error-handling-pattern')).toBe(true);
    });

    it('should query patterns by keyword in pattern JSON', async () => {
      const results = await service.queryPatterns('proj-123', ['try-catch']);

      expect(results.some(r => r.name === 'error-handling-pattern')).toBe(true);
    });

    it('should filter by type when provided', async () => {
      const results = await service.queryPatterns('proj-123', [], { type: 'api' as PatternType });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('rest-api-pattern');
    });

    it('should limit results', async () => {
      const results = await service.queryPatterns('proj-123', [], { limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('should order by confidence DESC, frequency DESC', async () => {
      const results = await service.queryPatterns('proj-123', []);

      // null-reference-error has highest confidence (0.95) and frequency (10)
      expect(results[0].name).toBe('null-reference-error');
    });
  });

  describe('getPattern', () => {
    it('should return pattern by ID', async () => {
      const projectId = 'proj-123';
      const created = await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'test-pattern',
        pattern: { test: true },
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      const retrieved = await service.getPattern(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe('test-pattern');
    });

    it('should return null for non-existent pattern', async () => {
      const result = await service.getPattern('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('incrementPatternFrequency', () => {
    it('should increment frequency', async () => {
      const projectId = 'proj-123';
      const created = await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'test-pattern',
        pattern: {},
        frequency: 5,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      await service.incrementPatternFrequency(created.id);

      const table = mockStorage.get('learned_patterns');
      expect(table![0].frequency).toBe(6);
    });

    it('should update last_observed_at', async () => {
      const projectId = 'proj-123';
      const created = await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'test-pattern',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date('2024-01-01T00:00:00Z'),
      });

      // Advance time
      mockNow = new Date('2024-01-02T00:00:00Z');

      await service.incrementPatternFrequency(created.id);

      const table = mockStorage.get('learned_patterns');
      const lastObserved = new Date(table![0].last_observed_at);
      expect(lastObserved.getTime()).toBe(mockNow.getTime());
    });

    it('should throw PatternNotFoundError for non-existent pattern', async () => {
      await expect(service.incrementPatternFrequency('non-existent')).rejects.toThrow(PatternNotFoundError);
    });
  });

  describe('deletePattern', () => {
    it('should delete pattern by ID and return true', async () => {
      const projectId = 'proj-123';
      const created = await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'test-pattern',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      const result = await service.deletePattern(created.id);

      expect(result).toBe(true);
      const table = mockStorage.get('learned_patterns');
      expect(table).toHaveLength(0);
    });

    it('should return false for non-existent pattern', async () => {
      const result = await service.deletePattern('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getProjectPatterns', () => {
    it('should return all patterns for project', async () => {
      const projectId = 'proj-123';

      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'pattern-1',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'pattern-2',
        pattern: {},
        frequency: 1,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      const results = await service.getProjectPatterns(projectId);

      expect(results).toHaveLength(2);
    });

    it('should order by frequency DESC, confidence DESC', async () => {
      const projectId = 'proj-123';

      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'low-freq',
        pattern: {},
        frequency: 1,
        confidence: 0.9,
        last_observed_at: new Date(),
      });

      await service.recordPattern(projectId, {
        type: 'code' as PatternType,
        name: 'high-freq',
        pattern: {},
        frequency: 10,
        confidence: 0.8,
        last_observed_at: new Date(),
      });

      const results = await service.getProjectPatterns(projectId);

      expect(results[0].name).toBe('high-freq');
      expect(results[1].name).toBe('low-freq');
    });

    it('should return empty array for project with no patterns', async () => {
      const results = await service.getProjectPatterns('empty-proj');

      expect(results).toEqual([]);
    });
  });

  describe('error types', () => {
    it('should export ProjectMemoryError with code', () => {
      const error = new ProjectMemoryError('test message', 'TEST_CODE');
      expect(error.message).toBe('test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('ProjectMemoryError');
    });

    it('should export PatternNotFoundError', () => {
      const error = new PatternNotFoundError('pattern-123');
      expect(error.message).toBe('Pattern not found: pattern-123');
      expect(error.code).toBe('PATTERN_NOT_FOUND');
    });

    it('should export ProjectMemoryNotFoundError', () => {
      const error = new ProjectMemoryNotFoundError('proj-123');
      expect(error.message).toBe('Project memory not found: proj-123');
      expect(error.code).toBe('PROJECT_MEMORY_NOT_FOUND');
    });
  });

  describe('singleton export', () => {
    it('should export singleton instance', () => {
      expect(projectMemoryService).toBeInstanceOf(ProjectMemoryService);
    });
  });
});
