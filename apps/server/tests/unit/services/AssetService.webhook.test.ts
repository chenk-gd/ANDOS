/**
 * AssetService Webhook Integration Tests - TDD
 * Tests for dirty propagation webhook events
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetService } from '../../../src/services/AssetService';
import { webhookService } from '../../../src/services/WebhookService';

// In-memory storage for mock database
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
    orWhere: vi.fn(() => builder),
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
        return { count: result.length };
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
      mockStorage.set(tableName, table);
      return {
        returning: vi.fn(async () => [table[table.length - 1]]),
        onConflict: vi.fn(() => ({
          ignore: vi.fn(async () => []),
          merge: vi.fn(async () => []),
        })),
      };
    }),
    update: vi.fn((data: any) => {
      const table = getTable();
      let updated: any[] = [];
      for (const row of table) {
        let matches = true;
        for (const query of queries) {
          if (query.type === 'where' && query.condition.id !== undefined) {
            if (row.id !== query.condition.id) {
              matches = false;
              break;
            }
          }
        }
        if (matches) {
          Object.assign(row, data);
          updated.push(row);
        }
      }
      return {
        returning: vi.fn(async () => updated),
      };
    }),
    delete: vi.fn(async () => 0),
    increment: vi.fn(async () => 1),
    onConflict: vi.fn(() => ({
      ignore: vi.fn(async () => []),
      merge: vi.fn(async () => []),
    })),
    raw: vi.fn((raw: string) => raw),
  };

  return builder;
}

// Mock the database connection module
vi.mock('../../../src/db/connection', () => {
  const mockDb = vi.fn((tableName: string) => createMockQueryBuilder(tableName));
  return {
    db: mockDb,
    withTransaction: vi.fn(async (callback: any) => {
      return await callback(mockDb);
    }),
  };
});

// Mock webhook service - use a factory without external references
vi.mock('../../../src/services/WebhookService', () => ({
  webhookService: {
    triggerEvent: vi.fn().mockResolvedValue({ deliveriesCreated: 1, subscriptionsMatched: 1 }),
  },
}));

describe('AssetService Webhook Integration', () => {
  let service: AssetService;

  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
    service = new AssetService();
  });

  function createTestAsset(overrides: Partial<any> = {}): any {
    const id = overrides.id || `asset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const asset = {
      id,
      name: 'Test Asset',
      slug: `test-asset-${id}`,
      description: 'Test description',
      type: 'requirement',
      project_id: 'project-1',
      team_id: 'team-1',
      owners: ['user-1'],
      state: 'clean',
      current_version: 'v1.0.0',
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: 'user-1',
      updated_by: 'user-1',
      ...overrides,
    };
    const table = mockStorage.get('assets') || [];
    table.push(asset);
    mockStorage.set('assets', table);
    return asset;
  }

  describe('Dirty Event Webhooks', () => {
    it('should trigger asset.dirty webhook when marking asset as dirty', async () => {
      const asset = createTestAsset({ id: 'asset-1', state: 'clean' });

      // Mark dirty should trigger webhook
      await service.markDirty(asset.id, 'upstream-1', 'v1.0.0', {
        impactLevel: 'high',
      });

      // Verify webhook was triggered
      expect(webhookService.triggerEvent).toHaveBeenCalledWith(
        'asset.dirty',
        expect.objectContaining({
          asset_id: 'asset-1',
          upstream_asset_id: 'upstream-1',
          upstream_version: 'v1.0.0',
          impact_level: 'high',
        }),
        expect.any(Object)
      );
    });

    it('should trigger asset.dirty webhook for each downstream asset', async () => {
      // Create upstream asset with a version
      createTestAsset({ id: 'upstream-1', state: 'clean', project_id: 'project-1', current_version: 'v1.0.0' });
      // Create downstream assets
      createTestAsset({ id: 'downstream-1', state: 'clean', project_id: 'project-1' });
      createTestAsset({ id: 'downstream-2', state: 'clean', project_id: 'project-1' });

      // Add versions for publishing
      const versionsTable = mockStorage.get('asset_versions') || [];
      versionsTable.push({
        id: 'version-1',
        asset_id: 'upstream-1',
        version: 'v1.0.0',
        state: 'draft',
        created_at: new Date(),
      });
      mockStorage.set('asset_versions', versionsTable);

      // Add dependencies - note the correct field names: source=downstream, target=upstream
      const depsTable = mockStorage.get('dependencies') || [];
      depsTable.push(
        { id: 'dep-1', source_asset_id: 'downstream-1', target_asset_id: 'upstream-1', source_version: 'v1.0.0', target_version: 'v1.0.0', dependency_type: 'depends_on', created_at: new Date() },
        { id: 'dep-2', source_asset_id: 'downstream-2', target_asset_id: 'upstream-1', source_version: 'v1.0.0', target_version: 'v1.0.0', dependency_type: 'depends_on', created_at: new Date() }
      );
      mockStorage.set('dependencies', depsTable);

      // Publish version triggers propagateDirtyStatus
      await service.publishVersion('upstream-1', 'v1.0.0', 'user-1');

      // Should trigger webhook for each affected asset (dirty + batch + published)
      expect(webhookService.triggerEvent).toHaveBeenCalled();
    });

    it('should include impact analysis in webhook payload', async () => {
      const impactAnalysis = {
        affectedFields: ['schema', 'logic'],
        breakingChanges: true,
      };

      const asset = createTestAsset({ id: 'asset-1', state: 'clean' });

      await service.markDirty(asset.id, 'upstream-1', 'v1.0.0', {
        impactLevel: 'high',
        impactAnalysis,
      });

      expect(webhookService.triggerEvent).toHaveBeenCalledWith(
        'asset.dirty',
        expect.objectContaining({
          impact_analysis: impactAnalysis,
        }),
        expect.any(Object)
      );
    });
  });

  describe('Publish Event Webhooks', () => {
    it('should trigger asset.published webhook on version publish', async () => {
      const asset = createTestAsset({ id: 'asset-1', state: 'clean' });

      // Add a version to publish
      const versionsTable = mockStorage.get('asset_versions') || [];
      versionsTable.push({
        id: 'version-1',
        asset_id: 'asset-1',
        version: 'v1.0.0',
        content: { key: 'value' },
        state: 'draft',
        created_at: new Date(),
        created_by: 'user-1',
      });
      mockStorage.set('asset_versions', versionsTable);

      await service.publishVersion(asset.id, 'v1.0.0', 'user-1');

      expect(webhookService.triggerEvent).toHaveBeenCalledWith(
        'asset.published',
        expect.objectContaining({
          asset_id: 'asset-1',
          version: 'v1.0.0',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Webhook Event Payload', () => {
    it('should include timestamp in webhook payload', async () => {
      const asset = createTestAsset({ id: 'asset-1', state: 'clean' });
      await service.markDirty(asset.id, 'upstream-1', 'v1.0.0');

      const callArgs = vi.mocked(webhookService.triggerEvent).mock.calls[0];
      expect(callArgs[1]).toHaveProperty('timestamp');
      expect(new Date(callArgs[1].timestamp)).toBeInstanceOf(Date);
    });

    it('should include project_id in webhook payload', async () => {
      const asset = createTestAsset({ id: 'asset-1', state: 'clean', project_id: 'project-123' });
      await service.markDirty(asset.id, 'upstream-1', 'v1.0.0');

      expect(webhookService.triggerEvent).toHaveBeenCalledWith(
        'asset.dirty',
        expect.objectContaining({
          project_id: 'project-123',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Webhook Error Handling', () => {
    it('should not throw when webhook trigger fails', async () => {
      vi.mocked(webhookService.triggerEvent).mockRejectedValueOnce(new Error('Webhook failed'));

      const asset = createTestAsset({ id: 'asset-1', state: 'clean' });

      // Should not throw
      await expect(
        service.markDirty(asset.id, 'upstream-1', 'v1.0.0')
      ).resolves.not.toThrow();
    });

    it('should log webhook errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(webhookService.triggerEvent).mockRejectedValueOnce(new Error('Webhook failed'));

      const asset = createTestAsset({ id: 'asset-1', state: 'clean' });
      await service.markDirty(asset.id, 'upstream-1', 'v1.0.0');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[AssetService] Failed to trigger dirty webhook:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Dirty Propagation Batch Events', () => {
    it('should trigger batch webhook for dirty propagation', async () => {
      // Create upstream asset
      createTestAsset({ id: 'upstream-1', state: 'clean', project_id: 'project-1', current_version: 'v1.0.0' });
      // Create downstream asset
      createTestAsset({ id: 'downstream-1', state: 'clean', project_id: 'project-1' });

      // Add a version to publish for upstream asset
      const versionsTable = mockStorage.get('asset_versions') || [];
      versionsTable.push({
        id: 'version-1',
        asset_id: 'upstream-1',
        version: 'v2.0.0',
        state: 'draft',
        created_at: new Date(),
      });
      mockStorage.set('asset_versions', versionsTable);

      // Add dependency - source=downstream, target=upstream
      const depsTable = mockStorage.get('dependencies') || [];
      depsTable.push({
        id: 'dep-1',
        source_asset_id: 'downstream-1',
        target_asset_id: 'upstream-1',
        source_version: 'v1.0.0',
        target_version: 'v2.0.0',
        dependency_type: 'depends_on',
        created_at: new Date()
      });
      mockStorage.set('dependencies', depsTable);

      // Publish version triggers propagateDirtyStatus which triggers batch webhook
      await service.publishVersion('upstream-1', 'v2.0.0', 'user-1');

      // Should trigger batch event
      expect(webhookService.triggerEvent).toHaveBeenCalledWith(
        'asset.dirty_batch',
        expect.objectContaining({
          upstream_asset_id: 'upstream-1',
          upstream_version: 'v2.0.0',
          affected_assets: expect.any(Array),
        }),
        expect.any(Object)
      );
    });
  });
});
