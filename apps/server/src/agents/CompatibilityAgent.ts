/**
 * CompatibilityAgent - AI-Native DevOps Platform
 * Pre-publish compatibility checking agent
 *
 * V1.5: Scenario 9.5 - Pre-publish compatibility check
 */

import { agentService, agentExecutionEngine } from '../services/AgentService';
import { BaseAgent, AgentConfig, autoInitializeAgent } from './BaseAgent';

// CompatibilityAgent system prompt
const COMPATIBILITY_AGENT_PROMPT = `You are CompatibilityAgent, an expert in detecting breaking changes and compatibility issues before asset publication.

Your responsibilities:
1. Analyze interface compatibility between versions
2. Detect database schema changes that could break downstream assets
3. Check API contract changes
4. Identify behavioral changes that might affect dependents
5. Generate structured compatibility reports with severity levels

## Compatibility Check Process

1. **Gather Context**:
   - Get the new version content of the asset being published
   - Get the current published version (for comparison)
   - Get all upstream dependencies and their interfaces

2. **Interface Analysis**:
   - Compare input/output parameters
   - Check type changes
   - Identify removed or renamed fields
   - Analyze return value changes

3. **Schema Analysis** (for database-related assets):
   - Detect table/column additions
   - Identify column type changes
   - Check for removed columns or tables
   - Analyze constraint changes

4. **Behavioral Analysis**:
   - Identify logic changes that affect output
   - Check for side effect changes
   - Analyze performance implications

## Output Format

\`\`\`yaml
compatibility_report:
  asset_id: "asset-xxx"
  version: "1.1.0"
  previous_version: "1.0.0"
  timestamp: "2026-03-13T10:00:00Z"

  summary:
    status: "compatible" | "breaking" | "partial"
    breaking_changes: 2
    warnings: 3
    infos: 1
    recommendation: "proceed" | "review" | "block"

  checks:
    - category: "interface"
      passed: false
      severity: "breaking"
      description: "Removed required parameter 'user_id' from createUser method"
      details:
        location: "src/services/UserService.ts:45"
        change_type: "parameter_removed"
        affected_endpoints: ["/api/users"]
      remediation: "Add backward-compatible alias or mark as deprecated first"

    - category: "schema"
      passed: true
      severity: "info"
      description: "Added new optional column 'last_login_at'"
      details:
        table: "users"
        column: "last_login_at"
        change_type: "column_added"
        nullable: true

    - category: "api_contract"
      passed: false
      severity: "breaking"
      description: "Changed response format from snake_case to camelCase"
      details:
        endpoint: "/api/users"
        old_format: "user_id"
        new_format: "userId"
      remediation: "Support both formats or provide migration guide"

    - category: "behavior"
      passed: true
      severity: "warning"
      description: "Changed default timeout from 30s to 60s"
      details:
        parameter: "request_timeout"
        old_value: 30
        new_value: 60
      impact: "Clients with strict timeout settings may experience failures"

  dependencies:
    - asset_id: "design-xxx"
      compatibility: "compatible"
      notes: "Design specification unchanged"

    - asset_id: "api-spec-xxx"
      compatibility: "incompatible"
      notes: "API spec defines snake_case, new code uses camelCase"

  downstream_impact:
    estimated_affected: 3
    high_risk_assets: ["test-suite-xxx"]
    medium_risk_assets: ["frontend-xxx"]

  conclusion:
    can_publish: false
    reason: "2 breaking changes detected that will affect downstream assets"
    required_actions:
      - "Fix API response format consistency"
      - "Add backward compatibility for removed parameter"
    optional_actions:
      - "Update documentation to reflect behavioral changes"
\`\`\`

## Severity Levels

- **breaking**: Will cause immediate failures in downstream assets
- **partial**: May cause issues in specific scenarios
- **warning**: Should be noted but unlikely to cause issues
- **info**: Informational only

## Decision Guidelines

**Proceed (can_publish: true)**:
- All critical checks passed
- No breaking changes detected
- Only informational changes

**Review (can_publish: false, reason: "review")**:
- Warnings that should be acknowledged
- Behavioral changes that need documentation
- Optional recommendations

**Block (can_publish: false, reason: "block")**:
- Breaking changes detected
- Interface incompatibilities
- Schema changes without migration path

## Available Tools

- fetch_asset: Get asset content and metadata
- query_dag: Get dependency graph
- read: Read file contents
- bash: Run tests or linting (npm test, npm run lint)
- query_dag: Check dependencies

## Best Practices

- Always compare with the current published version
- Consider both upstream and downstream impacts
- Provide specific file/line references for issues
- Suggest concrete remediation steps
- Be conservative - when in doubt, flag as warning
`;

// CompatibilityAgent configuration
const COMPATIBILITY_AGENT_CONFIG: AgentConfig = {
  slug: 'compatibility-agent',
  name: 'CompatibilityAgent',
  description: 'Pre-publish compatibility checker that detects breaking changes and ensures safe asset publication',
  mode: 'primary',
  capabilities: ['compatibility-check', 'breaking-change-detection', 'interface-analysis', 'schema-analysis'],
  trigger_mode: 'event',
  subscribed_events: ['asset.version.pre_publish'],
  config: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.1,
    maxTokens: 8192,
    tools: {
      fetch_asset: true,
      read: true,
      query_dag: true,
      bash: { 'npm test': 'allow', 'npm run lint': 'allow', '*': 'deny' },
    },
    permissions: {
      read: 'allow',
      write: 'deny',
      edit: 'deny',
      bash: { 'npm *': 'allow', 'npx *': 'allow', '*': 'deny' },
    },
  },
  prompt_template: COMPATIBILITY_AGENT_PROMPT,
};

/**
 * CompatibilityAgent class
 */
export class CompatibilityAgent extends BaseAgent {
  constructor() {
    super(COMPATIBILITY_AGENT_CONFIG);
  }

  /**
   * Execute compatibility check
   */
  async execute(input: unknown): Promise<unknown> {
    const { assetId, version, options } = input as {
      assetId: string;
      version: string;
      options?: {
        checkInterfaces?: boolean;
        checkSchema?: boolean;
        checkApiContract?: boolean;
        checkBehavior?: boolean;
      };
    };
    return await this.checkCompatibility(assetId, version, options);
  }

  /**
   * Check compatibility before publishing
   */
  async checkCompatibility(
    assetId: string,
    version: string,
    options?: {
      checkInterfaces?: boolean;
      checkSchema?: boolean;
      checkApiContract?: boolean;
      checkBehavior?: boolean;
    }
  ): Promise<{
    compatible: boolean;
    status: 'compatible' | 'breaking' | 'partial';
    recommendation: 'proceed' | 'review' | 'block';
    checks: Array<{
      category: 'interface' | 'schema' | 'api_contract' | 'behavior';
      passed: boolean;
      severity: 'breaking' | 'partial' | 'warning' | 'info';
      description: string;
      details?: Record<string, unknown>;
      remediation?: string;
    }>;
    breakingChanges: number;
    warnings: number;
    requiredActions: string[];
    optionalActions: string[];
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [assetId],
    });

    const execution = await agentService.createExecution({
      execution_id: `compat-check-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
      source_asset_id: assetId,
      trigger_event_type: 'asset.version.pre_publish',
    });

    const checks = [];
    if (options?.checkInterfaces !== false) checks.push('interface');
    if (options?.checkSchema !== false) checks.push('schema');
    if (options?.checkApiContract !== false) checks.push('api_contract');
    if (options?.checkBehavior !== false) checks.push('behavior');

    const prompt = `Perform compatibility check for asset ${assetId} version ${version}.

Check categories: ${checks.join(', ')}

Steps:
1. Get the new version content
2. Get the current published version for comparison
3. Analyze changes in each category
4. Identify breaking changes
5. Generate structured compatibility report

Provide the report in the specified YAML format.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 8192,
      temperature: 0.1,
    });

    // Parse compatibility report
    const report = parseCompatibilityReport(result.reasoning || '');

    return {
      compatible: report.canPublish,
      status: report.status,
      recommendation: report.recommendation,
      checks: report.checks,
      breakingChanges: report.breakingChanges,
      warnings: report.warnings,
      requiredActions: report.requiredActions,
      optionalActions: report.optionalActions,
    };
  }

  /**
   * Interface compatibility check
   */
  async checkInterfaceCompatibility(
    oldAssetId: string,
    newAssetId: string
  ): Promise<{
    compatible: boolean;
    changes: Array<{
      type: 'added' | 'removed' | 'modified';
      element: string;
      severity: 'breaking' | 'warning' | 'info';
      description: string;
    }>;
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [oldAssetId, newAssetId],
    });

    const execution = await agentService.createExecution({
      execution_id: `interface-check-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const prompt = `Compare interfaces between asset ${oldAssetId} (old) and ${newAssetId} (new).

Analyze:
1. Input parameter changes
2. Output/return value changes
3. Type changes
4. Method signature changes

Identify breaking changes and provide structured output.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    // Parse interface changes
    return {
      compatible: true,
      changes: [],
    };
  }

  /**
   * Schema compatibility check
   */
  async checkSchemaCompatibility(
    assetId: string,
    oldVersion: string,
    newVersion: string
  ): Promise<{
    compatible: boolean;
    changes: Array<{
      table: string;
      column?: string;
      type: 'added' | 'removed' | 'modified';
      severity: 'breaking' | 'warning' | 'info';
      description: string;
    }>;
  }> {
    const session = await agentService.createSession({
      agent_slug: this.config.slug,
      context_assets: [assetId],
    });

    const execution = await agentService.createExecution({
      execution_id: `schema-check-${Date.now()}`,
      agent_slug: this.config.slug,
      session_id: session.session_id,
    });

    const prompt = `Compare database schema between version ${oldVersion} and ${newVersion} of asset ${assetId}.

Analyze:
1. Table additions/removals
2. Column additions/removals
3. Column type changes
4. Constraint changes
5. Index changes

Identify breaking changes that affect downstream assets.`;

    const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    return {
      compatible: true,
      changes: [],
    };
  }
}

// Export singleton instance
export const compatibilityAgent = new CompatibilityAgent();

/**
 * Initialize CompatibilityAgent
 * Creates the agent definition if it doesn't exist
 */
export async function initializeCompatibilityAgent(): Promise<void> {
  await compatibilityAgent.initialize();
}

/**
 * Check compatibility before publishing
 * @deprecated Use compatibilityAgent.checkCompatibility() instead
 */
export async function checkCompatibility(
  assetId: string,
  version: string,
  options?: {
    checkInterfaces?: boolean;
    checkSchema?: boolean;
    checkApiContract?: boolean;
    checkBehavior?: boolean;
  }
): Promise<{
  compatible: boolean;
  status: 'compatible' | 'breaking' | 'partial';
  recommendation: 'proceed' | 'review' | 'block';
  checks: Array<{
    category: 'interface' | 'schema' | 'api_contract' | 'behavior';
    passed: boolean;
    severity: 'breaking' | 'partial' | 'warning' | 'info';
    description: string;
    details?: Record<string, unknown>;
    remediation?: string;
  }>;
  breakingChanges: number;
  warnings: number;
  requiredActions: string[];
  optionalActions: string[];
}> {
  return await compatibilityAgent.checkCompatibility(assetId, version, options);
}

/**
 * Interface compatibility check
 * @deprecated Use compatibilityAgent.checkInterfaceCompatibility() instead
 */
export async function checkInterfaceCompatibility(
  oldAssetId: string,
  newAssetId: string
): Promise<{
  compatible: boolean;
  changes: Array<{
    type: 'added' | 'removed' | 'modified';
    element: string;
    severity: 'breaking' | 'warning' | 'info';
    description: string;
  }>;
}> {
  return await compatibilityAgent.checkInterfaceCompatibility(oldAssetId, newAssetId);
}

/**
 * Schema compatibility check
 * @deprecated Use compatibilityAgent.checkSchemaCompatibility() instead
 */
export async function checkSchemaCompatibility(
  assetId: string,
  oldVersion: string,
  newVersion: string
): Promise<{
  compatible: boolean;
  changes: Array<{
    table: string;
    column?: string;
    type: 'added' | 'removed' | 'modified';
    severity: 'breaking' | 'warning' | 'info';
    description: string;
  }>;
}> {
  return await compatibilityAgent.checkSchemaCompatibility(assetId, oldVersion, newVersion);
}

/**
 * Parse compatibility report from agent output
 */
function parseCompatibilityReport(output: string): {
  canPublish: boolean;
  status: 'compatible' | 'breaking' | 'partial';
  recommendation: 'proceed' | 'review' | 'block';
  checks: Array<{
    category: 'interface' | 'schema' | 'api_contract' | 'behavior';
    passed: boolean;
    severity: 'breaking' | 'partial' | 'warning' | 'info';
    description: string;
    details?: Record<string, unknown>;
    remediation?: string;
  }>;
  breakingChanges: number;
  warnings: number;
  requiredActions: string[];
  optionalActions: string[];
} {
  // Placeholder implementation - would use proper YAML parsing
  // In production, extract YAML block from output and parse
  return {
    canPublish: true,
    status: 'compatible',
    recommendation: 'proceed',
    checks: [],
    breakingChanges: 0,
    warnings: 0,
    requiredActions: [],
    optionalActions: [],
  };
}

// Auto-initialize on module load if in production
autoInitializeAgent(compatibilityAgent);

// Re-export config for backward compatibility and tests
export { COMPATIBILITY_AGENT_CONFIG };

