/**
 * Agent Types - AI-Native DevOps Platform
 * Based on Agent System Design v1.0
 */

// Agent types
export type AgentMode = 'primary' | 'subagent';
export type AgentStatus = 'enabled' | 'disabled';
export type AgentTriggerMode = 'event' | 'schedule' | 'manual';

// Permission levels
export type PermissionLevel = 'allow' | 'ask' | 'deny';

// Tool permissions
export interface ToolPermissions {
  read?: PermissionLevel;
  write?: PermissionLevel;
  edit?: PermissionLevel;
  bash?: PermissionLevel | Record<string, PermissionLevel>;
}

// Agent configuration
export interface AgentConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Record<string, boolean>;
  permissions?: ToolPermissions;
}

// Agent definition
export interface Agent {
  id: string;
  slug: string;
  name: string;
  description?: string;
  mode: AgentMode;

  // Capabilities
  capabilities: string[];
  trigger_mode?: AgentTriggerMode;
  subscribed_events: string[];

  // Configuration
  config: AgentConfig;
  prompt_template?: string;

  // Status
  status: AgentStatus;

  // Timestamps
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

// Skill definition (AgentSkills-compatible)
export interface Skill {
  id: string;
  name: string;
  version: string;
  display_name?: string;
  description?: string;

  // Source
  source: 'bundled' | 'managed' | 'workspace' | 'remote';
  source_path?: string;

  // Metadata for gating
  manifest?: {
    emoji?: string;
    homepage?: string;
    requires?: {
      bins?: string[];
      env?: string[];
      config?: string[];
    };
    install?: Array<{
      kind: string;
      package?: string;
    }>;
  };

  // Tool definitions (JSON Schema)
  tool_definitions?: Record<string, {
    description: string;
    parameters: Record<string, any>;
  }>;

  // Status
  status: 'active' | 'disabled' | 'ineligible';
  ineligible_reason?: string;

  created_at: Date;
  updated_at: Date;
}

// Agent-Skill association
export interface AgentSkill {
  id: string;
  agent_slug: string;
  skill_id: string;
  config_override?: Record<string, any>;
  enabled: boolean;
}

// Subagent context policy
export interface SubagentContextPolicy {
  // Permission inheritance
  permission_inheritance: 'none' | 'subset' | 'full';
  permission_override?: ToolPermissions;

  // Context inheritance
  history_inheritance: 'none' | 'summary' | 'full';
  summary_strategy?: 'lastN' | 'ai_summarize' | 'key_points';

  // Data isolation
  file_system_isolation: 'chroot' | 'workspace' | 'shared';
  env_var_inheritance: 'none' | 'whitelist' | 'full';
  env_whitelist?: string[];

  // Lifecycle limits
  max_execution_time: number; // seconds
  max_token_usage: number;
  auto_cleanup: boolean;
}

// Default subagent policy
export const DEFAULT_SUBAGENT_POLICY: SubagentContextPolicy = {
  permission_inheritance: 'subset',
  history_inheritance: 'summary',
  summary_strategy: 'ai_summarize',
  file_system_isolation: 'chroot',
  env_var_inheritance: 'whitelist',
  env_whitelist: ['NODE_ENV', 'PATH', 'HOME'],
  max_execution_time: 300, // 5 minutes
  max_token_usage: 10000,
  auto_cleanup: true,
};

// Agent Session
export interface AgentSession {
  id: string;
  session_id: string;
  agent_slug: string;
  parent_session_id?: string; // For subagent

  // Context
  context_assets: string[];
  skill_snapshot?: Record<string, any>;

  // Status
  status: 'active' | 'paused' | 'completed' | 'expired';

  // Stats
  turn_count: number;
  token_used: number;

  // Timestamps
  started_at: Date;
  last_active_at: Date;
  completed_at?: Date;

  // Storage
  transcript_path?: string;
}

// Agent Execution
export type ExecutionStatus = 'running' | 'success' | 'failed' | 'pending_approval' | 'cancelled';

export interface AgentExecution {
  id: string;
  execution_id: string;
  agent_slug: string;
  session_id?: string;
  parent_execution_id?: string; // For subagent

  // Trigger info
  trigger_event_type?: string;
  trigger_event_payload?: Record<string, any>;
  source_asset_id?: string;

  // Context
  context_snapshot?: Record<string, any>;
  context_ref?: string;
  context_size?: number;

  // Results
  status: ExecutionStatus;
  outputs?: Record<string, any>;
  actions?: Record<string, any>;
  confidence?: number;
  reasoning?: string;

  // Performance
  started_at: Date;
  completed_at?: Date;
  duration_ms?: number;
  token_used?: number;

  // Error
  error_code?: string;
  error_message?: string;
  stack_trace?: string;
}

// Create Agent input
export interface CreateAgentInput {
  slug: string;
  name: string;
  description?: string;
  mode?: AgentMode;
  capabilities?: string[];
  trigger_mode?: AgentTriggerMode;
  subscribed_events?: string[];
  config?: AgentConfig;
  prompt_template?: string;
  created_by?: string;
}

// Create Session input
export interface CreateSessionInput {
  agent_slug: string;
  parent_session_id?: string;
  context_assets?: string[];
  skill_snapshot?: Record<string, any>;
}

// Create Execution input
export interface CreateExecutionInput {
  execution_id: string;
  agent_slug: string;
  session_id?: string;
  parent_execution_id?: string;
  trigger_event_type?: string;
  trigger_event_payload?: Record<string, any>;
  source_asset_id?: string;
  context_snapshot?: Record<string, any>;
  context_ref?: string;
  context_size?: number;
}

// Agent approval
export type ApprovalDecision = 'approved' | 'rejected' | 'timeout';

export interface AgentApproval {
  id: string;
  execution_id: string;
  level: number;
  approver_id?: string;
  approver_type?: 'user' | 'system';
  decision: ApprovalDecision;
  feedback?: string;
  auto_checks?: Record<string, any>;
  created_at: Date;
  decided_at?: Date;
}
