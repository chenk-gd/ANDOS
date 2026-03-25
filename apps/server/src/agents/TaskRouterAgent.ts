/**
 * TaskRouterAgent - AI-Native DevOps Platform
 * Intelligent task routing to optimal agents
 *
 * Phase 9.3: Workflow Orchestration - Task Routing
 */

import { eventBus, EventPayload } from '../services/EventBus';
import { db } from '../db/connection';
import { createLogger } from '../utils/logger';

const logger = createLogger('TaskRouterAgent');

// Routing strategies
export type RoutingStrategy = 'type_based' | 'load_aware' | 'success_rate' | 'user_preference';

// Task types that can be routed
export type RoutableTaskType =
  | 'code_generation'
  | 'code_update'
  | 'test_generation'
  | 'test_update'
  | 'compatibility_check'
  | 'review';

// Agent capabilities
interface AgentCapability {
  agent_id: string;
  agent_slug: string;
  supported_tasks: RoutableTaskType[];
  current_load: number;
  max_concurrent: number;
  success_rate: number;
  avg_execution_time: number;
  status: 'available' | 'busy' | 'offline';
}

// Routing recommendation
interface RoutingRecommendation {
  agent_id: string;
  agent_slug: string;
  confidence: number;
  reason: string;
  alternatives: string[];
  estimated_wait_time?: number;
}

// Routing request
interface RouteTaskRequest {
  task_id: string;
  task_type: RoutableTaskType;
  project_id: string;
  priority: 'high' | 'medium' | 'low';
  suggested_agent?: string; // From TaskGeneratorAgent
  context?: {
    urgency?: 'high' | 'normal' | 'low';
    user_preference?: string;
    required_capabilities?: string[];
  };
}

// Routing result
interface RoutingResult {
  task_id: string;
  recommendation: RoutingRecommendation;
  user_override?: {
    agent_id: string;
    reason: string;
  };
  final_assignment: string;
  strategy_used: RoutingStrategy;
  requires_confirmation: boolean;
}

// Routing history record
interface TaskRoutingHistory {
  id: string;
  task_id: string;
  router_agent_id: string;
  strategy_used: RoutingStrategy;
  recommendation: RoutingRecommendation;
  user_overridden: boolean;
  override_reason?: string;
  final_agent_id: string;
  execution_success?: boolean;
  execution_duration_ms?: number;
  created_at: Date;
}

// Type-based routing map
const TYPE_BASED_ROUTING: Record<RoutableTaskType, string> = {
  code_generation: 'code-agent',
  code_update: 'code-agent',
  test_generation: 'test-agent',
  test_update: 'test-agent',
  compatibility_check: 'compatibility-agent',
  review: 'user', // Human review
};

/**
 * TaskRouterAgent - Routes tasks to optimal agents
 */
export class TaskRouterAgent {
  private strategies: RoutingStrategy[];
  private agentCapabilities: Map<string, AgentCapability>;
  private unsubscribe?: () => void;

  constructor(strategies: RoutingStrategy[] = ['type_based']) {
    this.strategies = strategies;
    this.agentCapabilities = new Map();
  }

  /**
   * Initialize and subscribe to events
   */
  initialize(): void {
    this.unsubscribe = eventBus.subscribe(
      'task.approved',
      this.handleTaskApproved.bind(this)
    );
    logger.info('TaskRouterAgent initialized', { strategies: this.strategies });
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    logger.info('TaskRouterAgent shutdown');
  }

  /**
   * Handle task approved event
   */
  private async handleTaskApproved(event: EventPayload): Promise<void> {
    try {
      const { task_id, task_type, project_id, priority, suggested_agent } =
        event.payload as RouteTaskRequest;

      logger.info('Task approved, routing', { task_id, task_type });

      const result = await this.route({
        task_id,
        task_type,
        project_id,
        priority,
        suggested_agent,
      });

      // If high confidence and no user preference, auto-assign
      if (!result.requires_confirmation) {
        await this.assignTask(result);
      } else {
        logger.info('Routing requires user confirmation', {
          task_id,
          recommendation: result.recommendation.agent_slug,
        });
      }
    } catch (error) {
      logger.error('Failed to route task:', error);
    }
  }

  /**
   * Route a task to optimal agent
   */
  async route(request: RouteTaskRequest): Promise<RoutingResult> {
    const { task_id, task_type, suggested_agent } = request;

    logger.debug('Routing task', { task_id, task_type });

    // Try strategies in order
    let recommendation: RoutingRecommendation | null = null;
    let strategyUsed: RoutingStrategy = 'type_based';

    for (const strategy of this.strategies) {
      recommendation = await this.applyStrategy(strategy, request);
      if (recommendation) {
        strategyUsed = strategy;
        break;
      }
    }

    // Fallback to type-based if no recommendation
    if (!recommendation) {
      recommendation = await this.applyStrategy('type_based', request);
      strategyUsed = 'type_based';
    }

    // Check if TaskGenerator suggestion matches
    const requiresConfirmation = this.shouldRequireConfirmation(
      recommendation,
      suggested_agent
    );

    return {
      task_id,
      recommendation,
      final_assignment: recommendation.agent_id,
      strategy_used: strategyUsed,
      requires_confirmation: requiresConfirmation,
    };
  }

  /**
   * Apply routing strategy
   */
  private async applyStrategy(
    strategy: RoutingStrategy,
    request: RouteTaskRequest
  ): Promise<RoutingRecommendation | null> {
    switch (strategy) {
      case 'type_based':
        return this.routeByType(request);
      case 'load_aware':
        return this.routeByLoad(request);
      case 'success_rate':
        return this.routeBySuccessRate(request);
      case 'user_preference':
        return this.routeByUserPreference(request);
      default:
        return null;
    }
  }

  /**
   * Route by task type (default strategy)
   */
  private async routeByType(
    request: RouteTaskRequest
  ): Promise<RoutingRecommendation | null> {
    const { task_type, suggested_agent } = request;

    const targetAgentSlug = TYPE_BASED_ROUTING[task_type];
    if (!targetAgentSlug) {
      return null;
    }

    // Fetch agent details from database
    const agent = await db('agents').where({ slug: targetAgentSlug }).first();
    if (!agent) {
      logger.warn('Target agent not found', { slug: targetAgentSlug });
      return null;
    }

    // Check if suggestion matches
    let confidence = 0.9;
    let reason = `Task type '${task_type}' maps to ${targetAgentSlug}`;

    if (suggested_agent && suggested_agent !== targetAgentSlug) {
      if (suggested_agent === 'user') {
        confidence = 0.7;
        reason += ' (override: user review suggested)';
      } else {
        confidence = 0.8;
        reason += ` (TaskGenerator suggested ${suggested_agent})`;
      }
    }

    return {
      agent_id: agent.id,
      agent_slug: targetAgentSlug,
      confidence,
      reason,
      alternatives: this.getAlternativeAgents(task_type, targetAgentSlug),
    };
  }

  /**
   * Route by agent load (future implementation)
   */
  private async routeByLoad(
    request: RouteTaskRequest
  ): Promise<RoutingRecommendation | null> {
    // TODO: Implement load-aware routing
    // - Check current agent queue depths
    // - Calculate estimated wait times
    // - Select agent with shortest queue that can handle task
    logger.debug('Load-aware routing not yet implemented');
    return null;
  }

  /**
   * Route by historical success rate (future implementation)
   */
  private async routeBySuccessRate(
    request: RouteTaskRequest
  ): Promise<RoutingRecommendation | null> {
    // TODO: Implement success-rate-based routing
    // - Query task_routing_history for success rates
    // - Prefer agents with higher success rates for this task type
    logger.debug('Success-rate routing not yet implemented');
    return null;
  }

  /**
   * Route by user preference (future implementation)
   */
  private async routeByUserPreference(
    request: RouteTaskRequest
  ): Promise<RoutingRecommendation | null> {
    // TODO: Implement user preference routing
    // - Check user settings for preferred agents
    // - Respect user override suggestions
    logger.debug('User-preference routing not yet implemented');
    return null;
  }

  /**
   * Get alternative agents for a task type
   */
  private getAlternativeAgents(
    taskType: RoutableTaskType,
    primaryAgent: string
  ): string[] {
    const alternatives: string[] = [];

    // Code-related tasks can fall back to other code agents
    if (['code_generation', 'code_update'].includes(taskType)) {
      alternatives.push('user'); // Human fallback
    }

    // Test-related tasks
    if (['test_generation', 'test_update'].includes(taskType)) {
      alternatives.push('code-agent'); // Code agent can do basic tests
      alternatives.push('user');
    }

    return alternatives.filter((a) => a !== primaryAgent);
  }

  /**
   * Determine if user confirmation is required
   */
  private shouldRequireConfirmation(
    recommendation: RoutingRecommendation,
    suggestedAgent?: string
  ): boolean {
    // High confidence (>0.85) auto-assign
    if (recommendation.confidence >= 0.85) {
      return false;
    }

    // Medium confidence with matching suggestion
    if (recommendation.confidence >= 0.7 && suggestedAgent === recommendation.agent_slug) {
      return false;
    }

    // Low confidence or mismatch requires confirmation
    return true;
  }

  /**
   * Assign task to agent
   */
  private async assignTask(result: RoutingResult): Promise<void> {
    const { task_id, final_assignment, recommendation, user_override } = result;

    // Update task in database
    await db('assets')
      .where({ id: task_id })
      .update({
        metadata: db.raw(
          `metadata || '{"assigned_agent": "${final_assignment}", "state": "assigned"}'::jsonb`
        ),
        updated_at: new Date(),
      });

    // Record routing history
    await this.recordRoutingHistory({
      id: await this.generateId(),
      task_id,
      router_agent_id: 'task-router-agent',
      strategy_used: result.strategy_used,
      recommendation,
      user_overridden: !!user_override,
      override_reason: user_override?.reason,
      final_agent_id: final_assignment,
      created_at: new Date(),
    });

    // Publish assignment event
    await eventBus.publish(
      'task.assigned',
      {
        task_id,
        agent_id: final_assignment,
        agent_slug: recommendation.agent_slug,
        auto_assigned: !user_override,
      },
      { source: 'TaskRouterAgent' }
    );

    logger.info('Task assigned', {
      task_id,
      agent: recommendation.agent_slug,
      auto: !user_override,
    });
  }

  /**
   * User confirms or overrides routing recommendation
   */
  async confirmRoute(
    taskId: string,
    agentId: string,
    overrideReason?: string
  ): Promise<RoutingResult> {
    // Fetch task details
    const task = await db('assets').where({ id: taskId, type: 'task' }).first();
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Get recommendation (for history)
    const recommendation: RoutingRecommendation = {
      agent_id: agentId,
      agent_slug: task.metadata?.suggested_agent || 'unknown',
      confidence: overrideReason ? 0.5 : 0.9,
      reason: overrideReason || 'User confirmed',
      alternatives: [],
    };

    const result: RoutingResult = {
      task_id: taskId,
      recommendation,
      user_override: overrideReason
        ? { agent_id: agentId, reason: overrideReason }
        : undefined,
      final_assignment: agentId,
      strategy_used: 'user_preference',
      requires_confirmation: false,
    };

    await this.assignTask(result);
    return result;
  }

  /**
   * Record routing history
   */
  private async recordRoutingHistory(
    record: TaskRoutingHistory
  ): Promise<void> {
    try {
      await db('task_routing_history').insert({
        id: record.id,
        task_id: record.task_id,
        router_agent_id: record.router_agent_id,
        strategy_used: record.strategy_used,
        recommendation: JSON.stringify(record.recommendation),
        user_overridden: record.user_overridden,
        override_reason: record.override_reason,
        final_agent_id: record.final_agent_id,
        created_at: record.created_at,
      });
    } catch (error) {
      logger.error('Failed to record routing history:', error);
    }
  }

  /**
   * Update routing history with execution result
   */
  async updateExecutionResult(
    taskId: string,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    try {
      await db('task_routing_history')
        .where({ task_id: taskId })
        .orderBy('created_at', 'desc')
        .limit(1)
        .update({
          execution_success: success,
          execution_duration_ms: durationMs,
        });
    } catch (error) {
      logger.error('Failed to update execution result:', error);
    }
  }

  /**
   * Get routing statistics
   */
  async getStats(): Promise<{
    total_routed: number;
    by_strategy: Record<string, number>;
    override_rate: number;
    avg_execution_time: number;
  }> {
    const stats = await db('task_routing_history')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('SUM(CASE WHEN user_overridden THEN 1 ELSE 0 END) as overrides'),
        db.raw('AVG(execution_duration_ms) as avg_duration')
      )
      .first();

    const byStrategy = await db('task_routing_history')
      .select('strategy_used')
      .count('* as count')
      .groupBy('strategy_used');

    return {
      total_routed: parseInt(stats?.total || '0'),
      by_strategy: Object.fromEntries(
        byStrategy.map((s) => [s.strategy_used, parseInt(s.count as string)])
      ),
      override_rate:
        parseInt(stats?.total || '0') > 0
          ? parseInt(stats?.overrides || '0') / parseInt(stats?.total || '1')
          : 0,
      avg_execution_time: parseFloat(stats?.avg_duration || '0'),
    };
  }

  /**
   * Generate unique ID
   */
  private async generateId(): Promise<string> {
    const result = await db.raw('SELECT gen_random_uuid() as id');
    return result.rows[0].id;
  }
}

// Singleton instance
export const taskRouterAgent = new TaskRouterAgent(['type_based']);

// Initialize on module load (if not in test environment)
if (process.env.NODE_ENV !== 'test') {
  taskRouterAgent.initialize();
}
