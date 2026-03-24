/**
 * AgentService - AI-Native DevOps Platform
 * Agent management and execution framework
 */

import { db } from '../db/connection';
import {
  Agent,
  AgentSession,
  AgentExecution,
  Skill,
  AgentSkill,
  CreateAgentInput,
  CreateSessionInput,
  CreateExecutionInput,
  AgentMode,
  AgentStatus,
  ExecutionStatus,
  DEFAULT_SUBAGENT_POLICY,
  SubagentContextPolicy,
} from '../types/agent';

// Error types
export class AgentError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AgentError';
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(slug: string) {
    super(`Agent not found: ${slug}`, 'AGENT_NOT_FOUND');
    this.name = 'AgentNotFoundError';
  }
}

export class SessionNotFoundError extends AgentError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class ExecutionNotFoundError extends AgentError {
  constructor(executionId: string) {
    super(`Execution not found: ${executionId}`, 'EXECUTION_NOT_FOUND');
    this.name = 'ExecutionNotFoundError';
  }
}

/**
 * Agent Service - Manages agents, sessions, and executions
 */
export class AgentService {
  // ==================== Agent Management ====================

  /**
   * Create a new agent
   */
  async createAgent(input: CreateAgentInput): Promise<Agent> {
    // Check if slug already exists
    const existing = await this.getAgentBySlug(input.slug);
    if (existing) {
      throw new AgentError(`Agent with slug '${input.slug}' already exists`, 'AGENT_ALREADY_EXISTS');
    }

    const now = new Date();

    const [agent] = await db('agents')
      .insert({
        slug: input.slug,
        name: input.name,
        description: input.description,
        mode: input.mode || 'primary',
        capabilities: input.capabilities || [],
        trigger_mode: input.trigger_mode || 'manual',
        subscribed_events: input.subscribed_events || [],
        config: input.config || {},
        prompt_template: input.prompt_template,
        status: 'enabled',
        created_at: now,
        updated_at: now,
        created_by: input.created_by,
      })
      .returning('*');

    return agent as Agent;
  }

  /**
   * Get agent by slug
   */
  async getAgentBySlug(slug: string): Promise<Agent | null> {
    const agent = await db('agents').where({ slug }).first();
    return agent || null;
  }

  /**
   * Get agent by ID
   */
  async getAgentById(id: string): Promise<Agent | null> {
    const agent = await db('agents').where({ id }).first();
    return agent || null;
  }

  /**
   * List all agents
   */
  async listAgents(filters?: { status?: AgentStatus; mode?: AgentMode }): Promise<Agent[]> {
    const query = db('agents');

    if (filters?.status) {
      query.where('status', filters.status);
    }

    if (filters?.mode) {
      query.where('mode', filters.mode);
    }

    return await query.orderBy('updated_at', 'desc');
  }

  /**
   * Update agent
   */
  async updateAgent(slug: string, updates: Partial<CreateAgentInput>): Promise<Agent> {
    const agent = await this.getAgentBySlug(slug);
    if (!agent) {
      throw new AgentNotFoundError(slug);
    }

    const updateData: Record<string, any> = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.capabilities !== undefined) updateData.capabilities = updates.capabilities;
    if (updates.trigger_mode !== undefined) updateData.trigger_mode = updates.trigger_mode;
    if (updates.subscribed_events !== undefined) updateData.subscribed_events = updates.subscribed_events;
    if (updates.config !== undefined) updateData.config = updates.config;
    if (updates.prompt_template !== undefined) updateData.prompt_template = updates.prompt_template;

    const [updated] = await db('agents').where({ slug }).update(updateData).returning('*');
    return updated as Agent;
  }

  /**
   * Disable/Enable agent
   */
  async setAgentStatus(slug: string, status: AgentStatus): Promise<Agent> {
    const agent = await this.getAgentBySlug(slug);
    if (!agent) {
      throw new AgentNotFoundError(slug);
    }

    const [updated] = await db('agents')
      .where({ slug })
      .update({ status, updated_at: new Date() })
      .returning('*');

    return updated as Agent;
  }

  // ==================== Skill Management ====================

  /**
   * Create a skill
   */
  async createSkill(skill: Omit<Skill, 'id' | 'created_at' | 'updated_at'>): Promise<Skill> {
    const now = new Date();

    const [created] = await db('skills')
      .insert({
        ...skill,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    return created as Skill;
  }

  /**
   * Get skill by name
   */
  async getSkillByName(name: string): Promise<Skill | null> {
    const skill = await db('skills').where({ name }).first();
    return skill || null;
  }

  /**
   * List skills
   */
  async listSkills(filters?: { source?: string; status?: string }): Promise<Skill[]> {
    const query = db('skills');

    if (filters?.source) {
      query.where('source', filters.source);
    }

    if (filters?.status) {
      query.where('status', filters.status);
    }

    return await query.orderBy('name');
  }

  /**
   * Assign skill to agent
   */
  async assignSkillToAgent(agentSlug: string, skillId: string, configOverride?: Record<string, any>): Promise<AgentSkill> {
    // Verify agent exists
    const agent = await this.getAgentBySlug(agentSlug);
    if (!agent) {
      throw new AgentNotFoundError(agentSlug);
    }

    // Verify skill exists
    const skill = await db('skills').where({ id: skillId }).first();
    if (!skill) {
      throw new AgentError(`Skill not found: ${skillId}`, 'SKILL_NOT_FOUND');
    }

    const [agentSkill] = await db('agent_skills')
      .insert({
        agent_slug: agentSlug,
        skill_id: skillId,
        config_override: configOverride,
        enabled: true,
      })
      .onConflict(['agent_slug', 'skill_id'])
      .merge()
      .returning('*');

    return agentSkill as AgentSkill;
  }

  /**
   * Get agent skills
   */
  async getAgentSkills(agentSlug: string): Promise<(AgentSkill & { skill: Skill })[]> {
    const agentSkills = await db('agent_skills')
      .where({ agent_slug: agentSlug, enabled: true })
      .join('skills', 'agent_skills.skill_id', 'skills.id')
      .select('agent_skills.*', 'skills.*');

    return agentSkills.map((row) => ({
      id: row.id,
      agent_slug: row.agent_slug,
      skill_id: row.skill_id,
      config_override: row.config_override,
      enabled: row.enabled,
      skill: {
        id: row.skill_id,
        name: row.name,
        version: row.version,
        display_name: row.display_name,
        description: row.description,
        source: row.source,
        source_path: row.source_path,
        manifest: row.manifest,
        tool_definitions: row.tool_definitions,
        status: row.status,
        ineligible_reason: row.ineligible_reason,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } as Skill,
    }));
  }

  // ==================== Session Management ====================

  /**
   * Create a new session
   */
  async createSession(input: CreateSessionInput): Promise<AgentSession> {
    // Verify agent exists
    const agent = await this.getAgentBySlug(input.agent_slug);
    if (!agent) {
      throw new AgentNotFoundError(input.agent_slug);
    }

    const now = new Date();
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Get skills snapshot
    const skills = await this.getAgentSkills(input.agent_slug);
    const skillSnapshot = skills.reduce((acc, s) => {
      acc[s.skill.name] = {
        version: s.skill.version,
        config: s.config_override,
      };
      return acc;
    }, {} as Record<string, any>);

    const [session] = await db('agent_sessions')
      .insert({
        session_id: sessionId,
        agent_slug: input.agent_slug,
        parent_session_id: input.parent_session_id,
        context_assets: input.context_assets || [],
        skill_snapshot: skillSnapshot,
        status: 'active',
        turn_count: 0,
        started_at: now,
        last_active_at: now,
      })
      .returning('*');

    return session as AgentSession;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AgentSession | null> {
    const session = await db('agent_sessions').where({ session_id: sessionId }).first();
    return session || null;
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string, tokenUsed: number): Promise<void> {
    await db('agent_sessions')
      .where({ session_id: sessionId })
      .update({
        last_active_at: new Date(),
        turn_count: db.raw('turn_count + 1'),
        token_used: db.raw(`COALESCE(token_used, 0) + ${tokenUsed}`),
      });
  }

  /**
   * Complete session
   */
  async completeSession(sessionId: string): Promise<AgentSession> {
    const [session] = await db('agent_sessions')
      .where({ session_id: sessionId })
      .update({
        status: 'completed',
        completed_at: new Date(),
      })
      .returning('*');

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return session as AgentSession;
  }

  // ==================== Execution Management ====================

  /**
   * Create a new execution
   */
  async createExecution(input: CreateExecutionInput): Promise<AgentExecution> {
    // Verify agent exists
    const agent = await this.getAgentBySlug(input.agent_slug);
    if (!agent) {
      throw new AgentNotFoundError(input.agent_slug);
    }

    const now = new Date();

    const [execution] = await db('agent_executions')
      .insert({
        id: db.raw('gen_random_uuid()'),
        execution_id: input.execution_id,
        agent_slug: input.agent_slug,
        session_id: input.session_id,
        parent_execution_id: input.parent_execution_id,
        trigger_event_type: input.trigger_event_type,
        trigger_event_payload: input.trigger_event_payload,
        source_asset_id: input.source_asset_id,
        context_snapshot: input.context_snapshot,
        context_ref: input.context_ref,
        context_size: input.context_size,
        status: 'running',
        started_at: now,
      })
      .returning('*');

    return execution as AgentExecution;
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<AgentExecution | null> {
    const execution = await db('agent_executions').where({ execution_id: executionId }).first();
    return execution || null;
  }

  /**
   * Update execution status
   */
  async updateExecutionStatus(
    executionId: string,
    status: ExecutionStatus,
    updates?: {
      outputs?: Record<string, any>;
      actions?: Record<string, any>;
      confidence?: number;
      reasoning?: string;
      error_code?: string;
      error_message?: string;
    }
  ): Promise<AgentExecution> {
    const updateData: Record<string, any> = {
      status,
    };

    if (updates?.outputs !== undefined) updateData.outputs = updates.outputs;
    if (updates?.actions !== undefined) updateData.actions = updates.actions;
    if (updates?.confidence !== undefined) updateData.confidence = updates.confidence;
    if (updates?.reasoning !== undefined) updateData.reasoning = updates.reasoning;
    if (updates?.error_code !== undefined) updateData.error_code = updates.error_code;
    if (updates?.error_message !== undefined) updateData.error_message = updates.error_message;

    if (status === 'success' || status === 'failed' || status === 'cancelled') {
      updateData.completed_at = new Date();
      updateData.duration_ms = db.raw('EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000');
    }

    const [execution] = await db('agent_executions')
      .where({ execution_id: executionId })
      .update(updateData)
      .returning('*');

    if (!execution) {
      throw new ExecutionNotFoundError(executionId);
    }

    return execution as AgentExecution;
  }

  /**
   * List executions
   */
  async listExecutions(filters?: {
    agent_slug?: string;
    session_id?: string;
    status?: ExecutionStatus;
    source_asset_id?: string;
  }): Promise<AgentExecution[]> {
    const query = db('agent_executions');

    if (filters?.agent_slug) {
      query.where('agent_slug', filters.agent_slug);
    }

    if (filters?.session_id) {
      query.where('session_id', filters.session_id);
    }

    if (filters?.status) {
      query.where('status', filters.status);
    }

    if (filters?.source_asset_id) {
      query.where('source_asset_id', filters.source_asset_id);
    }

    return await query.orderBy('started_at', 'desc');
  }

  // ==================== Subagent Management ====================

  /**
   * Spawn a subagent with inherited context
   */
  async spawnSubagent(
    parentSessionId: string,
    subagentSlug: string,
    contextPolicy: Partial<SubagentContextPolicy> = {}
  ): Promise<{ session: AgentSession; execution: AgentExecution }> {
    // Get parent session
    const parentSession = await this.getSession(parentSessionId);
    if (!parentSession) {
      throw new SessionNotFoundError(parentSessionId);
    }

    // Get subagent
    const subagent = await this.getAgentBySlug(subagentSlug);
    if (!subagent) {
      throw new AgentNotFoundError(subagentSlug);
    }

    if (subagent.mode !== 'subagent') {
      throw new AgentError(`Agent ${subagentSlug} is not a subagent`, 'NOT_SUBAGENT');
    }

    // Merge policies
    const policy = { ...DEFAULT_SUBAGENT_POLICY, ...contextPolicy };

    // Create subagent session
    const session = await this.createSession({
      agent_slug: subagentSlug,
      parent_session_id: parentSessionId,
      context_assets: parentSession.context_assets,
    });

    // Create execution
    const execution = await this.createExecution({
      execution_id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      agent_slug: subagentSlug,
      session_id: session.session_id,
      context_snapshot: {
        parent_session: parentSessionId,
        policy,
        // TODO: Apply context inheritance based on policy
      },
    });

    return { session, execution };
  }
}

// Export singleton instance
export const agentService = new AgentService();

/**
 * Simple agent execution engine
 * Placeholder implementation - would integrate with actual AI execution
 */
export const agentExecutionEngine = {
  async execute(
    executionId: string,
    prompt: string,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<{ reasoning?: string; outputs?: Record<string, unknown> }> {
    // Placeholder - would call actual AI service
    return {
      reasoning: 'Placeholder execution result',
      outputs: {},
    };
  },
};
