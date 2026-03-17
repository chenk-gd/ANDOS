/**
 * WebhookService Tests
 * Tests for webhook subscription management and delivery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebhookService } from '../../../src/services/WebhookService';
import { clearMockStorage, setMockTable, getMockTable } from '../../helpers/mockDb';

// Mock the db module inline
vi.mock('../../../src/db/connection', () => {
  const mockRaw = vi.fn((query: string, bindings?: any[]) => {
    // Return a mock result that resembles Knex raw result
    return Promise.resolve({ rows: [] });
  });

  const mockDbFn = vi.fn((tableName: string) => createMockQueryBuilder(tableName));
  mockDbFn.raw = mockRaw;

  return {
    db: mockDbFn,
    withTransaction: vi.fn(async (callback: any) => await callback(mockDbFn)),
  };
});

// Mock fetch for webhook delivery
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create mock query builder
function createMockQueryBuilder(tableName: string) {
  const queries: any[] = [];

  const builder: any = {
    where: vi.fn((...args: any[]) => {
      if (typeof args[0] === 'object') {
        queries.push({ type: 'where', condition: args[0] });
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
    select: vi.fn((...fields: string[]) => {
      queries.push({ type: 'select', fields });
      return builder;
    }),
    distinct: vi.fn(() => builder),
    count: vi.fn((field: string) => {
      queries.push({ type: 'count', field });
      return builder;
    }),
    sum: vi.fn((field: any) => {
      queries.push({ type: 'sum', field });
      return builder;
    }),
    groupBy: vi.fn((field: string) => {
      queries.push({ type: 'groupBy', field });
      return builder;
    }),
    first: vi.fn(async () => {
      const data = getMockTable(tableName);
      let result = [...data];

      for (const query of queries) {
        if (query.type === 'where') {
          result = result.filter((row) =>
            Object.entries(query.condition).every(([key, value]) => row[key] === value)
          );
        } else if (query.type === 'whereNull') {
          result = result.filter((row) => row[query.field] === null || row[query.field] === undefined);
        } else if (query.type === 'whereNotNull') {
          result = result.filter((row) => row[query.field] !== null && row[query.field] !== undefined);
        } else if (query.type === 'whereNot') {
          result = result.filter((row) => row[query.field] !== query.value);
        } else if (query.type === 'whereIn') {
          result = result.filter((row) => query.values.includes(row[query.field]));
        } else if (query.type === 'whereRaw') {
          // Handle '? = ANY(events)' pattern for webhook event matching
          if (query.raw && query.raw.includes('ANY') && query.bindings) {
            const eventType = query.bindings[0];
            result = result.filter((row) => row.events && row.events.includes(eventType));
          }
        }
      }

      const countQuery = queries.find((q) => q.type === 'count');
      if (countQuery) {
        return { count: result.length.toString() };
      }

      return result[0] || null;
    }),
    then: vi.fn(async (callback: Function) => {
      const data = getMockTable(tableName);
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
          case 'whereRaw':
            // Handle '? = ANY(events)' pattern for webhook event matching
            if (query.raw && query.raw.includes('ANY') && query.bindings) {
              const eventType = query.bindings[0];
              result = result.filter((row) => row.events && row.events.includes(eventType));
            }
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

      const countQuery = queries.find((q) => q.type === 'count');
      const groupByQuery = queries.find((q) => q.type === 'groupBy');

      if (groupByQuery) {
        // Handle groupBy for statistics queries
        const grouped: Record<string, any> = {};
        for (const row of result) {
          const key = row[groupByQuery.field];
          if (!grouped[key]) {
            grouped[key] = { [groupByQuery.field]: key, deliveries: 0, sum: 0 };
          }
          grouped[key].deliveries++;
          if (row.status === 'success') {
            grouped[key].sum++;
          }
        }
        return callback(Object.values(grouped));
      }

      if (countQuery) {
        return callback({ count: result.length.toString() });
      }

      return callback(result);
    }),
    insert: vi.fn((data: any) => {
      const records = Array.isArray(data) ? data : [data];
      const table = getMockTable(tableName);

      for (const record of records) {
        const newRecord = { ...record };
        if (!newRecord.id) {
          newRecord.id = `test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        table.push(newRecord);
      }

      setMockTable(tableName, table);

      return {
        returning: vi.fn(async () => table.slice(-records.length)),
      };
    }),
    update: vi.fn((data: any) => {
      const table = getMockTable(tableName);

      for (const row of table) {
        let matches = true;
        for (const query of queries) {
          if (query.type === 'where' && query.condition.id !== undefined) {
            if (row.id !== query.condition.id) {
              matches = false;
            }
          }
        }
        if (matches) {
          Object.assign(row, data);
        }
      }

      return {
        returning: vi.fn(async () => table.filter((r: any) => {
          for (const query of queries) {
            if (query.type === 'where' && query.condition.id !== undefined) {
              return r.id === query.condition.id;
            }
          }
          return false;
        })),
      };
    }),
    delete: vi.fn(async () => {
      const table = getMockTable(tableName);
      return table.length;
    }),
    increment: vi.fn((field: string, amount: number) => {
      const table = getMockTable(tableName);
      for (const row of table) {
        let matches = true;
        for (const query of queries) {
          if (query.type === 'where') {
            for (const [key, value] of Object.entries(query.condition)) {
              if (row[key] !== value) {
                matches = false;
                break;
              }
            }
          }
        }
        if (matches) {
          row[field] = (row[field] || 0) + amount;
        }
      }
      // Return builder for chaining with .update()
      return builder;
    }),
    onConflict: vi.fn(() => ({ ignore: vi.fn(async () => []) })),
    raw: vi.fn((query: string) => query),
  };

  return builder;
}

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    clearMockStorage();
    service = new WebhookService();
    mockFetch.mockReset();
  });

  describe('createSubscription', () => {
    it('should create a webhook subscription', async () => {
      const input = {
        url: 'https://example.com/webhook',
        events: ['asset.created', 'asset.updated'],
        project_id: 'project-1',
        created_by: 'user-1',
      };

      const subscription = await service.createSubscription(input);

      expect(subscription).toBeDefined();
      expect(subscription.url).toBe(input.url);
      expect(subscription.events).toEqual(input.events);
      expect(subscription.active).toBe(true);
      expect(subscription.secret).toBeDefined();
    });

    it('should generate a secret if not provided', async () => {
      const input = {
        url: 'https://example.com/webhook',
        events: ['asset.created'],
        created_by: 'user-1',
      };

      const subscription = await service.createSubscription(input);

      expect(subscription.secret).toBeDefined();
      expect(subscription.secret.length).toBe(64);
    });
  });

  describe('getSubscription', () => {
    it('should get subscription by id', async () => {
      const input = {
        url: 'https://example.com/webhook',
        events: ['asset.created'],
        created_by: 'user-1',
      };

      const created = await service.createSubscription(input);
      const found = await service.getSubscription(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.url).toBe(input.url);
    });

    it('should return null for non-existent subscription', async () => {
      const found = await service.getSubscription('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('listSubscriptions', () => {
    it('should list all subscriptions', async () => {
      await service.createSubscription({
        url: 'https://example1.com/webhook',
        events: ['asset.created'],
        created_by: 'user-1',
      });

      await service.createSubscription({
        url: 'https://example2.com/webhook',
        events: ['asset.updated'],
        created_by: 'user-2',
      });

      const subscriptions = await service.listSubscriptions();

      expect(subscriptions.length).toBe(2);
    });

    it('should filter by project_id', async () => {
      await service.createSubscription({
        url: 'https://example1.com/webhook',
        events: ['asset.created'],
        project_id: 'project-1',
        created_by: 'user-1',
      });

      await service.createSubscription({
        url: 'https://example2.com/webhook',
        events: ['asset.updated'],
        project_id: 'project-2',
        created_by: 'user-2',
      });

      const subscriptions = await service.listSubscriptions({ project_id: 'project-1' });

      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0].project_id).toBe('project-1');
    });
  });

  describe('toggleSubscription', () => {
    it('should toggle active status', async () => {
      const sub = await service.createSubscription({
        url: 'https://example.com/webhook',
        events: ['asset.created'],
        created_by: 'user-1',
      });

      expect(sub.active).toBe(true);

      const deactivated = await service.toggleSubscription(sub.id, false);
      expect(deactivated.active).toBe(false);
    });
  });

  describe('triggerEvent', () => {
    it('should create deliveries for matching subscriptions', async () => {
      await service.createSubscription({
        url: 'https://example.com/webhook',
        events: ['asset.created'],
        created_by: 'user-1',
      });

      const result = await service.triggerEvent('asset.created', { id: 'asset-1' });

      expect(result.deliveriesCreated).toBe(1);
      expect(result.subscriptionsMatched).toBe(1);
    });

    it('should not create deliveries for non-matching events', async () => {
      await service.createSubscription({
        url: 'https://example.com/webhook',
        events: ['asset.created'],
        created_by: 'user-1',
      });

      const result = await service.triggerEvent('asset.updated', { id: 'asset-1' });

      expect(result.deliveriesCreated).toBe(0);
      expect(result.subscriptionsMatched).toBe(0);
    });
  });

  describe('getStatistics', () => {
    it('should return subscription and delivery stats', async () => {
      await service.createSubscription({
        url: 'https://example1.com/webhook',
        events: ['asset.created'],
        created_by: 'user-1',
      });

      const sub2 = await service.createSubscription({
        url: 'https://example2.com/webhook',
        events: ['asset.updated'],
        created_by: 'user-2',
      });

      await service.toggleSubscription(sub2.id, false);

      const stats = await service.getStatistics();

      expect(stats.subscriptions.total).toBe(2);
      expect(stats.subscriptions.active).toBe(1);
      expect(stats.subscriptions.inactive).toBe(1);
    });
  });
});
