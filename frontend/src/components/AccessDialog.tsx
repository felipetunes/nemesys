import { useState, type FormEvent } from 'react'
import { KeyRound, LogIn, UserPlus, X } from 'lucide-react'
import { api } from '../api'

interface Props {
  configured: boolean
  onClose: () => void
  onAuthenticated: () => void
  onClear: () => void
}

export default function AccessDialog({ configured, onClose, onAuthenticated, onClear }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = mode === 'login'
        ? await api.login(email, password)
        : await api.register(email, password, workspaceName)
      const workspace = result.workspaces[0]
      if (!workspace) throw new Error('The account has no workspace membership.')
      window.sessionStorage.setItem('revelys_management_token', result.token)
      window.sessionStorage.setItem('revelys_workspace_id', workspace.id)
      onAuthenticated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="access-dialog panel" role="dialog" aria-modal="true" aria-label="Workspace access">
      <button className="dialog-close" aria-label="Close" onClick={onClose}><X size={17} /></button>
      <div className="access-icon"><KeyRound size={22} /></div>
      <h2>Workspace access</h2>
      <p>Sign in to an isolated workspace. The offline demo remains available when authentication is disabled.</p>
      <div className="access-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create owner</button>
      </div>
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : 1} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        {mode === 'register' && <label>Workspace name<input required minLength={2} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} /></label>}
        {error && <div className="error-box">{error}</div>}
        <button className="primary-btn access-submit" disabled={busy}>{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      </form>
      {configured && <button className="clear-access" onClick={onClear}>Sign out and return to offline mode</button>}
    </section>
  </div>
}
