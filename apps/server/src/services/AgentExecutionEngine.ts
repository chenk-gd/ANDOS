/**
 * AgentExecutionEngine - AI-Native DevOps Platform
 * Executes agent tasks with Claude API integration
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/connection';
import { agentService, AgentError } from './AgentService';
import {
  Agent,
  AgentSession,
  AgentExecution,
  Skill,
  ToolPermissions,
  ExecutionStatus,
} from '../types/agent';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Tool registry
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (params: any, context: ToolContext) => Promise<any>;
}

interface ToolContext {
  executionId: string;
  sessionId: string;
  agentSlug: string;
  userId?: string;
}

// Permission checking
function checkPermission(
  tool: string,
  params: any,
  permissions: ToolPermissions | undefined
): boolean {
  if (!permissions) return false;

  const perm = permissions[tool as keyof ToolPermissions];
  if (perm === 'allow') return true;
  if (perm === 'deny') return false;

  // Check pattern-based permissions for bash
  if (tool === 'bash' && typeof perm === 'object') {
    const command = params.command as string;
    for (const [pattern, level] of Object.entries(perm)) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      if (regex.test(command)) {
        return level === 'allow';
      }
    }
    return false;
  }

  return false;
}

/**
 * Agent Execution Engine
 */
export class AgentExecutionEngine {
  private toolRegistry: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerBuiltInTools();
  }

  /**
   * Register a tool
   */
  registerTool(tool: ToolDefinition): void {
    this.toolRegistry.set(tool.name, tool);
  }

  /**
   * Register built-in tools
   */
  private registerBuiltInTools(): void {
    // Fetch asset tool
    this.registerTool({
      name: 'fetch_asset',
      description: 'Get asset content and metadata',
      parameters: {
        type: 'object',
        properties: {
          asset_id: { type: 'string', description: 'Asset ID' },
          version: { type: 'string', description: 'Optional version' },
          format: { type: 'string', enum: ['full', 'summary', 'metadata'] },
        },
        required: ['asset_id'],
      },
      handler: async (params, context) => {
        // TODO: Implement asset fetching
        return { asset_id: params.asset_id, content: 'Asset content placeholder' };
      },
    });

    // Get design tool
    this.registerTool({
      name: 'get_design',
      description: 'Get design document for an asset',
      parameters: {
        type: 'object',
        properties: {
          asset_id: { type: 'string' },
        },
        required: ['asset_id'],
      },
      handler: async (params, context) => {
        return { design: 'Design document placeholder' };
      },
    });

    // Query DAG tool
    this.registerTool({
      name: 'query_dag',
      description: 'Query dependency graph',
      parameters: {
        type: 'object',
        properties: {
          asset_id: { type: 'string' },
          direction: { type: 'string', enum: ['upstream', 'downstream'] },
          depth: { type: 'number', default: 3 },
        },
        required: ['asset_id'],
      },
      handler: async (params, context) => {
        // TODO: Implement DAG query
        return { nodes: [], edges: [] };
      },
    });

    // Create code tool
    this.registerTool({
      name: 'create_code',
      description: 'Create code implementation',
      parameters: {
        type: 'object',
        properties: {
          asset_id: { type: 'string' },
          language: { type: 'string' },
          code: { type: 'string' },
        },
        required: ['asset_id', 'language', 'code'],
      },
      handler: async (params, context) => {
        // TODO: Implement code creation
        return { success: true, file_path: '/placeholder/path' };
      },
    });

    // Read file tool
    this.registerTool({
      name: 'read',
      description: 'Read file contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
      handler: async (params, context) => {
        // TODO: Implement file reading with permission check
        return { content: 'File content placeholder' };
      },
    });

    // Write file tool
    this.registerTool({
      name: 'write',
      description: 'Write file contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      handler: async (params, context) => {
        // TODO: Implement file writing with permission check
        return { success: true };
      },
    });

    // Bash tool
    this.registerTool({
      name: 'bash',
      description: 'Execute bash command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeout: { type: 'number', default: 30 },
        },
        required: ['command'],
      },
      handler: async (params, context) => {
        // TODO: Implement bash execution with permission check
        return { stdout: '', stderr: '', exit_code: 0 };
      },
    });
  }

  /**
   * Execute an agent task
   */
  async execute(
    executionId: string,
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      tools?: string[];
    }
  ): Promise<{
    status: ExecutionStatus;
    outputs?: Record<string, any>;
    reasoning?: string;
    tokenUsed: number;
  }> {
    // Get execution
    const execution = await agentService.getExecution(executionId);
    if (!execution) {
      throw new AgentError(`Execution not found: ${executionId}`, 'EXECUTION_NOT_FOUND');
    }

    // Get agent
    const agent = await agentService.getAgentBySlug(execution.agent_slug);
    if (!agent) {
      throw new AgentError(`Agent not found: ${execution.agent_slug}`, 'AGENT_NOT_FOUND');
    }

    // Get agent skills
    const skills = await agentService.getAgentSkills(agent.slug);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(agent, skills);

    // Get available tools
    const availableTools = this.getAvailableTools(agent.config?.permissions, options?.tools);

    try {
      // Call Claude API
      const response = await anthropic.messages.create({
        model: agent.config?.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? agent.config?.temperature ?? 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        tools: availableTools,
      });

      // Process response
      const result = await this.processResponse(response, {
        executionId,
        sessionId: execution.session_id || '',
        agentSlug: agent.slug,
      });

      // Update session activity
      if (execution.session_id) {
        await agentService.updateSessionActivity(
          execution.session_id,
          response.usage.output_tokens
        );
      }

      return {
        status: 'success',
        outputs: result.outputs,
        reasoning: result.reasoning,
        tokenUsed: response.usage.output_tokens,
      };
    } catch (error) {
      return {
        status: 'failed',
        tokenUsed: 0,
      };
    }
  }

  /**
   * Build system prompt from agent configuration
   */
  private buildSystemPrompt(agent: Agent, skills: (any & { skill: Skill })[]): string {
    let prompt = agent.prompt_template || '';

    if (!prompt) {
      prompt = `You are ${agent.name}, an AI assistant.`;
      if (agent.description) {
        prompt += `\n\n${agent.description}`;
      }
    }

    // Add skill instructions
    if (skills.length > 0) {
      prompt += '\n\n## Available Skills\n';
      for (const { skill } of skills) {
        prompt += `\n### ${skill.display_name || skill.name}\n`;
        prompt += `${skill.description}\n`;
        if (skill.tool_definitions) {
          for (const [toolName, toolDef] of Object.entries(skill.tool_definitions)) {
            prompt += `- ${toolName}: ${toolDef.description}\n`;
          }
        }
      }
    }

    return prompt;
  }

  /**
   * Get available tools based on permissions
   */
  private getAvailableTools(
    permissions: ToolPermissions | undefined,
    toolFilter?: string[]
  ): Anthropic.Tool[] {
    const tools: Anthropic.Tool[] = [];

    for (const [name, tool] of this.toolRegistry) {
      // Check if tool is filtered
      if (toolFilter && !toolFilter.includes(name)) {
        continue;
      }

      // Check permission
      if (!checkPermission(name, {}, permissions)) {
        continue;
      }

      tools.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      });
    }

    return tools;
  }

  /**
   * Process Claude API response
   */
  private async processResponse(
    response: Anthropic.Message,
    context: ToolContext
  ): Promise<{ outputs: Record<string, any>; reasoning?: string }> {
    const outputs: Record<string, any> = {};
    let reasoning = '';

    for (const content of response.content) {
      if (content.type === 'text') {
        reasoning += content.text;
      } else if (content.type === 'tool_use') {
        // Execute tool
        const tool = this.toolRegistry.get(content.name);
        if (tool) {
          const result = await tool.handler(content.input, context);
          outputs[content.name] = result;
        }
      }
    }

    return { outputs, reasoning };
  }

  /**
   * Stream execution (for real-time responses)
   */
  async *streamExecute(
    executionId: string,
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): AsyncGenerator<{
    type: 'text' | 'tool_use' | 'tool_result' | 'error';
    content?: string;
    toolName?: string;
    toolInput?: any;
    toolResult?: any;
    error?: string;
  }> {
    const execution = await agentService.getExecution(executionId);
    if (!execution) {
      yield { type: 'error', error: 'Execution not found' };
      return;
    }

    const agent = await agentService.getAgentBySlug(execution.agent_slug);
    if (!agent) {
      yield { type: 'error', error: 'Agent not found' };
      return;
    }

    const systemPrompt = this.buildSystemPrompt(agent, []);
    const availableTools = this.getAvailableTools(agent.config?.permissions);

    try {
      const stream = await anthropic.messages.create({
        model: agent.config?.model || 'claude-3-5-sonnet-20241022',
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature ?? agent.config?.temperature ?? 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        tools: availableTools,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text };
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            yield {
              type: 'tool_use',
              toolName: event.content_block.name,
              toolInput: event.content_block.input,
            };
          }
        }
      }
    } catch (error) {
      yield { type: 'error', error: (error as Error).message };
    }
  }
}

// Export singleton instance
export const agentExecutionEngine = new AgentExecutionEngine();
