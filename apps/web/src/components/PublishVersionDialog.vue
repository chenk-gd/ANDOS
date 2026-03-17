<template>
  <el-dialog
    v-model="visible"
    title="发布新版本"
    width="700px"
    :close-on-click-modal="false"
    class="publish-version-dialog"
  >
    <div v-if="currentAsset" class="publish-content">
      <!-- 发布流程步骤条 -->
      <el-steps :active="currentStep" finish-status="success" simple>
        <el-step title="变更摘要" />
        <el-step title="版本信息" />
        <el-step title="确认发布" />
      </el-steps>

      <!-- 步骤1: 变更摘要 -->
      <div v-if="currentStep === 0" class="step-content">
        <h4>变更摘要</h4>
        <div class="change-summary">
          <div class="summary-item">
            <span class="label">资产名称:</span>
            <span class="value">{{ currentAsset.name }}</span>
          </div>
          <div class="summary-item">
            <span class="label">资产类型:</span>
            <span class="value">
              <el-tag size="small">{{ ASSET_TYPE_LABELS[currentAsset.type] }}</el-tag>
            </span>
          </div>
          <div class="summary-item">
            <span class="label">当前版本:</span>
            <span class="value">
              <el-tag type="info" size="small">v{{ currentAsset.currentVersion || '0.0.0' }}</el-tag>
            </span>
          </div>
          <div class="summary-item">
            <span class="label">当前状态:</span>
            <span class="value">
              <el-tag :type="getStateType(currentAsset.state)" size="small">
                {{ ASSET_STATE_LABELS[currentAsset.state] }}
              </el-tag>
            </span>
          </div>
        </div>

        <!-- Diff 预览 -->
        <div class="diff-preview">
          <div class="diff-header">
            <span>内容变更预览</span>
            <el-tag v-if="hasChanges" type="warning" size="small">有变更</el-tag>
            <el-tag v-else type="info" size="small">无变更</el-tag>
          </div>
          <div class="diff-content">
            <div v-if="hasChanges" class="diff-changes">
              <div class="diff-section">
                <div class="diff-label">当前内容 (未发布)</div>
                <pre class="diff-code current">{{ formatContent(currentContent) }}</pre>
              </div>
              <div class="diff-section">
                <div class="diff-label">上一版本</div>
                <pre class="diff-code previous">{{ formatContent(previousContent) }}</pre>
              </div>
            </div>
            <el-empty v-else description="暂无内容变更" />
          </div>
        </div>
      </div>

      <!-- 步骤2: 版本信息 -->
      <div v-if="currentStep === 1" class="step-content">
        <el-form
          ref="versionFormRef"
          :model="versionForm"
          :rules="versionRules"
          label-position="top"
        >
          <!-- 版本号建议 -->
          <el-form-item label="版本号" prop="version">
            <div class="version-input-group">
              <el-input
                v-model="versionForm.version"
                placeholder="例如: 1.0.0"
                class="version-input"
              />
              <el-dropdown @command="handleVersionSuggestion">
                <el-button type="primary" plain>
                  建议版本 <el-icon class="el-icon--right"><arrow-down /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item :command="suggestedVersions.major">
                      <div class="version-suggestion">
                        <span class="version-label">主版本</span>
                        <span class="version-value">{{ suggestedVersions.major }}</span>
                        <span class="version-desc">破坏性变更</span>
                      </div>
                    </el-dropdown-item>
                    <el-dropdown-item :command="suggestedVersions.minor">
                      <div class="version-suggestion">
                        <span class="version-label">次版本</span>
                        <span class="version-value">{{ suggestedVersions.minor }}</span>
                        <span class="version-desc">新功能</span>
                      </div>
                    </el-dropdown-item>
                    <el-dropdown-item :command="suggestedVersions.patch">
                      <div class="version-suggestion">
                        <span class="version-label">修订版本</span>
                        <span class="version-value">{{ suggestedVersions.patch }}</span>
                        <span class="version-desc">Bug修复</span>
                      </div>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="version-help">
              <el-text type="info" size="small">
                遵循 <el-link type="primary" href="https://semver.org/lang/zh-CN/" target="_blank">语义化版本</el-link> 规范
              </el-text>
            </div>
          </el-form-item>

          <!-- 变更类型 -->
          <el-form-item label="变更类型">
            <el-checkbox-group v-model="versionForm.changeTypes">
              <el-checkbox label="feature">新功能</el-checkbox>
              <el-checkbox label="fix">Bug修复</el-checkbox>
              <el-checkbox label="refactor">重构</el-checkbox>
              <el-checkbox label="docs">文档</el-checkbox>
              <el-checkbox label="test">测试</el-checkbox>
              <el-checkbox label="chore">其他</el-checkbox>
            </el-checkbox-group>
          </el-form-item>

          <!-- 变更日志 -->
          <el-form-item label="变更日志" prop="changelog">
            <el-input
              v-model="versionForm.changelog"
              type="textarea"
              :rows="5"
              placeholder="描述本次变更内容，支持 Markdown 格式...

示例:
- 新增: 用户登录功能
- 修复: 数据库连接超时问题
- 优化: 查询性能提升 50%"
            />
          </el-form-item>

          <!-- 变更摘要（自动生成） -->
          <el-form-item label="变更摘要（预览）">
            <div class="changelog-preview">
              <pre>{{ generatedChangelog }}</pre>
            </div>
          </el-form-item>

          <!-- 破坏性变更警告 -->
          <el-alert
            v-if="versionForm.changeTypes.includes('breaking')"
            title="⚠️ 此版本包含破坏性变更"
            type="warning"
            :closable="false"
            show-icon
          >
            <template #default>
              请确保已评估对下游资产的影响，并通知相关团队。
            </template>
          </el-alert>
        </el-form>
      </div>

      <!-- 步骤3: 确认发布 -->
      <div v-if="currentStep === 2" class="step-content">
        <div class="confirm-section">
          <h4>发布确认</h4>

          <div class="confirm-info">
            <div class="info-row">
              <span class="info-label">资产:</span>
              <span class="info-value">{{ currentAsset.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">新版本:</span>
              <span class="info-value">
                <el-tag type="success" size="large">v{{ versionForm.version }}</el-tag>
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">变更类型:</span>
              <span class="info-value">
                <el-tag
                  v-for="type in versionForm.changeTypes"
                  :key="type"
                  size="small"
                  class="change-type-tag"
                >
                  {{ CHANGE_TYPE_LABELS[type] }}
                </el-tag>
                <span v-if="versionForm.changeTypes.length === 0" class="text-muted">无</span>
              </span>
            </div>
          </div>

          <div class="confirm-changelog">
            <div class="changelog-header">变更日志</div>
            <pre class="changelog-body">{{ versionForm.changelog || '（无）' }}</pre>
          </div>

          <el-divider />

          <div class="confirm-actions">
            <el-checkbox v-model="confirmChecked">
              我确认以上信息正确，并准备发布此版本
            </el-checkbox>
          </div>

          <el-alert
            title="发布后资产状态将变为 'clean'，版本内容将不可修改"
            type="info"
            :closable="false"
            show-icon
            style="margin-top: 16px"
          />
        </div>
      </div>
    </div>

    <!-- 底部操作按钮 -->
    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="currentStep > 0" @click="handlePrev">上一步</el-button>
        <el-button v-if="currentStep < 2" type="primary" @click="handleNext">
          下一步
        </el-button>
        <el-button
          v-else
          type="success"
          :loading="publishing"
          :disabled="!confirmChecked"
          @click="handlePublish"
        >
          <el-icon><Upload /></el-icon>
          确认发布
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ArrowDown, Upload } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { Asset, AssetState } from '@/types/asset'
import { ASSET_TYPE_LABELS } from '@/types/asset'

const ASSET_STATE_LABELS: Record<AssetState, string> = {
  draft: '草稿',
  clean: '干净',
  dirty: '已变更',
  modified: '已修改',
  archived: '已归档'
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  feature: '新功能',
  fix: 'Bug修复',
  refactor: '重构',
  docs: '文档',
  test: '测试',
  chore: '其他',
  breaking: '破坏性变更'
}

interface Props {
  modelValue: boolean
  currentAsset: Asset | null
  currentContent?: string
  previousContent?: string
}

const props = withDefaults(defineProps<Props>(), {
  currentContent: '',
  previousContent: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  publish: [data: { version: string; changelog: string; changeTypes: string[] }]
}>()

// 对话框可见性
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

// 当前步骤
const currentStep = ref(0)
const publishing = ref(false)
const confirmChecked = ref(false)

// 版本表单
const versionFormRef = ref<FormInstance>()
const versionForm = ref({
  version: '',
  changelog: '',
  changeTypes: [] as string[]
})

// 表单验证规则
const versionRules: FormRules = {
  version: [
    { required: true, message: '请输入版本号', trigger: 'blur' },
    {
      pattern: /^(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?$/,
      message: '版本号格式不正确，请使用语义化版本格式（如 1.0.0）',
      trigger: 'blur'
    }
  ],
  changelog: [
    { required: true, message: '请输入变更日志', trigger: 'blur' },
    { min: 10, message: '变更日志至少需要10个字符', trigger: 'blur' }
  ]
}

// 是否有变更
const hasChanges = computed(() => {
  return props.currentContent !== props.previousContent
})

// 生成建议版本号
const suggestedVersions = computed(() => {
  const current = props.currentAsset?.currentVersion || '0.0.0'
  const [major, minor, patch] = current.split('.').map(Number)

  return {
    major: `${major + 1}.0.0`,
    minor: `${major}.${minor + 1}.0`,
    patch: `${major}.${minor}.${patch + 1}`
  }
})

// 生成变更日志预览
const generatedChangelog = computed(() => {
  if (!versionForm.value.changelog) {
    return '（请输入变更日志）'
  }

  const lines = versionForm.value.changelog.split('\n').filter(line => line.trim())
  const version = versionForm.value.version || 'x.x.x'
  const date = new Date().toISOString().split('T')[0]

  let result = `## [${version}] - ${date}\n\n`

  if (versionForm.value.changeTypes.includes('feature')) {
    const features = lines.filter(l => l.includes('新增') || l.includes('添加'))
    if (features.length) {
      result += '### 新增\n'
      features.forEach(f => result += `${f}\n`)
      result += '\n'
    }
  }

  if (versionForm.value.changeTypes.includes('fix')) {
    const fixes = lines.filter(l => l.includes('修复') || l.includes('解决'))
    if (fixes.length) {
      result += '### 修复\n'
      fixes.forEach(f => result += `${f}\n`)
      result += '\n'
    }
  }

  return result || versionForm.value.changelog
})

// 获取状态标签类型
function getStateType(state: AssetState): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<AssetState, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    draft: 'info',
    clean: 'success',
    dirty: 'warning',
    modified: '',
    archived: 'danger'
  }
  return map[state]
}

// 格式化内容显示
function formatContent(content: string): string {
  if (!content) return '（无内容）'
  if (typeof content !== 'string') {
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return String(content)
    }
  }
  return content.length > 500 ? content.substring(0, 500) + '...' : content
}

// 处理版本建议
function handleVersionSuggestion(version: string) {
  versionForm.value.version = version
}

// 下一步
async function handleNext() {
  if (currentStep.value === 1) {
    const valid = await versionFormRef.value?.validate().catch(() => false)
    if (!valid) return
  }

  if (currentStep.value < 2) {
    currentStep.value++
  }
}

// 上一步
function handlePrev() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

// 发布
async function handlePublish() {
  if (!confirmChecked.value) return

  publishing.value = true
  try {
    emit('publish', {
      version: versionForm.value.version,
      changelog: versionForm.value.changelog,
      changeTypes: versionForm.value.changeTypes
    })

    // 重置状态
    visible.value = false
    currentStep.value = 0
    versionForm.value = { version: '', changelog: '', changeTypes: [] }
    confirmChecked.value = false
  } finally {
    publishing.value = false
  }
}

// 监听对话框打开
watch(() => visible.value, (isOpen) => {
  if (isOpen) {
    // 初始化建议版本
    versionForm.value.version = suggestedVersions.value.patch
  }
})

// 重置表单
watch(() => currentStep.value, (step) => {
  if (step === 0) {
    confirmChecked.value = false
  }
})
</script>

<style scoped>
.publish-content {
  padding: 20px 0;
}

.step-content {
  margin-top: 24px;
}

.step-content h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: var(--text-primary);
}

.change-summary {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.summary-item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.summary-item:last-child {
  margin-bottom: 0;
}

.summary-item .label {
  width: 80px;
  color: var(--text-secondary);
  font-size: 14px;
}

.summary-item .value {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}

.diff-preview {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-weight: 500;
}

.diff-content {
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.diff-changes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.diff-section {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.diff-label {
  padding: 8px 12px;
  background: var(--bg-secondary);
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.diff-code {
  margin: 0;
  padding: 12px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--bg-primary);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-code.current {
  border-left: 3px solid var(--el-color-success);
}

.diff-code.previous {
  border-left: 3px solid var(--el-color-info);
}

.version-input-group {
  display: flex;
  gap: 12px;
}

.version-input {
  flex: 1;
}

.version-help {
  margin-top: 8px;
}

.version-suggestion {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.version-label {
  width: 60px;
  font-weight: 500;
}

.version-value {
  font-family: monospace;
  color: var(--el-color-primary);
}

.version-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.changelog-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
}

.changelog-preview pre {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.confirm-section {
  padding: 0 20px;
}

.confirm-section h4 {
  margin-bottom: 20px;
}

.confirm-info {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  width: 80px;
  color: var(--text-secondary);
  font-size: 14px;
}

.info-value {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}

.change-type-tag {
  margin-right: 8px;
}

.text-muted {
  color: var(--text-secondary);
  font-size: 14px;
}

.confirm-changelog {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.changelog-header {
  padding: 12px 16px;
  background: var(--bg-secondary);
  font-weight: 500;
  border-bottom: 1px solid var(--border-color);
}

.changelog-body {
  margin: 0;
  padding: 16px;
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: var(--bg-primary);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.confirm-actions {
  margin-top: 16px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
