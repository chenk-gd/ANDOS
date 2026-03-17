import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage, ChatSession, AiModel } from '@/services/ai'
import { sendMessage, saveApiKey, getStoredApiKey, generateId } from '@/services/ai'

export const useAiStore = defineStore('ai', () => {
  // State
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const loading = ref(false)
  const streaming = ref(false)
  const currentModel = ref<AiModel>('claude')
  const claudeApiKey = ref(getStoredApiKey('claude'))
  const openaiApiKey = ref(getStoredApiKey('openai'))

  // Getters
  const currentSession = computed<ChatSession | null>(() => {
    return sessions.value.find(s => s.id === currentSessionId.value) || null
  })

  const messages = computed<ChatMessage[]>(() => {
    return currentSession.value?.messages || []
  })

  const hasApiKey = computed<boolean>(() => {
    const key = currentModel.value === 'claude' ? claudeApiKey.value : openaiApiKey.value
    return !!key
  })

  // Actions
  function createSession(title = '新对话'): string {
    const id = generateId()
    const now = Date.now()
    const session: ChatSession = {
      id,
      title,
      messages: [],
      model: currentModel.value,
      createdAt: now,
      updatedAt: now,
    }
    sessions.value.unshift(session)
    currentSessionId.value = id
    return id
  }

  function selectSession(id: string) {
    currentSessionId.value = id
  }

  function deleteSession(id: string) {
    const index = sessions.value.findIndex(s => s.id === id)
    if (index > -1) {
      sessions.value.splice(index, 1)
      if (currentSessionId.value === id) {
        currentSessionId.value = sessions.value[0]?.id || null
      }
    }
  }

  function setModel(model: AiModel) {
    currentModel.value = model
  }

  function setApiKey(model: AiModel, key: string) {
    if (model === 'claude') {
      claudeApiKey.value = key
    } else {
      openaiApiKey.value = key
    }
    saveApiKey(model, key)
  }

  async function sendUserMessage(content: string) {
    if (!currentSessionId.value) {
      createSession()
    }

    const session = sessions.value.find(s => s.id === currentSessionId.value)
    if (!session) return

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    session.messages.push(userMessage)
    session.updatedAt = Date.now()

    // Update title if first message
    if (session.messages.length === 1) {
      session.title = content.slice(0, 30) + (content.length > 30 ? '...' : '')
    }

    // Send to AI
    loading.value = true
    streaming.value = true

    // Add assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      loading: true,
    }
    session.messages.push(assistantMessage)

    try {
      const history = session.messages
        .filter(m => !m.loading && !m.error)
        .map(m => ({ role: m.role, content: m.content }))

      const response = await sendMessage(
        session.model,
        history,
        (chunk) => {
          assistantMessage.content += chunk
        }
      )

      // If no streaming, set the full response
      if (!assistantMessage.content) {
        assistantMessage.content = response
      }

      assistantMessage.loading = false
    } catch (error) {
      assistantMessage.error = error instanceof Error ? error.message : '发送失败'
      assistantMessage.loading = false
    } finally {
      loading.value = false
      streaming.value = false
      session.updatedAt = Date.now()
    }
  }

  function clearMessages() {
    const session = sessions.value.find(s => s.id === currentSessionId.value)
    if (session) {
      session.messages = []
      session.updatedAt = Date.now()
    }
  }

  // Load sessions from localStorage on init
  function loadSessions() {
    const stored = localStorage.getItem('ai_chat_sessions')
    if (stored) {
      try {
        sessions.value = JSON.parse(stored)
      } catch {
        sessions.value = []
      }
    }
  }

  // Save sessions to localStorage
  function saveSessions() {
    localStorage.setItem('ai_chat_sessions', JSON.stringify(sessions.value))
  }

  return {
    sessions,
    currentSessionId,
    currentSession,
    messages,
    loading,
    streaming,
    currentModel,
    claudeApiKey,
    openaiApiKey,
    hasApiKey,
    createSession,
    selectSession,
    deleteSession,
    setModel,
    setApiKey,
    sendUserMessage,
    clearMessages,
    loadSessions,
    saveSessions,
  }
})
