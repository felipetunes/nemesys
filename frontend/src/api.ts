import { clearAuthSession, getManagementToken, getWorkspaceId } from './authStorage'
import type { AgentPresence, AgentState, AuthCapabilities, AuthMe, AuthTokenResponse, CallSession, FlowDefinition, FlowValidationResult, HealthStatus, MetricsSummary, WorkspaceMember, WorkspaceRole, WrapUpCode } from './types'
import type { Language } from './i18n'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const AUTH_EXPIRED_EVENT = 'nemesys:auth-expired'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const managementToken = getManagementToken()
  const workspaceId = getWorkspaceId()
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(managementToken ? { Authorization: `Bearer ${managementToken}` } : {}),
      ...(workspaceId ? { 'X-Workspace-ID': workspaceId } : {}),
      ...(init?.headers || {}),
    },
  })
  if (!response.ok) {
    const body = await response.text()
    let message = body || `${response.status} ${response.statusText}`
    try {
      const parsed = JSON.parse(body) as { detail?: unknown }
      if (typeof parsed.detail === 'string') message = parsed.detail
    } catch {
      // Preserve the original response text when it is not JSON.
    }
    const requestId = response.headers.get('X-Request-ID')
    if (response.status === 401 && managementToken && path !== '/api/auth/login') {
      clearAuthSession()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    throw new Error(requestId ? `${message} (request ${requestId})` : message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<HealthStatus>('/health'),
  authCapabilities: () => request<AuthCapabilities>('/api/auth/capabilities'),
  listFlows: (includeArchived = false) => request<FlowDefinition[]>(`/api/flows?include_archived=${includeArchived}`),
  getFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}`),
  getFlowVersions: (id: string) => request<FlowDefinition[]>(`/api/flows/${id}/versions`),
  validateFlow: (flow: FlowDefinition) => request<FlowValidationResult>('/api/flows/actions/validate', { method: 'POST', body: JSON.stringify(flow) }),
  importFlow: (flow: FlowDefinition, overwrite = false) => request<FlowDefinition>(`/api/flows/actions/import?overwrite=${overwrite}`, { method: 'POST', body: JSON.stringify(flow) }),
  saveFlow: (flow: FlowDefinition) => request<FlowDefinition>(`/api/flows/${flow.id}`, { method: 'PUT', body: JSON.stringify(flow) }),
  publishFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}/publish`, { method: 'POST' }),
  duplicateFlow: (sourceId: string, id: string, name: string, description?: string) => request<FlowDefinition>(`/api/flows/${sourceId}/duplicate`, { method: 'POST', body: JSON.stringify({ id, name, description }) }),
  archiveFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}/archive`, { method: 'POST' }),
  restoreFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}/restore`, { method: 'POST' }),
  deleteFlow: (id: string) => request<void>(`/api/flows/${id}`, { method: 'DELETE' }),
  restoreFlowVersion: (id: string, version: number) => request<FlowDefinition>(`/api/flows/${id}/versions/${version}/restore`, { method: 'POST' }),
  createSession: (flowId: string) => request<CallSession>('/api/sessions', { method: 'POST', body: JSON.stringify({ flow_id: flowId }) }),
  submitInput: (sessionId: string, value: string) => request<CallSession>(`/api/sessions/${sessionId}/input`, { method: 'POST', body: JSON.stringify({ value }) }),
  getMetrics: () => request<MetricsSummary>('/api/operations/metrics'),
  listQueuedSessions: () => request<CallSession[]>('/api/queue'),
  listAssignedSessions: (agentName: string) => request<CallSession[]>(`/api/queue/assigned?agent_name=${encodeURIComponent(agentName)}`),
  claimQueueSession: (sessionId: string, agentName: string) => request<CallSession>(`/api/queue/${sessionId}/claim`, { method: 'POST', body: JSON.stringify({ agent_name: agentName }) }),
  completeWrapUp: (sessionId: string, code: WrapUpCode, notes: string) => request<CallSession>(`/api/queue/${sessionId}/wrap-up`, { method: 'POST', body: JSON.stringify({ code, notes }) }),
  listAgentStates: () => request<AgentState[]>('/api/agents'),
  updateAgentPresence: (agentName: string, presence: AgentPresence) => request<AgentState>(`/api/agents/${encodeURIComponent(agentName)}/presence`, { method: 'PUT', body: JSON.stringify({ presence }) }),
  me: () => request<AuthMe>('/api/auth/me'),
  updateProfileLanguage: (language: Language) => request<AuthMe>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ language }) }),
  listWorkspaceMembers: () => request<WorkspaceMember[]>('/api/workspaces/members'),
  createWorkspaceUser: (email: string, password: string, role: WorkspaceRole) => request<WorkspaceMember>('/api/workspaces/users', { method: 'POST', body: JSON.stringify({ email, password, role }) }),
  updateWorkspaceMemberRole: (userId: string, role: WorkspaceRole) => request<WorkspaceMember>(`/api/workspaces/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  updateWorkspaceMemberStatus: (userId: string, active: boolean) => request<WorkspaceMember>(`/api/workspaces/members/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  removeWorkspaceMember: (userId: string) => request<void>(`/api/workspaces/members/${userId}`, { method: 'DELETE' }),
  login: (email: string, password: string) => request<AuthTokenResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, workspaceName: string, language: Language) => request<AuthTokenResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, workspace_name: workspaceName, language }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
}
