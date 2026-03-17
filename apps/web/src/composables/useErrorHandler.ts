import { ref, computed } from 'vue'
import { useNotificationStore } from '@/stores/notification'

export interface ErrorHandlerOptions {
  // 是否显示 toast 通知
  showToast?: boolean
  // 是否上报错误
  report?: boolean
  // 自定义错误消息
  defaultMessage?: string
  // 错误标题（用于通知）
  title?: string
  // 重试函数
  retry?: () => void | Promise<void>
  // 错误分类处理
  onNetworkError?: (err: Error) => void
  onApiError?: (err: Error, statusCode?: number) => void
  onRuntimeError?: (err: Error) => void
}

export interface ErrorState {
  hasError: boolean
  error: Error | null
  errorType: 'network' | 'api' | 'runtime' | 'unknown'
  isRetrying: boolean
  retryCount: number
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const notificationStore = useNotificationStore()

  const errorState = ref<ErrorState>({
    hasError: false,
    error: null,
    errorType: 'unknown',
    isRetrying: false,
    retryCount: 0,
  })

  const maxRetries = 3

  // 判断错误类型
  function classifyError(err: unknown): ErrorState['errorType'] {
    if (!(err instanceof Error)) return 'unknown'

    const msg = err.message?.toLowerCase() || ''

    // 网络错误
    if (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('failed to fetch') ||
      msg.includes('net::') ||
      msg.includes('abort')
    ) {
      return 'network'
    }

    // API 错误（通常包含状态码）
    if (
      msg.includes('http') ||
      msg.includes('status') ||
      msg.match(/\d{3}/)
    ) {
      return 'api'
    }

    // 运行时错误
    if (
      err.name === 'TypeError' ||
      err.name === 'ReferenceError' ||
      err.name === 'RangeError' ||
      err.name === 'SyntaxError'
    ) {
      return 'runtime'
    }

    return 'unknown'
  }

  // 提取状态码
  function extractStatusCode(err: unknown): number | undefined {
    if (typeof err === 'object' && err !== null) {
      const e = err as Record<string, unknown>
      if (typeof e.statusCode === 'number') return e.statusCode
      if (typeof e.status === 'number') return e.status

      // 从消息中提取
      const msg = e.message as string
      if (msg) {
        const match = msg.match(/(\d{3})/)
        if (match) return parseInt(match[1], 10)
      }
    }
    return undefined
  }

  // 处理错误
  async function handleError(err: unknown, opts: ErrorHandlerOptions = {}): Promise<void> {
    const config = { ...options, ...opts }
    const error = err instanceof Error ? err : new Error(String(err))
    const errorType = classifyError(err)
    const statusCode = extractStatusCode(err)

    // 更新错误状态
    errorState.value = {
      ...errorState.value,
      hasError: true,
      error,
      errorType,
    }

    // 调用对应的错误处理器
    switch (errorType) {
      case 'network':
        config.onNetworkError?.(error)
        break
      case 'api':
        config.onApiError?.(error, statusCode)
        break
      case 'runtime':
        config.onRuntimeError?.(error)
        break
    }

    // 显示 toast 通知
    if (config.showToast !== false) {
      const { title, message } = getErrorDisplayInfo(error, errorType, statusCode, config.defaultMessage)
      notificationStore.showNotification({
        title: config.title || title,
        message,
        type: 'error',
        duration: 5000,
      })
    }

    // 上报错误
    if (config.report) {
      await reportError(error, errorType, statusCode)
    }

    console.error('[useErrorHandler]', {
      error,
      type: errorType,
      statusCode,
      config,
    })
  }

  // 获取错误显示信息
  function getErrorDisplayInfo(
    error: Error,
    type: ErrorState['errorType'],
    statusCode?: number,
    defaultMessage?: string
  ): { title: string; message: string } {
    const info: Record<ErrorState['errorType'], { title: string; message: string }> = {
      network: {
        title: '网络错误',
        message: '网络连接失败，请检查网络设置后重试',
      },
      api: {
        title: statusCode ? `请求错误 (${statusCode})` : '请求错误',
        message: error.message || defaultMessage || '服务器处理请求时发生错误',
      },
      runtime: {
        title: '运行错误',
        message: error.message || defaultMessage || '程序运行过程中发生错误',
      },
      unknown: {
        title: '未知错误',
        message: error.message || defaultMessage || '发生未知错误，请稍后重试',
      },
    }

    return info[type]
  }

  // 上报错误
  async function reportError(error: Error, type: ErrorState['errorType'], statusCode?: number): Promise<void> {
    try {
      // 这里可以集成错误上报服务（如 Sentry、LogRocket 等）
      const reportData = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        type,
        statusCode,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      }

      console.log('[ErrorReport]', reportData)

      // 发送到后端日志服务
      // await fetch('/api/log/error', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(reportData),
      // })
    } catch (e) {
      console.error('[ErrorReport] Failed to report error:', e)
    }
  }

  // 清除错误
  function clearError() {
    errorState.value = {
      hasError: false,
      error: null,
      errorType: 'unknown',
      isRetrying: false,
      retryCount: 0,
    }
  }

  // 重试操作
  async function retry(): Promise<boolean> {
    if (!options.retry || errorState.value.retryCount >= maxRetries) {
      return false
    }

    errorState.value.isRetrying = true
    errorState.value.retryCount++

    try {
      await options.retry()
      clearError()
      return true
    } catch (err) {
      await handleError(err)
      return false
    } finally {
      errorState.value.isRetrying = false
    }
  }

  // 包装异步函数，自动处理错误
  function wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    opts: ErrorHandlerOptions = {}
  ): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
    return async (...args: Parameters<T>) => {
      try {
        clearError()
        return await fn(...args)
      } catch (err) {
        await handleError(err, opts)
        return undefined
      }
    }
  }

  // 计算属性
  const isNetworkError = computed(() => errorState.value.errorType === 'network')
  const isApiError = computed(() => errorState.value.errorType === 'api')
  const isRuntimeError = computed(() => errorState.value.errorType === 'runtime')
  const canRetry = computed(() => !!options.retry && errorState.value.retryCount < maxRetries)

  return {
    errorState,
    isNetworkError,
    isApiError,
    isRuntimeError,
    canRetry,
    handleError,
    clearError,
    retry,
    wrap,
    classifyError,
  }
}

// 全局错误处理器（用于应用初始化时）
export function setupGlobalErrorHandler() {
  const notificationStore = useNotificationStore()

  // 处理未捕获的错误
  window.addEventListener('error', (event) => {
    console.error('[Global Error]', event.error)
    notificationStore.error('程序运行出错，请刷新页面重试')
  })

  // 处理未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Rejection]', event.reason)
    const message = event.reason?.message || '异步操作失败'
    notificationStore.error(message)
  })
}
