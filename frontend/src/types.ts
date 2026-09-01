export type NodeKind = 'start' | 'prompt' | 'collect_input' | 'ai_intent' | 'decision' | 'set_variable' | 'queue' | 'end'

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
  status: 'running' | 'waiting_input' | 'queued' | 'completed' | 'failed'
  current_node_id?: string | null
  variables: Record<string, unknown>
  trace: TraceEvent[]
  pending_input_variable?: string | null
  pending_input_prompt?: string | null
  last_prompt?: string | null
  queue_name?: string | null
  queued_at?: string | null
  assigned_agent?: string | null
}

export interface MetricsSummary {
  total_sessions: number
  sessions_last_24h: number
  status_counts: Record<string, number>
  intent_counts: Record<string, number>
  channel_counts: Record<string, number>
  completion_rate: number
  average_duration_seconds: number
}

export interface WorkspaceInfo {
  id: string
  name: string
  role: 'viewer' | 'editor' | 'admin' | 'owner'
}

export interface AuthTokenResponse {
  token: string
  expires_at: string
  user_id: string
  email: string
  workspaces: WorkspaceInfo[]
}
