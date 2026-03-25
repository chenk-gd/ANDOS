/**
 * TaskService - AI-Native DevOps Platform
 * Business logic for task management and review workflow
 *
 * Phase 9.4: Workflow Orchestration - Review Workflow
 */

import { db, withTransaction } from '../db/connection';
import { eventBus } from './EventBus';
import { createLogger } from '../utils/logger';
import { AssetFilter } from '../types/asset';

const logger = createLogger('TaskService');

// Task filter interface
export interface TaskFilter extends AssetFilter {
  status?: 'pending_review' | 'approved' | 'rejected' | 'modified' | 'assigned' | 'in_progress' | 'completed' | 'failed';
  task_type?: string;
  assigned_to?: string;
  priority?: 'high' | 'medium' | 'low';
}

// Review request
export interface ReviewTaskRequest {
  decision: 'approve' | 'reject' | 'modify';
  notes?: string;
  modifications?: {
    title?: string;
    description?: string;
    priority?: 'high' | 'medium' | 'low';
    assigned_agent?: string;
    acceptance_criteria?: string[];
    estimated_effort?: number;
  };
}

// Review response
export interface ReviewTaskResponse {
  task_id: string;
  decision: string;
  new_state: string;
  requires_routing: boolean;
}

// Batch review request
export interface BatchReviewRequest {
  task_ids: string[];
  decision: 'approve' | 'reject';
  notes?: string;
}

// Batch review response
export interface BatchReviewResponse {
  processed: number;
  approved: number;
  rejected: number;
  failed: number;
  errors: Array<{ task_id: string; error: string }>;
}

// Task statistics
export interface TaskStats {
  total: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  pending_review_count: number;
  assigned_to_me_count: number;
}

/**
 * TaskService - Manages task lifecycle and review workflow
 */
export class TaskService {
  /**
   * List tasks with filters
   */
  async list(filters: TaskFilter = {}): Promise<any[]> {
    const query = db('assets').where({ type: 'task' });

    if (!filters.includeDeleted) {
      query.whereNull('deleted_at');
    }

    if (filters.project_id) {
      query.where('project_id', filters.project_id);
    }

    if (filters.status) {
      query.whereRaw("metadata->>'state' = ?", [filters.status]);
    }

    if (filters.task_type) {
      query.whereRaw("metadata->>'task_type' = ?", [filters.task_type]);
    }

    if (filters.priority) {
      query.whereRaw("metadata->>'priority' = ?", [filters.priority]);
    }

    if (filters.assigned_to) {
      query.whereRaw("metadata->>'assigned_agent' = ?", [filters.assigned_to]);
    }

    if (filters.search) {
      query.where((builder) => {
        builder
          .where('name', 'ilike', `%${filters.search}%`)
          .orWhere('description', 'ilike', `%${filters.search}%`);
      });
    }

    // Default sort by priority and created date
    query.orderByRaw(
      "CASE metadata->>'priority' WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC"
    );

    return await query;
  }

  /**
   * Get task by ID
   */
  async getById(id: string): Promise<any | null> {
    const task = await db('assets')
      .where({ id, type: 'task' })
      .whereNull('deleted_at')
      .first();
    return task || null;
  }

  /**
   * Review a task (approve/reject/modify)
   */
  async review(
    taskId: string,
    userId: string,
    request: ReviewTaskRequest
  ): Promise<ReviewTaskResponse> {
    const task = await this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const currentState = task.metadata?.state;
    if (currentState !== 'pending_review') {
      throw new Error(`Task is not in pending_review state (current: ${currentState})`);
    }

    return await withTransaction(async (trx) => {
      let newState: string;
      let requiresRouting = false;

      switch (request.decision) {
        case 'approve':
          newState = 'approved';
          requiresRouting = true;
          break;
        case 'reject':
          newState = 'rejected';
          break;
        case 'modify':
          newState = 'modified';
          requiresRouting = true;
          break;
        default:
          throw new Error(`Invalid decision: ${request.decision}`);
      }

      // Build metadata updates
      const metadataUpdate: Record<string, any> = {
        ...task.metadata,
        state: newState,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_decision: request.decision,
        review_notes: request.notes || null,
      };

      // Apply modifications if any
      if (request.modifications) {
        if (request.modifications.title) {
          await trx('assets').where({ id: taskId }).update({ name: request.modifications.title });
        }
        if (request.modifications.description) {
          await trx('assets').where({ id: taskId }).update({ description: request.modifications.description });
        }
        if (request.modifications.priority) {
          metadataUpdate.priority = request.modifications.priority;
        }
        if (request.modifications.assigned_agent) {
          metadataUpdate.assigned_agent = request.modifications.assigned_agent;
        }
        if (request.modifications.acceptance_criteria) {
          metadataUpdate.acceptance_criteria = request.modifications.acceptance_criteria;
        }
        if (request.modifications.estimated_effort) {
          metadataUpdate.estimated_effort = request.modifications.estimated_effort;
        }
      }

      // Update task
      await trx('assets').where({ id: taskId }).update({
        metadata: JSON.stringify(metadataUpdate),
        updated_at: new Date(),
      });

      // Publish event
      if (requiresRouting) {
        await eventBus.publish(
          'task.approved',
          {
            task_id: taskId,
            task_type: task.metadata?.task_type,
            project_id: task.project_id,
            priority: metadataUpdate.priority,
            suggested_agent: metadataUpdate.assigned_agent,
            modified: request.decision === 'modify',
            reviewed_by: userId,
          },
          { source: 'TaskService', projectId: task.project_id, userId }
        );
      } else {
        await eventBus.publish(
          'task.rejected',
          {
            task_id: taskId,
            reason: request.notes,
            reviewed_by: userId,
          },
          { source: 'TaskService', projectId: task.project_id, userId }
        );
      }

      logger.info(`Task ${request.decision}d`, { taskId, userId, newState });

      return {
        task_id: taskId,
        decision: request.decision,
        new_state: newState,
        requires_routing: requiresRouting,
      };
    });
  }

  /**
   * Batch review tasks
   */
  async batchReview(
    userId: string,
    request: BatchReviewRequest
  ): Promise<BatchReviewResponse> {
    const result: BatchReviewResponse = {
      processed: 0,
      approved: 0,
      rejected: 0,
      failed: 0,
      errors: [],
    };

    for (const taskId of request.task_ids) {
      try {
        const response = await this.review(taskId, userId, {
          decision: request.decision as 'approve' | 'reject',
          notes: request.notes,
        });

        result.processed++;
        if (response.decision === 'approve') {
          result.approved++;
        } else {
          result.rejected++;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          task_id: taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Batch review completed', {
      processed: result.processed,
      approved: result.approved,
      rejected: result.rejected,
      failed: result.failed,
    });

    return result;
  }

  /**
   * Assign task to agent
   */
  async assign(taskId: string, agentId: string, userId?: string): Promise<void> {
    const task = await this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const metadata = {
      ...task.metadata,
      state: 'assigned',
      assigned_agent: agentId,
      assigned_at: new Date().toISOString(),
      assigned_by: userId || 'system',
    };

    await db('assets').where({ id: taskId }).update({
      metadata: JSON.stringify(metadata),
      updated_at: new Date(),
    });

    await eventBus.publish(
      'task.assigned',
      {
        task_id: taskId,
        agent_id: agentId,
        assigned_by: userId,
      },
      { source: 'TaskService' }
    );

    logger.info('Task assigned', { taskId, agentId, userId });
  }

  /**
   * Get task statistics
   */
  async getStats(projectId?: string): Promise<TaskStats> {
    const query = db('assets').where({ type: 'task' }).whereNull('deleted_at');

    if (projectId) {
      query.where({ project_id: projectId });
    }

    const tasks = await query;

    const stats: TaskStats = {
      total: tasks.length,
      by_status: {},
      by_priority: {},
      by_type: {},
      pending_review_count: 0,
      assigned_to_me_count: 0,
    };

    for (const task of tasks) {
      const status = task.metadata?.state || 'unknown';
      const priority = task.metadata?.priority || 'unknown';
      const taskType = task.metadata?.task_type || 'unknown';

      stats.by_status[status] = (stats.by_status[status] || 0) + 1;
      stats.by_priority[priority] = (stats.by_priority[priority] || 0) + 1;
      stats.by_type[taskType] = (stats.by_type[taskType] || 0) + 1;

      if (status === 'pending_review') {
        stats.pending_review_count++;
      }
    }

    return stats;
  }

  /**
   * Get tasks requiring user attention
   */
  async getAttentionRequired(userId: string, projectId?: string): Promise<{
    pending_review: any[];
    assigned_to_me: any[];
    recently_rejected: any[];
  }> {
    const result = {
      pending_review: [] as any[],
      assigned_to_me: [] as any[],
      recently_rejected: [] as any[],
    };

    // Pending review tasks
    result.pending_review = await this.list({
      status: 'pending_review',
      project_id: projectId,
    });

    // Tasks assigned to user (via user agent mapping)
    const userAgentSlug = 'user'; // Simplified - in real impl, map user to agent
    result.assigned_to_me = await this.list({
      status: 'assigned',
      assigned_to: userAgentSlug,
      project_id: projectId,
    });

    // Recently rejected tasks (for reference)
    const recentlyRejected = await db('assets')
      .where({ type: 'task' })
      .whereNull('deleted_at')
      .whereRaw("metadata->>'state' = ?", ['rejected'])
      .where('updated_at', '>', db.raw("NOW() - INTERVAL '7 days'"))
      .orderBy('updated_at', 'desc')
      .limit(10);

    result.recently_rejected = recentlyRejected;

    return result;
  }

  /**
   * Update task execution status
   */
  async updateExecutionStatus(
    taskId: string,
    status: 'in_progress' | 'completed' | 'failed',
    result?: {
      output?: string;
      artifacts?: string[];
      error?: string;
    }
  ): Promise<void> {
    const task = await this.getById(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const metadata = {
      ...task.metadata,
      state: status,
    };

    if (status === 'completed') {
      metadata.execution_completed_at = new Date().toISOString();
      metadata.execution_output = result?.output;
      metadata.execution_artifacts = result?.artifacts;
    } else if (status === 'failed') {
      metadata.execution_failed_at = new Date().toISOString();
      metadata.execution_error = result?.error;
    } else if (status === 'in_progress') {
      metadata.execution_started_at = new Date().toISOString();
    }

    await db('assets').where({ id: taskId }).update({
      metadata: JSON.stringify(metadata),
      updated_at: new Date(),
    });

    // Publish completion event
    if (status === 'completed' || status === 'failed') {
      await eventBus.publish(
        'task.execution.completed',
        {
          task_id: taskId,
          status,
          result,
        },
        { source: 'TaskService' }
      );
    }

    logger.info(`Task execution ${status}`, { taskId, status });
  }
}

// Singleton instance
export const taskService = new TaskService();
