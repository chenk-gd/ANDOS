/**
 * Project Memory Migration Tests
 * Tests for database migration 011_create_project_memory_tables.ts
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { up, down } from '../../../database/migrations/011_create_project_memory_tables';
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
    unique: () => colBuilder,
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

describe('Project Memory Migration', () => {
  let mockKnex: Knex;

  beforeEach(() => {
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
    beforeEach(async () => {
      createdTables.length = 0;
      createdIndexes.length = 0;
      rawQueries.length = 0;
      mockKnex = createMockKnex();
      await up(mockKnex);
    });

    it('should create project_memories table', () => {
      expect(createdTables).toContain('project_memories');
    });

    it('should create learned_patterns table', () => {
      expect(createdTables).toContain('learned_patterns');
    });

    it('should create project_memory_files table', () => {
      expect(createdTables).toContain('project_memory_files');
    });

    it('should create three tables total', () => {
      expect(createdTables).toHaveLength(3);
    });

    it('should add indexes for project_memories', () => {
      // project_id should be indexed/unique
      expect(createdIndexes.some(idx => idx.includes('project_memories'))).toBe(true);
    });

    it('should add indexes for learned_patterns', () => {
      // project_id should be indexed
      expect(createdIndexes.some(idx => idx.includes('learned_patterns'))).toBe(true);
    });

    it('should add indexes for project_memory_files', () => {
      // project_id should be indexed
      expect(createdIndexes.some(idx => idx.includes('project_memory_files'))).toBe(true);
    });

    it('should add check constraints via raw queries', () => {
      expect(rawQueries.length).toBeGreaterThan(0);
      expect(rawQueries.some(q => q.includes('CHECK'))).toBe(true);
    });
  });

  describe('down() function', () => {
    beforeEach(async () => {
      droppedTables.length = 0;
      mockKnex = createMockKnex();
      await down(mockKnex);
    });

    it('should drop project_memories table', () => {
      expect(droppedTables).toContain('project_memories');
    });

    it('should drop learned_patterns table', () => {
      expect(droppedTables).toContain('learned_patterns');
    });

    it('should drop project_memory_files table', () => {
      expect(droppedTables).toContain('project_memory_files');
    });

    it('should drop tables in reverse order (foreign key safety)', () => {
      // Tables should be dropped in reverse order of creation
      // Expected order: project_memory_files (1st), learned_patterns (2nd), project_memories (3rd)
      expect(droppedTables).toEqual(['project_memory_files', 'learned_patterns', 'project_memories']);
    });
  });

  describe('Schema requirements', () => {
    beforeEach(async () => {
      createdTables.length = 0;
      rawQueries.length = 0;
      mockKnex = createMockKnex();
      await up(mockKnex);
    });

    it('should create all required tables', () => {
      expect(createdTables).toContain('project_memories');
      expect(createdTables).toContain('learned_patterns');
      expect(createdTables).toContain('project_memory_files');
    });

    it('should add type check constraint for learned_patterns', () => {
      expect(rawQueries.some(q => q.includes('chk_learned_patterns_type'))).toBe(true);
    });

    it('should add confidence check constraint for learned_patterns', () => {
      expect(rawQueries.some(q => q.includes('chk_learned_patterns_confidence'))).toBe(true);
    });

    it('should add file_type check constraint for project_memory_files', () => {
      expect(rawQueries.some(q => q.includes('chk_project_memory_files_type'))).toBe(true);
    });
  });
});
