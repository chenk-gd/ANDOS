# ANDOS 实施计划 V2

> 更新日期: 2026-03-17
> 基于当前项目进展重新制定，已完成内容已清除

## 项目状态总览

| 模块 | 状态 | 完成度 |
|------|------|--------|
| Web UI (Phase 1-4) | ✅ 已完成 | 100% |
| Backend API (V1.0) | ✅ 已完成 | 100% |
| Agent Memory System (V1.5) | 🔄 进行中 | 60% |
| Organization & RBAC | ✅ 已完成 | 100% |
| AI Agent Core | ✅ 已完成 | 100% |
| Memory UI (Phase 6) | ✅ 已完成 | 100% |

---

## 剩余工作清单

### Phase 5: Agent Memory System 完善 (P0)

#### 5.1 Session Memory Service 优化
**状态**: 🔄 进行中
**文件**: `apps/server/src/services/memory/SessionMemoryService.ts`

- [ ] 完善会话上下文压缩算法
- [ ] 实现 Token 使用量追踪和限制
- [ ] 优化会话历史查询性能
- [ ] 添加会话持久化到 KV 存储

#### 5.2 KV Memory Service 完善
**状态**: 🔄 进行中
**文件**: `apps/server/src/services/memory/KVMemoryService.ts`

- [ ] 实现 TTL 自动清理机制
- [ ] 添加命名空间隔离功能
- [ ] 实现批量操作接口
- [ ] 优化大值存储（S3 集成）

#### 5.3 Project Static Memory 完善
**状态**: 🔄 进行中
**文件**: `apps/server/src/services/memory/ProjectMemoryService.ts`

- [ ] 实现内存候选池审核流程
- [ ] 添加项目知识图谱构建
- [ ] 实现记忆相关性搜索
- [ ] 添加项目记忆版本控制

#### 5.4 MCP 兼容接口
**状态**: ⏳ 待开始
**文件**: 新建 `apps/server/src/routes/mcp.ts`

- [ ] 实现 MCP Server 基础框架
- [ ] 添加 Tools 接口
- [ ] 添加 Resources 接口
- [ ] 添加 Prompts 接口
- [ ] 实现 SSE 传输层

#### 5.5 Auto Memory Extraction Service
**状态**: ⏳ 待开始
**文件**: 新建 `apps/server/src/services/AutoMemoryExtractionService.ts`

- [ ] 实现后台记忆提取调度器
- [ ] 添加 LLM 记忆候选识别
- [ ] 实现候选池存储和管理
- [ ] 添加用户反馈处理流程

#### 5.6 Memory Routes 完善
**状态**: 🔄 进行中 70%
**文件**: `apps/server/src/routes/memory.ts`

- [ ] 完成所有 Memory API 端点
- [ ] 添加权限检查
- [ ] 实现 Rate Limiting
- [ ] 完善错误处理

### Phase 6: Web UI 与 Memory 集成 (P1) ✅ 已完成

#### 6.1 AI Chat Panel 升级
**状态**: ✅ 已完成
**文件**: `apps/web/src/components/AiChatPanel.vue`

- [x] 集成 Memory 上下文显示
- [x] 添加记忆引用高亮
- [x] 实现记忆反馈按钮（有用/无用）
- [x] 添加会话记忆查看器

#### 6.2 Memory 管理界面
**状态**: ✅ 已完成
**文件**: `apps/web/src/components/MemoryManager.vue`

- [x] 项目记忆列表展示
- [x] 记忆审核界面（候选池）
- [x] 记忆编辑功能
- [x] 记忆搜索和过滤

#### 6.3 Agent 会话历史
**状态**: ✅ 已完成
**文件**: `apps/web/src/components/AgentSessionHistory.vue`

- [x] 会话列表展示
- [x] 会话详情查看
- [x] 会话恢复功能
- [x] Token 使用统计

### Phase 7: 系统完善 (P1)

#### 7.1 Dirty Propagation Webhook
**状态**: ⏳ 待开始

- [ ] 实现变更事件触发
- [ ] 添加下游资产自动标记 dirty
- [ ] 实现 Webhook 重试机制

#### 7.2 Impact Analysis UI
**状态**: ⏳ 待开始

- [ ] 在 WorkspacePanel 添加影响分析按钮
- [ ] 展示受影响资产列表
- [ ] 可视化影响范围

#### 7.3 性能优化
**状态**: ⏳ 待开始

- [ ] 前端懒加载优化
- [ ] API 响应缓存
- [ ] 大数据分页优化

### Phase 8: 测试与文档 (P2)

#### 8.1 测试覆盖
**状态**: 🔄 进行中

- [ ] Memory Service 单元测试
- [ ] Auto Extraction 测试
- [ ] MCP 接口测试
- [ ] Web UI E2E 测试

#### 8.2 文档完善
**状态**: ⏳ 待开始

- [ ] API 文档更新
- [ ] 架构文档更新
- [ ] 用户手册编写
- [ ] 部署指南

---

## 实施优先级

```
P0 (当前阶段): Agent Memory System 完善
  └── 5.1 ~ 5.6 核心 Memory 功能

P1 (下一阶段): UI 集成与系统完善
  └── 6.1 ~ 6.3 Memory UI
  └── 7.1 ~ 7.3 系统功能

P2 (后续): 测试与文档
  └── 8.1 ~ 8.2 测试文档
```

---

## 技术债务

1. **代码优化**: `WorkspacePanel.vue` 中状态管理可进一步提取到 Pinia store
2. **错误处理**: 部分 API 调用缺少统一的错误处理
3. **类型定义**: 部分 any 类型需要细化
4. **测试覆盖**: Memory 相关服务测试覆盖率不足

---

## 里程碑

| 里程碑 | 预计完成 | 关键交付 |
|--------|----------|----------|
| Memory Core 完成 | 2026-03-24 | Session/KV/Project Memory 可用 |
| MCP 接口完成 | 2026-03-31 | 外部工具可集成 |
| Auto Extraction 完成 | 2026-04-07 | 自动记忆提取上线 |
| V1.5 发布 | 2026-04-14 | 完整 Memory System |
| V1.5 UI 完成 | 2026-04-21 | Memory 管理界面 |
| V2.0 准备 | 2026-05-01 | 测试文档完善 |
