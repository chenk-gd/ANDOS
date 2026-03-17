import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage, ElNotification } from 'element-plus'

export type NotificationType = 'success' | 'warning' | 'error' | 'info'

export interface NotificationOptions {
  title?: string
  message: string
  type?: NotificationType
  duration?: number
  showClose?: boolean
  onClose?: () => void
}

export interface ToastOptions {
  message: string
  type?: NotificationType
  duration?: number
  showClose?: boolean
  grouping?: boolean
}

export const useNotificationStore = defineStore('notification', () => {
  // 通知队列（用于自定义通知组件）
  const notificationQueue = ref<NotificationOptions[]>([])

  // 显示 Toast 消息
  function showToast(options: ToastOptions | string) {
    const opts: ToastOptions = typeof options === 'string' ? { message: options } : options

    ElMessage({
      message: opts.message,
      type: opts.type || 'info',
      duration: opts.duration || 3000,
      showClose: opts.showClose ?? true,
      grouping: opts.grouping ?? true,
    })
  }

  // 显示通知
  function showNotification(options: NotificationOptions) {
    ElNotification({
      title: options.title,
      message: options.message,
      type: options.type || 'info',
      duration: options.duration ?? 4500,
      showClose: options.showClose ?? true,
      onClose: options.onClose,
    })
  }

  // 快捷方法
  function success(message: string, duration?: number) {
    showToast({ message, type: 'success', duration })
  }

  function warning(message: string, duration?: number) {
    showToast({ message, type: 'warning', duration })
  }

  function error(message: string, duration?: number) {
    showToast({ message, type: 'error', duration: duration || 5000 })
  }

  function info(message: string, duration?: number) {
    showToast({ message, type: 'info', duration })
  }

  // 通知栏通知（右侧弹出）
  function notifySuccess(title: string, message: string) {
    showNotification({ title, message, type: 'success' })
  }

  function notifyError(title: string, message: string) {
    showNotification({ title, message, type: 'error', duration: 0 })
  }

  function notifyWarning(title: string, message: string) {
    showNotification({ title, message, type: 'warning' })
  }

  function notifyInfo(title: string, message: string) {
    showNotification({ title, message, type: 'info' })
  }

  // API 错误处理
  function handleApiError(err: unknown, defaultMessage?: string) {
    let message = defaultMessage || '操作失败'
    let title = '错误'

    if (err instanceof Error) {
      message = err.message
    } else if (typeof err === 'string') {
      message = err
    } else if (err && typeof err === 'object') {
      const errorObj = err as Record<string, unknown>
      message = (errorObj.message as string) ||
                (errorObj.error as string) ||
                defaultMessage ||
                '操作失败'
      title = (errorObj.title as string) || '错误'
    }

    // 网络错误特殊处理
    if (message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch')) {
      title = '网络错误'
      message = '网络连接失败，请检查网络设置后重试'
    }

    // 超时错误
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      title = '请求超时'
      message = '服务器响应超时，请稍后重试'
    }

    showNotification({
      title,
      message,
      type: 'error',
      duration: 5000,
    })

    return { title, message }
  }

  // 清空所有消息
  function closeAll() {
    ElMessage.closeAll()
    ElNotification.closeAll()
  }

  return {
    notificationQueue,
    showToast,
    showNotification,
    success,
    warning,
    error,
    info,
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    handleApiError,
    closeAll,
  }
})
