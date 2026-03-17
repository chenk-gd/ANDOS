import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNotificationStore } from '@/stores/notification'
import { ElMessage, ElNotification } from 'element-plus'

// Mock Element Plus - factory must not reference external variables
vi.mock('element-plus', () => ({
  ElMessage: Object.assign(
    vi.fn(),
    {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      closeAll: vi.fn(),
    }
  ),
  ElNotification: Object.assign(
    vi.fn(),
    {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      closeAll: vi.fn(),
    }
  ),
}))

describe('Notification Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('initializes with empty notification queue', () => {
    const store = useNotificationStore()
    expect(store.notificationQueue).toEqual([])
  })

  describe('Toast methods', () => {
    it('shows success toast', () => {
      const store = useNotificationStore()
      store.success('Success message')
      expect(ElMessage).toHaveBeenCalledWith({
        message: 'Success message',
        type: 'success',
        duration: 3000,
        showClose: true,
        grouping: true,
      })
    })

    it('shows error toast with longer duration', () => {
      const store = useNotificationStore()
      store.error('Error message')
      expect(ElMessage).toHaveBeenCalledWith({
        message: 'Error message',
        type: 'error',
        duration: 5000,
        showClose: true,
        grouping: true,
      })
    })

    it('shows warning toast', () => {
      const store = useNotificationStore()
      store.warning('Warning message')
      expect(ElMessage).toHaveBeenCalledWith({
        message: 'Warning message',
        type: 'warning',
        duration: 3000,
        showClose: true,
        grouping: true,
      })
    })

    it('shows info toast', () => {
      const store = useNotificationStore()
      store.info('Info message')
      expect(ElMessage).toHaveBeenCalledWith({
        message: 'Info message',
        type: 'info',
        duration: 3000,
        showClose: true,
        grouping: true,
      })
    })

    it('accepts string parameter for toast', () => {
      const store = useNotificationStore()
      store.showToast('Simple message')
      expect(ElMessage).toHaveBeenCalledWith({
        message: 'Simple message',
        type: 'info',
        duration: 3000,
        showClose: true,
        grouping: true,
      })
    })

    it('accepts object parameter for toast', () => {
      const store = useNotificationStore()
      store.showToast({ message: 'Object message', type: 'success' })
      expect(ElMessage).toHaveBeenCalledWith({
        message: 'Object message',
        type: 'success',
        duration: 3000,
        showClose: true,
        grouping: true,
      })
    })
  })

  describe('Notification methods', () => {
    it('shows success notification', () => {
      const store = useNotificationStore()
      store.notifySuccess('Title', 'Message')
      expect(ElNotification).toHaveBeenCalledWith({
        title: 'Title',
        message: 'Message',
        type: 'success',
        duration: 4500,
        showClose: true,
        onClose: undefined,
      })
    })

    it('shows error notification with no auto-close', () => {
      const store = useNotificationStore()
      store.notifyError('Title', 'Message')
      expect(ElNotification).toHaveBeenCalledWith({
        title: 'Title',
        message: 'Message',
        type: 'error',
        duration: 0,
        showClose: true,
        onClose: undefined,
      })
    })

    it('shows warning notification', () => {
      const store = useNotificationStore()
      store.notifyWarning('Title', 'Message')
      expect(ElNotification).toHaveBeenCalledWith({
        title: 'Title',
        message: 'Message',
        type: 'warning',
        duration: 4500,
        showClose: true,
        onClose: undefined,
      })
    })

    it('shows info notification', () => {
      const store = useNotificationStore()
      store.notifyInfo('Title', 'Message')
      expect(ElNotification).toHaveBeenCalledWith({
        title: 'Title',
        message: 'Message',
        type: 'info',
        duration: 4500,
        showClose: true,
        onClose: undefined,
      })
    })
  })

  describe('API Error handling', () => {
    it('handles Error objects', () => {
      const store = useNotificationStore()
      const error = new Error('Test error')
      store.handleApiError(error)
      expect(ElNotification).toHaveBeenCalled()
    })

    it('handles string errors', () => {
      const store = useNotificationStore()
      store.handleApiError('String error')
      expect(ElNotification).toHaveBeenCalled()
    })

    it('handles object errors with message property', () => {
      const store = useNotificationStore()
      store.handleApiError({ message: 'Object error message' })
      expect(ElNotification).toHaveBeenCalled()
    })

    it('handles network errors specially', () => {
      const store = useNotificationStore()
      store.handleApiError(new Error('network error'))
      const call = (ElNotification as any).mock.calls[0][0]
      expect(call.title).toBe('网络错误')
      expect(call.message).toContain('网络连接失败')
    })

    it('handles timeout errors specially', () => {
      const store = useNotificationStore()
      store.handleApiError(new Error('timeout occurred'))
      const call = (ElNotification as any).mock.calls[0][0]
      expect(call.title).toBe('请求超时')
      expect(call.message).toContain('服务器响应超时')
    })

    it('returns error details', () => {
      const store = useNotificationStore()
      const result = store.handleApiError(new Error('Test'))
      expect(result).toHaveProperty('title')
      expect(result).toHaveProperty('message')
    })

    it('uses default message when provided', () => {
      const store = useNotificationStore()
      store.handleApiError({}, 'Custom default message')
      const call = (ElNotification as any).mock.calls[0][0]
      expect(call.message).toBe('Custom default message')
    })
  })

  it('closes all notifications', () => {
    const store = useNotificationStore()
    store.closeAll()
    expect(ElMessage.closeAll).toHaveBeenCalled()
    expect(ElNotification.closeAll).toHaveBeenCalled()
  })
})
