import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCollaborationStore } from '@/stores/collaboration'
import { wsService } from '@/services/websocket'

// Mock WebSocket service
vi.mock('@/services/websocket', () => ({
  wsService: {
    send: vi.fn(),
    subscribe: vi.fn(),
    updateCursor: vi.fn(),
  },
  WSConnectionState: {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
  },
}))

describe('Collaboration Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with correct default state', () => {
    const store = useCollaborationStore()
    expect(store.activeUsers.size).toBe(0)
    expect(store.editingAssetId).toBeNull()
    expect(store.draftContent.size).toBe(0)
    expect(store.lastSavedAt).toBeNull()
    expect(store.isSaving).toBe(false)
    expect(store.connectionStatus).toBe('disconnected')
  })

  it('computes hasUnsavedChanges correctly', () => {
    const store = useCollaborationStore()
    expect(store.hasUnsavedChanges).toBe(false)

    store.saveDraft('asset-1', 'content', 'user-1')
    expect(store.hasUnsavedChanges).toBe(true)
  })

  it('computes activeUserList from Map', () => {
    const store = useCollaborationStore()
    expect(store.activeUserList).toEqual([])

    store.activeUsers.set('user-1', {
      userId: 'user-1',
      userName: 'User 1',
      cursorPosition: { line: 1, column: 1 },
      color: '#409eff',
    })

    expect(store.activeUserList).toHaveLength(1)
    expect(store.activeUserList[0].userName).toBe('User 1')
  })

  describe('subscribeToAsset', () => {
    it('subscribes to asset and sets up listeners', () => {
      const store = useCollaborationStore()
      const mockUnsubscribe = vi.fn()
      vi.mocked(wsService.subscribe).mockReturnValue(mockUnsubscribe)

      store.subscribeToAsset('asset-1')

      expect(store.editingAssetId).toBe('asset-1')
      expect(wsService.send).toHaveBeenCalledWith({
        type: 'user_join',
        payload: { assetId: 'asset-1' },
      })
      expect(wsService.subscribe).toHaveBeenCalledTimes(4)
    })

    it('does nothing if already subscribed to same asset', () => {
      const store = useCollaborationStore()
      store.editingAssetId = 'asset-1'

      store.subscribeToAsset('asset-1')

      expect(wsService.send).not.toHaveBeenCalled()
    })

    it('unsubscribes from previous asset before subscribing to new one', () => {
      const store = useCollaborationStore()
      const mockUnsubscribe = vi.fn()
      vi.mocked(wsService.subscribe).mockReturnValue(mockUnsubscribe)

      // First subscription
      store.subscribeToAsset('asset-1')
      expect(store.editingAssetId).toBe('asset-1')

      // Second subscription should unsubscribe from first
      store.subscribeToAsset('asset-2')
      expect(mockUnsubscribe).toHaveBeenCalledTimes(4) // 4 subscriptions cleaned up
      expect(store.editingAssetId).toBe('asset-2')
    })
  })

  describe('unsubscribeFromAsset', () => {
    it('sends leave message and cleans up', () => {
      const store = useCollaborationStore()
      const mockUnsubscribe = vi.fn()
      vi.mocked(wsService.subscribe).mockReturnValue(mockUnsubscribe)

      // Subscribe first
      store.subscribeToAsset('asset-1')
      store.activeUsers.set('user-1', {
        userId: 'user-1',
        userName: 'User 1',
        cursorPosition: { line: 1, column: 1 },
        color: '#409eff',
      })

      // Unsubscribe
      store.unsubscribeFromAsset()

      expect(wsService.send).toHaveBeenLastCalledWith({
        type: 'user_leave',
        payload: { assetId: 'asset-1' },
      })
      expect(mockUnsubscribe).toHaveBeenCalledTimes(4)
      expect(store.editingAssetId).toBeNull()
      expect(store.activeUsers.size).toBe(0)
    })

    it('handles unsubscribe when not subscribed', () => {
      const store = useCollaborationStore()
      store.editingAssetId = null

      // Should not throw
      expect(() => store.unsubscribeFromAsset()).not.toThrow()
    })
  })

  describe('sendEdit', () => {
    it('sends edit when editing asset', () => {
      const store = useCollaborationStore()
      store.editingAssetId = 'asset-1'

      store.sendEdit('new content', 2)

      expect(store.isSaving).toBe(true)
      expect(wsService.send).toHaveBeenCalledWith({
        type: 'save_request',
        payload: {
          assetId: 'asset-1',
          content: 'new content',
          version: 2,
        },
      })
    })

    it('does nothing when not editing any asset', () => {
      const store = useCollaborationStore()
      store.editingAssetId = null

      store.sendEdit('content', 1)

      expect(wsService.send).not.toHaveBeenCalled()
      expect(store.isSaving).toBe(false)
    })
  })

  describe('sendCursor', () => {
    it('sends cursor update when editing asset', () => {
      const store = useCollaborationStore()
      store.editingAssetId = 'asset-1'

      const position = { line: 5, column: 10 }
      store.sendCursor(position)

      expect(wsService.updateCursor).toHaveBeenCalledWith('asset-1', position)
    })

    it('does nothing when not editing any asset', () => {
      const store = useCollaborationStore()
      store.editingAssetId = null

      store.sendCursor({ line: 1, column: 1 })

      expect(wsService.updateCursor).not.toHaveBeenCalled()
    })
  })

  describe('handleUserJoined', () => {
    it('adds user to active users', () => {
      const store = useCollaborationStore()
      const message = {
        payload: {
          userId: 'user-1',
          userName: 'Test User',
        },
      }

      // Access private handler through the store's internal functions
      // Since handlers are private, we test via subscribe callback
      const subscribeCalls = (wsService.subscribe as any).mock.calls
      store.subscribeToAsset('asset-1')

      // Get the user_join handler
      const userJoinHandler = subscribeCalls.find((call: any) => call[0] === 'user_join')?.[1]
      if (userJoinHandler) {
        userJoinHandler(message)
        expect(store.activeUsers.has('user-1')).toBe(true)
        expect(store.activeUsers.get('user-1')?.userName).toBe('Test User')
      }
    })
  })

  describe('saveDraft and clearDraft', () => {
    it('saves draft with version increment', () => {
      const store = useCollaborationStore()

      store.saveDraft('asset-1', 'content v1', 'user-1')
      expect(store.draftContent.get('asset-1')?.version).toBe(1)
      expect(store.draftContent.get('asset-1')?.content).toBe('content v1')

      store.saveDraft('asset-1', 'content v2', 'user-1')
      expect(store.draftContent.get('asset-1')?.version).toBe(2)
    })

    it('clears draft', () => {
      const store = useCollaborationStore()
      store.saveDraft('asset-1', 'content', 'user-1')
      expect(store.draftContent.has('asset-1')).toBe(true)

      store.clearDraft('asset-1')
      expect(store.draftContent.has('asset-1')).toBe(false)
    })
  })

  describe('updateConnectionStatus', () => {
    it('updates connection status', () => {
      const store = useCollaborationStore()
      expect(store.connectionStatus).toBe('disconnected')

      store.updateConnectionStatus('connected')
      expect(store.connectionStatus).toBe('connected')

      store.updateConnectionStatus('connecting')
      expect(store.connectionStatus).toBe('connecting')
    })
  })
})
