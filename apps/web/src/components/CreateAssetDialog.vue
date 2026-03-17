<template>
  <el-dialog
    v-model="visible"
    title="创建新资产"
    width="600px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="formRules"
      label-position="top"
    >
      <el-form-item label="资产名称" prop="name">
        <el-input
          v-model="formData.name"
          placeholder="输入资产名称"
          maxlength="100"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="标识符" prop="slug">
        <el-input
          v-model="formData.slug"
          placeholder="唯一标识符（英文、数字、连字符）"
          maxlength="50"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="资产类型" prop="type">
        <el-select v-model="formData.type" placeholder="选择资产类型" style="width: 100%">
          <el-option
            v-for="(label, type) in ASSET_TYPE_LABELS"
            :key="type"
            :label="label"
            :value="type"
          />
        </el-select>
      </el-form-item>

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
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="creating" @click="handleCreate">
        创建
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { AssetType } from '@/types/asset'
import { ASSET_TYPE_LABELS } from '@/types/asset'
import { assetsApi } from '@/services/api'

interface Props {
  modelValue: boolean
  projectId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const formRef = ref<FormInstance>()
const creating = ref(false)

const formData = ref({
  name: '',
  slug: '',
  type: 'requirement' as AssetType,
  description: '',
  tags: [] as string[],
  owners: [] as string[],
})

// Available options (mock data for now)
const availableTags = ref(['重要', '紧急', '待评审', '已完成', '前端', '后端', 'API'])
const availableUsers = ref([
  { id: 'user1', name: '张三' },
  { id: 'user2', name: '李四' },
  { id: 'user3', name: '王五' },
])

// Auto-generate slug from name
watch(() => formData.value.name, (name) => {
  if (!formData.value.slug || formData.value.slug === generateSlug(formData.value.name.slice(0, -name.length))) {
    formData.value.slug = generateSlug(name)
  }
})

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
}

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入资产名称', trigger: 'blur' },
    { min: 2, max: 100, message: '长度在 2 到 100 个字符', trigger: 'blur' },
  ],
  slug: [
    { required: true, message: '请输入标识符', trigger: 'blur' },
    { pattern: /^[a-z0-9-]+$/, message: '只能包含小写字母、数字和连字符', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' },
  ],
  type: [
    { required: true, message: '请选择资产类型', trigger: 'change' },
  ],
  description: [
    { max: 500, message: '描述不能超过 500 个字符', trigger: 'blur' },
  ],
}

async function handleCreate() {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  creating.value = true
  try {
    await assetsApi.create({
      name: formData.value.name,
      slug: formData.value.slug,
      type: formData.value.type,
      description: formData.value.description,
      tags: formData.value.tags,
      owners: formData.value.owners,
      projectId: props.projectId,
    })

    ElMessage.success('资产创建成功')
    emit('created')
    handleClose()
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    ElMessage.error(message)
  } finally {
    creating.value = false
  }
}

function handleClose() {
  formRef.value?.resetFields()
  formData.value = {
    name: '',
    slug: '',
    type: 'requirement',
    description: '',
    tags: [],
    owners: [],
  }
  emit('update:modelValue', false)
}
</script>
