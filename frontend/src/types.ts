export type NodeKind = 'start' | 'prompt' | 'collect_input' | 'ai_intent' | 'decision' | 'set_variable' | 'end'

export interface FlowNode {
  id: string
  type: NodeKind
  label: string
  x: number
  y: number
  config: Record<string, unknown>
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  condition?: string | null
  label?: string | null
}

export interface FlowDefinition {
  id: string
  name: string
  description: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  version?: number | null
  published_at?: string | null
  updated_at?: string
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  code: string
  message: string
  node_id?: string | null
  edge_id?: string | null
}

export interface FlowValidationResult {
  valid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

export interface TraceEvent {
  seq: number
  timestamp: string
  type: string
  node_id?: string | null
  message: string
  data: Record<string, unknown>
}

export interface CallSession {
  id: string
  flow_id: string
  flow_version: number
  revision: number
  status: 'running' | 'waiting_input' | 'completed' | 'failed'
  current_node_id?: string | null
  variables: Record<string, unknown>
  trace: TraceEvent[]
  pending_input_variable?: string | null
  pending_input_prompt?: string | null
  last_prompt?: string | null
}
