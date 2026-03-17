/**
 * KVMemoryService - Agent Memory System v1.5
 * Key-value memory storage with atomic updates and optimistic locking
 */

import { db } from '../db/connection';
import type { MemoryLevel } from '../types/memory';

// Error types
export class KVMemoryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'KVMemoryError';
  }
}

export class KeyNotFoundError extends KVMemoryError {
  constructor(key: string) {
    super(`Key not found: ${key}`, 'KEY_NOT_FOUND');
  }
}

export class ConcurrentUpdateError extends KVMemoryError {
  constructor(key: string) {
    super(`Concurrent update failed for key: ${key}. Max retries exceeded.`, 'CONCURRENT_UPDATE_FAILED');
  }
}

interface KVMemoryRow {
  key: string;
  value: any;
  namespace: string;
  level: string;
  project_id: string | null;
  session_id: string | null;
  etag: string;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string | null;
}

interface SetOptions {
  ttl?: number;           // TTL in seconds
  namespace?: string;     // default 'default'
  level?: MemoryLevel;    // 'session' | 'project' | 'organization'
  projectId?: string;
  sessionId?: string;
}

/**
 * Build full key from level, namespace, and user key
 * Format: {level}:{namespace}:{userKey}
 */
function buildFullKey(
  userKey: string,
  namespace: string = 'default',
  level: MemoryLevel = 'session'
): string {
  return `${level}:${namespace}:${userKey}`;
}

/**
 * Parse full key into components
 */
function parseFullKey(fullKey: string): { level: string; namespace: string; userKey: string } {
  const parts = fullKey.split(':');
  if (parts.length < 3) {
    // Handle edge case where key might not have the expected format
    return { level: 'session', namespace: 'default', userKey: fullKey };
  }
  const level = parts[0];
  const namespace = parts[1];
  const userKey = parts.slice(2).join(':');
  return { level, namespace, userKey };
}

export class KVMemoryService {
  /**
   * Store a key-value pair
   */
  async set<T = any>(
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<void> {
    const namespace = options?.namespace ?? 'default';
    const level = options?.level ?? 'session';
    const fullKey = buildFullKey(key, namespace, level);
    const etag = crypto.randomUUID();

    // Calculate expires_at if ttl provided
    let expiresAt: Date | null = null;
    if (options?.ttl !== undefined && options.ttl > 0) {
      expiresAt = new Date(Date.now() + options.ttl * 1000);
    }

    // Insert/update using ON CONFLICT for upsert
    await db('kv_memories')
      .insert({
        key: fullKey,
        value: JSON.stringify(value),
        namespace,
        level,
        project_id: options?.projectId ?? null,
        session_id: options?.sessionId ?? null,
        etag,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
        expires_at: expiresAt,
      })
      .onConflict('key')
      .merge({
        value: JSON.stringify(value),
        namespace,
        level,
        project_id: options?.projectId ?? null,
        session_id: options?.sessionId ?? null,
        etag,
        updated_at: db.fn.now(),
        expires_at: expiresAt,
      });
  }

  /**
   * Get value by key
   */
  async get<T = any>(key: string): Promise<T | null> {
    const row = await db('kv_memories')
      .where({ key })
      .first() as KVMemoryRow | undefined;

    if (!row) {
      return null;
    }

    // Check if expired
    if (row.expires_at) {
      const expiresAt = row.expires_at instanceof Date
        ? row.expires_at
        : new Date(row.expires_at);
      if (expiresAt < new Date()) {
        return null;
      }
    }

    // Parse JSON value
    if (typeof row.value === 'string') {
      return JSON.parse(row.value) as T;
    }
    return row.value as T;
  }

  /**
   * Delete key
   */
  async delete(key: string): Promise<void> {
    await db('kv_memories')
      .where({ key })
      .del();
  }

  /**
   * Scan keys by prefix
   */
  async scan(prefix: string): Promise<Array<{ key: string; value: any }>> {
    const rows = await db('kv_memories')
      .where('key', 'like', `${prefix}%`)
      .where(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', db.fn.now());
      }) as KVMemoryRow[];

    return rows.map(row => ({
      key: row.key,
      value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
    }));
  }

  /**
   * Atomic update with optimistic locking
   * Uses retry logic for concurrent modifications
   */
  async update<T = any>(
    key: string,
    updater: (current: T | null) => T
  ): Promise<T> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Get current value and etag
      const row = await db('kv_memories')
        .where({ key })
        .first(['value', 'etag']) as { value: any; etag: string } | undefined;

      const currentValue = row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
      const currentEtag = row?.etag;

      // Call updater function
      const newValue = updater(currentValue as T | null);

      // Generate new etag
      const newEtag = crypto.randomUUID();

      if (row) {
        // Update with optimistic locking (WHERE etag = current_etag)
        const result = await db('kv_memories')
          .where({ key, etag: currentEtag })
          .update({
            value: JSON.stringify(newValue),
            etag: newEtag,
            updated_at: db.fn.now(),
          });

        if (result > 0) {
          return newValue;
        }
        // If no rows updated, retry (concurrent modification)
      } else {
        // Key doesn't exist, insert new row
        const { level, namespace, userKey } = parseFullKey(key);
        await db('kv_memories')
          .insert({
            key,
            value: JSON.stringify(newValue),
            namespace,
            level,
            project_id: null,
            session_id: null,
            etag: newEtag,
            created_at: db.fn.now(),
            updated_at: db.fn.now(),
            expires_at: null,
          })
          .onConflict('key')
          .ignore();

        // If insert succeeded (or key now exists), we're done
        const inserted = await db('kv_memories').where({ key }).first('key');
        if (inserted) {
          return newValue;
        }
      }

      // Small delay before retry
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }

    throw new ConcurrentUpdateError(key);
  }

  /**
   * Check if key exists and is not expired
   */
  async exists(key: string): Promise<boolean> {
    const row = await db('kv_memories')
      .where({ key })
      .where(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', db.fn.now());
      })
      .first('key') as { key: string } | undefined;

    return !!row;
  }

  /**
   * Get keys by namespace
   */
  async getByNamespace(
    namespace: string,
    options?: { level?: MemoryLevel; projectId?: string; sessionId?: string }
  ): Promise<Array<{ key: string; value: any }>> {
    let query = db('kv_memories')
      .where({ namespace })
      .where(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', db.fn.now());
      });

    if (options?.level) {
      query = query.where({ level: options.level });
    }

    if (options?.projectId !== undefined) {
      query = query.where({ project_id: options.projectId });
    }

    if (options?.sessionId !== undefined) {
      query = query.where({ session_id: options.sessionId });
    }

    const rows = await query as KVMemoryRow[];

    return rows.map(row => ({
      key: row.key,
      value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
    }));
  }

  /**
   * Clean up expired entries
   * Returns count of deleted entries
   */
  async cleanupExpired(): Promise<number> {
    const result = await db('kv_memories')
      .where('expires_at', '<', db.fn.now())
      .del();

    return result;
  }
}

export const kvMemoryService = new KVMemoryService();
