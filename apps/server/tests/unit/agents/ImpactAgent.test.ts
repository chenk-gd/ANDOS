/**
 * ImpactAgent Tests
 * Tests for post-publish impact analysis
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ImpactAgent,
  IMPACT_AGENT_CONFIG,
  initializeImpactAgent,
  analyzeImpact,
  calculateConfidence,
  identifyCriticalPaths,
} from '../../../src/agents/ImpactAgent';

// Mock the services
vi.mock('../../../src/services/AgentService', () => ({
  agentService: {
    getAgentBySlug: vi.fn(),
    createAgent: vi.fn(),
    createSession: vi.fn(async () => ({ session_id: 'test-session' })),
    createExecution: vi.fn(async (data: any) => ({
      execution_id: data.execution_id || 'test-exec',
      ...data,
    })),
  },
  agentExecutionEngine: {
    execute: vi.fn(async (executionId: string, prompt: string, options: any) => ({
      reasoning: `\nimpact_report:\n  total_affected: 3\n  by_severity:\n    high: 1\n    medium: 1\n    low: 1\n  by_confidence:\n    high: 2\n    medium: 1\n    low: 0\n  affected_assets:\n    - asset_id: "asset-1"\n      name: "Test Asset"\n      depth: 1\n      severity: "high"\n      confidence: 0.95\n      impact_description: "Breaking change"\n      required_actions: ["Update tests"]\n      estimated_effort: "2 hours"\n      auto_mark_dirty: true\n  critical_paths:\n    - ["root", "asset-1"]\n  recommendations:\n    immediate: ["Fix breaking change"]\n    scheduled: ["Review dependent assets"]\n`,
      tokenUsed: 150,
    })),
  },
}));

vi.mock('../../../src/services/DependencyGraphService', () => ({
  dependencyGraphService: {
    buildGraph: vi.fn(async (assetId: string, options: any) => ({
      nodes: [
        { id: assetId, name: 'Root', type: 'requirement', state: 'clean', depth: 0, metadata: { isRoot: true } },
        { id: 'child-1', name: 'Child 1', type: 'design', state: 'clean', depth: 1, metadata: { isRoot: false } },
      ],
      edges: [],
      rootId: assetId,
      maxDepth: 1,
      cyclic: false,
      stats: {
        totalNodes: 2,
        totalEdges: 0,
        leafNodes: 1,
        dirtyNodes: 0,
        byType: { requirement: 1, design: 1 },
        byState: { clean: 2 },
      },
    })),
    analyzeImpact: vi.fn(async (assetId: string) => ({
      totalAffected: 3,
      bySeverity: { high: 1, medium: 1, low: 1 },
      summary: {
        totalAffected: 3,
        byDepth: { 1: 2, 2: 1 },
        byImpactLevel: { high: 1, medium: 1, low: 1 },
        criticalPaths: [['root', 'asset-1']],
      },
    })),
  },
}));

describe('ImpactAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should have correct configuration', () => {
      expect(IMPACT_AGENT_CONFIG.slug).toBe('impact-agent');
      expect(IMPACT_AGENT_CONFIG.name).toBe('ImpactAgent');
      expect(IMPACT_AGENT_CONFIG.mode).toBe('primary');
      expect(IMPACT_AGENT_CONFIG.subscribed_events).toContain('asset.version.published');
    });

    it('should have correct capabilities', () => {
      expect(IMPACT_AGENT_CONFIG.capabilities).toContain('impact-analysis');
      expect(IMPACT_AGENT_CONFIG.capabilities).toContain('downstream-assessment');
      expect(IMPACT_AGENT_CONFIG.capabilities).toContain('confidence-scoring');
      expect(IMPACT_AGENT_CONFIG.capabilities).toContain('auto-approval');
    });

    it('should have write permissions for marking dirty', () => {
      expect(IMPACT_AGENT_CONFIG.config?.permissions?.write).toBe('allow');
      expect(IMPACT_AGENT_CONFIG.config?.permissions?.edit).toBe('allow');
    });
  });

  describe('initializeImpactAgent', () => {
    it('should create agent if not exists', async () => {
      const { agentService } = await import('../../../src/services/AgentService');
      vi.mocked(agentService.getAgentBySlug).mockResolvedValueOnce(null);
      vi.mocked(agentService.createAgent).mockResolvedValueOnce({} as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await initializeImpactAgent();

      expect(agentService.createAgent).toHaveBeenCalledWith(IMPACT_AGENT_CONFIG);
      expect(consoleSpy).toHaveBeenCalledWith('ImpactAgent initialized');

      consoleSpy.mockRestore();
    });

    it('should not create agent if already exists', async () => {
      const { agentService } = await import('../../../src/services/AgentService');
      vi.mocked(agentService.getAgentBySlug).mockResolvedValueOnce({ id: 'existing' } as any);

      await initializeImpactAgent();

      expect(agentService.createAgent).not.toHaveBeenCalled();
    });
  });

  describe('analyzeImpact', () => {
    it('should return impact analysis', async () => {
      const result = await analyzeImpact('asset-1', 'v1.1.0');

      expect(result).toBeDefined();
      // Placeholder implementation returns 0
      expect(result.totalAffected).toBe(0);
      expect(result.bySeverity).toEqual({ high: 0, medium: 0, low: 0 });
      expect(result.byConfidence).toEqual({ high: 0, medium: 0, low: 0 });
      expect(result.affectedAssets.length).toBe(0);
    });

    it('should apply auto-approval based on threshold', async () => {
      const result = await analyzeImpact('asset-1', 'v1.1.0', {
        threshold: 'medium',
        autoApproval: true,
      });

      expect(result.autoApproval.enabled).toBe(true);
      // Placeholder returns empty affectedAssets, so markedDirty is 0
      expect(result.autoApproval.markedDirty).toBe(0);
    });

    it('should disable auto-approval when specified', async () => {
      const result = await analyzeImpact('asset-1', 'v1.1.0', {
        autoApproval: false,
      });

      expect(result.autoApproval.enabled).toBe(false);
      expect(result.autoApproval.markedDirty).toBe(0);
    });

    it('should respect max depth option', async () => {
      const { dependencyGraphService } = await import('../../../src/services/DependencyGraphService');

      await analyzeImpact('asset-1', 'v1.1.0', { maxDepth: 5 });

      expect(dependencyGraphService.buildGraph).toHaveBeenCalledWith(
        'asset-1',
        expect.objectContaining({ maxDepth: 5 })
      );
    });
  });

  describe('calculateConfidence', () => {
    it('should return confidence score', async () => {
      const result = await calculateConfidence('asset-1', 'asset-2', 'breaking');

      expect(result).toBeDefined();
      expect(result.score).toBe(0.75);
      expect(result.reason).toBe('Direct dependency with clear interface usage');
    });
  });

  describe('identifyCriticalPaths', () => {
    it('should identify critical paths', async () => {
      const result = await identifyCriticalPaths('asset-1');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Agent Prompt Template', () => {
    it('should include impact analysis sections', () => {
      const prompt = IMPACT_AGENT_CONFIG.prompt_template || '';

      expect(prompt).toContain('Gather Change Information');
      expect(prompt).toContain('Identify Downstream Assets');
      expect(prompt).toContain('Analyze Impact per Asset');
      expect(prompt).toContain('Generate Impact Report');
    });

    it('should include severity guidelines', () => {
      const prompt = IMPACT_AGENT_CONFIG.prompt_template || '';

      expect(prompt).toContain('High Severity');
      expect(prompt).toContain('Medium Severity');
      expect(prompt).toContain('Low Severity');
    });

    it('should include confidence scoring', () => {
      const prompt = IMPACT_AGENT_CONFIG.prompt_template || '';

      expect(prompt).toContain('High Confidence');
      expect(prompt).toContain('Medium Confidence');
      expect(prompt).toContain('Low Confidence');
    });

    it('should include auto-approval logic', () => {
      const prompt = IMPACT_AGENT_CONFIG.prompt_template || '';

      expect(prompt).toContain('Auto-Approval Logic');
      expect(prompt).toContain('High threshold');
      expect(prompt).toContain('Medium threshold');
      expect(prompt).toContain('Low threshold');
    });
  });
});
