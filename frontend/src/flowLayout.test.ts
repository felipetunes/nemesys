import { describe, expect, it } from 'vitest'
import { layoutFlowVertically } from './flowLayout'
import type { FlowEdge, FlowNode } from './types'

describe('vertical flow layout', () => {
  it('places connected steps from top to bottom and branches side by side', () => {
    const nodes: FlowNode[] = [
      { id: 'start', type: 'start', label: 'Start', x: 0, y: 0, config: {} },
      { id: 'decision', type: 'decision', label: 'Decision', x: 200, y: 0, config: { variable: 'route' } },
      { id: 'sales', type: 'queue', label: 'Sales', x: 400, y: 0, config: { queue_name: 'sales', message: 'Wait' } },
      { id: 'support', type: 'queue', label: 'Support', x: 400, y: 100, config: { queue_name: 'support', message: 'Wait' } },
      { id: 'end', type: 'end', label: 'End', x: 600, y: 0, config: { message: 'Bye' } },
    ]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 'start', target: 'decision' },
      { id: 'e2', source: 'decision', target: 'sales' },
      { id: 'e3', source: 'decision', target: 'support' },
      { id: 'e4', source: 'sales', target: 'end' },
      { id: 'e5', source: 'support', target: 'end' },
    ]

    const result = layoutFlowVertically(nodes, edges)
    const positions = Object.fromEntries(result.map(node => [node.id, node]))

    expect(positions.start.y).toBeLessThan(positions.decision.y)
    expect(positions.decision.y).toBeLessThan(positions.sales.y)
    expect(positions.sales.y).toBe(positions.support.y)
    expect(positions.sales.x).toBeLessThan(positions.support.x)
    expect(positions.support.y).toBeLessThan(positions.end.y)
  })

  it('keeps every node visible even when malformed input contains a cycle', () => {
    const nodes: FlowNode[] = [
      { id: 'a', type: 'prompt', label: 'A', x: 0, y: 0, config: { message: 'A' } },
      { id: 'b', type: 'prompt', label: 'B', x: 0, y: 0, config: { message: 'B' } },
    ]
    const edges: FlowEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
    ]

    expect(layoutFlowVertically(nodes, edges).map(node => node.id)).toEqual(['a', 'b'])
  })
})
