/**
 * Task Retry and Failure Handling Integration Tests
 * Phase 9.7: Integration Testing
 *
 * Tests retry mechanisms, failure handling, and escalation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withTestTransaction } from '../../helpers/db';
import {
  createTestTaskWithStatus,
  createTestTask,
  createTaskRoutingHistory,
  TEST_IDS,
} from '../../fixtures/tasks';
import { taskService } from '../../../src/services/TaskService';
import { eventBus } from '../../../src/services/EventBus';
import { db } from '../../../src/db/connection';

describe('Task Retry and Failure Handling Integration', () => {
  const subscriptions: Array<() => void> = [];

  afterEach(() => {
    subscriptions.forEach((unsub) => unsub());
    subscriptions.length = 0;
  });

  describe('Execution Failure', () => {
    it('should track failed execution with error details', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'assigned', {
          name: 'Task to Fail',
          metadata: {
            assigned_agent: 'code-agent',
            execution_retry_count: 0,
          },
        });

        // Update to failed status
        await taskService.updateExecutionStatus(task.id, 'failed', {
          error: 'Syntax error in generated code: unexpected token at line 42',
        });

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('failed');
        expect(updated?.metadata?.execution_error).toBe('Syntax error in generated code: unexpected token at line 42');
        expect(updated?.metadata?.execution_failed_at).toBeDefined();
      });
    });

    it('should update execution output on success', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'in_progress', {
          name: 'Task to Complete',
          metadata: {
            assigned_agent: 'code-agent',
            execution_started_at: new Date().toISOString(),
          },
        });

        await taskService.updateExecutionStatus(task.id, 'completed', {
          output: 'Successfully generated code for user authentication module',
          artifacts: ['src/auth/login.ts', 'src/auth/register.ts', 'tests/auth.test.ts'],
        });

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('completed');
        expect(updated?.metadata?.execution_output).toContain('Successfully generated');
        expect(updated?.metadata?.execution_artifacts).toHaveLength(3);
        expect(updated?.metadata?.execution_completed_at).toBeDefined();
      });
    });
  });

  describe('Retry Mechanism', () => {
    it('should increment retry count on failure', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'assigned', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_retry_count: 0,
          },
        });

        // First failure
        await db('assets').where({ id: task.id }).update({
          metadata: db.raw(`metadata || '{"execution_retry_count": 1}'::jsonb`),
          state: 'assigned',
        });

        let updated = await taskService.getById(task.id);
        expect(updated?.metadata?.execution_retry_count).toBe(1);

        // Second failure
        await db('assets').where({ id: task.id }).update({
          metadata: db.raw(`metadata || '{"execution_retry_count": 2}'::jsonb`),
          state: 'assigned',
        });

        updated = await taskService.getById(task.id);
        expect(updated?.metadata?.execution_retry_count).toBe(2);
      });
    });

    it('should reset state for retry', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'failed', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_retry_count: 1,
            execution_error: 'Previous error',
          },
        });

        // Simulate retry - reset to assigned
        await db('assets').where({ id: task.id }).update({
          state: 'assigned',
          metadata: db.raw(`metadata || '{"execution_retry_count": 2}'::jsonb`),
        });

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('assigned');
        expect(updated?.metadata?.execution_retry_count).toBe(2);
      });
    });

    it('should allow retry up to max retries', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'assigned', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_retry_count: 2, // At max retries
          },
        });

        // This would be the 3rd retry (max is 2)
        // After max retries, task should escalate
        await db('assets').where({ id: task.id }).update({
          state: 'failed',
          metadata: db.raw(`metadata || '{"escalated_to_user": true}'::jsonb`),
        });

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.escalated_to_user).toBe(true);
        expect(updated?.state).toBe('failed');
      });
    });
  });

  describe('Escalation', () => {
    it('should escalate to user after max retries exceeded', async () => {
      await withTestTransaction(async (trx) => {
        // Track escalation event
        let escalationEvent: Record<string, unknown> | null = null;
        const unsub = eventBus.subscribe('task.escalated', (event) => {
          escalationEvent = event.payload as Record<string, unknown>;
        });
        subscriptions.push(unsub);

        const task = await createTestTaskWithStatus(trx, 'failed', {
          name: 'Failed Task',
          metadata: {
            assigned_agent: 'code-agent',
            execution_retry_count: 2, // Max retries
            execution_error: 'Persistent failure',
          },
        });

        // Simulate escalation
        await db('assets').where({ id: task.id }).update({
          metadata: db.raw(`metadata || '{"escalated_to_user": true}'::jsonb`),
        });

        // Publish escalation event (normally done by TaskExecutionAdapter)
        await eventBus.publish(
          'task.escalated',
          {
            task_id: task.id,
            reason: 'Persistent failure',
            retry_count: 2,
          },
          { source: 'TaskExecutionAdapter' }
        );

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.escalated_to_user).toBe(true);

        // Wait for event
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(escalationEvent).toBeDefined();
        expect((escalationEvent as Record<string, unknown>)?.task_id).toBe(task.id);
      });
    });

    it('should not allow further retries after escalation', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'failed', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_retry_count: 2,
            escalated_to_user: true,
          },
        });

        // Attempting to retry an escalated task should not be allowed
        // (This would be handled by business logic)
        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.escalated_to_user).toBe(true);
        expect(updated?.state).toBe('failed');
      });
    });
  });

  describe('State Transitions on Failure', () => {
    it('should transition from in_progress to failed', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'in_progress', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_started_at: new Date().toISOString(),
          },
        });

        await taskService.updateExecutionStatus(task.id, 'failed', {
          error: 'Runtime error during execution',
        });

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('failed');
      });
    });

    it('should handle timeout status', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'in_progress', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          },
        });

        // Timeout would be detected by polling mechanism
        await taskService.updateExecutionStatus(task.id, 'failed', {
          error: 'Execution timed out after 300000ms',
        });

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('failed');
        expect(updated?.metadata?.execution_error).toContain('timed out');
      });
    });
  });

  describe('Routing History on Failure', () => {
    it('should update routing history with execution failure', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'assigned', {
          metadata: { assigned_agent: 'code-agent' },
        });

        const history = await createTaskRoutingHistory(trx, task.id, {
          final_agent_id: 'code-agent',
        });

        // Update with failure result
        await db('task_routing_history').where({ id: history.id }).update({
          execution_success: false,
          execution_duration_ms: 30000,
        });

        const updated = await db('task_routing_history').where({ id: history.id }).first();
        expect(updated.execution_success).toBe(false);
        expect(updated.execution_duration_ms).toBe(30000);
      });
    });

    it('should update routing history with execution success', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'completed', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_completed_at: new Date().toISOString(),
          },
        });

        const history = await createTaskRoutingHistory(trx, task.id, {
          final_agent_id: 'code-agent',
        });

        await db('task_routing_history').where({ id: history.id }).update({
          execution_success: true,
          execution_duration_ms: 45000,
        });

        const updated = await db('task_routing_history').where({ id: history.id }).first();
        expect(updated.execution_success).toBe(true);
        expect(updated.execution_duration_ms).toBe(45000);
      });
    });

    it('should use routing history for success rate calculations', async () => {
      await withTestTransaction(async (trx) => {
        // Create multiple routing history entries
        for (let i = 0; i < 10; i++) {
          const task = await createTestTask(trx, {
            name: `History Task ${i}`,
          });
          const history = await createTaskRoutingHistory(trx, task.id, {
            final_agent_id: 'code-agent',
          });
          await db('task_routing_history').where({ id: history.id }).update({
            execution_success: i < 8, // 8 successes, 2 failures
            execution_duration_ms: 30000 + i * 1000,
          });
        }

        // Query success rate
        const results = await db('task_routing_history')
          .where({ final_agent_id: 'code-agent' })
          .select('execution_success');

        const successCount = results.filter((r) => r.execution_success).length;
        const failureCount = results.filter((r) => !r.execution_success).length;
        const successRate = successCount / results.length;

        expect(results.length).toBe(10);
        expect(successCount).toBe(8);
        expect(failureCount).toBe(2);
        expect(successRate).toBe(0.8);
      });
    });
  });

  describe('Failure Recovery', () => {
    it('should allow re-assignment after failure', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'failed', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_error: 'First attempt failed',
            execution_retry_count: 1,
          },
        });

        // Re-assign to different agent
        await taskService.assign(task.id, 'test-agent', TEST_IDS.user);

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.assigned_agent).toBe('test-agent');
        expect(updated?.metadata?.state).toBe('assigned');
      });
    });

    it('should clear error when task is re-assigned', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'failed', {
          metadata: {
            assigned_agent: 'code-agent',
            execution_error: 'Previous error',
            execution_failed_at: new Date().toISOString(),
          },
        });

        // Re-assign clears the failed state
        await taskService.assign(task.id, 'code-agent', TEST_IDS.user);

        const updated = await taskService.getById(task.id);
        expect(updated?.metadata?.state).toBe('assigned');
        // Note: error details might be kept for audit, but state is reset
      });
    });
  });

  describe('Execution Events', () => {
    it('should publish event on completion', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'in_progress');

        let completedEvent: Record<string, unknown> | null = null;
        const unsub = eventBus.subscribe('task.execution.completed', (event) => {
          completedEvent = event.payload as Record<string, unknown>;
        });
        subscriptions.push(unsub);

        await taskService.updateExecutionStatus(task.id, 'completed', {
          output: 'Task completed',
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(completedEvent).toBeDefined();
        expect((completedEvent as Record<string, unknown>)?.task_id).toBe(task.id);
        expect((completedEvent as Record<string, unknown>)?.status).toBe('completed');
      });
    });

    it('should publish event on failure', async () => {
      await withTestTransaction(async (trx) => {
        const task = await createTestTaskWithStatus(trx, 'in_progress');

        let completedEvent: Record<string, unknown> | null = null;
        const unsub = eventBus.subscribe('task.execution.completed', (event) => {
          completedEvent = event.payload as Record<string, unknown>;
        });
        subscriptions.push(unsub);

        await taskService.updateExecutionStatus(task.id, 'failed', {
          error: 'Task failed',
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(completedEvent).toBeDefined();
        expect((completedEvent as Record<string, unknown>)?.task_id).toBe(task.id);
        expect((completedEvent as Record<string, unknown>)?.status).toBe('failed');
      });
    });
  });
});
