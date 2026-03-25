<template>
  <div class="task-list">
    <!-- Toolbar -->
    <div class="task-list__toolbar">
      <div class="task-list__filters">
        <el-select
          v-model="filterStatus"
          placeholder="Status"
          clearable
          class="task-list__filter"
          @change="handleFilterChange"
        >
          <el-option label="Pending Review" value="pending_review" />
          <el-option label="Approved" value="approved" />
          <el-option label="Rejected" value="rejected" />
          <el-option label="Modified" value="modified" />
          <el-option label="Assigned" value="assigned" />
          <el-option label="In Progress" value="in_progress" />
          <el-option label="Completed" value="completed" />
          <el-option label="Failed" value="failed" />
        </el-select>

        <el-select
          v-model="filterPriority"
          placeholder="Priority"
          clearable
          class="task-list__filter"
          @change="handleFilterChange"
        >
          <el-option label="High" value="high" />
          <el-option label="Medium" value="medium" />
          <el-option label="Low" value="low" />
        </el-select>

        <el-select
          v-model="filterType"
          placeholder="Task Type"
          clearable
          class="task-list__filter"
          @change="handleFilterChange"
        >
          <el-option label="Code Generation" value="code_generation" />
          <el-option label="Code Update" value="code_update" />
          <el-option label="Test Generation" value="test_generation" />
          <el-option label="Test Update" value="test_update" />
          <el-option label="Compatibility Check" value="compatibility_check" />
          <el-option label="Review" value="review" />
        </el-select>

        <el-input
          v-model="searchQuery"
          placeholder="Search tasks..."
          clearable
          class="task-list__search"
          @input="debouncedSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <div class="task-list__actions">
        <el-button
          v-if="selectedTasks.length > 0"
          type="primary"
          @click="showBatchReviewDialog"
        >
          Batch Review ({{ selectedTasks.length }})
        </el-button>
        <el-button @click="refreshTasks">
          <el-icon><Refresh /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- Table -->
    <el-table
      v-loading="loading"
      :data="filteredTasks"
      @selection-change="handleSelectionChange"
      @row-click="handleRowClick"
      row-key="id"
      class="task-list__table"
    >
      <el-table-column type="selection" width="55" v-if="showSelection" />

      <el-table-column label="Task" min-width="200">
        <template #default="{ row }">
          <div class="task-list__name">
            <span class="task-list__title">{{ row.name }}</span>
            <el-tag
              v-if="row.metadata?.priority"
              :type="priorityType(row.metadata.priority)"
              size="small"
              class="task-list__priority"
            >
              {{ row.metadata.priority }}
            </el-tag>
          </div>
          <div class="task-list__desc">{{ truncate(row.description, 60) }}</div>
        </template>
      </el-table-column>

      <el-table-column label="Type" width="120">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">
            {{ formatTaskType(row.metadata?.task_type) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Status" width="120">
        <template #default="{ row }">
          <el-tag :type="statusType(row.metadata?.state || row.state)" size="small">
            {{ formatStatus(row.metadata?.state || row.state) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Assigned" width="150">
        <template #default="{ row }">
          <div v-if="row.metadata?.assigned_agent" class="task-list__assigned">
            <el-icon><User /></el-icon>
            <span>{{ formatAgent(row.metadata.assigned_agent) }}</span>
          </div>
          <span v-else-if="row.metadata?.router_recommendation" class="task-list__suggested">
            <el-icon><InfoFilled /></el-icon>
            Suggested: {{ formatAgent(row.metadata.router_recommendation.agent_id) }}
          </span>
          <span v-else class="task-list__unassigned">—</span>
        </template>
      </el-table-column>

      <el-table-column label="Created" width="150" sortable>
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>

      <el-table-column width="120" align="right">
        <template #default="{ row }">
          <el-button-group>
            <el-button
              v-if="canReview(row)"
              type="primary"
              size="small"
              @click.stop="reviewTask(row)"
            >
              Review
            </el-button>
            <el-button
              v-else-if="canAssign(row)"
              type="success"
              size="small"
              @click.stop="assignTask(row)"
            >
              Assign
            </el-button>
            <el-dropdown v-else trigger="click" @command="(cmd) => handleCommand(cmd, row)">
              <el-button size="small">
                <el-icon><More /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="view">View Details</el-dropdown-item>
                  <el-dropdown-item v-if="canRetry(row)" command="retry">Retry</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <!-- Pagination -->
    <div class="task-list__pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="totalTasks"
        layout="total, sizes, prev, pager, next"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- Batch Review Dialog -->
    <el-dialog
      v-model="batchReviewVisible"
      title="Batch Review Tasks"
      width="500px"
    >
      <p>Review {{ selectedTasks.length }} selected tasks:</p>
      <ul class="task-list__selected-list">
        <li v-for="task in selectedTasks.slice(0, 5)" :key="task.id">
          {{ task.name }}
        </li>
        <li v-if="selectedTasks.length > 5">...and {{ selectedTasks.length - 5 }} more</li>
      </ul>

      <el-form label-position="top">
        <el-form-item label="Decision">
          <el-radio-group v-model="batchDecision">
            <el-radio-button label="approve">Approve</el-radio-button>
            <el-radio-button label="reject">Reject</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="Notes">
          <el-input
            v-model="batchNotes"
            type="textarea"
            :rows="3"
            placeholder="Optional notes for this batch review..."
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="batchReviewVisible = false">Cancel</el-button>
        <el-button type="primary" @click="confirmBatchReview" :loading="batchReviewing">
          Confirm Review
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Search, Refresh, User, InfoFilled, More } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { taskApi, type Task, type TaskStatus, type TaskPriority } from '@/services/taskApi'

// Props
interface Props {
  projectId?: string
  initialStatus?: TaskStatus
  showSelection?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSelection: true,
})

// Emits
const emit = defineEmits<{
  (e: 'select', task: Task): void
  (e: 'review', task: Task): void
  (e: 'assign', task: Task): void
}>()

// State
const loading = ref(false)
const tasks = ref<Task[]>([])
const selectedTasks = ref<Task[]>([])
const currentPage = ref(1)
const pageSize = ref(20)
const totalTasks = ref(0)

// Filters
const filterStatus = ref<TaskStatus | ''>(props.initialStatus || '')
const filterPriority = ref<TaskPriority | ''>('')
const filterType = ref<string>('')
const searchQuery = ref('')
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// Batch review
const batchReviewVisible = ref(false)
const batchDecision = ref<'approve' | 'reject'>('approve')
const batchNotes = ref('')
const batchReviewing = ref(false)

// Computed
const filteredTasks = computed(() => {
  // Client-side filtering (server handles most, this is for search)
  let result = tasks.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
    )
  }

  // Pagination
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return result.slice(start, end)
})

// Methods
async function fetchTasks() {
  loading.value = true
  try {
    const response = await taskApi.listTasks({
      project_id: props.projectId,
      status: filterStatus.value || undefined,
      priority: filterPriority.value || undefined,
      task_type: filterType.value || undefined,
      search: searchQuery.value || undefined,
    })
    tasks.value = response
    totalTasks.value = response.length
  } catch (error) {
    ElMessage.error('Failed to load tasks')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function handleFilterChange() {
  currentPage.value = 1
  fetchTasks()
}

function debouncedSearch() {
  if (debounceTimer.value) {
    clearTimeout(debounceTimer.value)
  }
  debounceTimer.value = setTimeout(() => {
    handleFilterChange()
  }, 300)
}

function handleSelectionChange(selection: Task[]) {
  selectedTasks.value = selection
}

function handleRowClick(row: Task) {
  emit('select', row)
}

function handleSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
}

function handleCurrentChange(page: number) {
  currentPage.value = page
}

function reviewTask(task: Task) {
  emit('review', task)
}

function assignTask(task: Task) {
  emit('assign', task)
}

function canReview(task: Task): boolean {
  return task.metadata?.state === 'pending_review'
}

function canAssign(task: Task): boolean {
  return ['approved', 'modified'].includes(task.metadata?.state || '')
}

function canRetry(task: Task): boolean {
  return task.metadata?.state === 'failed'
}

function handleCommand(command: string, task: Task) {
  if (command === 'view') {
    emit('select', task)
  } else if (command === 'retry') {
    ElMessage.info('Retry not implemented yet')
  }
}

function refreshTasks() {
  fetchTasks()
}

// Batch review
function showBatchReviewDialog() {
  if (selectedTasks.value.length === 0) {
    ElMessage.warning('Please select tasks to review')
    return
  }
  batchReviewVisible.value = true
}

async function confirmBatchReview() {
  if (selectedTasks.value.length === 0) return

  batchReviewing.value = true
  try {
    const result = await taskApi.batchReview({
      task_ids: selectedTasks.value.map((t) => t.id),
      decision: batchDecision.value,
      notes: batchNotes.value,
    })

    ElMessage.success(
      `Reviewed ${result.processed} tasks: ${result.approved} approved, ${result.rejected} rejected`
    )
    batchReviewVisible.value = false
    selectedTasks.value = []
    fetchTasks()
  } catch (error) {
    ElMessage.error('Batch review failed')
    console.error(error)
  } finally {
    batchReviewing.value = false
  }
}

// Formatters
function formatStatus(status: string): string {
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
    code_generation: 'Code Gen',
    code_update: 'Code Update',
    test_generation: 'Test Gen',
    test_update: 'Test Update',
    compatibility_check: 'Compat Check',
    review: 'Review',
  }
  return map[type] || type
}

function priorityType(priority: string): '' | 'success' | 'warning' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger'> = {
    high: 'danger',
    medium: 'warning',
    low: 'success',
  }
  return map[priority] || ''
}

function formatAgent(agent: string): string {
  const map: Record<string, string> = {
    'code-agent': 'Code Agent',
    'test-agent': 'Test Agent',
    'user': 'User',
  }
  return map[agent] || agent
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString()
}

function truncate(text: string, length: number): string {
  if (!text) return ''
  return text.length > length ? text.slice(0, length) + '...' : text
}

// Watch for initial status prop changes
watch(() => props.initialStatus, (newStatus) => {
  if (newStatus) {
    filterStatus.value = newStatus
    fetchTasks()
  }
})

// Lifecycle
onMounted(() => {
  fetchTasks()
})

defineExpose({
  refresh: fetchTasks,
})
</script>

<style scoped lang="scss">
.task-list {
  &__toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    gap: 16px;
  }

  &__filters {
    display: flex;
    gap: 12px;
    flex: 1;
  }

  &__filter {
    width: 140px;
  }

  &__search {
    width: 240px;
  }

  &__actions {
    display: flex;
    gap: 8px;
  }

  &__table {
    .el-table__row {
      cursor: pointer;
    }
  }

  &__name {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  &__title {
    font-weight: 500;
  }

  &__desc {
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  &__assigned {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--el-text-color-regular);
  }

  &__suggested {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--el-color-info);
    font-size: 12px;
  }

  &__unassigned {
    color: var(--el-text-color-placeholder);
  }

  &__pagination {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }

  &__selected-list {
    margin: 12px 0;
    padding-left: 20px;
    color: var(--el-text-color-regular);

    li {
      margin-bottom: 4px;
    }
  }
}
</style>
