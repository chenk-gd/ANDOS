import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { wsService, type CursorUpdatePayload, type UserPresencePayload, type WSMessage } from '@/services/websocket'

export interface UserCursor {
  userId: string
  userName: string
  cursorPosition: { line: number; column: number }
  color: string
}

export interface DraftContent {
  assetId: string
  content: string
  version: number
  savedAt: Date
  editedBy: string
}

// Generate a unique color for each user
const USER_COLORS = [
  '#409eff', '#67c23a', '#e6a23c', '#f56c6c',
  '#909399', '#9254de', '#ff7a45', '#36cfc9',
]

function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

export const useCollaborationStore = defineStore('collaboration', () => {
  const activeUsers = ref<Map<string, UserCursor>>(new Map())
  const editingAssetId = ref<string | null>(null)
  const draftContent = ref<Map<string, DraftContent>>(new Map())
  const lastSavedAt = ref<Date | null>(null)
  const isSaving = ref(false)
  const connectionStatus = ref<'connected' | 'disconnected' | 'connecting'>('disconnected')
  const unsubscribers: (() => void)[] = []

  const hasUnsavedChanges = computed(() => {
    return draftContent.value.size > 0
  })

  const activeUserList = computed(() => {
    return Array.from(activeUsers.value.values())
  })

  function subscribeToAsset(assetId: string) {
    if (editingAssetId.value === assetId) return

    // Unsubscribe from previous asset if any
    if (editingAssetId.value) {
      unsubscribeFromAsset()
    }

    editingAssetId.value = assetId

    wsService.send({
      type: 'user_join',
      payload: { assetId },
    })

    // Listen for updates
    unsubscribers.push(
      wsService.subscribe('asset_update', handleAssetUpdated as (data: WSMessage) => void)
    )
    unsubscribers.push(
      wsService.subscribe('user_join', handleUserJoined as (data: WSMessage) => void)
    )
    unsubscribers.push(
      wsService.subscribe('user_leave', handleUserLeft as (data: WSMessage) => void)
    )
    unsubscribers.push(
      wsService.subscribe('cursor_update', handleUserCursor as (data: WSMessage) => void)
    )
  }

  function unsubscribeFromAsset() {
    if (editingAssetId.value) {
      wsService.send({
        type: 'user_leave',
        payload: { assetId: editingAssetId.value },
      })
    }

    // Call all unsubscribe functions
    unsubscribers.forEach(unsub => unsub())
    unsubscribers.length = 0

    editingAssetId.value = null
    activeUsers.value.clear()
  }

  function sendEdit(content: string, version: number) {
    if (!editingAssetId.value) return

    isSaving.value = true
    wsService.send({
      type: 'save_request',
      payload: {
        assetId: editingAssetId.value,
        content,
        version,
      },
    })
  }

  function sendCursor(position: { line: number; column: number }) {
    if (!editingAssetId.value) return

    wsService.updateCursor(editingAssetId.value, position)
  }

  function handleAssetUpdated(_message: { payload: { assetId: string; changes: unknown } }) {
    // Update local draft if needed
    lastSavedAt.value = new Date()
    isSaving.value = false
  }

  function handleUserJoined(message: { payload: UserPresencePayload }) {
    const { userId, userName } = message.payload
    if (!userId || activeUsers.value.has(userId)) return

    activeUsers.value.set(userId, {
      userId,
      userName,
      cursorPosition: { line: 0, column: 0 },
      color: getUserColor(userId),
    })
  }

  function handleUserLeft(message: { payload: { userId: string } }) {
    const { userId } = message.payload
    if (userId) {
      activeUsers.value.delete(userId)
    }
  }

  function handleUserCursor(message: { payload: CursorUpdatePayload }) {
    const { userId, position } = message.payload
    const user = activeUsers.value.get(userId)
    if (user && position) {
      user.cursorPosition = position
    }
  }

  function updateConnectionStatus(status: 'connected' | 'disconnected' | 'connecting') {
    connectionStatus.value = status
  }

  function clearDraft(assetId: string) {
    draftContent.value.delete(assetId)
  }

  function saveDraft(assetId: string, content: string, editedBy: string) {
    const existing = draftContent.value.get(assetId)
    draftContent.value.set(assetId, {
      assetId,
      content,
      version: existing ? existing.version + 1 : 1,
      savedAt: new Date(),
      editedBy,
    })
  }

  return {
    activeUsers,
    activeUserList,
    editingAssetId,
    draftContent,
    lastSavedAt,
    isSaving,
    connectionStatus,
    hasUnsavedChanges,
    subscribeToAsset,
    unsubscribeFromAsset,
    sendEdit,
    sendCursor,
    updateConnectionStatus,
    clearDraft,
    saveDraft,
  }
})
