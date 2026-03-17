<template>
  <div v-if="error" class="error-boundary">
    <el-result
      :icon="errorIcon"
      :title="errorTitle"
      :sub-title="errorSubtitle"
    >
      <template #extra>
        <el-button type="primary" @click="retry">
          <el-icon><RefreshRight /></el-icon>
          重试
        </el-button>
        <el-button @click="reset">
          <el-icon><HomeFilled /></el-icon>
          返回首页
        </el-button>
        <el-button v-if="showReport" @click="reportError">
          <el-icon><Promotion /></el-icon>
          上报错误
        </el-button>
      </template>

      <!-- 错误详情 -->
      <div class="error-details">
        <el-divider />
        <div class="error-summary" @click="toggleDetails">
          <el-icon class="toggle-icon" :class="{ expanded: showDetails }">
            <ArrowDown />
          </el-icon>
          <span>错误详情</span>
          <el-tag :type="errorTypeTag.type" size="small" class="error-type-tag">
            {{ errorTypeTag.label }}
          </el-tag>
        </div>

        <el-collapse-transition>
          <div v-show="showDetails" class="error-content">
            <div class="error-info">
              <div class="info-row">
                <span class="info-label">错误类型：</span>
                <span class="info-value">{{ error?.name || 'Unknown' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">错误信息：</span>
                <span class="info-value">{{ error?.message }}</span>
              </div>
              <div v-if="errorInfo?.componentName" class="info-row">
                <span class="info-label">组件：</span>
                <span class="info-value">{{ errorInfo.componentName }}</span>
              </div>
              <div v-if="errorInfo?.requestId" class="info-row">
                <span class="info-label">请求ID：</span>
                <el-tag size="small" type="info">{{ errorInfo.requestId }}</el-tag>
              </div>
              <div v-if="errorInfo?.url" class="info-row">
                <span class="info-label">请求URL：</span>
                <span class="info-value url">{{ errorInfo.url }}</span>
              </div>
              <div v-if="errorInfo?.statusCode" class="info-row">
                <span class="info-label">状态码：</span>
                <el-tag :type="getStatusCodeType(errorInfo.statusCode)" size="small">
                  {{ errorInfo.statusCode }}
                </el-tag>
              </div>
              <div v-if="errorInfo?.timestamp" class="info-row">
                <span class="info-label">发生时间：</span>
                <span class="info-value">{{ formatTime(errorInfo.timestamp) }}</span>
              </div>
            </div>

            <!-- 错误堆栈 -->
            <div v-if="error?.stack" class="stack-trace">
              <div class="section-title">堆栈跟踪</div>
              <pre class="stack-content">{{ formatStackTrace(error.stack) }}</pre>
            </div>

            <!-- 复制按钮 -->
            <el-button
              link
              type="primary"
              size="small"
              class="copy-btn"
              @click="copyErrorDetails"
            >
              <el-icon><DocumentCopy /></el-icon>
              复制错误信息
            </el-button>
          </div>
        </el-collapse-transition>
      </div>
    </el-result>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, computed, onErrorCaptured, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  RefreshRight,
  HomeFilled,
  Promotion,
  ArrowDown,
  DocumentCopy,
} from '@element-plus/icons-vue'

interface ErrorInfo {
  componentName?: string
  requestId?: string
  url?: string
  statusCode?: number
  timestamp?: number
}

interface Props {
  // 是否显示上报按钮
  showReport?: boolean
  // 上报错误回调
  onReport?: (error: Error, info: ErrorInfo) => void | Promise<void>
  // 是否自动上报
  autoReport?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showReport: false,
  autoReport: false,
})

const error = ref<Error | null>(null)
const errorInfo = ref<ErrorInfo>({})
const showDetails = ref(false)
const router = useRouter()

// 错误类型判断
const errorType = computed(() => {
  if (!error.value) return 'unknown'

  const msg = error.value.message?.toLowerCase() || ''
  const name = error.value.name?.toLowerCase() || ''

  // 网络错误
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    name.includes('network') ||
    errorInfo.value.statusCode === 0
  ) {
    return 'network'
  }

  // API/HTTP 错误
  if (
    errorInfo.value.statusCode &&
    (errorInfo.value.statusCode >= 400 || errorInfo.value.statusCode < 600)
  ) {
    return 'api'
  }

  // 运行时错误
  if (
    name.includes('type') ||
    name.includes('reference') ||
    name.includes('range') ||
    name.includes('syntax')
  ) {
    return 'runtime'
  }

  return 'unknown'
})

// 错误图标
const errorIcon = computed(() => {
  const iconMap: Record<string, any> = {
    network: 'warning',
    api: 'error',
    runtime: 'error',
    unknown: 'error',
  }
  return iconMap[errorType.value] || 'error'
})

// 错误标题
const errorTitle = computed(() => {
  const titleMap: Record<string, string> = {
    network: '网络连接失败',
    api: '服务器错误',
    runtime: '程序运行错误',
    unknown: '出错了',
  }
  return titleMap[errorType.value] || '出错了'
})

// 错误副标题
const errorSubtitle = computed(() => {
  const subtitleMap: Record<string, string> = {
    network: '请检查您的网络连接，或稍后重试',
    api: '服务器处理请求时发生错误，请稍后重试',
    runtime: '程序执行过程中发生错误，我们的团队已收到通知',
    unknown: '发生未知错误，请尝试刷新页面',
  }
  return subtitleMap[errorType.value] || error.value?.message || '发生未知错误'
})

// 错误类型标签
const errorTypeTag = computed(() => {
  const tagMap: Record<string, { type: any; label: string }> = {
    network: { type: 'warning', label: '网络错误' },
    api: { type: 'danger', label: 'API错误' },
    runtime: { type: 'danger', label: '运行时错误' },
    unknown: { type: 'info', label: '未知错误' },
  }
  return tagMap[errorType.value] || { type: 'info', label: '未知' }
})

// 状态码类型
function getStatusCodeType(code: number): any {
  if (code >= 500) return 'danger'
  if (code >= 400) return 'warning'
  if (code >= 300) return 'info'
  return 'success'
}

// 格式化时间
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

// 格式化堆栈跟踪
function formatStackTrace(stack: string): string {
  return stack
    .split('\n')
    .map(line => line.trim())
    .filter(line => line)
    .slice(0, 20) // 限制行数
    .join('\n')
}

// 切换详情显示
function toggleDetails() {
  showDetails.value = !showDetails.value
}

// 复制错误信息
async function copyErrorDetails() {
  const details = `
错误类型: ${error.value?.name || 'Unknown'}
错误信息: ${error.value?.message}
组件: ${errorInfo.value.componentName || '-'}
请求ID: ${errorInfo.value.requestId || '-'}
URL: ${errorInfo.value.url || '-'}
状态码: ${errorInfo.value.statusCode || '-'}
时间: ${errorInfo.value.timestamp ? formatTime(errorInfo.value.timestamp) : '-'}

堆栈:
${error.value?.stack || '-'}
  `.trim()

  try {
    await navigator.clipboard.writeText(details)
    ElMessage.success('错误信息已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

// 上报错误
async function reportError() {
  if (props.onReport) {
    try {
      await props.onReport(error.value!, errorInfo.value)
      ElMessage.success('错误已上报，感谢您的反馈')
    } catch {
      ElMessage.error('上报失败，请稍后重试')
    }
  }
}

// 重试
function retry() {
  error.value = null
  errorInfo.value = {}
}

// 重置/返回首页
function reset() {
  error.value = null
  errorInfo.value = {}
  router.push('/').catch(() => {
    window.location.href = '/'
  })
}

// 捕获错误
onErrorCaptured((err, instance, info) => {
  error.value = err as Error
  errorInfo.value = {
    componentName: instance?.$options?.name,
    timestamp: Date.now(),
  }

  // 记录错误
  console.error('[ErrorBoundary] Caught error:', {
    error: err,
    component: instance,
    info,
    type: errorType.value,
  })

  // 自动上报
  if (props.autoReport && props.onReport) {
    const result = props.onReport(err as Error, errorInfo.value)
    if (result instanceof Promise) {
      result.catch(console.error)
    }
  }

  return false
})

// 全局错误监听
onMounted(() => {
  const handler = (event: ErrorEvent) => {
    if (!error.value) {
      error.value = event.error || new Error(event.message)
      errorInfo.value = {
        timestamp: Date.now(),
        url: event.filename,
      }
    }
  }

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    if (!error.value) {
      const reason = event.reason
      if (reason instanceof Error) {
        error.value = reason
      } else {
        error.value = new Error(String(reason))
      }
      errorInfo.value = {
        timestamp: Date.now(),
      }

      // 尝试提取 API 错误信息
      if (reason?.statusCode) {
        errorInfo.value.statusCode = reason.statusCode
      }
      if (reason?.requestId) {
        errorInfo.value.requestId = reason.requestId
      }
      if (reason?.url) {
        errorInfo.value.url = reason.url
      }
    }
  }

  window.addEventListener('error', handler)
  window.addEventListener('unhandledrejection', rejectionHandler)

  // 清理函数
  return () => {
    window.removeEventListener('error', handler)
    window.removeEventListener('unhandledrejection', rejectionHandler)
  }
})

// 暴露方法给父组件
defineExpose({
  clearError: retry,
  setError: (err: Error, info?: ErrorInfo) => {
    error.value = err
    errorInfo.value = info || { timestamp: Date.now() }
  },
})
</script>

<style scoped>
.error-boundary {
  padding: 40px 20px;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-details {
  max-width: 600px;
  margin-top: 20px;
  text-align: left;
}

.error-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 0;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.error-summary:hover {
  color: var(--text-primary);
}

.toggle-icon {
  transition: transform 0.3s;
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

.error-type-tag {
  margin-left: auto;
}

.error-content {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  margin-top: 8px;
}

.error-info {
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 13px;
}

.info-label {
  color: var(--text-secondary);
  min-width: 80px;
  flex-shrink: 0;
}

.info-value {
  color: var(--text-primary);
  word-break: break-all;
}

.info-value.url {
  font-family: monospace;
  font-size: 12px;
}

.stack-trace {
  margin: 16px 0;
}

.section-title {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.stack-content {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.copy-btn {
  margin-top: 8px;
}
</style>
