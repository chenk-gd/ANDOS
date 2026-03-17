/**
 * Memory Types Unit Tests
 * Validates type definitions compile correctly
 */

import { describe, it, expect } from 'vitest';
import type {
  CheckpointTrigger,
  MemoryLevel,
  CandidateStatus,
  PatternType,
  MemoryFileType,
  MemoryCandidateType,
  SessionCheckpoint,
  Turn,
  WorkingContext,
  Checkpoint,
  ErrorInfo,
  ToolCall,
  ToolResult,
  KVMemoryMetadata,
  KVMemory,
  KVQueryOptions,
  SharedContext,
  CodeStylePreferences,
  APIPattern,
  CommonError,
  TeamConvention,
  ArchitectureDecision,
  ProjectMemory,
  LearnedPattern,
  ProjectMemoryFile,
  MemoryCandidate,
  MCPMemoryTool,
  MCPMemoryResource,
  MCPToolResult,
  AgentSession,
} from '@/types/memory';

describe('Memory Types', () => {
  describe('Type aliases', () => {
    it('CheckpointTrigger type is valid', () => {
      const triggers: CheckpointTrigger[] = ['auto', 'manual', 'pre_tool_call'];
      expect(triggers).toHaveLength(3);
    });

    it('MemoryLevel type is valid', () => {
      const levels: MemoryLevel[] = ['session', 'project', 'organization'];
      expect(levels).toHaveLength(3);
    });

    it('CandidateStatus type is valid', () => {
      const statuses: CandidateStatus[] = ['pending', 'approved', 'rejected'];
      expect(statuses).toHaveLength(3);
    });

    it('PatternType type is valid', () => {
      const patterns: PatternType[] = ['code', 'api', 'error', 'convention', 'decision'];
      expect(patterns).toHaveLength(5);
    });

    it('MemoryFileType type is valid', () => {
      const fileTypes: MemoryFileType[] = ['PROJECT_MEMORY', 'SESSION_SUMMARY', 'STANDARDS'];
      expect(fileTypes).toHaveLength(3);
    });

    it('MemoryCandidateType type is valid', () => {
      const candidateTypes: MemoryCandidateType[] = ['decision', 'pattern', 'error', 'insight'];
      expect(candidateTypes).toHaveLength(4);
    });
  });

  describe('Session Memory Types', () => {
    it('ToolCall interface compiles', () => {
      const toolCall: ToolCall = {
        id: 'tc-1',
        name: 'read_file',
        arguments: { path: '/tmp/test.txt' },
      };
      expect(toolCall.id).toBe('tc-1');
      expect(toolCall.name).toBe('read_file');
    });

    it('ToolResult interface compiles', () => {
      const toolResult: ToolResult = {
        call_id: 'tc-1',
        output: { content: 'Hello' },
        error: undefined,
      };
      expect(toolResult.call_id).toBe('tc-1');
      expect(toolResult.output).toEqual({ content: 'Hello' });
    });

    it('ErrorInfo interface compiles', () => {
      const errorInfo: ErrorInfo = {
        message: 'Something went wrong',
        stack: 'Error: ...',
        timestamp: new Date(),
        asset_id: 'asset-1',
      };
      expect(errorInfo.message).toBe('Something went wrong');
      expect(errorInfo.timestamp).toBeInstanceOf(Date);
    });

    it('WorkingContext interface compiles', () => {
      const context: WorkingContext = {
        assets: ['asset-1', 'asset-2'],
        dependencies: ['dep-1'],
        dirty_files: ['file1.ts'],
        recent_errors: [],
      };
      expect(context.assets).toHaveLength(2);
    });

    it('Checkpoint interface compiles', () => {
      const checkpoint: Checkpoint = {
        id: 'cp-1',
        session_id: 'sess-1',
        sequence: 1,
        context: {
          assets: [],
          dependencies: [],
          dirty_files: [],
          recent_errors: [],
        },
        created_at: new Date(),
      };
      expect(checkpoint.session_id).toBe('sess-1');
    });

    it('Turn interface compiles', () => {
      const turn: Turn = {
        id: 't-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      };
      expect(turn.role).toBe('user');
    });

    it('SessionCheckpoint interface compiles', () => {
      const checkpoint: SessionCheckpoint = {
        id: 'scp-1',
        session_id: 'sess-1',
        sequence: 1,
        state: { key: 'value' },
        trigger: 'manual',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
      };
      expect(checkpoint.trigger).toBe('manual');
    });
  });

  describe('KV Memory Types', () => {
    it('KVMemoryMetadata interface compiles', () => {
      const metadata: KVMemoryMetadata = {
        namespace: 'test',
        level: 'session',
        tags: ['test'],
        createdAt: new Date(),
        updatedAt: new Date(),
        etag: 'abc123',
      };
      expect(metadata.level).toBe('session');
      expect(metadata.etag).toBe('abc123');
    });

    it('KVMemory interface compiles', () => {
      const memory: KVMemory = {
        key: 'test-key',
        value: { foo: 'bar' },
        metadata: {
          level: 'project',
          createdAt: new Date(),
          updatedAt: new Date(),
          etag: 'etag1',
        },
      };
      expect(memory.key).toBe('test-key');
    });

    it('KVQueryOptions interface compiles', () => {
      const options: KVQueryOptions = {
        namespace: 'default',
        level: 'session',
        prefix: 'user/',
        limit: 10,
      };
      expect(options.prefix).toBe('user/');
    });
  });

  describe('Project Memory Types', () => {
    it('CodeStylePreferences interface compiles', () => {
      const prefs: CodeStylePreferences = {
        naming_conventions: { variable: 'camelCase' },
        formatting_rules: { indent: 2 },
        language_specific: { typescript: { strict: true } },
      };
      expect(prefs.naming_conventions.variable).toBe('camelCase');
    });

    it('APIPattern interface compiles', () => {
      const pattern: APIPattern = {
        name: 'RESTful GET',
        description: 'Standard GET request',
        usage_examples: ['fetch("/api/users")'],
      };
      expect(pattern.name).toBe('RESTful GET');
    });

    it('CommonError interface compiles', () => {
      const error: CommonError = {
        pattern: 'Null pointer',
        solution: 'Add null check',
        prevention: 'Use TypeScript strict mode',
        examples: ['if (x) x.method()'],
      };
      expect(error.pattern).toBe('Null pointer');
    });

    it('TeamConvention interface compiles', () => {
      const convention: TeamConvention = {
        category: 'naming',
        rule: 'Use PascalCase for classes',
        rationale: 'Consistency',
      };
      expect(convention.category).toBe('naming');
    });

    it('ArchitectureDecision interface compiles', () => {
      const decision: ArchitectureDecision = {
        decision: 'Use PostgreSQL',
        context: 'Need relational data',
        consequences: ['ACID compliance'],
        date: new Date(),
      };
      expect(decision.decision).toBe('Use PostgreSQL');
    });

    it('SharedContext interface compiles', () => {
      const context: SharedContext = {
        code_style_preferences: undefined,
        api_patterns: [],
        common_errors: [],
        team_conventions: [],
        architecture_decisions: [],
      };
      expect(context.api_patterns).toEqual([]);
    });

    it('ProjectMemory interface compiles', () => {
      const memory: ProjectMemory = {
        id: 'pm-1',
        project_id: 'proj-1',
        shared_context: {},
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };
      expect(memory.version).toBe(1);
    });

    it('LearnedPattern interface compiles', () => {
      const pattern: LearnedPattern = {
        id: 'lp-1',
        project_id: 'proj-1',
        type: 'code',
        name: 'Custom Hook Pattern',
        description: 'React hooks convention',
        pattern: { prefix: 'use' },
        frequency: 10,
        confidence: 0.95,
        last_observed_at: new Date(),
        created_at: new Date(),
      };
      expect(pattern.type).toBe('code');
      expect(pattern.confidence).toBe(0.95);
    });

    it('ProjectMemoryFile interface compiles', () => {
      const file: ProjectMemoryFile = {
        id: 'pmf-1',
        project_id: 'proj-1',
        file_path: '/memory/project.md',
        file_type: 'PROJECT_MEMORY',
        content_hash: 'abc123',
        last_modified_at: new Date(),
        created_at: new Date(),
      };
      expect(file.file_type).toBe('PROJECT_MEMORY');
    });
  });

  describe('Memory Candidate Types', () => {
    it('MemoryCandidate interface compiles', () => {
      const candidate: MemoryCandidate = {
        id: 'mc-1',
        type: 'insight',
        content: 'Use async/await instead of callbacks',
        confidence: 0.8,
        source: 'code_analysis',
        status: 'pending',
        created_at: new Date(),
      };
      expect(candidate.type).toBe('insight');
      expect(candidate.status).toBe('pending');
    });
  });

  describe('MCP Tool Types', () => {
    it('MCPMemoryTool interface compiles', () => {
      const tool: MCPMemoryTool = {
        name: 'memory_search',
        description: 'Search memory',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      };
      expect(tool.name).toBe('memory_search');
    });

    it('MCPMemoryResource interface compiles', () => {
      const resource: MCPMemoryResource = {
        uri: 'memory://project/patterns',
        name: 'Project Patterns',
        description: 'Learned patterns',
      };
      expect(resource.uri).toBe('memory://project/patterns');
    });

    it('MCPToolResult interface compiles', () => {
      const result: MCPToolResult = {
        success: true,
        data: { results: [] },
      };
      expect(result.success).toBe(true);
    });
  });

  describe('Agent Session Types', () => {
    it('AgentSession interface compiles', () => {
      const session: AgentSession = {
        id: 'as-1',
        agent_slug: 'code_agent',
        status: 'active',
        context_assets: ['asset-1'],
        created_at: new Date(),
        updated_at: new Date(),
      };
      expect(session.status).toBe('active');
    });
  });
});
