<template>
  <div class="memory-manager">
    <!-- Header -->
    <div class="memory-header">
      <h3>项目记忆管理</h3>
      <div class="header-actions">
        <el-input
          v-model="searchQuery"
          placeholder="搜索记忆..."
          prefix-icon="Search"
          clearable
          style="width: 200px"
          @input="debounceSearch"
        />
        <el-select v-model="filterType" placeholder="类型" clearable style="width: 120px">
          <el-option
            v-for="(label, type) in MEMORY_TYPE_LABELS"
            :key="type"
            :label="label"
            :value="type"
          />
        </el-select>
        <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px">
          <el-option
            v-for="(label, status) in MEMORY_STATUS_LABELS"
            :key="status"
            :label="label"
            :value="status"
          />
        </el-select>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">
          添加记忆
        </el-button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="memory-stats">
      <el-card v-for="(count, type) in stats.byType" :key="type" class="stat-card">
        <div class="stat-value">{{ count }}</div>
        <div class="stat-label">{{ MEMORY_TYPE_LABELS[type as MemoryType] }}</div>
      </el-card>
      <el-card class="stat-card pending">
        <div class="stat-value">{{ stats.pendingReviews }}</div>
        <div class="stat-label">待审核</div>
      </el-card>
    </div>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" class="memory-tabs">
      <!-- Active Memories Tab -->
      <el-tab-pane label="活跃记忆" name="memories">
        <div class="memory-list">
          <div v-if="loading" class="loading-state">
            <el-skeleton :rows="5" animated />
          </div>
          <div v-else-if="filteredMemories.length === 0" class="empty-state">
            <el-empty description="暂无记忆" />
          </div>
          <div
            v-for="memory in filteredMemories"
            :key="memory.id"
            :class="['memory-item', { expanded: expandedMemoryId === memory.id }]"
          >
            <div class="memory-header-row" @click="toggleExpand(memory.id)">
              <div class="memory-info">
                <el-tag size="small" :type="getTypeTagType(memory.type)">
                  {{ MEMORY_TYPE_LABELS[memory.type] }}
                </el-tag>
                <span class="memory-preview">{{ memory.content }}</span>
              </div>
              <div class="memory-meta">
                <el-tag size="small" :type="getStatusTagType(memory.status)">
                  {{ MEMORY_STATUS_LABELS[memory.status] }}
                </el-tag>
                <span class="memory-date">{{ formatDate(memory.updatedAt) }}</span>
                <el-button
                  size="small"
                  :icon="expandedMemoryId === memory.id ? ArrowUp : ArrowDown"
                  circle
                  text
                />
              </div>
            </div>
            <div v-if="expandedMemoryId === memory.id" class="memory-detail">
              <div class="detail-content">
                <div class="detail-field">
                  <label>内容:</label>
                  <div class="content-text">{{ memory.content }}</div>
                </div>
                <div v-if="memory.metadata?.source" class="detail-field">
                  <label>来源:</label>
                  <span>{{ memory.metadata.source }}</span>
                </div>
                <div v-if="memory.metadata?.assetId" class="detail-field">
                  <label>关联资产:</label>
                  <el-link type="primary" @click="navigateToAsset(memory.metadata.assetId)">
                    {{ memory.metadata.assetId }}
                  </el-link>
                </div>
                <div v-if="memory.metadata?.tags?.length" class="detail-field">
                  <label>标签:</label>
                  <el-tag
                    v-for="tag in memory.metadata.tags"
                    :key="tag"
                    size="small"
                    class="memory-tag"
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </div>
              <div class="detail-actions">
                <el-button size="small" :icon="Edit" @click="editMemory(memory)">
                  编辑
                </el-button>
                <el-button
                  v-if="memory.status === 'active'"
                  size="small"
                  type="warning"
                  :icon="Box"
                  @click="archiveMemory(memory.id)"
                >
                  归档
                </el-button>
                <el-button
                  v-else
                  size="small"
                  type="success"
                  :icon="RefreshRight"
                  @click="activateMemory(memory.id)"
                >
                  恢复
                </el-button>
                <el-button size="small" type="danger" :icon="Delete" @click="deleteMemory(memory.id)">
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Candidate Pool Tab -->
      <el-tab-pane label="候选池" name="candidates">
        <div class="candidate-list">
          <div v-if="loadingCandidates" class="loading-state">
            <el-skeleton :rows="5" animated />
          </div>
          <div v-else-if="candidates.length === 0" class="empty-state">
            <el-empty description="暂无待审核记忆" />
          </div>
          <div
            v-for="candidate in candidates"
            :key="candidate.id"
            class="candidate-item"
          >
            <div class="candidate-content">
              <div class="candidate-header">
                <el-tag size="small" :type="getTypeTagType(candidate.type)">
                  {{ MEMORY_TYPE_LABELS[candidate.type] }}
                </el-tag>
                <el-tag
                  size="small"
                  :type="candidate.confidence > 0.8 ? 'success' : candidate.confidence > 0.5 ? 'warning' : 'info'"
                >
                  置信度: {{ (candidate.confidence * 100).toFixed(1) }}%
                </el-tag>
                <span class="candidate-session">会话: {{ candidate.sessionId }}</span>
                <span class="candidate-date">{{ formatDate(candidate.extractedAt) }}</span>
              </div>
              <div class="candidate-text">{{ candidate.content }}</div>
              <div v-if="candidate.reviewedAt" class="candidate-review">
                <el-tag :type="candidate.status === 'approved' ? 'success' : 'danger'">
                  {{ candidate.status === 'approved' ? '已批准' : '已拒绝' }}
                </el-tag>
                <span v-if="candidate.feedback">反馈: {{ candidate.feedback }}</span>
              </div>
            </div>
            <div v-if="candidate.status === 'pending'" class="candidate-actions">
              <el-button
                type="success"
                size="small"
                :icon="Check"
                @click="approveCandidate(candidate.id)"
              >
                批准
              </el-button>
              <el-button
                type="danger"
                size="small"
                :icon="Close"
                @click="rejectCandidate(candidate.id)"
              >
                拒绝
              </el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Search Results Tab -->
      <el-tab-pane label="语义搜索" name="search">
        <div class="search-section">
          <el-input
            v-model="semanticQuery"
            placeholder="输入自然语言查询..."
            type="textarea"
            :rows="2"
            @keydown.enter.prevent="performSemanticSearch"
          />
          <el-button
            type="primary"
            :icon="Search"
            :loading="searching"
            @click="performSemanticSearch"
          >
            搜索
          </el-button>
        </div>
        <div class="search-results">
          <div v-if="searchResults.length === 0 && !searching" class="empty-state">
            <el-empty description="输入查询开始搜索" />
          </div>
          <div
            v-for="result in searchResults"
            :key="result.memory.id"
            class="search-result-item"
          >
            <div class="result-header">
              <el-tag size="small" :type="getTypeTagType(result.memory.type)">
                {{ MEMORY_TYPE_LABELS[result.memory.type] }}
              </el-tag>
              <div class="result-scores">
                <el-tag size="small" type="success">
                  相似度: {{ (result.similarity * 100).toFixed(1) }}%
                </el-tag>
                <el-tag size="small" type="primary">
                  相关度: {{ (result.relevance * 100).toFixed(1) }}%
                </el-tag>
              </div>
            </div>
            <div class="result-content">{{ result.memory.content }}</div>
            <div class="result-meta">
              <span>更新于: {{ formatDate(result.memory.updatedAt) }}</span>
              <el-button size="small" text @click="viewMemory(result.memory)">
                查看详情
              </el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Create/Edit Dialog -->
    <el-dialog
      v-model="showCreateDialog"
      :title="editingMemory ? '编辑记忆' : '添加记忆'"
      width="600px"
    >
      <el-form :model="memoryForm" label-position="top">
        <el-form-item label="类型">
          <el-select v-model="memoryForm.type" style="width: 100%">
            <el-option
              v-for="(label, type) in MEMORY_TYPE_LABELS"
              :key="type"
              :label="label"
              :value="type"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="memoryForm.content"
            type="textarea"
            :rows="5"
            placeholder="输入记忆内容..."
          />
        </el-form-item>
        <el-form-item label="来源">
          <el-input v-model="memoryForm.source" placeholder="例如: 需求文档 v1.0" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="memoryForm.tags"
            multiple
            allow-create
            filterable
            placeholder="添加标签"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveMemory">
          {{ editingMemory ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  Plus,
  Search,
  Edit,
  Delete,
  Box,
  RefreshRight,
  ArrowUp,
  ArrowDown,
  Check,
  Close,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { memoryApi } from '@/services/memoryApi'
import {
  MEMORY_TYPE_LABELS,
  MEMORY_STATUS_LABELS,
  type Memory,
  type MemoryType,
  type MemoryCandidate,
  type MemorySearchResult,
} from '@/types/memory'

// Props
const props = defineProps<{
  projectId: string
}>()

// State
const activeTab = ref('memories')
const loading = ref(false)
const loadingCandidates = ref(false)
const saving = ref(false)
const searching = ref(false)

const memories = ref<Memory[]>([])
const candidates = ref<MemoryCandidate[]>([])
const searchResults = ref<MemorySearchResult[]>([])

const searchQuery = ref('')
const semanticQuery = ref('')
const filterType = ref('')
const filterStatus = ref('')
const expandedMemoryId = ref<string | null>(null)

const showCreateDialog = ref(false)
const editingMemory = ref<Memory | null>(null)
const memoryForm = ref({
  type: 'context' as MemoryType,
  content: '',
  source: '',
  tags: [] as string[],
})

const stats = ref({
  totalMemories: 0,
  byType: {} as Record<MemoryType, number>,
  pendingReviews: 0,
  lastUpdated: '',
})

// Filtered memories
const filteredMemories = computed(() => {
  return memories.value.filter((memory) => {
    if (filterType.value && memory.type !== filterType.value) return false
    if (filterStatus.value && memory.status !== filterStatus.value) return false
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      return (
        memory.content.toLowerCase().includes(query) ||
        memory.metadata?.tags?.some((tag) => tag.toLowerCase().includes(query))
      )
    }
    return true
  })
})

// Methods
function getTypeTagType(type: MemoryType): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<MemoryType, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    requirement: 'success',
    design: 'warning',
    decision: 'danger',
    constraint: 'info',
    context: '',
    preference: 'success',
  }
  return map[type]
}

function getStatusTagType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    active: 'success',
    archived: 'info',
    pending_review: 'warning',
  }
  return map[status] || ''
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString('zh-CN')
}

function toggleExpand(id: string) {
  expandedMemoryId.value = expandedMemoryId.value === id ? null : id
}

function navigateToAsset(assetId: string) {
  // TODO: Emit event to navigate to asset
  console.log('Navigate to asset:', assetId)
}

let searchTimeout: ReturnType<typeof setTimeout>
function debounceSearch() {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    // Search is handled by computed filter
  }, 300)
}

// API Calls
async function fetchMemories() {
  if (!props.projectId) return
  loading.value = true
  try {
    memories.value = await memoryApi.listMemories(props.projectId)
  } catch (error) {
    console.error('Failed to fetch memories:', error)
    ElMessage.error('加载记忆失败')
  } finally {
    loading.value = false
  }
}

async function fetchCandidates() {
  if (!props.projectId) return
  loadingCandidates.value = true
  try {
    candidates.value = await memoryApi.listCandidates(props.projectId, { status: 'pending' })
  } catch (error) {
    console.error('Failed to fetch candidates:', error)
    ElMessage.error('加载候选池失败')
  } finally {
    loadingCandidates.value = false
  }
}

async function fetchStats() {
  if (!props.projectId) return
  try {
    stats.value = await memoryApi.getStats(props.projectId)
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  }
}

async function performSemanticSearch() {
  if (!props.projectId || !semanticQuery.value.trim()) return
  searching.value = true
  try {
    searchResults.value = await memoryApi.searchMemories({
      projectId: props.projectId,
      query: semanticQuery.value,
      limit: 10,
    })
  } catch (error) {
    console.error('Search failed:', error)
    ElMessage.error('搜索失败')
  } finally {
    searching.value = false
  }
}

function editMemory(memory: Memory) {
  editingMemory.value = memory
  memoryForm.value = {
    type: memory.type,
    content: memory.content,
    source: memory.metadata?.source || '',
    tags: memory.metadata?.tags || [],
  }
  showCreateDialog.value = true
}

async function saveMemory() {
  if (!memoryForm.value.content.trim()) {
    ElMessage.warning('请输入内容')
    return
  }

  saving.value = true
  try {
    if (editingMemory.value) {
      await memoryApi.updateMemory(editingMemory.value.id, {
        content: memoryForm.value.content,
        type: memoryForm.value.type,
        metadata: {
          ...editingMemory.value.metadata,
          source: memoryForm.value.source,
          tags: memoryForm.value.tags,
        },
      })
      ElMessage.success('记忆已更新')
    } else {
      await memoryApi.createMemory({
        projectId: props.projectId,
        type: memoryForm.value.type,
        content: memoryForm.value.content,
        metadata: {
          source: memoryForm.value.source,
          tags: memoryForm.value.tags,
        },
      })
      ElMessage.success('记忆已创建')
    }
    showCreateDialog.value = false
    resetForm()
    await fetchMemories()
    await fetchStats()
  } catch (error) {
    console.error('Save failed:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function archiveMemory(id: string) {
  try {
    await memoryApi.updateMemory(id, { status: 'archived' })
    ElMessage.success('记忆已归档')
    await fetchMemories()
  } catch (error) {
    console.error('Archive failed:', error)
    ElMessage.error('归档失败')
  }
}

async function activateMemory(id: string) {
  try {
    await memoryApi.updateMemory(id, { status: 'active' })
    ElMessage.success('记忆已恢复')
    await fetchMemories()
  } catch (error) {
    console.error('Activate failed:', error)
    ElMessage.error('恢复失败')
  }
}

async function deleteMemory(id: string) {
  try {
    await ElMessageBox.confirm('确定要删除这条记忆吗？此操作不可恢复。', '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await memoryApi.deleteMemory(id)
    ElMessage.success('记忆已删除')
    await fetchMemories()
    await fetchStats()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Delete failed:', error)
      ElMessage.error('删除失败')
    }
  }
}

async function approveCandidate(id: string) {
  try {
    await memoryApi.reviewCandidate({ candidateId: id, approved: true })
    ElMessage.success('候选记忆已批准')
    await fetchCandidates()
    await fetchMemories()
    await fetchStats()
  } catch (error) {
    console.error('Approve failed:', error)
    ElMessage.error('批准失败')
  }
}

async function rejectCandidate(id: string) {
  try {
    await memoryApi.reviewCandidate({ candidateId: id, approved: false, feedback: '手动拒绝' })
    ElMessage.success('候选记忆已拒绝')
    await fetchCandidates()
  } catch (error) {
    console.error('Reject failed:', error)
    ElMessage.error('拒绝失败')
  }
}

function viewMemory(memory: Memory) {
  // Navigate to memories tab and expand
  activeTab.value = 'memories'
  expandedMemoryId.value = memory.id
}

function resetForm() {
  editingMemory.value = null
  memoryForm.value = {
    type: 'context',
    content: '',
    source: '',
    tags: [],
  }
}

watch(showCreateDialog, (visible) => {
  if (!visible) {
    resetForm()
  }
})

watch(() => props.projectId, () => {
  if (props.projectId) {
    fetchMemories()
    fetchCandidates()
    fetchStats()
  }
}, { immediate: true })

onMounted(() => {
  if (props.projectId) {
    fetchMemories()
    fetchCandidates()
    fetchStats()
  }
})
</script>

<style scoped>
.memory-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: hidden;
}

.memory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.memory-header h3 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.memory-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
  text-align: center;
}

.stat-card.pending {
  background: var(--el-color-warning-light-9);
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--el-color-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.memory-tabs {
  flex: 1;
  overflow: hidden;
}

.memory-tabs :deep(.el-tabs__content) {
  height: calc(100% - 40px);
  overflow: auto;
}

.memory-list,
.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.memory-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.memory-item.expanded {
  border-color: var(--el-color-primary);
}

.memory-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  background: var(--bg-secondary);
}

.memory-header-row:hover {
  background: var(--bg-primary);
}

.memory-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.memory-preview {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.memory-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.memory-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.memory-detail {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.detail-content {
  margin-bottom: 16px;
}

.detail-field {
  margin-bottom: 12px;
}

.detail-field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.content-text {
  white-space: pre-wrap;
  line-height: 1.6;
}

.memory-tag {
  margin-right: 8px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.candidate-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  background: var(--bg-secondary);
}

.candidate-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.candidate-session {
  font-size: 12px;
  color: var(--text-secondary);
}

.candidate-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.candidate-text {
  line-height: 1.6;
  margin-bottom: 12px;
}

.candidate-review {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--bg-primary);
  border-radius: 4px;
}

.candidate-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.search-section {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.search-section .el-button {
  flex-shrink: 0;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-result-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  background: var(--bg-secondary);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-scores {
  display: flex;
  gap: 8px;
}

.result-content {
  line-height: 1.6;
  margin-bottom: 8px;
}

.result-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.loading-state,
.empty-state {
  padding: 24px;
}
</style>
