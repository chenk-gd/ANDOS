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

    <!-- Messages -->
    <div class="chat-messages" ref="messagesRef">
      <div v-if="!aiStore.currentSession" class="empty-state">
        <el-icon :size="48" color="#909399"><ChatDotRound /></el-icon>
        <p>点击"新建对话"开始与 AI 助手聊天</p>
      </div>
      <template v-else>
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
            <div v-if="message.error" class="message-error">
              <el-icon><CircleClose /></el-icon>
              {{ message.error }}
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Input -->
    <div class="chat-input">
      <el-input
        v-model="inputMessage"
        type="textarea"
        :rows="3"
        :placeholder="inputPlaceholder"
        :disabled="!aiStore.hasApiKey || aiStore.loading"
        @keydown.enter.prevent="handleSend"
      />
      <div class="input-actions">
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
import { ref, computed, watch, nextTick } from 'vue'
import { marked } from 'marked'
import {
  ChatDotRound,
  User,
  Setting,
  Delete,
  Plus,
  ArrowDown,
  CircleClose,
  Promotion,
} from '@element-plus/icons-vue'
import { useAiStore } from '@/stores/ai'

const aiStore = useAiStore()
const messagesRef = ref<HTMLElement>()
const inputMessage = ref('')
const showSettings = ref(false)
const claudeKeyInput = ref(aiStore.claudeApiKey)
const openaiKeyInput = ref(aiStore.openaiApiKey)

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

function handleSend() {
  const content = inputMessage.value.trim()
  if (!content || !canSend.value) return

  aiStore.sendUserMessage(content)
  inputMessage.value = ''
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
</script>

<style scoped>
.ai-chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
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

.chat-input {
  padding: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.input-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
}

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
