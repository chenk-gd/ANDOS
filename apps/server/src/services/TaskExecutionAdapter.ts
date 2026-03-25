/**
 * TaskExecutionAdapter - AI-Native DevOps Platform
 * Adapter for executing tasks via AgentExecutionEngine
 *
 * Phase 9.5: Workflow Orchestration - Delegation Execution
 */

import { eventBus, EventPayload } from './EventBus';
import { taskService } from './TaskService';
import { taskRouterAgent } from '../agents/TaskRouterAgent';
import { agentService } from './AgentService';
import { agentExecutionEngine } from './AgentExecutionEngine';
import { db } from '../db/connection';
import { createLogger } from '../utils/logger';

const logger = createLogger('TaskExecutionAdapter');

// Task execution context
interface TaskExecutionContext {
  task_id: string;
  task_type: string;
  description: string;
  acceptance_criteria: string[];
  source_asset_id?: string;
  impact_asset_id?: string;
  parent_execution_id?: string;
}

// Execution result
interface TaskExecutionResult {
  success: boolean;
  output?: string;
  artifacts?: string[];
  error?: string;
  duration_ms: number;
}

/**
 * TaskExecutionAdapter - Bridges Task workflow with Agent execution
 */
export class TaskExecutionAdapter {
  private unsubscribe?: () => void;

  /**
   * Initialize and subscribe to task.assigned events
   */
  initialize(): void {
    this.unsubscribe = eventBus.subscribe(
      'task.assigned',
      this.handleTaskAssigned.bind(this)
    );
    logger.info('TaskExecutionAdapter initialized');
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    logger.info('TaskExecutionAdapter shutdown');
  }

  /**
   * Handle task assigned event
   */
  private async handleTaskAssigned(event: EventPayload): Promise<void> {
    const { task_id, agent_slug, agent_id, auto_assigned } = event.payload as {
      task_id: string;
      agent_id: string;
      agent_slug: string;
      auto_assigned: boolean;
    };

    logger.info('Task assigned, starting execution', {
      task_id,
      agent: agent_slug,
      auto: auto_assigned,
    });

    try {
      // Update task to in_progress
      await taskService.updateExecutionStatus(task_id, 'in_progress');

      // Execute based on agent type
      const result = await this.executeTask(task_id, agent_id, agent_slug);

      // Update task with result
      if (result.success) {
        await taskService.updateExecutionStatus(task_id, 'completed', {
          output: result.output,
          artifacts: result.artifacts,
        });
      } else {
        await taskService.updateExecutionStatus(task_id, 'failed', {
          error: result.error,
        });

        // Check if retry is needed
        await this.handleExecutionFailure(task_id, result);
      }

      // Update routing history with execution result
      await taskRouterAgent.updateExecutionResult(
        task_id,
        result.success,
        result.duration_ms
      );
    } catch (error) {
      logger.error('Task execution failed:', error);
      await taskService.updateExecutionStatus(task_id, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Execute task via appropriate agent
   */
  private async executeTask(
    taskId: string,
    agentId: string,
    agentSlug: string
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    try {
      // Fetch task details
      const task = await taskService.getById(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const context: TaskExecutionContext = {
        task_id: taskId,
        task_type: task.metadata?.task_type,
        description: task.description,
        acceptance_criteria: task.metadata?.acceptance_criteria || [],
        source_asset_id: task.metadata?.parent_asset_id,
        impact_asset_id: task.metadata?.impact_asset_id,
      };

      // Route to appropriate execution handler
      switch (agentSlug) {
        case 'code-agent':
          return await this.executeWithCodeAgent(task, context, startTime);
        case 'test-agent':
          return await this.executeWithTestAgent(task, context, startTime);
        case 'user':
          // Human task - just mark as waiting for human
          return {
            success: true,
            output: 'Task assigned to user for manual execution',
            duration_ms: Date.now() - startTime,
          };
        default:
          // Generic execution via AgentExecutionEngine
          return await this.executeGeneric(task, agentId, context, startTime);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Execution failed',
        duration_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute task with CodeAgent
   */
  private async executeWithCodeAgent(
    task: any,
    context: TaskExecutionContext,
    startTime: number
  ): Promise<TaskExecutionResult> {
    logger.info('Executing with CodeAgent', { task_id: context.task_id });

    // Get or create CodeAgent
    const codeAgent = await agentService.getBySlug('code-agent');
    if (!codeAgent) {
      throw new Error('CodeAgent not found');
    }

    // Build execution request
    const executionRequest = {
      agent_id: codeAgent.id,
      session_id: `task-${context.task_id}`,
      messages: [
        {
          role: 'user',
          content: this.buildCodeAgentPrompt(context),
        },
      ],
      context: {
        task_id: context.task_id,
        task_type: context.task_type,
        source_asset: context.source_asset_id,
      },
    };

    // Execute via AgentExecutionEngine
    const execution = await agentExecutionEngine.execute(executionRequest);

    // Wait for completion (polling)
    const result = await this.waitForExecution(execution.execution_id);

    return {
      success: result.status === 'completed',
      output: result.output,
      artifacts: result.artifacts,
      error: result.error,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Execute task with TestAgent
   */
  private async executeWithTestAgent(
    task: any,
    context: TaskExecutionContext,
    startTime: number
  ): Promise<TaskExecutionResult> {
    logger.info('Executing with TestAgent', { task_id: context.task_id });

    const testAgent = await agentService.getBySlug('test-agent');
    if (!testAgent) {
      throw new Error('TestAgent not found');
    }

    const executionRequest = {
      agent_id: testAgent.id,
      session_id: `task-${context.task_id}`,
      messages: [
        {
          role: 'user',
          content: this.buildTestAgentPrompt(context),
        },
      ],
      context: {
        task_id: context.task_id,
        task_type: context.task_type,
        source_asset: context.source_asset_id,
      },
    };

    const execution = await agentExecutionEngine.execute(executionRequest);
    const result = await this.waitForExecution(execution.execution_id);

    return {
      success: result.status === 'completed',
      output: result.output,
      artifacts: result.artifacts,
      error: result.error,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Generic execution for other agent types
   */
  private async executeGeneric(
    task: any,
    agentId: string,
    context: TaskExecutionContext,
    startTime: number
  ): Promise<TaskExecutionResult> {
    logger.info('Executing with generic agent', {
      task_id: context.task_id,
      agent_id: agentId,
    });

    const executionRequest = {
      agent_id: agentId,
      session_id: `task-${context.task_id}`,
      messages: [
        {
          role: 'user',
          content: this.buildGenericPrompt(context),
        },
      ],
      context: {
        task_id: context.task_id,
        task_type: context.task_type,
      },
    };

    const execution = await agentExecutionEngine.execute(executionRequest);
    const result = await this.waitForExecution(execution.execution_id);

    return {
      success: result.status === 'completed',
      output: result.output,
      artifacts: result.artifacts,
      error: result.error,
      duration_ms: Date.now() - startTime,
    };
  }

  /**
   * Wait for execution to complete
   */
  private async waitForExecution(
    executionId: string,
    timeoutMs: number = 300000 // 5 minutes
  ): Promise<{
    status: 'completed' | 'failed' | 'timeout';
    output?: string;
    artifacts?: string[];
    error?: string;
  }> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeoutMs) {
      const execution = await db('agent_executions')
        .where({ execution_id: executionId })
        .first();

      if (!execution) {
        return { status: 'failed', error: 'Execution not found' };
      }

      if (execution.status === 'completed') {
        return {
          status: 'completed',
          output: execution.response_content,
          artifacts: execution.artifacts,
        };
      }

      if (execution.status === 'failed') {
        return {
          status: 'failed',
          error: execution.error_message || 'Execution failed',
        };
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return { status: 'timeout', error: 'Execution timed out' };
  }

  /**
   * Handle execution failure
   */
  private async handleExecutionFailure(
    taskId: string,
    result: TaskExecutionResult
  ): Promise<void> {
    logger.warn('Task execution failed', { task_id: taskId, error: result.error });

    // Get task retry count
    const task = await taskService.getById(taskId);
    const retryCount = task.metadata?.execution_retry_count || 0;
    const maxRetries = 2;

    if (retryCount < maxRetries) {
      // Increment retry count and re-queue
      await db('assets')
        .where({ id: taskId })
        .update({
          metadata: db.raw(`metadata || '{"execution_retry_count": ${retryCount + 1}}'::jsonb`),
          state: 'assigned', // Reset to assigned for retry
        });

      logger.info('Task queued for retry', { task_id: taskId, retry: retryCount + 1 });
    } else {
      // Max retries reached - escalate to user
      await db('assets')
        .where({ id: taskId })
        .update({
          metadata: db.raw(`metadata || '{"escalated_to_user": true}'::jsonb`),
        });

      // Create notification for user
      await eventBus.publish(
        'task.escalated',
        {
          task_id: taskId,
          reason: result.error,
          retry_count: retryCount,
        },
        { source: 'TaskExecutionAdapter' }
      );

      logger.info('Task escalated to user after max retries', { task_id: taskId });
    }
  }

  /**
   * Build CodeAgent prompt
   */
  private buildCodeAgentPrompt(context: TaskExecutionContext): string {
    return `Task: ${context.description}

Task Type: ${context.task_type}
Task ID: ${context.task_id}

Acceptance Criteria:
${context.acceptance_criteria.map((c) => `- ${c}`).join('\n')}

${context.source_asset_id ? `Source Asset: ${context.source_asset_id}` : ''}
${context.impact_asset_id ? `Impact Asset: ${context.impact_asset_id}` : ''}

Please execute this task and provide:
1. Generated code files
2. Test files
3. Summary of changes
4. Any dependencies or considerations`;
  }

  /**
   * Build TestAgent prompt
   */
  private buildTestAgentPrompt(context: TaskExecutionContext): string {
    return `Task: ${context.description}

Task Type: ${context.task_type}
Task ID: ${context.task_id}

Acceptance Criteria:
${context.acceptance_criteria.map((c) => `- ${c}`).join('\n')}

${context.source_asset_id ? `Source Asset: ${context.source_asset_id}` : ''}
${context.impact_asset_id ? `Impact Asset: ${context.impact_asset_id}` : ''}

Please generate comprehensive tests including:
1. Unit tests
2. Integration tests
3. Edge cases
4. Test coverage report`;
  }

  /**
   * Build generic agent prompt
   */
  private buildGenericPrompt(context: TaskExecutionContext): string {
    return `Task: ${context.description}

Task Type: ${context.task_type}
Task ID: ${context.task_id}

Acceptance Criteria:
${context.acceptance_criteria.map((c) => `- ${c}`).join('\n')}

Please execute this task according to the acceptance criteria.`;
  }
}

// Singleton instance
export const taskExecutionAdapter = new TaskExecutionAdapter();

// Initialize on module load (if not in test environment)
if (process.env.NODE_ENV !== 'test') {
  taskExecutionAdapter.initialize();
}
