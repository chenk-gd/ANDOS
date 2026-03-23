/**
 * Memory Types - Agent Memory System v1.5
 * Type definitions for session memory, project memory, KV memory, and memory candidates
 */

// ============================================================================
// Session Memory Types
// ============================================================================

/** Checkpoint trigger types */
export type CheckpointTrigger = 'auto' | 'manual' | 'pre_tool_call';

/** Memory level hierarchy */
export type MemoryLevel = 'session' | 'project' | 'organization';

/** Candidate status */
export type CandidateStatus = 'pending' | 'approved' | 'rejected';

/** Pattern types */
export type PatternType = 'code' | 'api' | 'error' | 'convention' | 'decision';

/** File transparency types */
export type MemoryFileType = 'PROJECT_MEMORY' | 'SESSION_SUMMARY' | 'STANDARDS';

/** Memory candidate types */
export type MemoryCandidateType = 'decision' | 'pattern' | 'error' | 'insight';

/** Tool call information */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Tool result information */
export interface ToolResult {
  call_id: string;
  output: unknown;
  error?: string;
}

/** Error information for session context */
export interface ErrorInfo {
  message: string;
  stack?: string;
  timestamp: Date;
  asset_id?: string;
}

/** Working context during session */
export interface WorkingContext {
  assets: string[];
  dependencies: string[];
  dirty_files: string[];
  recent_errors: ErrorInfo[];
}

/** Checkpoint for recovery */
export interface Checkpoint {
  id: string;
  session_id: string;
  sequence: number;
  context: WorkingContext;
  created_at: Date;
}

/** Turn in a conversation */
export interface Turn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
}

/** Session checkpoint with full state */
export interface SessionCheckpoint {
  id: string;
  session_id: string;
  sequence: number;
  state: Record<string, unknown>;
  trigger: CheckpointTrigger;
  created_at: Date;
  expires_at?: Date;
}

// ============================================================================
// KV Memory Types
// ============================================================================

/** KV Memory metadata */
export interface KVMemoryMetadata {
  namespace?: string;
  level: MemoryLevel;
  projectId?: string;
  sessionId?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  etag: string;
}

/** KV Memory entry */
export interface KVMemory<T = any> {
  key: string;
  value: T;
  metadata: KVMemoryMetadata;
}

/** KV Query options */
export interface KVQueryOptions {
  namespace?: string;
  level?: MemoryLevel;
  projectId?: string;
  sessionId?: string;
  prefix?: string;
  limit?: number;
  before?: Date;
  after?: Date;
}

// ============================================================================
// Project Memory Types
// ============================================================================

/** Code style preferences */
export interface CodeStylePreferences {
  naming_conventions: Record<string, string>;
  formatting_rules: Record<string, any>;
  language_specific: Record<string, any>;
}

/** API pattern */
export interface APIPattern {
  name: string;
  description: string;
  usage_examples: string[];
  preferred_over?: string[];
}

/** Common error pattern */
export interface CommonError {
  pattern: string;
  solution: string;
  prevention: string;
  examples: string[];
}

/** Team convention */
export interface TeamConvention {
  category: string;
  rule: string;
  rationale: string;
}

/** Architecture decision */
export interface ArchitectureDecision {
  decision: string;
  context: string;
  consequences: string[];
  date: Date;
}

/** Shared context sections */
export interface SharedContext {
  code_style_preferences?: CodeStylePreferences;
  api_patterns?: APIPattern[];
  common_errors?: CommonError[];
  team_conventions?: TeamConvention[];
  architecture_decisions?: ArchitectureDecision[];
}

/** Project memory */
export interface ProjectMemory {
  id: string;
  project_id: string;
  shared_context: SharedContext;
  version: number;
  created_at: Date;
  updated_at: Date;
}

/** Learned pattern */
export interface LearnedPattern {
  id: string;
  project_id: string;
  type: PatternType;
  name: string;
  description?: string;
  pattern: Record<string, any>;
  frequency: number;
  confidence: number;
  last_observed_at: Date;
  created_at: Date;
}

/** Project memory file */
export interface ProjectMemoryFile {
  id: string;
  project_id: string;
  file_path: string;
  file_type: MemoryFileType;
  content_hash: string;
  last_synced_at?: Date;
  last_modified_at: Date;
  created_at: Date;
}

// ============================================================================
// Memory Candidate Types
// ============================================================================

/** Memory candidate */
export interface MemoryCandidate {
  id: string;
  type: MemoryCandidateType;
  content: string;
  confidence: number;
  source: string;
  status: CandidateStatus;
  user_feedback?: string;
  created_at: Date;
  project_id?: string;
}

// ============================================================================
// MCP Tool Types
// ============================================================================

/** MCP Memory tool definition */
export interface MCPMemoryTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/** MCP Memory resource */
export interface MCPMemoryResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** MCP tool call result */
export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ============================================================================
// Agent Session Types (Extended)
// ============================================================================

/** Agent session */
export interface AgentSession {
  id: string;
  agent_slug: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  context_assets: string[];
  created_at: Date;
  updated_at: Date;
}
