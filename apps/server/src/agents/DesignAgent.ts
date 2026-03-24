/**
 * DesignAgent - AI-Native DevOps Platform
 * Specialized agent for system design and architecture
 */

import { agentService, agentExecutionEngine } from '../services/AgentService';
import { BaseAgent, AgentConfig, autoInitializeAgent } from './BaseAgent';

// DesignAgent system prompt
const DESIGN_AGENT_PROMPT = `You are DesignAgent, an expert system architect and designer.

Your responsibilities:
1. Create comprehensive system designs based on requirements
2. Design APIs, data models, and system architecture
3. Generate architecture diagrams and documentation
4. Ensure designs are scalable, maintainable, and secure
5. Identify technical risks and mitigation strategies

## Design Process

1. **Understand Requirements**: Analyze functional and non-functional requirements
2. **Domain Modeling**: Identify entities, relationships, and boundaries
3. **Architecture Design**: Choose appropriate patterns (microservices, monolith, serverless)
4. **API Design**: Define interfaces and data contracts
5. **Data Design**: Design database schema and data flow
6. **Security Review**: Identify security considerations

## Output Format

\`\`\`yaml
design:
  id: DES-XXX
  title: Design Title
  type: architecture|api|data|ui|deployment
  overview: High-level description

  components:
    - name: Component Name
      type: service|database|cache|queue
      description: Purpose and responsibilities
      interfaces:
        - name: methodName
          type: input|output
          schema: JSON Schema

  data_model:
    entities:
      - name: EntityName
        attributes:
          - name: attribute
            type: string
            constraints: [required, unique]
        relationships:
          - target: OtherEntity
            type: one-to-many

  api_design:
    endpoints:
      - path: /api/v1/resource
        method: GET|POST|PUT|DELETE
        description: Purpose
        request:
          content_type: application/json
          schema: {}
        response:
          status: 200
          schema: {}

  architecture_diagrams:
    - type: c4/container
      description: System container diagram
    - type: sequence
      description: Key interaction flows

  decisions:
    - id: ADR-001
      title: Decision Title
      context: Context and problem
      decision: What was decided
      consequences: Pros and cons
\`\`\`

## Guidelines

- Follow RESTful API design principles
- Use domain-driven design patterns
- Consider caching, rate limiting, and scalability
- Document trade-offs and alternatives
- Include security best practices

## Available Tools

- fetch_asset: Get requirements and existing designs
- query_dag: Analyze system dependencies
- create_design: Create design asset
`;

// DesignAgent configuration
const DESIGN_AGENT_CONFIG: AgentConfig = {
  slug: 'design-agent',
  name: 'DesignAgent',
  description: 'Expert system architect that creates comprehensive designs from requirements',
  mode: 'primary',
  capabilities: ['system-design', 'architecture', 'api-design', 'data-modeling'],
  trigger_mode: 'event',
  subscribed_events: ['asset.version.published'], // Auto-trigger when requirement is published
  config: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    maxTokens: 8192,
    tools: {
      fetch_asset: true,
      query_dag: true,
      create_design: true,
    },
    permissions: {
      read: 'allow',
      write: 'allow',
      edit: 'allow',
      bash: { 'git *': 'allow', '*': 'deny' },
    },
  },
  prompt_template: DESIGN_AGENT_PROMPT,
};

/**
 * DesignAgent class
 */
export class DesignAgent extends BaseAgent {
  constructor() {
    super(DESIGN_AGENT_CONFIG);
  }

  /**
   * Execute design generation
   */
  async execute(input: unknown): Promise<unknown> {
    const { requirementId, options } = input as {
      requirementId: string;
      options?: {
        designType?: 'architecture' | 'api' | 'data' | 'full';
        constraints?: string[];
      };
    };
    return await this.generateSystemDesign(requirementId, options);
  }

  /**
   * Generate system design from requirements
   */
  async generateSystemDesign(
    requirementId: string,
    options?: {
      designType?: 'architecture' | 'api' | 'data' | 'full';
      constraints?: string[];
    }
  ): Promise<{
    design: {
      id: string;
      components: Array<{
        name: string;
        type: string;
        description: string;
      }>;
      data_model: {
        entities: Array<unknown>;
      };
      api_design: {
        endpoints: Array<unknown>;
      };
      decisions: Array<unknown>;
    };
    documentation: string;
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [requirementId],
    });

    const execution = await agentService.createExecution({
      execution_id: `design-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
      source_asset_id: requirementId,
      trigger_event_type: 'design.requested',
    });

    const designType = options?.designType || 'full';
    const constraints = options?.constraints?.join('\n- ') || 'None specified';

    const prompt = `Generate a ${designType} system design for requirement ${requirementId}.

Constraints:
- ${constraints}

Please provide:
1. High-level architecture overview
2. Component breakdown with responsibilities
3. API specifications (if applicable)
4. Data model and relationships
5. Key architectural decisions with rationale
6. Security considerations
7. Scalability approach

Use the specified YAML format for structured data.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 8192,
      temperature: 0.2,
    });

    // Parse design output
    const design = parseDesignFromOutput(result.reasoning || '');

    return {
      design,
      documentation: result.reasoning || '',
    };
  }

  /**
   * Review design against requirements
   */
  async reviewDesign(
    designId: string,
    requirementId: string
  ): Promise<{
    coverage: number;
    gaps: string[];
    recommendations: string[];
    approved: boolean;
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [designId, requirementId],
    });

    const execution = await agentService.createExecution({
      execution_id: `design-review-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const prompt = `Review design ${designId} against requirement ${requirementId}.

Assess:
1. Requirement coverage (percentage)
2. Missing elements or gaps
3. Design quality and feasibility
4. Alignment with best practices
5. Potential risks or issues

Provide specific recommendations for improvements.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 4096,
      temperature: 0.2,
    });

    return {
      coverage: 0, // Would parse from result
      gaps: [],
      recommendations: [],
      approved: false,
    };
  }

  /**
   * Generate API specification
   */
  async generateAPISpec(
    designId: string,
    endpoints?: string[]
  ): Promise<{
    spec: string;
    format: 'openapi' | 'asyncapi';
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [designId],
    });

    const execution = await agentService.createExecution({
      execution_id: `api-spec-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const endpointFilter = endpoints
      ? `Focus on these endpoints: ${endpoints.join(', ')}`
      : 'Include all endpoints';

    const prompt = `Generate OpenAPI 3.0 specification for design ${designId}.

${endpointFilter}

Requirements:
- Complete path definitions
- Request/response schemas
- Authentication requirements
- Error responses
- Examples where helpful

Output valid OpenAPI YAML.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 8192,
      temperature: 0.2,
    });

    return {
      spec: result.reasoning || '',
      format: 'openapi',
    };
  }
}

// Export singleton instance
export const designAgent = new DesignAgent();

/**
 * Initialize DesignAgent
 * Creates the agent definition if it doesn't exist
 */
export async function initializeDesignAgent(): Promise<void> {
  await designAgent.initialize();
}

/**
 * Generate system design from requirements
 * @deprecated Use designAgent.generateSystemDesign() instead
 */
export async function generateSystemDesign(
  requirementId: string,
  options?: {
    designType?: 'architecture' | 'api' | 'data' | 'full';
    constraints?: string[];
  }
): Promise<{
  design: {
    id: string;
    components: Array<{
      name: string;
      type: string;
      description: string;
    }>;
    data_model: {
      entities: Array<unknown>;
    };
    api_design: {
      endpoints: Array<unknown>;
    };
    decisions: Array<unknown>;
  };
  documentation: string;
}> {
  return await designAgent.generateSystemDesign(requirementId, options);
}

/**
 * Review design against requirements
 * @deprecated Use designAgent.reviewDesign() instead
 */
export async function reviewDesign(
  designId: string,
  requirementId: string
): Promise<{
  coverage: number;
  gaps: string[];
  recommendations: string[];
  approved: boolean;
}> {
  return await designAgent.reviewDesign(designId, requirementId);
}

/**
 * Generate API specification
 * @deprecated Use designAgent.generateAPISpec() instead
 */
export async function generateAPISpec(
  designId: string,
  endpoints?: string[]
): Promise<{
  spec: string;
  format: 'openapi' | 'asyncapi';
}> {
  return await designAgent.generateAPISpec(designId, endpoints);
}

/**
 * Parse design from agent output
 */
function parseDesignFromOutput(output: string): {
  id: string;
  components: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  data_model: {
    entities: Array<unknown>;
  };
  api_design: {
    endpoints: Array<unknown>;
  };
  decisions: Array<unknown>;
} {
  // Placeholder - would use proper YAML parsing
  return {
    id: 'DES-001',
    components: [],
    data_model: { entities: [] },
    api_design: { endpoints: [] },
    decisions: [],
  };
}

// Auto-initialize on module load if in production
autoInitializeAgent(designAgent);

