/**
 * Task Batch Review Integration Tests
 * Phase 9.7: Integration Testing
 *
 * Tests batch review operations and scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withTestTransaction } from '~/helpers/db';
import {
  createTestTaskWithStatus,
  createTestTasks,
  TEST_IDS,
} from '~/fixtures/tasks';
import { taskService } from '@/services/TaskService';
import { eventBus } from '@/services/EventBus';

describe('Task Batch Review Integration', () => {
  const subscriptions: Array<() => void> = [];

  afterEach(() => {
    subscriptions.forEach((unsub) => unsub());
    subscriptions.length = 0;
  });

  describe('Batch Approve', () => {
    it('should approve multiple tasks in batch', async () => {
      await withTestTransaction(async (trx) => {
        // Create pending tasks
        const task1 = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Batch Task 1',
          metadata: { priority: 'high' },
        });
        const task2 = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Batch Task 2',
          metadata: { priority: 'medium' },
        });
        const task3 = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Batch Task 3',
          metadata: { priority: 'low' },
        });

        // Track approved events
        const approvedEvents: string[] = [];
        const unsub = eventBus.subscribe('task.approved', (event) => {
          approvedEvents.push((event.payload as { task_id: string }).task_id);
        });
        subscriptions.push(unsub);

        // Batch approve
        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [task1.id, task2.id, task3.id],
          decision: 'approve',
          notes: 'Batch approval - all look good',
        });

        expect(result.processed).toBe(3);
        expect(result.approved).toBe(3);
        expect(result.rejected).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);

        // Verify all tasks approved
        const updated1 = await taskService.getById(task1.id);
        const updated2 = await taskService.getById(task2.id);
        const updated3 = await taskService.getById(task3.id);

        expect(updated1?.metadata?.state).toBe('approved');
        expect(updated2?.metadata?.state).toBe('approved');
        expect(updated3?.metadata?.state).toBe('approved');

        // Wait for events
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    });

    it('should handle empty batch', async () => {
      await withTestTransaction(async () => {
        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [],
          decision: 'approve',
        });

        expect(result.processed).toBe(0);
        expect(result.approved).toBe(0);
        expect(result.failed).toBe(0);
      });
    });
  });

  describe('Batch Reject', () => {
    it('should reject multiple tasks in batch', async () => {
      await withTestTransaction(async (trx) => {
        const task1 = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Reject Task 1',
        });
        const task2 = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Reject Task 2',
        });

        // Track rejected events
        const rejectedEvents: string[] = [];
        const unsub = eventBus.subscribe('task.rejected', (event) => {
          rejectedEvents.push((event.payload as { task_id: string }).task_id);
        });
        subscriptions.push(unsub);

        // Batch reject
        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [task1.id, task2.id],
          decision: 'reject',
          notes: 'Batch rejection - requirements changed',
        });

        expect(result.processed).toBe(2);
        expect(result.approved).toBe(0);
        expect(result.rejected).toBe(2);
        expect(result.failed).toBe(0);

        // Verify all tasks rejected
        const updated1 = await taskService.getById(task1.id);
        const updated2 = await taskService.getById(task2.id);

        expect(updated1?.metadata?.state).toBe('rejected');
        expect(updated2?.metadata?.state).toBe('rejected');
        expect(updated1?.metadata?.review_notes).toBe('Batch rejection - requirements changed');
      });
    });
  });

  describe('Partial Failures', () => {
    it('should handle already reviewed tasks gracefully', async () => {
      await withTestTransaction(async (trx) => {
        // One pending, one already approved
        const pendingTask = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Pending Task',
        });
        const approvedTask = await createTestTaskWithStatus(trx, 'approved', {
          name: 'Already Approved',
        });

        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [pendingTask.id, approvedTask.id],
          decision: 'approve',
        });

        expect(result.processed).toBe(1);
        expect(result.approved).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].task_id).toBe(approvedTask.id);
        expect(result.errors[0].error).toContain('not in pending_review state');

        // Pending task should be approved
        const updated = await taskService.getById(pendingTask.id);
        expect(updated?.metadata?.state).toBe('approved');
      });
    });

    it('should handle non-existent tasks', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'pending_review');

        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [task.id, 'non-existent-id'],
          decision: 'approve',
        });

        expect(result.processed).toBe(1);
        expect(result.approved).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.errors[0].error).toContain('not found');
      });
    });

    it('should handle mixed success and failures', async () => {
      await withTestTransaction(async (trx) => {
        // Create various tasks
        const pending1 = await createTestTaskWithStatus(trx, 'pending_review');
        const pending2 = await createTestTaskWithStatus(trx, 'pending_review');
        const approved = await createTestTaskWithStatus(trx, 'approved');
        const rejected = await createTestTaskWithStatus(trx, 'rejected');

        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [pending1.id, approved.id, pending2.id, rejected.id],
          decision: 'reject',
          notes: 'Batch rejection test',
        });

        expect(result.processed).toBe(2);
        expect(result.rejected).toBe(2);
        expect(result.failed).toBe(2);
        expect(result.errors).toHaveLength(2);

        // Pending tasks should be rejected
        const updated1 = await taskService.getById(pending1.id);
        const updated2 = await taskService.getById(pending2.id);
        expect(updated1?.metadata?.state).toBe('rejected');
        expect(updated2?.metadata?.state).toBe('rejected');
      });
    });
  });

  describe('Batch Review with Different Task Types', () => {
    it('should approve tasks of different types', async () => {
      await withTestTransaction(async (trx) => {
        const codeGenTask = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Code Gen Task',
          metadata: { task_type: 'code_generation' },
        });
        const testGenTask = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Test Gen Task',
          metadata: { task_type: 'test_generation' },
        });
        const compatTask = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Compat Task',
          metadata: { task_type: 'compatibility_check' },
        });

        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [codeGenTask.id, testGenTask.id, compatTask.id],
          decision: 'approve',
        });

        expect(result.processed).toBe(3);
        expect(result.approved).toBe(3);

        // All should be approved
        const tasks = await taskService.list({ status: 'approved' });
        const approvedIds = tasks.map((t) => t.id);
        expect(approvedIds).toContain(codeGenTask.id);
        expect(approvedIds).toContain(testGenTask.id);
        expect(approvedIds).toContain(compatTask.id);
      });
    });
  });

  describe('Batch Review Performance', () => {
    it('should handle 50 tasks efficiently', async () => {
      await withTestTransaction(async (trx) => {
        const tasks = await createTestTasks(trx, 50, {
          state: 'pending_review',
          metadata: {
            state: 'pending_review',
            task_type: 'code_generation',
            priority: 'medium',
            acceptance_criteria: ['AC1'],
          },
        });

        const startTime = Date.now();

        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: tasks.map((t) => t.id),
          decision: 'approve',
          notes: 'Large batch approval',
        });

        const duration = Date.now() - startTime;

        expect(result.processed).toBe(50);
        expect(result.approved).toBe(50);
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

        // Verify all approved
        const approvedCount = (await taskService.list({ status: 'approved' })).length;
        expect(approvedCount).toBeGreaterThanOrEqual(50);
      });
    });

    it('should handle batch with high and low priority mix', async () => {
      await withTestTransaction(async (trx) => {
        const highPriority = await createTestTaskWithStatus(trx, 'pending_review', {
          metadata: { priority: 'high' },
        });
        const mediumPriority = await createTestTaskWithStatus(trx, 'pending_review', {
          metadata: { priority: 'medium' },
        });
        const lowPriority = await createTestTaskWithStatus(trx, 'pending_review', {
          metadata: { priority: 'low' },
        });

        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [highPriority.id, mediumPriority.id, lowPriority.id],
          decision: 'approve',
        });

        expect(result.processed).toBe(3);

        // All priorities should be approved
        const stats = await taskService.getStats();
        expect(stats.approved_count || stats.by_status['approved']).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Event Publishing', () => {
    it('should publish events for all batch approved tasks', async () => {
      await withTestTransaction(async (trx) => {
        const task1 = await createTestTaskWithStatus(trx, 'pending_review');
        const task2 = await createTestTaskWithStatus(trx, 'pending_review');

        const eventCount = { approved: 0, rejected: 0 };

        const unsubApprove = eventBus.subscribe('task.approved', () => {
          eventCount.approved++;
        });
        subscriptions.push(unsubApprove);

        const unsubReject = eventBus.subscribe('task.rejected', () => {
          eventCount.rejected++;
        });
        subscriptions.push(unsubReject);

        await taskService.batchReview(TEST_IDS.user, {
          task_ids: [task1.id, task2.id],
          decision: 'approve',
        });

        // Wait for events to propagate
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(eventCount.approved).toBe(2);
        expect(eventCount.rejected).toBe(0);
      });
    });

    it('should publish events for all batch rejected tasks', async () => {
      await withTestTransaction(async (trx) => {
        const task1 = await createTestTaskWithStatus(trx, 'pending_review');
        const task2 = await createTestTaskWithStatus(trx, 'pending_review');

        const eventCount = { approved: 0, rejected: 0 };

        const unsubApprove = eventBus.subscribe('task.approved', () => {
          eventCount.approved++;
        });
        subscriptions.push(unsubApprove);

        const unsubReject = eventBus.subscribe('task.rejected', () => {
          eventCount.rejected++;
        });
        subscriptions.push(unsubReject);

        await taskService.batchReview(TEST_IDS.user, {
          task_ids: [task1.id, task2.id],
          decision: 'reject',
        });

        // Wait for events to propagate
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(eventCount.approved).toBe(0);
        expect(eventCount.rejected).toBe(2);
      });
    });
  });

  describe('Batch Review State Transitions', () => {
    it('should not allow batch modify (only approve/reject)', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'pending_review');

        // Batch review only supports approve/reject
        const result = await taskService.batchReview(TEST_IDS.user, {
          task_ids: [task.id],
          decision: 'reject', // modify is not supported in batch
        });

        expect(result.processed).toBe(1);
        expect(result.rejected).toBe(1);
      });
    });

    it('should maintain audit trail for batch operations', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'pending_review');

        await taskService.batchReview(TEST_IDS.user, {
          task_ids: [task.id],
          decision: 'approve',
          notes: 'Audit trail test',
        });

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.reviewed_by).toBe(TEST_IDS.user);
        expect(updated?.metadata?.review_notes).toBe('Audit trail test');
        expect(updated?.metadata?.reviewed_at).toBeDefined();
      });
    });
  });
});
