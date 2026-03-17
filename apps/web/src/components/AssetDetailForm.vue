<template>
  <div class="asset-detail-form">
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-position="top"
      :disabled="isReadonly"
    >
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="资产名称" prop="name">
            <el-input
              v-model="formData.name"
              placeholder="输入资产名称"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="标识符" prop="slug">
            <el-input
              v-model="formData.slug"
              placeholder="唯一标识符（英文、数字、连字符）"
              maxlength="50"
              show-word-limit
              disabled
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="资产类型">
            <el-select v-model="formData.type" disabled style="width: 100%">
              <el-option
                v-for="(label, type) in ASSET_TYPE_LABELS"
                :key="type"
                :label="label"
                :value="type"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="当前状态">
            <el-tag :type="getStateTagType(formData.state || 'draft')">
              {{ ASSET_STATE_LABELS[formData.state || 'draft'] }}
            </el-tag>
            <el-button
              v-if="formData.state === 'dirty'"
              link
              type="primary"
              size="small"
              style="margin-left: 8px"
              @click="handleMarkClean"
            >
              标记为 Clean
            </el-button>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="描述" prop="description">
        <el-input
          v-model="formData.description"
          type="textarea"
          :rows="3"
          placeholder="描述资产的用途和内容..."
          maxlength="500"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="标签">
        <el-select
          v-model="formData.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="添加标签（可输入新标签）"
          style="width: 100%"
        >
          <el-option
            v-for="tag in availableTags"
            :key="tag"
            :label="tag"
            :value="tag"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="所有者">
        <el-select
          v-model="formData.owners"
          multiple
          placeholder="选择所有者"
          style="width: 100%"
        >
          <el-option
            v-for="user in availableUsers"
            :key="user.id"
            :label="user.name"
            :value="user.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item>
        <div class="form-actions">
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!hasChanges || saving"
            @click="handleSave"
          >
            <el-icon><Check /></el-icon>
            保存
          </el-button>
          <el-button @click="handleReset" :disabled="!hasChanges">
            <el-icon><RefreshRight /></el-icon>
            重置
          </el-button>
          <span v-if="saveStatus" class="save-status" :class="saveStatus.type">
            <el-icon v-if="saveStatus.type === 'success'"><CircleCheck /></el-icon>
            <el-icon v-else-if="saveStatus.type === 'error'"><CircleClose /></el-icon>
            {{ saveStatus.message }}
          </span>
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Check, RefreshRight, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { Asset, AssetState } from '@/types/asset'
import { ASSET_TYPE_LABELS } from '@/types/asset'
import { assetsApi } from '@/services/api'

interface Props {
  asset: Asset | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  update: [asset: Asset]
  markClean: [id: string]
}>()

// Form data
const formRef = ref<FormInstance>()
const formData = ref<Partial<Asset>>({
  name: '',
  slug: '',
  type: 'requirement',
  state: 'draft',
  description: '',
  tags: [],
  owners: [],
})

const originalData = ref<string>('')
const saving = ref(false)
const saveStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// Available options (mock data for now)
const availableTags = ref(['重要', '紧急', '待评审', '已完成', '前端', '后端', 'API'])
const availableUsers = ref([
  { id: 'user1', name: '张三' },
  { id: 'user2', name: '李四' },
  { id: 'user3', name: '王五' },
])

// Asset state labels
const ASSET_STATE_LABELS: Record<AssetState, string> = {
  draft: '草稿',
  clean: '干净',
  dirty: '已变更',
  modified: '已修改',
  archived: '已归档',
}

// Form validation rules
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入资产名称', trigger: 'blur' },
    { min: 2, max: 100, message: '长度在 2 到 100 个字符', trigger: 'blur' },
  ],
  description: [
    { max: 500, message: '描述不能超过 500 个字符', trigger: 'blur' },
  ],
}

// Computed
const isReadonly = computed(() => {
  return props.asset?.state === 'archived'
})

const hasChanges = computed(() => {
  return JSON.stringify(formData.value) !== originalData.value
})

// Watch for asset changes
watch(() => props.asset, (newAsset) => {
  if (newAsset) {
    formData.value = {
      name: newAsset.name,
      slug: newAsset.slug,
      type: newAsset.type,
      state: newAsset.state,
      description: newAsset.description || '',
      tags: [...newAsset.tags],
      owners: [...newAsset.owners],
    }
    originalData.value = JSON.stringify(formData.value)
    saveStatus.value = null
  }
}, { immediate: true })

// Methods
function getStateTagType(state: AssetState): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<AssetState, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    draft: 'info',
    clean: 'success',
    dirty: 'warning',
    modified: '',
    archived: 'danger',
  }
  return map[state]
}

async function handleSave() {
  if (!formRef.value || !props.asset) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  saveStatus.value = null

  try {
    const updateData = {
      name: formData.value.name,
      description: formData.value.description,
      tags: formData.value.tags,
      owners: formData.value.owners,
    }

    const response = await assetsApi.update(props.asset.id, updateData)
    originalData.value = JSON.stringify(formData.value)
    saveStatus.value = { type: 'success', message: '保存成功' }
    emit('update', response.data)

    // Clear success message after 3 seconds
    setTimeout(() => {
      saveStatus.value = null
    }, 3000)
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    saveStatus.value = { type: 'error', message }
  } finally {
    saving.value = false
  }
}

function handleReset() {
  if (!props.asset) return
  formData.value = {
    name: props.asset.name,
    slug: props.asset.slug,
    type: props.asset.type,
    state: props.asset.state,
    description: props.asset.description || '',
    tags: [...props.asset.tags],
    owners: [...props.asset.owners],
  }
  saveStatus.value = null
  formRef.value?.clearValidate()
}

function handleMarkClean() {
  if (!props.asset) return
  emit('markClean', props.asset.id)
}
</script>

<style scoped>
.asset-detail-form {
  padding: 20px;
  max-width: 800px;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
}

.save-status.success {
  color: var(--el-color-success);
}

.save-status.error {
  color: var(--el-color-danger);
}
</style>
