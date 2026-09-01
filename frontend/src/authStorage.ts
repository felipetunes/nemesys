const TOKEN_KEY = 'nemesys_management_token'
const WORKSPACE_KEY = 'nemesys_workspace_id'

interface AuthStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function migrateLegacySession(persistent: AuthStorage, legacy: AuthStorage) {
  const legacyToken = legacy.getItem(TOKEN_KEY)
  if (!persistent.getItem(TOKEN_KEY) && legacyToken) {
    persistent.setItem(TOKEN_KEY, legacyToken)
    const legacyWorkspace = legacy.getItem(WORKSPACE_KEY)
    if (legacyWorkspace) persistent.setItem(WORKSPACE_KEY, legacyWorkspace)
  }
  legacy.removeItem(TOKEN_KEY)
  legacy.removeItem(WORKSPACE_KEY)
}

function browserStorage() {
  migrateLegacySession(window.localStorage, window.sessionStorage)
  return window.localStorage
}

export function getManagementToken() {
  return browserStorage().getItem(TOKEN_KEY)
}

export function getWorkspaceId() {
  return browserStorage().getItem(WORKSPACE_KEY)
}

export function setAuthSession(token: string, workspaceId: string) {
  const storage = browserStorage()
  storage.setItem(TOKEN_KEY, token)
  storage.setItem(WORKSPACE_KEY, workspaceId)
}

export function setWorkspaceId(workspaceId: string) {
  browserStorage().setItem(WORKSPACE_KEY, workspaceId)
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(WORKSPACE_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(WORKSPACE_KEY)
}
