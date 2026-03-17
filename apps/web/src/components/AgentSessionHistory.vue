<template>
  <div class="agent-session-history">
    <!-- Header -->
    <div class="session-header">
      <h3>会话历史</h3>
      <div class="header-actions">
        <el-input
          v-model="searchQuery"
          placeholder="搜索会话..."
          prefix-icon="Search"
          clearable
          style="width: 200px"
        />
        <el-button type="primary" :icon="Plus" @click="createNewSession">
          新建会话
        </el-button>
      </div>
    </div>

    <!-- Token Usage Stats -->
    <div class="token-stats">
      <el-card class="stat-card">
        <div class="stat-icon">
          <el-icon :size="24"><Coin /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ formatNumber(totalTokens) }}</div>
          <div class="stat-label">总Token消耗</div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-icon">
          <el-icon :size="24"><ChatDotRound /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ sessions.length }}</div>
          <div class="stat-label">总会话数</div>
        </div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-icon">
          <el-icon :size="24"><Clock /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ formatDuration(avgSessionDuration) }}</div>
          <div class="stat-label">平均时长</div>
        </div>
      </el-card>
    </div>

    <!-- Sessions List -->
    <div class="sessions-container">
      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="5" animated />
      </div>
      <div v-else-if="filteredSessions.length === 0" class="empty-state">
        <el-empty description="暂无会话历史" />
      </div>
      <div v-else class="sessions-list">
        <div
          v-for="session in filteredSessions"
          :key="session.sessionId"
          :class="['session-item', { expanded: expandedSessionId === session.sessionId }]"
        >
          <div class="session-row" @click="toggleExpand(session.sessionId)">
            <div class="session-info">
              <el-icon :size="20"><ChatDotRound /></el-icon>
              <div class="session-details">
                <div class="session-title">
                  {{ session.context || '未命名会话' }}
                </div>
                <div class="session-meta">
                  <span class="session-time">
                    <el-icon><Clock /></el-icon>
                    {{ formatDate(session.createdAt) }}
                  </span>
                  <span class="session-messages">
                    <el-icon><Document /></el-icon>
                    {{ session.messages.length }} 条消息
                  </span>
                  <span class="session-tokens">
                    <el-icon><Coin /></el-icon>
                    {{ formatNumber(session.tokenCount) }} tokens
                  </span>
                </div>
              </div>
            </div>
            <div class="session-actions">
              <el-tag
                size="small"
                :type="getTokenUsageType(session.tokenCount, session.maxTokens)"
              >
                {{ getTokenUsagePercent(session.tokenCount, session.maxTokens) }}%
              </el-tag>
              <el-button
                size="small"
                type="primary"
                :icon="RefreshRight"
                @click.stop="restoreSession(session.sessionId)"
              >
                恢复
              </el-button>
              <el-button
                size="small"
                :icon="expandedSessionId === session.sessionId ? ArrowUp : ArrowDown"
                circle
                text
              />
            </div>
          </div>

          <!-- Expanded Session Details -->
          <div v-if="expandedSessionId === session.sessionId" class="session-detail">
            <div class="detail-header">
              <h4>会话详情</h4>
              <el-button
                size="small"
                type="danger"
                :icon="Delete"
                @click="deleteSession(session.sessionId)"
              >
                删除
              </el-button>
            </div>

            <!-- Token Usage Bar -->
            <div class="token-usage">
              <div class="usage-header">
                <span>Token 使用</span>
                <span>{{ formatNumber(session.tokenCount) }} / {{ formatNumber(session.maxTokens) }}</span>
              </div>
              <el-progress
                :percentage="getTokenUsagePercent(session.tokenCount, session.maxTokens)"
                :status="getTokenProgressStatus(session.tokenCount, session.maxTokens)"
                :stroke-width="8"
              />
            </div>

            <!-- Messages Timeline -->
            <div class="messages-timeline">
              <div
                v-for="message in session.messages"
                :key="message.id"
                :class="['timeline-item', message.role]"
              >
                <div class="timeline-avatar">
                  <el-icon v-if="message.role === 'user'" :size="16"><User /></el-icon>
                  <el-icon v-else :size="16"><Cpu /></el-icon>
                </div>
                <div class="timeline-content">
                  <div class="timeline-header">
                    <span class="role-label">
                      {{ message.role === 'user' ? '用户' : 'AI助手' }}
                    </span>
                    <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                    <span v-if="message.tokenCount" class="message-tokens">
                      {{ message.tokenCount }} tokens
                    </span>
                  </div>
                  <div class="message-content">{{ message.content }}</div>
                  <div v-if="message.memoryRefs?.length" class="memory-refs">
                    <el-tag
                      v-for="ref in message.memoryRefs"
                      :key="ref"
                      size="small"
                      type="info"
                      class="memory-ref-tag"
                    >
                      <el-icon><Connection /></el-icon>
                      {{ ref.substring(0, 8) }}...
                    </el-tag>
                  </div>
                </div>
              </div>
            </div>

            <!-- Session Actions -->
            <div class="detail-actions">
              <el-button type="primary" :icon="RefreshRight" @click="restoreSession(session.sessionId)">
                恢复此会话
              </el-button>
              <el-button :icon="CopyDocument" @click="copySessionContent(session)">
                复制内容
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="filteredSessions.length"
        layout="total, sizes, prev, pager, next"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  Plus,
  RefreshRight,
  ArrowUp,
  ArrowDown,
  Delete,
  ChatDotRound,
  Clock,
  Document,
  Coin,
  User,
  Cpu,
  Connection,
  CopyDocument,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { memoryApi } from '@/services/memoryApi'
import type { SessionMemory } from '@/types/memory'

// Props
const props = defineProps<{
  projectId: string
  assetId?: string
}>()

// Emits
const emit = defineEmits<{
  restore: [sessionId: string]
  create: []
}>()

// State
const loading = ref(false)
const sessions = ref<SessionMemory[]>([])
const searchQuery = ref('')
const expandedSessionId = ref<string | null>(null)
const currentPage = ref(1)
const pageSize = ref(10)

// Computed
const filteredSessions = computed(() => {
  let result = sessions.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (s) =>
        s.context?.toLowerCase().includes(query) ||
        s.messages.some((m) => m.content.toLowerCase().includes(query))
    )
  }

  // Pagination
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return result.slice(start, end)
})

const totalTokens = computed(() => {
  return sessions.value.reduce((sum, s) => sum + s.tokenCount, 0)
})

const avgSessionDuration = computed(() => {
  if (sessions.value.length === 0) return 0
  // Simplified calculation - in real app would calculate actual duration
  return Math.floor(totalTokens.value / sessions.value.length / 10)
})

// Methods
function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}小时${mins > 0 ? mins + '分钟' : ''}`
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(date: string): string {
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTokenUsageType(current: number, max: number): '' | 'success' | 'warning' | 'danger' {
  const percent = (current / max) * 100
  if (percent < 50) return 'success'
  if (percent < 80) return 'warning'
  return 'danger'
}

function getTokenUsagePercent(current: number, max: number): number {
  return Math.round((current / max) * 100)
}

function getTokenProgressStatus(current: number, max: number): '' | 'success' | 'exception' {
  const percent = (current / max) * 100
  if (percent < 80) return ''
  return 'exception'
}

function toggleExpand(sessionId: string) {
  expandedSessionId.value = expandedSessionId.value === sessionId ? null : sessionId
}

async function fetchSessions() {
  if (!props.projectId) return
  loading.value = true
  try {
    sessions.value = await memoryApi.listSessions(props.projectId, props.assetId)
  } catch (error) {
    console.error('Failed to fetch sessions:', error)
    ElMessage.error('加载会话失败')
  } finally {
    loading.value = false
  }
}

function createNewSession() {
  emit('create')
}

async function restoreSession(sessionId: string) {
  try {
    await memoryApi.restoreSession(sessionId)
    ElMessage.success('会话已恢复')
    emit('restore', sessionId)
  } catch (error) {
    console.error('Failed to restore session:', error)
    ElMessage.error('恢复会话失败')
  }
}

async function deleteSession(sessionId: string) {
  try {
    await ElMessageBox.confirm('确定要删除这个会话吗？此操作不可恢复。', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await memoryApi.deleteSession(sessionId)
    ElMessage.success('会话已删除')
    expandedSessionId.value = null
    await fetchSessions()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete session:', error)
      ElMessage.error('删除会话失败')
    }
  }
}

function copySessionContent(session: SessionMemory) {
  const content = session.messages
    .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
    .join('\n\n')
  navigator.clipboard.writeText(content)
  ElMessage.success('内容已复制到剪贴板')
}

// Watch
watch(() => props.projectId, () => {
  if (props.projectId) {
    fetchSessions()
  }
}, { immediate: true })

onMounted(() => {
  if (props.projectId) {
    fetchSessions()
  }
})
</script>

<style scoped>
.agent-session-history {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.session-header h3 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.token-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.sessions-container {
  flex: 1;
  overflow: auto;
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.session-item.expanded {
  border-color: var(--el-color-primary);
}

.session-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  background: var(--bg-secondary);
}

.session-row:hover {
  background: var(--bg-primary);
}

.session-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.session-details {
  flex: 1;
}

.session-title {
  font-weight: 500;
  margin-bottom: 4px;
}

.session-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.session-meta span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-detail {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.detail-header h4 {
  margin: 0;
}

.token-usage {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.usage-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.messages-timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.timeline-item {
  display: flex;
  gap: 12px;
}

.timeline-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.timeline-item.user .timeline-avatar {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.timeline-item.assistant .timeline-avatar {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.timeline-content {
  flex: 1;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.timeline-header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.role-label {
  font-weight: 500;
  color: var(--text-primary);
}

.message-time,
.message-tokens {
  color: var(--text-secondary);
}

.message-content {
  line-height: 1.6;
  white-space: pre-wrap;
}

.memory-refs {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.memory-ref-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.loading-state,
.empty-state {
  padding: 24px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
