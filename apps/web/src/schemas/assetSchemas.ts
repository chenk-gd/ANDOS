// Asset Schema Definitions - JSON Schema for structured editing
import type { SchemaField } from '@/components/StructuredEditor.vue'
import type { AssetType } from '@/types/asset'

// 需求资产 Schema
export const requirementSchema: SchemaField[] = [
  {
    key: 'title',
    label: '需求标题',
    type: 'string',
    required: true,
    placeholder: '简洁明了地描述需求',
    maxLength: 100
  },
  {
    key: 'description',
    label: '需求描述',
    type: 'textarea',
    required: true,
    placeholder: '详细描述需求背景、目标和范围...',
    rows: 6
  },
  {
    key: 'priority',
    label: '优先级',
    type: 'select',
    required: true,
    options: [
      { label: 'P0 - 紧急', value: 'p0' },
      { label: 'P1 - 高', value: 'p1' },
      { label: 'P2 - 中', value: 'p2' },
      { label: 'P3 - 低', value: 'p3' }
    ]
  },
  {
    key: 'status',
    label: '状态',
    type: 'select',
    required: true,
    options: [
      { label: '草稿', value: 'draft' },
      { label: '评审中', value: 'reviewing' },
      { label: '已批准', value: 'approved' },
      { label: '已实现', value: 'implemented' },
      { label: '已验收', value: 'accepted' },
      { label: '已关闭', value: 'closed' }
    ]
  },
  {
    key: 'acceptanceCriteria',
    label: '验收标准',
    type: 'array',
    itemType: 'string',
    itemLabel: '标准',
    placeholder: '定义明确的验收标准...'
  },
  {
    key: 'stakeholders',
    label: '相关方',
    type: 'array',
    itemType: 'object',
    itemLabel: '相关方',
    items: [
      { key: 'name', label: '姓名', type: 'string', required: true },
      { key: 'role', label: '角色', type: 'string', required: true },
      { key: 'email', label: '邮箱', type: 'string', placeholder: 'example@email.com' }
    ]
  },
  {
    key: 'dueDate',
    label: '截止日期',
    type: 'date',
    placeholder: '选择截止日期'
  },
  {
    key: 'estimatedEffort',
    label: '预估工作量（人天）',
    type: 'number',
    min: 0,
    step: 0.5,
    precision: 1
  },
  {
    key: 'tags',
    label: '标签',
    type: 'select',
    multiple: true,
    clearable: true,
    options: [
      { label: '前端', value: 'frontend' },
      { label: '后端', value: 'backend' },
      { label: '数据库', value: 'database' },
      { label: 'API', value: 'api' },
      { label: 'UI/UX', value: 'uiux' },
      { label: '性能', value: 'performance' },
      { label: '安全', value: 'security' },
      { label: '测试', value: 'testing' }
    ]
  },
  {
    key: 'notes',
    label: '备注',
    type: 'textarea',
    placeholder: '其他备注信息...',
    rows: 3
  }
]

// 设计资产 Schema
export const designSchema: SchemaField[] = [
  {
    key: 'title',
    label: '设计标题',
    type: 'string',
    required: true,
    placeholder: '设计的名称',
    maxLength: 100
  },
  {
    key: 'designType',
    label: '设计类型',
    type: 'select',
    required: true,
    options: [
      { label: '架构设计', value: 'architecture' },
      { label: 'API设计', value: 'api' },
      { label: '数据库设计', value: 'database' },
      { label: 'UI设计', value: 'ui' },
      { label: '流程设计', value: 'flow' },
      { label: '算法设计', value: 'algorithm' }
    ]
  },
  {
    key: 'overview',
    label: '设计概述',
    type: 'textarea',
    required: true,
    placeholder: '描述设计的目标、范围和主要决策...',
    rows: 5
  },
  {
    key: 'components',
    label: '组件列表',
    type: 'array',
    itemType: 'object',
    itemLabel: '组件',
    items: [
      { key: 'name', label: '组件名称', type: 'string', required: true },
      { key: 'type', label: '类型', type: 'select', options: [
        { label: '模块', value: 'module' },
        { label: '服务', value: 'service' },
        { label: '接口', value: 'interface' },
        { label: '类', value: 'class' },
        { label: '函数', value: 'function' }
      ]},
      { key: 'description', label: '描述', type: 'textarea', rows: 2 },
      { key: 'responsibilities', label: '职责', type: 'textarea', rows: 2, placeholder: '该组件的主要职责...' }
    ]
  },
  {
    key: 'interfaces',
    label: '接口定义',
    type: 'array',
    itemType: 'object',
    itemLabel: '接口',
    items: [
      { key: 'name', label: '接口名称', type: 'string', required: true },
      { key: 'method', label: '方法', type: 'select', options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'DELETE', value: 'DELETE' },
        { label: 'PATCH', value: 'PATCH' }
      ]},
      { key: 'path', label: '路径', type: 'string', placeholder: '/api/v1/resource' },
      { key: 'description', label: '描述', type: 'textarea', rows: 2 },
      { key: 'parameters', label: '参数', type: 'textarea', rows: 2, placeholder: 'JSON格式参数定义' }
    ]
  },
  {
    key: 'dataModels',
    label: '数据模型',
    type: 'array',
    itemType: 'object',
    itemLabel: '模型',
    items: [
      { key: 'name', label: '模型名称', type: 'string', required: true },
      { key: 'fields', label: '字段定义', type: 'textarea', rows: 3, placeholder: '字段名: 类型 - 描述' }
    ]
  },
  {
    key: 'decisions',
    label: '设计决策',
    type: 'array',
    itemType: 'object',
    itemLabel: '决策',
    items: [
      { key: 'title', label: '决策标题', type: 'string', required: true },
      { key: 'context', label: '背景', type: 'textarea', rows: 2 },
      { key: 'decision', label: '决策', type: 'textarea', rows: 2 },
      { key: 'consequences', label: '影响', type: 'textarea', rows: 2 }
    ]
  },
  {
    key: 'status',
    label: '状态',
    type: 'select',
    required: true,
    options: [
      { label: '草稿', value: 'draft' },
      { label: '评审中', value: 'reviewing' },
      { label: '已批准', value: 'approved' },
      { label: '已实现', value: 'implemented' },
      { label: '已废弃', value: 'deprecated' }
    ]
  }
]

// 任务资产 Schema
export const taskSchema: SchemaField[] = [
  {
    key: 'title',
    label: '任务标题',
    type: 'string',
    required: true,
    placeholder: '任务的简短描述',
    maxLength: 100
  },
  {
    key: 'description',
    label: '任务描述',
    type: 'textarea',
    required: true,
    placeholder: '详细描述任务内容...',
    rows: 4
  },
  {
    key: 'taskType',
    label: '任务类型',
    type: 'select',
    required: true,
    options: [
      { label: '功能开发', value: 'feature' },
      { label: 'Bug修复', value: 'bugfix' },
      { label: '重构', value: 'refactor' },
      { label: '测试', value: 'test' },
      { label: '文档', value: 'documentation' },
      { label: '配置', value: 'config' },
      { label: '其他', value: 'other' }
    ]
  },
  {
    key: 'priority',
    label: '优先级',
    type: 'select',
    required: true,
    options: [
      { label: '紧急', value: 'urgent' },
      { label: '高', value: 'high' },
      { label: '中', value: 'medium' },
      { label: '低', value: 'low' }
    ]
  },
  {
    key: 'status',
    label: '状态',
    type: 'select',
    required: true,
    options: [
      { label: '待办', value: 'todo' },
      { label: '进行中', value: 'in-progress' },
      { label: '评审中', value: 'review' },
      { label: '已完成', value: 'done' },
      { label: '已取消', value: 'cancelled' }
    ]
  },
  {
    key: 'assignee',
    label: '负责人',
    type: 'string',
    placeholder: '@用户名'
  },
  {
    key: 'estimatedHours',
    label: '预估工时（小时）',
    type: 'number',
    min: 0,
    step: 0.5,
    precision: 1
  },
  {
    key: 'actualHours',
    label: '实际工时（小时）',
    type: 'number',
    min: 0,
    step: 0.5,
    precision: 1
  },
  {
    key: 'startDate',
    label: '开始日期',
    type: 'date'
  },
  {
    key: 'dueDate',
    label: '截止日期',
    type: 'date'
  },
  {
    key: 'checklist',
    label: '检查项',
    type: 'array',
    itemType: 'object',
    itemLabel: '检查项',
    items: [
      { key: 'title', label: '标题', type: 'string', required: true },
      { key: 'completed', label: '已完成', type: 'switch' }
    ]
  },
  {
    key: 'labels',
    label: '标签',
    type: 'select',
    multiple: true,
    clearable: true,
    options: [
      { label: '前端', value: 'frontend' },
      { label: '后端', value: 'backend' },
      { label: '数据库', value: 'database' },
      { label: 'API', value: 'api' },
      { label: 'UI', value: 'ui' },
      { label: '性能', value: 'performance' }
    ]
  },
  {
    key: 'notes',
    label: '备注',
    type: 'textarea',
    rows: 3
  }
]

// 代码资产 Schema（简化版，主要用于配置）
export const codeSchema: SchemaField[] = [
  {
    key: 'language',
    label: '编程语言',
    type: 'select',
    options: [
      { label: 'TypeScript', value: 'typescript' },
      { label: 'JavaScript', value: 'javascript' },
      { label: 'Python', value: 'python' },
      { label: 'Java', value: 'java' },
      { label: 'Go', value: 'go' },
      { label: 'Rust', value: 'rust' },
      { label: 'C/C++', value: 'cpp' },
      { label: 'C#', value: 'csharp' },
      { label: '其他', value: 'other' }
    ]
  },
  {
    key: 'framework',
    label: '框架/库',
    type: 'string',
    placeholder: '例如: Vue 3, React, Fastify'
  },
  {
    key: 'description',
    label: '功能描述',
    type: 'textarea',
    rows: 3
  },
  {
    key: 'inputs',
    label: '输入参数',
    type: 'array',
    itemType: 'object',
    itemLabel: '参数',
    items: [
      { key: 'name', label: '参数名', type: 'string', required: true },
      { key: 'type', label: '类型', type: 'string' },
      { key: 'required', label: '必填', type: 'switch' },
      { key: 'description', label: '描述', type: 'string' }
    ]
  },
  {
    key: 'outputs',
    label: '返回值',
    type: 'array',
    itemType: 'object',
    itemLabel: '返回值',
    items: [
      { key: 'type', label: '类型', type: 'string', required: true },
      { key: 'description', label: '描述', type: 'string' }
    ]
  }
]

// 测试资产 Schema
export const testSchema: SchemaField[] = [
  {
    key: 'testType',
    label: '测试类型',
    type: 'select',
    required: true,
    options: [
      { label: '单元测试', value: 'unit' },
      { label: '集成测试', value: 'integration' },
      { label: 'E2E测试', value: 'e2e' },
      { label: '性能测试', value: 'performance' },
      { label: '安全测试', value: 'security' }
    ]
  },
  {
    key: 'description',
    label: '测试描述',
    type: 'textarea',
    required: true,
    rows: 3
  },
  {
    key: 'preconditions',
    label: '前置条件',
    type: 'array',
    itemType: 'string',
    itemLabel: '条件'
  },
  {
    key: 'steps',
    label: '测试步骤',
    type: 'array',
    itemType: 'object',
    itemLabel: '步骤',
    items: [
      { key: 'action', label: '操作', type: 'string', required: true },
      { key: 'expected', label: '预期结果', type: 'string', required: true }
    ]
  },
  {
    key: 'testData',
    label: '测试数据',
    type: 'textarea',
    rows: 3
  },
  {
    key: 'automated',
    label: '是否自动化',
    type: 'switch'
  }
]

// 流水线资产 Schema
export const pipelineSchema: SchemaField[] = [
  {
    key: 'pipelineType',
    label: '流水线类型',
    type: 'select',
    required: true,
    options: [
      { label: 'CI构建', value: 'ci' },
      { label: 'CD部署', value: 'cd' },
      { label: '测试', value: 'test' },
      { label: '发布', value: 'release' }
    ]
  },
  {
    key: 'description',
    label: '描述',
    type: 'textarea',
    rows: 3
  },
  {
    key: 'trigger',
    label: '触发条件',
    type: 'select',
    options: [
      { label: '代码提交', value: 'push' },
      { label: '定时触发', value: 'schedule' },
      { label: '手动触发', value: 'manual' },
      { label: 'Webhook', value: 'webhook' }
    ]
  },
  {
    key: 'stages',
    label: '阶段配置',
    type: 'array',
    itemType: 'object',
    itemLabel: '阶段',
    items: [
      { key: 'name', label: '阶段名称', type: 'string', required: true },
      { key: 'steps', label: '步骤', type: 'textarea', rows: 2, placeholder: '每行一个步骤' },
      { key: 'parallel', label: '并行执行', type: 'switch' }
    ]
  },
  {
    key: 'environment',
    label: '环境变量',
    type: 'textarea',
    rows: 3,
    placeholder: 'KEY=value\n每行一个环境变量'
  }
]

// 获取资产类型的Schema
export function getAssetSchema(type: AssetType): SchemaField[] {
  switch (type) {
    case 'requirement':
      return requirementSchema
    case 'design':
      return designSchema
    case 'task':
      return taskSchema
    case 'code':
      return codeSchema
    case 'test':
      return testSchema
    case 'pipeline':
      return pipelineSchema
    default:
      return []
  }
}

// 获取默认内容
export function getDefaultContent(type: AssetType): Record<string, any> {
  const schema = getAssetSchema(type)
  const defaults: Record<string, any> = {}

  schema.forEach((field) => {
    switch (field.type) {
      case 'string':
      case 'textarea':
        defaults[field.key] = ''
        break
      case 'number':
        defaults[field.key] = 0
        break
      case 'select':
        defaults[field.key] = field.multiple ? [] : (field.options?.[0]?.value || null)
        break
      case 'radio':
        defaults[field.key] = field.options?.[0]?.value || null
        break
      case 'switch':
        defaults[field.key] = false
        break
      case 'date':
        defaults[field.key] = null
        break
      case 'array':
        defaults[field.key] = []
        break
      case 'object':
        defaults[field.key] = {}
        break
      default:
        defaults[field.key] = ''
    }
  })

  return defaults
}
