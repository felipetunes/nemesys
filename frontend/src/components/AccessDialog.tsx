import { useState, type FormEvent } from 'react'
import { KeyRound, LogIn, UserPlus, X } from 'lucide-react'
import { api } from '../api'
import { useI18n } from '../i18n'

interface Props {
  configured: boolean
  onClose: () => void
  onAuthenticated: () => void
  onClear: () => void
}

export default function AccessDialog({ configured, onClose, onAuthenticated, onClear }: Props) {
  const { t } = useI18n()
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
      if (!workspace) throw new Error(t('access.noMembership'))
      window.sessionStorage.setItem('nemesys_management_token', result.token)
      window.sessionStorage.setItem('nemesys_workspace_id', workspace.id)
      onAuthenticated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="access-dialog panel" role="dialog" aria-modal="true" aria-label={t('access.dialogLabel')}>
      <button className="dialog-close" aria-label={t('access.close')} onClick={onClose}><X size={17} /></button>
      <div className="access-icon"><KeyRound size={22} /></div>
      <h2>{t('access.title')}</h2>
      <p>{t('access.description')}</p>
      <div className="access-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>{t('access.signIn')}</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>{t('access.createOwner')}</button>
      </div>
      <form onSubmit={submit}>
        <label>{t('access.email')}<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>{t('access.password')}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : 1} required value={password} onChange={event => setPassword(event.target.value)} /></label>
        {mode === 'register' && <label>{t('access.workspaceName')}<input required minLength={2} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} /></label>}
        {error && <div className="error-box">{error}</div>}
        <button className="primary-btn access-submit" disabled={busy}>{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{busy ? t('access.wait') : mode === 'login' ? t('access.signIn') : t('access.createAccount')}</button>
      </form>
      {configured && <button className="clear-access" onClick={onClear}>{t('access.signOut')}</button>}
    </section>
  </div>
}
