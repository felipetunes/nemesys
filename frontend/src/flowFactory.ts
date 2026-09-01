import type { FlowDefinition } from './types'

interface StarterFlowCopy {
  startLabel: string
  endLabel: string
  endMessage: string
}

export function createFlowId(name: string, suffix = crypto.randomUUID().slice(0, 8)): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${slug || 'ivr'}-${suffix}`
}

export function createStarterFlow(id: string, name: string, description: string, copy: StarterFlowCopy): FlowDefinition {
  return {
    id,
    name: name.trim(),
    description: description.trim(),
    nodes: [
      { id: 'start', type: 'start', label: copy.startLabel, x: 140, y: 220, config: {} },
      { id: 'end', type: 'end', label: copy.endLabel, x: 470, y: 220, config: { message: copy.endMessage } },
    ],
    edges: [{ id: 'start-to-end', source: 'start', target: 'end', condition: null, label: null }],
    version: null,
    published_at: null,
  }
}
