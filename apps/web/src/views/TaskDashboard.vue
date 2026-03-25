<template>
  <div class="task-dashboard">
    <!-- Stats Cards -->
    <div class="task-dashboard__stats">
      <el-card class="task-dashboard__stat-card" shadow="hover">
        <div class="task-dashboard__stat">
          <div class="task-dashboard__stat-value">{{ stats.total }}</div>
          <div class="task-dashboard__stat-label">Total Tasks</div>
        </div>
      </el-card>

      <el-card
        class="task-dashboard__stat-card task-dashboard__stat-card--warning"
        shadow="hover"
        @click="filterByStatus('pending_review')"
      >
        <div class="task-dashboard__stat">
          <div class="task-dashboard__stat-value">{{ stats.pending_review_count }}</div>
          <div class="task-dashboard__stat-label">Pending Review</div>
          <el-badge v-if="stats.pending_review_count > 0" :value="stats.pending_review_count" class="task-dashboard__badge" />
        </div>
      </el-card>

      <el-card
        class="task-dashboard__stat-card task-dashboard__stat-card--info"
        shadow="hover"
        @click="filterByStatus('assigned')"
      >
        <div class="task-dashboard__stat">
          <div class="task-dashboard__stat-value">{{ stats.assigned_to_me_count }}</div>
          <div class="task-dashboard__stat-label">Assigned to Me</div>
        </div>
      </el-card>

      <el-card class="task-dashboard__stat-card task-dashboard__stat-card--success" shadow="hover">
        <div class="task-dashboard__stat">
          <div class="task-dashboard__stat-value">{{ completedToday }}</div>
          <div class="task-dashboard__stat-label">Completed Today</div>
        </div>
      </el-card>
    </div>

    <!-- Quick Filters -->
    <div class="task-dashboard__quick-filters">
      <el-radio-group v-model="quickFilter" size="large" @change="handleQuickFilterChange">
        <el-radio-button label="all">
          <el-icon><Grid /></el-icon> All Tasks
        </el-radio-button>
        <el-radio-button label="pending">
          <el-icon><Timer /></el-icon> Pending Review
          <el-badge v-if="attentionRequired.pending_review.length > 0" :value="attentionRequired.pending_review.length" class="task-dashboard__filter-badge" />
        </el-radio-button>
        <el-radio-button label="mine">
          <el-icon><User /></el-icon> My Tasks
        </el-radio-button>
        <el-radio-button label="attention">
          <el-icon><Bell /></el-icon> Attention Required
          <el-badge v-if="attentionCount > 0" :value="attentionCount" class="task-dashboard__filter-badge" />
        </el-radio-button>
      </el-radio-group>
    </div>

    <!-- Task List -->
    <el-card class="task-dashboard__list" shadow="never">
      <template #header>
        <div class="task-dashboard__list-header">
          <span class="task-dashboard__list-title">{{ listTitle }}</span>
          <el-button type="primary" @click="refreshTasks">
            <el-icon><Refresh /></el-icon> Refresh
          </el-button>
        </div>
      </template>

      <TaskList
        ref="taskListRef"
        :project-id="projectId"
        :initial-status="currentStatus"
        show-selection
        @select="handleTaskSelect"
        @review="handleTaskReview"
        @assign="handleTaskAssign"
      />
    </el-card>

    <!-- Task Detail Drawer -->
    <el-drawer
      v-model="detailDrawerVisible"
      :title="selectedTask?.name"
      size="600px"
      :close-on-click-modal="true"
    >
      <TaskDetailPanel v-if="selectedTask" :task="selectedTask" />
    </el-drawer>

    <!-- Review Dialog -->
    <TaskReviewDialog
      ref="reviewDialogRef"
      :task="selectedTask"
      @success="handleReviewSuccess"
      @close="selectedTask = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Grid, Timer, User, Bell, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import TaskList from '@/components/TaskList.vue'
import TaskReviewDialog from '@/components/TaskReviewDialog.vue'
import TaskDetailPanel from '@/components/TaskDetailPanel.vue'
import { taskApi, type Task, type TaskStats, type AttentionRequired, type TaskStatus } from '@/services/taskApi'

// Props
interface Props {
  projectId?: string
}

const props = defineProps<Props>()

// State
const loading = ref(false)
const stats = ref<TaskStats>({
  total: 0,
  by_status: {},
  by_priority: {},
  by_type: {},
  pending_review_count: 0,
  assigned_to_me_count: 0,
})
const attentionRequired = ref<AttentionRequired>({
  pending_review: [],
  assigned_to_me: [],
  recently_rejected: [],
})
const quickFilter = ref<'all' | 'pending' | 'mine' | 'attention'>('all')
const currentStatus = ref<TaskStatus | undefined>(undefined)
const selectedTask = ref<Task | null>(null)
const detailDrawerVisible = ref(false)
const taskListRef = ref<InstanceType<typeof TaskList>>()
const reviewDialogRef = ref<InstanceType<typeof TaskReviewDialog>>()

// Computed
const listTitle = computed(() => {
  switch (quickFilter.value) {
    case 'pending':
      return 'Pending Review'
    case 'mine':
      return 'My Tasks'
    case 'attention':
      return 'Attention Required'
    default:
      return 'All Tasks'
  }
})

const attentionCount = computed(() => {
  return (
    attentionRequired.value.pending_review.length +
    attentionRequired.value.assigned_to_me.length +
    attentionRequired.value.recently_rejected.length
  )
})

const completedToday = computed(() => {
  const today = new Date().toDateString()
  // This would need to be fetched from API; using placeholder
  return stats.value.by_status['completed'] || 0
})

// Methods
async function fetchStats() {
  try {
    const response = await taskApi.getTaskStats(props.projectId)
    stats.value = response
  } catch (error) {
    console.error('Failed to fetch task stats:', error)
  }
}

async function fetchAttentionRequired() {
  try {
    const response = await taskApi.getAttentionRequired(props.projectId)
    attentionRequired.value = response
  } catch (error) {
    console.error('Failed to fetch attention required:', error)
  }
}

function filterByStatus(status: TaskStatus) {
  quickFilter.value = 'all'
  currentStatus.value = status
}

function handleQuickFilterChange(filter: 'all' | 'pending' | 'mine' | 'attention') {
  switch (filter) {
    case 'pending':
      currentStatus.value = 'pending_review'
      break
    case 'mine':
      currentStatus.value = 'assigned'
      break
    case 'attention':
      // Special handling - would need to filter by attention required
      currentStatus.value = undefined
      break
    default:
      currentStatus.value = undefined
  }
}

function handleTaskSelect(task: Task) {
  selectedTask.value = task
  detailDrawerVisible.value = true
}

function handleTaskReview(task: Task) {
  selectedTask.value = task
  reviewDialogRef.value?.open()
}

function handleTaskAssign(task: Task) {
  // Could open an assignment dialog
  ElMessage.info(`Assign task ${task.id.slice(0, 8)}...`)
}

function handleReviewSuccess() {
  refreshTasks()
}

function refreshTasks() {
  fetchStats()
  fetchAttentionRequired()
  taskListRef.value?.refresh()
}

// Watch for project changes
watch(() => props.projectId, () => {
  refreshTasks()
})

// Lifecycle
onMounted(() => {
  fetchStats()
  fetchAttentionRequired()
})
</script>

<style scoped lang="scss">
.task-dashboard {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;

  &__stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  &__stat-card {
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    &--warning {
      :deep(.el-card__body) {
        border-left: 4px solid var(--el-color-warning);
      }
    }

    &--info {
      :deep(.el-card__body) {
        border-left: 4px solid var(--el-color-info);
      }
    }

    &--success {
      :deep(.el-card__body) {
        border-left: 4px solid var(--el-color-success);
      }
    }
  }

  &__stat {
    position: relative;
    padding: 8px;
  }

  &__stat-value {
    font-size: 32px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    line-height: 1.2;
  }

  &__stat-label {
    font-size: 14px;
    color: var(--el-text-color-secondary);
    margin-top: 4px;
  }

  &__badge {
    position: absolute;
    top: 0;
    right: 0;
  }

  &__quick-filters {
    margin-bottom: 24px;

    .el-radio-group {
      display: flex;
      gap: 12px;
    }

    .el-radio-button {
      :deep(.el-radio-button__inner) {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 12px 20px;
      }
    }
  }

  &__filter-badge {
    margin-left: 4px;
  }

  &__list {
    .el-card__header {
      padding: 16px 20px;
    }

    .el-card__body {
      padding: 0;
    }
  }

  &__list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__list-title {
    font-size: 16px;
    font-weight: 500;
  }
}

@media (max-width: 1024px) {
  .task-dashboard {
    &__stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
}

@media (max-width: 640px) {
  .task-dashboard {
    padding: 16px;

    &__stats {
      grid-template-columns: 1fr;
    }

    &__quick-filters {
      .el-radio-group {
        flex-wrap: wrap;

        .el-radio-button {
          flex: 1;
        }
      }
    }
  }
}
</style>
