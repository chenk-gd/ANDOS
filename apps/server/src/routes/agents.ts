/**
 * Agent Routes - AI-Native DevOps Platform
 * REST API endpoints for Agent management and execution
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { agentService, agentExecutionEngine } from '../services';
import { NotFoundError, ValidationError } from '../plugins/errorHandler';
import type { CreateAgentInput, CreateSessionInput, CreateExecutionInput } from '../types/agent';
import type { AgentStatus, AgentMode, ExecutionStatus } from '../types/agent';
import type { SubagentContextPolicy } from '../types/agent';
import type { AuthenticatedRequest } from '../types';

// Validation schemas
const CreateAgentSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  mode: z.enum(['primary', 'subagent']).optional(),
  capabilities: z.array(z.string()).optional(),
  trigger_mode: z.enum(['event', 'schedule', 'manual']).optional(),
  subscribed_events: z.array(z.string()).optional(),
  config: z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().optional(),
    tools: z.record(z.boolean()).optional(),
    permissions: z.object({
      read: z.enum(['allow', 'ask', 'deny']).optional(),
      write: z.enum(['allow', 'ask', 'deny']).optional(),
      edit: z.enum(['allow', 'ask', 'deny']).optional(),
      bash: z.union([
        z.enum(['allow', 'ask', 'deny']),
        z.record(z.enum(['allow', 'ask', 'deny'])),
      ]).optional(),
    }).optional(),
  }).optional(),
  prompt_template: z.string().optional(),
});

const CreateSessionSchema = z.object({
  agent_slug: z.string(),
  parent_session_id: z.string().optional(),
  context_assets: z.array(z.string()).optional(),
});

const ExecuteSchema = z.object({
  prompt: z.string().min(1),
  max_tokens: z.number().optional(),
  temperature: z.number().min(0).max(1).optional(),
});

// Route handlers
const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // List agents
  fastify.get('/', async (
    request: FastifyRequest<{ Querystring: { status?: AgentStatus; mode?: AgentMode } }>,
    reply: FastifyReply
  ) => {
    const { status, mode } = request.query;
    const agents = await agentService.listAgents({
      status,
      mode,
    });

    return {
      data: agents,
      meta: { total: agents.length },
    };
  });

  // Get agent by slug
  fastify.get('/:slug', async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const agent = await agentService.getAgentBySlug(slug);

    if (!agent) {
      throw new NotFoundError('Agent', slug);
    }

    return { data: agent };
  });

  // Create agent
  fastify.post('/', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const body = CreateAgentSchema.parse(request.body);
    const userId = request.user?.id || 'system';

    const input: CreateAgentInput = {
      ...body,
      created_by: userId,
    };

    const agent = await agentService.createAgent(input);

    reply.status(201);
    return { data: agent };
  });

  // Update agent
  fastify.patch('/:slug', async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const body = CreateAgentSchema.partial().parse(request.body);

    const agent = await agentService.updateAgent(slug, body);
    return { data: agent };
  });

  // Enable/Disable agent
  fastify.post('/:slug/status', async (
    request: FastifyRequest<{ Params: { slug: string }; Body: { status: AgentStatus } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const { status } = request.body;

    if (!['enabled', 'disabled'].includes(status)) {
      throw new ValidationError('Invalid status', { valid: ['enabled', 'disabled'] });
    }

    const agent = await agentService.setAgentStatus(slug, status);
    return { data: agent };
  });

  // Get agent skills
  fastify.get('/:slug/skills', async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const skills = await agentService.getAgentSkills(slug);

    return {
      data: skills,
      meta: { total: skills.length },
    };
  });

  // Assign skill to agent
  fastify.post('/:slug/skills', async (
    request: FastifyRequest<{ Params: { slug: string }; Body: { skill_id: string; config_override?: Record<string, any> } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const { skill_id, config_override } = request.body;

    const agentSkill = await agentService.assignSkillToAgent(slug, skill_id, config_override);

    reply.status(201);
    return { data: agentSkill };
  });

  // Create session
  fastify.post('/:slug/sessions', async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const body = CreateSessionSchema.omit({ agent_slug: true }).parse(request.body);

    const input: CreateSessionInput = {
      agent_slug: slug,
      ...body,
    };

    const session = await agentService.createSession(input);

    reply.status(201);
    return { data: session };
  });

  // Get session
  fastify.get('/sessions/:sessionId', async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ) => {
    const { sessionId } = request.params;
    const session = await agentService.getSession(sessionId);

    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    return { data: session };
  });

  // Complete session
  fastify.post('/sessions/:sessionId/complete', async (
    request: FastifyRequest<{ Params: { sessionId: string } }>,
    reply: FastifyReply
  ) => {
    const { sessionId } = request.params;
    const session = await agentService.completeSession(sessionId);

    return { data: session };
  });

  // Create execution
  fastify.post('/:slug/executions', async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const body = request.body as CreateExecutionInput;

    const execution = await agentService.createExecution({
      ...body,
      agent_slug: slug,
    });

    reply.status(201);
    return { data: execution };
  });

  // Execute agent
  fastify.post('/executions/:executionId/run', async (
    request: FastifyRequest<{ Params: { executionId: string } }>,
    reply: FastifyReply
  ) => {
    const { executionId } = request.params;
    const body = ExecuteSchema.parse(request.body);

    const result = await agentExecutionEngine.execute(executionId, body.prompt, {
      maxTokens: body.max_tokens,
      temperature: body.temperature,
    });

    // Update execution status
    await agentService.updateExecutionStatus(executionId, result.status, {
      outputs: result.outputs,
      reasoning: result.reasoning,
    });

    return {
      data: {
        execution_id: executionId,
        status: result.status,
        outputs: result.outputs,
        token_used: result.tokenUsed,
      },
    };
  });

  // Stream execute agent
  fastify.post('/executions/:executionId/stream', async (
    request: FastifyRequest<{ Params: { executionId: string } }>,
    reply: FastifyReply
  ) => {
    const { executionId } = request.params;
    const body = ExecuteSchema.parse(request.body);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    });

    try {
      for await (const chunk of agentExecutionEngine.streamExecute(
        executionId,
        body.prompt,
        {
          maxTokens: body.max_tokens,
          temperature: body.temperature,
        }
      )) {
        reply.raw.write(JSON.stringify(chunk) + '\n');
      }
    } finally {
      reply.raw.end();
    }
  });

  // Get execution
  fastify.get('/executions/:executionId', async (
    request: FastifyRequest<{ Params: { executionId: string } }>,
    reply: FastifyReply
  ) => {
    const { executionId } = request.params;
    const execution = await agentService.getExecution(executionId);

    if (!execution) {
      throw new NotFoundError('Execution', executionId);
    }

    return { data: execution };
  });

  // List executions
  fastify.get('/:slug/executions', async (
    request: FastifyRequest<{ Params: { slug: string }; Querystring: { status?: ExecutionStatus; session_id?: string } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const { status, session_id } = request.query;

    const executions = await agentService.listExecutions({
      agent_slug: slug,
      status,
      session_id,
    });

    return {
      data: executions,
      meta: { total: executions.length },
    };
  });

  // Spawn subagent
  fastify.post('/:slug/spawn', async (
    request: FastifyRequest<{ Params: { slug: string }; Body: { parent_session_id: string; context_policy?: SubagentContextPolicy } }>,
    reply: FastifyReply
  ) => {
    const { slug } = request.params;
    const { parent_session_id, context_policy } = request.body;

    const result = await agentService.spawnSubagent(parent_session_id, slug, context_policy);

    reply.status(201);
    return {
      data: {
        session: result.session,
        execution: result.execution,
      },
    };
  });
};

export default agentRoutes;
