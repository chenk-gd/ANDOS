<template>
  <div class="task-execution-monitor">
    <!-- Status Header -->
    <div class="task-execution-monitor__header" :class="`task-execution-monitor__header--${status}`">
      <div class="task-execution-monitor__status-icon">
        <el-icon v-if="status === 'completed'" :size="48" color="#67c23a"><CircleCheck /></el-icon>
        <el-icon v-else-if="status === 'failed'" :size="48" color="#f56c6c"><CircleClose /></el-icon>
        <el-icon v-else-if="status === 'in_progress'" :size="48" color="#409eff"><Loading /></el-icon>
        <el-icon v-else :size="48" color="#909399"><Timer /></el-icon>
      </div>
      <div class="task-execution-monitor__status-info">
        <h3 class="task-execution-monitor__status-title">{{ statusTitle }}</h3>
        <p class="task-execution-monitor__status-desc">{{ statusDescription }}</p>
      </div>
    </div>

    <!-- Progress Bar (for in_progress) -->
    <div v-if="status === 'in_progress'" class="task-execution-monitor__progress">
      <el-progress
        :percentage="progressPercentage"
        :status="progressStatus"
        :indeterminate="!progressPercentage"
        :duration="2"
      />
      <p class="task-execution-monitor__progress-text">{{ progressText }}</p>
    </div>

    <!-- Execution Timeline -->
    <div class="task-execution-monitor__timeline">
      <div
        v-for="(step, index) in executionSteps"
        :key="step.id"
        class="task-execution-monitor__step"
        :class="{
          'task-execution-monitor__step--active': step.status === 'active',
          'task-execution-monitor__step--completed': step.status === 'completed',
          'task-execution-monitor__step--failed': step.status === 'failed',
        }"
      >
        <div class="task-execution-monitor__step-marker">
          <el-icon v-if="step.status === 'completed'" color="#67c23a"><Check /></el-icon>
          <el-icon v-else-if="step.status === 'failed'" color="#f56c6c"><Close /></el-icon>
          <el-icon v-else-if="step.status === 'active'" class="is-loading"><Loading /></el-icon>
          <span v-else class="task-execution-monitor__step-number">{{ index + 1 }}</span>
        </div>
        <div class="task-execution-monitor__step-content">
          <span class="task-execution-monitor__step-name">{{ step.name }}</span>
          <span v-if="step.timestamp" class="task-execution-monitor__step-time">
            {{ formatTime(step.timestamp) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Output Section -->
    <div v-if="showOutput" class="task-execution-monitor__section">
      <div class="task-execution-monitor__section-header">
        <h4>Output</h4>
        <el-button size="small" link @click="copyOutput">
          <el-icon><DocumentCopy /></el-icon> Copy
        </el-button>
      </div>
      <pre class="task-execution-monitor__output">{{ output }}</pre>
    </div>

    <!-- Artifacts Section -->
    <div v-if="artifacts.length > 0" class="task-execution-monitor__section">
      <h4>Generated Artifacts</h4>
      <div class="task-execution-monitor__artifacts">
        <el-card
          v-for="artifact in artifacts"
          :key="artifact.id"
          shadow="hover"
          class="task-execution-monitor__artifact"
        >
          <div class="task-execution-monitor__artifact-header">
            <el-icon><Document /></el-icon>
            <span class="task-execution-monitor__artifact-name">{{ artifact.name }}</span>
          </div>
          <div class="task-execution-monitor__artifact-meta">
            <span>{{ artifact.type }}</span>
            <span>{{ formatFileSize(artifact.size) }}</span>
          </div>
          <div class="task-execution-monitor__artifact-actions">
            <el-button size="small" type="primary" link @click="viewArtifact(artifact)">
              View
            </el-button>
            <el-button size="small" link @click="downloadArtifact(artifact)">
              Download
            </el-button>
          </div>
        </el-card>
      </div>
    </div>

    <!-- Error Section -->
    <div v-if="error" class="task-execution-monitor__section task-execution-monitor__section--error">
      <div class="task-execution-monitor__section-header">
        <h4><el-icon><Warning /></el-icon> Error</h4>
      </div>
      <el-alert
        :title="error.title"
        :description="error.message"
        type="error"
        :closable="false"
        show-icon
      />
      <div v-if="error.details" class="task-execution-monitor__error-details">
        <pre>{{ error.details }}</pre>
      </div>
    </div>

    <!-- Metrics -->
    <div v-if="showMetrics" class="task-execution-monitor__metrics">
      <el-descriptions :column="3" border>
        <el-descriptions-item label="Duration">{{ duration }}</el-descriptions-item>
        <el-descriptions-item label="Tokens Used">{{ metrics.tokens || 'N/A' }}</el-descriptions-item>
        <el-descriptions-item label="Cost">{{ metrics.cost || 'N/A' }}</el-descriptions-item>
      </el-descriptions>
    </div>

    <!-- Actions -->
    <div class="task-execution-monitor__actions">
      <el-button v-if="canRetry" type="primary" @click="handleRetry">
        <el-icon><Refresh /></el-icon> Retry
      </el-button>
      <el-button v-if="canCancel && status === 'in_progress'" @click="handleCancel">
        Cancel
      </el-button>
      <el-button @click="handleClose">Close</el-button>
    </div>

    <!-- Auto-refresh indicator -->
    <div v-if="autoRefresh && status === 'in_progress'" class="task-execution-monitor__refresh">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>Auto-refreshing...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  CircleCheck,
  CircleClose,
  Loading,
  Timer,
  Check,
  Close,
  DocumentCopy,
  Document,
  Warning,
  Refresh,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

export type ExecutionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'timeout'

interface ExecutionStep {
  id: string
  name: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  timestamp?: string
}

interface Artifact {
  id: string
  name: string
  type: string
  size: number
  url?: string
}

interface ExecutionError {
  title: string
  message: string
  details?: string
}

interface ExecutionMetrics {
  tokens?: number
  cost?: string
  steps?: number
}

interface Props {
  taskId: string
  status: ExecutionStatus
  progress?: number
  progressText?: string
  steps?: ExecutionStep[]
  output?: string
  artifacts?: Artifact[]
  error?: ExecutionError
  metrics?: ExecutionMetrics
  duration?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

const props = withDefaults(defineProps<Props>(), {
  progress: 0,
  progressText: 'Processing...',
  steps: () => [],
  artifacts: () => [],
  metrics: () => ({}),
  duration: '',
  autoRefresh: false,
  refreshInterval: 5000,
})

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'retry'): void
  (e: 'cancel'): void
  (e: 'close'): void
}>()

// State
const refreshTimer = ref<ReturnType<typeof setInterval> | null>(null)

// Computed
const statusTitle = computed(() => {
  const titles: Record<ExecutionStatus, string> = {
    pending: 'Waiting to Start',
    in_progress: 'Execution in Progress',
    completed: 'Execution Completed',
    failed: 'Execution Failed',
    timeout: 'Execution Timed Out',
  }
  return titles[props.status]
})

const statusDescription = computed(() => {
  const descriptions: Record<ExecutionStatus, string> = {
    pending: 'Task is queued and waiting for an available agent.',
    in_progress: 'Agent is actively working on this task.',
    completed: 'Task has been completed successfully.',
    failed: 'Task execution encountered an error.',
    timeout: 'Task exceeded the maximum execution time.',
  }
  return descriptions[props.status]
})

const progressPercentage = computed(() => {
  if (props.progress) return Math.min(100, Math.max(0, props.progress))
  if (props.status === 'completed') return 100
  return 0
})

const progressStatus = computed(() => {
  if (props.status === 'failed') return 'exception'
  if (props.status === 'completed') return 'success'
  return ''
})

const executionSteps = computed<ExecutionStep[]>(() => {
  // Default steps if none provided
  if (props.steps.length > 0) return props.steps

  return [
    { id: '1', name: 'Initialize', status: getStepStatus(0) },
    { id: '2', name: 'Analyze Requirements', status: getStepStatus(1) },
    { id: '3', name: 'Execute Task', status: getStepStatus(2) },
    { id: '4', name: 'Generate Output', status: getStepStatus(3) },
    { id: '5', name: 'Finalize', status: getStepStatus(4) },
  ]
})

const showOutput = computed(() => {
  return props.output && props.output.length > 0
})

const showMetrics = computed(() => {
  return props.status === 'completed' || props.status === 'failed'
})

const canRetry = computed(() => {
  return props.status === 'failed' || props.status === 'timeout'
})

const canCancel = computed(() => {
  return props.status === 'in_progress' || props.status === 'pending'
})

// Methods
function getStepStatus(stepIndex: number): ExecutionStep['status'] {
  const totalSteps = 5
  const currentStep = Math.floor((props.progress / 100) * totalSteps)

  if (props.status === 'failed') {
    return stepIndex < currentStep ? 'completed' : stepIndex === currentStep ? 'failed' : 'pending'
  }

  if (props.status === 'completed') {
    return 'completed'
  }

  if (stepIndex < currentStep) return 'completed'
  if (stepIndex === currentStep) return 'active'
  return 'pending'
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function copyOutput() {
  if (!props.output) return
  navigator.clipboard.writeText(props.output)
  ElMessage.success('Output copied to clipboard')
}

function viewArtifact(artifact: Artifact) {
  ElMessage.info(`Viewing ${artifact.name}...`)
}

function downloadArtifact(artifact: Artifact) {
  ElMessage.info(`Downloading ${artifact.name}...`)
}

function handleRetry() {
  emit('retry')
}

function handleCancel() {
  emit('cancel')
}

function handleClose() {
  emit('close')
}

function startAutoRefresh() {
  if (!props.autoRefresh || props.status !== 'in_progress') return
  refreshTimer.value = setInterval(() => {
    emit('refresh')
  }, props.refreshInterval)
}

function stopAutoRefresh() {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
}

// Watch for status changes
watch(() => props.status, (newStatus) => {
  if (newStatus === 'in_progress' && props.autoRefresh) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
})

// Lifecycle
onMounted(() => {
  if (props.status === 'in_progress' && props.autoRefresh) {
    startAutoRefresh()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped lang="scss">
.task-execution-monitor {
  &__header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 24px;
    border-radius: 8px;
    margin-bottom: 24px;

    &--completed {
      background: rgba(103, 194, 58, 0.1);
      border: 1px solid rgba(103, 194, 58, 0.2);
    }

    &--failed,
    &--timeout {
      background: rgba(245, 108, 108, 0.1);
      border: 1px solid rgba(245, 108, 108, 0.2);
    }

    &--in_progress {
      background: rgba(64, 158, 255, 0.1);
      border: 1px solid rgba(64, 158, 255, 0.2);
    }

    &--pending {
      background: rgba(144, 147, 153, 0.1);
      border: 1px solid rgba(144, 147, 153, 0.2);
    }
  }

  &__status-info {
    flex: 1;
  }

  &__status-title {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 600;
  }

  &__status-desc {
    margin: 0;
    color: var(--el-text-color-secondary);
  }

  &__progress {
    margin-bottom: 24px;
    padding: 0 8px;

    &-text {
      text-align: center;
      color: var(--el-text-color-secondary);
      margin-top: 8px;
    }
  }

  &__timeline {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  &__step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    transition: background-color 0.2s;

    &--active {
      background: var(--el-fill-color-light);
    }

    &--completed {
      opacity: 0.7;
    }

    &--failed {
      background: rgba(245, 108, 108, 0.1);
    }
  }

  &__step-marker {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--el-fill-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    .is-loading {
      animation: rotating 2s linear infinite;
    }
  }

  &__step-number {
    font-size: 14px;
    font-weight: 500;
    color: var(--el-text-color-secondary);
  }

  &__step-content {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  &__step-name {
    font-weight: 500;
  }

  &__step-time {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  &__section {
    margin-bottom: 24px;

    h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: var(--el-text-color-regular);
      font-weight: 500;
    }

    &--error {
      h4 {
        color: var(--el-color-danger);
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }
  }

  &__section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    h4 {
      margin: 0;
    }
  }

  &__output {
    background: var(--el-fill-color);
    padding: 16px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 13px;
    white-space: pre-wrap;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
  }

  &__artifacts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  &__artifact {
    .el-card__body {
      padding: 16px;
    }
  }

  &__artifact-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .el-icon {
      font-size: 20px;
      color: var(--el-text-color-secondary);
    }
  }

  &__artifact-name {
    font-weight: 500;
    word-break: break-all;
  }

  &__artifact-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 12px;
  }

  &__artifact-actions {
    display: flex;
    gap: 8px;
  }

  &__error-details {
    margin-top: 12px;

    pre {
      background: var(--el-fill-color);
      padding: 12px;
      border-radius: 4px;
      font-size: 12px;
      overflow-x: auto;
      max-height: 200px;
    }
  }

  &__metrics {
    margin-bottom: 24px;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--el-border-color-light);
  }

  &__refresh {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 16px;
    color: var(--el-text-color-secondary);
    font-size: 12px;

    .is-loading {
      animation: rotating 2s linear infinite;
    }
  }
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
