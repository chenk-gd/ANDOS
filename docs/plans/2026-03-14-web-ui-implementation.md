# Web UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an AI-First, Canvas-First Web UI for ANDOS with Vue 3, TypeScript, Monaco Editor, and real-time collaboration.

**Architecture:** Three-column collapsible layout (Asset Explorer | Workspace | AI Chat). Workspace supports Form editing (Monaco Editor for 25+ languages) and DAG visualization (Cytoscape.js). Real-time collaboration via WebSocket with optimistic locking.

**Tech Stack:** Vue 3 + TypeScript + Pinia + Element Plus + Monaco Editor + Cytoscape.js + Vitest

---

## Prerequisites

Before starting, ensure:
- Node.js 18+ installed
- Git repository cloned
- API server running (for integration testing)

---

## Phase 1: Project Setup

### Task 1: Initialize Vue 3 Project with Vite

**Files:**
- Create: `web-ui/package.json`
- Create: `web-ui/vite.config.ts`
- Create: `web-ui/tsconfig.json`
- Create: `web-ui/index.html`

**Step 1: Create project structure**

Run:
```bash
mkdir -p web-ui
cd web-ui
npm create vue@latest . -- --typescript --router --pinia --vitest --eslint --prettier
```

**Step 2: Install additional dependencies**

Run:
```bash
npm install element-plus @element-plus/icons-vue
npm install @monaco-editor/loader monaco-editor
npm install cytoscape cytoscape-dagre
npm install marked github-markdown-css
npm install -D @types/cytoscape @types/marked
```

**Step 3: Configure Vite for Monaco Editor**

Create `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
        },
      },
    },
  },
})
```

**Step 4: Configure TypeScript**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 5: Test project builds**

Run:
```bash
npm run build
```

Expected: Build succeeds without errors.

**Step 6: Commit**

```bash
cd ..
git add web-ui/
git commit -m "chore: initialize Vue 3 project with Vite

- Vue 3 + TypeScript + Pinia + Vue Router
- Element Plus UI library
- Monaco Editor, Cytoscape.js dependencies
- Vitest for testing"
```

---

### Task 2: Setup Base Styles and Theme

**Files:**
- Create: `web-ui/src/styles/variables.css`
- Create: `web-ui/src/styles/dark-theme.css`
- Modify: `web-ui/src/main.ts`

**Step 1: Create CSS variables**

Create `web-ui/src/styles/variables.css`:
```css
:root {
  /* Layout */
  --header-height: 48px;
  --panel-width: 280px;
  --panel-min-width: 200px;
  --panel-max-width: 400px;

  /* Colors (Light) */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f7fa;
  --bg-tertiary: #e4e7ed;
  --text-primary: #303133;
  --text-secondary: #606266;
  --text-tertiary: #909399;
  --border-color: #dcdfe6;

  /* Status Colors */
  --status-draft: #909399;
  --status-clean: #67c23a;
  --status-dirty: #e6a23c;
  --status-modified: #409eff;
  --status-archived: #f56c6c;
}

.dark {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d30;
  --text-primary: #d4d4d4;
  --text-secondary: #bbbbbb;
  --text-tertiary: #858585;
  --border-color: #3e3e42;
}
```

**Step 2: Create dark theme overrides**

Create `web-ui/src/styles/dark-theme.css`:
```css
.dark .el-header {
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.dark .el-aside {
  background-color: var(--bg-primary);
}

.dark .el-main {
  background-color: var(--bg-secondary);
}
```

**Step 3: Update main.ts to import styles**

Modify `web-ui/src/main.ts`:
```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/variables.css'
import './styles/dark-theme.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')
```

**Step 4: Test styles load**

Run:
```bash
cd web-ui
npm run dev
```

Open browser at `http://localhost:5173`, verify no style errors.

**Step 5: Commit**

```bash
git add web-ui/src/styles/
git add web-ui/src/main.ts
git commit -m "chore: setup base styles and dark theme support

- CSS variables for theming
- Light/dark mode color schemes
- Element Plus dark theme integration"
```

---

## Phase 2: Layout Components

### Task 3: Create Three-Column Layout Shell

**Files:**
- Create: `web-ui/src/layouts/MainLayout.vue`
- Modify: `web-ui/src/App.vue`
- Test: `web-ui/src/layouts/__tests__/MainLayout.spec.ts`

**Step 1: Write failing test**

Create `web-ui/src/layouts/__tests__/MainLayout.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MainLayout from '../MainLayout.vue'

describe('MainLayout', () => {
  it('renders three panels', () => {
    const wrapper = mount(MainLayout)
    expect(wrapper.find('.left-panel').exists()).toBe(true)
    expect(wrapper.find('.center-panel').exists()).toBe(true)
    expect(wrapper.find('.right-panel').exists()).toBe(true)
  })

  it('toggles left panel collapse', async () => {
    const wrapper = mount(MainLayout)
    const toggleBtn = wrapper.find('.toggle-left-btn')
    await toggleBtn.trigger('click')
    expect(wrapper.find('.left-panel').classes()).toContain('collapsed')
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
npm run test:unit src/layouts/__tests__/MainLayout.spec.ts
```

Expected: FAIL - "Component not found"

**Step 3: Implement MainLayout**

Create `web-ui/src/layouts/MainLayout.vue`:
```vue
<template>
  <div class="main-layout" :class="{ 'dark': isDark }">
    <header class="header-bar">
      <div class="logo">ANDOS</div>
      <div class="header-actions">
        <el-button @click="toggleTheme" :icon="isDark ? Sunny : Moon" circle />
      </div>
    </header>

    <div class="layout-body">
      <aside class="left-panel" :class="{ collapsed: layoutStore.leftCollapsed }">
        <div class="panel-content">
          <slot name="left" />
        </div>
        <div class="resize-handle" @mousedown="startResize('left')" />
      </aside>

      <main class="center-panel">
        <slot name="center" />
      </main>

      <aside class="right-panel" :class="{ collapsed: layoutStore.rightCollapsed }">
        <div class="panel-content">
          <slot name="right" />
        </div>
        <div class="resize-handle" @mousedown="startResize('right')" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Sunny, Moon } from '@element-plus/icons-vue'
import { useLayoutStore } from '@/stores/layout'

const layoutStore = useLayoutStore()
const isDark = ref(false)

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark')
}

function startResize(panel: 'left' | 'right') {
  // Resize logic to be implemented
  console.log('Resize', panel)
}
</script>

<style scoped>
.main-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header-bar {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.layout-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-panel,
.right-panel {
  width: var(--panel-width);
  min-width: var(--panel-min-width);
  max-width: var(--panel-max-width);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
}

.left-panel.collapsed,
.right-panel.collapsed {
  width: 40px;
  min-width: 40px;
}

.center-panel {
  flex: 1;
  background: var(--bg-secondary);
  overflow: auto;
}

.panel-content {
  flex: 1;
  overflow: auto;
}

.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.2s;
}

.resize-handle:hover {
  background: var(--border-color);
}
</style>
```

**Step 4: Create layout store**

Create `web-ui/src/stores/layout.ts`:
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useLayoutStore = defineStore('layout', () => {
  const leftCollapsed = ref(false)
  const rightCollapsed = ref(false)
  const activeTab = ref<'form' | 'dag'>('form')

  function toggleLeft() {
    leftCollapsed.value = !leftCollapsed.value
  }

  function toggleRight() {
    rightCollapsed.value = !rightCollapsed.value
  }

  return {
    leftCollapsed,
    rightCollapsed,
    activeTab,
    toggleLeft,
    toggleRight,
  }
})
```

**Step 5: Run test to verify it passes**

Run:
```bash
npm run test:unit src/layouts/__tests__/MainLayout.spec.ts
```

Expected: PASS

**Step 6: Update App.vue to use layout**

Modify `web-ui/src/App.vue`:
```vue
<template>
  <MainLayout>
    <template #left>
      <div class="placeholder">Asset Explorer</div>
    </template>
    <template #center>
      <div class="placeholder">Workspace</div>
    </template>
    <template #right>
      <div class="placeholder">AI Chat</div>
    </template>
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from './layouts/MainLayout.vue'
</script>

<style>
.placeholder {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
```

**Step 7: Commit**

```bash
git add web-ui/src/layouts/
git add web-ui/src/stores/layout.ts
git add web-ui/src/App.vue
git commit -m "feat: create three-column layout shell

- MainLayout with left/center/right panels
- Collapsible panel support
- Dark theme toggle
- Resize handles (logic TBD)"
```

---

### Task 4: Create Collapsible Panel Component

**Files:**
- Create: `web-ui/src/components/CollapsiblePanel.vue`
- Test: `web-ui/src/components/__tests__/CollapsiblePanel.spec.ts`

**Step 1: Write failing test**

Create `web-ui/src/components/__tests__/CollapsiblePanel.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CollapsiblePanel from '../CollapsiblePanel.vue'

describe('CollapsiblePanel', () => {
  it('renders title and content', () => {
    const wrapper = mount(CollapsiblePanel, {
      props: { title: 'Test Panel' },
      slots: { default: 'Panel Content' }
    })
    expect(wrapper.text()).toContain('Test Panel')
    expect(wrapper.text()).toContain('Panel Content')
  })

  it('collapses when toggle button clicked', async () => {
    const wrapper = mount(CollapsiblePanel, {
      props: { title: 'Test Panel', collapsible: true }
    })
    await wrapper.find('.collapse-btn').trigger('click')
    expect(wrapper.emitted('collapse')).toBeTruthy()
  })
})
```

**Step 2: Run test**

Run:
```bash
npm run test:unit src/components/__tests__/CollapsiblePanel.spec.ts
```

Expected: FAIL

**Step 3: Implement CollapsiblePanel**

Create `web-ui/src/components/CollapsiblePanel.vue`:
```vue
<template>
  <div class="collapsible-panel" :class="{ collapsed: isCollapsed }">
    <div class="panel-header" @click="toggle">
      <slot name="title">
        <span class="title">{{ title }}</span>
      </slot>
      <el-button
        v-if="collapsible"
        class="collapse-btn"
        :icon="isCollapsed ? ArrowRight : ArrowDown"
        size="small"
        circle
        text
        @click.stop="toggle"
      />
    </div>
    <div v-show="!isCollapsed" class="panel-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, ArrowDown } from '@element-plus/icons-vue'

interface Props {
  title?: string
  collapsible?: boolean
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsible: true,
  collapsed: false,
})

const emit = defineEmits<{
  collapse: [value: boolean]
}>()

const isCollapsed = computed({
  get: () => props.collapsed,
  set: (value) => emit('collapse', value)
})

function toggle() {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value
  }
}
</script>

<style scoped>
.collapsible-panel {
  border-bottom: 1px solid var(--border-color);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}

.panel-header:hover {
  background: var(--bg-secondary);
}

.title {
  font-weight: 500;
  color: var(--text-primary);
}

.panel-body {
  padding: 0 16px 16px;
}

.collapsed .panel-header {
  border-bottom: none;
}
</style>
```

**Step 4: Run test to verify it passes**

Run:
```bash
npm run test:unit src/components/__tests__/CollapsiblePanel.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add web-ui/src/components/CollapsiblePanel.vue
git add web-ui/src/components/__tests__/
git commit -m "feat: add CollapsiblePanel component

- Support title slot
- Collapsible toggle with animation
- Emits collapse event"
```

---

## Phase 3: Asset Explorer Panel

### Task 5: Create Asset Types and API Client

**Files:**
- Create: `web-ui/src/types/asset.ts`
- Create: `web-ui/src/services/api.ts`
- Test: `web-ui/src/services/__tests__/api.spec.ts`

**Step 1: Define asset types**

Create `web-ui/src/types/asset.ts`:
```typescript
export type AssetType = 'requirement' | 'design' | 'task' | 'code' | 'test' | 'pipeline'

export type AssetState = 'draft' | 'clean' | 'dirty' | 'modified' | 'archived'

export interface Asset {
  id: string
  name: string
  slug: string
  description?: string
  type: AssetType
  state: AssetState
  currentVersion: string
  projectId: string
  owners: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface AssetVersion {
  version: string
  content: string
  contentType: string
  publishedBy: string
  publishedAt: string
  changelog?: string
}

export interface AssetNode {
  id: string
  name: string
  type: AssetType
  state: AssetState
  children?: AssetNode[]
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  requirement: '需求',
  design: '设计',
  task: '任务',
  code: '代码',
  test: '测试',
  pipeline: '流水线',
}

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  requirement: 'Document',
  design: 'Brush',
  task: 'List',
  code: 'Code',
  test: 'Check',
  pipeline: 'Connection',
}

export const ASSET_STATE_COLORS: Record<AssetState, string> = {
  draft: '#909399',
  clean: '#67c23a',
  dirty: '#e6a23c',
  modified: '#409eff',
  archived: '#f56c6c',
}
```

**Step 2: Create API client**

Create `web-ui/src/services/api.ts`:
```typescript
import type { Asset, AssetVersion } from '@/types/asset'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  return response.json()
}

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

  async listVersions(id: string): Promise<{ data: AssetVersion[] }> {
    return request(`/assets/${id}/versions`)
  },

  async publishVersion(id: string, version: string, changelog?: string): Promise<{ data: AssetVersion }> {
    return request(`/assets/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({ version, changelog }),
    })
  },
}
```

**Step 3: Write test**

Create `web-ui/src/services/__tests__/api.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assetsApi } from '../api'

describe('assetsApi', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    global.fetch = vi.fn()
  })

  it('fetches asset list', async () => {
    const mockAssets = { data: [{ id: '1', name: 'Test', type: 'requirement', state: 'draft' }] }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAssets,
    } as Response)

    const result = await assetsApi.list()
    expect(result.data).toHaveLength(1)
    expect(result.data[0].name).toBe('Test')
  })

  it('throws on error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Not found' }),
    } as Response)

    await expect(assetsApi.get('invalid')).rejects.toThrow('Not found')
  })
})
```

**Step 4: Run test**

Run:
```bash
npm run test:unit src/services/__tests__/api.spec.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add web-ui/src/types/
git add web-ui/src/services/
git commit -m "feat: add asset types and API client

- Asset type definitions with labels/icons/colors
- REST API client with fetch
- Unit tests for API client"
```

---

### Task 6: Create AssetTree Component

**Files:**
- Create: `web-ui/src/components/AssetTree.vue`
- Create: `web-ui/src/stores/assets.ts`
- Test: `web-ui/src/components/__tests__/AssetTree.spec.ts`

**Step 1: Create assets store**

Create `web-ui/src/stores/assets.ts`:
```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Asset, AssetType, AssetNode } from '@/types/asset'
import { assetsApi } from '@/services/api'
import { ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from '@/types/asset'

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref<Asset[]>([])
  const currentAsset = ref<Asset | null>(null)
  const loading = ref(false)
  const selectedId = ref<string | null>(null)

  const assetTree = computed<AssetNode[]>(() => {
    const typeOrder: AssetType[] = ['requirement', 'design', 'task', 'code', 'test', 'pipeline']
    return typeOrder.map(type => ({
      id: `type-${type}`,
      name: ASSET_TYPE_LABELS[type],
      type,
      state: 'clean' as const,
      children: assets.value
        .filter(a => a.type === type)
        .map(a => ({
          id: a.id,
          name: a.name,
          type: a.type,
          state: a.state,
        })),
    }))
  })

  async function fetchAssets(projectId?: string) {
    loading.value = true
    try {
      const response = await assetsApi.list(projectId)
      assets.value = response.data
    } finally {
      loading.value = false
    }
  }

  async function selectAsset(id: string) {
    selectedId.value = id
    loading.value = true
    try {
      const response = await assetsApi.get(id)
      currentAsset.value = response.data
    } finally {
      loading.value = false
    }
  }

  return {
    assets,
    currentAsset,
    loading,
    selectedId,
    assetTree,
    fetchAssets,
    selectAsset,
  }
})
```

**Step 2: Write failing test for AssetTree**

Create `web-ui/src/components/__tests__/AssetTree.spec.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AssetTree from '../AssetTree.vue'
import { useAssetsStore } from '@/stores/assets'

describe('AssetTree', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders asset type groups', () => {
    const store = useAssetsStore()
    store.assets = [
      { id: '1', name: 'Req 1', type: 'requirement', state: 'draft' } as any,
    ]

    const wrapper = mount(AssetTree)
    expect(wrapper.text()).toContain('需求')
    expect(wrapper.text()).toContain('Req 1')
  })

  it('emits select event when asset clicked', async () => {
    const store = useAssetsStore()
    store.assets = [
      { id: '1', name: 'Req 1', type: 'requirement', state: 'draft' } as any,
    ]

    const wrapper = mount(AssetTree)
    await wrapper.find('.asset-item').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })
})
```

**Step 3: Run test**

Run:
```bash
npm run test:unit src/components/__tests__/AssetTree.spec.ts
```

Expected: FAIL

**Step 4: Implement AssetTree**

Create `web-ui/src/components/AssetTree.vue`:
```vue
<template>
  <div class="asset-tree">
    <div class="tree-header">
      <el-input
        v-model="searchQuery"
        placeholder="搜索资产..."
        :prefix-icon="Search"
        clearable
      />
    </div>

    <el-tree
      :data="treeData"
      :props="{ children: 'children', label: 'name' }"
      :expand-on-click-node="false"
      :default-expanded-keys="expandedKeys"
      @node-click="handleNodeClick"
    >
      <template #default="{ node, data }">
        <div class="tree-node" :class="{ 'is-type': !data.children, 'is-selected': selectedId === data.id }">
          <el-icon v-if="data.children" class="type-icon">
            <component :is="ASSET_TYPE_ICONS[data.type]" />
          </el-icon>
          <span v-else class="status-dot" :style="{ background: ASSET_STATE_COLORS[data.state] }" />
          <span class="node-label">{{ node.label }}</span>
          <span v-if="data.children" class="node-count">({{ data.children.length }})</span>
        </div>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useAssetsStore } from '@/stores/assets'
import { ASSET_TYPE_ICONS, ASSET_STATE_COLORS } from '@/types/asset'
import type { AssetNode } from '@/types/asset'

const emit = defineEmits<{
  select: [id: string]
}>()

const store = useAssetsStore()
const searchQuery = ref('')

const selectedId = computed(() => store.selectedId)
const expandedKeys = computed(() => store.assetTree.map(n => n.id))

const treeData = computed(() => {
  if (!searchQuery.value) return store.assetTree
  // Simple filter - can be improved with fuzzy search
  return store.assetTree.map(group => ({
    ...group,
    children: group.children?.filter(child =>
      child.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    ),
  })).filter(g => g.children && g.children.length > 0)
})

function handleNodeClick(data: AssetNode) {
  if (!data.children) {
    emit('select', data.id)
    store.selectAsset(data.id)
  }
}
</script>

<style scoped>
.asset-tree {
  height: 100%;
  overflow: auto;
}

.tree-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.tree-node.is-selected {
  color: var(--el-color-primary);
}

.type-icon {
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.node-label {
  flex: 1;
}

.node-count {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
```

**Step 5: Run test to verify it passes**

Run:
```bash
npm run test:unit src/components/__tests__/AssetTree.spec.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add web-ui/src/components/AssetTree.vue
git add web-ui/src/stores/assets.ts
git add web-ui/src/components/__tests__/AssetTree.spec.ts
git commit -m "feat: add AssetTree component

- Group assets by type with expandable tree
- Search filtering
- Status color indicators
- Select event handling"
```

---

## Phase 4: Monaco Editor Integration

### Task 7: Setup Monaco Editor Component

**Files:**
- Create: `web-ui/src/components/MonacoEditor.vue`
- Create: `web-ui/src/composables/useMonaco.ts`
- Test: `web-ui/src/components/__tests__/MonacoEditor.spec.ts`

**Step 1: Create Monaco composable**

Create `web-ui/src/composables/useMonaco.ts`:
```typescript
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as monaco from 'monaco-editor'

export function useMonaco(containerRef: Ref<HTMLElement | null>, options: monaco.editor.IStandaloneEditorConstructionOptions = {}) {
  const editor = ref<monaco.editor.IStandaloneCodeEditor | null>(null)

  onMounted(() => {
    if (!containerRef.value) return

    editor.value = monaco.editor.create(containerRef.value, {
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      ...options,
    })
  })

  onBeforeUnmount(() => {
    editor.value?.dispose()
  })

  return {
    editor,
    getValue: () => editor.value?.getValue() || '',
    setValue: (value: string) => editor.value?.setValue(value),
    setLanguage: (language: string) => {
      const model = editor.value?.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, language)
      }
    },
  }
}
```

**Step 2: Create MonacoEditor component**

Create `web-ui/src/components/MonacoEditor.vue`:
```vue
<template>
  <div ref="editorRef" class="monaco-editor" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import * as monaco from 'monaco-editor'

interface Props {
  modelValue: string
  language?: string
  theme?: string
  readonly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  language: 'plaintext',
  theme: 'vs-dark',
  readonly: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
}>()

const editorRef = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

onMounted(() => {
  if (!editorRef.value) return

  editor = monaco.editor.create(editorRef.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    readOnly: props.readonly,
  })

  editor.onDidChangeModelContent(() => {
    const value = editor?.getValue() || ''
    emit('update:modelValue', value)
    emit('change', value)
  })
})

watch(() => props.language, (newLang) => {
  if (editor) {
    const model = editor.getModel()
    if (model) {
      monaco.editor.setModelLanguage(model, newLang)
    }
  }
})

watch(() => props.modelValue, (newValue) => {
  if (editor && editor.getValue() !== newValue) {
    editor.setValue(newValue)
  }
})

watch(() => props.theme, (newTheme) => {
  monaco.editor.setTheme(newTheme)
})
</script>

<style scoped>
.monaco-editor {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>
```

**Step 3: Create language detection utility**

Create `web-ui/src/utils/languageDetect.ts`:
```typescript
const extMap: Record<string, string> = {
  'txt': 'plaintext',
  'md': 'markdown',
  'markdown': 'markdown',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'xml': 'xml',
  'html': 'html',
  'htm': 'html',
  'css': 'css',
  'js': 'javascript',
  'mjs': 'javascript',
  'ts': 'typescript',
  'tsx': 'typescript',
  'jsx': 'javascript',
  'py': 'python',
  'java': 'java',
  'go': 'go',
  'rs': 'rust',
  'c': 'c',
  'cpp': 'cpp',
  'h': 'c',
  'hpp': 'cpp',
  'cs': 'csharp',
  'rb': 'ruby',
  'php': 'php',
  'sh': 'shell',
  'bash': 'shell',
  'sql': 'sql',
  'dockerfile': 'dockerfile',
  'graphql': 'graphql',
  'gql': 'graphql',
  'toml': 'toml',
  'ini': 'ini',
  'conf': 'ini',
  'config': 'ini',
  'properties': 'ini',
  'log': 'log',
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return extMap[ext] || 'plaintext'
}

export function getLanguageLabel(lang: string): string {
  const labels: Record<string, string> = {
    plaintext: 'Plain Text',
    markdown: 'Markdown',
    json: 'JSON',
    yaml: 'YAML',
    xml: 'XML',
    html: 'HTML',
    css: 'CSS',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    go: 'Go',
    rust: 'Rust',
    cpp: 'C/C++',
    csharp: 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    shell: 'Shell',
    sql: 'SQL',
    dockerfile: 'Dockerfile',
    graphql: 'GraphQL',
    toml: 'TOML',
    ini: 'INI',
  }
  return labels[lang] || lang
}
```

**Step 4: Write test**

Create `web-ui/src/components/__tests__/MonacoEditor.spec.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MonacoEditor from '../MonacoEditor.vue'

// Mock Monaco Editor
vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(() => ({
      getValue: vi.fn(() => 'test content'),
      setValue: vi.fn(),
      getModel: vi.fn(() => ({})),
      onDidChangeModelContent: vi.fn(),
      dispose: vi.fn(),
    })),
    setModelLanguage: vi.fn(),
    setTheme: vi.fn(),
  },
}))

describe('MonacoEditor', () => {
  it('renders editor container', () => {
    const wrapper = mount(MonacoEditor, {
      props: { modelValue: 'test' }
    })
    expect(wrapper.find('.monaco-editor').exists()).toBe(true)
  })
})
```

**Step 5: Run test**

Run:
```bash
npm run test:unit src/components/__tests__/MonacoEditor.spec.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add web-ui/src/composables/
git add web-ui/src/components/MonacoEditor.vue
git add web-ui/src/utils/languageDetect.ts
git commit -m "feat: integrate Monaco Editor

- MonacoEditor component with v-model support
- Language detection by file extension (25+ languages)
- Theme switching support
- Basic unit tests with mock"
```

---

### Task 8: Create TextEditor with Preview Panel

**Files:**
- Create: `web-ui/src/components/TextEditor.vue`
- Test: `web-ui/src/components/__tests__/TextEditor.spec.ts`

**Step 1: Implement TextEditor**

Create `web-ui/src/components/TextEditor.vue`:
```vue
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
import { ref, computed, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import MonacoEditor from './MonacoEditor.vue'
import { detectLanguage, getLanguageLabel } from '@/utils/languageDetect'
import { marked } from 'marked'

interface Props {
  modelValue: string
  filename?: string
  language?: string
}

const props = withDefaults(defineProps<Props>(), {
  filename: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
  'save': [value: string]
}>()

const content = ref(props.modelValue)
const currentLanguage = ref(props.language || detectLanguage(props.filename))
const showPreview = ref(false)
const saveStatus = ref<'saved' | 'unsaved' | 'saving'>('saved')
const isDark = computed(() => document.documentElement.classList.contains('dark'))

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

let saveTimeout: NodeJS.Timeout | null = null

function handleChange(value: string) {
  saveStatus.value = 'unsaved'
  emit('change', value)

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveStatus.value = 'saving'
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
```

**Step 2: Commit**

```bash
git add web-ui/src/components/TextEditor.vue
git commit -m "feat: add TextEditor with preview support

- Monaco Editor integration
- Language selector (25+ languages)
- Markdown/JSON/HTML live preview
- Auto-save with debounce (500ms)
- Save status indicator"
```

---

## Phase 5: DAG Visualization

### Task 9: Integrate Cytoscape.js for DAG

**Files:**
- Create: `web-ui/src/components/DagCanvas.vue`
- Create: `web-ui/src/services/graph.ts`
- Test: `web-ui/src/components/__tests__/DagCanvas.spec.ts`

**Step 1: Create graph service**

Create `web-ui/src/services/graph.ts`:
```typescript
import type { Asset } from '@/types/asset'

export interface GraphNode {
  id: string
  label: string
  type: string
  state: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
}

export interface DependencyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const graphApi = {
  async getUpstream(assetId: string, depth: number = 3): Promise<{ data: DependencyGraph }> {
    const response = await fetch(
      `/v1/assets/${assetId}/dependencies?direction=upstream&depth=${depth}`
    )
    return response.json()
  },

  async getDownstream(assetId: string, depth: number = 3): Promise<{ data: DependencyGraph }> {
    const response = await fetch(
      `/v1/assets/${assetId}/dependencies?direction=downstream&depth=${depth}`
    )
    return response.json()
  },
}

export function buildCytoscapeElements(graph: DependencyGraph) {
  return {
    nodes: graph.nodes.map(n => ({
      data: {
        id: n.id,
        label: n.label,
        type: n.type,
        state: n.state,
      },
    })),
    edges: graph.edges.map(e => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
      },
    })),
  }
}
```

**Step 2: Implement DagCanvas**

Create `web-ui/src/components/DagCanvas.vue`:
```vue
<template>
  <div ref="containerRef" class="dag-canvas" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import type { DependencyGraph } from '@/services/graph'
import { ASSET_STATE_COLORS, ASSET_TYPE_LABELS } from '@/types/asset'

// Register dagre layout
cytoscape.use(dagre)

interface Props {
  graph: DependencyGraph | null
  selectedNodeId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [nodeId: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
let cy: cytoscape.Core | null = null

const style: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      'background-color': '#409eff',
      'label': 'data(label)',
      'width': 120,
      'height': 40,
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '12px',
      'border-width': 2,
      'border-color': '#fff',
    },
  },
  {
    selector: 'node[state="draft"]',
    style: { 'background-color': ASSET_STATE_COLORS.draft },
  },
  {
    selector: 'node[state="clean"]',
    style: { 'background-color': ASSET_STATE_COLORS.clean },
  },
  {
    selector: 'node[state="dirty"]',
    style: { 'background-color': ASSET_STATE_COLORS.dirty },
  },
  {
    selector: 'node[state="modified"]',
    style: { 'background-color': ASSET_STATE_COLORS.modified },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#ffd700',
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'target-arrow-shape': 'triangle',
      'line-color': '#ccc',
      'target-arrow-color': '#ccc',
      'curve-style': 'bezier',
    },
  },
  {
    selector: 'edge.highlight',
    style: {
      'line-color': '#409eff',
      'target-arrow-color': '#409eff',
      'width': 3,
    },
  },
]

onMounted(() => {
  if (!containerRef.value) return

  cy = cytoscape({
    container: containerRef.value,
    style,
    layout: {
      name: 'dagre',
      rankDir: 'TB',
      padding: 20,
    } as any,
    minZoom: 0.2,
    maxZoom: 2,
  })

  cy.on('tap', 'node', (event) => {
    const nodeId = event.target.id()
    emit('select', nodeId)
  })
})

onBeforeUnmount(() => {
  cy?.destroy()
})

watch(() => props.graph, (newGraph) => {
  if (!cy || !newGraph) return

  cy.elements().remove()

  cy.add({
    nodes: newGraph.nodes.map(n => ({
      data: { id: n.id, label: n.label, type: n.type, state: n.state },
    })),
    edges: newGraph.edges.map(e => ({
      data: { id: e.id, source: e.source, target: e.target },
    })),
  })

  cy.layout({
    name: 'dagre',
    rankDir: 'TB',
    padding: 20,
    animate: true,
    animationDuration: 300,
  } as any).run()
}, { immediate: true })

watch(() => props.selectedNodeId, (nodeId) => {
  if (!cy || !nodeId) return

  cy.$('node').removeClass('highlight')
  cy.$('edge').removeClass('highlight')

  const selected = cy.$(`#${nodeId}`)
  selected.select()

  // Highlight connected nodes and edges
  const predecessors = selected.predecessors()
  const successors = selected.successors()

  predecessors.edges().addClass('highlight')
  successors.edges().addClass('highlight')
})
</script>

<style scoped>
.dag-canvas {
  width: 100%;
  height: 100%;
  background: var(--bg-secondary);
}
</style>
```

**Step 3: Commit**

```bash
git add web-ui/src/components/DagCanvas.vue
git add web-ui/src/services/graph.ts
git commit -m "feat: add DAG visualization with Cytoscape.js

- DagCanvas component with dagre layout
- Node styling by asset state
- Edge highlighting on selection
- Upstream/downstream highlighting"
```

---

## Phase 6: Workspace Panel Integration

### Task 10: Create Workspace Panel with Tabs

**Files:**
- Create: `web-ui/src/components/WorkspacePanel.vue`
- Modify: `web-ui/src/App.vue`

**Step 1: Implement WorkspacePanel**

Create `web-ui/src/components/WorkspacePanel.vue`:
```vue
<template>
  <div class="workspace-panel">
    <div v-if="!currentAsset" class="empty-state">
      <el-empty description="选择一个资产开始编辑" />
    </div>

    <template v-else>
      <div class="asset-header">
        <h2 class="asset-title">{{ currentAsset.name }}</h2>
        <div class="asset-meta">
          <el-tag :type="getStateType(currentAsset.state)">{{ currentAsset.state }}</el-tag>
          <span class="version">v{{ currentAsset.currentVersion }}</span>
          <el-button type="primary" @click="showPublishDialog = true">
            发布版本
          </el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="workspace-tabs">
        <el-tab-pane label="编辑" name="form">
          <div class="tab-content">
            <TextEditor
              v-if="isTextAsset"
              v-model="assetContent"
              :filename="currentAsset.slug"
              @save="handleAutoSave"
            />
            <div v-else class="structured-form">
              <!-- Structured editor to be implemented -->
              <p>结构化编辑器 (TODO)</p>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="依赖图谱" name="dag">
          <div class="tab-content">
            <DagCanvas
              :graph="dependencyGraph"
              :selected-node-id="currentAsset.id"
              @select="handleNodeSelect"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <!-- Publish Version Dialog -->
    <el-dialog v-model="showPublishDialog" title="发布新版本" width="500px">
      <el-form :model="publishForm">
        <el-form-item label="版本号">
          <el-input v-model="publishForm.version" placeholder="例如: 1.0.0" />
        </el-form-item>
        <el-form-item label="变更说明">
          <el-input
            v-model="publishForm.changelog"
            type="textarea"
            rows="4"
            placeholder="描述本次变更内容..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPublishDialog = false">取消</el-button>
        <el-button type="primary" @click="handlePublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssetsStore } from '@/stores/assets'
import { useLayoutStore } from '@/stores/layout'
import TextEditor from './TextEditor.vue'
import DagCanvas from './DagCanvas.vue'
import { assetsApi } from '@/services/api'
import { graphApi, type DependencyGraph } from '@/services/graph'
import type { AssetState } from '@/types/asset'

const assetsStore = useAssetsStore()
const layoutStore = useLayoutStore()

const currentAsset = computed(() => assetsStore.currentAsset)
const activeTab = computed({
  get: () => layoutStore.activeTab,
  set: (val) => { layoutStore.activeTab = val }
})

const isTextAsset = computed(() =>
  currentAsset.value?.type === 'code' || currentAsset.value?.type === 'pipeline'
)

const assetContent = ref('')
const dependencyGraph = ref<DependencyGraph | null>(null)
const showPublishDialog = ref(false)
const publishForm = ref({
  version: '',
  changelog: '',
})

function getStateType(state: AssetState): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<AssetState, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    draft: 'info',
    clean: 'success',
    dirty: 'warning',
    modified: 'info',
    archived: 'danger',
  }
  return map[state]
}

function handleAutoSave(content: string) {
  if (!currentAsset.value) return
  // TODO: Implement WebSocket draft save
  console.log('Auto-save:', content)
}

async function handlePublish() {
  if (!currentAsset.value) return

  try {
    await assetsApi.publishVersion(
      currentAsset.value.id,
      publishForm.value.version,
      publishForm.value.changelog
    )
    showPublishDialog.value = false
    // Refresh asset data
    await assetsStore.selectAsset(currentAsset.value.id)
  } catch (error) {
    console.error('Publish failed:', error)
  }
}

function handleNodeSelect(nodeId: string) {
  assetsStore.selectAsset(nodeId)
}

watch(() => currentAsset.value?.id, async (assetId) => {
  if (!assetId) {
    dependencyGraph.value = null
    return
  }

  // Load content (mock for now)
  assetContent.value = `# ${currentAsset.value?.name}\n\nAsset content here...`

  // Load dependency graph
  try {
    const upstream = await graphApi.getUpstream(assetId, 3)
    dependencyGraph.value = upstream.data
  } catch (error) {
    console.error('Failed to load graph:', error)
  }
}, { immediate: true })
</script>

<style scoped>
.workspace-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.asset-title {
  margin: 0;
  font-size: 18px;
}

.asset-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.version {
  color: var(--text-secondary);
}

.workspace-tabs {
  flex: 1;
}

.workspace-tabs :deep(.el-tabs__content) {
  height: calc(100% - 40px);
}

.tab-content {
  height: 100%;
  padding: 16px;
}

.structured-form {
  padding: 20px;
}
</style>
```

**Step 2: Update App.vue**

Modify `web-ui/src/App.vue`:
```vue
<template>
  <MainLayout>
    <template #left>
      <CollapsiblePanel title="资产浏览器" :collapsible="false">
        <AssetTree @select="handleAssetSelect" />
      </CollapsiblePanel>
    </template>
    <template #center>
      <WorkspacePanel />
    </template>
    <template #right>
      <CollapsiblePanel title="通知" :collapsed="true">
        <p>通知列表 (TODO)</p>
      </CollapsiblePanel>
      <CollapsiblePanel title="AI 助手">
        <p>AI 聊天面板 (TODO)</p>
      </CollapsiblePanel>
    </template>
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from './layouts/MainLayout.vue'
import CollapsiblePanel from './components/CollapsiblePanel.vue'
import AssetTree from './components/AssetTree.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import { useAssetsStore } from './stores/assets'

const assetsStore = useAssetsStore()

function handleAssetSelect(id: string) {
  assetsStore.selectAsset(id)
}
</script>

<style>
.placeholder {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
```

**Step 3: Commit**

```bash
git add web-ui/src/components/WorkspacePanel.vue
git add web-ui/src/App.vue
git commit -m "feat: integrate workspace panel with tabs

- Form editing tab with TextEditor
- DAG visualization tab
- Version publish dialog
- Asset header with state/version display"
```

---

## Phase 7: WebSocket Real-time Collaboration

### Task 11: Create WebSocket Service

**Files:**
- Create: `web-ui/src/services/websocket.ts`
- Create: `web-ui/src/stores/collaboration.ts`

**Step 1: Create WebSocket service**

Create `web-ui/src/services/websocket.ts`:
```typescript
import { ref } from 'vue'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/v1/realtime'

export class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map()
  public connected = ref(false)
  public connectionId = ref<string | null>(null)

  connect(token: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(`${WS_URL}?token=${token}`)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.connected.value = true
      this.send({ type: 'connection.init', token })
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.handleMessage(message)
    }

    this.ws.onclose = () => {
      console.log('WebSocket closed')
      this.connected.value = false
      this.scheduleReconnect(token)
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  subscribe(event: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, [])
    }
    this.messageHandlers.get(event)!.push(handler)
  }

  unsubscribe(event: string, handler: (data: any) => void) {
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) handlers.splice(index, 1)
    }
  }

  private handleMessage(message: any) {
    // Handle connection established
    if (message.type === 'connection.established') {
      this.connectionId.value = message.data.connectionId
    }

    // Dispatch to handlers
    const handlers = this.messageHandlers.get(message.type)
    if (handlers) {
      handlers.forEach(handler => handler(message))
    }
  }

  private scheduleReconnect(token: string) {
    if (this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect(token)
    }, 3000)
  }
}

export const wsService = new WebSocketService()
```

**Step 2: Create collaboration store**

Create `web-ui/src/stores/collaboration.ts`:
```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { wsService } from '@/services/websocket'

interface UserCursor {
  userId: string
  userName: string
  cursorPosition: { line: number; column: number }
}

interface DraftContent {
  assetId: string
  content: string
  version: number
  savedAt: Date
  editedBy: string
}

export const useCollaborationStore = defineStore('collaboration', () => {
  const activeUsers = ref<Map<string, UserCursor>>(new Map())
  const editingAssetId = ref<string | null>(null)
  const draftContent = ref<Map<string, DraftContent>>(new Map())
  const lastSavedAt = ref<Date | null>(null)
  const isSaving = ref(false)

  const hasUnsavedChanges = computed(() => {
    return draftContent.value.size > 0
  })

  function subscribeToAsset(assetId: string) {
    editingAssetId.value = assetId

    wsService.send({
      type: 'asset.subscribe',
      assetId,
    })

    // Listen for updates
    wsService.subscribe('asset.updated', handleAssetUpdated)
    wsService.subscribe('user.joined', handleUserJoined)
    wsService.subscribe('user.left', handleUserLeft)
    wsService.subscribe('user.cursor', handleUserCursor)
  }

  function unsubscribeFromAsset() {
    if (editingAssetId.value) {
      wsService.send({
        type: 'asset.unsubscribe',
        assetId: editingAssetId.value,
      })
    }

    editingAssetId.value = null
    wsService.unsubscribe('asset.updated', handleAssetUpdated)
    wsService.unsubscribe('user.joined', handleUserJoined)
    wsService.unsubscribe('user.left', handleUserLeft)
    wsService.unsubscribe('user.cursor', handleUserCursor)
  }

  function sendEdit(content: string, version: number) {
    if (!editingAssetId.value) return

    isSaving.value = true
    wsService.send({
      type: 'asset.edit',
      assetId: editingAssetId.value,
      content,
      version,
    })
  }

  function sendCursor(position: { line: number; column: number }) {
    if (!editingAssetId.value) return

    wsService.send({
      type: 'cursor.move',
      assetId: editingAssetId.value,
      position,
    })
  }

  function handleAssetUpdated(data: any) {
    // Update local draft if needed
    lastSavedAt.value = new Date()
    isSaving.value = false
  }

  function handleUserJoined(data: any) {
    activeUsers.value.set(data.user.userId, {
      userId: data.user.userId,
      userName: data.user.userName,
      cursorPosition: { line: 0, column: 0 },
    })
  }

  function handleUserLeft(data: any) {
    activeUsers.value.delete(data.userId)
  }

  function handleUserCursor(data: any) {
    const user = activeUsers.value.get(data.userId)
    if (user) {
      user.cursorPosition = data.position
    }
  }

  return {
    activeUsers,
    editingAssetId,
    draftContent,
    lastSavedAt,
    isSaving,
    hasUnsavedChanges,
    subscribeToAsset,
    unsubscribeFromAsset,
    sendEdit,
    sendCursor,
  }
})
```

**Step 3: Commit**

```bash
git add web-ui/src/services/websocket.ts
git add web-ui/src/stores/collaboration.ts
git commit -m "feat: add WebSocket service for real-time collaboration

- WebSocket connection management with auto-reconnect
- Collaboration store for multi-user editing
- Cursor position tracking
- Asset update broadcasting"
```

---

## Phase 8: Final Integration

### Task 12: Integrate Real-time Features into Editor

**Files:**
- Modify: `web-ui/src/components/TextEditor.vue`
- Modify: `web-ui/src/App.vue`

**Step 1: Update TextEditor with collaboration**

Modify `web-ui/src/components/TextEditor.vue` (add collaboration features):
```typescript
// Add imports
import { useCollaborationStore } from '@/stores/collaboration'

// In script setup
const collaborationStore = useCollaborationStore()

// Add to template (show other users)
<div class="active-users">
  <el-avatar
    v-for="user in collaborationStore.activeUsers.values()"
    :key="user.userId"
    :title="user.userName"
    size="small"
  >
    {{ user.userName[0] }}
  </el-avatar>
</div>

// Update save handler to use WebSocket
function handleChange(value: string) {
  saveStatus.value = 'unsaved'
  emit('change', value)

  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveStatus.value = 'saving'
    collaborationStore.sendEdit(value, Date.now())
    saveStatus.value = 'saved'
  }, 500)
}
```

**Step 2: Initialize WebSocket on app mount**

Modify `web-ui/src/App.vue`:
```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import MainLayout from './layouts/MainLayout.vue'
import CollapsiblePanel from './components/CollapsiblePanel.vue'
import AssetTree from './components/AssetTree.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import { useAssetsStore } from './stores/assets'
import { wsService } from './services/websocket'

const assetsStore = useAssetsStore()

onMounted(() => {
  // Connect WebSocket (token from auth store or localStorage)
  const token = localStorage.getItem('token') || 'test-token'
  wsService.connect(token)

  // Load initial assets
  assetsStore.fetchAssets()
})

onUnmounted(() => {
  wsService.disconnect()
})

function handleAssetSelect(id: string) {
  assetsStore.selectAsset(id)
}
</script>
```

**Step 3: Create environment config**

Create `web-ui/.env.example`:
```
VITE_API_URL=http://localhost:3000/v1
VITE_WS_URL=ws://localhost:3000/v1/realtime
```

**Step 4: Commit**

```bash
git add web-ui/src/components/TextEditor.vue
git add web-ui/src/App.vue
git add web-ui/.env.example
git commit -m "feat: integrate real-time collaboration into editor

- WebSocket initialization on app mount
- Show active users in editor
- Auto-save via WebSocket broadcast
- Environment configuration"
```

---

### Task 13: Add Loading States and Error Handling

**Files:**
- Create: `web-ui/src/components/LoadingState.vue`
- Create: `web-ui/src/components/ErrorBoundary.vue`
- Modify: `web-ui/src/main.ts`

**Step 1: Create LoadingState component**

Create `web-ui/src/components/LoadingState.vue`:
```vue
<template>
  <div class="loading-state">
    <el-skeleton :rows="rows" animated v-if="type === 'skeleton'" />
    <el-empty description="加载中..." v-else>
      <el-loading />
    </el-empty>
  </div>
</template>

<script setup lang="ts">
interface Props {
  type?: 'skeleton' | 'spinner'
  rows?: number
}

withDefaults(defineProps<Props>(), {
  type: 'spinner',
  rows: 5,
})
</script>
```

**Step 2: Create ErrorBoundary**

Create `web-ui/src/components/ErrorBoundary.vue`:
```vue
<template>
  <div v-if="error" class="error-boundary">
    <el-result
      icon="error"
      title="出错了"
      :sub-title="error.message"
    >
      <template #extra>
        <el-button @click="retry">重试</el-button>
        <el-button @click="reset">重置</el-button>
      </template>
    </el-result>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const error = ref<Error | null>(null)

onErrorCaptured((err) => {
  error.value = err as Error
  return false
})

function retry() {
  error.value = null
}

function reset() {
  window.location.reload()
}
</script>
```

**Step 3: Update main.ts with error handling**

Modify `web-ui/src/main.ts`:
```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import ErrorBoundary from './components/ErrorBoundary.vue'

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/variables.css'
import './styles/dark-theme.css'

const app = createApp(ErrorBoundary)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.component('App', App)

app.mount('#app')
```

**Step 4: Commit**

```bash
git add web-ui/src/components/LoadingState.vue
git add web-ui/src/components/ErrorBoundary.vue
git add web-ui/src/main.ts
git commit -m "feat: add loading states and error boundary

- LoadingState component (skeleton/spinner)
- ErrorBoundary for graceful error handling
- Global error capture and retry"
```

---

## Testing

### Task 14: Run All Tests

**Step 1: Run unit tests**

Run:
```bash
cd web-ui
npm run test:unit
```

Expected: All tests pass

**Step 2: Run build**

Run:
```bash
npm run build
```

Expected: Build succeeds with no errors

**Step 3: Commit**

```bash
git commit -m "test: verify all tests pass and build succeeds"
```

---

## Summary

### Completed Features

1. **Project Setup**: Vue 3 + TypeScript + Vite + Element Plus
2. **Layout**: Three-column collapsible layout with dark theme
3. **Asset Explorer**: Tree view with search and type grouping
4. **Monaco Editor**: 25+ language support with syntax highlighting
5. **Text Editor**: Auto-save, preview panel (Markdown/JSON/HTML)
6. **DAG Visualization**: Cytoscape.js with dagre layout
7. **Workspace Panel**: Tabbed interface (Form + DAG)
8. **WebSocket**: Real-time collaboration with multi-user support
9. **Error Handling**: Error boundary and loading states

### Next Steps (Future Phases)

- AI Chat Panel integration
- Structured form editor (JSON Schema based)
- Version history and diff view
- Asset creation dialog
- User authentication UI

---

**Plan complete and saved to `docs/plans/2026-03-14-web-ui-implementation.md`.**

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach would you prefer?
