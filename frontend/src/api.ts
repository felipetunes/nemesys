import type { AuthTokenResponse, CallSession, FlowDefinition, FlowValidationResult, MetricsSummary } from './types'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const managementToken = window.sessionStorage.getItem('revelys_management_token')
  const workspaceId = window.sessionStorage.getItem('revelys_workspace_id')
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
    throw new Error(body || `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  listFlows: () => request<FlowDefinition[]>('/api/flows'),
  getFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}`),
  getFlowVersions: (id: string) => request<FlowDefinition[]>(`/api/flows/${id}/versions`),
  validateFlow: (flow: FlowDefinition) => request<FlowValidationResult>('/api/flows/actions/validate', { method: 'POST', body: JSON.stringify(flow) }),
  importFlow: (flow: FlowDefinition, overwrite = false) => request<FlowDefinition>(`/api/flows/actions/import?overwrite=${overwrite}`, { method: 'POST', body: JSON.stringify(flow) }),
  saveFlow: (flow: FlowDefinition) => request<FlowDefinition>(`/api/flows/${flow.id}`, { method: 'PUT', body: JSON.stringify(flow) }),
  publishFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}/publish`, { method: 'POST' }),
  createSession: (flowId: string) => request<CallSession>('/api/sessions', { method: 'POST', body: JSON.stringify({ flow_id: flowId }) }),
  submitInput: (sessionId: string, value: string) => request<CallSession>(`/api/sessions/${sessionId}/input`, { method: 'POST', body: JSON.stringify({ value }) }),
  getMetrics: () => request<MetricsSummary>('/api/operations/metrics'),
  claimQueueSession: (sessionId: string, agentName: string) => request<CallSession>(`/api/queue/${sessionId}/claim`, { method: 'POST', body: JSON.stringify({ agent_name: agentName }) }),
  login: (email: string, password: string) => request<AuthTokenResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, workspaceName: string) => request<AuthTokenResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, workspace_name: workspaceName }) }),
}
