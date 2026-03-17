<template>
  <div ref="containerRef" class="dag-canvas" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import type { DependencyGraph } from '@/services/graph'
import { ASSET_STATE_COLORS } from '@/types/asset'

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

const style: any[] = [
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
