# ANDOS 实施计划 V2

> 更新日期: 2026-03-23
> 已完成 Phase 5, 6, 7, 8.2

## 项目状态总览

| 模块 | 状态 | 完成度 |
|------|------|--------|
| Web UI (Phase 1-4) | ✅ 已完成 | 100% |
| Backend API (V1.0) | ✅ 已完成 | 100% |
| Agent Memory System (V1.5) | ✅ 已完成 | 100% |
| Organization & RBAC | ✅ 已完成 | 100% |
| AI Agent Core | ✅ 已完成 | 100% |
| Memory UI (Phase 6) | ✅ 已完成 | 100% |
| System Enhancement (Phase 7) | ✅ 已完成 | 100% |
| Testing & Documentation (Phase 8) | ✅ 已完成 | 100% |

---

## 已完成工作

### Phase 5: Agent Memory System 完善 (P0) ✅

#### 5.1 Session Memory Service
**状态**: ✅ 已完成
**文件**: `apps/server/src/services/SessionMemoryService.ts`
**测试**: `apps/server/tests/unit/services/SessionMemoryService.test.ts`

- [x] 会话检查点创建与恢复
- [x] 检查点生命周期管理
- [x] 会话历史查询
- [x] TTL自动清理机制（通过SchedulerService）

#### 5.2 KV Memory Service
**状态**: ✅ 已完成
**文件**: `apps/server/src/services/KVMemoryService.ts`
**测试**: `apps/server/tests/unit/services/KVMemoryService.test.ts`

- [x] Key-Value存储与读取
- [x] TTL自动过期机制
- [x] 命名空间隔离
- [x] 乐观锁并发控制

#### 5.3 Project Static Memory
**状态**: ✅ 已完成
**文件**: `apps/server/src/services/ProjectMemoryService.ts`
**测试**: `apps/server/tests/unit/services/ProjectMemoryService.test.ts`

- [x] 项目共享上下文管理
- [x] 学习模式记录与查询
- [x] 项目知识图谱构建
- [x] 上下文版本控制

#### 5.4 MCP 兼容接口
**状态**: ✅ 已完成
**文件**: `apps/server/src/routes/mcp.ts`
**测试**: `apps/server/tests/unit/routes/mcp.routes.test.ts`

- [x] MCP Server 基础框架
- [x] Tools接口 (memory_remember, memory_forget, memory_search)
- [x] Resources接口 (memory://project/{id}, memory://session/{id})
- [x] Prompts接口 (memory_context, memory_assist)
- [x] SSE传输层实现

#### 5.5 Auto Memory Extraction Service
**状态**: ✅ 已完成
**文件**: `apps/server/src/services/AutoMemoryExtractionService.ts`
**测试**: `apps/server/tests/unit/services/AutoMemoryExtractionService.test.ts`

- [x] 后台记忆提取调度器
- [x] LLM记忆候选识别（基于模式匹配）
- [x] 候选池存储和管理
- [x] 用户反馈处理流程（approve/reject/edit）

#### 5.6 Memory Routes
**状态**: ✅ 已完成
**文件**: `apps/server/src/routes/memory.ts`
**测试**: `apps/server/tests/unit/routes/memory.test.ts`

- [x] 所有Memory API端点
- [x] 权限检查
- [x] 会话管理API

### Phase 6: Web UI 与 Memory 集成 (P1) ✅ 已完成

#### 6.1-6.3 Memory UI组件
**状态**: ✅ 已完成

- [x] AI Chat Panel 记忆集成
- [x] MemoryManager 组件
- [x] AgentSessionHistory 组件

### Phase 7: 系统完善 (P1) ✅ 已完成

#### 7.1 Dirty Propagation Webhook
**状态**: ✅ 已完成

- [x] 变更事件触发 (asset.dirty, asset.published, asset.dirty_batch)
- [x] 下游资产自动标记dirty
- [x] Webhook错误处理（静默失败）

#### 7.2 Impact Analysis UI
**状态**: ✅ 已完成

- [x] WorkspacePanel添加影响分析按钮
- [x] 展示受影响资产列表
- [x] 可视化影响范围

#### 7.3 性能优化
**状态**: ✅ 已完成

- [x] 前端懒加载优化 (LazyLoad组件)
- [x] API响应缓存 (5分钟缓存策略)
- [x] 虚拟滚动 (el-tree-v2)

---

## 剩余工作清单

### Phase 8: 测试与文档 (P2) ✅ 已完成

#### 8.1 测试覆盖
**状态**: ✅ 已完成 (414 tests passing)

- [x] SessionMemoryService 单元测试 ✅
- [x] KVMemoryService 单元测试 ✅
- [x] ProjectMemoryService 单元测试 ✅
- [x] MCPMemoryTools 单元测试 ✅
- [x] AutoMemoryExtractionService 单元测试 ✅
- [x] Memory Routes 单元测试 ✅
- [x] MCP Routes 单元测试 ✅
- [x] Web UI E2E测试 - `apps/web/e2e/*.spec.ts`
- [x] 覆盖率报告配置 - `vitest.config.ts`

#### 8.2 文档完善
**状态**: ✅ 已完成

- [x] API文档更新 (OpenAPI/Swagger) - `docs/api/openapi.json`
- [x] MCP协议接口文档 - `docs/api/mcp-protocol.md`
- [x] Memory System使用指南 - `docs/guides/memory-system.md`
- [x] 部署指南更新 - `docs/operations/deployment.md`
- [x] 文档中心更新 - `docs/README.md`

#### 8.3 代码质量
**状态**: ⏳ 待开始

- [ ] 统一错误处理规范化
- [ ] 类型定义细化 (消除any类型)
- [ ] 代码注释完善
- [ ] 性能基准测试

---

## 实施优先级

```
✅ 所有计划阶段已完成 (Phase 1-8)

Phase 9: 工作流编排 (Task Workflow Orchestration) 🆕
  ├── 9.1 EventBus 基础设施
  ├── 9.2 TaskGeneratorAgent
  ├── 9.3 TaskRouterAgent
  ├── 9.4 审查工作流
  ├── 9.5 委托执行
  └── 9.6 Web UI 适配

可选的未来工作:
  └── 8.3 代码质量优化 (P3)
  └── 集成测试补充
  └── 性能基准测试
```

---

## 技术债务

1. **代码优化**: `WorkspacePanel.vue` 中状态管理可进一步提取到Pinia store
2. **错误处理**: 部分API调用缺少统一的错误处理
3. **类型定义**: 部分any类型需要细化
4. **测试覆盖**: 需要添加E2E测试

---

## Phase 9: 工作流编排 (Task Workflow Orchestration)

> 目标: 实现设计变更后的自动化工作流 - 影响分析→生成工作项→人工审查→智能路由→委托执行
> 预计工期: 20 个工作日
> 详细设计: `docs/plans/2026-03-25-task-workflow-orchestration-design.md`

### 9.1 事件系统基础设施 (3天)

**状态**: ⏳ 待开始

- [ ] EventBus 服务实现（基于 Node.js EventEmitter + Redis Pub/Sub）
- [ ] 事件订阅/发布 API
- [ ] AssetService.publishVersion() 触发 `asset.version.published` 事件
- [ ] ImpactAgent 改为事件驱动订阅
- [ ] dirty_sources 表扩展（关联 task_ids）

**关键文件**:
- `src/services/EventBus.ts`
- `src/services/AssetService.ts` (修改)
- `database/migrations/013_add_task_refs_to_dirty_sources.ts`

### 9.2 TaskGeneratorAgent (3天)

**状态**: ⏳ 待开始

- [ ] TaskGeneratorAgent.ts 实现
- [ ] 任务生成规则引擎（breaking/additive/behavioral 规则）
- [ ] POST /v1/agents/task-generator/execute
- [ ] 创建 Task 资产（复用 assets 表，type='task'）
- [ ] 状态设为 `pending_review`

**关键文件**:
- `src/agents/TaskGeneratorAgent.ts`
- `src/routes/agents.ts` (新增 API)

### 9.3 TaskRouterAgent (3天)

**状态**: ⏳ 待开始

- [ ] TaskRouterAgent.ts 实现
- [ ] 路由策略框架（类型映射、负载感知预留接口）
- [ ] POST /v1/agents/task-router/route
- [ ] 路由历史记录（task_routing_history 表）
- [ ] 支持人工覆盖建议

**关键文件**:
- `src/agents/TaskRouterAgent.ts`
- `database/migrations/014_create_task_routing_history.ts`

### 9.4 审查工作流 (4天)

**状态**: ⏳ 待开始

- [ ] GET /v1/tasks?status=pending_review
- [ ] POST /v1/tasks/:id/review（批准/拒绝/修改）
- [ ] POST /v1/tasks/batch-review（批量审查）
- [ ] 通知机制（有新工作项时通知用户）
- [ ] Task 资产状态机实现

**关键文件**:
- `src/routes/tasks.ts` (新增路由文件)
- `src/services/TaskService.ts`

### 9.5 委托执行 (3天)

**状态**: ⏳ 待开始

- [ ] CodeAgent/TestAgent 改为 Subagent 模式
- [ ] POST /v1/tasks/:id/assign（分配）
- [ ] POST /v1/tasks/:id/delegate（委托执行）
- [ ] 执行状态追踪（与 AgentExecutionEngine 集成）
- [ ] 失败后退回人工/重试机制

**关键文件**:
- `src/agents/CodeAgent.ts` (修改 mode)
- `src/agents/TestAgent.ts` (修改 mode)
- `src/services/TaskExecutionAdapter.ts`

### 9.6 Web UI 适配 (4天)

**状态**: ⏳ 待开始

- [ ] 工作项列表页面（待审查/已分配/已完成）
- [ ] 工作项详情/审查页面
- [ ] 分配选择器（显示 TaskRouter 建议 + 人工覆盖）
- [ ] 执行进度实时查看
- [ ] 批量操作支持

**关键文件**:
- `apps/web/src/views/TasksView.vue`
- `apps/web/src/components/TaskReviewPanel.vue`
- `apps/web/src/components/TaskAssignmentModal.vue`

---

## 里程碑

| 里程碑 | 状态 | 关键交付 |
|--------|------|----------|
| Memory Core 完成 | ✅ | Session/KV/Project Memory 可用 |
| MCP 接口完成 | ✅ | 外部工具可集成 |
| Auto Extraction 完成 | ✅ | 自动记忆提取上线 |
| V1.5 发布 | ✅ | 完整Memory System |
| V1.5 UI 完成 | ✅ | Memory管理界面 |
| Phase 7 完成 | ✅ | Webhook、影响分析、性能优化 |
| V1.5 文档完善 | ✅ | OpenAPI, MCP协议, 用户指南 |
