/**
 * Task Fixtures - Test data factories for task workflow tests
 */

import type { Knex } from 'knex';
import { TEST_IDS } from './assets';

export type TaskStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'failed';

export type TaskType =
  | 'code_generation'
  | 'code_update'
  | 'test_generation'
  | 'test_update'
  | 'compatibility_check'
  | 'review';

export interface TaskAsset {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: 'task';
  state: TaskStatus;
  metadata: {
    task_type: TaskType;
    priority: 'high' | 'medium' | 'low';
    acceptance_criteria: string[];
    estimated_effort?: number;
    source_asset_id?: string;
    impact_asset_id?: string;
    assigned_agent?: string;
    suggested_agent?: string;
    router_recommendation?: {
      agent_id: string;
      confidence: number;
      reason: string;
    };
    reviewed_by?: string;
    reviewed_at?: string;
    review_decision?: 'approve' | 'reject' | 'modify';
    review_notes?: string;
    execution_started_at?: string;
    execution_completed_at?: string;
    execution_output?: string;
    execution_artifacts?: string[];
    execution_error?: string;
    execution_retry_count?: number;
    escalated_to_user?: boolean;
  };
  project_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create a test task input
 */
export function createTaskInput(
  overrides: Partial<TaskAsset> = {}
): Omit<TaskAsset, 'id' | 'created_at' | 'updated_at'> {
  const timestamp = Date.now();
  return {
    name: `Test Task ${timestamp}`,
    slug: `test-task-${timestamp}`,
    description: 'Test task description',
    type: 'task',
    state: 'pending_review',
    metadata: {
      task_type: 'code_generation',
      priority: 'medium',
      acceptance_criteria: ['Criterion 1', 'Criterion 2'],
      estimated_effort: 2,
      ...overrides.metadata,
    },
    project_id: TEST_IDS.project,
    ...overrides,
  };
}

/**
 * Create a test task in database
 */
export async function createTestTask(
  trx: Knex.Transaction,
  overrides: Partial<TaskAsset> = {}
): Promise<TaskAsset> {
  const input = createTaskInput(overrides);
  const now = new Date();

  const [task] = await trx('assets')
    .insert({
      ...input,
      metadata: JSON.stringify(input.metadata),
      deleted_at: null,
      created_at: now,
      updated_at: now,
    })
    .returning('*');

  return {
    ...task,
    metadata: typeof task.metadata === 'string' ? JSON.parse(task.metadata) : task.metadata,
  } as TaskAsset;
}

/**
 * Create multiple test tasks
 */
export async function createTestTasks(
  trx: Knex.Transaction,
  count: number,
  overrides: Partial<TaskAsset> = {}
): Promise<TaskAsset[]> {
  const tasks: TaskAsset[] = [];
  for (let i = 0; i < count; i++) {
    const task = await createTestTask(trx, {
      ...overrides,
      slug: `test-task-${Date.now()}-${i}`,
    });
    tasks.push(task);
  }
  return tasks;
}

/**
 * Create a task with specific status
 */
export async function createTestTaskWithStatus(
  trx: Knex.Transaction,
  status: TaskStatus,
  overrides: Partial<TaskAsset> = {}
): Promise<TaskAsset> {
  const metadata: TaskAsset['metadata'] = {
    task_type: 'code_generation',
    priority: 'medium',
    acceptance_criteria: ['Criterion 1'],
    ...overrides.metadata,
  };

  // Add status-specific metadata
  if (status === 'assigned' || status === 'in_progress' || status === 'completed' || status === 'failed') {
    metadata.assigned_agent = 'code-agent';
    metadata.assigned_at = new Date().toISOString();
  }

  if (status === 'approved' || status === 'modified') {
    metadata.reviewed_by = TEST_IDS.user;
    metadata.reviewed_at = new Date().toISOString();
    metadata.review_decision = status === 'approved' ? 'approve' : 'modify';
  }

  if (status === 'rejected') {
    metadata.reviewed_by = TEST_IDS.user;
    metadata.reviewed_at = new Date().toISOString();
    metadata.review_decision = 'reject';
  }

  if (status === 'completed') {
    metadata.execution_started_at = new Date().toISOString();
    metadata.execution_completed_at = new Date().toISOString();
    metadata.execution_output = 'Task completed successfully';
  }

  if (status === 'failed') {
    metadata.execution_started_at = new Date().toISOString();
    metadata.execution_failed_at = new Date().toISOString();
    metadata.execution_error = 'Task execution failed';
  }

  return await createTestTask(trx, {
    state: status,
    metadata,
    ...overrides,
  });
}

/**
 * Create task routing history entry
 */
export async function createTaskRoutingHistory(
  trx: Knex.Transaction,
  taskId: string,
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const [history] = await trx('task_routing_history')
    .insert({
      task_id: taskId,
      router_agent_id: 'task-router',
      strategy_used: 'typeBased',
      recommendation: JSON.stringify({
        agent_id: 'code-agent',
        confidence: 0.85,
        reason: 'Task type matches agent capabilities',
      }),
      user_overridden: false,
      final_agent_id: 'code-agent',
      ...overrides,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');

  return history;
}

/**
 * Create a dirty source with generated tasks
 */
export async function createDirtySource(
  trx: Knex.Transaction,
  assetId: string,
  upstreamAssetId: string,
  taskIds: string[] = [],
  overrides: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const [source] = await trx('dirty_sources')
    .insert({
      asset_id: assetId,
      upstream_asset_id: upstreamAssetId,
      upstream_version: 'v1.0.0',
      generated_tasks: JSON.stringify(taskIds),
      resolution_strategy: 'manual',
      status: 'pending',
      ...overrides,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('*');

  return source;
}
