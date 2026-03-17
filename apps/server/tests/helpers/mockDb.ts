/**
 * Mock Database Test Helpers
 * Provides in-memory mock database for unit testing without PostgreSQL
 */

import { vi } from 'vitest';
import type { Knex } from 'knex';

// In-memory storage for mock database
const mockStorage: Map<string, any[]> = new Map();

/**
 * Create a mock query builder
 */
function createMockQueryBuilder(tableName: string) {
  const queries: any[] = [];

  const builder: any = {
    where: vi.fn((...args: any[]) => {
      if (typeof args[0] === 'object') {
        queries.push({ type: 'where', condition: args[0] });
      } else if (typeof args[0] === 'string') {
        queries.push({ type: 'whereRaw', field: args[0], value: args[1] });
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
    join: vi.fn((table: string, left: string, right: string) => {
      queries.push({ type: 'join', table, left, right });
      return builder;
    }),
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
    distinct: vi.fn((...fields: string[]) => {
      queries.push({ type: 'distinct', fields });
      return builder;
    }),
    count: vi.fn((field: string) => {
      queries.push({ type: 'count', field });
      return builder;
    }),
    sum: vi.fn((field: string) => {
      queries.push({ type: 'sum', field });
      return builder;
    }),
    groupBy: vi.fn((field: string) => {
      queries.push({ type: 'groupBy', field });
      return builder;
    }),
    first: vi.fn(async () => {
      const data = mockStorage.get(tableName) || [];
      let result = [...data];

      // Apply where conditions
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
        }
      }

      // Handle count
      const countQuery = queries.find((q) => q.type === 'count');
      if (countQuery) {
        return { count: result.length }; // Return number
      }

      return result[0] || null;
    }),
    then: vi.fn(async (callback: Function) => {
      const data = mockStorage.get(tableName) || [];
      let result = [...data];

      // Apply all query conditions
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

      // Handle count
      const countQuery = queries.find((q) => q.type === 'count');
      if (countQuery) {
        return callback({ count: result.length }); // Return number
      }

      return callback(result);
    }),
    insert: vi.fn((data: any) => {
      const records = Array.isArray(data) ? data : [data];
      const table = mockStorage.get(tableName) || [];

      for (const record of records) {
        const newRecord = { ...record };
        if (!newRecord.id) {
          newRecord.id = generateTestId();
        }
        table.push(newRecord);
      }

      mockStorage.set(tableName, table);

      return {
        returning: vi.fn(async (fields: string[]) => {
          if (Array.isArray(data)) {
            return table.slice(-records.length);
          }
          return [table[table.length - 1]];
        }),
      };
    }),
    update: vi.fn((data: any) => {
      const table = mockStorage.get(tableName) || [];
      let updated: any[] = [];

      // Find records matching where conditions
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
        returning: vi.fn(async (fields: string[]) => updated),
      };
    }),
    delete: vi.fn(async () => {
      const table = mockStorage.get(tableName) || [];
      let deleteCount = 0;

      for (let i = table.length - 1; i >= 0; i--) {
        let matches = true;
        for (const query of queries) {
          if (query.type === 'where') {
            for (const [key, value] of Object.entries(query.condition)) {
              if (table[i][key] !== value) {
                matches = false;
                break;
              }
            }
          }
        }
        if (matches) {
          table.splice(i, 1);
          deleteCount++;
        }
      }

      return deleteCount;
    }),
    increment: vi.fn(async (field: string, amount: number) => {
      const table = mockStorage.get(tableName) || [];
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
          row[field] = (row[field] || 0) + amount;
        }
      }
      return 1;
    }),
    onConflict: vi.fn((fields: string[]) => {
      return {
        ignore: vi.fn(async () => {
          // In mock, we just don't insert duplicates based on unique fields
          return [];
        }),
        merge: vi.fn(async () => {
          return [];
        }),
      };
    }),
    raw: vi.fn((raw: string) => raw),
  };

  return builder;
}

/**
 * Mock database connection
 */
export const mockDb = vi.fn((tableName: string) => {
  return createMockQueryBuilder(tableName);
}) as any;

// Add transaction support
mockDb.transaction = vi.fn(async (callback: Function) => {
  const trx = {
    ...mockDb,
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
  };
  return await callback(trx);
});

mockDb.raw = vi.fn((query: string, bindings?: any[]) => query);

/**
 * Clear all mock data
 */
export function clearMockStorage(): void {
  mockStorage.clear();
}

/**
 * Get data from mock storage
 */
export function getMockTable(tableName: string): any[] {
  return mockStorage.get(tableName) || [];
}

/**
 * Set data in mock storage
 */
export function setMockTable(tableName: string, data: any[]): void {
  mockStorage.set(tableName, data);
}

/**
 * Run test within a mock transaction
 */
export async function withMockTransaction<T>(
  callback: (trx: any) => Promise<T>
): Promise<T> {
  clearMockStorage();
  const trx = mockDb;
  try {
    const result = await callback(trx);
    return result;
  } finally {
    clearMockStorage();
  }
}

/**
 * Generate unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Mock transaction helper
 */
export async function withTestTransaction<T>(
  callback: (trx: any) => Promise<T>
): Promise<T> {
  return withMockTransaction(callback);
}

/**
 * Create a test database transaction with cleanup
 */
export async function createTestTransaction(): Promise<{
  trx: any;
  cleanup: () => Promise<void>;
}> {
  clearMockStorage();
  return {
    trx: mockDb,
    cleanup: async () => clearMockStorage(),
  };
}

/**
 * Clean specific tables
 */
export async function cleanTables(tableNames: string[]): Promise<void> {
  for (const table of tableNames) {
    mockStorage.delete(table);
  }
}

/**
 * Insert test data
 */
export async function insertTestData<T extends Record<string, any>>(
  table: string,
  data: T[],
  trx?: any
): Promise<T[]> {
  const tableData = mockStorage.get(table) || [];
  const inserted: T[] = [];

  for (const record of data) {
    const newRecord = { ...record };
    if (!newRecord.id) {
      newRecord.id = generateTestId();
    }
    tableData.push(newRecord);
    inserted.push(newRecord);
  }

  mockStorage.set(table, tableData);
  return inserted;
}

/**
 * Check if in test environment
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}
