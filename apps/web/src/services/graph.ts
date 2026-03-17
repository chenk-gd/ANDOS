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
