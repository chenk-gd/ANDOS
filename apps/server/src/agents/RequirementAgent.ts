/**
 * RequirementAgent - AI-Native DevOps Platform
 * Specialized agent for requirement analysis and generation
 */

import { agentService, agentExecutionEngine } from '../AgentService';
import { CreateAgentInput } from '../../types/agent';

// RequirementAgent system prompt
const REQUIREMENT_AGENT_PROMPT = `You are RequirementAgent, an expert requirements analyst and specification writer.

Your responsibilities:
1. Analyze user needs and convert them into clear, actionable requirements
2. Create detailed requirement specifications following industry standards
3. Identify dependencies and relationships between requirements
4. Ensure requirements are testable, measurable, and traceable

## Output Format

When generating requirements, always provide:

\`\`\`yaml
requirement:
  id: REQ-XXX
  title: Brief title
  description: Detailed description
  type: functional|non-functional|technical|business
  priority: high|medium|low
  acceptance_criteria:
    - Criterion 1
    - Criterion 2
  dependencies:
    - REQ-YYY
  estimated_effort: story_points
\`\`\`

## Guidelines

- Use clear, unambiguous language
- Include specific acceptance criteria
- Consider edge cases and constraints
- Identify technical dependencies
- Estimate effort in story points (1, 2, 3, 5, 8, 13)

## Available Tools

- fetch_asset: Get existing requirements
- query_dag: Analyze dependency relationships
- create_requirement: Create new requirement asset
`;

// RequirementAgent configuration
export const REQUIREMENT_AGENT_CONFIG: CreateAgentInput = {
  slug: 'requirement-agent',
  name: 'RequirementAgent',
  description: 'Expert requirements analyst that converts user needs into detailed, actionable requirement specifications',
  mode: 'primary',
  capabilities: ['requirement-analysis', 'specification-writing', 'dependency-identification'],
  trigger_mode: 'manual',
  subscribed_events: ['asset.created'],
  config: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.3,
    maxTokens: 8192,
    tools: {
      fetch_asset: true,
      query_dag: true,
      create_requirement: true,
    },
    permissions: {
      read: 'allow',
      write: 'allow',
      edit: 'allow',
      bash: { 'git *': 'allow', '*': 'deny' },
    },
  },
  prompt_template: REQUIREMENT_AGENT_PROMPT,
};

/**
 * Initialize RequirementAgent
 * Creates the agent definition if it doesn't exist
 */
export async function initializeRequirementAgent(): Promise<void> {
  const existing = await agentService.getAgentBySlug(REQUIREMENT_AGENT_CONFIG.slug);

  if (!existing) {
    await agentService.createAgent(REQUIREMENT_AGENT_CONFIG);
    console.log('RequirementAgent initialized');
  }
}

/**
 * Analyze requirements from user input
 */
export async function analyzeRequirements(
  userInput: string,
  contextAssets?: string[]
): Promise<{
  requirements: Array<{
    id: string;
    title: string;
    description: string;
    type: string;
    priority: string;
    acceptance_criteria: string[];
    dependencies: string[];
    estimated_effort: number;
  }>;
  analysis: string;
}> {
  const session = await agentService.createSession({
    agent_slug: REQUIREMENT_AGENT_CONFIG.slug,
    context_assets: contextAssets || [],
  });

  const execution = await agentService.createExecution({
    execution_id: `req-analysis-${Date.now()}`,
    agent_slug: REQUIREMENT_AGENT_CONFIG.slug,
    session_id: session.session_id,
  });

  const prompt = `Analyze the following user need and generate detailed requirements:

User Input:
${userInput}

Please provide:
1. A list of clear, actionable requirements
2. Dependencies between requirements
3. Effort estimates
4. Acceptance criteria

Output the requirements in the specified YAML format.`;

  const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
    maxTokens: 8192,
    temperature: 0.3,
  });

  // Parse the YAML output (simplified - would need proper YAML parsing)
  const requirements = parseRequirementsFromOutput(result.outputs?.fetch_asset || result.reasoning || '');

  return {
    requirements,
    analysis: result.reasoning || '',
  };
}

/**
 * Generate requirement specification document
 */
export async function generateRequirementSpec(
  requirementId: string
): Promise<{
  spec: string;
  diagrams?: string[];
}> {
  const session = await agentService.createSession({
    agent_slug: REQUIREMENT_AGENT_CONFIG.slug,
    context_assets: [requirementId],
  });

  const execution = await agentService.createExecution({
    execution_id: `req-spec-${Date.now()}`,
    agent_slug: REQUIREMENT_AGENT_CONFIG.slug,
    session_id: session.session_id,
    source_asset_id: requirementId,
  });

  const prompt = `Generate a comprehensive requirement specification document for requirement ${requirementId}.

Include:
1. Executive Summary
2. Detailed Description
3. Functional Requirements
4. Non-Functional Requirements
5. User Stories
6. Acceptance Criteria
7. Dependencies and Constraints
8. Risk Analysis

Format as a professional specification document.`;

  const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
    maxTokens: 8192,
    temperature: 0.3,
  });

  return {
    spec: result.reasoning || '',
  };
}

/**
 * Parse requirements from agent output
 * (Simplified implementation - would use proper YAML parser)
 */
function parseRequirementsFromOutput(output: string): Array<any> {
  // This is a placeholder - real implementation would parse YAML
  return [];
}

// Auto-initialize on module load if in production
if (process.env.NODE_ENV === 'production') {
  initializeRequirementAgent().catch(console.error);
}
