<template>
  <div class="text-editor">
    <div class="editor-toolbar">
      <el-select v-model="currentLanguage" size="small" style="width: 120px">
        <el-option
          v-for="lang in languages"
          :key="lang.value"
          :label="lang.label"
          :value="lang.value"
        />
      </el-select>
      <el-switch
        v-model="showPreview"
        active-text="预览"
        v-if="canPreview"
      />

      <!-- Active Users Display -->
      <div v-if="activeUsers.length > 0" class="active-users">
        <el-divider direction="vertical" />
        <div class="user-avatars">
          <el-tooltip
            v-for="user in activeUsers"
            :key="user.userId"
            :content="user.userName"
            placement="bottom"
          >
            <div
              class="user-avatar"
              :style="{ backgroundColor: user.color, borderColor: user.color }"
            >
              {{ user.userName.charAt(0).toUpperCase() }}
            </div>
          </el-tooltip>
        </div>
        <span class="user-count">{{ activeUsers.length }} 人在编辑</span>
      </div>

      <div class="save-status">
        <el-icon v-if="saveStatus === 'saving'"><Loading /></el-icon>
        <span v-else-if="saveStatus === 'saved'">已保存</span>
        <span v-else-if="saveStatus === 'unsaved'">未保存</span>
      </div>
    </div>

    <div class="editor-body" :class="{ 'with-preview': showPreview && canPreview }">
      <div class="editor-pane">
        <MonacoEditor
          v-model="content"
          :language="currentLanguage"
          :theme="isDark ? 'vs-dark' : 'vs'"
          @change="handleChange"
          @cursor-change="handleCursorChange"
        />
      </div>

      <div v-if="showPreview && canPreview" class="preview-pane">
        <div v-if="currentLanguage === 'markdown'" class="markdown-preview" v-html="renderedMarkdown" />
        <div v-else-if="currentLanguage === 'json'" class="json-preview">
          <pre>{{ formattedJson }}</pre>
        </div>
        <div v-else-if="currentLanguage === 'html'" class="html-preview">
          <iframe :srcdoc="content" sandbox="allow-scripts" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import MonacoEditor from './MonacoEditor.vue'
import { detectLanguage } from '@/utils/languageDetect'
import { useCollaborationStore } from '@/stores/collaboration'
import { marked } from 'marked'

interface Props {
  modelValue: string
  filename?: string
  language?: string
  assetId?: string
}

const props = withDefaults(defineProps<Props>(), {
  filename: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
  'save': [value: string]
}>()

const collaborationStore = useCollaborationStore()
const content = ref(props.modelValue)
const currentLanguage = ref(props.language || detectLanguage(props.filename))
const showPreview = ref(false)
const saveStatus = ref<'saved' | 'unsaved' | 'saving'>('saved')
const isDark = computed(() => document.documentElement.classList.contains('dark'))

// Active users from collaboration store
const activeUsers = computed(() => collaborationStore.activeUserList)

const languages = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'html', label: 'HTML' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'cpp', label: 'C/C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'sql', label: 'SQL' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'shell', label: 'Shell' },
]

const canPreview = computed(() =>
  ['markdown', 'json', 'yaml', 'html'].includes(currentLanguage.value)
)

const renderedMarkdown = computed(() => {
  return marked(content.value)
})

const formattedJson = computed(() => {
  try {
    return JSON.stringify(JSON.parse(content.value), null, 2)
  } catch {
    return content.value
  }
})

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function handleChange(value: string) {
  saveStatus.value = 'unsaved'
  emit('change', value)

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveStatus.value = 'saving'
    // Use WebSocket for collaborative save if assetId is available
    if (props.assetId) {
      collaborationStore.sendEdit(value, 1) // version 1, could be dynamic
    }
    emit('save', value)
    saveStatus.value = 'saved'
  }, 500)
}

watch(() => props.modelValue, (newValue) => {
  if (newValue !== content.value) {
    content.value = newValue
  }
})

watch(() => props.filename, (newFilename) => {
  if (newFilename && !props.language) {
    currentLanguage.value = detectLanguage(newFilename)
  }
})

// Subscribe to asset for collaboration
onMounted(() => {
  if (props.assetId) {
    collaborationStore.subscribeToAsset(props.assetId)
  }
})

// Unsubscribe when component unmounts or asset changes
onUnmounted(() => {
  collaborationStore.unsubscribeFromAsset()
})

watch(() => props.assetId, (newAssetId, oldAssetId) => {
  if (newAssetId && newAssetId !== oldAssetId) {
    collaborationStore.subscribeToAsset(newAssetId)
  }
})

// Track cursor position for collaboration
let cursorUpdateTimeout: ReturnType<typeof setTimeout> | null = null
function handleCursorChange(position: { line: number; column: number }) {
  if (cursorUpdateTimeout) clearTimeout(cursorUpdateTimeout)
  cursorUpdateTimeout = setTimeout(() => {
    collaborationStore.sendCursor(position)
  }, 100) // Debounce cursor updates
}
</script>

<style scoped>
.text-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.save-status {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary);
}

.active-users {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatars {
  display: flex;
  gap: 4px;
}

.user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 11px;
  font-weight: bold;
  border: 2px solid;
  cursor: pointer;
  transition: transform 0.2s;
}

.user-avatar:hover {
  transform: scale(1.1);
}

.user-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-body.with-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.editor-pane {
  height: 100%;
}

.preview-pane {
  height: 100%;
  overflow: auto;
  padding: 16px;
  border-left: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.markdown-preview {
  line-height: 1.6;
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3) {
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-preview :deep(pre) {
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
}

.json-preview pre {
  margin: 0;
  font-family: monospace;
  font-size: 13px;
}

.html-preview iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
