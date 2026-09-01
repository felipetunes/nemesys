import { describe, expect, it } from 'vitest'
import { createStarterFlow } from './flowFactory'
import { summarizeFlowDiff } from './flowDiff'

const copy = { startLabel: 'Start', endLabel: 'End', endMessage: 'Done' }

describe('summarizeFlowDiff', () => {
  it('counts structural and metadata changes', () => {
    const before = createStarterFlow('support', 'Support', 'Original', copy)
    const after = {
      ...before,
      name: 'Priority support',
      nodes: [
        { ...before.nodes[0], label: 'Begin' },
        before.nodes[1],
        { id: 'prompt', type: 'prompt' as const, label: 'Welcome', x: 300, y: 100, config: { message: 'Hi' } },
      ],
      edges: [],
    }

    expect(summarizeFlowDiff(before, after)).toEqual({
      nodesAdded: 1,
      nodesRemoved: 0,
      nodesChanged: 1,
      edgesAdded: 0,
      edgesRemoved: 1,
      edgesChanged: 0,
      metadataChanged: true,
    })
  })
})
