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
  id: string
  version: string
  content: string
  contentType: string
  createdBy: string
  createdAt: number
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
