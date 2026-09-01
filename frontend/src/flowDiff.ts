import type { FlowDefinition } from './types'

export interface FlowDiffSummary {
  nodesAdded: number
  nodesRemoved: number
  nodesChanged: number
  edgesAdded: number
  edgesRemoved: number
  edgesChanged: number
  metadataChanged: boolean
}

function countChanges<T extends { id: string }>(before: T[], after: T[]) {
  const beforeById = new Map(before.map(item => [item.id, item]))
  const afterById = new Map(after.map(item => [item.id, item]))
  let changed = 0

  for (const [id, item] of beforeById) {
    const next = afterById.get(id)
    if (next && JSON.stringify(item) !== JSON.stringify(next)) changed += 1
  }

  return {
    added: after.filter(item => !beforeById.has(item.id)).length,
    removed: before.filter(item => !afterById.has(item.id)).length,
    changed,
  }
}

export function summarizeFlowDiff(before: FlowDefinition, after: FlowDefinition): FlowDiffSummary {
  const nodes = countChanges(before.nodes, after.nodes)
  const edges = countChanges(before.edges, after.edges)
  return {
    nodesAdded: nodes.added,
    nodesRemoved: nodes.removed,
    nodesChanged: nodes.changed,
    edgesAdded: edges.added,
    edgesRemoved: edges.removed,
    edgesChanged: edges.changed,
    metadataChanged: before.name !== after.name || before.description !== after.description,
  }
}
