# 实施路线图

**Date:** 2026-03-14
**Status:** Draft
**Version:** 1.1

---

## 1. 概述

本文档整合 ANDOS 平台各模块的实施计划，包括：

- 平台核心功能（资产、版本、依赖、状态）
- Agent 系统（Primary、Subagent、Skill）
- API 接口与权限
- 数据库与基础设施

---

## 2. 里程碑总览

| 阶段 | 目标 | 周期 | 关键交付物 |
|------|------|------|-----------|
| **MVP (V0.1)** | 核心资产管理 + 基础 Agent | 6 周 | 资产CRUD、版本、DAG依赖、Primary Agent |
| **V1.0** | 完整平台 + Agent 系统 | 10 周 | Subagent、Skill系统、权限、Webhook |
| **V1.5** | 智能化 + 扩展性 | 12 周 | 智能影响分析、兼容性检查、Skill市场 |
| **V2.0** | 企业级 + 生态 | 16 周 | 多Agent协作、SDK、高级分析 |

---

## 3. 详细实施计划

### 3.1 MVP (V0.1) - 6周

#### Week 1-2: 基础框架

**基础设施**
- [ ] 项目初始化（TypeScript + Fastify + PostgreSQL）
- [ ] 数据库迁移系统（Knex.js）
- [ ] 基础中间件（认证、日志、错误处理）
- [ ] Docker Compose 本地环境

**核心表结构**
- [ ] `assets` 表（资产主表）
- [ ] `asset_versions` 表（版本表）
- [ ] `dependencies` 表（依赖关系）
- [ ] `organizations`, `users`, `projects` 表

#### Week 3-4: 核心资产API

**资产CRUD**
- [ ] `POST /assets` - 创建资产
- [ ] `GET /assets/{id}` - 获取资产
- [ ] `PUT /assets/{id}` - 更新资产
- [ ] `DELETE /assets/{id}` - 软删除资产
- [ ] `GET /assets` - 资产列表（分页）

**版本管理**
- [ ] `POST /assets/{id}/versions` - 发布版本
- [ ] `GET /assets/{id}/versions/{version}` - 获取版本
- [ ] `GET /assets/{id}/versions` - 版本列表
- [ ] 内容存储（Git/S3集成）

#### Week 5: 依赖系统

**依赖管理**
- [ ] `POST /assets/{id}/dependencies` - 创建依赖
- [ ] `DELETE /assets/{id}/dependencies/{id}` - 删除依赖
- [ ] DAG 验证（防止循环依赖）
- [ ] ltree 路径存储

**状态管理**
- [ ] `GET /assets/{id}/state` - 获取状态
- [ ] `POST /assets/{id}/clean` - 手动clean
- [ ] Dirty 状态传播机制
- [ ] `GET /dirty-queue` - Dirty队列

#### Week 6: Primary Agent MVP

**Agent 基础**
- [ ] Agent 配置系统（JSON）
- [ ] Primary Agent 运行时
- [ ] Session 管理
- [ ] 基础 Skill（fetch_asset）

**API 完善**
- [ ] 幂等性支持（Idempotency-Key）
- [ ] 基础错误处理
- [ ] 限流（Rate Limit）

---

### 3.2 V1.0 - 10周

#### Week 1-2: RBAC 权限系统

**权限模型**
- [ ] 角色表设计（project_admin, developer, tester）
- [ ] 权限检查中间件
- [ ] JWT 认证完善
- [ ] API 权限控制

#### Week 3-4: Subagent 系统

**Subagent 架构**
- [ ] Subagent 生命周期管理
- [ ] 上下文继承策略
- [ ] 权限隔离（subset继承）
- [ ] @mention 调用机制

#### Week 5-6: Skill 系统

**Skill 基础**
- [ ] SKILL.md 解析
- [ ] Skill 加载与注册
- [ ] 工具调用协议
- [ ] 权限声明校验

#### Week 7: Webhook 系统

**Webhook 功能**
- [ ] `POST /webhooks` - 创建订阅
- [ ] `GET /webhooks` - 订阅列表
- [ ] 事件推送机制
- [ ] 重试与失败处理

#### Week 8: 高级功能

**API 增强**
- [ ] 批量操作（`POST /assets/batch`）
- [ ] 字段过滤（`?fields=`）
- [ ] 乐观锁（`If-Match`）
- [ ] 异步图谱查询

**Agent 增强**
- [ ] 动态 Token 预算
- [ ] Bootstrap 文件注入
- [ ] Session 历史管理

#### Week 9-10: 测试与优化

**测试**
- [ ] 单元测试（服务层）
- [ ] API 集成测试
- [ ] Agent 测试

**优化**
- [ ] 性能基准测试
- [ ] 数据库查询优化
- [ ] 缓存策略（Redis）

---

### 3.3 V1.5 - 12周

#### Week 1-3: 智能分析 Agent

**影响分析 Agent**
- [ ] 变更影响范围分析
- [ ] 影响级别评估（high/medium/low）
- [ ] 关键路径识别
- [ ] 影响报告生成

**兼容性检查 Agent**
- [ ] 版本兼容性分析
- [ ] 接口契约检查
- [ ] 破坏性变更检测

#### Week 4-6: Skill 市场

**AndosHub 集成**
- [ ] Skill Registry
- [ ] 远程 Skill 安装
- [ ] 版本锁定（skill-lock.json）
- [ ] Skill 依赖解析

#### Week 7-9: 多模型路由

**模型路由**
- [ ] 多模型配置
- [ ] 自动降级策略
- [ ] 任务路由（不同任务用不同模型）
- [ ] 健康检查与故障转移

#### Week 10-12: 高级功能

**Agent 协作**
- [ ] 多 Agent 工作流
- [ ] Agent 间通信
- [ ] 工作流编排

**分析增强**
- [ ] 历史趋势分析
- [ ] 团队协作分析
- [ ] 项目健康度报告

---

### 3.4 V2.0 - 16周

#### Week 1-4: SDK 与扩展

**Skill SDK**
- [ ] Skill 开发 SDK
- [ ] 本地调试工具
- [ ] Skill 测试框架
- [ ] 文档生成工具

**Plugin 系统**
- [ ] Plugin API
- [ ] Hook 机制
- [ ] 第三方扩展支持

#### Week 5-8: 企业级功能

**多租户**
- [ ] 组织隔离强化
- [ ] 资源配额管理
- [ ] 审计日志完善

**SSO 集成**
- [ ] OAuth2/OIDC 支持
- [ ] LDAP 集成
- [ ] SAML 支持

#### Week 9-12: 高级分析

**AI 增强**
- [ ] 智能推荐系统
- [ ] 异常检测
- [ ] 预测性分析

**可视化**
- [ ] 依赖图谱可视化
- [ ] 实时监控仪表板
- [ ] 报告生成器

#### Week 13-16: 生态建设

**集成**
- [ ] CI/CD 集成（GitHub Actions, GitLab CI）
- [ ] IDE 插件（VS Code, IntelliJ）
- [ ] 第三方工具集成

**社区**
- [ ] 公开 API
- [ ] Skill 市场开放
- [ ] 文档与教程

---

## 4. 技术债务与优化

### 4.1 MVP 技术债务

| 项目 | 描述 | 计划解决版本 |
|------|------|-------------|
| PostgreSQL 单实例 | 所有数据在一个实例 | V1.5（分库/分表）|
| 同步图谱查询 | 复杂查询可能超时 | V1.0（异步化）|
| 基础 Agent | 仅支持简单场景 | V1.0（完整 Subagent）|
| 无全文搜索 | 仅支持 ID 查询 | V1.5（ES集成）|

### 4.2 性能优化计划

| 阶段 | 优化项 | 目标 |
|------|--------|------|
| V1.0 | 数据库索引优化 | 查询 < 100ms |
| V1.0 | Redis 缓存 | 热点数据缓存命中率 > 80% |
| V1.5 | 读写分离 | 读性能提升 2x |
| V1.5 | 表分区 | 大表查询性能提升 |
| V2.0 | 专用存储 | 图/时序/搜索独立 |

---

## 5. 风险与应对

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| AI API 稳定性 | 高 | 中 | 多模型降级、本地缓存 |
| 数据模型变更 | 高 | 高 | 迁移脚本、向后兼容 |
| 性能瓶颈 | 中 | 中 | 提前基准测试、预留扩展 |
| 安全漏洞 | 高 | 低 | 代码审查、沙箱隔离 |

---

## 6. 团队配置建议

### 6.1 MVP 阶段（6周）

| 角色 | 人数 | 职责 |
|------|------|------|
| Tech Lead | 1 | 架构设计、技术决策 |
| Backend Dev | 2 | API开发、数据库 |
| AI Engineer | 1 | Agent集成、Prompt工程 |
| QA | 1 | 测试、文档 |

### 6.2 V1.0 阶段（10周）

| 角色 | 人数 | 职责 |
|------|------|------|
| Tech Lead | 1 | 技术管理 |
| Senior Backend | 2 | 核心功能 |
| AI Engineer | 2 | Agent系统、Skill |
| Frontend | 1 | Web UI |
| DevOps | 1 | 部署、监控 |
| QA | 1 | 测试 |

---

## 7. 参考资料

- [平台架构设计](../architecture/platform-overview.md)
- [Agent 系统设计](../architecture/agent-system.md)
- [数据模型设计](../architecture/data-model.md)
- [API 设计](../api/openapi.yaml)
