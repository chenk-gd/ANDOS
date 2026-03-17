/**
 * CompatibilityAgent Tests
 * Tests for pre-publish compatibility checking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompatibilityAgent,
  COMPATIBILITY_AGENT_CONFIG,
  initializeCompatibilityAgent,
  checkCompatibility,
  checkInterfaceCompatibility,
  checkSchemaCompatibility,
} from '../../../src/agents/CompatibilityAgent';

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
      reasoning: `\ncompatibility_report:\n  asset_id: "asset-xxx"\n  version: "1.1.0"\n  previous_version: "1.0.0"\n  can_publish: true\n  status: "compatible"\n  recommendation: "proceed"\n  checks: []\n  breaking_changes: 0\n  warnings: 0\n  required_actions: []\n  optional_actions: []\n`,
      tokenUsed: 100,
    })),
  },
}));

describe('CompatibilityAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should have correct configuration', () => {
      expect(COMPATIBILITY_AGENT_CONFIG.slug).toBe('compatibility-agent');
      expect(COMPATIBILITY_AGENT_CONFIG.name).toBe('CompatibilityAgent');
      expect(COMPATIBILITY_AGENT_CONFIG.mode).toBe('primary');
      expect(COMPATIBILITY_AGENT_CONFIG.subscribed_events).toContain('asset.version.pre_publish');
    });

    it('should have correct capabilities', () => {
      expect(COMPATIBILITY_AGENT_CONFIG.capabilities).toContain('compatibility-check');
      expect(COMPATIBILITY_AGENT_CONFIG.capabilities).toContain('breaking-change-detection');
      expect(COMPATIBILITY_AGENT_CONFIG.capabilities).toContain('interface-analysis');
      expect(COMPATIBILITY_AGENT_CONFIG.capabilities).toContain('schema-analysis');
    });

    it('should have correct permissions', () => {
      expect(COMPATIBILITY_AGENT_CONFIG.config?.permissions?.read).toBe('allow');
      expect(COMPATIBILITY_AGENT_CONFIG.config?.permissions?.write).toBe('deny');
      expect(COMPATIBILITY_AGENT_CONFIG.config?.permissions?.edit).toBe('deny');
    });
  });

  describe('initializeCompatibilityAgent', () => {
    it('should create agent if not exists', async () => {
      const { agentService } = await import('../../../src/services/AgentService');
      vi.mocked(agentService.getAgentBySlug).mockResolvedValueOnce(null);
      vi.mocked(agentService.createAgent).mockResolvedValueOnce({} as any);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await initializeCompatibilityAgent();

      expect(agentService.createAgent).toHaveBeenCalledWith(COMPATIBILITY_AGENT_CONFIG);
      expect(consoleSpy).toHaveBeenCalledWith('CompatibilityAgent initialized');

      consoleSpy.mockRestore();
    });

    it('should not create agent if already exists', async () => {
      const { agentService } = await import('../../../src/services/AgentService');
      vi.mocked(agentService.getAgentBySlug).mockResolvedValueOnce({ id: 'existing' } as any);

      await initializeCompatibilityAgent();

      expect(agentService.createAgent).not.toHaveBeenCalled();
    });
  });

  describe('checkCompatibility', () => {
    it('should return compatibility report', async () => {
      const result = await checkCompatibility('asset-1', 'v1.1.0');

      expect(result).toBeDefined();
      expect(result.compatible).toBe(true);
      expect(result.status).toBe('compatible');
      expect(result.recommendation).toBe('proceed');
      expect(result.checks).toEqual([]);
    });

    it('should use specified check options', async () => {
      const { agentExecutionEngine } = await import('../../../src/services/AgentService');

      await checkCompatibility('asset-1', 'v1.1.0', {
        checkInterfaces: true,
        checkSchema: true,
        checkApiContract: false,
        checkBehavior: false,
      });

      expect(agentExecutionEngine.execute).toHaveBeenCalled();
      const prompt = vi.mocked(agentExecutionEngine.execute).mock.calls[0][1];
      expect(prompt).toContain('interface');
      expect(prompt).toContain('schema');
    });
  });

  describe('checkInterfaceCompatibility', () => {
    it('should analyze interface compatibility', async () => {
      const result = await checkInterfaceCompatibility('asset-old', 'asset-new');

      expect(result).toBeDefined();
      expect(result.compatible).toBe(true);
      expect(result.changes).toEqual([]);
    });
  });

  describe('checkSchemaCompatibility', () => {
    it('should analyze schema compatibility', async () => {
      const result = await checkSchemaCompatibility('asset-1', 'v1.0.0', 'v1.1.0');

      expect(result).toBeDefined();
      expect(result.compatible).toBe(true);
      expect(result.changes).toEqual([]);
    });
  });

  describe('Agent Prompt Template', () => {
    it('should include all check categories', () => {
      const prompt = COMPATIBILITY_AGENT_CONFIG.prompt_template || '';

      expect(prompt).toContain('Interface Analysis');
      expect(prompt).toContain('Schema Analysis');
      expect(prompt).toContain('API contract');
      expect(prompt).toContain('Behavioral Analysis');
    });

    it('should include severity levels', () => {
      const prompt = COMPATIBILITY_AGENT_CONFIG.prompt_template || '';

      expect(prompt).toContain('breaking');
      expect(prompt).toContain('warning');
      expect(prompt).toContain('info');
    });

    it('should include decision guidelines', () => {
      const prompt = COMPATIBILITY_AGENT_CONFIG.prompt_template || '';

      expect(prompt).toContain('Proceed');
      expect(prompt).toContain('Review');
      expect(prompt).toContain('Block');
    });
  });
});
