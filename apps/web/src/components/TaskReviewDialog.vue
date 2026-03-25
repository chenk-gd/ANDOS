<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="700px"
    :close-on-click-modal="false"
    @close="handleClose"
    class="task-review-dialog"
  >
    <div v-if="task" class="task-review-dialog__content">
      <!-- Task Info -->
      <div class="task-review-dialog__header">
        <div class="task-review-dialog__meta">
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
          <span class="task-review-dialog__id">ID: {{ task.id.slice(0, 8) }}</span>
        </div>
        <h3 class="task-review-dialog__title">{{ task.name }}</h3>
      </div>

      <el-divider />

      <!-- Description -->
      <div class="task-review-dialog__section">
        <h4>Description</h4>
        <p class="task-review-dialog__description">{{ task.description }}</p>
      </div>

      <!-- Acceptance Criteria -->
      <div v-if="task.metadata?.acceptance_criteria?.length" class="task-review-dialog__section">
        <h4>Acceptance Criteria</h4>
        <ul class="task-review-dialog__criteria">
          <li v-for="(criterion, index) in task.metadata.acceptance_criteria" :key="index">
            {{ criterion }}
          </li>
        </ul>
      </div>

      <!-- Agent Recommendation -->
      <div v-if="task.metadata?.router_recommendation" class="task-review-dialog__section">
        <h4>Router Recommendation</h4>
        <div class="task-review-dialog__recommendation">
          <div class="task-review-dialog__recommendation-agent">
            <el-avatar :size="40" :icon="User" />
            <div class="task-review-dialog__recommendation-info">
              <span class="task-review-dialog__recommendation-name">
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
          <p class="task-review-dialog__recommendation-reason">
            {{ task.metadata.router_recommendation.reason }}
          </p>
        </div>
      </div>

      <!-- Source Asset -->
      <div v-if="task.metadata?.source_asset_id" class="task-review-dialog__section">
        <h4>Source</h4>
        <el-tag size="small" effect="plain">
          <el-icon><Link /></el-icon>
          Asset: {{ task.metadata.source_asset_id.slice(0, 8) }}
        </el-tag>
      </div>

      <el-divider />

      <!-- Review Form -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="task-review-dialog__form"
      >
        <!-- Decision -->
        <el-form-item label="Decision" prop="decision">
          <el-radio-group v-model="form.decision" size="large">
            <el-radio-button label="approve">
              <el-icon><Check /></el-icon> Approve
            </el-radio-button>
            <el-radio-button label="modify">
              <el-icon><Edit /></el-icon> Modify
            </el-radio-button>
            <el-radio-button label="reject">
              <el-icon><Close /></el-icon> Reject
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <!-- Modification Form (shown when modify selected) -->
        <template v-if="form.decision === 'modify'">
          <el-form-item label="Title" prop="modifications.title">
            <el-input v-model="form.modifications.title" />
          </el-form-item>

          <el-form-item label="Description" prop="modifications.description">
            <el-input
              v-model="form.modifications.description"
              type="textarea"
              :rows="3"
            />
          </el-form-item>

          <el-form-item label="Priority" prop="modifications.priority">
            <el-select v-model="form.modifications.priority" style="width: 100%">
              <el-option label="High" value="high" />
              <el-option label="Medium" value="medium" />
              <el-option label="Low" value="low" />
            </el-select>
          </el-form-item>

          <el-form-item label="Assigned Agent" prop="modifications.assigned_agent">
            <el-select
              v-model="form.modifications.assigned_agent"
              style="width: 100%"
              placeholder="Select agent to handle this task"
            >
              <el-option
                v-for="agent in availableAgents"
                :key="agent.value"
                :label="agent.label"
                :value="agent.value"
              >
                <div class="task-review-dialog__agent-option">
                  <span>{{ agent.label }}</span>
                  <el-tag v-if="agent.recommended" type="success" size="small">Recommended</el-tag>
                </div>
              </el-option>
            </el-select>
            <div v-if="form.modifications.assigned_agent" class="task-review-dialog__override-notice">
              <el-alert
                v-if="isOverride"
                title="You are overriding the router's recommendation"
                type="warning"
                :closable="false"
                show-icon
              />
            </div>
          </el-form-item>

          <el-form-item label="Acceptance Criteria">
            <div
              v-for="(criterion, index) in form.modifications.acceptance_criteria"
              :key="index"
              class="task-review-dialog__criteria-input"
            >
              <el-input v-model="form.modifications.acceptance_criteria[index]" />
              <el-button
                type="danger"
                :icon="Delete"
                circle
                size="small"
                @click="removeCriterion(index)"
              />
            </div>
            <el-button type="primary" link @click="addCriterion">
              <el-icon><Plus /></el-icon> Add Criterion
            </el-button>
          </el-form-item>

          <el-form-item label="Estimated Effort (hours)">
            <el-input-number
              v-model="form.modifications.estimated_effort"
              :min="0.5"
              :max="100"
              :step="0.5"
              style="width: 100%"
            />
          </el-form-item>
        </template>

        <!-- Notes -->
        <el-form-item label="Review Notes" prop="notes">
          <el-input
            v-model="form.notes"
            type="textarea"
            :rows="3"
            placeholder="Add notes about your decision..."
          />
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <el-button @click="handleClose">Cancel</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="handleSubmit"
        :disabled="!canSubmit"
      >
        {{ submitButtonText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import {
  User,
  Link,
  Check,
  Close,
  Edit,
  Plus,
  Delete,
} from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { taskApi, type Task, type ReviewTaskRequest } from '@/services/taskApi'

// Props
interface Props {
  task: Task | null
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  (e: 'success'): void
  (e: 'close'): void
}>()

// State
const visible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()

// Form data
const form = reactive<ReviewTaskRequest & { modifications: any }>({
  decision: 'approve',
  notes: '',
  modifications: {
    title: '',
    description: '',
    priority: 'medium',
    assigned_agent: '',
    acceptance_criteria: [] as string[],
    estimated_effort: 2,
  },
})

// Available agents
const availableAgents = [
  { value: 'code-agent', label: 'Code Agent', recommended: false },
  { value: 'test-agent', label: 'Test Agent', recommended: false },
  { value: 'user', label: 'Assign to Me', recommended: false },
]

// Validation rules
const rules: FormRules = {
  decision: [{ required: true, message: 'Please select a decision', trigger: 'change' }],
}

// Computed
const dialogTitle = computed(() => {
  if (!props.task) return 'Review Task'
  return `Review: ${props.task.name.slice(0, 40)}${props.task.name.length > 40 ? '...' : ''}`
})

const canSubmit = computed(() => {
  if (!form.decision) return false
  if (form.decision === 'modify') {
    return form.modifications.title && form.modifications.assigned_agent
  }
  return true
})

const submitButtonText = computed(() => {
  switch (form.decision) {
    case 'approve':
      return 'Approve Task'
    case 'modify':
      return 'Modify & Approve'
    case 'reject':
      return 'Reject Task'
    default:
      return 'Submit'
  }
})

const isOverride = computed(() => {
  if (!props.task?.metadata?.router_recommendation) return false
  return (
    form.modifications.assigned_agent &&
    form.modifications.assigned_agent !== props.task.metadata.router_recommendation.agent_id
  )
})

// Methods
function open() {
  visible.value = true
  resetForm()
}

function handleClose() {
  visible.value = false
  emit('close')
}

function resetForm() {
  if (!props.task) return

  form.decision = 'approve'
  form.notes = ''
  form.modifications = {
    title: props.task.name,
    description: props.task.description,
    priority: props.task.metadata?.priority || 'medium',
    assigned_agent: props.task.metadata?.router_recommendation?.agent_id || '',
    acceptance_criteria: props.task.metadata?.acceptance_criteria
      ? [...props.task.metadata.acceptance_criteria]
      : [],
    estimated_effort: props.task.metadata?.estimated_effort || 2,
  }

  // Mark recommended agent
  const recommendedAgent = props.task.metadata?.router_recommendation?.agent_id
  availableAgents.forEach((agent) => {
    agent.recommended = agent.value === recommendedAgent
  })
}

async function handleSubmit() {
  if (!props.task) return

  const valid = await formRef.value?.validate()
  if (!valid) return

  submitting.value = true
  try {
    const request: ReviewTaskRequest = {
      decision: form.decision,
      notes: form.notes,
    }

    if (form.decision === 'modify') {
      request.modifications = {
        title: form.modifications.title,
        description: form.modifications.description,
        priority: form.modifications.priority,
        assigned_agent: form.modifications.assigned_agent,
        acceptance_criteria: form.modifications.acceptance_criteria,
        estimated_effort: form.modifications.estimated_effort,
      }
    }

    await taskApi.reviewTask(props.task.id, request)

    ElMessage.success(
      form.decision === 'modify'
        ? 'Task modified and approved'
        : `Task ${form.decision}d successfully`
    )

    emit('success')
    handleClose()
  } catch (error) {
    ElMessage.error('Review failed')
    console.error(error)
  } finally {
    submitting.value = false
  }
}

function addCriterion() {
  form.modifications.acceptance_criteria.push('')
}

function removeCriterion(index: number) {
  form.modifications.acceptance_criteria.splice(index, 1)
}

// Formatters
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

// Watch for task changes
watch(
  () => props.task,
  () => {
    if (visible.value) {
      resetForm()
    }
  }
)

defineExpose({
  open,
  close: handleClose,
})
</script>

<style scoped lang="scss">
.task-review-dialog {
  &__content {
    max-height: 60vh;
    overflow-y: auto;
  }

  &__header {
    margin-bottom: 8px;
  }

  &__meta {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  &__id {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  &__section {
    margin-bottom: 16px;

    h4 {
      margin: 0 0 8px 0;
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

  &__criteria {
    margin: 0;
    padding-left: 20px;

    li {
      margin-bottom: 4px;
      line-height: 1.5;
    }
  }

  &__recommendation {
    background: var(--el-fill-color-light);
    border-radius: 8px;
    padding: 12px;
  }

  &__recommendation-agent {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  &__recommendation-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__recommendation-name {
    font-weight: 500;
  }

  &__recommendation-reason {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  &__form {
    .el-radio-group {
      display: flex;
      gap: 12px;
    }

    .el-radio-button {
      flex: 1;

      :deep(.el-radio-button__inner) {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
    }
  }

  &__agent-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__override-notice {
    margin-top: 8px;
  }

  &__criteria-input {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;

    .el-input {
      flex: 1;
    }
  }
}
</style>
