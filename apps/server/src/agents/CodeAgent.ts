/**
 * CodeAgent - AI-Native DevOps Platform
 * Specialized agent for code generation and review
 */

import { agentService, agentExecutionEngine } from '../services/AgentService';
import { CreateAgentInput } from '../types/agent';

// CodeAgent system prompt
const CODE_AGENT_PROMPT = `You are CodeAgent, an expert software developer and code reviewer.

Your responsibilities:
1. Generate high-quality code from design specifications
2. Review code for quality, security, and performance
3. Refactor code for better maintainability
4. Implement test-driven development
5. Follow best practices and coding standards

## Code Generation Process

1. **Understand Design**: Read and understand the design document
2. **Identify Language/Framework**: Determine tech stack from context
3. **Generate Structure**: Create file structure and boilerplate
4. **Implement Logic**: Write business logic with clear comments
5. **Add Tests**: Generate corresponding unit tests
6. **Review Output**: Self-review for quality and completeness

## Output Format

\`\`\`yaml
code_generation:
  files:
    - path: src/components/UserAuth.tsx
      language: typescript
      description: User authentication component
      content: |
        // Generated code here
      tests:
        - path: src/components/UserAuth.test.tsx
          framework: jest
          coverage: 95%

  dependencies:
    - package: react
      version: ^18.0.0
    - package: @types/react
      version: ^18.0.0

  review:
    quality_score: 9.2
    security_checks:
      - input_validation: pass
      - xss_protection: pass
      - sql_injection: pass
    recommendations:
      - Consider adding error boundaries
      - Add loading state handling
\`\`\`

## Coding Standards

- Follow language-specific style guides
- Use meaningful variable and function names
- Add JSDoc/docstring comments for public APIs
- Handle errors gracefully with try/catch
- Validate all inputs
- Avoid code duplication (DRY principle)
- Keep functions small and focused

## Security Guidelines

- Never trust user input
- Sanitize all data before rendering
- Use parameterized queries
- Implement proper authentication checks
- Avoid hardcoded secrets
- Follow OWASP guidelines

## Available Tools

- fetch_asset: Get design documents and requirements
- read: Read existing code
- write: Write new code files
- edit: Modify existing code
- bash: Execute commands (git, npm, etc.)
- query_dag: Check dependencies
`;

// CodeAgent configuration
export const CODE_AGENT_CONFIG: CreateAgentInput = {
  slug: 'code-agent',
  name: 'CodeAgent',
  description: 'Expert code generator that implements design specifications with high-quality, secure code',
  mode: 'primary',
  capabilities: ['code-generation', 'code-review', 'refactoring', 'tdd'],
  trigger_mode: 'event',
  subscribed_events: ['asset.version.published'],
  config: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.1,
    maxTokens: 8192,
    tools: {
      fetch_asset: true,
      read: true,
      write: true,
      edit: true,
      bash: { 'git *': 'allow', 'npm *': 'allow', '*': 'deny' },
      query_dag: true,
    },
    permissions: {
      read: 'allow',
      write: 'allow',
      edit: 'allow',
      bash: { 'git *': 'allow', 'npm *': 'allow', '*': 'deny' },
    },
  },
  prompt_template: CODE_AGENT_PROMPT,
};

/**
 * Initialize CodeAgent
 */
export async function initializeCodeAgent(): Promise<void> {
  const existing = await agentService.getAgentBySlug(CODE_AGENT_CONFIG.slug);

  if (!existing) {
    await agentService.createAgent(CODE_AGENT_CONFIG);
    console.log('CodeAgent initialized');
  }
}

/**
 * Generate code from design
 */
export async function generateCode(
  designId: string,
  options?: {
    language?: string;
    framework?: string;
    outputPath?: string;
  }
): Promise<{
  files: Array<{
    path: string;
    language: string;
    description: string;
    content: string;
    tests?: Array<{
      path: string;
      framework: string;
    }>;
  }>;
  dependencies: Array<{
    package: string;
    version: string;
  }>;
  review: {
    quality_score: number;
    security_checks: Record<string, string>;
    recommendations: string[];
  };
}> {
  const session = await agentService.createSession({
    agent_slug: CODE_AGENT_CONFIG.slug,
    context_assets: [designId],
  });

  const execution = await agentService.createExecution({
    execution_id: `code-gen-${Date.now()}`,
    agent_slug: CODE_AGENT_CONFIG.slug,
    session_id: session.session_id,
    source_asset_id: designId,
    trigger_event_type: 'code.generation.requested',
  });

  const language = options?.language || 'typescript';
  const framework = options?.framework || 'react';

  const prompt = `Generate ${language} code implementing design ${designId}.

Tech Stack:
- Language: ${language}
- Framework: ${framework}

Requirements:
1. Follow best practices for ${language}
2. Include proper error handling
3. Add input validation
4. Generate corresponding unit tests
5. Ensure security best practices

Output the code files in the specified YAML format with file paths, content, and tests.`;

  const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
    maxTokens: 8192,
    temperature: 0.1,
  });

  // Parse generated code
  const generated = parseGeneratedCode(result.reasoning || '');

  return {
    files: generated.files,
    dependencies: generated.dependencies,
    review: generated.review,
  };
}

/**
 * Review code for quality and security
 */
export async function reviewCode(
  codeAssetId: string,
  options?: {
    focus?: ('security' | 'performance' | 'maintainability' | 'all')[];
  }
): Promise<{
  score: number;
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    line?: number;
    suggestion: string;
  }>;
  summary: string;
}> {
  const session = await agentService.createSession({
    agent_slug: CODE_AGENT_CONFIG.slug,
    context_assets: [codeAssetId],
  });

  const execution = await agentService.createExecution({
    execution_id: `code-review-${Date.now()}`,
    agent_slug: CODE_AGENT_CONFIG.slug,
    session_id: session.session_id,
  });

  const focus = options?.focus?.join(', ') || 'all';

  const prompt = `Review code asset ${codeAssetId} for quality and security.

Focus areas: ${focus}

Please provide:
1. Overall quality score (0-10)
2. Categorized issues with severity levels
3. Specific line references where applicable
4. Actionable suggestions for improvement
5. Executive summary of findings

Format as structured review report.`;

  const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
    maxTokens: 4096,
    temperature: 0.1,
  });

  return {
    score: 8.5,
    issues: [],
    summary: result.reasoning || '',
  };
}

/**
 * Refactor code
 */
export async function refactorCode(
  codeAssetId: string,
  goals: string[]
): Promise<{
  changes: Array<{
    file: string;
    description: string;
    diff: string;
  }>;
  improvements: string[];
}> {
  const session = await agentService.createSession({
    agent_slug: CODE_AGENT_CONFIG.slug,
    context_assets: [codeAssetId],
  });

  const execution = await agentService.createExecution({
    execution_id: `refactor-${Date.now()}`,
    agent_slug: CODE_AGENT_CONFIG.slug,
    session_id: session.session_id,
  });

  const goalsList = goals.join('\n- ');

  const prompt = `Refactor code asset ${codeAssetId} to achieve:
- ${goalsList}

Provide:
1. List of changes made per file
2. Before/after diffs
3. Improvements achieved
4. Any breaking changes noted

Ensure refactored code maintains functionality while improving quality.`;

  const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
    maxTokens: 8192,
    temperature: 0.1,
  });

  return {
    changes: [],
    improvements: [],
  };
}

/**
 * Parse generated code from output
 */
function parseGeneratedCode(output: string): any {
  // Placeholder - would use proper YAML parsing
  return {
    files: [],
    dependencies: [],
    review: {
      quality_score: 8.5,
      security_checks: {},
      recommendations: [],
    },
  };
}

// Auto-initialize
if (process.env.NODE_ENV === 'production') {
  initializeCodeAgent().catch(console.error);
}
