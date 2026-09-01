import type { FlowEdge, FlowNode } from './types'

const HORIZONTAL_GAP = 220
const VERTICAL_GAP = 140
const CENTER_X = 520
const START_Y = 70

export function layoutFlowVertically(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return []

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const outgoing = new Map(nodes.map(node => [node.id, [] as string[]]))
  const incomingCount = new Map(nodes.map(node => [node.id, 0]))

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue
    outgoing.get(edge.source)?.push(edge.target)
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
  }

  const roots = nodes
    .filter(node => node.type === 'start' || incomingCount.get(node.id) === 0)
    .sort((a, b) => Number(b.type === 'start') - Number(a.type === 'start') || a.y - b.y || a.x - b.x)
  const queue = roots.map(node => node.id)
  const depths = new Map(queue.map(id => [id, 0]))
  const remainingIncoming = new Map(incomingCount)

  while (queue.length > 0) {
    const source = queue.shift()!
    const nextDepth = (depths.get(source) ?? 0) + 1
    for (const target of outgoing.get(source) ?? []) {
      depths.set(target, Math.max(depths.get(target) ?? 0, nextDepth))
      const remaining = (remainingIncoming.get(target) ?? 1) - 1
      remainingIncoming.set(target, remaining)
      if (remaining === 0) queue.push(target)
    }
  }

  let fallbackDepth = Math.max(0, ...depths.values()) + 1
  for (const node of nodes) {
    if (!depths.has(node.id)) depths.set(node.id, fallbackDepth++)
  }

  const layers = new Map<number, FlowNode[]>()
  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0
    layers.set(depth, [...(layers.get(depth) ?? []), node])
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const [depth, layer] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    const ordered = [...layer].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
    const startX = CENTER_X - ((ordered.length - 1) * HORIZONTAL_GAP) / 2
    ordered.forEach((node, index) => positions.set(node.id, { x: startX + index * HORIZONTAL_GAP, y: START_Y + depth * VERTICAL_GAP }))
  }

  return nodes.map(node => ({ ...node, ...(positions.get(node.id) ?? {}) }))
}
