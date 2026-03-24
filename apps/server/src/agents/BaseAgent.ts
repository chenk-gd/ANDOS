/**
 * BaseAgent - AI-Native DevOps Platform
 * Abstract base class for all AI agents with common initialization logic
 */

import { agentService } from '../services/AgentService';
import { CreateAgentInput } from '../types/agent';

export interface AgentConfig {
  slug: string;
  name: string;
  description: string;
  mode: 'primary' | 'subagent';
  capabilities: string[];
  trigger_mode: 'event' | 'manual';
  subscribed_events?: string[];
  config: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: Record<string, boolean | Record<string, string>>;
    permissions?: Record<string, unknown>;
  };
  prompt_template: string;
}

export abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Initialize the agent if it doesn't exist
   */
  async initialize(): Promise<void> {
    const existing = await agentService.getAgentBySlug(this.config.slug);

    if (!existing) {
      const agentInput: CreateAgentInput = {
        slug: this.config.slug,
        name: this.config.name,
        description: this.config.description,
        mode: this.config.mode,
        capabilities: this.config.capabilities,
        trigger_mode: this.config.trigger_mode,
        subscribed_events: this.config.subscribed_events,
        config: this.config.config as AgentConfig['config'],
        prompt_template: this.config.prompt_template,
      };

      await agentService.createAgent(agentInput);
      // eslint-disable-next-line no-console
      console.log(`${this.config.name} initialized`);
    }
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Get agent slug
   */
  getSlug(): string {
    return this.config.slug;
  }

  /**
   * Log message with agent prefix
   */
  protected log(message: string): void {
    // TODO: Replace with proper logger when available
    // For now, only log in development
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(`[${this.config.name}] ${message}`);
    }
  }

  /**
   * Abstract method for agent-specific execution
   */
  abstract execute(input: unknown): Promise<unknown>;
}

/**
 * Auto-initialize agent helper
 */
export async function autoInitializeAgent(agent: BaseAgent): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    try {
      await agent.initialize();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // TODO: Replace with proper logger
      // eslint-disable-next-line no-console
      console.error(`Failed to initialize ${agent.getSlug()}:`, errorMessage);
    }
  }
}
