/**
 * AssetService Tests (Mock Version)
 * Tests for soft delete, state management, dependencies using mock database
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetService, AssetNotFoundError, DuplicateSlugError } from '../../../src/services/AssetService';

// In-memory storage for mock database - module level so it can be cleared between tests
const mockStorage: Map<string, any[]> = new Map();

// Helper to create mock query builder
function createMockQueryBuilder(tableName: string) {
  const queries: any[] = [];

  const getTable = () => {
    if (!mockStorage.has(tableName)) {
      mockStorage.set(tableName, []);
    }
    return mockStorage.get(tableName)!;
  };

  const applyFilters = (data: any[]) => {
    let result = [...data];

    for (const query of queries) {
      switch (query.type) {
        case 'where':
          result = result.filter((row) =>
            Object.entries(query.condition).every(([key, value]) => row[key] === value)
          );
          break;
        case 'whereNull':
          result = result.filter((row) => row[query.field] === null || row[query.field] === undefined);
          break;
        case 'whereNotNull':
          result = result.filter((row) => row[query.field] !== null && row[query.field] !== undefined);
          break;
        case 'whereNot':
          result = result.filter((row) => row[query.field] !== query.value);
          break;
        case 'whereIn':
          result = result.filter((row) => query.values.includes(row[query.field]));
          break;
        case 'orderBy':
          result.sort((a, b) => {
            const aVal = a[query.field];
            const bVal = b[query.field];
            if (query.direction === 'desc') {
              return bVal > aVal ? 1 : -1;
            }
            return aVal > bVal ? 1 : -1;
          });
          break;
        case 'limit':
          result = result.slice(0, query.n);
          break;
        case 'offset':
          result = result.slice(query.n);
          break;
      }
    }

    return result;
  };

  const builder: any = {
    where: vi.fn((...args: any[]) => {
      if (typeof args[0] === 'object') {
        queries.push({ type: 'where', condition: args[0] });
      } else if (typeof args[0] === 'string' && args.length === 2) {
        // Handle where('field', value) syntax
        queries.push({ type: 'where', condition: { [args[0]]: args[1] } });
      } else if (typeof args[0] === 'string') {
        queries.push({ type: 'whereRaw', raw: args[0], bindings: args[1] });
      }
      return builder;
    }),
    whereNotNull: vi.fn((field: string) => {
      queries.push({ type: 'whereNotNull', field });
      return builder;
    }),
    whereNull: vi.fn((field: string) => {
      queries.push({ type: 'whereNull', field });
      return builder;
    }),
    whereNot: vi.fn((field: string, value: any) => {
      queries.push({ type: 'whereNot', field, value });
      return builder;
    }),
    whereIn: vi.fn((field: string, values: any[]) => {
      queries.push({ type: 'whereIn', field, values });
      return builder;
    }),
    whereRaw: vi.fn((raw: string, bindings?: any[]) => {
      queries.push({ type: 'whereRaw', raw, bindings });
      return builder;
    }),
    orWhere: vi.fn((callback: Function) => {
      queries.push({ type: 'orWhere', callback });
      return builder;
    }),
    join: vi.fn(() => builder),
    orderBy: vi.fn((field: string, direction: string) => {
      queries.push({ type: 'orderBy', field, direction });
      return builder;
    }),
    limit: vi.fn((n: number) => {
      queries.push({ type: 'limit', n });
      return builder;
    }),
    offset: vi.fn((n: number) => {
      queries.push({ type: 'offset', n });
      return builder;
    }),
    select: vi.fn(() => builder),
    distinct: vi.fn(() => builder),
    count: vi.fn((field: string) => {
      queries.push({ type: 'count', field });
      return builder;
    }),
    sum: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    first: vi.fn(async () => {
      const data = getTable();
      const result = applyFilters(data);

      const countQuery = queries.find((q) => q.type === 'count');
      if (countQuery) {
        return { count: result.length }; // Return number, not string
      }

      return result[0] || null;
    }),
    then: vi.fn(async (callback: Function) => {
      const data = getTable();
      const result = applyFilters(data);

      const countQuery = queries.find((q) => q.type === 'count');
      if (countQuery) {
        return callback({ count: result.length.toString() });
      }

      return callback(result);
    }),
    insert: vi.fn((data: any) => {
      const table = getTable();
      const records = Array.isArray(data) ? data : [data];

      for (const record of records) {
        const newRecord = { ...record };
        if (!newRecord.id) {
          newRecord.id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        table.push(newRecord);
      }

      return {
        returning: vi.fn(async () => table.slice(-records.length)),
      };
    }),
    update: vi.fn((data: any) => {
      const table = getTable();
      const rows = applyFilters(table);
      for (const row of rows) {
        Object.assign(row, data);
      }

      return {
        returning: vi.fn(async () => rows),
      };
    }),
    delete: vi.fn(async () => {
      const table = getTable();
      const rowsToDelete = applyFilters(table);
      for (const row of rowsToDelete) {
        const index = table.indexOf(row);
        if (index > -1) {
          table.splice(index, 1);
        }
      }
      return rowsToDelete.length;
    }),
    increment: vi.fn(async (field: string, amount: number) => {
      const table = getTable();
      const rows = applyFilters(table);
      for (const row of rows) {
        row[field] = (row[field] || 0) + amount;
      }
      return 1;
    }),
    onConflict: vi.fn(() => ({ ignore: vi.fn(async () => []) })),
    raw: vi.fn((query: string) => query),
  };

  return builder;
}

// Mock the db module
vi.mock('../../../src/db/connection', () => {
  const mockDb = vi.fn((tableName: string) => createMockQueryBuilder(tableName));
  return {
    db: mockDb,
    withTransaction: vi.fn(async (callback: any) => {
      return await callback(mockDb);
    }),
  };
});

// Test IDs
const TEST_IDS = {
  project: '11111111-1111-1111-1111-111111111111',
  team: '22222222-2222-2222-2222-222222222222',
  user: '33333333-3333-3333-3333-333333333333',
};

let assetCounter = 0;

// Helper functions for test fixtures
function createAssetInput(overrides: Partial<any> = {}): any {
  assetCounter++;
  const timestamp = Date.now();
  return {
    name: `Test Asset ${timestamp}-${assetCounter}`,
    slug: `test-asset-${timestamp}-${assetCounter}`,
    description: 'Test description',
    tags: ['test', 'fixture'],
    type: 'requirement',
    project_id: TEST_IDS.project,
    team_id: TEST_IDS.team,
    owners: [TEST_IDS.user],
    auto_approval_enabled: false,
    created_by: TEST_IDS.user,
    ...overrides,
  };
}

function createTestAsset(overrides: Partial<any> = {}): any {
  const input = createAssetInput(overrides);
  const now = new Date();
  const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const asset = {
    id,
    ...input,
    state: 'draft',
    current_version: null,
    deleted_at: null,
    deleted_by: null,
    created_at: now,
    updated_at: now,
    updated_by: input.created_by,
  };

  const table = mockStorage.get('assets') || [];
  table.push(asset);
  mockStorage.set('assets', table);

  return asset;
}

describe('AssetService (Mock)', () => {
  let service: AssetService;

  beforeEach(() => {
    assetCounter = 0;
    mockStorage.clear();
    service = new AssetService();
  });

  describe('CRUD Operations', () => {
    it('should create an asset', async () => {
      const input = createAssetInput();
      const asset = await service.create(input);

      expect(asset).toBeDefined();
      expect(asset.name).toBe(input.name);
      expect(asset.slug).toBe(input.slug);
      expect(asset.state).toBe('draft');
      expect(asset.project_id).toBe(TEST_IDS.project);
    });

    it('should get asset by id', async () => {
      const created = createTestAsset();
      const asset = await service.getById(created.id);

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(created.id);
      expect(asset?.name).toBe(created.name);
    });

    it('should return null for non-existent asset', async () => {
      const asset = await service.getById('non-existent-id');
      expect(asset).toBeNull();
    });

    it('should get asset by slug', async () => {
      const created = createTestAsset();
      const asset = await service.getBySlug(created.slug, TEST_IDS.project);

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(created.id);
    });

    it('should update an asset', async () => {
      const created = createTestAsset();
      const updated = await service.update(created.id, {
        name: 'Updated Name',
        updated_by: TEST_IDS.user,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.slug).toBe(created.slug);
    });

    it('should throw AssetNotFoundError when updating non-existent asset', async () => {
      await expect(
        service.update('non-existent', { name: 'Test' })
      ).rejects.toThrow(AssetNotFoundError);
    });

    it('should list assets with filters', async () => {
      createTestAsset({ type: 'requirement' });
      createTestAsset({ type: 'design' });

      const requirements = await service.list({ type: 'requirement' });
      expect(requirements.length).toBe(1);
      expect(requirements[0].type).toBe('requirement');
    });
  });

  describe('Soft Delete', () => {
    it('should soft delete an asset', async () => {
      const asset = createTestAsset();
      await service.softDelete(asset.id, { deleted_by: TEST_IDS.user });

      const deleted = await service.getById(asset.id);
      expect(deleted).toBeNull();

      const deletedIncluding = await service.getById(asset.id, true);
      expect(deletedIncluding).toBeDefined();
      expect(deletedIncluding?.deleted_at).toBeDefined();
      expect(deletedIncluding?.state).toBe('archived');
    });

    it('should restore a soft-deleted asset', async () => {
      const asset = createTestAsset();
      await service.softDelete(asset.id, { deleted_by: TEST_IDS.user });

      const restored = await service.restore(asset.id, TEST_IDS.user);
      expect(restored.deleted_at).toBeNull();
      expect(restored.state).toBe('draft');

      const found = await service.getById(asset.id);
      expect(found).toBeDefined();
    });

    it('should list soft-deleted assets', async () => {
      const asset = createTestAsset();
      await service.softDelete(asset.id, { deleted_by: TEST_IDS.user });

      const deleted = await service.listDeleted(TEST_IDS.project);
      expect(deleted.length).toBeGreaterThan(0);
      expect(deleted.some((a) => a.id === asset.id)).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should transition from draft to clean', async () => {
      const asset = createTestAsset();
      const updated = await service.transitionState(asset.id, 'clean', {
        triggeredBy: 'user',
        actorId: TEST_IDS.user,
        actorType: 'user',
      });

      expect(updated.state).toBe('clean');
    });
  });

  describe('Slug Uniqueness', () => {
    it('should prevent duplicate slug in same project', async () => {
      const input = createAssetInput({ slug: 'unique-slug-test' });
      await service.create(input);

      await expect(service.create(input)).rejects.toThrow(DuplicateSlugError);
    });

    it('should allow same slug after soft delete', async () => {
      const input = createAssetInput({ slug: 'reusable-slug-test' });
      const asset = await service.create(input);
      await service.softDelete(asset.id, { deleted_by: TEST_IDS.user });

      const newAsset = await service.create({
        ...input,
        name: 'New Asset',
      });

      expect(newAsset.slug).toBe('reusable-slug-test');
    });

    it('should allow slug in different projects', async () => {
      const input = createAssetInput({ slug: 'same-slug-test' });
      await service.create(input);

      const otherProject = '44444444-4444-4444-4444-444444444444';
      const otherAsset = await service.create({
        ...input,
        project_id: otherProject,
      });

      expect(otherAsset.slug).toBe('same-slug-test');
    });
  });
});
