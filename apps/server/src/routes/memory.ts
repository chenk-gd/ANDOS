/**
 * Memory Routes - Agent Memory System v1.5
 * REST API endpoints for session memory, project memory, and MCP memory tools
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  sessionMemoryService,
  projectMemoryService,
  mcpMemoryTools,
  autoMemoryExtractionService,
} from '../services';
import { NotFoundError, ValidationError } from '@andos/shared-errors';
import type { MemoryLevel } from '../types/memory';

// Validation schemas
const CreateCheckpointSchema = z.object({
  state: z.record(z.any()),
  trigger: z.enum(['auto', 'manual', 'pre_tool_call']).default('manual'),
});

const RestoreCheckpointSchema = z.object({
  checkpoint_id: z.string().optional(),
});

const UpdateProjectMemorySchema = z.object({
  shared_context: z.object({
    code_style_preferences: z.object({
      naming_conventions: z.record(z.string()).optional(),
      formatting_rules: z.record(z.any()).optional(),
      language_specific: z.record(z.any()).optional(),
    }).optional(),
    api_patterns: z.array(z.object({
      name: z.string(),
      description: z.string(),
      usage_examples: z.array(z.string()),
      preferred_over: z.array(z.string()).optional(),
    })).optional(),
    common_errors: z.array(z.object({
      pattern: z.string(),
      solution: z.string(),
      prevention: z.string(),
      examples: z.array(z.string()),
    })).optional(),
    team_conventions: z.array(z.object({
      category: z.string(),
      rule: z.string(),
      rationale: z.string(),
    })).optional(),
    architecture_decisions: z.array(z.object({
      decision: z.string(),
      context: z.string(),
      consequences: z.array(z.string()),
      date: z.string().optional(),
    })).optional(),
  }).optional(),
});

const MemoryRememberSchema = z.object({
  content: z.string().min(1),
  level: z.enum(['session', 'project', 'organization']),
  namespace: z.string().default('default'),
  tags: z.array(z.string()).default([]),
  project_id: z.string().optional(),
  session_id: z.string().optional(),
});

const MemoryForgetSchema = z.object({
  key: z.string(),
  level: z.enum(['session', 'project', 'organization']),
});

const MemorySearchSchema = z.object({
  query: z.string().min(1),
  level: z.enum(['session', 'project', 'organization']),
  limit: z.number().min(1).max(100).default(10),
  project_id: z.string().optional(),
  session_id: z.string().optional(),
});

const CandidateFeedbackSchema = z.object({
  action: z.enum(['approve', 'reject', 'edit']),
  edited_content: z.string().optional(),
});

// Route handlers
const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  // ============================================================================
  // Session Checkpoints
  // ============================================================================

  // POST /sessions/:sessionId/checkpoints - Create checkpoint
  fastify.post('/sessions/:sessionId/checkpoints', async (
    request: FastifyRequest<{
      Params: { sessionId: string };
      Body: { state: Record<string, any>; trigger?: 'auto' | 'manual' | 'pre_tool_call' };
    }>,
    reply: FastifyReply
  ) => {
    const { sessionId } = request.params;
    const validation = CreateCheckpointSchema.safeParse(request.body);

    if (!validation.success) {
      throw new ValidationError('Invalid request body', validation.error.format());
    }

    const { state, trigger } = validation.data;
    const checkpoint = await sessionMemoryService.createCheckpoint(sessionId, state, trigger);

    return reply.status(201).send({
      success: true,
      data: checkpoint,
    });
  });

  // GET /sessions/:sessionId/checkpoints - List checkpoints
  fastify.get('/sessions/:sessionId/checkpoints', async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ) => {
    const { sessionId } = request.params;
    const checkpoints = await sessionMemoryService.listCheckpoints(sessionId);

    return reply.send({
      success: true,
      data: checkpoints,
    });
  });

  // POST /sessions/:sessionId/restore - Restore from checkpoint
  fastify.post('/sessions/:sessionId/restore', async (
    request: FastifyRequest<{
      Params: { sessionId: string };
      Body: { checkpoint_id?: string };
    }>,
    reply: FastifyReply
  ) => {
    const { sessionId } = request.params;
    const validation = RestoreCheckpointSchema.safeParse(request.body);

    if (!validation.success) {
      throw new ValidationError('Invalid request body', validation.error.format());
    }

    let state: Record<string, any>;

    if (validation.data.checkpoint_id) {
      // Restore from specific checkpoint
      state = await sessionMemoryService.restoreFromCheckpoint(sessionId, validation.data.checkpoint_id);
    } else {
      // Restore from latest checkpoint
      const latestCheckpoint = await sessionMemoryService.getLatestCheckpoint(sessionId);
      if (!latestCheckpoint) {
        throw new NotFoundError('Checkpoint', 'latest');
      }
      state = latestCheckpoint.state;
    }

    return reply.send({
      success: true,
      data: { state },
    });
  });

  // GET /sessions/:sessionId/checkpoints/:checkpointId - Get checkpoint details
  fastify.get('/sessions/:sessionId/checkpoints/:checkpointId', async (
    request: FastifyRequest<{ Params: { sessionId: string; checkpointId: string } }>,
    reply: FastifyReply
  ) => {
    const { sessionId, checkpointId } = request.params;
    const checkpoints = await sessionMemoryService.listCheckpoints(sessionId);
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);

    if (!checkpoint) {
      throw new NotFoundError('Checkpoint', checkpointId);
    }

    return reply.send({
      success: true,
      data: checkpoint,
    });
  });

  // DELETE /sessions/:sessionId/checkpoints/:checkpointId - Delete checkpoint
  fastify.delete('/sessions/:sessionId/checkpoints/:checkpointId', async (
    request: FastifyRequest<{ Params: { sessionId: string; checkpointId: string } }>,
    reply: FastifyReply
  ) => {
    const { checkpointId } = request.params;
    await sessionMemoryService.deleteCheckpoint(checkpointId);

    return reply.send({
      success: true,
      message: 'Checkpoint deleted successfully',
    });
  });

  // ============================================================================
  // Project Memory
  // ============================================================================

  // GET /projects/:projectId/memory - Get project memory context
  fastify.get('/projects/:projectId/memory', async (
    request: FastifyRequest<{ Params: { projectId: string } }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const projectMemory = await projectMemoryService.getProjectMemory(projectId);
    const context = await projectMemoryService.getProjectContext(projectId);

    return reply.send({
      success: true,
      data: {
        ...projectMemory,
        shared_context: context,
      },
    });
  });

  // PUT /projects/:projectId/memory - Update project memory context
  fastify.put('/projects/:projectId/memory', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: { shared_context: Partial<any> };
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const validation = UpdateProjectMemorySchema.safeParse(request.body);

    if (!validation.success) {
      throw new ValidationError('Invalid request body', validation.error.format());
    }

    if (validation.data.shared_context) {
      await projectMemoryService.updateProjectContext(projectId, validation.data.shared_context);
    }

    const updatedContext = await projectMemoryService.getProjectContext(projectId);

    return reply.send({
      success: true,
      data: { shared_context: updatedContext },
    });
  });

  // GET /projects/:projectId/patterns - Get learned patterns
  fastify.get('/projects/:projectId/patterns', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Querystring: { type?: string; limit?: number };
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { type, limit = 50 } = request.query;

    const patterns = await projectMemoryService.queryPatterns(projectId, [], {
      type,
      limit: Math.min(limit, 100),
    });

    return reply.send({
      success: true,
      data: patterns,
    });
  });

  // POST /projects/:projectId/patterns - Record new pattern
  fastify.post('/projects/:projectId/patterns', async (
    request: FastifyRequest<{
      Params: { projectId: string };
      Body: {
        type: string;
        name: string;
        description?: string;
        pattern: Record<string, any>;
        frequency?: number;
        confidence?: number;
      };
    }>,
    reply: FastifyReply
  ) => {
    const { projectId } = request.params;
    const { type, name, description, pattern, frequency = 1, confidence = 1.0 } = request.body;

    if (!type || !name || !pattern) {
      throw new ValidationError('Missing required fields: type, name, pattern');
    }

    const learnedPattern = await projectMemoryService.recordPattern(projectId, {
      type: type as any,
      name,
      description,
      pattern,
      frequency,
      confidence,
      last_observed_at: new Date(),
    });

    return reply.status(201).send({
      success: true,
      data: learnedPattern,
    });
  });

  // ============================================================================
  // MCP Memory Tools
  // ============================================================================

  // POST /memory/remember - Store a memory
  fastify.post('/remember', async (
    request: FastifyRequest<{
      Body: {
        content: string;
        level: MemoryLevel;
        namespace?: string;
        tags?: string[];
        project_id?: string;
        session_id?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const validation = MemoryRememberSchema.safeParse(request.body);

    if (!validation.success) {
      throw new ValidationError('Invalid request body', validation.error.format());
    }

    const { content, level, namespace, tags, project_id, session_id } = validation.data;

    const result = await mcpMemoryTools.remember({
      content,
      level,
      namespace,
      tags,
      projectId: project_id,
      sessionId: session_id,
    });

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  // POST /memory/forget - Remove a memory
  fastify.post('/forget', async (
    request: FastifyRequest<{
      Body: { key: string; level: MemoryLevel };
    }>,
    reply: FastifyReply
  ) => {
    const validation = MemoryForgetSchema.safeParse(request.body);

    if (!validation.success) {
      throw new ValidationError('Invalid request body', validation.error.format());
    }

    const { key, level } = validation.data;

    const result = await mcpMemoryTools.forget({ key, level });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // POST /memory/search - Search memories
  fastify.post('/search', async (
    request: FastifyRequest<{
      Body: {
        query: string;
        level: MemoryLevel;
        limit?: number;
        project_id?: string;
        session_id?: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const validation = MemorySearchSchema.safeParse(request.body);

    if (!validation.success) {
      throw new ValidationError('Invalid request body', validation.error.format());
    }

    const { query, level, limit, project_id, session_id } = validation.data;

    const results = await mcpMemoryTools.search({
      query,
      level,
      limit,
      projectId: project_id,
      sessionId: session_id,
    });

    return reply.send({
      success: true,
      data: results,
    });
  });

  // GET /memory/tools - List available MCP memory tools
  fastify.get('/tools', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const tools = mcpMemoryTools.listTools();

    return reply.send({
      success: true,
      data: tools,
    });
  });

  // ============================================================================
  // Memory Candidates
  // ============================================================================

  // GET /memory/candidates - Get pending candidates
  fastify.get('/candidates', async (
    request: FastifyRequest<{
      Querystring: { status?: string; limit?: number; project_id?: string };
    }>,
    reply: FastifyReply
  ) => {
    const { status = 'pending', limit = 50, project_id } = request.query;

    const candidates = await autoMemoryExtractionService.getPendingCandidates(project_id || '');

    // Filter by status if specified
    const filteredCandidates = status === 'all'
      ? candidates
      : candidates.filter(c => c.status === status);

    return reply.send({
      success: true,
      data: filteredCandidates.slice(0, Math.min(limit, 100)),
    });
  });

  // POST /memory/candidates/:id/approve - Approve candidate
  fastify.post('/candidates/:id/approve', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    await autoMemoryExtractionService.processCandidateFeedback(id, 'approve');

    return reply.send({
      success: true,
      message: 'Candidate approved successfully',
    });
  });

  // POST /memory/candidates/:id/reject - Reject candidate
  fastify.post('/candidates/:id/reject', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    await autoMemoryExtractionService.processCandidateFeedback(id, 'reject');

    return reply.send({
      success: true,
      message: 'Candidate rejected successfully',
    });
  });

  // POST /memory/candidates/:id/edit - Edit and approve candidate
  fastify.post('/candidates/:id/edit', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { content: string };
    }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const { content } = request.body;

    if (!content) {
      throw new ValidationError('Missing required field: content');
    }

    await autoMemoryExtractionService.processCandidateFeedback(id, 'edit', content);

    return reply.send({
      success: true,
      message: 'Candidate edited and approved successfully',
    });
  });

  // ============================================================================
  // Cleanup
  // ============================================================================

  // POST /memory/cleanup - Clean up expired sessions
  fastify.post('/cleanup', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const deletedCount = await sessionMemoryService.cleanupExpiredSessions();

    return reply.send({
      success: true,
      data: { deleted_count: deletedCount },
      message: `Cleaned up ${deletedCount} expired session checkpoints`,
    });
  });
};

export default memoryRoutes;
