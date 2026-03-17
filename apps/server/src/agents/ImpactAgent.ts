/**
 * ImpactAgent - AI-Native DevOps Platform
 * Post-publish impact analysis agent
 *
 * V1.5: Scenario 9.6 - Post-publish impact analysis
 */

import { agentService, agentExecutionEngine } from '../services/AgentService';
import { dependencyGraphService } from '../services/DependencyGraphService';
import { CreateAgentInput } from '../types/agent';

// ImpactAgent system prompt
const IMPACT_AGENT_PROMPT = `You are ImpactAgent, an expert in analyzing the downstream impact of asset changes after publication.

Your responsibilities:
1. Analyze changes between versions
2. Identify affected downstream assets
3. Assess impact severity and confidence levels
4. Generate structured impact reports
5. Recommend actions for downstream assets
6. Trigger automatic dirty marking based on thresholds

## Impact Analysis Process

1. **Gather Change Information**:
   - Get the diff between old and new version
   - Identify the type of changes (breaking, additive, behavioral)
   - Categorize changes by scope

2. **Identify Downstream Assets**:
   - Query the dependency DAG
   - Get all direct and transitive dependents
   - Filter by relevance to the changes

3. **Analyze Impact per Asset**:
   - Assess how changes affect each dependent
   - Calculate confidence level
   - Determine severity (high/medium/low)
   - Identify required actions

4. **Generate Impact Report**:
   - Summary statistics
   - Detailed impact per asset
   - Recommended actions
   - Confidence scores

## Output Format

\`\`\`yaml
impact_report:
  source_asset:
    id: "asset-xxx"
    name: "User Service"
    version: "1.1.0"
    previous_version: "1.0.0"
    published_at: "2026-03-13T10:00:00Z"

  change_summary:
    total_changes: 5
    breaking: 1
    additive: 2
    behavioral: 2
    categories:
      - category: "interface"
        changes: 2
      - category: "schema"
        changes: 1
      - category: "behavior"
        changes: 2

  impact_analysis:
    total_affected: 8
    by_severity:
      high: 2
      medium: 3
      low: 3
    by_confidence:
      high: 5
      medium: 2
      low: 1

    affected_assets:
      - asset_id: "test-xxx"
        name: "User Service Tests"
        depth: 1
        severity: "high"
        confidence: 0.95
        confidence_reason: "Direct dependency, test assertions reference changed interface"
        impact_description: "Test cases will fail due to changed return type of createUser method"
        required_actions:
          - "Update test assertions"
          - "Regenerate test mocks"
        estimated_effort: "2-4 hours"
        auto_mark_dirty: true

      - asset_id: "frontend-xxx"
        name: "User Dashboard"
        depth: 2
        severity: "medium"
        confidence: 0.75
        confidence_reason: "Indirect dependency through API layer"
        impact_description: "May need UI updates if user object structure changed"
        required_actions:
          - "Verify UI rendering with new data structure"
          - "Update type definitions"
        estimated_effort: "1-2 hours"
        auto_mark_dirty: true

      - asset_id: "reporting-xxx"
        name: "Analytics Pipeline"
        depth: 3
        severity: "low"
        confidence: 0.60
        confidence_reason: "Distant dependency, may not be affected"
        impact_description: "Likely unaffected but should be verified"
        required_actions:
          - "Monitor pipeline execution"
        estimated_effort: "30 minutes"
        auto_mark_dirty: false

      - asset_id: "docs-xxx"
        name: "API Documentation"
        depth: 1
        severity: "high"
        confidence: 0.98
        confidence_reason: "Direct documentation dependency"
        impact_description: "Documentation is outdated and must be updated"
        required_actions:
          - "Update API reference"
          - "Add changelog entry"
          - "Publish new docs version"
        estimated_effort: "2-3 hours"
        auto_mark_dirty: true

  recommendations:
    immediate_actions:
      - "Update User Service Tests (high confidence impact)"
      - "Update API Documentation"
    scheduled_reviews:
      - "Review User Dashboard within 24 hours"
      - "Monitor Analytics Pipeline for 48 hours"
    no_action_required:
      - []

  auto_approval:
    enabled: true
    threshold: "medium"
    assets_marked_dirty: 5
    assets_requiring_review: 2
    notifications_sent: 7

  critical_paths:
    - path: ["asset-xxx", "test-xxx"]
      impact: "high"
      reason: "Tests will fail immediately"
    - path: ["asset-xxx", "api-gateway", "frontend-xxx"]
      impact: "medium"
      reason: "User-facing UI may be affected"

  conclusion:
    summary: "Publication affects 8 downstream assets. 2 high-severity impacts require immediate attention."
    risk_level: "medium"
    suggested_threshold: "medium"
    proceed_recommendation: "Continue with monitoring. Ensure tests and docs are updated promptly."
\`\`\`

## Severity Guidelines

**High Severity**:
- Breaking changes to interfaces used by dependents
- Schema changes that cause data incompatibility
- Behavior changes that alter business logic

**Medium Severity**:
- Additive changes that may require dependent updates
- Performance changes that could affect system behavior
- Optional feature changes

**Low Severity**:
- Internal changes with no external impact
- Documentation-only changes
- Performance improvements with no API changes

## Confidence Scoring

**High Confidence (0.8-1.0)**:
- Direct dependencies with clear interface usage
- Static analysis shows definite impact
- Previous similar changes had predictable effects

**Medium Confidence (0.5-0.8)**:
- Indirect dependencies
- Some uncertainty about actual usage
- Complex interaction patterns

**Low Confidence (0.0-0.5)**:
- Distant dependencies
- Unclear relationship to changes
- May not be affected at all

## Auto-Approval Logic

When auto_approval is enabled:

- **High threshold**: Only mark high-severity impacts dirty
- **Medium threshold**: Mark high and medium severity dirty
- **Low threshold**: Mark all affected assets dirty
- **Off**: Never auto-mark, only generate report

## Available Tools

- fetch_asset: Get asset content and metadata
- query_dag: Get dependency graph
- read: Read file contents
- analyze_impact: Calculate impact metrics

## Best Practices

- Always provide confidence scores with reasoning
- Estimate effort for required actions
- Identify critical paths that need immediate attention
- Consider both technical and business impact
- Be conservative with auto-approval thresholds
`;

// ImpactAgent configuration
export const IMPACT_AGENT_CONFIG: CreateAgentInput = {
  slug: 'impact-agent',
  name: 'ImpactAgent',
  description: 'Post-publish impact analyzer that identifies affected downstream assets and recommends actions',
  mode: 'primary',
  capabilities: ['impact-analysis', 'downstream-assessment', 'confidence-scoring', 'auto-approval'],
  trigger_mode: 'event',
  subscribed_events: ['asset.version.published'],
  config: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    maxTokens: 8192,
    tools: {
      fetch_asset: true,
      read: true,
      query_dag: true,
      bash: { '*': 'deny' },
    },
    permissions: {
      read: 'allow',
      write: 'allow', // Needed to mark assets dirty
      edit: 'allow',
      bash: { '*': 'deny' },
    },
  },
  prompt_template: IMPACT_AGENT_PROMPT,
};

/**
 * Initialize ImpactAgent
 */
export async function initializeImpactAgent(): Promise<void> {
  const existing = await agentService.getAgentBySlug(IMPACT_AGENT_CONFIG.slug);

  if (!existing) {
    await agentService.createAgent(IMPACT_AGENT_CONFIG);
    console.log('ImpactAgent initialized');
  }
}

/**
 * Analyze impact after publishing
 */
export async function analyzeImpact(
  assetId: string,
  version: string,
  options?: {
    maxDepth?: number;
    threshold?: 'high' | 'medium' | 'low';
    autoApproval?: boolean;
  }
): Promise<{
  totalAffected: number;
  bySeverity: { high: number; medium: number; low: number };
  byConfidence: { high: number; medium: number; low: number };
  affectedAssets: Array<{
    assetId: string;
    name: string;
    depth: number;
    severity: 'high' | 'medium' | 'low';
    confidence: number;
    impactDescription: string;
    requiredActions: string[];
    estimatedEffort: string;
    autoMarkDirty: boolean;
  }>;
  criticalPaths: string[][];
  recommendations: {
    immediate: string[];
    scheduled: string[];
  };
  autoApproval: {
    enabled: boolean;
    markedDirty: number;
    notificationsSent: number;
  };
}> {
  const session = await agentService.createSession({
    agent_slug: IMPACT_AGENT_CONFIG.slug,
    context_assets: [assetId],
  });

  const execution = await agentService.createExecution({
    execution_id: `impact-${Date.now()}`,
    agent_slug: IMPACT_AGENT_CONFIG.slug,
    session_id: session.session_id,
    source_asset_id: assetId,
    trigger_event_type: 'asset.version.published',
  });

  const maxDepth = options?.maxDepth || 10;
  const threshold = options?.threshold || 'medium';
  const autoApproval = options?.autoApproval !== false;

  // First, get the dependency graph
  const graph = await dependencyGraphService.buildGraph(assetId, {
    direction: 'downstream',
    maxDepth,
  });

  const prompt = `Analyze impact of publishing asset ${assetId} version ${version}.

Dependency Graph:
- Total downstream nodes: ${graph.nodes.length}
- Max depth: ${graph.maxDepth}
- Cyclic: ${graph.cyclic}

Analyze:
1. Changes between versions
2. Impact on each downstream asset
3. Severity assessment
4. Confidence scoring
5. Required actions

Auto-approval threshold: ${threshold}
Max analysis depth: ${maxDepth}

Provide structured impact report in the specified YAML format.`;

  const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
    maxTokens: 8192,
    temperature: 0.2,
  });

  // Parse impact report
  const report = parseImpactReport(result.reasoning || '');

  // Apply auto-approval logic
  let markedDirtyCount = 0;
  let notificationsSent = 0;

  if (autoApproval) {
    for (const asset of report.affectedAssets) {
      const shouldMarkDirty =
        (threshold === 'high' && asset.severity === 'high') ||
        (threshold === 'medium' && (asset.severity === 'high' || asset.severity === 'medium')) ||
        (threshold === 'low');

      if (shouldMarkDirty) {
        asset.autoMarkDirty = true;
        markedDirtyCount++;
      }
      notificationsSent++;
    }
  }

  return {
    totalAffected: report.totalAffected,
    bySeverity: report.bySeverity,
    byConfidence: report.byConfidence,
    affectedAssets: report.affectedAssets,
    criticalPaths: report.criticalPaths,
    recommendations: report.recommendations,
    autoApproval: {
      enabled: autoApproval,
      markedDirty: markedDirtyCount,
      notificationsSent,
    },
  };
}

/**
 * Calculate confidence score for impact
 */
export async function calculateConfidence(
  sourceAssetId: string,
  targetAssetId: string,
  changeType: 'breaking' | 'additive' | 'behavioral'
): Promise<{
  score: number;
  reason: string;
  factors: Array<{ factor: string; weight: number; contribution: number }>;
}> {
  const session = await agentService.createSession({
    agent_slug: IMPACT_AGENT_CONFIG.slug,
    context_assets: [sourceAssetId, targetAssetId],
  });

  const execution = await agentService.createExecution({
    execution_id: `confidence-${Date.now()}`,
    agent_slug: IMPACT_AGENT_CONFIG.slug,
    session_id: session.session_id,
  });

  const prompt = `Calculate confidence score for impact of changes in ${sourceAssetId} on ${targetAssetId}.

Change type: ${changeType}

Analyze:
1. Dependency relationship (direct/indirect)
2. Interface usage patterns
3. Historical change impact data
4. Code analysis

Provide confidence score (0.0-1.0) with reasoning.`;

  const result = await agentExecutionEngine.execute(execution.execution_id, prompt, {
    maxTokens: 2048,
    temperature: 0.2,
  });

  // Parse confidence score
  return {
    score: 0.75, // Placeholder
    reason: 'Direct dependency with clear interface usage',
    factors: [],
  };
}

/**
 * Identify critical paths that need immediate attention
 */
export async function identifyCriticalPaths(
  assetId: string,
  options?: { maxPaths?: number }
): Promise<Array<{ path: string[]; impact: string; reason: string }>> {
  // Use the dependency graph service to find critical paths
  const graph = await dependencyGraphService.buildGraph(assetId, {
    direction: 'downstream',
    maxDepth: 5,
  });

  const criticalPaths: Array<{ path: string[]; impact: string; reason: string }> = [];

  // Find high-impact paths (depth 1 with dirty state or similar)
  const immediateDependents = graph.nodes.filter((n) => n.depth === 1);
  for (const dep of immediateDependents) {
    if (dep.state === 'dirty' || dep.metadata?.hasDirtyUpstream) {
      criticalPaths.push({
        path: [assetId, dep.id],
        impact: 'high',
        reason: 'Immediate dependent with dirty status',
      });
    }
  }

  return criticalPaths.slice(0, options?.maxPaths || 5);
}

/**
 * Parse impact report from agent output
 */
function parseImpactReport(output: string): {
  totalAffected: number;
  bySeverity: { high: number; medium: number; low: number };
  byConfidence: { high: number; medium: number; low: number };
  affectedAssets: Array<{
    assetId: string;
    name: string;
    depth: number;
    severity: 'high' | 'medium' | 'low';
    confidence: number;
    impactDescription: string;
    requiredActions: string[];
    estimatedEffort: string;
    autoMarkDirty: boolean;
  }>;
  criticalPaths: string[][];
  recommendations: { immediate: string[]; scheduled: string[] };
} {
  // Placeholder implementation - would use proper YAML parsing
  return {
    totalAffected: 0,
    bySeverity: { high: 0, medium: 0, low: 0 },
    byConfidence: { high: 0, medium: 0, low: 0 },
    affectedAssets: [],
    criticalPaths: [],
    recommendations: { immediate: [], scheduled: [] },
  };
}

// Auto-initialize
if (process.env.NODE_ENV === 'production') {
  initializeImpactAgent().catch(console.error);
}
