export type NodeKind = 'start' | 'prompt' | 'collect_input' | 'ai_intent' | 'decision' | 'set_variable' | 'set_outcome' | 'queue' | 'end'

export type AgentPresence = 'offline' | 'available' | 'away' | 'busy' | 'on_queue'
export type AgentRoutingStatus = 'off_queue' | 'idle' | 'interacting' | 'not_responding'
export type WrapUpCode = 'resolved' | 'transferred' | 'callback_requested' | 'no_response' | 'other'
export type WorkspaceRole = 'viewer' | 'editor' | 'admin' | 'owner'

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
  archived_at?: string | null
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
  status: 'running' | 'waiting_input' | 'queued' | 'wrap_up' | 'completed' | 'failed'
  current_node_id?: string | null
  variables: Record<string, unknown>
  trace: TraceEvent[]
  pending_input_variable?: string | null
  pending_input_prompt?: string | null
  last_prompt?: string | null
  queue_name?: string | null
  queued_at?: string | null
  assigned_agent?: string | null
  outcomes: { name: string; result: 'success' | 'failure'; achieved_at: string }[]
  wrap_up_code?: WrapUpCode | null
  wrap_up_notes?: string | null
  wrapped_up_at?: string | null
}

export interface AgentState {
  agent_name: string
  presence: AgentPresence
  routing_status: AgentRoutingStatus
  updated_at: string
}

export interface MetricsSummary {
  total_sessions: number
  sessions_last_24h: number
  status_counts: Record<string, number>
  intent_counts: Record<string, number>
  channel_counts: Record<string, number>
  outcome_counts: Record<string, number>
  wrap_up_counts: Record<string, number>
  completion_rate: number
  average_duration_seconds: number
}

export interface WorkspaceInfo {
  id: string
  name: string
  role: WorkspaceRole
}

export interface WorkspaceMember {
  user_id: string
  email: string
  role: WorkspaceRole
  active: boolean
  last_login_at?: string | null
  created_at: string
}

export interface AuthMe {
  user_id: string
  email: string
  language: 'pt-BR' | 'en-US'
  active_workspace_id: string
  workspaces: WorkspaceInfo[]
}

export interface AuthTokenResponse {
  token: string
  expires_at: string
  user_id: string
  email: string
  language: 'pt-BR' | 'en-US'
  workspaces: WorkspaceInfo[]
}

export interface HealthStatus {
  status: string
  version: string
  management_api_protected: boolean
}
