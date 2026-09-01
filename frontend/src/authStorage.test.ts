import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAuthSession, getManagementToken, getWorkspaceId, setAuthSession, setWorkspaceId } from './authStorage'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('persistent authentication storage', () => {
  let localStorage: MemoryStorage
  let sessionStorage: MemoryStorage

  beforeEach(() => {
    localStorage = new MemoryStorage()
    sessionStorage = new MemoryStorage()
    vi.stubGlobal('window', { localStorage, sessionStorage })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('stores authentication beyond the browser tab session', () => {
    setAuthSession('persistent-token', 'workspace-1')

    expect(getManagementToken()).toBe('persistent-token')
    expect(getWorkspaceId()).toBe('workspace-1')
    expect(sessionStorage.getItem('nemesys_management_token')).toBeNull()
  })

  it('migrates the previous tab session and clears it on logout', () => {
    sessionStorage.setItem('nemesys_management_token', 'legacy-token')
    sessionStorage.setItem('nemesys_workspace_id', 'legacy-workspace')

    expect(getManagementToken()).toBe('legacy-token')
    expect(getWorkspaceId()).toBe('legacy-workspace')
    expect(sessionStorage.getItem('nemesys_management_token')).toBeNull()

    setWorkspaceId('workspace-2')
    clearAuthSession()
    expect(getManagementToken()).toBeNull()
    expect(getWorkspaceId()).toBeNull()
  })
})
