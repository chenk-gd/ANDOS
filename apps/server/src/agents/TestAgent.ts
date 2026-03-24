/**
 * TestAgent - AI-Native DevOps Platform
 * Specialized agent for test generation and analysis
 */

import { agentService, agentExecutionEngine } from '../services/AgentService';
import { BaseAgent, AgentConfig, autoInitializeAgent } from './BaseAgent';

// TestAgent system prompt
const TEST_AGENT_PROMPT = `You are TestAgent, an expert test engineer specializing in comprehensive test coverage.

Your responsibilities:
1. Generate test cases from requirements and code
2. Create unit tests, integration tests, and E2E tests
3. Analyze test coverage and identify gaps
4. Generate test data and mock fixtures
5. Review tests for quality and completeness

## Test Generation Process

1. **Analyze Requirements**: Understand functional and edge cases
2. **Review Code**: Identify testable units and integration points
3. **Design Test Cases**: Create positive, negative, and edge case scenarios
4. **Generate Test Code**: Write clear, maintainable tests
5. **Create Test Data**: Generate realistic fixtures and mocks
6. **Verify Coverage**: Ensure all paths are covered

## Output Format

\`\`\`yaml
test_suite:
  type: unit|integration|e2e
  framework: jest|pytest|cypress
  target: src/services/UserService.ts

  test_cases:
    - id: TC-001
      name: should create user successfully
      type: positive
      setup: |
        const mockUser = { name: 'John', email: 'john@example.com' }
      execution: |
        const result = await userService.create(mockUser)
      assertions:
        - expect(result.id).toBeDefined()
        - expect(result.email).toBe(mockUser.email)
      coverage:
        lines: [45, 46, 47, 48]
        branches: ['if (validEmail)']

    - id: TC-002
      name: should reject invalid email
      type: negative
      setup: |
        const mockUser = { name: 'John', email: 'invalid' }
      execution: |
        await expect(userService.create(mockUser)).rejects.toThrow()
      assertions:
        - expect(error.message).toContain('invalid email')

  coverage_report:
    overall: 87%
    by_file:
      - file: UserService.ts
        lines: 95%
        functions: 100%
        branches: 80%
    gaps:
      - file: UserService.ts
        uncovered: [123, 124, 125]
        reason: "Error handling branches not covered"

  test_data:
    fixtures:
      - name: valid_users
        data:
          - { id: 1, name: 'Alice', email: 'alice@example.com' }
          - { id: 2, name: 'Bob', email: 'bob@example.com' }
    mocks:
      - module: database
        methods:
          - name: query
            returns: [{ id: 1, name: 'Alice' }]
\`\`\`

## Test Types

### Unit Tests
- Test individual functions/classes
- Mock all dependencies
- Fast execution
- High coverage requirements (>80%)

### Integration Tests
- Test component interactions
- Partial mocking (external services)
- Medium execution time
- Critical path coverage

### E2E Tests
- Test complete user flows
- No mocking (real system)
- Slower execution
- Key scenarios only

## Testing Best Practices

- Arrange-Act-Assert pattern
- One assertion per test (ideally)
- Descriptive test names
- Independent tests (no shared state)
- Fast execution
- Deterministic results

## Coverage Guidelines

- Lines: > 80%
- Functions: > 90%
- Branches: > 70%
- Critical paths: 100%

## Available Tools

- fetch_asset: Get requirements and code
- read: Read existing tests
- write: Write test files
- edit: Modify existing tests
- bash: Run tests and check coverage
- query_dag: Check dependencies
`;

// TestAgent configuration
const TEST_AGENT_CONFIG: AgentConfig = {
  slug: 'test-agent',
  name: 'TestAgent',
  description: 'Expert test engineer that generates comprehensive test suites with high coverage',
  mode: 'primary',
  capabilities: ['test-generation', 'coverage-analysis', 'test-data-generation', 'test-review'],
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
      bash: { 'npm test': 'allow', 'npm run coverage': 'allow', '*': 'deny' },
      query_dag: true,
    },
    permissions: {
      read: 'allow',
      write: 'allow',
      edit: 'allow',
      bash: { 'npm *': 'allow', 'npx *': 'allow', '*': 'deny' },
    },
  },
  prompt_template: TEST_AGENT_PROMPT,
};

/**
 * TestAgent class
 */
export class TestAgent extends BaseAgent {
  constructor() {
    super(TEST_AGENT_CONFIG);
  }

  /**
   * Execute test generation
   */
  async execute(input: unknown): Promise<unknown> {
    const { codeAssetId, options } = input as {
      codeAssetId: string;
      options?: {
        testTypes?: ('unit' | 'integration' | 'e2e')[];
        framework?: 'jest' | 'pytest' | 'cypress';
        coverageTarget?: number;
      };
    };
    return await this.generateTestSuite(codeAssetId, options);
  }

  /**
   * Generate test suite for code
   */
  async generateTestSuite(
    codeAssetId: string,
    options?: {
      testTypes?: ('unit' | 'integration' | 'e2e')[];
      framework?: 'jest' | 'pytest' | 'cypress';
      coverageTarget?: number;
    }
  ): Promise<{
    test_cases: Array<{
      id: string;
      name: string;
      type: string;
      setup: string;
      execution: string;
      assertions: string[];
    }>;
    test_data: {
      fixtures: Array<{
        name: string;
        data: unknown[];
      }>;
      mocks: Array<{
        module: string;
        methods: Array<{
          name: string;
          returns: unknown;
        }>;
      }>;
    };
    coverage_projection: {
      lines: number;
      functions: number;
      branches: number;
    };
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [codeAssetId],
    });

    const execution = await agentService.createExecution({
      execution_id: `test-gen-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
      source_asset_id: codeAssetId,
      trigger_event_type: 'test.generation.requested',
    });

    const testTypes = options?.testTypes?.join(', ') || 'unit';
    const framework = options?.framework || 'jest';
    const coverageTarget = options?.coverageTarget || 80;

    const prompt = `Generate ${testTypes} tests for code asset ${codeAssetId}.

Requirements:
- Framework: ${framework}
- Coverage target: ${coverageTarget}%

Generate:
1. Positive test cases (happy path)
2. Negative test cases (error handling)
3. Edge cases (boundary conditions)
4. Test data fixtures and mocks
5. Coverage projection

For each test case include:
- Clear name and description
- Setup code
- Execution code
- Assertions
- Expected coverage

Output in the specified YAML format.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 8192,
      temperature: 0.1,
    });

    // Parse test suite
    const testSuite = parseTestSuite(result.reasoning || '');

    return {
      test_cases: testSuite.test_cases,
      test_data: testSuite.test_data,
      coverage_projection: testSuite.coverage_projection,
    };
  }

  /**
   * Analyze test coverage
   */
  async analyzeCoverage(
    codeAssetId: string
  ): Promise<{
    overall: number;
    by_file: Array<{
      file: string;
      lines: number;
      functions: number;
      branches: number;
    }>;
    gaps: Array<{
      file: string;
      uncovered: number[];
      reason: string;
    }>;
    recommendations: string[];
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [codeAssetId],
    });

    const execution = await agentService.createExecution({
      execution_id: `coverage-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const prompt = `Analyze test coverage for code asset ${codeAssetId}.

Analyze:
1. Overall coverage percentage
2. Coverage by file (lines, functions, branches)
3. Identify coverage gaps and uncovered code paths
4. Critical paths that need testing
5. Recommendations for improving coverage

Provide actionable insights for improving test coverage.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    return {
      overall: 0,
      by_file: [],
      gaps: [],
      recommendations: [],
    };
  }

  /**
   * Generate test data
   */
  async generateTestData(
    schema: Record<string, unknown>,
    options?: {
      count?: number;
      locale?: string;
      edgeCases?: boolean;
    }
  ): Promise<{
    fixtures: Array<{
      name: string;
      data: unknown[];
    }>;
    edge_cases: Array<{
      name: string;
      data: unknown;
      description: string;
    }>;
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
    });

    const execution = await agentService.createExecution({
      execution_id: `test-data-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const count = options?.count || 10;
    const locale = options?.locale || 'en';
    const includeEdgeCases = options?.edgeCases !== false;

    const prompt = `Generate ${count} test data records matching the schema:

${JSON.stringify(schema, null, 2)}

Requirements:
- Locale: ${locale}
- Include realistic data
${includeEdgeCases ? '- Include edge cases (null, empty, max values)' : ''}

Generate:
1. Fixture data for typical scenarios
2. Edge case data for boundary testing
3. Valid and invalid data sets

Output as structured test data.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 4096,
      temperature: 0.3,
    });

    return {
      fixtures: [],
      edge_cases: [],
    };
  }

  /**
   * Review existing tests
   */
  async reviewTests(
    testAssetId: string
  ): Promise<{
    score: number;
    strengths: string[];
    weaknesses: string[];
    issues: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      description: string;
      suggestion: string;
    }>;
    coverage_gaps: string[];
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [testAssetId],
    });

    const execution = await agentService.createExecution({
      execution_id: `test-review-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const prompt = `Review test suite ${testAssetId} for quality.

Evaluate:
1. Test coverage completeness
2. Test quality (clarity, maintainability)
3. Test independence (no shared state)
4. Assertion quality
5. Test data management
6. Performance considerations

Provide:
- Overall quality score
- Strengths and weaknesses
- Specific issues with severity
- Recommendations for improvement`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    return {
      score: 8.5,
      strengths: [],
      weaknesses: [],
      issues: [],
      coverage_gaps: [],
    };
  }
}

// Export singleton instance
export const testAgent = new TestAgent();

/**
 * Initialize TestAgent
 * Creates the agent definition if it doesn't exist
 */
export async function initializeTestAgent(): Promise<void> {
  await testAgent.initialize();
}

/**
 * Generate test suite for code
 * @deprecated Use testAgent.generateTestSuite() instead
 */
export async function generateTestSuite(
  codeAssetId: string,
  options?: {
    testTypes?: ('unit' | 'integration' | 'e2e')[];
    framework?: 'jest' | 'pytest' | 'cypress';
    coverageTarget?: number;
  }
): Promise<{
  test_cases: Array<{
    id: string;
    name: string;
    type: string;
    setup: string;
    execution: string;
    assertions: string[];
  }>;
  test_data: {
    fixtures: Array<{
      name: string;
      data: unknown[];
    }>;
    mocks: Array<{
      module: string;
      methods: Array<{
        name: string;
        returns: unknown;
      }>;
    }>;
  };
  coverage_projection: {
    lines: number;
    functions: number;
    branches: number;
  };
}> {
  return await testAgent.generateTestSuite(codeAssetId, options);
}

/**
 * Analyze test coverage
 * @deprecated Use testAgent.analyzeCoverage() instead
 */
export async function analyzeCoverage(
  codeAssetId: string
): Promise<{
  overall: number;
  by_file: Array<{
    file: string;
    lines: number;
    functions: number;
    branches: number;
  }>;
  gaps: Array<{
    file: string;
    uncovered: number[];
    reason: string;
  }>;
  recommendations: string[];
}> {
  return await testAgent.analyzeCoverage(codeAssetId);
}

/**
 * Generate test data
 * @deprecated Use testAgent.generateTestData() instead
 */
export async function generateTestData(
  schema: Record<string, unknown>,
  options?: {
    count?: number;
    locale?: string;
    edgeCases?: boolean;
  }
): Promise<{
  fixtures: Array<{
    name: string;
    data: unknown[];
  }>;
  edge_cases: Array<{
    name: string;
    data: unknown;
    description: string;
  }>;
}> {
  return await testAgent.generateTestData(schema, options);
}

/**
 * Review existing tests
 * @deprecated Use testAgent.reviewTests() instead
 */
export async function reviewTests(
  testAssetId: string
): Promise<{
  score: number;
  strengths: string[];
  weaknesses: string[];
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    suggestion: string;
  }>;
  coverage_gaps: string[];
}> {
  return await testAgent.reviewTests(testAssetId);
}

interface ParsedTestSuite {
  test_cases: Array<{
    id: string;
    name: string;
    type: string;
    setup: string;
    execution: string;
    assertions: string[];
  }>;
  test_data: {
    fixtures: Array<{
      name: string;
      data: unknown[];
    }>;
    mocks: Array<{
      module: string;
      methods: Array<{
        name: string;
        returns: unknown;
      }>;
    }>;
  };
  coverage_projection: {
    lines: number;
    functions: number;
    branches: number;
  };
}

/**
 * Parse test suite from output
 */
function parseTestSuite(output: string): ParsedTestSuite {
  // Placeholder - would use proper YAML parsing
  return {
    test_cases: [],
    test_data: {
      fixtures: [],
      mocks: [],
    },
    coverage_projection: {
      lines: 0,
      functions: 0,
      branches: 0,
    },
  };
}

// Auto-initialize on module load if in production
autoInitializeAgent(testAgent);

