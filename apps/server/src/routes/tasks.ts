/**
 * Task Routes - AI-Native DevOps Platform
 * API endpoints for task management and review workflow
 *
 * Phase 9.4: Workflow Orchestration - Review Workflow
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { taskService, TaskFilter, ReviewTaskRequest, BatchReviewRequest } from '../services/TaskService';
import { requirePermission } from '../middleware/auth';
import { createLogger } from '../utils/logger';

const logger = createLogger('TaskRoutes');

/**
 * Register task routes
 */
export default async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  // List tasks
  fastify.get('/', { preHandler: requirePermission('asset:read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as TaskFilter & { project_id?: string };

      const filters: TaskFilter = {
        project_id: query.project_id,
        status: query.status,
        task_type: query.task_type,
        priority: query.priority,
        assigned_to: query.assigned_to,
        search: query.search,
        includeDeleted: query.includeDeleted === 'true',
      };

      const tasks = await taskService.list(filters);

      return reply.send({
        success: true,
        data: tasks,
        meta: {
          total: tasks.length,
        },
      });
    } catch (error) {
      logger.error('Failed to list tasks:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list tasks',
      });
    }
  });

  // Get task by ID
  fastify.get('/:id', { preHandler: requirePermission('asset:read') }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const task = await taskService.getById(id);

      if (!task) {
        return reply.status(404).send({
          success: false,
          error: 'Task not found',
        });
      }

      return reply.send({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Failed to get task:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get task',
      });
    }
  });

  // Review task (approve/reject/modify)
  fastify.post('/:id/review', { preHandler: requirePermission('asset:update') }, async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: ReviewTaskRequest;
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;
      const userId = (request as any).user?.id || 'system';

      const result = await taskService.review(id, userId, request.body);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to review task:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to review task',
      });
    }
  });

  // Batch review tasks
  fastify.post('/batch-review', { preHandler: requirePermission('asset:update') }, async (
    request: FastifyRequest<{ Body: BatchReviewRequest }>,
    reply: FastifyReply
  ) => {
    try {
      const userId = (request as any).user?.id || 'system';

      const result = await taskService.batchReview(userId, request.body);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to batch review tasks:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to batch review tasks',
      });
    }
  });

  // Assign task to agent
  fastify.post('/:id/assign', { preHandler: requirePermission('asset:update') }, async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { agent_id: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;
      const { agent_id } = request.body;
      const userId = (request as any).user?.id;

      await taskService.assign(id, agent_id, userId);

      return reply.send({
        success: true,
        message: 'Task assigned successfully',
      });
    } catch (error) {
      logger.error('Failed to assign task:', error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign task',
      });
    }
  });

  // Get task statistics
  fastify.get('/stats/overview', { preHandler: requirePermission('asset:read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { project_id?: string };
      const stats = await taskService.getStats(query.project_id);

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get task stats:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get task statistics',
      });
    }
  });

  // Get tasks requiring attention
  fastify.get('/attention/required', { preHandler: requirePermission('asset:read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user?.id || 'anonymous';
      const query = request.query as { project_id?: string };

      const attention = await taskService.getAttentionRequired(userId, query.project_id);

      return reply.send({
        success: true,
        data: attention,
      });
    } catch (error) {
      logger.error('Failed to get attention required tasks:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get attention required tasks',
      });
    }
  });

  // Get pending review tasks (convenience endpoint)
  fastify.get('/status/pending-review', { preHandler: requirePermission('asset:read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { project_id?: string };

      const tasks = await taskService.list({
        status: 'pending_review',
        project_id: query.project_id,
      });

      return reply.send({
        success: true,
        data: tasks,
        meta: {
          total: tasks.length,
          description: 'Tasks waiting for review',
        },
      });
    } catch (error) {
      logger.error('Failed to get pending review tasks:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get pending review tasks',
      });
    }
  });
}
