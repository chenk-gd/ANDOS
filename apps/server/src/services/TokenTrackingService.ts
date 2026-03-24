/**
 * TokenTrackingService - Token Usage Tracking and Checkpoint Management
 * Tracks token usage per session and triggers checkpoints based on thresholds
 *
 * Features:
 * - Track token usage per session
 * - Configurable thresholds (first/subsequent)
 * - Automatic checkpoint triggering
 * - Token usage history
 * - Global statistics
 */

import { db } from '../db/connection';
import { logger } from '../utils/logger';

export interface TokenThresholds {
  /** Token threshold for first checkpoint */
  first: number;
  /** Token threshold for subsequent checkpoints */
  subsequent: number;
}

export interface TokenStats {
  sessionId: string;
  totalTokens: number;
  callCount: number;
  averageTokens: number;
  lastTokens: number;
  checkpointCount: number;
  lastCheckpointTokens: number;
  tokensSinceLastCheckpoint: number;
  lastUpdated: Date;
}

export interface TokenUsageEntry {
  tokens: number;
  timestamp: Date;
}

export interface GlobalTokenStats {
  totalSessions: number;
  activeSessions: number;
  totalTokens: number;
  averageTokensPerSession: number;
  totalCheckpoints: number;
}

interface SessionTokenData {
  totalTokens: number;
  callCount: number;
  lastTokens: number;
  checkpointCount: number;
  lastCheckpointTokens: number;
  history: TokenUsageEntry[];
  lastUpdated: Date;
}

const DEFAULT_THRESHOLDS: TokenThresholds = {
  first: 10000,    // First checkpoint at 10k tokens
  subsequent: 5000, // Subsequent checkpoints every 5k tokens
};

const MAX_HISTORY_SIZE = 50;

export class TokenTrackingService {
  private thresholds: TokenThresholds;
  private sessionData: Map<string, SessionTokenData>;

  constructor(thresholds: TokenThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
    this.sessionData = new Map();
  }

  /**
   * Track token usage for a session
   */
  async trackTokenUsage(sessionId: string, tokens: number): Promise<void> {
    let data = this.sessionData.get(sessionId);

    if (!data) {
      data = {
        totalTokens: 0,
        callCount: 0,
        lastTokens: 0,
        checkpointCount: 0,
        lastCheckpointTokens: 0,
        history: [],
        lastUpdated: new Date(),
      };
      this.sessionData.set(sessionId, data);
    }

    // Update stats
    data.totalTokens += tokens;
    data.callCount += 1;
    data.lastTokens = tokens;
    data.lastUpdated = new Date();

    // Add to history
    data.history.push({
      tokens,
      timestamp: new Date(),
    });

    // Trim history if needed
    if (data.history.length > MAX_HISTORY_SIZE) {
      data.history = data.history.slice(-MAX_HISTORY_SIZE);
    }
  }

  /**
   * Get token stats for a session
   */
  async getTokenStats(sessionId: string): Promise<TokenStats> {
    const data = this.sessionData.get(sessionId);

    if (!data) {
      return {
        sessionId,
        totalTokens: 0,
        callCount: 0,
        averageTokens: 0,
        lastTokens: 0,
        checkpointCount: 0,
        lastCheckpointTokens: 0,
        tokensSinceLastCheckpoint: 0,
        lastUpdated: new Date(),
      };
    }

    return {
      sessionId,
      totalTokens: data.totalTokens,
      callCount: data.callCount,
      averageTokens: data.callCount > 0 ? Math.round(data.totalTokens / data.callCount) : 0,
      lastTokens: data.lastTokens,
      checkpointCount: data.checkpointCount,
      lastCheckpointTokens: data.lastCheckpointTokens,
      tokensSinceLastCheckpoint: data.totalTokens - data.lastCheckpointTokens,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * Check if a checkpoint should be created
   */
  async shouldCreateCheckpoint(sessionId: string): Promise<boolean> {
    const data = this.sessionData.get(sessionId);

    if (!data) {
      return false;
    }

    const tokensSinceLastCheckpoint = data.totalTokens - data.lastCheckpointTokens;

    // First checkpoint
    if (data.checkpointCount === 0) {
      return tokensSinceLastCheckpoint >= this.thresholds.first;
    }

    // Subsequent checkpoints
    return tokensSinceLastCheckpoint >= this.thresholds.subsequent;
  }

  /**
   * Mark a checkpoint as created
   */
  async markCheckpointCreated(sessionId: string): Promise<void> {
    const data = this.sessionData.get(sessionId);

    if (!data) {
      return;
    }

    data.checkpointCount += 1;
    data.lastCheckpointTokens = data.totalTokens;
    data.lastUpdated = new Date();
  }

  /**
   * Get current thresholds
   */
  getThresholds(): TokenThresholds {
    return { ...this.thresholds };
  }

  /**
   * Set custom thresholds
   */
  setThresholds(thresholds: TokenThresholds): void {
    this.thresholds = { ...thresholds };
  }

  /**
   * Get token usage history for a session
   */
  async getTokenHistory(sessionId: string): Promise<TokenUsageEntry[]> {
    const data = this.sessionData.get(sessionId);
    return data ? [...data.history] : [];
  }

  /**
   * Clear session stats
   */
  async clearSession(sessionId: string): Promise<void> {
    this.sessionData.delete(sessionId);
  }

  /**
   * Clear all session stats
   */
  async clearAllSessions(): Promise<void> {
    this.sessionData.clear();
  }

  /**
   * Get global token stats
   */
  async getGlobalStats(): Promise<GlobalTokenStats> {
    const sessions = Array.from(this.sessionData.entries());

    let totalTokens = 0;
    let totalCheckpoints = 0;

    for (const [, data] of sessions) {
      totalTokens += data.totalTokens;
      totalCheckpoints += data.checkpointCount;
    }

    const totalSessions = sessions.length;

    return {
      totalSessions,
      activeSessions: totalSessions,
      totalTokens,
      averageTokensPerSession: totalSessions > 0 ? Math.round(totalTokens / totalSessions) : 0,
      totalCheckpoints,
    };
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessionData.keys());
  }

  /**
   * Get sessions that need checkpoints
   */
  async getSessionsNeedingCheckpoints(): Promise<string[]> {
    const sessions: string[] = [];

    for (const [sessionId, data] of Array.from(this.sessionData.entries())) {
      const tokensSinceLastCheckpoint = data.totalTokens - data.lastCheckpointTokens;

      if (data.checkpointCount === 0 && tokensSinceLastCheckpoint >= this.thresholds.first) {
        sessions.push(sessionId);
      } else if (data.checkpointCount > 0 && tokensSinceLastCheckpoint >= this.thresholds.subsequent) {
        sessions.push(sessionId);
      }
    }

    return sessions;
  }

  /**
   * Persist session stats to database (optional)
   * This can be called periodically to persist in-memory stats
   */
  async persistSessionStats(sessionId: string): Promise<void> {
    const data = this.sessionData.get(sessionId);
    if (!data) {
      return;
    }

    // Store in kv_memories for persistence
    const key = `token_stats:${sessionId}`;
    const value = {
      totalTokens: data.totalTokens,
      callCount: data.callCount,
      checkpointCount: data.checkpointCount,
      lastCheckpointTokens: data.lastCheckpointTokens,
      lastUpdated: data.lastUpdated,
    };

    try {
      await db('kv_memories')
        .insert({
          key,
          value: JSON.stringify(value),
          namespace: 'token_tracking',
          level: 'session',
          session_id: sessionId,
          etag: crypto.randomUUID(),
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: null,
        })
        .onConflict('key')
        .merge({
          value: JSON.stringify(value),
          updated_at: new Date(),
        });
    } catch (error) {
      logger.error(`Failed to persist token stats for ${sessionId}:`, error);
    }
  }

  /**
   * Load session stats from database
   */
  async loadSessionStats(sessionId: string): Promise<void> {
    const key = `token_stats:${sessionId}`;

    try {
      const row = await db('kv_memories')
        .where({ key })
        .first();

      if (row) {
        const value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;

        const data: SessionTokenData = {
          totalTokens: value.totalTokens || 0,
          callCount: value.callCount || 0,
          lastTokens: 0,
          checkpointCount: value.checkpointCount || 0,
          lastCheckpointTokens: value.lastCheckpointTokens || 0,
          history: [],
          lastUpdated: new Date(value.lastUpdated),
        };

        this.sessionData.set(sessionId, data);
      }
    } catch (error) {
      logger.error(`Failed to load token stats for ${sessionId}:`, error);
    }
  }
}

// Singleton instance
export const tokenTrackingService = new TokenTrackingService();
