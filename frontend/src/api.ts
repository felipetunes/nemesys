import type { CallSession, FlowDefinition, FlowValidationResult } from './types'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  getFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}`),
  getFlowVersions: (id: string) => request<FlowDefinition[]>(`/api/flows/${id}/versions`),
  validateFlow: (flow: FlowDefinition) => request<FlowValidationResult>('/api/flows/actions/validate', { method: 'POST', body: JSON.stringify(flow) }),
  saveFlow: (flow: FlowDefinition) => request<FlowDefinition>(`/api/flows/${flow.id}`, { method: 'PUT', body: JSON.stringify(flow) }),
  publishFlow: (id: string) => request<FlowDefinition>(`/api/flows/${id}/publish`, { method: 'POST' }),
  createSession: (flowId: string) => request<CallSession>('/api/sessions', { method: 'POST', body: JSON.stringify({ flow_id: flowId }) }),
  submitInput: (sessionId: string, value: string) => request<CallSession>(`/api/sessions/${sessionId}/input`, { method: 'POST', body: JSON.stringify({ value }) }),
}
