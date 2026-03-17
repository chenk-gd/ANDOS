<template>
  <div class="structured-editor">
    <el-form
      ref="formRef"
      :model="formData"
      :rules="validationRules"
      label-position="top"
      class="structured-form"
    >
      <!-- 动态渲染表单字段 -->
      <template v-for="field in schemaFields" :key="field.key">
        <!-- 对象类型 - 递归渲染 -->
        <el-form-item
          v-if="field.type === 'object'"
          :label="field.label"
          :prop="field.key"
        >
          <div class="nested-object">
            <StructuredEditor
              v-model="formData[field.key]"
              :schema="field.properties"
              :nested="true"
              @change="handleChange"
            />
          </div>
        </el-form-item>

        <!-- 数组类型 -->
        <el-form-item
          v-else-if="field.type === 'array'"
          :label="field.label"
          :prop="field.key"
        >
          <div class="array-field">
            <div
              v-for="(item, index) in formData[field.key] || []"
              :key="index"
              class="array-item"
            >
              <div class="array-item-content">
                <template v-if="field.itemType === 'object'">
                  <StructuredEditor
                    v-model="formData[field.key][index]"
                    :schema="field.items"
                    :nested="true"
                    @change="handleChange"
                  />
                </template>
                <template v-else-if="field.itemType === 'string'">
                  <el-input
                    v-model="formData[field.key][index]"
                    type="textarea"
                    :rows="2"
                    @change="handleChange"
                  />
                </template>
                <template v-else>
                  <el-input
                    v-model="formData[field.key][index]"
                    @change="handleChange"
                  />
                </template>
              </div>
              <el-button
                type="danger"
                link
                :icon="Delete"
                @click="removeArrayItem(field.key, index)"
              />
            </div>
            <el-button
              type="primary"
              link
              :icon="Plus"
              @click="addArrayItem(field)"
            >
              添加{{ field.itemLabel || '项' }}
            </el-button>
          </div>
        </el-form-item>

        <!-- 文本域 -->
        <el-form-item
          v-else-if="field.type === 'textarea'"
          :label="field.label"
          :prop="field.key"
        >
          <el-input
            v-model="formData[field.key]"
            type="textarea"
            :rows="field.rows || 4"
            :placeholder="field.placeholder"
            :maxlength="field.maxLength"
            show-word-limit
            @change="handleChange"
          />
        </el-form-item>

        <!-- 下拉选择 -->
        <el-form-item
          v-else-if="field.type === 'select'"
          :label="field.label"
          :prop="field.key"
        >
          <el-select
            v-model="formData[field.key]"
            :placeholder="field.placeholder"
            :multiple="field.multiple"
            :clearable="field.clearable"
            style="width: 100%"
            @change="handleChange"
          >
            <el-option
              v-for="option in field.options"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <!-- 单选 -->
        <el-form-item
          v-else-if="field.type === 'radio'"
          :label="field.label"
          :prop="field.key"
        >
          <el-radio-group v-model="formData[field.key]" @change="handleChange">
            <el-radio
              v-for="option in field.options"
              :key="option.value"
              :label="option.value"
            >
              {{ option.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- 开关 -->
        <el-form-item
          v-else-if="field.type === 'switch'"
          :label="field.label"
          :prop="field.key"
        >
          <el-switch v-model="formData[field.key]" @change="handleChange" />
        </el-form-item>

        <!-- 日期选择 -->
        <el-form-item
          v-else-if="field.type === 'date'"
          :label="field.label"
          :prop="field.key"
        >
          <el-date-picker
            v-model="formData[field.key]"
            type="date"
            :placeholder="field.placeholder"
            style="width: 100%"
            @change="handleChange"
          />
        </el-form-item>

        <!-- 数字输入 -->
        <el-form-item
          v-else-if="field.type === 'number'"
          :label="field.label"
          :prop="field.key"
        >
          <el-input-number
            v-model="formData[field.key]"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            :precision="field.precision"
            style="width: 100%"
            @change="handleChange"
          />
        </el-form-item>

        <!-- 默认文本输入 -->
        <el-form-item
          v-else
          :label="field.label"
          :prop="field.key"
        >
          <el-input
            v-model="formData[field.key]"
            :placeholder="field.placeholder"
            :maxlength="field.maxLength"
            show-word-limit
            @change="handleChange"
          />
        </el-form-item>
      </template>

      <!-- 操作按钮 -->
      <el-form-item v-if="!nested">
        <div class="form-actions">
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!hasChanges"
            @click="handleSave"
          >
            <el-icon><Check /></el-icon>
            保存
          </el-button>
          <el-button :disabled="!hasChanges" @click="handleReset">
            <el-icon><RefreshRight /></el-icon>
            重置
          </el-button>
          <el-button type="success" @click="handlePublish">
            <el-icon><Upload /></el-icon>
            发布版本
          </el-button>
          <span v-if="saveStatus" class="save-status" :class="saveStatus.type">
            {{ saveStatus.message }}
          </span>
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineExpose } from 'vue'
import { Check, RefreshRight, Upload, Plus, Delete } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'

// Schema 字段定义
export interface SchemaField {
  key: string
  label: string
  type: 'string' | 'textarea' | 'number' | 'select' | 'radio' | 'switch' | 'date' | 'object' | 'array'
  placeholder?: string
  required?: boolean
  maxLength?: number
  min?: number
  max?: number
  step?: number
  precision?: number
  rows?: number
  multiple?: boolean
  clearable?: boolean
  options?: { label: string; value: any }[]
  properties?: SchemaField[]  // for object type
  items?: SchemaField[]       // for array type
  itemType?: 'string' | 'object'
  itemLabel?: string
  validator?: (value: any) => boolean | string
}

interface Props {
  modelValue: Record<string, any>
  schema: SchemaField[]
  nested?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  nested: false,
  modelValue: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
  change: [value: Record<string, any>]
  save: [value: Record<string, any>]
  publish: []
}>()

// 表单引用
const formRef = ref<FormInstance>()
const formData = ref<Record<string, any>>({})
const originalData = ref('')
const saving = ref(false)
const saveStatus = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// Schema 字段（支持嵌套和数组）
const schemaFields = computed(() => props.schema)

// 计算是否有变更
const hasChanges = computed(() => {
  return JSON.stringify(formData.value) !== originalData.value
})

// 生成验证规则
const validationRules = computed<FormRules>(() => {
  const rules: FormRules = {}

  props.schema.forEach((field) => {
    const fieldRules: any[] = []

    if (field.required) {
      fieldRules.push({
        required: true,
        message: `请输入${field.label}`,
        trigger: 'blur'
      })
    }

    if (field.maxLength) {
      fieldRules.push({
        max: field.maxLength,
        message: `${field.label}不能超过${field.maxLength}个字符`,
        trigger: 'blur'
      })
    }

    if (field.type === 'number') {
      fieldRules.push({
        type: 'number',
        message: `${field.label}必须是数字`,
        trigger: 'change'
      })
    }

    if (field.validator) {
      fieldRules.push({
        validator: (rule: any, value: any, callback: any) => {
          const result = field.validator!(value)
          if (result === true) {
            callback()
          } else {
            callback(new Error(result as string))
          }
        },
        trigger: 'blur'
      })
    }

    if (fieldRules.length > 0) {
      rules[field.key] = fieldRules
    }
  })

  return rules
})

// 监听 modelValue 变化
watch(() => props.modelValue, (newValue) => {
  formData.value = { ...newValue }
  originalData.value = JSON.stringify(formData.value)
}, { immediate: true, deep: true })

// 监听表单变化并同步
watch(() => formData.value, (newValue) => {
  emit('update:modelValue', newValue)
}, { deep: true })

// 处理字段变化
function handleChange() {
  emit('change', formData.value)
}

// 添加数组项
function addArrayItem(field: SchemaField) {
  if (!formData.value[field.key]) {
    formData.value[field.key] = []
  }

  let newItem: any
  if (field.itemType === 'object') {
    newItem = {}
    // 初始化对象字段
    field.items?.forEach((item) => {
      newItem[item.key] = getDefaultValue(item.type)
    })
  } else if (field.itemType === 'string') {
    newItem = ''
  } else {
    newItem = ''
  }

  formData.value[field.key].push(newItem)
  handleChange()
}

// 移除数组项
function removeArrayItem(key: string, index: number) {
  formData.value[key].splice(index, 1)
  handleChange()
}

// 获取默认值
function getDefaultValue(type: string): any {
  switch (type) {
    case 'string':
    case 'textarea':
      return ''
    case 'number':
      return 0
    case 'select':
      return null
    case 'radio':
      return null
    case 'switch':
      return false
    case 'date':
      return null
    case 'object':
      return {}
    case 'array':
      return []
    default:
      return ''
  }
}

// 保存
async function handleSave() {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  saveStatus.value = null

  try {
    emit('save', formData.value)
    originalData.value = JSON.stringify(formData.value)
    saveStatus.value = { type: 'success', message: '保存成功' }

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

// 重置
function handleReset() {
  formData.value = JSON.parse(originalData.value)
  formRef.value?.clearValidate()
  saveStatus.value = null
  emit('update:modelValue', formData.value)
}

// 发布
function handlePublish() {
  emit('publish')
}

// 验证方法
async function validate(): Promise<boolean> {
  if (!formRef.value) return false
  return formRef.value.validate().catch(() => false)
}

// 暴露方法
defineExpose({
  validate,
  getData: () => formData.value,
  hasChanges: () => hasChanges.value
})
</script>

<style scoped>
.structured-editor {
  padding: 20px;
}

.structured-form {
  max-width: 800px;
}

.nested-object {
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.array-field {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.array-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.array-item-content {
  flex: 1;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.save-status {
  font-size: 14px;
}

.save-status.success {
  color: var(--el-color-success);
}

.save-status.error {
  color: var(--el-color-danger);
}

/* 嵌套编辑器的样式调整 */
.structured-editor :deep(.structured-editor) {
  padding: 0;
}

.structured-editor :deep(.form-actions) {
  margin-top: 0;
}
</style>
