/**
 * EventBus Service - AI-Native DevOps Platform
 * Event-driven architecture with Redis Pub/Sub support
 *
 * Phase 9.1: Workflow Orchestration Infrastructure
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { createLogger } from '../utils/logger';

const logger = createLogger('EventBus');

// Event types
export type EventType =
  | 'asset.created'
  | 'asset.updated'
  | 'asset.deleted'
  | 'asset.version.published'
  | 'asset.state.changed'
  | 'impact.analysis.completed'
  | 'tasks.generated'
  | 'task.approved'
  | 'task.assigned'
  | 'task.completed'
  | 'task.failed'
  | 'webhook.triggered';

// Event payload interface
export interface EventPayload {
  eventType: EventType;
  payload: Record<string, unknown>;
  metadata: {
    timestamp: Date;
    correlationId: string;
    source: string;
    userId?: string;
    projectId?: string;
  };
}

// Event handler type
export type EventHandler = (payload: EventPayload) => Promise<void> | void;

/**
 * EventBus Service
 * Supports local EventEmitter (single instance) and Redis Pub/Sub (multi-instance)
 */
export class EventBus {
  private localEmitter: EventEmitter;
  private redisPub?: Redis;
  private redisSub?: Redis;
  private handlers: Map<EventType, Set<EventHandler>>;
  private isDistributed: boolean;

  constructor() {
    this.localEmitter = new EventEmitter();
    this.handlers = new Map();
    this.isDistributed = false;

    // Set max listeners to avoid warning
    this.localEmitter.setMaxListeners(100);

    // Initialize Redis if configured
    this.initializeRedis();
  }

  /**
   * Initialize Redis Pub/Sub for distributed event handling
   */
  private initializeRedis(): void {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

    if (!redisHost) {
      logger.info('Redis not configured, using local EventEmitter only');
      return;
    }

    try {
      this.redisPub = new Redis({ host: redisHost, port: redisPort });
      this.redisSub = new Redis({ host: redisHost, port: redisPort });

      this.redisSub.on('message', (channel: string, message: string) => {
        try {
          const event: EventPayload = JSON.parse(message);
          this.emitLocal(event.eventType, event);
        } catch (error) {
          logger.error('Failed to parse Redis message:', error);
        }
      });

      this.isDistributed = true;
      logger.info('Redis Pub/Sub initialized for distributed events');
    } catch (error) {
      logger.error('Failed to initialize Redis, falling back to local:', error);
      this.isDistributed = false;
    }
  }

  /**
   * Subscribe to an event type
   */
  subscribe(eventType: EventType, handler: EventHandler): () => void {
    // Register handler locally
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
      this.localEmitter.on(eventType, this.handleEvent.bind(this, eventType));

      // Subscribe to Redis channel if distributed
      if (this.isDistributed && this.redisSub) {
        this.redisSub.subscribe(eventType).catch((err) => {
          logger.error(`Failed to subscribe to ${eventType}:`, err);
        });
      }
    }

    this.handlers.get(eventType)!.add(handler);
    logger.debug(`Handler registered for ${eventType}`);

    // Return unsubscribe function
    return () => {
      this.unsubscribe(eventType, handler);
    };
  }

  /**
   * Unsubscribe from an event type
   */
  private unsubscribe(eventType: EventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      logger.debug(`Handler unregistered from ${eventType}`);

      // Cleanup if no handlers remain
      if (handlers.size === 0) {
        this.handlers.delete(eventType);
        this.localEmitter.removeAllListeners(eventType);

        if (this.isDistributed && this.redisSub) {
          this.redisSub.unsubscribe(eventType).catch((err) => {
            logger.error(`Failed to unsubscribe from ${eventType}:`, err);
          });
        }
      }
    }
  }

  /**
   * Publish an event
   */
  async publish(
    eventType: EventType,
    payload: Record<string, unknown>,
    metadata?: Partial<EventPayload['metadata']>
  ): Promise<void> {
    const event: EventPayload = {
      eventType,
      payload,
      metadata: {
        timestamp: new Date(),
        correlationId: metadata?.correlationId || this.generateCorrelationId(),
        source: metadata?.source || 'unknown',
        userId: metadata?.userId,
        projectId: metadata?.projectId,
      },
    };

    // Emit locally
    this.emitLocal(eventType, event);

    // Publish to Redis if distributed
    if (this.isDistributed && this.redisPub) {
      try {
        await this.redisPub.publish(eventType, JSON.stringify(event));
      } catch (error) {
        logger.error('Failed to publish to Redis:', error);
      }
    }

    logger.debug(`Event published: ${eventType}`, { correlationId: event.metadata.correlationId });
  }

  /**
   * Emit event locally (internal)
   */
  private emitLocal(eventType: EventType, event: EventPayload): void {
    this.localEmitter.emit(eventType, event);
  }

  /**
   * Handle event by calling all registered handlers
   */
  private async handleEvent(eventType: EventType, event: EventPayload): Promise<void> {
    const handlers = this.handlers.get(eventType);
    if (!handlers || handlers.size === 0) {
      return;
    }

    logger.debug(`Handling event: ${eventType}`, { correlationId: event.metadata.correlationId });

    // Call all handlers concurrently
    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error(`Handler failed for ${eventType}:`, error);
        // Don't throw - other handlers should continue
      }
    });

    await Promise.all(promises);
  }

  /**
   * Generate correlation ID for tracing
   */
  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get event bus statistics
   */
  getStats(): { local: number; distributed: boolean; subscriptions: Record<string, number> } {
    const subscriptions: Record<string, number> = {};
    this.handlers.forEach((handlers, eventType) => {
      subscriptions[eventType] = handlers.size;
    });

    return {
      local: this.localEmitter.listenerCount(''),
      distributed: this.isDistributed,
      subscriptions,
    };
  }

  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    this.localEmitter.removeAllListeners();
    this.handlers.clear();

    if (this.redisPub) {
      await this.redisPub.quit();
    }
    if (this.redisSub) {
      await this.redisSub.quit();
    }

    logger.info('EventBus closed');
  }
}

// Singleton instance
export const eventBus = new EventBus();
