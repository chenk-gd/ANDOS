/**
 * TokenTrackingService Tests - TDD
 * Tests for token usage tracking and checkpoint triggering
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenTrackingService, TokenThresholds } from '../../../src/services/TokenTrackingService';

describe('TokenTrackingService', () => {
  let service: TokenTrackingService;
  const mockSessionId = 'test-session-123';

  beforeEach(() => {
    service = new TokenTrackingService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Tracking', () => {
    it('should track token usage for a session', async () => {
      await service.trackTokenUsage(mockSessionId, 1000);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.totalTokens).toBe(1000);
      expect(stats.callCount).toBe(1);
    });

    it('should accumulate token usage across multiple calls', async () => {
      await service.trackTokenUsage(mockSessionId, 1000);
      await service.trackTokenUsage(mockSessionId, 2000);
      await service.trackTokenUsage(mockSessionId, 500);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.totalTokens).toBe(3500);
      expect(stats.callCount).toBe(3);
    });

    it('should track average tokens per call', async () => {
      await service.trackTokenUsage(mockSessionId, 1000);
      await service.trackTokenUsage(mockSessionId, 2000);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.averageTokens).toBe(1500);
    });

    it('should track last token usage', async () => {
      await service.trackTokenUsage(mockSessionId, 1000);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.lastTokens).toBe(1000);
    });

    it('should return zero stats for unknown session', async () => {
      const stats = await service.getTokenStats('unknown-session');

      expect(stats.totalTokens).toBe(0);
      expect(stats.callCount).toBe(0);
      expect(stats.averageTokens).toBe(0);
    });
  });

  describe('Checkpoint Thresholds', () => {
    const defaultThresholds: TokenThresholds = {
      first: 10000,
      subsequent: 5000,
    };

    it('should use default thresholds', () => {
      const thresholds = service.getThresholds();
      expect(thresholds).toEqual(defaultThresholds);
    });

    it('should allow custom thresholds', () => {
      service.setThresholds({ first: 5000, subsequent: 2500 });
      expect(service.getThresholds()).toEqual({ first: 5000, subsequent: 2500 });
    });

    it('should trigger first checkpoint at first threshold', async () => {
      // First checkpoint at 10000 tokens
      await service.trackTokenUsage(mockSessionId, 5000);
      expect(await service.shouldCreateCheckpoint(mockSessionId)).toBe(false);

      await service.trackTokenUsage(mockSessionId, 5000);
      expect(await service.shouldCreateCheckpoint(mockSessionId)).toBe(true);
    });

    it('should trigger subsequent checkpoints at subsequent threshold', async () => {
      // First checkpoint
      await service.trackTokenUsage(mockSessionId, 10000);
      await service.markCheckpointCreated(mockSessionId);

      // Subsequent checkpoint at 5000 more tokens
      await service.trackTokenUsage(mockSessionId, 3000);
      expect(await service.shouldCreateCheckpoint(mockSessionId)).toBe(false);

      await service.trackTokenUsage(mockSessionId, 2000);
      expect(await service.shouldCreateCheckpoint(mockSessionId)).toBe(true);
    });

    it('should not trigger checkpoint if already created for this threshold', async () => {
      // First checkpoint
      await service.trackTokenUsage(mockSessionId, 10000);
      await service.markCheckpointCreated(mockSessionId);

      // Should not trigger again until next threshold
      expect(await service.shouldCreateCheckpoint(mockSessionId)).toBe(false);
    });
  });

  describe('Checkpoint Management', () => {
    it('should track checkpoint count', async () => {
      await service.trackTokenUsage(mockSessionId, 10000);
      await service.markCheckpointCreated(mockSessionId);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.checkpointCount).toBe(1);
    });

    it('should track last checkpoint token count', async () => {
      await service.trackTokenUsage(mockSessionId, 10000);
      await service.markCheckpointCreated(mockSessionId);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.lastCheckpointTokens).toBe(10000);
    });

    it('should calculate tokens since last checkpoint', async () => {
      await service.trackTokenUsage(mockSessionId, 10000);
      await service.markCheckpointCreated(mockSessionId);
      await service.trackTokenUsage(mockSessionId, 3000);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.tokensSinceLastCheckpoint).toBe(3000);
    });
  });

  describe('Session Cleanup', () => {
    it('should clear session stats', async () => {
      await service.trackTokenUsage(mockSessionId, 5000);
      await service.clearSession(mockSessionId);

      const stats = await service.getTokenStats(mockSessionId);
      expect(stats.totalTokens).toBe(0);
    });

    it('should clear all sessions', async () => {
      await service.trackTokenUsage('session-1', 1000);
      await service.trackTokenUsage('session-2', 2000);
      await service.clearAllSessions();

      const stats1 = await service.getTokenStats('session-1');
      const stats2 = await service.getTokenStats('session-2');

      expect(stats1.totalTokens).toBe(0);
      expect(stats2.totalTokens).toBe(0);
    });
  });

  describe('Token Usage History', () => {
    it('should track token usage history', async () => {
      await service.trackTokenUsage(mockSessionId, 1000);
      await service.trackTokenUsage(mockSessionId, 2000);
      await service.trackTokenUsage(mockSessionId, 1500);

      const history = await service.getTokenHistory(mockSessionId);
      expect(history).toHaveLength(3);
      expect(history[0].tokens).toBe(1000);
      expect(history[1].tokens).toBe(2000);
      expect(history[2].tokens).toBe(1500);
    });

    it('should limit history size', async () => {
      // Add 100 entries
      for (let i = 0; i < 100; i++) {
        await service.trackTokenUsage(mockSessionId, 100);
      }

      const history = await service.getTokenHistory(mockSessionId);
      expect(history.length).toBeLessThanOrEqual(50); // Default limit
    });
  });

  describe('Global Stats', () => {
    it('should calculate global stats', async () => {
      await service.trackTokenUsage('session-1', 1000);
      await service.trackTokenUsage('session-2', 2000);
      await service.trackTokenUsage('session-3', 3000);

      const globalStats = await service.getGlobalStats();

      expect(globalStats.totalSessions).toBe(3);
      expect(globalStats.totalTokens).toBe(6000);
      expect(globalStats.averageTokensPerSession).toBe(2000);
    });

    it('should calculate active sessions', async () => {
      await service.trackTokenUsage('session-1', 1000);
      await service.trackTokenUsage('session-2', 100);

      const globalStats = await service.getGlobalStats();
      expect(globalStats.activeSessions).toBe(2);
    });
  });

  describe('Token Stats Interface', () => {
    it('should return complete token stats', async () => {
      await service.trackTokenUsage(mockSessionId, 10000);
      await service.markCheckpointCreated(mockSessionId);
      await service.trackTokenUsage(mockSessionId, 2000);

      const stats = await service.getTokenStats(mockSessionId);

      expect(stats).toMatchObject({
        sessionId: mockSessionId,
        totalTokens: 12000,
        callCount: 2,
        averageTokens: 6000,
        lastTokens: 2000,
        checkpointCount: 1,
        lastCheckpointTokens: 10000,
        tokensSinceLastCheckpoint: 2000,
      });
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });
  });
});
