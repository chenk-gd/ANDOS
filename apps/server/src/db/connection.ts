/**
 * Database Connection - AI-Native DevOps Platform
 * Knex.js configuration with connection pooling
 */

import knex, { Knex } from 'knex';
import config from '../../knexfile';
import { logger } from '../utils/logger';

const env = process.env.NODE_ENV || 'development';
const knexConfig = config[env];

if (!knexConfig) {
  throw new Error(`No database configuration for environment: ${env}`);
}

// Create singleton connection
export const db: Knex = knex(knexConfig);

// Health check function
export async function checkConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  await db.destroy();
}

// Transaction helper
export async function withTransaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  return await db.transaction(callback);
}

// Connection pool stats
export function getPoolStats(): { min: number; max: number; used: number; free: number } {
  const client = db.client;
  if (client.pool) {
    return {
      min: client.pool.min,
      max: client.pool.max,
      used: client.pool.numUsed(),
      free: client.pool.numFree(),
    };
  }
  return { min: 0, max: 0, used: 0, free: 0 };
}
