/**
 * FileTransparencyService Tests
 * Tests for bidirectional sync between database and Markdown files
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProjectMemory, SharedContext, LearnedPattern } from '../../../src/types/memory';

// Create mock storage with vi.hoisted for proper sharing
const { mockFiles, mockDirs, mockProjectMemory, mockPatterns } = vi.hoisted(() => {
  const mockProjectMemory: ProjectMemory = {
    id: 'mem-123',
    project_id: 'proj-123',
    version: 5,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-15T10:30:00Z'),
    shared_context: {
      code_style_preferences: {
        naming_conventions: {
          variables: 'camelCase',
          classes: 'PascalCase',
          constants: 'UPPER_SNAKE_CASE',
        },
        formatting_rules: {
          indent_size: 2,
          max_line_length: 100,
          semicolons: true,
        },
        language_specific: {
          typescript: {
            strict_null_checks: true,
            no_implicit_any: true,
          },
        },
      },
      api_patterns: [
        {
          name: 'Repository Pattern',
          description: 'Use repository pattern for data access layer',
          usage_examples: ['UserRepository.findById()', 'OrderRepository.save()'],
          preferred_over: ['Direct database queries'],
        },
      ],
      common_errors: [
        {
          pattern: 'Null reference in async operations',
          solution: 'Always check for null before accessing nested properties',
          prevention: 'Use optional chaining and nullish coalescing',
          examples: ['const name = user?.profile?.name ?? "Anonymous"'],
        },
      ],
      team_conventions: [
        {
          category: 'Git',
          rule: 'Use conventional commits format',
          rationale: 'Enables automated changelog generation',
        },
      ],
      architecture_decisions: [
        {
          decision: 'Use PostgreSQL with ltree for hierarchical data',
          context: 'Need to support org hierarchies and asset trees',
          consequences: ['Efficient tree queries', 'Requires PostgreSQL-specific features'],
          date: new Date('2024-01-10'),
        },
      ],
    },
  };

  const mockPatterns: LearnedPattern[] = [
    {
      id: 'pat-1',
      project_id: 'proj-123',
      type: 'code',
      name: 'error-handling-pattern',
      description: 'Standard error handling pattern',
      pattern: { tryCatch: true, logErrors: true },
      frequency: 15,
      confidence: 0.92,
      last_observed_at: new Date('2024-01-14T08:00:00Z'),
      created_at: new Date('2024-01-05T10:00:00Z'),
    },
    {
      id: 'pat-2',
      project_id: 'proj-123',
      type: 'api',
      name: 'rest-api-pattern',
      description: 'RESTful API design pattern',
      pattern: { method: 'GET', version: 'v1' },
      frequency: 8,
      confidence: 0.85,
      last_observed_at: new Date('2024-01-13T14:00:00Z'),
      created_at: new Date('2024-01-06T09:00:00Z'),
    },
  ];

  return {
    mockFiles: new Map<string, string>(),
    mockDirs: new Set<string>(),
    mockProjectMemory,
    mockPatterns,
  };
});

// Mock fs module - hoisted to top of file
vi.mock('fs', async () => {
  return {
    promises: {
      mkdir: vi.fn(async (filepath: string) => {
        mockDirs.add(filepath as string);
        return undefined;
      }),
      writeFile: vi.fn(async (filepath: string, content: string) => {
        mockFiles.set(filepath as string, content);
        return undefined;
      }),
      readFile: vi.fn(async (filepath: string) => {
        if (!mockFiles.has(filepath as string)) {
          const error = new Error(`ENOENT: no such file or directory, open '${filepath}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
        return mockFiles.get(filepath as string)!;
      }),
      access: vi.fn(async (filepath: string) => {
        if (!mockFiles.has(filepath as string)) {
          const error = new Error(`ENOENT: no such file or directory, access '${filepath}'`);
          (error as any).code = 'ENOENT';
          throw error;
        }
      }),
    },
  };
});

vi.mock('../../../src/services/ProjectMemoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/ProjectMemoryService')>();
  return {
    ...actual,
    projectMemoryService: {
      getProjectMemory: vi.fn(),
      getProjectPatterns: vi.fn(),
      updateProjectContext: vi.fn(),
    },
  };
});

// Import after mocks
import {
  FileTransparencyService,
  DEFAULT_TRANSPARENCY_CONFIG,
  TransparencyConfig,
} from '../../../src/services/FileTransparencyService';
import { projectMemoryService } from '../../../src/services/ProjectMemoryService';

describe('FileTransparencyService', () => {
  let service: FileTransparencyService;

  beforeEach(() => {
    mockFiles.clear();
    mockDirs.clear();
    // Set up mock return values
    vi.mocked(projectMemoryService.getProjectMemory).mockResolvedValue(mockProjectMemory);
    vi.mocked(projectMemoryService.getProjectPatterns).mockResolvedValue(mockPatterns);
    vi.mocked(projectMemoryService.updateProjectContext).mockResolvedValue();
    service = new FileTransparencyService();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const defaultService = new FileTransparencyService();
      expect(defaultService).toBeDefined();
    });

    it('should accept custom config', () => {
      const customConfig: TransparencyConfig = {
        outputDir: 'custom/output',
        autoExport: {
          onSessionEnd: false,
          onPatternLearned: true,
        },
      };
      const customService = new FileTransparencyService(customConfig);
      expect(customService).toBeDefined();
    });
  });

  describe('exportProjectMemory', () => {
    it('should export project memory to PROJECT_MEMORY.md', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';

      await service.exportProjectMemory(projectId, projectRoot);

      const expectedPath = '/test/project/.andos/memory/PROJECT_MEMORY.md';
      expect(mockFiles.has(expectedPath)).toBe(true);

      const content = mockFiles.get(expectedPath)!;
      expect(content).toContain('# Project Memory: proj-123');
      expect(content).toContain('Version: 5');
      expect(content).toContain('## Code Style Preferences');
      expect(content).toContain('### Naming Conventions');
      expect(content).toContain('variables: camelCase');
    });

    it('should create directories recursively', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';

      await service.exportProjectMemory(projectId, projectRoot);

      expect(mockDirs.has('/test/project/.andos/memory')).toBe(true);
    });

    it('should include all shared context sections', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';

      await service.exportProjectMemory(projectId, projectRoot);

      const content = mockFiles.get('/test/project/.andos/memory/PROJECT_MEMORY.md')!;

      // Check all sections are present
      expect(content).toContain('## Code Style Preferences');
      expect(content).toContain('## API Patterns');
      expect(content).toContain('## Common Errors');
      expect(content).toContain('## Team Conventions');
      expect(content).toContain('## Architecture Decisions');
      expect(content).toContain('## Learned Patterns');
    });

    it('should format API patterns with usage examples', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';

      await service.exportProjectMemory(projectId, projectRoot);

      const content = mockFiles.get('/test/project/.andos/memory/PROJECT_MEMORY.md')!;
      expect(content).toContain('Repository Pattern');
      expect(content).toContain('UserRepository.findById()');
      expect(content).toContain('Preferred over');
      expect(content).toContain('Direct database queries');
    });

    it('should format common errors with solutions', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';

      await service.exportProjectMemory(projectId, projectRoot);

      const content = mockFiles.get('/test/project/.andos/memory/PROJECT_MEMORY.md')!;
      expect(content).toContain('Null reference in async operations');
      expect(content).toContain('Solution:');
      expect(content).toContain('Prevention:');
    });

    it('should format architecture decisions with consequences', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';

      await service.exportProjectMemory(projectId, projectRoot);

      const content = mockFiles.get('/test/project/.andos/memory/PROJECT_MEMORY.md')!;
      expect(content).toContain('Use PostgreSQL with ltree for hierarchical data');
      expect(content).toContain('Context:');
      expect(content).toContain('Consequences:');
      expect(content).toContain('Efficient tree queries');
    });

    it('should include learned patterns with metadata', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';

      await service.exportProjectMemory(projectId, projectRoot);

      const content = mockFiles.get('/test/project/.andos/memory/PROJECT_MEMORY.md')!;
      expect(content).toContain('error-handling-pattern');
      expect(content).toContain('**Frequency:** 15');
      expect(content).toContain('**Confidence:** 92%');
      expect(content).toContain('rest-api-pattern');
      expect(content).toContain('**Frequency:** 8');
    });
  });

  describe('exportSessionSummaries', () => {
    it('should export session summaries to sessions directory', async () => {
      const sessionData = {
        sessionId: 'sess-123',
        date: '2024-01-15',
        summary: 'Worked on authentication module',
        decisions: ['Use JWT for auth tokens'],
        patterns: ['Observer pattern for event handling'],
      };

      await service.exportSessionSummaries([sessionData], '/test/project');

      const expectedPath = '/test/project/.andos/memory/sessions/2024-01-15.md';
      expect(mockFiles.has(expectedPath)).toBe(true);

      const content = mockFiles.get(expectedPath)!;
      expect(content).toContain('# Session Summary: 2024-01-15');
      expect(content).toContain('**Session ID:** sess-123');
      expect(content).toContain('Worked on authentication module');
    });

    it('should handle multiple sessions on same date', async () => {
      const sessions = [
        {
          sessionId: 'sess-1',
          date: '2024-01-15',
          summary: 'Morning work on auth',
          decisions: ['Decision A'],
          patterns: ['Pattern A'],
        },
        {
          sessionId: 'sess-2',
          date: '2024-01-15',
          summary: 'Afternoon work on API',
          decisions: ['Decision B'],
          patterns: ['Pattern B'],
        },
      ];

      await service.exportSessionSummaries(sessions, '/test/project');

      const expectedPath = '/test/project/.andos/memory/sessions/2024-01-15.md';
      expect(mockFiles.has(expectedPath)).toBe(true);

      const content = mockFiles.get(expectedPath)!;
      expect(content).toContain('Morning work on auth');
      expect(content).toContain('Afternoon work on API');
    });

    it('should format decisions and patterns as lists', async () => {
      const sessionData = {
        sessionId: 'sess-123',
        date: '2024-01-15',
        summary: 'Worked on features',
        decisions: ['Decision 1', 'Decision 2'],
        patterns: ['Pattern 1', 'Pattern 2'],
      };

      await service.exportSessionSummaries([sessionData], '/test/project');

      const content = mockFiles.get('/test/project/.andos/memory/sessions/2024-01-15.md')!;
      expect(content).toContain('## Decisions Made');
      expect(content).toContain('- Decision 1');
      expect(content).toContain('- Decision 2');
      expect(content).toContain('## Patterns Observed');
      expect(content).toContain('- Pattern 1');
      expect(content).toContain('- Pattern 2');
    });
  });

  describe('syncFromFile', () => {
    it('should parse PROJECT_MEMORY.md and sync changes', async () => {
      const markdownContent = `# Project Memory: proj-123

<!--
ANDOS_MEMORY_FILE
Type: PROJECT_MEMORY
Project: proj-123
Version: 5
Last Synced: 2024-01-15T10:30:00Z
-->

## Code Style Preferences

### Naming Conventions

<!-- EDITABLE_SECTION: code_style_preferences.naming_conventions -->
- variables: camelCase
- functions: camelCase
- classes: PascalCase
- updated_property: new_value
<!-- END_EDITABLE_SECTION -->

## Team Conventions

<!-- EDITABLE_SECTION: team_conventions -->
- **Git**: Use conventional commits format
  - Rationale: Enables automated changelog generation
- **Testing**: Write tests before implementation
  - Rationale: Ensures testable design
<!-- END_EDITABLE_SECTION -->
`;

      mockFiles.set('/test/project/.andos/memory/PROJECT_MEMORY.md', markdownContent);

      await service.syncFromFile('/test/project/.andos/memory/PROJECT_MEMORY.md');

      // Should have updated context with changes
      const { projectMemoryService } = await import('../../../src/services/ProjectMemoryService');
      expect(projectMemoryService.updateProjectContext).toHaveBeenCalled();
    });

    it('should detect editable sections', async () => {
      const markdownContent = `<!-- EDITABLE_SECTION: code_style_preferences.naming_conventions -->
- variables: snake_case
<!-- END_EDITABLE_SECTION -->`;

      mockFiles.set('/test/project/.andos/memory/PROJECT_MEMORY.md', markdownContent);

      const editableSections = service.detectEditableSections(markdownContent);

      expect(editableSections).toHaveLength(1);
      expect(editableSections[0].path).toBe('code_style_preferences.naming_conventions');
    });

    it('should handle missing file gracefully', async () => {
      await expect(
        service.syncFromFile('/nonexistent/PROJECT_MEMORY.md')
      ).rejects.toThrow('ENOENT');
    });

    it('should parse architecture decisions from editable sections', async () => {
      const markdownContent = `<!-- EDITABLE_SECTION: architecture_decisions -->
- **Use Redis for caching**
  - Date: 2024-01-20
  - Context: Need distributed caching
  - Consequences:
    - Fast read/write
    - Requires Redis server
<!-- END_EDITABLE_SECTION -->`;

      mockFiles.set('/test/project/.andos/memory/PROJECT_MEMORY.md', markdownContent);

      const sections = service.detectEditableSections(markdownContent);
      expect(sections[0].path).toBe('architecture_decisions');
    });
  });

  describe('parseProjectMemory', () => {
    it('should parse project metadata from markdown', () => {
      const content = `# Project Memory: proj-123

<!--
ANDOS_MEMORY_FILE
Type: PROJECT_MEMORY
Project: proj-123
Version: 5
Last Synced: 2024-01-15T10:30:00Z
-->

## Code Style Preferences

### Naming Conventions

- variables: camelCase
- functions: camelCase
`;

      const result = service.parseProjectMemory(content);

      expect(result.project_id).toBe('proj-123');
      expect(result.version).toBe(5);
    });

    it('should parse code style preferences', () => {
      const content = `## Code Style Preferences

### Naming Conventions

- variables: camelCase
- functions: snake_case

### Formatting Rules

- indent_size: 4
- max_line_length: 120
`;

      const result = service.parseProjectMemory(content);

      expect(result.shared_context?.code_style_preferences?.naming_conventions).toEqual({
        variables: 'camelCase',
        functions: 'snake_case',
      });
      expect(result.shared_context?.code_style_preferences?.formatting_rules).toEqual({
        indent_size: 4,
        max_line_length: 120,
      });
    });

    it('should parse team conventions as array', () => {
      const content = `## Team Conventions

- **Git**: Use conventional commits
  - Rationale: Enables automation
- **Code Review**: Require 2 approvals
  - Rationale: Improve quality
`;

      const result = service.parseProjectMemory(content);

      expect(result.shared_context?.team_conventions).toHaveLength(2);
      expect(result.shared_context?.team_conventions?.[0]).toMatchObject({
        category: 'Git',
        rule: 'Use conventional commits',
        rationale: 'Enables automation',
      });
    });

    it('should parse architecture decisions', () => {
      const content = `## Architecture Decisions

### Use Microservices Architecture

- **Date**: 2024-01-10
- **Context**: Monolith becoming unwieldy
- **Consequences**:
  - Better scalability
  - Increased complexity
`;

      const result = service.parseProjectMemory(content);

      expect(result.shared_context?.architecture_decisions).toHaveLength(1);
      expect(result.shared_context?.architecture_decisions?.[0]).toMatchObject({
        decision: 'Use Microservices Architecture',
        context: 'Monolith becoming unwieldy',
        consequences: ['Better scalability', 'Increased complexity'],
      });
    });

    it('should return empty object for empty content', () => {
      const result = service.parseProjectMemory('');
      expect(result).toEqual({});
    });
  });

  describe('formatProjectMemory', () => {
    it('should format project memory as markdown', () => {
      const memory: ProjectMemory = {
        id: 'mem-123',
        project_id: 'test-proj',
        version: 3,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15'),
        shared_context: {
          code_style_preferences: {
            naming_conventions: { variables: 'camelCase' },
            formatting_rules: {},
            language_specific: {},
          },
          team_conventions: [],
          api_patterns: [],
          common_errors: [],
          architecture_decisions: [],
        },
      };

      const content = service.formatProjectMemory(memory);

      expect(content).toContain('# Project Memory: test-proj');
      expect(content).toContain('Version: 3');
      expect(content).toContain('<!-- EDITABLE_SECTION: code_style_preferences.naming_conventions -->');
    });

    it('should include last updated timestamp', () => {
      const memory: ProjectMemory = {
        id: 'mem-123',
        project_id: 'test-proj',
        version: 1,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15T10:30:00Z'),
        shared_context: {},
      };

      const content = service.formatProjectMemory(memory);

      expect(content).toContain('Last Updated: 2024-01-15');
    });
  });

  describe('DEFAULT_TRANSPARENCY_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_TRANSPARENCY_CONFIG.outputDir).toBe('.andos/memory');
      expect(DEFAULT_TRANSPARENCY_CONFIG.autoExport.onSessionEnd).toBe(true);
      expect(DEFAULT_TRANSPARENCY_CONFIG.autoExport.onPatternLearned).toBe(true);
    });
  });

  describe('exportAll', () => {
    it('should export both project memory and session summaries', async () => {
      const projectId = 'proj-123';
      const projectRoot = '/test/project';
      const sessions = [
        {
          sessionId: 'sess-1',
          date: '2024-01-15',
          summary: 'Test session',
          decisions: [],
          patterns: [],
        },
      ];

      await service.exportAll(projectId, projectRoot, sessions);

      expect(mockFiles.has('/test/project/.andos/memory/PROJECT_MEMORY.md')).toBe(true);
      expect(mockFiles.has('/test/project/.andos/memory/sessions/2024-01-15.md')).toBe(true);
    });
  });
});
