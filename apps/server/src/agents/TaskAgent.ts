/**
 * TaskAgent - AI-Native DevOps Platform
 * Specialized agent for task breakdown and generation
 */

import { agentService, agentExecutionEngine } from '../services/AgentService';
import { BaseAgent, AgentConfig, autoInitializeAgent } from './BaseAgent';

// TaskAgent system prompt
const TASK_AGENT_PROMPT = `You are TaskAgent, an expert in task breakdown and project planning.

Your responsibilities:
1. Break down requirements and designs into actionable tasks
2. Estimate task effort and dependencies
3. Create task hierarchies and relationships
4. Assign tasks to appropriate teams or individuals
5. Identify risks and blockers

## Task Breakdown Process

1. **Analyze Input**: Understand requirement/design scope
2. **Identify Work Types**: Frontend, Backend, Database, DevOps, Testing
3. **Create Task Hierarchy**: Epic → Story → Task → Subtask
4. **Define Dependencies**: Identify task ordering constraints
5. **Estimate Effort**: Use story points or hours
6. **Assign Ownership**: Recommend team/skill requirements

## Output Format

\`\`\`yaml
task:
  id: TASK-XXX
  title: Task title
  description: Detailed description
  type: epic|story|task|subtask

  work_type:
    - frontend
    - backend
    - database
    - devops
    - testing
    - documentation

  acceptance_criteria:
    - Criterion 1
    - Criterion 2

  dependencies:
    - TASK-YYY

  estimate:
    story_points: 3
    hours: 8

  assignee_type: frontend-dev|backend-dev|fullstack|qa|devops

  priority: high|medium|low

  tags:
    - feature
    - bugfix
    - refactoring

  subtasks:
    - id: TASK-XXX-1
      title: Subtask title
      estimate:
        hours: 2
\`\`\`

## Effort Estimation Guidelines

Story Points:
- 1: Trivial (< 1 hour)
- 2: Simple (2-4 hours)
- 3: Medium (1-2 days)
- 5: Complex (3-5 days)
- 8: Very complex (1-2 weeks)
- 13: Requires breakdown (> 2 weeks)

Hours (when known):
- Include development time
- Include testing time
- Include code review time
- Include documentation time

## Guidelines

- Keep tasks focused and small (ideally 2-3 days max)
- Clearly define done criteria
- Identify external dependencies
- Consider non-coding tasks (docs, testing, deployment)
- Flag tasks requiring specific expertise

## Available Tools

- fetch_asset: Get requirements and designs
- query_dag: Check existing dependencies
- create_task: Create task asset
- query_team: Find available team members
`;

// TaskAgent configuration
const TASK_AGENT_CONFIG: AgentConfig = {
  slug: 'task-agent',
  name: 'TaskAgent',
  description: 'Expert task planner that breaks down requirements and designs into actionable development tasks',
  mode: 'primary',
  capabilities: ['task-breakdown', 'effort-estimation', 'dependency-analysis', 'sprint-planning'],
  trigger_mode: 'event',
  subscribed_events: ['asset.version.published'],
  config: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    maxTokens: 8192,
    tools: {
      fetch_asset: true,
      query_dag: true,
      create_task: true,
      query_team: true,
    },
    permissions: {
      read: 'allow',
      write: 'allow',
      edit: 'allow',
      bash: { 'git *': 'allow', '*': 'deny' },
    },
  },
  prompt_template: TASK_AGENT_PROMPT,
};

/**
 * TaskAgent class
 */
export class TaskAgent extends BaseAgent {
  constructor() {
    super(TASK_AGENT_CONFIG);
  }

  /**
   * Execute task breakdown
   */
  async execute(input: unknown): Promise<unknown> {
    const { sourceAssetId, options } = input as {
      sourceAssetId: string;
      options?: {
        granularity?: 'epic' | 'story' | 'task';
        maxStoryPoints?: number;
        teamCapacity?: number;
      };
    };
    return await this.breakdownIntoTasks(sourceAssetId, options);
  }

  /**
   * Break down requirement/design into tasks
   */
  async breakdownIntoTasks(
    sourceAssetId: string,
    options?: {
      granularity?: 'epic' | 'story' | 'task';
      maxStoryPoints?: number;
      teamCapacity?: number;
    }
  ): Promise<{
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      type: string;
      work_type: string[];
      acceptance_criteria: string[];
      dependencies: string[];
      estimate: {
        story_points: number;
        hours: number;
      };
      assignee_type: string;
      priority: string;
      subtasks?: unknown[];
    }>;
    summary: {
      total_tasks: number;
      total_story_points: number;
      estimated_days: number;
      work_type_breakdown: Record<string, number>;
    };
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [sourceAssetId],
    });

    const execution = await agentService.createExecution({
      execution_id: `task-breakdown-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
      source_asset_id: sourceAssetId,
      trigger_event_type: 'task.breakdown.requested',
    });

    const granularity = options?.granularity || 'task';
    const maxPoints = options?.maxStoryPoints || 13;
    const capacity = options?.teamCapacity || 5;

    const prompt = `Break down the requirement/design ${sourceAssetId} into ${granularity}-level tasks.

Constraints:
- Maximum story points per task: ${maxPoints}
- Team capacity: ${capacity} developers

Generate tasks covering:
1. Frontend implementation
2. Backend API development
3. Database schema changes
4. Testing (unit, integration, e2e)
5. Documentation
6. Deployment/DevOps

For each task provide:
- Clear title and description
- Acceptance criteria
- Estimated effort (story points + hours)
- Dependencies on other tasks
- Recommended assignee type
- Priority

Output in the specified YAML format.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 8192,
      temperature: 0.2,
    });

    // Parse tasks from output
    const tasks = parseTasksFromOutput(result.reasoning || '');

    // Calculate summary
    const summary = {
      total_tasks: tasks.length,
      total_story_points: tasks.reduce((sum, t) => sum + t.estimate.story_points, 0),
      estimated_days: Math.ceil(tasks.reduce((sum, t) => sum + t.estimate.hours, 0) / 8 / capacity),
      work_type_breakdown: tasks.reduce((acc, t) => {
        t.work_type.forEach((wt: string) => {
          acc[wt] = (acc[wt] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>),
    };

    return {
      tasks,
      summary,
    };
  }

  /**
   * Generate sprint plan from tasks
   */
  async generateSprintPlan(
    taskIds: string[],
    options: {
      sprintDuration: number;
      teamSize: number;
      velocity: number;
    }
  ): Promise<{
    sprints: Array<{
      sprint_number: number;
      tasks: string[];
      total_points: number;
      start_date: string;
      end_date: string;
    }>;
    unassigned: string[];
    risks: string[];
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: taskIds,
    });

    const execution = await agentService.createExecution({
      execution_id: `sprint-plan-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const { sprintDuration, teamSize, velocity } = options;

    const prompt = `Create a sprint plan for ${taskIds.length} tasks.

Constraints:
- Sprint duration: ${sprintDuration} weeks
- Team size: ${teamSize} developers
- Team velocity: ${velocity} story points per sprint

Tasks to schedule:
${taskIds.join('\n')}

Create a plan that:
1. Respects task dependencies (dependent tasks in later sprints)
2. Balances workload across sprints
3. Maximizes parallel work where possible
4. Identifies risks or blockers
5. Leaves buffer for unplanned work

Output sprint assignments with:
- Sprint number and dates
- Task assignments
- Total story points per sprint
- Risks identified
- Tasks that don't fit (if any)`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 8192,
      temperature: 0.2,
    });

    // Parse sprint plan
    return {
      sprints: [],
      unassigned: [],
      risks: [],
    };
  }

  /**
   * Analyze task dependencies
   */
  async analyzeTaskDependencies(
    taskIds: string[]
  ): Promise<{
    dependency_graph: {
      nodes: Array<{ id: string; title: string }>;
      edges: Array<{ from: string; to: string; type: string }>;
    };
    critical_path: string[];
    blockers: string[];
    parallel_groups: string[][];
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: taskIds,
    });

    const execution = await agentService.createExecution({
      execution_id: `dep-analysis-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const prompt = `Analyze dependencies between these tasks:

${taskIds.join('\n')}

Identify:
1. Explicit dependencies from task descriptions
2. Implicit dependencies (e.g., shared resources, technical ordering)
3. Critical path (longest dependency chain)
4. Tasks that can be done in parallel
5. Potential blockers or bottlenecks

Output dependency graph and analysis.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 4096,
      temperature: 0.2,
    });

    return {
      dependency_graph: { nodes: [], edges: [] },
      critical_path: [],
      blockers: [],
      parallel_groups: [],
    };
  }
}

// Export singleton instance
export const taskAgent = new TaskAgent();

/**
 * Initialize TaskAgent
 * Creates the agent definition if it doesn't exist
 */
export async function initializeTaskAgent(): Promise<void> {
  await taskAgent.initialize();
}

/**
 * Break down requirement/design into tasks
 * @deprecated Use taskAgent.breakdownIntoTasks() instead
 */
export async function breakdownIntoTasks(
  sourceAssetId: string,
  options?: {
    granularity?: 'epic' | 'story' | 'task';
    maxStoryPoints?: number;
    teamCapacity?: number;
  }
): Promise<{
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    work_type: string[];
    acceptance_criteria: string[];
    dependencies: string[];
    estimate: {
      story_points: number;
      hours: number;
    };
    assignee_type: string;
    priority: string;
    subtasks?: unknown[];
  }>;
  summary: {
    total_tasks: number;
    total_story_points: number;
    estimated_days: number;
    work_type_breakdown: Record<string, number>;
  };
}> {
  return await taskAgent.breakdownIntoTasks(sourceAssetId, options);
}

/**
 * Generate sprint plan from tasks
 * @deprecated Use taskAgent.generateSprintPlan() instead
 */
export async function generateSprintPlan(
  taskIds: string[],
  options: {
    sprintDuration: number;
    teamSize: number;
    velocity: number;
  }
): Promise<{
  sprints: Array<{
    sprint_number: number;
    tasks: string[];
    total_points: number;
    start_date: string;
    end_date: string;
  }>;
  unassigned: string[];
  risks: string[];
}> {
  return await taskAgent.generateSprintPlan(taskIds, options);
}

/**
 * Analyze task dependencies
 * @deprecated Use taskAgent.analyzeTaskDependencies() instead
 */
export async function analyzeTaskDependencies(
  taskIds: string[]
): Promise<{
  dependency_graph: {
    nodes: Array<{ id: string; title: string }>;
    edges: Array<{ from: string; to: string; type: string }>;
  };
  critical_path: string[];
  blockers: string[];
  parallel_groups: string[][];
}> {
  return await taskAgent.analyzeTaskDependencies(taskIds);
}

/**
 * Parse tasks from agent output
 */
function parseTasksFromOutput(output: string): Array<{
  id: string;
  title: string;
  description: string;
  type: string;
  work_type: string[];
  acceptance_criteria: string[];
  dependencies: string[];
  estimate: {
    story_points: number;
    hours: number;
  };
  assignee_type: string;
  priority: string;
  subtasks?: unknown[];
}> {
  // Placeholder - would use proper YAML parsing
  return [];
}

// Auto-initialize on module load if in production
autoInitializeAgent(taskAgent);

