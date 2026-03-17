import type { Asset, AssetVersion } from '@/types/asset'
import { useNotificationStore } from '@/stores/notification'
import { ApiError, NetworkError, TimeoutError } from '@andos/shared-errors'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1'

interface RequestOptions extends RequestInit {
  // 是否显示错误通知
  showError?: boolean
  // 自定义错误消息
  errorMessage?: string
  // 超时时间（毫秒）
  timeout?: number
  // 重试次数
  retries?: number
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const {
    showError = true,
    errorMessage,
    timeout = 30000,
    retries = 0,
    ...fetchOptions
  } = options || {}

  const url = `${API_BASE}${path}`
  const notificationStore = useNotificationStore()

  // 创建 AbortController 用于超时控制
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let lastError: Error | null = null

  // 重试逻辑
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
        ...fetchOptions,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}` }))
        const message = errorData.message || errorData.error || `HTTP ${response.status}`
        const requestId = response.headers.get('x-request-id') || errorData.requestId

        throw new ApiError(
          message,
          response.status,
          requestId,
          url
        )
      }

      return response.json()
    } catch (err) {
      clearTimeout(timeoutId)

      // 处理超时
      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new TimeoutError()
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        // 网络错误
        lastError = new NetworkError()
      } else {
        lastError = err instanceof Error ? err : new Error(String(err))
      }

      // 如果是最后一次尝试，抛出错误
      if (attempt === retries) {
        break
      }

      // 等待后重试（指数退避）
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }

  // 显示错误通知
  if (showError && lastError) {
    const title = lastError instanceof ApiError
      ? `请求失败 (${lastError.statusCode})`
      : lastError instanceof NetworkError
        ? '网络错误'
        : lastError instanceof TimeoutError
          ? '请求超时'
          : '错误'

    notificationStore.showNotification({
      title,
      message: errorMessage || lastError.message,
      type: 'error',
      duration: 5000,
    })
  }

  throw lastError
}

// 通用 CRUD API 工厂
function createCrudApi<T extends { id: string }>(resource: string) {
  return {
    async list(projectId?: string): Promise<{ data: T[] }> {
      const params = projectId ? `?project_id=${projectId}` : ''
      return request(`/${resource}${params}`)
    },

    async get(id: string): Promise<{ data: T }> {
      return request(`/${resource}/${id}`)
    },

    async create(data: Partial<T>): Promise<{ data: T }> {
      return request(`/${resource}`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    async update(id: string, data: Partial<T>): Promise<{ data: T }> {
      return request(`/${resource}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    },

    async delete(id: string): Promise<void> {
      await request(`/${resource}/${id}`, { method: 'DELETE' })
    },
  }
}

// 资产 API
export const assetsApi = {
  async list(projectId?: string): Promise<{ data: Asset[] }> {
    const params = projectId ? `?project_id=${projectId}` : ''
    return request(`/assets${params}`)
  },

  async get(id: string): Promise<{ data: Asset }> {
    return request(`/assets/${id}`)
  },

  async create(data: Partial<Asset>): Promise<{ data: Asset }> {
    return request('/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: string, data: Partial<Asset>): Promise<{ data: Asset }> {
    return request(`/assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async delete(id: string): Promise<void> {
    await request(`/assets/${id}`, { method: 'DELETE' })
  },

  async restore(id: string): Promise<{ data: Asset }> {
    return request(`/assets/${id}/restore`, { method: 'POST' })
  },

  async listDeleted(projectId?: string): Promise<{ data: Asset[] }> {
    const params = projectId ? `?project_id=${projectId}` : ''
    return request(`/assets/deleted${params}`)
  },

  async listVersions(id: string): Promise<{ data: AssetVersion[] }> {
    return request(`/assets/${id}/versions`)
  },

  async publishVersion(id: string, version: string, changelog?: string): Promise<{ data: AssetVersion }> {
    return request(`/assets/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ version, changelog }),
    })
  },

  async markClean(id: string): Promise<{ data: Asset }> {
    return request(`/assets/${id}/mark-clean`, {
      method: 'POST',
    })
  },
}

// 导出请求函数和工厂函数
export { request, createCrudApi }
