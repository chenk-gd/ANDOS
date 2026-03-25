import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus, EventType } from '../../../src/services/EventBus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await eventBus.close();
  });

  describe('subscribe and publish', () => {
    it('should receive published events', async () => {
      const handler = vi.fn();

      eventBus.subscribe('asset.created' as EventType, handler);
      await eventBus.publish('asset.created' as EventType, { id: '123', name: 'Test' });

      // Wait for async handler
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'asset.created',
          payload: { id: '123', name: 'Test' },
          metadata: expect.objectContaining({
            timestamp: expect.any(Date),
            correlationId: expect.any(String),
            source: 'unknown',
          }),
        })
      );
    });

    it('should support multiple handlers for same event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      eventBus.subscribe('asset.updated' as EventType, handler1);
      eventBus.subscribe('asset.updated' as EventType, handler2);
      await eventBus.publish('asset.updated' as EventType, { id: '456' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should support unsubscribe', async () => {
      const handler = vi.fn();

      const unsubscribe = eventBus.subscribe('asset.deleted' as EventType, handler);
      await eventBus.publish('asset.deleted' as EventType, { id: '789' });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      await eventBus.publish('asset.deleted' as EventType, { id: '999' });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still be 1, not 2
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should include metadata in events', async () => {
      const handler = vi.fn();

      eventBus.subscribe('asset.version.published' as EventType, handler);
      await eventBus.publish(
        'asset.version.published' as EventType,
        { assetId: '123', version: '1.0.0' },
        {
          source: 'AssetService',
          userId: 'user-456',
          projectId: 'proj-789',
          correlationId: 'corr-abc',
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            source: 'AssetService',
            userId: 'user-456',
            projectId: 'proj-789',
            correlationId: 'corr-abc',
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('should not fail if handler throws', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      const successHandler = vi.fn();

      eventBus.subscribe('asset.created' as EventType, errorHandler);
      eventBus.subscribe('asset.created' as EventType, successHandler);

      // Should not throw
      await expect(
        eventBus.publish('asset.created' as EventType, { id: '123' })
      ).resolves.not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('should return subscription statistics', () => {
      eventBus.subscribe('asset.created' as EventType, vi.fn());
      eventBus.subscribe('asset.created' as EventType, vi.fn());
      eventBus.subscribe('asset.updated' as EventType, vi.fn());

      const stats = eventBus.getStats();

      expect(stats.distributed).toBe(false); // No Redis in test
      expect(stats.subscriptions['asset.created']).toBe(2);
      expect(stats.subscriptions['asset.updated']).toBe(1);
    });
  });
});
