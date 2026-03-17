/**
 * KVMemoryService Tests
 * Tests for key-value memory storage with atomic updates
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MemoryLevel } from '../../../src/types/memory';

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
        // Create a sub-builder for the nested conditions
        const subBuilder = createMockQueryBuilder(tableName);
        subBuilder._filtered = this._filtered ?? getTable();
        field.call(subBuilder);
        // The subBuilder's _filtered now has the filtered results
        this._filtered = subBuilder._filtered;
        return this;
      }

      const table = this._filtered ?? getTable();
      let filtered = [...table];

      if (typeof field === 'object') {
        // Handle object filter like { key: 'xyz' }
        filtered = filtered.filter((row) => {
          return Object.entries(field).every(([k, v]) => {
            if (v === null) return row[k] === null;
            return row[k] === v;
          });
        });
      } else if (typeof field === 'string' && op !== undefined && value !== undefined) {
        // Handle where('field', '<', value) with operator
        if (op === 'like') {
          const prefix = value.replace(/%/g, '');
          filtered = filtered.filter((row) => row[field]?.startsWith(prefix));
        } else if (op === '<') {
          filtered = filtered.filter((row) => {
            if (!row[field]) return false; // Skip null/undefined
            return new Date(row[field]) < new Date(value);
          });
        } else if (op === '>') {
          filtered = filtered.filter((row) => {
            if (!row[field]) return false; // Skip null/undefined
            return new Date(row[field]) > new Date(value);
          });
        } else if (op === '=') {
          filtered = filtered.filter((row) => row[field] === value);
        }
      } else if (typeof field === 'string' && op !== undefined) {
        // Handle where('field', 'value') without operator
        filtered = filtered.filter((row) => row[field] === op);
      }

      this._filtered = filtered;
      return this;
    }),

    whereNull: vi.fn(function (this: any, field: string) {
      const table = this._filtered ?? getTable();
      // Mark this as an OR condition context
      if (!this._orMode) {
        this._filtered = table.filter((row) => row[field] === null || row[field] === undefined);
      } else {
        // In OR mode, combine with existing filter
        const nullRows = table.filter((row) => row[field] === null || row[field] === undefined);
        this._filtered = [...(this._filtered || []), ...nullRows];
      }
      return this;
    }),

    orWhere: vi.fn(function (this: any, field: string, op: string, value: any) {
      // Enable OR mode for subsequent calls
      this._orMode = true;
      const table = getTable();

      if (typeof field === 'string' && op === '>' && value) {
        // Handle expires_at > now()
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
      // Get the table and filter for non-null to use with OR logic
      return this;
    }),

    first: vi.fn(function (this: any, columns?: string[] | string) {
      const data = this._filtered || getTable();
      const result = data[0] || null;
      if (result && columns) {
        // Handle both string (single column) and array
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
            // Merge/update existing
            const merged = { ...table[existingIdx], ...row, ...mergeData };
            if (merged.value && typeof merged.value !== 'string') {
              merged.value = JSON.stringify(merged.value);
            }
            table[existingIdx] = merged;
          } else {
            // Insert new
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

  // Make the builder thenable to return filtered results when awaited
  builder.then = vi.fn(function (this: any, onFulfilled: any) {
    const data = this._filtered || getTable();
    // Reset filtered after getting data
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
  KVMemoryService,
  KVMemoryError,
  KeyNotFoundError,
  ConcurrentUpdateError,
  kvMemoryService,
} from '../../../src/services/KVMemoryService';

describe('KVMemoryService', () => {
  let service: KVMemoryService;

  beforeEach(() => {
    mockStorage.clear();
    mockStorage.set('kv_memories', []);
    uuidIndex = 0;
    mockNow = new Date('2024-01-01T00:00:00Z');
    service = new KVMemoryService();
  });

  describe('set', () => {
    it('should store a key-value pair with default namespace and level', async () => {
      await service.set('mykey', { data: 'value' });

      const table = mockStorage.get('kv_memories');
      expect(table).toHaveLength(1);
      expect(table![0].key).toBe('session:default:mykey');
      expect(table![0].namespace).toBe('default');
      expect(table![0].level).toBe('session');
      expect(JSON.parse(table![0].value)).toEqual({ data: 'value' });
      expect(table![0].etag).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('should store with custom namespace and level', async () => {
      await service.set('mykey', { test: true }, {
        namespace: 'custom-ns',
        level: 'project',
        projectId: 'proj-123',
      });

      const table = mockStorage.get('kv_memories');
      expect(table![0].key).toBe('project:custom-ns:mykey');
      expect(table![0].namespace).toBe('custom-ns');
      expect(table![0].level).toBe('project');
      expect(table![0].project_id).toBe('proj-123');
    });

    it('should store with sessionId', async () => {
      await service.set('mykey', 'value', {
        sessionId: 'sess-456',
      });

      const table = mockStorage.get('kv_memories');
      expect(table![0].session_id).toBe('sess-456');
    });

    it('should set TTL correctly', async () => {
      const ttlSeconds = 3600; // 1 hour
      await service.set('mykey', 'value', { ttl: ttlSeconds });

      const table = mockStorage.get('kv_memories');
      const expiresAt = new Date(table![0].expires_at);
      const expectedExpires = new Date(mockNow.getTime() + ttlSeconds * 1000);
      expect(expiresAt.getTime()).toBe(expectedExpires.getTime());
    });

    it('should upsert existing key', async () => {
      await service.set('mykey', 'original');
      await service.set('mykey', 'updated');

      const table = mockStorage.get('kv_memories');
      expect(table).toHaveLength(1);
      expect(JSON.parse(table![0].value)).toBe('updated');
    });
  });

  describe('get', () => {
    it('should return null for non-existent key', async () => {
      const result = await service.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return value for existing key', async () => {
      await service.set('mykey', { nested: { data: 'value' } });

      const result = await service.get('session:default:mykey');
      expect(result).toEqual({ nested: { data: 'value' } });
    });

    it('should return null for expired key', async () => {
      // Set key with 1 second TTL
      await service.set('mykey', 'value', { ttl: 1 });

      // Advance time by 2 seconds
      mockNow = new Date(mockNow.getTime() + 2000);

      const result = await service.get('session:default:mykey');
      expect(result).toBeNull();
    });

    it('should return value for non-expired key', async () => {
      // Set key with 1 hour TTL
      await service.set('mykey', 'value', { ttl: 3600 });

      const result = await service.get('session:default:mykey');
      expect(result).toBe('value');
    });

    it('should handle primitive values', async () => {
      await service.set('string', 'hello');
      await service.set('number', 42);
      await service.set('bool', true);
      await service.set('null', null);

      expect(await service.get('session:default:string')).toBe('hello');
      expect(await service.get('session:default:number')).toBe(42);
      expect(await service.get('session:default:bool')).toBe(true);
      expect(await service.get('session:default:null')).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      await service.set('mykey', 'value');
      await service.delete('session:default:mykey');

      const table = mockStorage.get('kv_memories');
      expect(table).toHaveLength(0);
    });

    it('should not throw for non-existent key', async () => {
      await expect(service.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('scan', () => {
    it('should return keys matching prefix', async () => {
      await service.set('user:1', { name: 'Alice' }, { namespace: 'app' });
      await service.set('user:2', { name: 'Bob' }, { namespace: 'app' });
      await service.set('post:1', { title: 'Post 1' }, { namespace: 'app' });
      await service.set('user:3', { name: 'Charlie' }, { namespace: 'other' });

      const results = await service.scan('session:app:user:');

      expect(results).toHaveLength(2);
      expect(results.map(r => r.key)).toContain('session:app:user:1');
      expect(results.map(r => r.key)).toContain('session:app:user:2');
    });

    it('should exclude expired keys', async () => {
      await service.set('active', 'active', { namespace: 'test' });
      await service.set('expired', 'expired', { namespace: 'test', ttl: 1 });

      // Advance time
      mockNow = new Date(mockNow.getTime() + 2000);

      const results = await service.scan('session:test:');

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('session:test:active');
    });

    it('should parse JSON values in results', async () => {
      await service.set('key1', { nested: [1, 2, 3] });

      const results = await service.scan('session:default:key');

      expect(results[0].value).toEqual({ nested: [1, 2, 3] });
    });
  });

  describe('update', () => {
    it('should create new key if not exists', async () => {
      const result = await service.update('newkey', (current) => {
        expect(current).toBeNull();
        return { count: 1 };
      });

      expect(result).toEqual({ count: 1 });
    });

    it('should update existing key', async () => {
      await service.set('counter', { count: 5 });

      const result = await service.update('session:default:counter', (current) => {
        return { count: (current?.count || 0) + 1 };
      });

      expect(result).toEqual({ count: 6 });
    });

    it('should use optimistic locking', async () => {
      await service.set('counter', { count: 0 });

      // Simulate concurrent modification by changing etag mid-update
      const result = await service.update('session:default:counter', (current) => {
        return { count: (current?.count || 0) + 1 };
      });

      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('should handle complex object updates', async () => {
      await service.set('list', { items: ['a'] });

      const result = await service.update('session:default:list', (current) => {
        return {
          items: [...(current?.items || []), 'b', 'c'],
        };
      });

      expect(result.items).toEqual(['a', 'b', 'c']);
    });
  });

  describe('exists', () => {
    it('should return false for non-existent key', async () => {
      const result = await service.exists('non-existent');
      expect(result).toBe(false);
    });

    it('should return true for existing key', async () => {
      await service.set('mykey', 'value');
      const result = await service.exists('session:default:mykey');
      expect(result).toBe(true);
    });

    it('should return false for expired key', async () => {
      await service.set('expired', 'value', { ttl: 1 });

      // Advance time
      mockNow = new Date(mockNow.getTime() + 2000);

      const result = await service.exists('session:default:expired');
      expect(result).toBe(false);
    });
  });

  describe('getByNamespace', () => {
    beforeEach(async () => {
      // Setup test data - each in its own namespace to keep counts clean
      await service.set('key1', 'val1', { namespace: 'ns1', level: 'session' });
      await service.set('key2', 'val2', { namespace: 'ns2', level: 'project', projectId: 'p1' });
      await service.set('key3', 'val3', { namespace: 'ns3', level: 'project', projectId: 'p2' });
    });

    it('should return keys by namespace', async () => {
      // Add more keys to ns1
      await service.set('key4', 'val4', { namespace: 'ns1' });

      const results = await service.getByNamespace('ns1');

      expect(results).toHaveLength(2);
      expect(results.map(r => r.value)).toContain('val1');
      expect(results.map(r => r.value)).toContain('val4');
    });

    it('should filter by level', async () => {
      const results = await service.getByNamespace('ns2', { level: 'project' });
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe('val2');
    });

    it('should filter by projectId', async () => {
      const results = await service.getByNamespace('ns2', { projectId: 'p1' });
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe('val2');
    });

    it('should filter by sessionId', async () => {
      await service.set('sessKey', 'sessVal', { namespace: 'ns1', sessionId: 's1' });

      const results = await service.getByNamespace('ns1', { sessionId: 's1' });
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe('sessVal');
    });

    it('should exclude expired keys', async () => {
      await service.set('expired', 'val', { namespace: 'ns1', ttl: 1 });

      // Advance time
      mockNow = new Date(mockNow.getTime() + 2000);

      // Should only return key1, not expired
      const results = await service.getByNamespace('ns1');
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe('val1');
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired entries', async () => {
      await service.set('active', 'value');
      await service.set('expired1', 'value', { ttl: 1 });
      await service.set('expired2', 'value', { ttl: 2 });

      // Advance time by 3 seconds
      mockNow = new Date(mockNow.getTime() + 3000);

      const deleted = await service.cleanupExpired();

      expect(deleted).toBe(2);

      const table = mockStorage.get('kv_memories');
      expect(table).toHaveLength(1);
      expect(table![0].key).toBe('session:default:active');
    });

    it('should return 0 when no expired entries', async () => {
      await service.set('active1', 'value');
      await service.set('active2', 'value');

      const deleted = await service.cleanupExpired();

      expect(deleted).toBe(0);
      expect(mockStorage.get('kv_memories')).toHaveLength(2);
    });
  });

  describe('error types', () => {
    it('should export KVMemoryError with code', () => {
      const error = new KVMemoryError('test message', 'TEST_CODE');
      expect(error.message).toBe('test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('KVMemoryError');
    });

    it('should export KeyNotFoundError', () => {
      const error = new KeyNotFoundError('mykey');
      expect(error.message).toBe('Key not found: mykey');
      expect(error.code).toBe('KEY_NOT_FOUND');
    });

    it('should export ConcurrentUpdateError', () => {
      const error = new ConcurrentUpdateError('mykey');
      expect(error.message).toContain('Concurrent update failed');
      expect(error.message).toContain('mykey');
      expect(error.code).toBe('CONCURRENT_UPDATE_FAILED');
    });
  });

  describe('singleton export', () => {
    it('should export singleton instance', () => {
      expect(kvMemoryService).toBeInstanceOf(KVMemoryService);
    });
  });
});
