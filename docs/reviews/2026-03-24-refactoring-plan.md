# ANDOS 重构实施计划

**计划版本**: V1.0
**制定日期**: 2026-03-24
**基于审查**: [2026-03-24 代码审查报告](./2026-03-24-code-review-report.md)

---

## 执行摘要

本计划基于代码审查报告，将重构任务按优先级分为 P0/P1/P2 三个层次，预计总工作量约 **3-4 周** (1 人全职)。

### 时间线概览

```
Week 1:  P0 任务 (类型安全 + 错误处理)
Week 2:  P1 任务 (测试覆盖 + 代码重复)
Week 3:  P1/P2 任务 (性能优化 + 清理)
Week 4:  验证 + 文档更新
```

---

## 1. 重构原则

### 1.1 约束条件

- ✅ **行为不变**: 相同输入产生相同输出
- ✅ **接口兼容**: 公共 API 签名保持不变
- ✅ **数据契约**: 数据库结构保持不变
- ✅ **渐进交付**: 每个任务可独立验证

### 1.2 质量门禁

- 所有重构代码必须通过现有测试
- 新增代码需达到 80% 测试覆盖
- TypeScript 严格模式零错误
- ESLint 零警告

---

## 2. 任务分解

### Phase 1: P0 - 紧急修复 (Week 1)

#### Task 1.1: 修复 FileTransparencyService 类型安全 🔴

**目标**: 消除 13 处 any 类型，提升类型安全

**工作量**: 2 天

**详细步骤**:

1. **定义类型接口** (2h)
   ```typescript
   // src/types/fileTransparency.ts
   interface FileContent {
     path: string;
     content: string;
     encoding: 'utf8' | 'base64';
     size: number;
   }

   interface TransparencyReport {
     files: FileContent[];
     summary: {
       totalFiles: number;
       totalSize: number;
     };
   }
   ```

2. **替换 any 类型** (4h)
   - 修改 `extractContent()` 返回类型
   - 修改 `parseFile()` 参数类型
   - 更新所有内部方法签名

3. **验证** (2h)
   - 运行 TypeScript 编译
   - 运行相关测试
   - 手动验证功能

**验收标准**:
- [ ] FileTransparencyService.ts 零 any 类型
- [ ] 所有测试通过
- [ ] 功能无回归

---

#### Task 1.2: 实现全局错误处理 🔴

**目标**: 防止未处理的 Promise 拒绝导致服务崩溃

**工作量**: 1.5 天

**详细步骤**:

1. **创建统一错误类** (2h)
   ```typescript
   // src/errors/ANDOSError.ts
   export class ANDOSError extends Error {
     constructor(
       message: string,
       public code: string,
       public statusCode: number,
       public details?: Record<string, any>
     ) {
       super(message);
       this.name = 'ANDOSError';
     }
   }
   ```

2. **添加全局处理器** (2h)
   ```typescript
   // src/index.ts
   process.on('unhandledRejection', (reason, promise) => {
     logger.error('Unhandled Rejection:', reason);
     // 记录但不崩溃
   });

   process.on('uncaughtException', (error) => {
     logger.error('Uncaught Exception:', error);
     // 优雅关闭
     process.exit(1);
   });
   ```

3. **替换 console.error** (4h)
   - 全局搜索 console.error
   - 替换为统一的 logger

**验收标准**:
- [ ] 全局错误处理器已注册
- [ ] 所有 console 替换为 logger
- [ ] 错误日志格式统一

---

#### Task 1.3: 修复 mcp.ts 和 TestAgent 类型问题 🟡

**目标**: 修复 6 + 5 = 11 处 any 类型

**工作量**: 1.5 天

**详细步骤**:

1. **MCP 路由类型定义** (4h)
   ```typescript
   // 定义 MCP 请求/响应类型
   interface MCPRequest {
     jsonrpc: '2.0';
     id: string | number;
     method: string;
     params?: Record<string, unknown>;
   }
   ```

2. **TestAgent 类型细化** (4h)
   - 定义 TestConfig 接口
   - 定义 TestResult 接口
   - 替换 any 类型

**验收标准**:
- [ ] mcp.ts 零 any 类型
- [ ] TestAgent.ts 零 any 类型

---

### Phase 2: P1 - 质量提升 (Week 2)

#### Task 2.1: 提取 Agent 基类 🟡

**目标**: 消除 7 个 Agent 的重复配置解析逻辑

**工作量**: 2 天

**详细步骤**:

1. **创建 BaseAgent 抽象类** (4h)
   ```typescript
   // src/agents/BaseAgent.ts
   export abstract class BaseAgent {
     protected config: AgentConfig;

     constructor(config: AgentConfig) {
       this.config = this.parseConfig(config);
     }

     protected parseConfig(config: AgentConfig): ParsedConfig {
       // 公共配置解析逻辑
     }

     abstract execute(input: AgentInput): Promise<AgentOutput>;
   }
   ```

2. **重构 7 个 Agent** (6h)
   - RequirementAgent
   - DesignAgent
   - TaskAgent
   - CodeAgent
   - TestAgent
   - CompatibilityAgent
   - ImpactAgent

3. **更新测试** (2h)
   - 更新 Agent 测试用例
   - 添加 BaseAgent 测试

**验收标准**:
- [ ] BaseAgent 基类已创建
- [ ] 所有 Agent 继承 BaseAgent
- [ ] 代码重复率降低 50%

---

#### Task 2.2: 配置 TypeScript Path Alias 🟡

**目标**: 消除深层相对路径导入

**工作量**: 1.5 天

**详细步骤**:

1. **更新 tsconfig.json** (1h)
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["src/*"],
         "@services/*": ["src/services/*"],
         "@types/*": ["src/types/*"],
         "@utils/*": ["src/utils/*"],
         "@agents/*": ["src/agents/*"]
       }
     }
   }
   ```

2. **批量替换导入** (6h)
   ```typescript
   // 从
   import { AssetService } from '../../../services/AssetService';
   // 改为
   import { AssetService } from '@services/AssetService';
   ```

3. **验证构建** (1h)
   - TypeScript 编译
   - 运行测试

**验收标准**:
- [ ] tsconfig.json path alias 配置完成
- [ ] 所有深层导入替换完成
- [ ] 构建成功

---

#### Task 2.3: 补充测试覆盖 🟡

**目标**: 为关键未测试模块添加测试

**工作量**: 3 天

**详细步骤**:

1. **Webhooks Route 测试** (1天)
   ```typescript
   // tests/unit/routes/webhooks.test.ts
   describe('Webhooks Routes', () => {
     test('POST /webhooks - should create subscription', async () => {
       // 测试代码
     });

     test('POST /webhooks/:id/deliver - should trigger delivery', async () => {
       // 测试代码
     });
   });
   ```

2. **Graph Route 测试** (1天)
   - 测试依赖图谱查询
   - 测试影响分析 API

3. **Memory UI 组件测试** (1天)
   ```typescript
   // __tests__/MemoryManager.spec.ts
   describe('MemoryManager', () => {
     test('should display memory list', () => {
       // 组件测试
     });
   });
   ```

**验收标准**:
- [ ] webhooks.ts 测试覆盖 > 80%
- [ ] graph.ts 测试覆盖 > 80%
- [ ] MemoryManager.vue 组件测试完成

---

### Phase 3: P2 - 优化完善 (Week 3)

#### Task 3.1: 性能优化 🟢

**目标**: 优化 Memory 搜索和 Asset 查询性能

**工作量**: 2 天

**详细步骤**:

1. **添加数据库索引** (4h)
   ```sql
   -- migrations/2026-03-30-add-memory-indexes.ts
   CREATE INDEX CONCURRENTLY idx_kv_memories_level_namespace
     ON kv_memories(level, namespace)
     WHERE deleted_at IS NULL;

   CREATE INDEX CONCURRENTLY idx_memories_project_session
     ON kv_memories(project_id, session_id);

   CREATE INDEX CONCURRENTLY idx_checkpoints_session_sequence
     ON session_checkpoints(session_id, sequence DESC);
   ```

2. **优化 N+1 查询** (6h)
   - 分析 AssetService 中的嵌套查询
   - 使用 JOIN 替代多次查询
   - 添加数据加载器 (DataLoader)

3. **性能测试** (2h)
   - 基准测试
   - 验证优化效果

**验收标准**:
- [ ] 索引迁移文件创建
- [ ] Memory 查询性能提升 50%
- [ ] Asset 查询无 N+1 问题

---

#### Task 3.2: 清理 TODO 和 console.log 🟢

**目标**: 清理技术债务

**工作量**: 1 天

**详细步骤**:

1. **TODO 清理** (4h)
   - 审查 16 个 TODO/FIXME
   - 修复简单问题
   - 复杂问题创建 GitHub Issue

2. **console.log 清理** (4h)
   - 全局搜索 console
   - 替换为 logger 或移除

**验收标准**:
- [ ] TODO 数量 < 5
- [ ] console.log 零使用 (除开发环境)

---

#### Task 3.3: 文档更新 🟢

**目标**: 保持文档同步

**工作量**: 1 天

**详细步骤**:

1. **更新架构文档** (2h)
   - 添加 BaseAgent 架构说明
   - 更新错误处理文档

2. **创建 CHANGELOG** (2h)
   - 整理历史变更
   - 建立 CHANGELOG.md

3. **更新 API 文档** (2h)
   - 如有 API 变更，更新 openapi.json

**验收标准**:
- [ ] 架构文档已更新
- [ ] CHANGELOG.md 已创建
- [ ] API 文档最新

---

## 3. 实施顺序

### 推荐执行顺序

```
Week 1:
  Day 1-2:  Task 1.1 (FileTransparencyService 类型)
  Day 3:    Task 1.2 (全局错误处理)
  Day 4-5:  Task 1.3 (MCP 和 TestAgent 类型)

Week 2:
  Day 1-2:  Task 2.1 (Agent 基类)
  Day 3-4:  Task 2.3 (补充测试)
  Day 5:    Task 2.2 (Path Alias)

Week 3:
  Day 1-2:  Task 3.1 (性能优化)
  Day 3:    Task 3.2 (TODO 清理)
  Day 4-5:  Task 3.3 (文档更新)

Week 4:
  Day 1-2:  回归测试
  Day 3-4:  代码审查
  Day 5:    发布
```

---

## 4. 风险评估与应对

### 4.1 主要风险

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| 类型修改引入 Bug | 中 | 高 | 全面测试，小步提交 |
| 重构范围蔓延 | 中 | 中 | 严格遵守任务边界 |
| 测试编写耗时超预期 | 高 | 低 | 优先核心模块 |

### 4.2 回滚策略

- 每个 Task 独立分支开发
- 合并前必须通过 CI
- 保持可回滚的 commit 历史

---

## 5. 验收标准

### 5.1 整体目标

- [ ] TypeScript 严格模式零错误
- [ ] 测试覆盖率 > 70%
- [ ] ESLint 零警告
- [ ] 所有 P0/P1 任务完成

### 5.2 量化指标

| 指标 | 当前 | 目标 | 验证方式 |
|------|------|------|----------|
| any 类型数 | 53 | < 10 | grep 统计 |
| 测试文件数 | 28 | 40+ | ls 统计 |
| TODO 数量 | 16 | < 5 | grep 统计 |
| console.log | 35 | 0 | grep 统计 |

---

## 6. 资源需求

### 6.1 人员

- **1 名高级后端工程师** (全职，4 周)
- **0.5 名前端工程师** (Week 2-3，测试编写)
- **1 名技术负责人** (每周 2 小时，Review)

### 6.2 工具

- TypeScript 编译器
- Vitest (测试)
- ESLint (代码检查)
- k6 或 Artillery (性能测试)

---

## 7. 监控与度量

### 7.1 每周检查点

**Week 1 结束**:
- P0 任务全部完成
- TypeScript 编译无错误

**Week 2 结束**:
- Agent 基类提取完成
- 新增 10+ 测试文件

**Week 3 结束**:
- 性能测试通过
- TODO 清理完成

**Week 4 结束**:
- 所有验收标准达成
- 文档更新完成

### 7.2 质量门禁

```bash
# 每次提交前运行
npm run typecheck  # TypeScript 检查
npm run lint       # ESLint 检查
npm test           # 单元测试
```

---

## 附录

### A. 参考文档

- [代码审查报告](./2026-03-24-code-review-report.md)
- [重构指导原则](../../REFACTOR.md)
- [TypeScript 严格模式配置](https://www.typescriptlang.org/tsconfig#strict)

### B. 相关命令

```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 运行测试
npm test

# 生成覆盖率报告
npm run test:coverage

# 构建验证
npm run build
```

### C. 联系信息

- 技术负责人: [待填写]
- 项目负责人: [待填写]

---

**计划制定**: Claude Code
**日期**: 2026-03-24
**版本**: 1.0
