/**
 * DependencyGraphService - AI-Native DevOps Platform
 * Generates visualization data for asset dependency graphs
 *
 * V1.5: Visualization dependency graph API
 */

import { db } from '../db/connection';
import { Asset, Dependency } from '../types/asset';

// Graph node types
export interface GraphNode {
  id: string;
  type: string;
  name: string;
  slug: string;
  state: string;
  version: string;
  depth: number;
  x?: number;
  y?: number;
  metadata?: {
    isRoot: boolean;
    isLeaf: boolean;
    hasDirtyUpstream: boolean;
    impactLevel?: 'high' | 'medium' | 'low' | 'none';
  };
}

// Graph edge types
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceVersion: string;
  targetVersion: string;
  confirmed: boolean;
  isCyclic?: boolean;
}

// Graph data structure
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootId: string;
  maxDepth: number;
  cyclic: boolean;
  stats: {
    totalNodes: number;
    totalEdges: number;
    leafNodes: number;
    dirtyNodes: number;
    byType: Record<string, number>;
    byState: Record<string, number>;
  };
}

// Layout algorithms
export type LayoutAlgorithm = 'hierarchical' | 'force' | 'circular' | 'dagre';

export interface GraphOptions {
  direction?: 'upstream' | 'downstream' | 'both';
  maxDepth?: number;
  layout?: LayoutAlgorithm;
  includeVersions?: boolean;
  filterTypes?: string[];
  filterStates?: string[];
}

export class DependencyGraphService {
  /**
   * Build complete dependency graph for an asset
   */
  async buildGraph(assetId: string, options: GraphOptions = {}): Promise<GraphData> {
    const {
      direction = 'both',
      maxDepth = 10,
      includeVersions = false,
      filterTypes,
      filterStates,
    } = options;

    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const visited = new Set<string>();
    const cyclicEdges: string[] = [];

    // Get root asset
    const rootAsset = await this.getAssetWithMetadata(assetId);
    if (!rootAsset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // BFS traversal
    const queue: Array<{ assetId: string; depth: number; path: string[] }> = [
      { assetId, depth: 0, path: [assetId] },
    ];

    while (queue.length > 0) {
      const { assetId: currentId, depth, path } = queue.shift()!;

      if (depth > maxDepth) continue;
      if (visited.has(currentId)) {
        // Check for cycle
        const cycleStart = path.indexOf(currentId);
        if (cycleStart !== -1) {
          const cyclePath = path.slice(cycleStart);
          cyclicEdges.push(cyclePath.join('->'));
        }
        continue;
      }

      visited.add(currentId);

      const asset = currentId === assetId ? rootAsset : await this.getAssetWithMetadata(currentId);
      if (!asset) continue;

      // Apply filters
      if (filterTypes && !filterTypes.includes(asset.type)) continue;
      if (filterStates && !filterStates.includes(asset.state)) continue;

      // Add node
      nodes.set(currentId, this.createGraphNode(asset, depth, currentId === assetId));

      // Get dependencies based on direction
      if (direction === 'downstream' || direction === 'both') {
        const downstream = await this.getDownstreamDependencies(currentId, includeVersions);
        for (const dep of downstream) {
          edges.push(this.createGraphEdge(dep));
          if (!visited.has(dep.source_asset_id)) {
            queue.push({
              assetId: dep.source_asset_id,
              depth: depth + 1,
              path: [...path, dep.source_asset_id],
            });
          }
        }
      }

      if (direction === 'upstream' || direction === 'both') {
        const upstream = await this.getUpstreamDependencies(currentId, includeVersions);
        for (const dep of upstream) {
          edges.push(this.createGraphEdge(dep));
          if (!visited.has(dep.target_asset_id)) {
            queue.push({
              assetId: dep.target_asset_id,
              depth: depth + 1,
              path: [...path, dep.target_asset_id],
            });
          }
        }
      }
    }

    // Calculate metadata
    const nodeList = Array.from(nodes.values());
    const maxDepthFound = nodeList.reduce((max, n) => Math.max(max, n.depth), 0);

    // Mark leaf nodes
    const hasOutgoing = new Set(edges.map((e) => e.source));
    nodeList.forEach((node) => {
      node.metadata = {
        ...node.metadata,
        isLeaf: !hasOutgoing.has(node.id),
        isRoot: node.id === assetId,
      };
    });

    // Check dirty upstream status
    const dirtyUpstreams = await this.getDirtyUpstreams(nodeList.map((n) => n.id));
    for (const node of nodeList) {
      node.metadata!.hasDirtyUpstream = dirtyUpstreams.includes(node.id);
    }

    // Calculate stats
    const stats = this.calculateStats(nodeList, edges);

    const graph: GraphData = {
      nodes: nodeList,
      edges,
      rootId: assetId,
      maxDepth: maxDepthFound,
      cyclic: cyclicEdges.length > 0,
      stats,
    };

    // Apply layout if specified
    if (options.layout) {
      this.applyLayout(graph, options.layout);
    }

    return graph;
  }

  /**
   * Get graph in Cytoscape.js format (for frontend visualization)
   */
  async buildCytoscapeGraph(assetId: string, options: GraphOptions = {}): Promise<{
    elements: Array<
      | { data: { id: string; parent?: string } & Record<string, any> }
      | { data: { id: string; source: string; target: string } & Record<string, any> }
    >;
    style: Array<Record<string, any>>;
    layout: Record<string, any>;
  }> {
    const graph = await this.buildGraph(assetId, options);

    const elements: Array<
      | { data: { id: string; parent?: string } & Record<string, any> }
      | { data: { id: string; source: string; target: string } & Record<string, any> }
    > = [];

    // Add nodes
    for (const node of graph.nodes) {
      elements.push({
        data: {
          id: node.id,
          label: node.name,
          type: node.type,
          state: node.state,
          version: node.version,
          depth: node.depth,
          isRoot: node.metadata?.isRoot,
          isLeaf: node.metadata?.isLeaf,
          hasDirtyUpstream: node.metadata?.hasDirtyUpstream,
        },
      });
    }

    // Add edges
    for (const edge of graph.edges) {
      elements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          confirmed: edge.confirmed,
          isCyclic: edge.isCyclic,
          label: `${edge.sourceVersion} → ${edge.targetVersion}`,
        },
      });
    }

    // Default Cytoscape style
    const style = [
      {
        selector: 'node',
        style: {
          'background-color': '#666',
          'label': 'data(label)',
          'width': 40,
          'height': 40,
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '12px',
        },
      },
      {
        selector: 'node[isRoot = true]',
        style: {
          'background-color': '#3498db',
          'border-width': 3,
          'border-color': '#2980b9',
        },
      },
      {
        selector: 'node[state = "dirty"]',
        style: {
          'background-color': '#e74c3c',
        },
      },
      {
        selector: 'node[state = "clean"]',
        style: {
          'background-color': '#27ae60',
        },
      },
      {
        selector: 'node[hasDirtyUpstream = true]',
        style: {
          'border-width': 2,
          'border-color': '#e74c3c',
          'border-style': 'dashed',
        },
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#95a5a6',
          'target-arrow-color': '#95a5a6',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
        },
      },
      {
        selector: 'edge[confirmed = false]',
        style: {
          'line-style': 'dashed',
          'line-color': '#bdc3c7',
        },
      },
      {
        selector: 'edge[isCyclic = true]',
        style: {
          'line-color': '#e74c3c',
          'target-arrow-color': '#e74c3c',
        },
      },
    ];

    // Layout configuration
    const layoutConfig: Record<string, any> = {
      name: options.layout === 'hierarchical' ? 'dagre' : options.layout || 'dagre',
      padding: 10,
      fit: true,
      animate: true,
      animationDuration: 500,
    };

    if (options.layout === 'hierarchical' || !options.layout) {
      layoutConfig.rankDir = 'TB';
      layoutConfig.nodeSep = 50;
      layoutConfig.edgeSep = 10;
      layoutConfig.rankSep = 100;
    }

    return {
      elements,
      style,
      layout: layoutConfig,
    };
  }

  /**
   * Get graph in Mermaid format (for Markdown documentation)
   */
  async buildMermaidGraph(assetId: string, options: GraphOptions = {}): Promise<string> {
    const graph = await this.buildGraph(assetId, { ...options, layout: undefined });

    const lines: string[] = ['graph TD'];

    // Add nodes with styling
    for (const node of graph.nodes) {
      let style = '';
      if (node.metadata?.isRoot) {
        style = ':::root';
      } else if (node.state === 'dirty') {
        style = ':::dirty';
      } else if (node.state === 'clean') {
        style = ':::clean';
      }

      lines.push(`  ${node.id}["${node.name}"]${style}`);
    }

    // Add edges
    for (const edge of graph.edges) {
      const lineStyle = edge.confirmed ? '-->' : '-.->';
      lines.push(`  ${edge.source} ${lineStyle} ${edge.target}`);
    }

    // Add class definitions
    lines.push('  classDef root fill:#3498db,stroke:#2980b9,stroke-width:3px');
    lines.push('  classDef dirty fill:#e74c3c,stroke:#c0392b');
    lines.push('  classDef clean fill:#27ae60,stroke:#1e8449');

    return lines.join('\n');
  }

  /**
   * Get graph in DOT format (for Graphviz)
   */
  async buildDotGraph(assetId: string, options: GraphOptions = {}): Promise<string> {
    const graph = await this.buildGraph(assetId, { ...options, layout: undefined });

    const lines: string[] = ['digraph DependencyGraph {'];
    lines.push('  rankdir=TB;');
    lines.push('  node [shape=box, style=rounded];');

    // Add nodes
    for (const node of graph.nodes) {
      let color = '#666666';
      if (node.metadata?.isRoot) color = '#3498db';
      else if (node.state === 'dirty') color = '#e74c3c';
      else if (node.state === 'clean') color = '#27ae60';

      lines.push(`  "${node.id}" [label="${node.name}", fillcolor="${color}", style=filled, fontcolor=white];`);
    }

    // Add edges
    for (const edge of graph.edges) {
      const style = edge.confirmed ? '' : ' [style=dashed]';
      lines.push(`  "${edge.source}" -> "${edge.target}"${style};`);
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Get impact analysis for an asset change
   */
  async analyzeImpact(assetId: string, version?: string): Promise<{
    affectedAssets: Array<{
      assetId: string;
      name: string;
      depth: number;
      impactLevel: 'high' | 'medium' | 'low';
      paths: string[][];
    }>;
    summary: {
      totalAffected: number;
      byDepth: Record<number, number>;
      byImpactLevel: Record<string, number>;
      criticalPaths: string[][];
    };
  }> {
    const graph = await this.buildGraph(assetId, {
      direction: 'downstream',
      maxDepth: 20,
      includeVersions: !!version,
    });

    const affectedAssets: Array<{
      assetId: string;
      name: string;
      depth: number;
      impactLevel: 'high' | 'medium' | 'low';
      paths: string[][];
    }> = [];

    // Find all paths from root to each node
    const paths = this.findAllPaths(graph, assetId);

    for (const node of graph.nodes) {
      if (node.id === assetId) continue;

      const nodePaths = paths.filter((p) => p[p.length - 1] === node.id);
      const shortestPath = nodePaths.reduce((min, p) => (p.length < min.length ? p : min), nodePaths[0] || []);
      const depth = shortestPath.length - 1;

      // Calculate impact level based on depth and dependencies
      let impactLevel: 'high' | 'medium' | 'low' = 'low';
      if (depth === 1) impactLevel = 'high';
      else if (depth <= 3) impactLevel = 'medium';

      affectedAssets.push({
        assetId: node.id,
        name: node.name,
        depth,
        impactLevel,
        paths: nodePaths.slice(0, 3), // Limit to first 3 paths
      });
    }

    // Sort by depth and impact
    affectedAssets.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      if (a.depth !== b.depth) return a.depth - b.depth;
      return impactOrder[a.impactLevel] - impactOrder[b.impactLevel];
    });

    // Calculate summary
    const byDepth: Record<number, number> = {};
    const byImpactLevel: Record<string, number> = { high: 0, medium: 0, low: 0 };

    for (const asset of affectedAssets) {
      byDepth[asset.depth] = (byDepth[asset.depth] || 0) + 1;
      byImpactLevel[asset.impactLevel]++;
    }

    // Find critical paths (paths to high-impact assets)
    const criticalPaths = affectedAssets
      .filter((a) => a.impactLevel === 'high')
      .flatMap((a) => a.paths);

    return {
      affectedAssets,
      summary: {
        totalAffected: affectedAssets.length,
        byDepth,
        byImpactLevel,
        criticalPaths: criticalPaths.slice(0, 5),
      },
    };
  }

  // ==================== Private Helpers ====================

  private async getAssetWithMetadata(assetId: string): Promise<Asset | null> {
    const asset = await db('assets').where({ id: assetId }).whereNull('deleted_at').first();
    return asset || null;
  }

  private async getDownstreamDependencies(assetId: string, includeVersions: boolean): Promise<Dependency[]> {
    let query = db('dependencies').where({ target_asset_id: assetId });

    if (!includeVersions) {
      // Get only latest version dependencies
      query = query.whereRaw('target_version = (SELECT current_version FROM assets WHERE id = ?)', [assetId]);
    }

    return await query;
  }

  private async getUpstreamDependencies(assetId: string, includeVersions: boolean): Promise<Dependency[]> {
    let query = db('dependencies').where({ source_asset_id: assetId });

    if (!includeVersions) {
      query = query.whereRaw('source_version = (SELECT current_version FROM assets WHERE id = ?)', [assetId]);
    }

    return await query;
  }

  private createGraphNode(asset: Asset, depth: number, isRoot: boolean): GraphNode {
    return {
      id: asset.id,
      type: asset.type,
      name: asset.name,
      slug: asset.slug,
      state: asset.state,
      version: asset.current_version || '',
      depth,
      metadata: {
        isRoot,
        isLeaf: false,
        hasDirtyUpstream: false,
      },
    };
  }

  private createGraphEdge(dep: Dependency): GraphEdge {
    return {
      id: `${dep.source_asset_id}-${dep.target_asset_id}`,
      source: dep.target_asset_id, // Edge direction: target -> source (upstream to downstream)
      target: dep.source_asset_id,
      sourceVersion: dep.target_version,
      targetVersion: dep.source_version,
      confirmed: dep.confirmed_at !== null,
    };
  }

  private async getDirtyUpstreams(assetIds: string[]): Promise<string[]> {
    const result = await db('dirty_sources')
      .whereIn('asset_id', assetIds)
      .whereIn('status', ['pending', 'acknowledged'])
      .distinct('asset_id');

    return result.map((r) => r.asset_id);
  }

  private calculateStats(nodes: GraphNode[], edges: GraphEdge[]) {
    const byType: Record<string, number> = {};
    const byState: Record<string, number> = {};
    let dirtyNodes = 0;
    let leafNodes = 0;

    for (const node of nodes) {
      byType[node.type] = (byType[node.type] || 0) + 1;
      byState[node.state] = (byState[node.state] || 0) + 1;
      if (node.state === 'dirty') dirtyNodes++;
      if (node.metadata?.isLeaf) leafNodes++;
    }

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      leafNodes,
      dirtyNodes,
      byType,
      byState,
    };
  }

  private applyLayout(graph: GraphData, layout: LayoutAlgorithm): void {
    switch (layout) {
      case 'hierarchical':
        this.applyHierarchicalLayout(graph);
        break;
      case 'circular':
        this.applyCircularLayout(graph);
        break;
      case 'force':
        // Force layout requires iterative calculation, skip for now
        this.applyHierarchicalLayout(graph);
        break;
      default:
        this.applyHierarchicalLayout(graph);
    }
  }

  private applyHierarchicalLayout(graph: GraphData): void {
    const levelWidth = 200;
    const nodeHeight = 80;

    // Group nodes by depth
    const nodesByDepth: Map<number, GraphNode[]> = new Map();
    for (const node of graph.nodes) {
      const depth = node.depth;
      if (!nodesByDepth.has(depth)) {
        nodesByDepth.set(depth, []);
      }
      nodesByDepth.get(depth)!.push(node);
    }

    // Position nodes
    for (const [depth, nodes] of nodesByDepth) {
      const totalHeight = nodes.length * nodeHeight;
      const startY = -totalHeight / 2;

      nodes.forEach((node, index) => {
        node.x = depth * levelWidth;
        node.y = startY + index * nodeHeight + nodeHeight / 2;
      });
    }
  }

  private applyCircularLayout(graph: GraphData): void {
    const radius = 200 + graph.nodes.length * 20;
    const rootNode = graph.nodes.find((n) => n.metadata?.isRoot);

    if (rootNode) {
      rootNode.x = 0;
      rootNode.y = 0;
    }

    const nonRootNodes = graph.nodes.filter((n) => !n.metadata?.isRoot);
    const angleStep = (2 * Math.PI) / nonRootNodes.length;

    nonRootNodes.forEach((node, index) => {
      const angle = index * angleStep;
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
    });
  }

  private findAllPaths(graph: GraphData, fromId: string): string[][] {
    const paths: string[][] = [];
    const adjacency: Map<string, string[]> = new Map();

    // Build adjacency list (downstream direction)
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.source)) {
        adjacency.set(edge.source, []);
      }
      adjacency.get(edge.source)!.push(edge.target);
    }

    // DFS to find all paths
    const dfs = (current: string, path: string[]) => {
      path.push(current);

      const neighbors = adjacency.get(current) || [];
      if (neighbors.length === 0) {
        paths.push([...path]);
      } else {
        for (const neighbor of neighbors) {
          if (!path.includes(neighbor)) {
            dfs(neighbor, [...path]);
          }
        }
      }
    };

    dfs(fromId, []);
    return paths;
  }
}

// Export singleton instance
export const dependencyGraphService = new DependencyGraphService();
