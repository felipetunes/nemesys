import { describe, expect, it } from 'vitest'

import { createFlowId, createStarterFlow } from './flowFactory'

describe('flow factory', () => {
  it('creates stable URL-safe identifiers', () => {
    expect(createFlowId('Atendimento São Paulo', 'abc123')).toBe('atendimento-sao-paulo-abc123')
  })

  it('creates a valid starter graph with one terminal path', () => {
    const flow = createStarterFlow('support-1', 'Suporte', 'Fluxo inicial', {
      startLabel: 'Início',
      endLabel: 'Fim',
      endMessage: 'Até logo!',
    })

    expect(flow.nodes.map(node => node.type)).toEqual(['start', 'end'])
    expect(flow.nodes[0].x).toBe(flow.nodes[1].x)
    expect(flow.nodes[0].y).toBeLessThan(flow.nodes[1].y)
    expect(flow.edges).toEqual([{ id: 'start-to-end', source: 'start', target: 'end', condition: null, label: null }])
  })
})
