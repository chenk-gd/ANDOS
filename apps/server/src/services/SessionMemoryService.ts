/**
 * SessionMemoryService - Agent Memory System v1.5
 * Manages session checkpoints and recovery
 */

import { db } from '../db/connection';
import { SessionCheckpoint, CheckpointTrigger } from '../types/memory';

// Error types
export class SessionMemoryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SessionMemoryError';
  }
}

export class CheckpointNotFoundError extends SessionMemoryError {
  constructor(checkpointId: string) {
    super(`Checkpoint not found: ${checkpointId}`, 'CHECKPOINT_NOT_FOUND');
  }
}

export class SessionCheckpointError extends SessionMemoryError {
  constructor(sessionId: string, message: string) {
    super(`Session checkpoint error for ${sessionId}: ${message}`, 'SESSION_CHECKPOINT_ERROR');
  }
}

// 24 hours in milliseconds
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export class SessionMemoryService {
  /**
   * Create a checkpoint for session recovery
   */
  async createCheckpoint(
    sessionId: string,
    state: Record<string, any>,
    trigger: CheckpointTrigger
  ): Promise<SessionCheckpoint> {
    // Get next sequence number for session
    const maxSequenceResult = await db('session_checkpoints')
      .where({ session_id: sessionId })
      .max('sequence as max_seq')
      .first();

    const sequence = (maxSequenceResult?.max_seq || 0) + 1;

    // Calculate expires_at (24 hours from now)
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

    // Generate UUID for checkpoint
    const id = crypto.randomUUID();

    // Insert into database
    const [checkpoint] = await db('session_checkpoints')
      .insert({
        id,
        session_id: sessionId,
        sequence,
        state: JSON.stringify(state),
        trigger,
        created_at: createdAt,
        expires_at: expiresAt,
      })
      .returning(['id', 'session_id', 'sequence', 'state', 'trigger', 'created_at', 'expires_at']);

    return {
      id: checkpoint.id,
      session_id: checkpoint.session_id,
      sequence: checkpoint.sequence,
      state: typeof checkpoint.state === 'string' ? JSON.parse(checkpoint.state) : checkpoint.state,
      trigger: checkpoint.trigger as CheckpointTrigger,
      created_at: new Date(checkpoint.created_at),
      expires_at: checkpoint.expires_at ? new Date(checkpoint.expires_at) : undefined,
    };
  }

  /**
   * Restore session from checkpoint
   */
  async restoreFromCheckpoint(
    sessionId: string,
    checkpointId: string
  ): Promise<Record<string, any>> {
    const checkpoint = await db('session_checkpoints')
      .where({
        id: checkpointId,
        session_id: sessionId,
      })
      .first();

    if (!checkpoint) {
      throw new CheckpointNotFoundError(checkpointId);
    }

    return typeof checkpoint.state === 'string' ? JSON.parse(checkpoint.state) : checkpoint.state;
  }

  /**
   * List all checkpoints for a session
   */
  async listCheckpoints(sessionId: string): Promise<SessionCheckpoint[]> {
    const checkpoints = await db('session_checkpoints')
      .where({ session_id: sessionId })
      .orderBy('sequence', 'desc')
      .select(['id', 'session_id', 'sequence', 'state', 'trigger', 'created_at', 'expires_at']);

    return checkpoints.map((checkpoint: any) => ({
      id: checkpoint.id,
      session_id: checkpoint.session_id,
      sequence: checkpoint.sequence,
      state: typeof checkpoint.state === 'string' ? JSON.parse(checkpoint.state) : checkpoint.state,
      trigger: checkpoint.trigger as CheckpointTrigger,
      created_at: new Date(checkpoint.created_at),
      expires_at: checkpoint.expires_at ? new Date(checkpoint.expires_at) : undefined,
    }));
  }

  /**
   * Clean up expired sessions (24h TTL)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await db('session_checkpoints')
      .where('expires_at', '<', db.fn.now())
      .del();

    return result as number;
  }

  /**
   * Get latest checkpoint for a session
   */
  async getLatestCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    const checkpoint = await db('session_checkpoints')
      .where({ session_id: sessionId })
      .orderBy('sequence', 'desc')
      .first(['id', 'session_id', 'sequence', 'state', 'trigger', 'created_at', 'expires_at']);

    if (!checkpoint) {
      return null;
    }

    return {
      id: checkpoint.id,
      session_id: checkpoint.session_id,
      sequence: checkpoint.sequence,
      state: typeof checkpoint.state === 'string' ? JSON.parse(checkpoint.state) : checkpoint.state,
      trigger: checkpoint.trigger as CheckpointTrigger,
      created_at: new Date(checkpoint.created_at),
      expires_at: checkpoint.expires_at ? new Date(checkpoint.expires_at) : undefined,
    };
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const result = await db('session_checkpoints')
      .where({ id: checkpointId })
      .del();

    if (result === 0) {
      throw new CheckpointNotFoundError(checkpointId);
    }
  }
}

export const sessionMemoryService = new SessionMemoryService();
