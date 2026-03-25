/**
 * Task Workflow Integration Tests
 * Phase 9.7: Integration Testing
 *
 * Tests the complete task workflow from generation to execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withTestTransaction } from '~/helpers/db';
import {
  createTestTask,
  createTestTasks,
  createTestTaskWithStatus,
  createTaskRoutingHistory,
  createDirtySource,
  TEST_IDS,
  type TaskAsset,
} from '~/fixtures/tasks';
import { createTestAsset } from '~/fixtures/assets';
import { taskService } from '@/services/TaskService';
import { taskRouterAgent } from '@/agents/TaskRouterAgent';
import { eventBus } from '@/services/EventBus';
import { db } from '@/db/connection';

describe('Task Workflow Integration', () => {
  // Track subscriptions for cleanup
  const subscriptions: Array<() => void> = [];

  afterEach(() => {
    // Clean up event subscriptions
    subscriptions.forEach((unsub) => unsub());
    subscriptions.length = 0;
  });

  describe('Task Lifecycle', () => {
    it('should create a task and retrieve it', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTask(trx, {
          name: 'Integration Test Task',
          metadata: {
            task_type: 'code_generation',
            priority: 'high',
            acceptance_criteria: ['AC1', 'AC2'],
            source_asset_id: 'test-source-id',
          },
        });

        expect(task).toBeDefined();
        expect(task.name).toBe('Integration Test Task');
        expect(task.type).toBe('task');
        expect(task.metadata.task_type).toBe('code_generation');
        expect(task.metadata.priority).toBe('high');
        expect(task.metadata.acceptance_criteria).toHaveLength(2);

        // Verify it can be retrieved via service
        const retrieved = await taskService.getById(task.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(task.id);
        expect(retrieved?.name).toBe('Integration Test Task');
      });
    });

    it('should list tasks with filters', async () => {
      await withTestTransaction(async (trx) => {
        // Create tasks with different statuses
        await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Task 1 - Pending',
          metadata: { priority: 'high', task_type: 'code_generation' },
        });
        await createTestTaskWithStatus(trx, 'completed', {
          name: 'Task 2 - Completed',
          metadata: { priority: 'low', task_type: 'test_generation' },
        });
        await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Task 3 - Pending Low',
          metadata: { priority: 'low', task_type: 'code_generation' },
        });

        // List all tasks
        const allTasks = await taskService.list({});
        expect(allTasks.length).toBeGreaterThanOrEqual(3);

        // Filter by status
        const pendingTasks = await taskService.list({ status: 'pending_review' });
        expect(pendingTasks.filter((t) => t.name?.includes('Pending')).length).toBeGreaterThanOrEqual(2);

        // Filter by priority
        const highPriorityTasks = await taskService.list({ priority: 'high' });
        expect(highPriorityTasks.some((t) => t.name === 'Task 1 - Pending')).toBe(true);
      });
    });
  });

  describe('Task Review Workflow', () => {
    it('should approve a task and trigger routing', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'pending_review');

        // Track routing event
        let routingEvent: Record<string, unknown> | null = null;
        const unsub = eventBus.subscribe('task.approved', (event) => {
          routingEvent = event.payload as Record<string, unknown>;
        });
        subscriptions.push(unsub);

        // Review and approve
        const result = await taskService.review(task.id, TEST_IDS.user, {
          decision: 'approve',
          notes: 'Looks good',
        });

        expect(result.decision).toBe('approve');
        expect(result.new_state).toBe('approved');
        expect(result.requires_routing).toBe(true);

        // Verify task state updated
        const updatedTask = await taskService.getById(task.id);
        expect(updatedTask?.metadata?.state).toBe('approved');
        expect(updatedTask?.metadata?.review_decision).toBe('approve');
        expect(updatedTask?.metadata?.review_notes).toBe('Looks good');

        // Wait for event to be processed
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    });

    it('should reject a task', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'pending_review');

        // Track rejected event
        let rejectedEvent: Record<string, unknown> | null = null;
        const unsub = eventBus.subscribe('task.rejected', (event) => {
          rejectedEvent = event.payload as Record<string, unknown>;
        });
        subscriptions.push(unsub);

        // Review and reject
        const result = await taskService.review(task.id, TEST_IDS.user, {
          decision: 'reject',
          notes: 'Not aligned with requirements',
        });

        expect(result.decision).toBe('reject');
        expect(result.new_state).toBe('rejected');
        expect(result.requires_routing).toBe(false);

        // Verify task state updated
        const updatedTask = await taskService.getById(task.id);
        expect(updatedTask?.metadata?.state).toBe('rejected');
        expect(updatedTask?.metadata?.review_decision).toBe('reject');
      });
    });

    it('should modify a task during review', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Original Name',
          description: 'Original description',
          metadata: {
            priority: 'low',
            task_type: 'code_generation',
            acceptance_criteria: ['AC1'],
          },
        });

        // Review with modifications
        const result = await taskService.review(task.id, TEST_IDS.user, {
          decision: 'modify',
          notes: 'Updated priority and criteria',
          modifications: {
            title: 'Modified Name',
            description: 'Modified description',
            priority: 'high',
            assigned_agent: 'test-agent',
            acceptance_criteria: ['AC1', 'AC2', 'AC3'],
            estimated_effort: 4,
          },
        });

        expect(result.decision).toBe('modify');
        expect(result.new_state).toBe('modified');
        expect(result.requires_routing).toBe(true);

        // Verify modifications applied
        const updatedTask = await taskService.getById(task.id);
        expect(updatedTask?.name).toBe('Modified Name');
        expect(updatedTask?.description).toBe('Modified description');
        expect(updatedTask?.metadata?.priority).toBe('high');
        expect(updatedTask?.metadata?.assigned_agent).toBe('test-agent');
        expect(updatedTask?.metadata?.acceptance_criteria).toHaveLength(3);
        expect(updatedTask?.metadata?.estimated_effort).toBe(4);
      });
    });

    it('should prevent reviewing already reviewed tasks', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'approved');

        await expect(
          taskService.review(task.id, TEST_IDS.user, {
            decision: 'approve',
          })
        ).rejects.toThrow(/not in pending_review state/);
      });
    });
  });

  describe('Task Assignment', () => {
    it('should assign a task to an agent', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'approved');

        // Track assigned event
        let assignedEvent: Record<string, unknown> | null = null;
        const unsub = eventBus.subscribe('task.assigned', (event) => {
          assignedEvent = event.payload as Record<string, unknown>;
        });
        subscriptions.push(unsub);

        // Assign task
        await taskService.assign(task.id, 'code-agent', TEST_IDS.user);

        // Verify assignment
        const updatedTask = await taskService.getById(task.id);
        expect(updatedTask?.metadata?.assigned_agent).toBe('code-agent');
        expect(updatedTask?.metadata?.state).toBe('assigned');
        expect(updatedTask?.metadata?.assigned_by).toBe(TEST_IDS.user);
      });
    });

    it('should update execution status', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'assigned', {
          metadata: { assigned_agent: 'code-agent' },
        });

        // Update to in_progress
        await taskService.updateExecutionStatus(task.id, 'in_progress');
        let updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('in_progress');
        expect(updated?.metadata?.execution_started_at).toBeDefined();

        // Update to completed
        await taskService.updateExecutionStatus(task.id, 'completed', {
          output: 'Task executed successfully',
          artifacts: ['artifact1', 'artifact2'],
        });
        updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('completed');
        expect(updated?.metadata?.execution_completed_at).toBeDefined();
        expect(updated?.metadata?.execution_output).toBe('Task executed successfully');
        expect(updated?.metadata?.execution_artifacts).toHaveLength(2);
      });
    });
  });

  describe('Task Statistics', () => {
    it('should return accurate task statistics', async () => {
      await withTestTransaction(async (trx) => {
        // Create tasks with various statuses
        await createTestTaskWithStatus(trx, 'pending_review', {
          metadata: { priority: 'high', task_type: 'code_generation' },
        });
        await createTestTaskWithStatus(trx, 'pending_review', {
          metadata: { priority: 'medium', task_type: 'code_generation' },
        });
        await createTestTaskWithStatus(trx, 'approved', {
          metadata: { priority: 'high', task_type: 'test_generation' },
        });
        await createTestTaskWithStatus(trx, 'completed', {
          metadata: { priority: 'low', task_type: 'code_generation' },
        });
        await createTestTaskWithStatus(trx, 'failed', {
          metadata: { priority: 'high', task_type: 'test_generation' },
        });

        const stats = await taskService.getStats();

        expect(stats.total).toBeGreaterThanOrEqual(5);
        expect(stats.pending_review_count).toBeGreaterThanOrEqual(2);
        expect(stats.by_status['pending_review']).toBeGreaterThanOrEqual(2);
        expect(stats.by_status['approved']).toBeGreaterThanOrEqual(1);
        expect(stats.by_status['completed']).toBeGreaterThanOrEqual(1);
        expect(stats.by_status['failed']).toBeGreaterThanOrEqual(1);
        expect(stats.by_priority['high']).toBeGreaterThanOrEqual(3);
        expect(stats.by_type['code_generation']).toBeGreaterThanOrEqual(3);
        expect(stats.by_type['test_generation']).toBeGreaterThanOrEqual(2);
      });
    });

    it('should return attention required tasks', async () => {
      await withTestTransaction(async (trx) => {
        // Create tasks requiring attention
        await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Pending Task 1',
          metadata: { priority: 'high' },
        });
        await createTestTaskWithStatus(trx, 'pending_review', {
          name: 'Pending Task 2',
          metadata: { priority: 'medium' },
        });

        const attention = await taskService.getAttentionRequired(TEST_IDS.user);

        expect(attention.pending_review.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Task Routing History', () => {
    it('should record routing decision in history', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTask(trx);

        // Create routing history
        const history = await createTaskRoutingHistory(trx, task.id, {
          strategy_used: 'typeBased',
          recommendation: JSON.stringify({
            agent_id: 'code-agent',
            confidence: 0.9,
            reason: 'High confidence match',
          }),
          final_agent_id: 'code-agent',
        });

        expect(history).toBeDefined();
        expect(history.task_id).toBe(task.id);
        expect(history.strategy_used).toBe('typeBased');

        // Update with execution result
        await trx('task_routing_history')
          .where({ id: history.id })
          .update({
            execution_success: true,
            execution_duration_ms: 5000,
          });

        const updated = await trx('task_routing_history').where({ id: history.id }).first();
        expect(updated.execution_success).toBe(true);
        expect(updated.execution_duration_ms).toBe(5000);
      });
    });

    it('should record user override in routing history', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTask(trx);

        const history = await createTaskRoutingHistory(trx, task.id, {
          recommendation: JSON.stringify({
            agent_id: 'code-agent',
            confidence: 0.6,
            reason: 'Suggested agent',
          }),
          user_overridden: true,
          override_reason: 'Prefer test agent for this task',
          final_agent_id: 'test-agent',
        });

        expect(history.user_overridden).toBe(true);
        expect(history.final_agent_id).toBe('test-agent');
      });
    });
  });

  describe('Dirty Source Integration', () => {
    it('should link tasks to dirty sources', async () => {
      await withTestTransaction(async (trx) => {
        // Create source asset and upstream asset
        const sourceAsset = await createTestAsset(trx, { type: 'design' });
        const upstreamAsset = await createTestAsset(trx, { type: 'requirement' });

        // Create tasks
        const task1 = await createTestTask(trx, { name: 'Generated Task 1' });
        const task2 = await createTestTask(trx, { name: 'Generated Task 2' });

        // Create dirty source with generated tasks
        const dirtySource = await createDirtySource(
          trx,
          sourceAsset.id,
          upstreamAsset.id,
          [task1.id, task2.id]
        );

        expect(dirtySource).toBeDefined();
        expect(dirtySource.asset_id).toBe(sourceAsset.id);
        expect(dirtySource.upstream_asset_id).toBe(upstreamAsset.id);

        const generatedTasks = JSON.parse(dirtySource.generated_tasks as string);
        expect(generatedTasks).toContain(task1.id);
        expect(generatedTasks).toContain(task2.id);
      });
    });
  });
});
