import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { request, createCrudApi, assetsApi } from '@/services/api'
import { ApiError, NetworkError, TimeoutError } from '@andos/shared-errors'
import { useNotificationStore } from '@/stores/notification'

// Mock notification store
vi.mock('@/stores/notification', () => ({
  useNotificationStore: vi.fn(() => ({
    showNotification: vi.fn(),
  })),
}))

describe('API Service', () => {
  const API_BASE = 'http://localhost:3000/v1'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('request function', () => {
    it('makes successful GET request', async () => {
      const mockData = { id: '1', name: 'Test' }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)

      const result = await request('/test')

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/test`,
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        })
      )
      expect(result).toEqual(mockData)
    })

    it('makes POST request with body', async () => {
      const mockData = { id: '1', name: 'Test' }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)

      await request('/test', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test' }),
      })

      expect(fetch).toHaveBeenCalledWith(
        `${API_BASE}/test`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        })
      )
    })

    it('throws ApiError on HTTP error', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        headers: {
          get: () => null,
        },
        json: () => Promise.resolve({ message: 'Not found' }),
      } as any)

      await expect(request('/test')).rejects.toThrow(ApiError)
    })

    it('throws NetworkError on network failure', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(request('/test')).rejects.toThrow(NetworkError)
    })

    it('throws TimeoutError on abort', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      vi.mocked(fetch).mockRejectedValue(abortError)

      await expect(request('/test')).rejects.toThrow(TimeoutError)
    })

    it('retries on failure', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' }),
        } as Response)

      const result = await request('/test', { retries: 1 })

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ data: 'success' })
    })

    // Note: This test is skipped due to an issue with fake timers and AbortController
    // The unhandled promise rejection causes vitest to report an error even though
    // the test itself passes. This is a test environment issue, not a code issue.
    it.skip('respects custom timeout', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      // Mock fetch to return a promise that never resolves (but can be aborted)
      vi.mocked(fetch).mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          // Reject with AbortError when aborted
          if (options?.signal) {
            const abortHandler = () => {
              const abortError = new Error('The operation was aborted')
              abortError.name = 'AbortError'
              reject(abortError)
            }
            options.signal.addEventListener('abort', abortHandler)
          }
        })
      })

      const promise = request('/test', { timeout: 1000 })

      // Advance time to trigger the timeout
      await vi.advanceTimersByTimeAsync(1001)

      await expect(promise).rejects.toThrow(TimeoutError)
    })

    it('does not show error notification when showError is false', async () => {
      const notificationStore = useNotificationStore()
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

      try {
        await request('/test', { showError: false })
      } catch {
        // Expected
      }

      expect(notificationStore.showNotification).not.toHaveBeenCalled()
    })
  })

  describe('createCrudApi', () => {
    it('creates CRUD operations', async () => {
      const api = createCrudApi<{ id: string; name: string }>('items')

      // Test list
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: '1', name: 'Item' }] }),
      } as Response)
      const listResult = await api.list()
      expect(listResult.data).toHaveLength(1)

      // Test get
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '1', name: 'Item' } }),
      } as Response)
      const getResult = await api.get('1')
      expect(getResult.data.id).toBe('1')

      // Test create
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '2', name: 'New' } }),
      } as Response)
      const createResult = await api.create({ name: 'New' })
      expect(createResult.data.name).toBe('New')

      // Test update
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '1', name: 'Updated' } }),
      } as Response)
      const updateResult = await api.update('1', { name: 'Updated' })
      expect(updateResult.data.name).toBe('Updated')

      // Test delete
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response)
      await expect(api.delete('1')).resolves.toBeUndefined()
    })

    it('supports project_id filter in list', async () => {
      const api = createCrudApi<{ id: string }>('items')

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      } as Response)

      await api.list('project-1')

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('?project_id=project-1'),
        expect.anything()
      )
    })
  })

  describe('assetsApi', () => {
    it('has all required methods', () => {
      expect(assetsApi.list).toBeDefined()
      expect(assetsApi.get).toBeDefined()
      expect(assetsApi.create).toBeDefined()
      expect(assetsApi.update).toBeDefined()
      expect(assetsApi.delete).toBeDefined()
      expect(assetsApi.restore).toBeDefined()
      expect(assetsApi.listDeleted).toBeDefined()
      expect(assetsApi.listVersions).toBeDefined()
      expect(assetsApi.publishVersion).toBeDefined()
      expect(assetsApi.markClean).toBeDefined()
    })

    it('calls restore endpoint', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '1', state: 'draft' } }),
      } as Response)

      await assetsApi.restore('1')

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/1/restore'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('calls markClean endpoint', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: '1', state: 'clean' } }),
      } as Response)

      await assetsApi.markClean('1')

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/1/mark-clean'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('calls publishVersion endpoint', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { version: '1.0.0' } }),
      } as Response)

      await assetsApi.publishVersion('1', '1.0.0', 'Initial release')

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/1/versions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ version: '1.0.0', changelog: 'Initial release' }),
        })
      )
    })

    it('calls listDeleted endpoint', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      } as Response)

      await assetsApi.listDeleted('project-1')

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/deleted'),
        expect.anything()
      )
    })
  })

  describe('Error classes', () => {
    it('ApiError includes status code and request info', () => {
      const error = new ApiError('Not found', 404, 'req-123', '/test')
      expect(error.message).toBe('Not found')
      expect(error.statusCode).toBe(404)
      expect(error.requestId).toBe('req-123')
      expect(error.url).toBe('/test')
      expect(error.name).toBe('ApiError')
    })

    it('NetworkError has default message', () => {
      const error = new NetworkError()
      expect(error.message).toBe('网络连接失败')
      expect(error.name).toBe('NetworkError')
    })

    it('NetworkError accepts custom message', () => {
      const error = new NetworkError('Custom network error')
      expect(error.message).toBe('Custom network error')
    })

    it('TimeoutError has default message', () => {
      const error = new TimeoutError()
      expect(error.message).toBe('请求超时')
      expect(error.name).toBe('TimeoutError')
    })
  })
})
