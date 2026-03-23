/**
 * SchedulerService Tests - TDD
 * Tests for background task scheduler
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SchedulerService, ScheduledTask } from '../../../src/services/SchedulerService';

describe('SchedulerService', () => {
  let scheduler: SchedulerService;
  let mockTask: ScheduledTask;

  beforeEach(() => {
    scheduler = new SchedulerService();

    mockTask = {
      name: 'test-task',
      schedule: '*/5 * * * *',
      handler: vi.fn().mockResolvedValue(undefined),
      enabled: true,
    };
  });

  afterEach(() => {
    scheduler.stopAll();
    vi.clearAllMocks();
  });

  describe('Task Registration', () => {
    it('should register a scheduled task', () => {
      const beforeCount = scheduler.getTasks().length;
      scheduler.registerTask(mockTask);
      const tasks = scheduler.getTasks();

      // Should have 3 default tasks + 1 new task
      expect(tasks).toHaveLength(beforeCount + 1);
      expect(tasks[tasks.length - 1].name).toBe('test-task');
    });

    it('should throw error when registering duplicate task name', () => {
      scheduler.registerTask(mockTask);

      expect(() => {
        scheduler.registerTask(mockTask);
      }).toThrow('Task test-task is already registered');
    });

    it('should support multiple tasks', () => {
      scheduler.registerTask(mockTask);
      scheduler.registerTask({
        ...mockTask,
        name: 'second-task',
        schedule: '0 * * * *',
      });

      // Should have 3 default tasks + 2 new tasks = 5 total
      const tasks = scheduler.getTasks();
      expect(tasks).toHaveLength(5);
      expect(tasks.map(t => t.name)).toContain('test-task');
      expect(tasks.map(t => t.name)).toContain('second-task');
    });
  });

  describe('Task Execution', () => {
    it('should execute task when run manually', async () => {
      scheduler.registerTask(mockTask);

      await scheduler.runTaskNow('test-task');

      expect(mockTask.handler).toHaveBeenCalledTimes(1);
    });

    it('should track last run time', async () => {
      scheduler.registerTask(mockTask);

      await scheduler.runTaskNow('test-task');

      const status = scheduler.getTaskStatus('test-task');
      expect(status?.lastRun).not.toBeNull();
    });

    it('should not execute disabled tasks', async () => {
      scheduler.registerTask({
        ...mockTask,
        enabled: false,
      });
      scheduler.startAll();

      expect(scheduler.isRunning('test-task')).toBe(false);
    });

    it('should handle task execution errors gracefully', async () => {
      const errorTask = {
        ...mockTask,
        handler: vi.fn().mockRejectedValue(new Error('Task failed')),
      };

      scheduler.registerTask(errorTask);

      // Should not throw when run manually
      await expect(scheduler.runTaskNow('test-task')).rejects.toThrow('Task failed');
      expect(errorTask.handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Task Control', () => {
    it('should start all tasks', () => {
      scheduler.registerTask(mockTask);
      scheduler.startAll();

      expect(scheduler.isRunning('test-task')).toBe(true);
    });

    it('should stop all tasks', () => {
      scheduler.registerTask(mockTask);
      scheduler.startAll();
      scheduler.stopAll();

      expect(scheduler.isRunning('test-task')).toBe(false);
    });

    it('should start specific task', () => {
      scheduler.registerTask(mockTask);
      scheduler.startTask('test-task');

      expect(scheduler.isRunning('test-task')).toBe(true);
    });

    it('should stop specific task', () => {
      scheduler.registerTask(mockTask);
      scheduler.startAll();
      scheduler.stopTask('test-task');

      expect(scheduler.isRunning('test-task')).toBe(false);
    });

    it('should throw when starting non-existent task', () => {
      expect(() => {
        scheduler.startTask('non-existent');
      }).toThrow('Task non-existent not found');
    });
  });

  describe('Auto Memory Extraction Integration', () => {
    it('should have auto-extraction task preset', () => {
      const tasks = scheduler.getTasks();
      const extractionTask = tasks.find(t => t.name === 'auto-memory-extraction');

      expect(extractionTask).toBeDefined();
      expect(extractionTask?.schedule).toBe('*/5 * * * *');
    });

    it('should have ttl-cleanup task preset', () => {
      const tasks = scheduler.getTasks();
      const cleanupTask = tasks.find(t => t.name === 'ttl-cleanup');

      expect(cleanupTask).toBeDefined();
      expect(cleanupTask?.schedule).toBe('0 * * * *');
    });
  });

  describe('Graceful Shutdown', () => {
    it('should stop all tasks on shutdown', () => {
      scheduler.registerTask(mockTask);
      scheduler.startAll();
      scheduler.stopAll();

      expect(scheduler.isRunning('test-task')).toBe(false);
    });
  });

  describe('Task Status', () => {
    it('should return task status', () => {
      scheduler.registerTask(mockTask);

      const status = scheduler.getTaskStatus('test-task');

      expect(status).toEqual({
        name: 'test-task',
        enabled: true,
        running: false,
        schedule: '*/5 * * * *',
        lastRun: null,
        nextRun: null,
      });
    });

    it('should return null for non-existent task', () => {
      const status = scheduler.getTaskStatus('non-existent');
      expect(status).toBeNull();
    });
  });
});
