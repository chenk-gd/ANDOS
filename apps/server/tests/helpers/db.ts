/**
 * Database Test Helpers
 * Provides utilities for testing with database transactions
 */

import { db } from '../../src/db/connection';
import type { Knex } from 'knex';

/**
 * Run test within a transaction that gets rolled back
 * This ensures test isolation
 */
export async function withTestTransaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  const trx = await db.transaction();
  try {
    const result = await callback(trx);
    await trx.rollback();
    return result;
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Clean up specific tables (for cleanup between tests if needed)
 */
export async function cleanTables(tableNames: string[]): Promise<void> {
  for (const table of tableNames) {
    await db.raw(`TRUNCATE TABLE ${table} CASCADE`);
  }
}

/**
 * Create a test database connection with transaction
 * Returns transaction and a cleanup function
 */
export async function createTestTransaction(): Promise<{
  trx: Knex.Transaction;
  cleanup: () => Promise<void>;
}> {
  const trx = await db.transaction();

  return {
    trx,
    cleanup: async () => {
      await trx.rollback();
    },
  };
}

/**
 * Insert test data and return inserted records
 */
export async function insertTestData<T extends Record<string, any>>(
  table: string,
  data: T[],
  trx?: Knex.Transaction
): Promise<T[]> {
  const dbInstance = trx || db;
  const inserted = await dbInstance(table).insert(data).returning('*');
  return inserted as T[];
}

/**
 * Check if running in test environment
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Generate unique test IDs to avoid collisions
 */
export function generateTestId(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
