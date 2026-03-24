/**
 * SchedulerService - Background Task Scheduler
 * Manages scheduled tasks for auto memory extraction, TTL cleanup, etc.
 *
 * Features:
 * - Cron-based scheduling
 * - Graceful start/stop
 * - Error handling
 * - Task status tracking
 */

import * as cron from 'node-cron';
import { kvMemoryService } from './KVMemoryService';
import { sessionMemoryService } from './SessionMemoryService';
import { logger } from '../utils/logger';

// Type alias for node-cron ScheduledTask
type CronTask = cron.ScheduledTask;

export interface ScheduledTask {
  /** Task name (must be unique) */
  name: string;
  /** Cron expression (e.g., every 5 minutes) */
  schedule: string;
  /** Task handler function */
  handler: () => Promise<void>;
  /** Whether task is enabled */
  enabled: boolean;
}

export interface TaskStatus {
  name: string;
  enabled: boolean;
  running: boolean;
  schedule: string;
  lastRun: Date | null;
  nextRun: Date | null;
}

interface TaskRecord {
  task: ScheduledTask;
  cronTask: CronTask | null;
  lastRun: Date | null;
}

export class SchedulerService {
  private tasks: Map<string, TaskRecord> = new Map();

  constructor() {
    // Register default tasks
    this.registerDefaultTasks();
  }

  /**
   * Register default scheduled tasks
   */
  private registerDefaultTasks(): void {
    // Auto memory extraction - every 5 minutes
    this.registerTask({
      name: 'auto-memory-extraction',
      schedule: '*/5 * * * *',
      handler: async () => {
        logger.info('[Scheduler] Running auto memory extraction...');
        // AutoMemoryExtractionService will be injected here
        // For now, this is a placeholder
      },
      enabled: false, // Disabled by default until fully integrated
    });

    // TTL cleanup - every hour
    this.registerTask({
      name: 'ttl-cleanup',
      schedule: '0 * * * *',
      handler: async () => {
        logger.info('[Scheduler] Running TTL cleanup...');
        const kvDeleted = await kvMemoryService.cleanupExpired();
        const sessionDeleted = await sessionMemoryService.cleanupExpiredSessions();
        logger.info(`[Scheduler] TTL cleanup complete: ${kvDeleted} KV entries, ${sessionDeleted} session checkpoints deleted`);
      },
      enabled: true, // Enabled by default
    });

    // Token usage stats - daily at midnight
    this.registerTask({
      name: 'token-usage-stats',
      schedule: '0 0 * * *',
      handler: async () => {
        logger.info('[Scheduler] Running token usage stats...');
        // TokenTrackingService stats aggregation will be called here
        // For now, this is a placeholder
      },
      enabled: false, // Disabled by default until fully integrated
    });
  }

  /**
   * Register a new scheduled task
   */
  registerTask(task: ScheduledTask): void {
    if (this.tasks.has(task.name)) {
      throw new Error(`Task ${task.name} is already registered`);
    }

    this.tasks.set(task.name, {
      task,
      cronTask: null,
      lastRun: null,
    });
  }

  /**
   * Unregister a scheduled task
   */
  unregisterTask(name: string): void {
    const record = this.tasks.get(name);
    if (record?.cronTask) {
      record.cronTask.stop();
    }
    this.tasks.delete(name);
  }

  /**
   * Start all enabled tasks
   */
  startAll(): void {
    for (const [name, record] of Array.from(this.tasks.entries())) {
      if (record.task.enabled && !record.cronTask) {
        this.startTask(name);
      }
    }
  }

  /**
   * Stop all tasks
   */
  stopAll(): void {
    for (const [name, record] of Array.from(this.tasks.entries())) {
      if (record.cronTask) {
        this.stopTask(name);
      }
    }
  }

  /**
   * Start a specific task
   */
  startTask(name: string): void {
    const record = this.tasks.get(name);
    if (!record) {
      throw new Error(`Task ${name} not found`);
    }

    if (record.cronTask) {
      // Already running
      return;
    }

    if (!record.task.enabled) {
      logger.warn(`Task ${name} is disabled and will not be started`);
      return;
    }

    // Create and start cron task
    record.cronTask = cron.schedule(record.task.schedule, async () => {
      try {
        await record.task.handler();
        record.lastRun = new Date();
      } catch (error) {
        logger.error(`[Scheduler] Task ${name} failed:`, error);
        // Continue running - don't stop the scheduler on error
      }
    }, {
      timezone: 'UTC',
    });

    logger.info(`[Scheduler] Started task: ${name} (${record.task.schedule})`);
  }

  /**
   * Stop a specific task
   */
  stopTask(name: string): void {
    const record = this.tasks.get(name);
    if (!record) {
      throw new Error(`Task ${name} not found`);
    }

    if (record.cronTask) {
      record.cronTask.stop();
      record.cronTask = null;
      logger.info(`[Scheduler] Stopped task: ${name}`);
    }
  }

  /**
   * Check if a task is running
   */
  isRunning(name: string): boolean {
    const record = this.tasks.get(name);
    return record?.cronTask !== null && record?.cronTask !== undefined;
  }

  /**
   * Get all registered tasks
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values()).map(r => r.task);
  }

  /**
   * Get task status
   */
  getTaskStatus(name: string): TaskStatus | null {
    const record = this.tasks.get(name);
    if (!record) {
      return null;
    }

    // Calculate next run time (simplified - assumes cron is running)
    let nextRun: Date | null = null;
    if (record.cronTask && record.lastRun) {
      // Estimate next run based on schedule
      // This is a simplified version - real implementation would parse cron
      nextRun = new Date(record.lastRun.getTime() + 5 * 60 * 1000); // Default 5 min
    }

    return {
      name: record.task.name,
      enabled: record.task.enabled,
      running: this.isRunning(name),
      schedule: record.task.schedule,
      lastRun: record.lastRun,
      nextRun,
    };
  }

  /**
   * Enable a task
   */
  enableTask(name: string): void {
    const record = this.tasks.get(name);
    if (!record) {
      throw new Error(`Task ${name} not found`);
    }
    record.task.enabled = true;
  }

  /**
   * Disable a task
   */
  disableTask(name: string): void {
    const record = this.tasks.get(name);
    if (!record) {
      throw new Error(`Task ${name} not found`);
    }
    record.task.enabled = false;

    // Stop if running
    if (record.cronTask) {
      this.stopTask(name);
    }
  }

  /**
   * Run a task immediately (one-time execution)
   */
  async runTaskNow(name: string): Promise<void> {
    const record = this.tasks.get(name);
    if (!record) {
      throw new Error(`Task ${name} not found`);
    }

    try {
      await record.task.handler();
      record.lastRun = new Date();
    } catch (error) {
      logger.error(`[Scheduler] Task ${name} failed (manual run):`, error);
      throw error;
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    total: number;
    running: number;
    enabled: number;
    disabled: number;
  } {
    const tasks = this.getTasks();
    const running = tasks.filter(t => this.isRunning(t.name)).length;
    const enabled = tasks.filter(t => t.enabled).length;

    return {
      total: tasks.length,
      running,
      enabled,
      disabled: tasks.length - enabled,
    };
  }
}

// Singleton instance
export const schedulerService = new SchedulerService();
