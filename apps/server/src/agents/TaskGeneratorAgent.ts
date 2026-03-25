/**
 * TaskGeneratorAgent - AI-Native DevOps Platform
 * Generates Task assets based on ImpactAgent analysis reports
 *
 * Phase 9.2: Workflow Orchestration - Task Generation
 */

import { eventBus, EventPayload } from '../services/EventBus';
import { assetService } from '../services/AssetService';
import { createLogger } from '../utils/logger';

const logger = createLogger('TaskGeneratorAgent');

// Task generation configuration
interface TaskGeneratorConfig {
  rules: {
    [changeType: string]: {
      tasks: TaskTemplate[];
      defaultPriority: 'high' | 'medium' | 'low';
      autoApproveThreshold: 'high_confidence' | 'medium' | 'none';
    };
  };
  enableRoutingSuggestion: boolean;
}

// Task template for generation
interface TaskTemplate {
  type: 'code_generation' | 'code_update' | 'test_generation' | 'test_update' | 'compatibility_check' | 'review';
  priority: 'high' | 'medium' | 'low';
  template: string;
  acceptanceCriteria: string[];
  suggestedAgent: string;
  estimatedEffortHours: number;
  dependsOn?: string[];
}

// Impact report structure (from ImpactAgent)
interface ImpactReport {
  source_asset: {
    id: string;
    name: string;
    version: string;
    previous_version: string;
  };
  change_summary: {
    breaking: number;
    additive: number;
    behavioral: number;
    categories: Array<{ category: string; changes: number }>;
  };
  impact_analysis: {
    affected_assets: Array<{
      asset_id: string;
      name: string;
      depth: number;
      severity: 'high' | 'medium' | 'low';
      confidence: number;
      impact_description: string;
      required_actions: string[];
      estimated_effort: string;
      auto_mark_dirty: boolean;
    }>;
  };
}

// Generated task structure
interface GeneratedTask {
  id: string;
  type: 'task';
  name: string;
  description: string;
  state: 'pending_review';
  task_type: string;
  priority: 'high' | 'medium' | 'low';
  acceptance_criteria: string[];
  estimated_effort: number;
  suggested_agent: string;
  parent_asset_id: string;
  impact_asset_id: string;
  generated_by: 'task-generator-agent';
}

// Default task generation rules
const DEFAULT_RULES: TaskGeneratorConfig['rules'] = {
  breaking_change: {
    tasks: [
      {
        type: 'code_update',
        priority: 'high',
        template: '更新 {asset_name} 以适配 {source_asset} 的 breaking changes',
        acceptanceCriteria: [
          '代码成功编译无错误',
          '所有接口调用已更新',
          '向后兼容处理完成',
        ],
        suggestedAgent: 'code-agent',
        estimatedEffortHours: 4,
      },
      {
        type: 'test_update',
        priority: 'high',
        template: '更新 {asset_name} 的测试用例',
        acceptanceCriteria: [
          '测试用例通过',
          '覆盖率不低于原标准',
          '边界测试完整',
        ],
        suggestedAgent: 'test-agent',
        estimatedEffortHours: 2,
        dependsOn: ['code_update'],
      },
      {
        type: 'compatibility_check',
        priority: 'medium',
        template: '检查 {asset_name} 与 {source_asset} 的兼容性',
        acceptanceCriteria: [
          '兼容性报告已生成',
          '所有不兼容点已记录',
          '迁移指南已更新',
        ],
        suggestedAgent: 'compatibility-agent',
        estimatedEffortHours: 1,
      },
    ],
    defaultPriority: 'high',
    autoApproveThreshold: 'high_confidence',
  },
  additive_change: {
    tasks: [
      {
        type: 'code_generation',
        priority: 'medium',
        template: '在 {asset_name} 中实现 {source_asset} 的新功能',
        acceptanceCriteria: [
          '新功能已实现',
          '代码符合规范',
          '文档已更新',
        ],
        suggestedAgent: 'code-agent',
        estimatedEffortHours: 3,
      },
      {
        type: 'test_generation',
        priority: 'medium',
        template: '为 {asset_name} 的新功能生成测试',
        acceptanceCriteria: [
          '测试覆盖新功能',
          '测试用例通过',
          '集成测试完成',
        ],
        suggestedAgent: 'test-agent',
        estimatedEffortHours: 2,
        dependsOn: ['code_implementation'],
      },
    ],
    defaultPriority: 'medium',
    autoApproveThreshold: 'medium',
  },
  behavioral_change: {
    tasks: [
      {
        type: 'review',
        priority: 'high',
        template: '审查 {asset_name} 的行为变更影响',
        acceptanceCriteria: [
          '行为变更已确认',
          '影响范围已评估',
          '回滚方案已准备',
        ],
        suggestedAgent: 'user', // 人工审查
        estimatedEffortHours: 1,
      },
    ],
    defaultPriority: 'high',
    autoApproveThreshold: 'none',
  },
};

/**
 * TaskGeneratorAgent - Generates tasks from impact analysis
 */
export class TaskGeneratorAgent {
  private config: TaskGeneratorConfig;
  private unsubscribe?: () => void;

  constructor(config?: Partial<TaskGeneratorConfig>) {
    this.config = {
      rules: { ...DEFAULT_RULES, ...config?.rules },
      enableRoutingSuggestion: config?.enableRoutingSuggestion ?? true,
    };
  }

  /**
   * Initialize and subscribe to events
   */
  initialize(): void {
    this.unsubscribe = eventBus.subscribe(
      'impact.analysis.completed',
      this.handleImpactAnalysisCompleted.bind(this)
    );
    logger.info('TaskGeneratorAgent initialized');
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    logger.info('TaskGeneratorAgent shutdown');
  }

  /**
   * Handle impact analysis completion event
   */
  private async handleImpactAnalysisCompleted(event: EventPayload): Promise<void> {
    try {
      const { impactReport, projectId } = event.payload as {
        impactReport: ImpactReport;
        projectId: string;
      };

      logger.info('Received impact analysis, generating tasks', {
        sourceAsset: impactReport.source_asset.id,
        affectedCount: impactReport.impact_analysis.affected_assets.length,
      });

      const tasks = await this.generateTasks(impactReport, projectId);

      // Publish tasks generated event
      await eventBus.publish(
        'tasks.generated',
        {
          taskIds: tasks.map((t) => t.id),
          sourceAssetId: impactReport.source_asset.id,
          count: tasks.length,
        },
        {
          source: 'TaskGeneratorAgent',
          projectId,
        }
      );

      logger.info('Tasks generated successfully', { count: tasks.length });
    } catch (error) {
      logger.error('Failed to handle impact analysis:', error);
    }
  }

  /**
   * Generate tasks from impact report
   */
  async generateTasks(
    impactReport: ImpactReport,
    projectId: string
  ): Promise<GeneratedTask[]> {
    const tasks: GeneratedTask[] = [];
    const { source_asset, change_summary, impact_analysis } = impactReport;

    // Determine change types from summary
    const changeTypes = this.determineChangeTypes(change_summary);

    // Generate tasks for each affected asset
    for (const affected of impact_analysis.affected_assets) {
      if (!affected.auto_mark_dirty) {
        continue; // Skip assets not marked dirty
      }

      for (const changeType of changeTypes) {
        const rules = this.config.rules[changeType];
        if (!rules) continue;

        for (const template of rules.tasks) {
          const taskData = this.createTaskFromTemplate(
            template,
            affected,
            source_asset,
            projectId,
            changeType
          );

          // Persist task to database
          const savedTask = await this.persistTask(taskData, projectId);
          if (savedTask) {
            tasks.push(savedTask);
          }
        }
      }
    }

    return tasks;
  }

  /**
   * Determine change types from summary
   */
  private determineChangeTypes(summary: ImpactReport['change_summary']): string[] {
    const types: string[] = [];
    if (summary.breaking > 0) types.push('breaking_change');
    if (summary.additive > 0) types.push('additive_change');
    if (summary.behavioral > 0) types.push('behavioral_change');
    return types.length > 0 ? types : ['additive_change']; // Default
  }

  /**
   * Create task from template
   */
  private createTaskFromTemplate(
    template: TaskTemplate,
    affected: ImpactReport['impact_analysis']['affected_assets'][0],
    sourceAsset: ImpactReport['source_asset'],
    _projectId: string, // Reserved for future use
    _changeType: string // Reserved for future use
  ): Omit<GeneratedTask, 'id'> {
    // Build description from template
    const description = template.template
      .replace('{asset_name}', affected.name)
      .replace('{source_asset}', sourceAsset.name);

    return {
      type: 'task',
      name: `${this.getTaskTypeLabel(template.type)}: ${affected.name}`,
      description,
      state: 'pending_review',
      task_type: template.type,
      priority: template.priority,
      acceptance_criteria: template.acceptanceCriteria,
      estimated_effort: template.estimatedEffortHours,
      suggested_agent: template.suggestedAgent,
      parent_asset_id: sourceAsset.id,
      impact_asset_id: affected.asset_id,
      generated_by: 'task-generator-agent',
    };
  }

  /**
   * Get human-readable task type label
   */
  private getTaskTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      code_generation: '代码生成',
      code_update: '代码更新',
      test_generation: '测试生成',
      test_update: '测试更新',
      compatibility_check: '兼容性检查',
      review: '人工审查',
    };
    return labels[type] || type;
  }

  /**
   * Persist task to database
   */
  private async persistTask(
    task: Omit<GeneratedTask, 'id'>,
    projectId: string
  ): Promise<GeneratedTask | null> {
    try {
      // Use assetService to create task as an asset
      const asset = await assetService.create({
        name: task.name,
        slug: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        description: task.description,
        type: 'task',
        project_id: projectId,
        metadata: {
          task_type: task.task_type,
          priority: task.priority,
          acceptance_criteria: task.acceptance_criteria,
          estimated_effort: task.estimated_effort,
          suggested_agent: task.suggested_agent,
          parent_asset_id: task.parent_asset_id,
          impact_asset_id: task.impact_asset_id,
          generated_by: task.generated_by,
          state: 'pending_review',
        },
      });

      return {
        ...task,
        id: asset.id,
      };
    } catch (error) {
      logger.error('Failed to persist task:', error);
      return null;
    }
  }

  /**
   * Execute task generation manually
   */
  async execute(
    impactReportId: string,
    policy: 'all' | 'high_confidence_only' | 'breaking_only' = 'all'
  ): Promise<{ tasks: GeneratedTask[]; summary: { total: number; byType: Record<string, number> } }> {
    // In real implementation, fetch impact report from database
    logger.info('Manual task generation requested', { impactReportId, policy });

    // Placeholder - would fetch and process
    return {
      tasks: [],
      summary: { total: 0, byType: {} },
    };
  }
}

// Singleton instance
export const taskGeneratorAgent = new TaskGeneratorAgent();

// Initialize on module load (if not in test environment)
if (process.env.NODE_ENV !== 'test') {
  taskGeneratorAgent.initialize();
}
