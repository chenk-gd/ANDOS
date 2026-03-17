<template>
  <div class="ai-chat-panel">
    <!-- Header -->
    <div class="chat-header">
      <div class="model-selector">
        <el-select v-model="aiStore.currentModel" size="small" style="width: 120px">
          <el-option label="Claude" value="claude" />
          <el-option label="OpenAI" value="openai" />
        </el-select>
        <el-button
          size="small"
          :icon="Setting"
          circle
          @click="showSettings = true"
        />
        <el-button
          size="small"
          :type="showMemoryPanel ? 'primary' : ''"
          :icon="Collection"
          circle
          @click="toggleMemoryPanel"
          title="记忆面板"
        />
      </div>
      <div class="session-actions">
        <el-dropdown v-if="aiStore.sessions.length > 0" trigger="click">
          <el-button size="small">
            {{ currentSessionTitle }}
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="session in aiStore.sessions"
                :key="session.id"
                @click="aiStore.selectSession(session.id)"
              >
                <span :class="{ 'active-session': session.id === aiStore.currentSessionId }">
                  {{ session.title }}
                </span>
              </el-dropdown-item>
              <el-dropdown-item divided @click="aiStore.createSession()">
                <el-icon><Plus /></el-icon> 新建对话
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-else size="small" @click="aiStore.createSession()">
          <el-icon><Plus /></el-icon> 新建对话
        </el-button>
        <el-button size="small" :icon="Delete" circle @click="clearCurrentSession" />
      </div>
    </div>

    <!-- Memory Context Panel -->
    <div v-if="showMemoryPanel" class="memory-context-panel">
      <div class="memory-panel-header">
        <div class="memory-tabs">
          <el-radio-group v-model="memoryTab" size="small">
            <el-radio-button label="context">相关记忆</el-radio-button>
            <el-radio-button label="session">会话信息</el-radio-button>
          </el-radio-group>
        </div>
        <el-button size="small" text :icon="Close" @click="showMemoryPanel = false" />
      </div>

      <!-- Relevant Memories -->
      <div v-if="memoryTab === 'context'" class="memory-list">
        <div v-if="loadingMemories" class="memory-loading">
          <el-skeleton :rows="3" animated />
        </div>
        <div v-else-if="relevantMemories.length === 0" class="memory-empty">
          <el-empty description="暂无相关记忆" :image-size="60" />
        </div>
        <div
          v-for="memory in relevantMemories"
          :key="memory.id"
          :class="['memory-item', { referenced: isMemoryReferenced(memory.id) }]"
          @click="highlightMemory(memory.id)"
        >
          <div class="memory-item-header">
            <el-tag size="small" :type="getMemoryTypeTag(memory.type)">
              {{ MEMORY_TYPE_LABELS[memory.type] }}
            </el-tag>
            <div class="memory-actions">
              <el-button
                size="small"
                text
                :type="memoryFeedback[memory.id] === true ? 'success' : ''"
                :icon="CircleCheck"
                @click.stop="submitFeedback(memory.id, true)"
              />
              <el-button
                size="small"
                text
                :type="memoryFeedback[memory.id] === false ? 'danger' : ''"
                :icon="CircleClose"
                @click.stop="submitFeedback(memory.id, false)"
              />
            </div>
          </div>
          <div class="memory-content">{{ memory.content }}</div>
          <div v-if="memory.metadata?.tags?.length" class="memory-tags">
            <el-tag
              v-for="tag in memory.metadata.tags.slice(0, 3)"
              :key="tag"
              size="small"
              class="tag-item"
            >
              {{ tag }}
            </el-tag>
          </div>
        </div>
      </div>

      <!-- Session Info -->
      <div v-else class="session-info-panel">
        <div class="token-usage">
          <div class="usage-label">
            <span>Token 使用</span>
            <span>{{ formatNumber(tokenUsage.current) }} / {{ formatNumber(tokenUsage.max) }}</span>
          </div>
          <el-progress
            :percentage="tokenUsage.percentage"
            :status="tokenUsage.percentage > 80 ? 'exception' : ''"
            :stroke-width="6"
          />
        </div>
        <div class="session-stats">
          <div class="stat-row">
            <span>消息数:</span>
            <span>{{ aiStore.messages.length }}</span>
          </div>
          <div class="stat-row">
            <span>模型:</span>
            <span>{{ aiStore.currentModel }}</span>
          </div>
          <div v-if="currentAsset" class="stat-row">
            <span>当前资产:</span>
            <span>{{ currentAsset.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Messages -->
    <div class="chat-messages" ref="messagesRef">
      <div v-if="!aiStore.currentSession" class="empty-state">
        <el-icon :size="48" color="#909399"><ChatDotRound /></el-icon>
        <p>点击"新建对话"开始与 AI 助手聊天</p>
      </div>
      <template v-else>
        <!-- Memory Context Banner -->
        <div v-if="relevantMemories.length > 0 && !showMemoryPanel" class="memory-banner">
          <el-icon><Collection /></el-icon>
          <span>已引用 {{ relevantMemories.length }} 条相关记忆</span>
          <el-button size="small" text @click="showMemoryPanel = true">查看</el-button>
        </div>

        <div
          v-for="message in aiStore.messages"
          :key="message.id"
          :class="['message', message.role]"
        >
          <div class="message-avatar">
            <el-icon v-if="message.role === 'user'" :size="20"><User /></el-icon>
            <el-icon v-else :size="20"><ChatDotRound /></el-icon>
          </div>
          <div class="message-content">
            <div v-if="message.loading && !message.content" class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
            <div v-else class="message-text" v-html="renderMarkdown(message.content)" />

            <!-- Memory Citations -->
            <div v-if="message.memoryRefs?.length" class="memory-citations">
              <div class="citation-label">
                <el-icon><Connection /></el-icon>
                引用了 {{ message.memoryRefs.length }} 条记忆
              </div>
              <div class="citation-list">
                <el-tag
                  v-for="(ref, index) in message.memoryRefs"
                  :key="ref"
                  size="small"
                  :type="highlightedMemoryId === ref ? 'success' : 'info'"
                  class="citation-tag"
                  @click="highlightMemory(ref)"
                >
                  [{{ index + 1 }}]
                </el-tag>
              </div>
            </div>

            <!-- Message Actions -->
            <div v-if="message.role === 'assistant' && !message.loading" class="message-actions">
              <el-button
                size="small"
                text
                :icon="CopyDocument"
                @click="copyMessage(message.content)"
              >
                复制
              </el-button>
              <el-button
                size="small"
                text
                :icon="message.feedback === 'helpful' ? Select : Check"
                :type="message.feedback === 'helpful' ? 'success' : ''"
                @click="rateMessage(message, true)"
              >
                有用
              </el-button>
              <el-button
                size="small"
                text
                :icon="message.feedback === 'not_helpful' ? CloseBold : Close"
                :type="message.feedback === 'not_helpful' ? 'danger' : ''"
                @click="rateMessage(message, false)"
              >
                无用
              </el-button>
            </div>

            <div v-if="message.error" class="message-error">
              <el-icon><CircleCloseFilled /></el-icon>
              {{ message.error }}
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Input -->
    <div class="chat-input">
      <div class="input-context" v-if="currentAsset">
        <el-tag size="small" type="info">
          <el-icon><Document /></el-icon>
          当前资产: {{ currentAsset.name }}
        </el-tag>
      </div>
      <el-input
        v-model="inputMessage"
        type="textarea"
        :rows="3"
        :placeholder="inputPlaceholder"
        :disabled="!aiStore.hasApiKey || aiStore.loading"
        @keydown.enter.prevent="handleSend"
      />
      <div class="input-actions">
        <div class="input-hints">
          <el-button
            v-if="relevantMemories.length > 0"
            size="small"
            text
            :icon="Collection"
            @click="showMemoryPanel = !showMemoryPanel"
          >
            {{ relevantMemories.length }} 条记忆
          </el-button>
        </div>
        <el-button
          type="primary"
          :icon="Promotion"
          :disabled="!canSend"
          :loading="aiStore.loading"
          @click="handleSend"
        >
          发送
        </el-button>
      </div>
    </div>

    <!-- Settings Dialog -->
    <el-dialog
      v-model="showSettings"
      title="API 设置"
      width="400px"
      :close-on-click-modal="false"
    >
      <div class="settings-form">
        <div class="setting-item">
          <label>Claude API Key</label>
          <el-input
            v-model="claudeKeyInput"
            type="password"
            show-password
            placeholder="sk-..."
            size="small"
          />
        </div>
        <div class="setting-item">
          <label>OpenAI API Key</label>
          <el-input
            v-model="openaiKeyInput"
            type="password"
            show-password
            placeholder="sk-..."
            size="small"
          />
        </div>
        <p class="settings-hint">
          API Key 仅存储在本地浏览器中，不会上传到服务器。
        </p>
      </div>
      <template #footer>
        <el-button @click="showSettings = false">取消</el-button>
        <el-button type="primary" @click="saveSettings">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { marked } from 'marked'
import {
  ChatDotRound,
  User,
  Setting,
  Delete,
  Plus,
  ArrowDown,
  CircleCloseFilled,
  Promotion,
  Collection,
  Close,
  Connection,
  CircleCheck,
  CircleClose,
  CopyDocument,
  Check,
  Select,
  CloseBold,
  Document,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAiStore } from '@/stores/ai'
import { useAssetsStore } from '@/stores/assets'
import { memoryApi } from '@/services/memoryApi'
import { MEMORY_TYPE_LABELS, type Memory, type TokenUsage } from '@/types/memory'
import type { ChatMessage } from '@/services/ai'

const props = defineProps<{
  projectId?: string
}>()

const aiStore = useAiStore()
const assetsStore = useAssetsStore()
const messagesRef = ref<HTMLElement>()
const inputMessage = ref('')
const showSettings = ref(false)
const showMemoryPanel = ref(false)
const memoryTab = ref('context')
const claudeKeyInput = ref(aiStore.claudeApiKey)
const openaiKeyInput = ref(aiStore.openaiApiKey)

// Memory integration state
const relevantMemories = ref<Memory[]>([])
const memoryFeedback = ref<Record<string, boolean>>({})
const highlightedMemoryId = ref<string | null>(null)
const loadingMemories = ref(false)
const lastSearchQuery = ref('')

// Token usage
const tokenUsage = ref<TokenUsage>({
  current: 0,
  max: 128000,
  percentage: 0,
})

const currentAsset = computed(() => assetsStore.currentAsset)

const canSend = computed(() => {
  return inputMessage.value.trim() && aiStore.hasApiKey && !aiStore.loading
})

const currentSessionTitle = computed(() => {
  return aiStore.currentSession?.title || '新对话'
})

const inputPlaceholder = computed(() => {
  if (!aiStore.hasApiKey) {
    return '请先配置 API Key'
  }
  return '输入消息... (Enter 发送)'
})

const isMemoryReferenced = (memoryId: string) => {
  return aiStore.messages.some(m => m.memoryRefs?.includes(memoryId))
}

// Fetch relevant memories when input changes
let memorySearchTimeout: ReturnType<typeof setTimeout>
async function fetchRelevantMemories(query: string) {
  if (!props.projectId || !query.trim() || query === lastSearchQuery.value) return
  lastSearchQuery.value = query

  loadingMemories.value = true
  try {
    relevantMemories.value = await memoryApi.getRelevantMemories(props.projectId, query, 5)
  } catch (error) {
    console.error('Failed to fetch memories:', error)
  } finally {
    loadingMemories.value = false
  }
}

// Debounced memory search on input
watch(inputMessage, (value) => {
  clearTimeout(memorySearchTimeout)
  if (value.length > 3) {
    memorySearchTimeout = setTimeout(() => {
      fetchRelevantMemories(value)
    }, 500)
  }
})

function getMemoryTypeTag(type: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    requirement: 'success',
    design: 'warning',
    decision: 'danger',
    constraint: 'info',
    context: '',
    preference: 'success',
  }
  return map[type] || ''
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function toggleMemoryPanel() {
  showMemoryPanel.value = !showMemoryPanel.value
}

function highlightMemory(memoryId: string) {
  highlightedMemoryId.value = highlightedMemoryId.value === memoryId ? null : memoryId
}

async function submitFeedback(memoryId: string, useful: boolean) {
  try {
    await memoryApi.submitFeedback({ memoryId, useful })
    memoryFeedback.value[memoryId] = useful
    ElMessage.success(useful ? '感谢您的反馈' : '我们会改进记忆提取')
  } catch (error) {
    console.error('Failed to submit feedback:', error)
  }
}

function copyMessage(content: string) {
  navigator.clipboard.writeText(content)
  ElMessage.success('已复制到剪贴板')
}

function rateMessage(message: ChatMessage, helpful: boolean) {
  message.feedback = helpful ? 'helpful' : 'not_helpful'
  ElMessage.success(helpful ? '感谢您的反馈' : '我们会改进回答质量')
}

// Auto-scroll to bottom when new messages arrive
watch(() => aiStore.messages.length, async () => {
  await nextTick()
  scrollToBottom()
})

watch(() => aiStore.streaming, async (streaming) => {
  if (streaming) {
    await nextTick()
    scrollToBottom()
  }
})

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

function renderMarkdown(content: string): string {
  if (!content) return ''
  const result = marked(content, {
    breaks: true,
    gfm: true,
  })
  return typeof result === 'string' ? result : ''
}

async function handleSend() {
  const content = inputMessage.value.trim()
  if (!content || !canSend.value) return

  // Add memory context if available
  const contextMemories = relevantMemories.value.slice(0, 3)
  const memoryContext = contextMemories.length > 0
    ? `\n\n[相关背景记忆]\n${contextMemories.map((m, i) => `${i + 1}. [${MEMORY_TYPE_LABELS[m.type]}] ${m.content}`).join('\n')}`
    : ''

  const finalContent = memoryContext
    ? `${content}\n${memoryContext}`
    : content

  // Store memory refs in the message
  const memoryRefs = contextMemories.map(m => m.id)

  aiStore.sendUserMessage(finalContent)
  inputMessage.value = ''

  // Attach memory refs to the message (would need store modification for persistence)
  // For now, just update the message in the current session
  const currentSession = aiStore.currentSession
  if (currentSession && memoryRefs.length > 0) {
    const lastMessage = currentSession.messages[currentSession.messages.length - 1]
    if (lastMessage) {
      lastMessage.memoryRefs = memoryRefs
    }
  }
}

function clearCurrentSession() {
  if (aiStore.currentSessionId) {
    aiStore.deleteSession(aiStore.currentSessionId)
  }
}

function saveSettings() {
  aiStore.setApiKey('claude', claudeKeyInput.value)
  aiStore.setApiKey('openai', openaiKeyInput.value)
  showSettings.value = false
}

// Create initial session if none exists
if (!aiStore.currentSessionId) {
  aiStore.createSession()
}

onMounted(() => {
  // Initialize token usage estimation
  tokenUsage.value = {
    current: aiStore.messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0),
    max: 128000,
    percentage: 0,
  }
  tokenUsage.value.percentage = Math.round((tokenUsage.value.current / tokenUsage.value.max) * 100)
})
</script>

<style scoped>
.ai-chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  position: relative;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.model-selector {
  display: flex;
  gap: 8px;
  align-items: center;
}

.session-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.active-session {
  font-weight: bold;
  color: var(--el-color-primary);
}

/* Memory Context Panel */
.memory-context-panel {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  max-height: 250px;
  overflow-y: auto;
  flex-shrink: 0;
}

.memory-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.memory-tabs {
  flex: 1;
}

.memory-list {
  padding: 8px 12px;
}

.memory-loading,
.memory-empty {
  padding: 16px;
}

.memory-item {
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
}

.memory-item:hover {
  border-color: var(--el-color-primary);
}

.memory-item.referenced {
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.memory-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.memory-actions {
  display: flex;
  gap: 4px;
}

.memory-content {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.memory-tags {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.tag-item {
  font-size: 11px;
}

/* Session Info Panel */
.session-info-panel {
  padding: 16px;
}

.token-usage {
  margin-bottom: 16px;
}

.usage-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.session-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

/* Chat Messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-secondary);
}

/* Memory Banner */
.memory-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-color-primary-light-9);
  border-radius: 8px;
  font-size: 13px;
  color: var(--el-color-primary);
}

/* Messages */
.message {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: var(--el-color-success-light-9);
}

.message-content {
  flex: 1;
  max-width: calc(100% - 44px);
}

.message-text {
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--bg-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.message.user .message-text {
  background: var(--el-color-primary-light-9);
}

.message-text :deep(p) {
  margin: 0 0 8px 0;
}

.message-text :deep(p:last-child) {
  margin-bottom: 0;
}

.message-text :deep(pre) {
  background: var(--bg-primary);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}

.message-text :deep(code) {
  font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
  font-size: 13px;
}

.message-text :deep(ul),
.message-text :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.message-text :deep(li) {
  margin: 4px 0;
}

/* Memory Citations */
.memory-citations {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.citation-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.citation-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.citation-tag {
  cursor: pointer;
}

/* Message Actions */
.message-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.message-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  border-radius: 4px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  align-items: center;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--text-secondary);
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.typing-indicator span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

/* Chat Input */
.chat-input {
  padding: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.input-context {
  margin-bottom: 8px;
}

.input-actions {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-hints {
  display: flex;
  gap: 8px;
}

/* Settings */
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-item label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.settings-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}
</style>
