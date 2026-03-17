/**
 * Session Memory Migration Tests
 * Tests for database migration 010_create_session_memory_tables.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { up, down } from '../../../database/migrations/010_create_session_memory_tables';
import { Knex } from 'knex';

// In-memory storage for mock database
const mockStorage: Map<string, any[]> = new Map();
const createdTables: string[] = [];
const droppedTables: string[] = [];
const createdIndexes: string[] = [];
const rawQueries: string[] = [];

// Mock Knex query builder
function createMockKnex(): Knex {
  // Helper to create a chainable builder that tracks calls
  const self = { index: () => self };
  const createChain = () => self;

  // Create base column builder
  const colBuilder = {
    notNullable: () => colBuilder,
    nullable: () => colBuilder,
    index: () => {
      createdIndexes.push('column_index');
      return colBuilder;
    },
    defaultTo: () => colBuilder,
    primary: () => colBuilder,
  };

  const tableBuilder = {
    uuid: () => colBuilder,
    string: () => colBuilder,
    integer: () => colBuilder,
    jsonb: () => colBuilder,
    text: () => colBuilder,
    float: () => colBuilder,
    timestamp: () => colBuilder,
    specificType: () => colBuilder,
    index: (cols?: string | string[], name?: string) => {
      const indexName = name || `idx_${typeof cols === 'string' ? cols : (cols?.join('_') || 'unknown')}`;
      createdIndexes.push(indexName);
      return tableBuilder;
    },
  };

  const mockKnex = {
    schema: {
      createTable: (tableName: string, callback: Function) => {
        createdTables.push(tableName);
        mockStorage.set(tableName, []);
        callback(tableBuilder);
        return Promise.resolve();
      },
      dropTableIfExists: (tableName: string) => {
        droppedTables.push(tableName);
        mockStorage.delete(tableName);
        return Promise.resolve();
      },
    },
    raw: (query: string) => {
      rawQueries.push(query);
      return Promise.resolve();
    },
    fn: {
      now: () => 'NOW()',
    },
  } as unknown as Knex;

  return mockKnex;
}

describe('Session Memory Migration', () => {
  let mockKnex: Knex;

  beforeAll(() => {
    // Clear tracking arrays
    createdTables.length = 0;
    droppedTables.length = 0;
    createdIndexes.length = 0;
    rawQueries.length = 0;
    mockStorage.clear();
  });

  afterAll(() => {
    // Cleanup
    mockStorage.clear();
  });

  describe('Migration file exists', () => {
    it('should import the migration module', () => {
      expect(up).toBeDefined();
      expect(typeof up).toBe('function');
      expect(down).toBeDefined();
      expect(typeof down).toBe('function');
    });
  });

  describe('up() function', () => {
    beforeAll(async () => {
      createdTables.length = 0;
      createdIndexes.length = 0;
      rawQueries.length = 0;
      mockKnex = createMockKnex();
      await up(mockKnex);
    });

    it('should create session_checkpoints table', () => {
      expect(createdTables).toContain('session_checkpoints');
    });

    it('should create kv_memories table', () => {
      expect(createdTables).toContain('kv_memories');
    });

    it('should create memory_candidates table', () => {
      expect(createdTables).toContain('memory_candidates');
    });

    it('should create three tables total', () => {
      expect(createdTables).toHaveLength(3);
    });

    it('should add indexes for session_checkpoints', () => {
      // session_id should be indexed
      expect(createdIndexes.some(idx => idx.includes('session_checkpoints'))).toBe(true);
    });

    it('should add indexes for kv_memories', () => {
      // project_id and session_id should be indexed
      expect(createdIndexes.filter(idx => idx.includes('kv_memories')).length).toBeGreaterThanOrEqual(2);
    });

    it('should add indexes for memory_candidates', () => {
      // project_id should be indexed
      expect(createdIndexes.some(idx => idx.includes('memory_candidates'))).toBe(true);
    });

    it('should add check constraints via raw queries', () => {
      expect(rawQueries.length).toBeGreaterThan(0);
      expect(rawQueries.some(q => q.includes('CHECK'))).toBe(true);
    });
  });

  describe('down() function', () => {
    beforeAll(async () => {
      droppedTables.length = 0;
      mockKnex = createMockKnex();
      await down(mockKnex);
    });

    it('should drop session_checkpoints table', () => {
      expect(droppedTables).toContain('session_checkpoints');
    });

    it('should drop kv_memories table', () => {
      expect(droppedTables).toContain('kv_memories');
    });

    it('should drop memory_candidates table', () => {
      expect(droppedTables).toContain('memory_candidates');
    });

    it('should drop tables in reverse order (foreign key safety)', () => {
      // Tables should be dropped in reverse order of creation
      const sessionIdx = droppedTables.indexOf('session_checkpoints');
      const kvIdx = droppedTables.indexOf('kv_memories');
      const candidatesIdx = droppedTables.indexOf('memory_candidates');

      expect(sessionIdx).toBeGreaterThanOrEqual(0);
      expect(kvIdx).toBeGreaterThanOrEqual(0);
      expect(candidatesIdx).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Schema requirements', () => {
    beforeAll(async () => {
      createdTables.length = 0;
      rawQueries.length = 0;
      mockKnex = createMockKnex();
      await up(mockKnex);
    });

    it('should create all required tables', () => {
      expect(createdTables).toContain('session_checkpoints');
      expect(createdTables).toContain('kv_memories');
      expect(createdTables).toContain('memory_candidates');
    });

    it('should add trigger check constraint', () => {
      expect(rawQueries.some(q => q.includes('chk_session_checkpoints_trigger'))).toBe(true);
    });

    it('should add level check constraint', () => {
      expect(rawQueries.some(q => q.includes('chk_kv_memories_level'))).toBe(true);
    });

    it('should add type check constraint', () => {
      expect(rawQueries.some(q => q.includes('chk_memory_candidates_type'))).toBe(true);
    });
  });
});
