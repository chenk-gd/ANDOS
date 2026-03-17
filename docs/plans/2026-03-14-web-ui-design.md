# ANDOS Web UI 设计文档

**Date:** 2026-03-14
**Status:** Draft
**Version:** 1.0

---

## 1. 概述

### 1.1 设计目标

AI-First、Canvas-First 的 Web 界面，支持：
- 人机协作的 AI 交互模式
- 可视化资产依赖图谱（DAG）
- 多类型资产的创建与编辑
- 实时协作编辑

### 1.2 用户画像

**AI-First 用户**：习惯与 AI 协作，期望通过自然语言完成大部分操作，AI 主动提供建议。

### 1.3 核心交互模式

**Canvas-First + Form-based 混合**：
- Canvas 提供可视化依赖图谱和工作区概览
- Form 提供精准的资产属性编辑
- AI Chat 作为始终可用的协作助手

---

## 2. 整体架构

### 2.1 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Vue 3 + TypeScript |
| 路由 | Vue Router 4 |
| 状态管理 | Pinia |
| UI 组件库 | Element Plus |
| DAG 可视化 | Cytoscape.js |
| 代码编辑器 | Monaco Editor |
| Markdown 渲染 | marked + github-markdown-css |
| WebSocket | 原生 WebSocket API |

### 2.2 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  Header (Logo + Project Selector + User Menu)                │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │  ┌─────────────┐  │
│  Asset   │      Workspace (Canvas)      │  │ Notification│  │
│ Explorer │      - Asset Form Tab        │  │   Panel     │  │
│  Panel   │      - DAG Graph Tab         │  ├─────────────┤  │
│(Collapsible)│                            │  │  AI Chat    │  │
│          │                              │  │   Panel     │  │
│          │                              │  ├─────────────┤  │
│          │                              │  │  User Input │  │
│          │                              │  └─────────────┘  │
└──────────┴──────────────────────────────┴───────────────────┘
```

**三列可折叠布局**：
- **左侧面板**：资产浏览器（可按类别折叠）
- **中间面板**：工作区（表单编辑 + DAG 图谱 Tab）
- **右侧面板**：通知 + AI 聊天 + 用户输入

---

## 3. 组件设计

### 3.1 组件层级

```
App
├── MainLayout (三列布局壳)
│   ├── HeaderBar
│   │   ├── Logo
│   │   ├── ProjectSelector
│   │   └── UserMenu
│   ├── LeftPanel (AssetExplorer)
│   │   ├── AssetTree (按类型分组)
│   │   │   ├── RequirementNode
│   │   │   ├── DesignNode
│   │   │   ├── TaskNode
│   │   │   ├── CodeNode
│   │   │   ├── TestNode
│   │   │   └── PipelineNode
│   │   └── AssetSearch
│   ├── CenterPanel (Workspace)
│   │   ├── TabBar (Form | DAG Graph)
│   │   ├── AssetForm
│   │   │   ├── StructuredEditor (JSON Schema 表单)
│   │   │   └── TextEditor (代码/文本编辑器)
│   │   │       ├── EditorToolbar
│   │   │       ├── MonacoEditor
│   │   │       └── PreviewPanel
│   │   └── DagCanvas (Cytoscape.js)
│   └── RightPanel
│       ├── NotificationList
│       ├── AiChatPanel
│       └── UserInputBox
```

### 3.2 关键组件说明

#### AssetTree
- 按6种资产类型分组（requirement/design/task/code/test/pipeline）
- 支持展开/折叠
- 支持拖拽排序
- 显示资产状态图标（draft/clean/dirty/modified/archived）

#### AssetForm
支持两种编辑模式：
- **StructuredEditor**：适用于结构化资产（requirement/design/task）
- **TextEditor**：适用于文本/代码资产，支持语法高亮和预览

#### DagCanvas
- 使用 Cytoscape.js 渲染依赖图谱
- 支持点击选中、缩放、平移
- 支持节点拖拽重新布局
- 高亮选中资产的上下游依赖

#### AiChatPanel
- 与 AI Agent 交互的聊天界面
- 支持 @mention 唤醒特定 Agent
- 支持 Markdown 渲染
- 显示建议操作卡片（可点击执行）

---

## 4. 支持的文件类型

### 4.1 文本/代码编辑器支持的语言

| 语言 | MIME Type | 文件扩展名 | Monaco Language ID |
|------|-----------|------------|-------------------|
| Plain Text | text/plain | .txt | plaintext |
| Markdown | text/markdown | .md, .markdown | markdown |
| JSON | application/json | .json | json |
| YAML | application/yaml | .yaml, .yml | yaml |
| XML | application/xml | .xml | xml |
| HTML | text/html | .html, .htm | html |
| CSS | text/css | .css | css |
| JavaScript | application/javascript | .js, .mjs | javascript |
| TypeScript | application/typescript | .ts, .tsx | typescript |
| Python | text/x-python | .py | python |
| Java | text/x-java-source | .java | java |
| Go | text/x-go | .go | go |
| Rust | text/x-rust | .rs | rust |
| C/C++ | text/x-c | .c, .cpp, .h, .hpp | cpp |
| C# | text/x-csharp | .cs | csharp |
| Ruby | text/x-ruby | .rb | ruby |
| PHP | text/x-php | .php | php |
| Shell | text/x-shellscript | .sh, .bash | shell |
| SQL | text/x-sql | .sql | sql |
| Docker | text/x-dockerfile | Dockerfile | dockerfile |
| GraphQL | application/graphql | .graphql, .gql | graphql |
| TOML | text/x-toml | .toml | toml |
| Ini/Config | text/x-ini | .ini, .conf, .config | ini |
| Properties | text/x-java-properties | .properties | properties |
| Log | text/x-log | .log | log |

### 4.2 预览支持

| 类型 | 预览方式 | 说明 |
|------|---------|------|
| Markdown | 实时渲染 | marked + github-markdown-css，支持 Mermaid 图表 |
| JSON | 树形/格式化 | json-viewer 组件，支持折叠/展开 |
| YAML | 树形/格式化 | 转换为 JSON 后使用 json-viewer |
| XML | 格式化 + 折叠 | 语法高亮 + 标签折叠 |
| HTML | 实时预览 | iframe 沙箱渲染 |
| Image | 直接显示 | 支持 PNG/JPG/SVG/GIF/WebP |

### 4.3 文件类型检测

```typescript
// 基于文件扩展名和 MIME 类型自动检测
function detectLanguage(filename: string, mimeType?: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  const extMap: Record<string, string> = {
    'md': 'markdown',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    // ... 其他映射
  };

  return extMap[ext] || 'plaintext';
}
```

---

## 5. 状态管理

### 5.1 Pinia Stores

```typescript
// stores/layout.ts - 面板状态
interface LayoutState {
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  activeTab: 'form' | 'dag';
}

// stores/assets.ts - 资产数据
interface AssetsState {
  currentAsset: Asset | null;
  assetTree: AssetNode[];
  selectedAssetId: string | null;
  loading: boolean;
}

// stores/collaboration.ts - 实时协作
interface CollaborationState {
  activeUsers: Map<string, UserCursor>;
  editingAssetId: string | null;
  draftContent: Map<string, DraftContent>;
  lastSavedAt: Date | null;
}

// stores/ai.ts - AI 会话
interface AIState {
  messages: Message[];
  activeAgent: string | null;
  isStreaming: boolean;
  sessionId: string | null;
}
```

### 5.2 协作状态详情

```typescript
interface DraftContent {
  assetId: string;
  content: string;        // 文本内容或序列化的结构化数据
  version: number;        // 本地编辑版本号（乐观锁）
  savedAt: Date;
  editedBy: string;       // 用户 ID
}

interface UserCursor {
  userId: string;
  userName: string;
  avatar?: string;
  cursorPosition: { line: number; column: number };
  selection?: { start: Position; end: Position };
  lastActiveAt: Date;
}
```

---

## 6. 数据流

### 6.1 资产编辑流程

```
用户点击 AssetTree 中的资产
  ↓
路由跳转到 /assets/:id
  ↓
AssetService 调用 API 获取资产详情
  ↓
AssetForm 根据资产类型选择编辑器
  ├── 结构化资产 → StructuredEditor
  └── 文本资产 → TextEditor (Monaco)
  ↓
用户修改内容
  ↓
本地表单状态更新 (debounce 500ms)
  ↓
自动保存草稿到服务器 (POST /assets/{id}/draft)
  ↓
WebSocket 广播变更给其他客户端
  ↓
其他用户看到实时更新（显示"xx 正在编辑"提示）
```

### 6.2 版本发布流程

```
用户完成编辑，点击"发布版本"按钮
  ↓
打开发布确认对话框
  ├── 显示变更摘要（diff 视图）
  ├── 输入版本说明（changelog）
  └── 选择/确认版本号（语义化版本建议）
  ↓
用户确认发布
  ↓
调用 POST /assets/{id}/versions
  ↓
资产状态变为 clean
  ↓
广播 version.published 事件（WebSocket）
  ↓
更新 AssetTree 状态图标
```

### 6.3 AI 交互流程

```
用户在 AI Chat 输入消息（或 @mention Agent）
  ↓
消息加入 ai.messages，显示在聊天面板
  ↓
调用 POST /sessions/{id}/turns API
  ↓
建立 SSE 连接获取流式响应
  ↓
实时更新消息内容（打字机效果）
  ↓
AI 建议的操作显示为可点击卡片
  ↓
用户点击卡片执行操作（如"创建依赖"）
```

---

## 7. WebSocket 消息协议

### 7.1 客户端 → 服务端

```typescript
type ClientMessage =
  | { type: 'connection.init'; token: string }
  | { type: 'asset.subscribe'; assetId: string }
  | { type: 'asset.unsubscribe'; assetId: string }
  | { type: 'asset.edit'; assetId: string; content: string; version: number }
  | { type: 'cursor.move'; assetId: string; position: CursorPosition }
  | { type: 'ping'; timestamp: number };
```

### 7.2 服务端 → 客户端

```typescript
type ServerMessage =
  | { type: 'connection.established'; connectionId: string; heartbeatInterval: number }
  | { type: 'asset.updated'; assetId: string; content: string; editedBy: string; timestamp: string }
  | { type: 'asset.state.changed'; assetId: string; from: AssetState; to: AssetState; trigger: string }
  | { type: 'version.published'; assetId: string; version: string; publishedBy: string }
  | { type: 'user.joined'; assetId: string; user: UserInfo }
  | { type: 'user.left'; assetId: string; userId: string }
  | { type: 'user.cursor'; assetId: string; userId: string; position: CursorPosition }
  | { type: 'pong'; timestamp: number }
  | { type: 'error'; code: string; message: string };
```

---

## 8. 错误处理

### 8.1 错误分类与处理

| 错误类型 | 处理方式 | 显示位置 |
|---------|---------|---------|
| API 请求失败 | 自动重试 3 次后提示用户 | Notification Panel |
| 表单验证错误 | 实时字段级验证 | 表单字段下方 |
| 版本冲突（乐观锁失败） | 显示 diff，提示用户合并 | 弹窗提示 |
| WebSocket 断开 | 自动重连，保留已接收内容 | 状态栏指示器 |
| AI 流中断 | 自动重连，从断点续传 | Chat 消息状态 |
| 离线状态 | 操作队列化，恢复后同步 | 全局提示条 |

### 8.2 版本冲突处理

当多个用户同时编辑同一资产时：
1. 客户端乐观锁检测（version 不匹配）
2. 显示冲突解决对话框
3. 展示本地版本 vs 服务器版本的 diff
4. 用户选择：覆盖服务器版本 | 放弃本地修改 | 手动合并

---

## 9. 性能优化

### 9.1 编辑器性能

- **大文件处理**：超过 10MB 的文件使用虚拟滚动
- **语法高亮**：Web Worker 异步处理
- **自动保存**：500ms debounce，避免频繁请求

### 9.2 DAG 画布性能

- **节点优化**：超过 100 个节点时启用层级渲染
- **边优化**：使用 WebGL 渲染大量边
- **视口裁剪**：只渲染可见区域内的节点

### 9.3 实时协作性能

- **变更合并**：服务端合并短时间内的多个变更
- **增量同步**：只传输变更的 diff，而非完整内容
- **心跳优化**：30 秒心跳，超时 60 秒后断开

---

## 10. 暗色主题支持

Element Plus + Monaco Editor 均支持暗色主题：

```typescript
// 主题切换
function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');

  // Element Plus 主题
  ElConfigProvider.theme = isDark ? darkTheme : lightTheme;

  // Monaco Editor 主题
  monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');

  // Cytoscape 主题
  cy.style().fromJson(isDark ? darkStyle : lightStyle).update();
}
```

---

## 11. 开发顺序建议

```
Phase 1: 基础框架
  - 项目脚手架（Vue 3 + TS + Pinia）
  - 路由配置
  - 布局组件（三列可折叠）
  - 暗色主题支持

Phase 2: 资产浏览
  - AssetTree 组件
  - AssetService API 封装
  - 资产列表/搜索

Phase 3: 资产编辑（文本）
  - Monaco Editor 集成
  - 多语言支持
  - Markdown/JSON 预览
  - 自动保存草稿

Phase 4: 资产编辑（结构化）
  - JSON Schema 表单生成
  - 表单验证
  - 版本发布流程

Phase 5: DAG 可视化
  - Cytoscape.js 集成
  - 依赖图谱渲染
  - 节点交互

Phase 6: 实时协作
  - WebSocket 连接管理
  - 多用户光标显示
  - 版本冲突处理

Phase 7: AI 集成
  - AI Chat 面板
  - SSE 流式响应
  - @mention Agent
```

---

## 12. 参考资料

- [平台架构设计](../architecture/platform-overview.md)
- [API 设计规范](../architecture/api-design.md)
- [Element Plus 文档](https://element-plus.org/)
- [Monaco Editor 文档](https://microsoft.github.io/monaco-editor/)
- [Cytoscape.js 文档](https://js.cytoscape.org/)

---

**Last Updated:** 2026-03-14
