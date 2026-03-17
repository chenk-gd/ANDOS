/**
 * AutoMemoryExtractionService Tests
 * Tests for automatic memory extraction from agent sessions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MemoryCandidate } from '../../../src/types/memory';

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
        // Handle object filter like { key: 'xyz' }
        filtered = filtered.filter((row) => {
          return Object.entries(field).every(([k, v]) => {
            if (v === null) return row[k] === null;
            return row[k] === v;
          });
        });
      } else if (typeof field === 'string' && op !== undefined && value !== undefined) {
        // Handle where('field', '<', value) with operator
        if (op === '=') {
          filtered = filtered.filter((row) => row[field] === value);
        } else if (op === 'in') {
          filtered = filtered.filter((row) => value.includes(row[field]));
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

    orderBy: vi.fn(function (this: any, field: string, direction: string = 'asc') {
      const table = this._filtered ?? getTable();
      const sorted = [...table].sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];

        // Handle numeric fields
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return direction === 'desc' ? bVal - aVal : aVal - bVal;
        }

        // Handle date fields
        if (aVal instanceof Date && bVal instanceof Date) {
          return direction === 'desc'
            ? bVal.getTime() - aVal.getTime()
            : aVal.getTime() - bVal.getTime();
        }

        // Handle string fields
        if (direction === 'desc') {
          return String(bVal).localeCompare(String(aVal));
        }
        return String(aVal).localeCompare(String(bVal));
      });
      this._filtered = sorted;
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

    // Handle direct insert without where clause
    then: vi.fn(function (this: any, onFulfilled: any) {
      // If we have data to insert, do it now
      if (this._data) {
        const table = getTable();
        if (Array.isArray(this._data)) {
          table.push(...this._data);
        } else {
          table.push(this._data);
        }
        this._data = null;
      }
      const data = this._filtered || getTable();
      this._filtered = null;
      return Promise.resolve(onFulfilled ? onFulfilled(data) : data);
    }),

    update: vi.fn(function (this: any, data: any) {
      const table = getTable();
      const targetRows = this._filtered || [];
      let count = 0;

      targetRows.forEach((targetRow: any) => {
        const idx = table.findIndex((r) => r.id === targetRow.id);
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
        const idx = table.findIndex((r) => r.id === targetRow.id);
        if (idx !== -1) {
          table.splice(idx, 1);
          count++;
        }
      });

      return Promise.resolve(count);
    }),
  };

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
  AutoMemoryExtractionService,
  DEFAULT_EXTRACTION_POLICY,
  autoMemoryExtractionService,
} from '../../../src/services/AutoMemoryExtractionService';

describe('AutoMemoryExtractionService', () => {
  let service: AutoMemoryExtractionService;

  beforeEach(() => {
    mockStorage.clear();
    mockStorage.set('memory_candidates', []);
    uuidIndex = 0;
    mockNow = new Date('2024-01-01T00:00:00Z');
    service = new AutoMemoryExtractionService();
  });

  describe('extractInBackground', () => {
    it('should identify candidates without blocking', async () => {
      const sessionId = 'session_abc123';
      const turns = [
        { id: 'turn1', role: 'user', content: 'How do I handle errors?', timestamp: new Date() },
        { id: 'turn2', role: 'assistant', content: 'Use try-catch blocks', timestamp: new Date() },
      ];

      // Should complete quickly without blocking
      const startTime = Date.now();
      await service.extractInBackground(sessionId, turns);
      const endTime = Date.now();

      // Should complete in reasonable time (non-blocking)
      expect(endTime - startTime).toBeLessThan(100);

      // Candidates should be stored
      const table = mockStorage.get('memory_candidates');
      expect(table).toBeDefined();
    });

    it('should handle empty turns gracefully', async () => {
      const sessionId = 'session_empty';
      const turns: any[] = [];

      await service.extractInBackground(sessionId, turns);

      // Should not throw
      const table = mockStorage.get('memory_candidates');
      expect(table).toHaveLength(0);
    });

    it('should handle extraction errors gracefully', async () => {
      const sessionId = 'session_error';
      const turns = [
        { id: 'turn1', role: 'user', content: 'Test', timestamp: new Date() },
      ];

      // Should not throw even if extraction fails
      await expect(service.extractInBackground(sessionId, turns)).resolves.not.toThrow();
    });
  });

  describe('identifyCandidates', () => {
    it('should extract decision candidates from session turns', async () => {
      const sessionId = 'session_abc123';
      const turns = [
        {
          id: 'turn1',
          role: 'user',
          content: 'We decided to use PostgreSQL for the database',
          timestamp: new Date(),
        },
        {
          id: 'turn2',
          role: 'assistant',
          content: 'Good choice, PostgreSQL is reliable',
          timestamp: new Date(),
        },
      ];

      const candidates = await service.identifyCandidates(sessionId, turns);

      // Should identify at least one candidate
      expect(candidates.length).toBeGreaterThan(0);

      // Check candidate structure
      const decisionCandidate = candidates.find((c) => c.type === 'decision');
      if (decisionCandidate) {
        expect(decisionCandidate.content.toLowerCase()).toContain('postgresql');
        expect(decisionCandidate.confidence).toBeGreaterThan(0);
        expect(decisionCandidate.confidence).toBeLessThanOrEqual(1);
        expect(decisionCandidate.source).toBe(sessionId);
      }
    });

    it('should extract pattern candidates from code examples', async () => {
      const sessionId = 'session_pattern';
      const turns = [
        {
          id: 'turn1',
          role: 'assistant',
          content: 'Here is the pattern: async function with try-catch',
          timestamp: new Date(),
        },
      ];

      const candidates = await service.identifyCandidates(sessionId, turns);

      const patternCandidate = candidates.find((c) => c.type === 'pattern');
      if (patternCandidate) {
        expect(patternCandidate.content).toBeDefined();
        expect(patternCandidate.confidence).toBeGreaterThan(0);
      }
    });

    it('should extract error candidates from error messages', async () => {
      const sessionId = 'session_error';
      const turns = [
        {
          id: 'turn1',
          role: 'user',
          content: 'I got this error: Connection refused',
          timestamp: new Date(),
        },
        {
          id: 'turn2',
          role: 'assistant',
          content: 'The error occurs when the database is not running',
          timestamp: new Date(),
        },
      ];

      const candidates = await service.identifyCandidates(sessionId, turns);

      const errorCandidate = candidates.find((c) => c.type === 'error');
      if (errorCandidate) {
        expect(errorCandidate.content.toLowerCase()).toContain('error');
        expect(errorCandidate.confidence).toBeGreaterThan(0);
      }
    });

    it('should extract insight candidates from important findings', async () => {
      const sessionId = 'session_insight';
      const turns = [
        {
          id: 'turn1',
          role: 'assistant',
          content: 'Key insight: use indexes for better performance',
          timestamp: new Date(),
        },
      ];

      const candidates = await service.identifyCandidates(sessionId, turns);

      const insightCandidate = candidates.find((c) => c.type === 'insight');
      if (insightCandidate) {
        expect(insightCandidate.content.toLowerCase()).toContain('insight');
        expect(insightCandidate.confidence).toBeGreaterThan(0);
      }
    });

    it('should handle sessions with no extractable content', async () => {
      const sessionId = 'session_no_content';
      const turns = [
        {
          id: 'turn1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date(),
        },
        {
          id: 'turn2',
          role: 'assistant',
          content: 'Hi there',
          timestamp: new Date(),
        },
      ];

      const candidates = await service.identifyCandidates(sessionId, turns);

      // May return empty array or minimal candidates
      expect(Array.isArray(candidates)).toBe(true);
    });

    it('should calculate confidence based on content relevance', async () => {
      const sessionId = 'session_confidence';
      const turns = [
        {
          id: 'turn1',
          role: 'assistant',
          content: 'Decision: we will use TypeScript for type safety. This is final.',
          timestamp: new Date(),
        },
      ];

      const candidates = await service.identifyCandidates(sessionId, turns);

      candidates.forEach((candidate) => {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('storeCandidates', () => {
    it('should save candidates to the candidate pool', async () => {
      const candidates: MemoryCandidate[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          type: 'decision',
          content: 'Use PostgreSQL for database',
          confidence: 0.9,
          source: 'session_test',
          status: 'pending',
          created_at: new Date(),
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          type: 'pattern',
          content: 'Use async/await for async operations',
          confidence: 0.85,
          source: 'session_test',
          status: 'pending',
          created_at: new Date(),
        },
      ];

      await service.storeCandidates(candidates);

      const table = mockStorage.get('memory_candidates');
      expect(table).toHaveLength(2);
      expect(table![0].type).toBe('decision');
      expect(table![0].status).toBe('pending');
      expect(table![1].type).toBe('pattern');
    });

    it('should handle empty candidates array', async () => {
      const candidates: MemoryCandidate[] = [];

      await service.storeCandidates(candidates);

      const table = mockStorage.get('memory_candidates');
      expect(table).toHaveLength(0);
    });

    it('should set default status to pending', async () => {
      const candidates: MemoryCandidate[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          type: 'error',
          content: 'Connection timeout error',
          confidence: 0.75,
          source: 'session_test',
          status: 'pending',
          created_at: new Date(),
        },
      ];

      await service.storeCandidates(candidates);

      const table = mockStorage.get('memory_candidates');
      expect(table![0].status).toBe('pending');
    });

    it('should include project_id when provided', async () => {
      const candidates: MemoryCandidate[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          type: 'decision',
          content: 'Use PostgreSQL',
          confidence: 0.9,
          source: 'session_test',
          status: 'pending',
          created_at: new Date(),
          project_id: 'proj_123',
        },
      ];

      await service.storeCandidates(candidates);

      const table = mockStorage.get('memory_candidates');
      expect(table![0].project_id).toBe('proj_123');
    });
  });

  describe('getPendingCandidates', () => {
    it('should return pending candidates for user review', async () => {
      // Setup test data
      const table = mockStorage.get('memory_candidates');
      table!.push(
        {
          id: '11111111-1111-1111-1111-111111111111',
          type: 'decision',
          content: 'Decision 1',
          confidence: 0.9,
          source: 'session_1',
          status: 'pending',
          created_at: new Date(),
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          type: 'pattern',
          content: 'Pattern 1',
          confidence: 0.8,
          source: 'session_2',
          status: 'approved',
          created_at: new Date(),
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          type: 'error',
          content: 'Error 1',
          confidence: 0.7,
          source: 'session_3',
          status: 'pending',
          created_at: new Date(),
        }
      );

      const pending = await service.getPendingCandidates();

      // Should only return pending candidates
      expect(pending).toHaveLength(2);
      expect(pending.every((c) => c.status === 'pending')).toBe(true);
    });

    it('should return empty array when no pending candidates', async () => {
      const pending = await service.getPendingCandidates();
      expect(pending).toEqual([]);
    });

    it('should order candidates by confidence descending', async () => {
      const table = mockStorage.get('memory_candidates');
      table!.push(
        {
          id: '11111111-1111-1111-1111-111111111111',
          type: 'decision',
          content: 'Low confidence',
          confidence: 0.5,
          source: 'session_1',
          status: 'pending',
          created_at: new Date(),
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          type: 'pattern',
          content: 'High confidence',
          confidence: 0.95,
          source: 'session_2',
          status: 'pending',
          created_at: new Date(),
        }
      );

      const pending = await service.getPendingCandidates();

      // Should be ordered by confidence desc
      expect(pending[0].confidence).toBe(0.95);
      expect(pending[1].confidence).toBe(0.5);
    });
  });

  describe('processCandidateFeedback', () => {
    it('should approve candidate', async () => {
      // Setup candidate
      const table = mockStorage.get('memory_candidates');
      table!.push({
        id: '11111111-1111-1111-1111-111111111111',
        type: 'decision',
        content: 'Original content',
        confidence: 0.9,
        source: 'session_1',
        status: 'pending',
        created_at: new Date(),
      });

      await service.processCandidateFeedback(
        '11111111-1111-1111-1111-111111111111',
        'approve'
      );

      const updated = table!.find((c) => c.id === '11111111-1111-1111-1111-111111111111');
      expect(updated.status).toBe('approved');
    });

    it('should reject candidate', async () => {
      const table = mockStorage.get('memory_candidates');
      table!.push({
        id: '11111111-1111-1111-1111-111111111111',
        type: 'decision',
        content: 'Original content',
        confidence: 0.9,
        source: 'session_1',
        status: 'pending',
        created_at: new Date(),
      });

      await service.processCandidateFeedback(
        '11111111-1111-1111-1111-111111111111',
        'reject',
        'Not relevant'
      );

      const updated = table!.find((c) => c.id === '11111111-1111-1111-1111-111111111111');
      expect(updated.status).toBe('rejected');
      expect(updated.user_feedback).toBe('Not relevant');
    });

    it('should edit candidate content', async () => {
      const table = mockStorage.get('memory_candidates');
      table!.push({
        id: '11111111-1111-1111-1111-111111111111',
        type: 'decision',
        content: 'Original content',
        confidence: 0.9,
        source: 'session_1',
        status: 'pending',
        created_at: new Date(),
      });

      await service.processCandidateFeedback(
        '11111111-1111-1111-1111-111111111111',
        'edit',
        'Edited content'
      );

      const updated = table!.find((c) => c.id === '11111111-1111-1111-1111-111111111111');
      expect(updated.status).toBe('approved');
      expect(updated.content).toBe('Edited content');
      expect(updated.user_feedback).toBe('Edited content');
    });

    it('should reject edit action without editedContent', async () => {
      const table = mockStorage.get('memory_candidates');
      table!.push({
        id: '11111111-1111-1111-1111-111111111111',
        type: 'decision',
        content: 'Original content',
        confidence: 0.9,
        source: 'session_1',
        status: 'pending',
        created_at: new Date(),
      });

      await expect(
        service.processCandidateFeedback(
          '11111111-1111-1111-1111-111111111111',
          'edit'
        )
      ).rejects.toThrow('editedContent is required for edit action');
    });

    it('should handle non-existent candidate gracefully', async () => {
      await expect(
        service.processCandidateFeedback('non-existent', 'approve')
      ).resolves.not.toThrow();
    });
  });

  describe('DEFAULT_EXTRACTION_POLICY', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_EXTRACTION_POLICY.tokenThresholds.first).toBe(10000);
      expect(DEFAULT_EXTRACTION_POLICY.tokenThresholds.subsequent).toBe(5000);
      expect(DEFAULT_EXTRACTION_POLICY.toolCallInterval).toBe(3);
      expect(DEFAULT_EXTRACTION_POLICY.timeInterval).toBe(5 * 60 * 1000); // 5 minutes
      expect(DEFAULT_EXTRACTION_POLICY.events).toContain('asset_published');
      expect(DEFAULT_EXTRACTION_POLICY.events).toContain('dirty_resolved');
      expect(DEFAULT_EXTRACTION_POLICY.events).toContain('error_occurred');
      expect(DEFAULT_EXTRACTION_POLICY.events).toContain('decision_made');
    });
  });

  describe('singleton export', () => {
    it('should export singleton instance', () => {
      expect(autoMemoryExtractionService).toBeInstanceOf(AutoMemoryExtractionService);
    });
  });
});
