<template>
  <div v-if="task" class="task-detail-panel">
    <!-- Header Info -->
    <div class="task-detail-panel__header">
      <div class="task-detail-panel__badges">
        <el-tag
          v-if="task.metadata?.priority"
          :type="priorityType(task.metadata.priority)"
          size="small"
        >
          {{ task.metadata.priority }} priority
        </el-tag>
        <el-tag size="small" effect="plain">
          {{ formatTaskType(task.metadata?.task_type) }}
        </el-tag>
        <el-tag :type="statusType(task.metadata?.state || task.state)" size="small">
          {{ formatStatus(task.metadata?.state || task.state) }}
        </el-tag>
      </div>
      <p class="task-detail-panel__id">Task ID: {{ task.id }}</p>
    </div>

    <el-divider />

    <!-- Description -->
    <div class="task-detail-panel__section">
      <h4>Description</h4>
      <p class="task-detail-panel__description">{{ task.description }}</p>
    </div>

    <!-- Acceptance Criteria -->
    <div v-if="task.metadata?.acceptance_criteria?.length" class="task-detail-panel__section">
      <h4>Acceptance Criteria</h4>
      <ul class="task-detail-panel__list">
        <li v-for="(criterion, index) in task.metadata.acceptance_criteria" :key="index">
          <el-icon><Check /></el-icon>
          {{ criterion }}
        </li>
      </ul>
    </div>

    <!-- Router Recommendation -->
    <div v-if="task.metadata?.router_recommendation" class="task-detail-panel__section">
      <h4>Agent Recommendation</h4>
      <div class="task-detail-panel__recommendation">
        <div class="task-detail-panel__agent">
          <el-avatar :size="32" :icon="User" />
          <div class="task-detail-panel__agent-info">
            <span class="task-detail-panel__agent-name">
              {{ formatAgent(task.metadata.router_recommendation.agent_id) }}
            </span>
            <el-tag
              :type="confidenceType(task.metadata.router_recommendation.confidence)"
              size="small"
            >
              {{ Math.round(task.metadata.router_recommendation.confidence * 100) }}% confidence
            </el-tag>
          </div>
        </div>
        <p class="task-detail-panel__reason">{{ task.metadata.router_recommendation.reason }}</p>
      </div>
    </div>

    <!-- Assignment Info -->
    <div v-if="task.metadata?.assigned_agent" class="task-detail-panel__section">
      <h4>Assignment</h4>
      <div class="task-detail-panel__assignment">
        <el-avatar :size="32" :icon="UserFilled" />
        <div class="task-detail-panel__assignment-info">
          <span class="task-detail-panel__assignment-agent">
            {{ formatAgent(task.metadata.assigned_agent) }}
          </span>
          <span v-if="task.metadata.assigned_at" class="task-detail-panel__assignment-time">
            Assigned {{ formatDate(task.metadata.assigned_at) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Execution Info -->
    <div v-if="task.metadata?.execution_started_at" class="task-detail-panel__section">
      <h4>Execution</h4>
      <div class="task-detail-panel__execution">
        <div class="task-detail-panel__execution-item">
          <span class="task-detail-panel__label">Started:</span>
          <span>{{ formatDateTime(task.metadata.execution_started_at) }}</span>
        </div>
        <div v-if="task.metadata.execution_completed_at" class="task-detail-panel__execution-item">
          <span class="task-detail-panel__label">Completed:</span>
          <span>{{ formatDateTime(task.metadata.execution_completed_at) }}</span>
        </div>
        <div v-if="task.metadata.execution_output" class="task-detail-panel__execution-item">
          <span class="task-detail-panel__label">Output:</span>
          <pre class="task-detail-panel__output">{{ task.metadata.execution_output }}</pre>
        </div>
        <div v-if="task.metadata.execution_artifacts?.length" class="task-detail-panel__execution-item">
          <span class="task-detail-panel__label">Artifacts:</span>
          <div class="task-detail-panel__artifacts">
            <el-tag
              v-for="artifact in task.metadata.execution_artifacts"
              :key="artifact"
              size="small"
              effect="plain"
            >
              {{ artifact.slice(0, 16) }}...
            </el-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- Review Info -->
    <div v-if="task.metadata?.reviewed_by" class="task-detail-panel__section">
      <h4>Review History</h4>
      <div class="task-detail-panel__review">
        <div class="task-detail-panel__review-item">
          <span class="task-detail-panel__label">Reviewed by:</span>
          <span>{{ task.metadata.reviewed_by }}</span>
        </div>
        <div class="task-detail-panel__review-item">
          <span class="task-detail-panel__label">Decision:</span>
          <el-tag :type="reviewDecisionType(task.metadata.review_decision)" size="small">
            {{ task.metadata.review_decision }}
          </el-tag>
        </div>
        <div v-if="task.metadata.reviewed_at" class="task-detail-panel__review-item">
          <span class="task-detail-panel__label">Date:</span>
          <span>{{ formatDateTime(task.metadata.reviewed_at) }}</span>
        </div>
        <div v-if="task.metadata.review_notes" class="task-detail-panel__review-item">
          <span class="task-detail-panel__label">Notes:</span>
          <p class="task-detail-panel__notes">{{ task.metadata.review_notes }}</p>
        </div>
      </div>
    </div>

    <!-- Timestamps -->
    <div class="task-detail-panel__section">
      <h4>Timeline</h4>
      <div class="task-detail-panel__timeline">
        <div class="task-detail-panel__timeline-item">
          <el-icon><Calendar /></el-icon>
          <span>Created: {{ formatDateTime(task.created_at) }}</span>
        </div>
        <div class="task-detail-panel__timeline-item">
          <el-icon><Clock /></el-icon>
          <span>Updated: {{ formatDateTime(task.updated_at) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { User, UserFilled, Check, Calendar, Clock } from '@element-plus/icons-vue'
import type { Task, TaskStatus } from '@/services/taskApi'

interface Props {
  task: Task
}

const props = defineProps<Props>()

// Formatters
function formatStatus(status: TaskStatus | string): string {
  const map: Record<string, string> = {
    pending_review: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
    modified: 'Modified',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
  }
  return map[status] || status
}

function statusType(status: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    pending_review: 'warning',
    approved: 'success',
    rejected: 'danger',
    modified: 'info',
    assigned: 'info',
    in_progress: '',
    completed: 'success',
    failed: 'danger',
  }
  return map[status] || ''
}

function formatTaskType(type: string | undefined): string {
  if (!type) return 'Unknown'
  const map: Record<string, string> = {
    code_generation: 'Code Generation',
    code_update: 'Code Update',
    test_generation: 'Test Generation',
    test_update: 'Test Update',
    compatibility_check: 'Compatibility Check',
    review: 'Review',
  }
  return map[type] || type
}

function formatAgent(agent: string): string {
  const map: Record<string, string> = {
    'code-agent': 'Code Agent',
    'test-agent': 'Test Agent',
    'user': 'User',
  }
  return map[agent] || agent
}

function priorityType(priority: string): '' | 'success' | 'warning' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger'> = {
    high: 'danger',
    medium: 'warning',
    low: 'success',
  }
  return map[priority] || ''
}

function confidenceType(confidence: number): 'success' | 'warning' | 'info' {
  if (confidence >= 0.8) return 'success'
  if (confidence >= 0.5) return 'warning'
  return 'info'
}

function reviewDecisionType(decision: string | undefined): 'success' | 'danger' | 'warning' {
  switch (decision) {
    case 'approve':
      return 'success'
    case 'reject':
      return 'danger'
    case 'modify':
      return 'warning'
    default:
      return 'info'
  }
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString()
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString()
}
</script>

<style scoped lang="scss">
.task-detail-panel {
  &__header {
    margin-bottom: 16px;
  }

  &__badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  &__id {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    margin: 0;
  }

  &__section {
    margin-bottom: 24px;

    h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: var(--el-text-color-regular);
      font-weight: 500;
    }
  }

  &__description {
    color: var(--el-text-color-primary);
    line-height: 1.6;
    white-space: pre-wrap;
  }

  &__list {
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--el-text-color-regular);

      .el-icon {
        color: var(--el-color-success);
        margin-top: 2px;
      }
    }
  }

  &__recommendation {
    background: var(--el-fill-color-light);
    border-radius: 8px;
    padding: 12px;
  }

  &__agent {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  &__agent-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__agent-name {
    font-weight: 500;
  }

  &__reason {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  &__assignment {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__assignment-info {
    display: flex;
    flex-direction: column;
  }

  &__assignment-agent {
    font-weight: 500;
  }

  &__assignment-time {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__execution {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__execution-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__label {
    font-weight: 500;
    color: var(--el-text-color-regular);
    font-size: 12px;
  }

  &__output {
    background: var(--el-fill-color);
    padding: 12px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 200px;
    overflow-y: auto;
  }

  &__artifacts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__review {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__review-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__notes {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-style: italic;
  }

  &__timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__timeline-item {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--el-text-color-secondary);
    font-size: 13px;

    .el-icon {
      color: var(--el-text-color-regular);
    }
  }
}
</style>
