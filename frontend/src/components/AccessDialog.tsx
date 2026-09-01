import { useState, type FormEvent } from 'react'
import { KeyRound, LogIn, LogOut, Mail, Settings, ShieldCheck, UserPlus, X } from 'lucide-react'
import { api } from '../api'
import { setAuthSession } from '../authStorage'
import { useI18n, type Language, type TranslationKey } from '../i18n'
import type { AuthMe } from '../types'

interface Props {
  configured: boolean
  currentUser: AuthMe | null
  ownerRegistrationAvailable: boolean
  onClose: () => void
  onAuthenticated: () => void
  onClear: () => void | Promise<void>
  onWorkspaceChange: (workspaceId: string) => void
  onLanguageChange: (language: Language) => void | Promise<void>
}

export default function AccessDialog({ configured, currentUser, ownerRegistrationAvailable, onClose, onAuthenticated, onClear, onWorkspaceChange, onLanguageChange }: Props) {
  const { language, setLanguage, t } = useI18n()
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
        : await api.register(email, password, workspaceName, language)
      setLanguage(result.language)
      const workspace = result.workspaces[0]
      if (!workspace) throw new Error(t('access.noMembership'))
      setAuthSession(result.token, workspace.id)
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
      <div className="access-icon">{configured && currentUser ? <Settings size={22} /> : <KeyRound size={22} />}</div>
      {configured && currentUser ? <>
        <h2>{t('account.title')}</h2>
        <p>{t('account.description')}</p>
        <div className="account-identity"><Mail size={17} /><div><small>{t('account.signedInAs')}</small><strong>{currentUser.email}</strong></div></div>
        <label>{t('account.workspace')}<select value={currentUser.active_workspace_id} onChange={event => onWorkspaceChange(event.target.value)}>{currentUser.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
        <label>{t('account.language')}<select value={language} onChange={event => void onLanguageChange(event.target.value as Language)}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English (United States)</option></select><small className="account-field-hint">{t('account.languageHint')}</small></label>
        {currentUser.workspaces.find(workspace => workspace.id === currentUser.active_workspace_id) && <div className="account-role"><ShieldCheck size={16} /><div><strong>{t(`role.${currentUser.workspaces.find(workspace => workspace.id === currentUser.active_workspace_id)!.role}` as TranslationKey)}</strong><span>{t(`role.${currentUser.workspaces.find(workspace => workspace.id === currentUser.active_workspace_id)!.role}Description` as TranslationKey)}</span></div></div>}
        <button className="secondary-btn account-signout" onClick={() => void onClear()}><LogOut size={16} />{t('access.signOut')}</button>
      </> : <>
        <h2>{t('access.title')}</h2>
        <p>{t('access.description')}</p>
        {ownerRegistrationAvailable && <div className="access-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>{t('access.signIn')}</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>{t('access.createOwner')}</button>
        </div>}
        <form onSubmit={submit}>
          <label>{t('access.email')}<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>{t('access.password')}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : 1} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          {mode === 'register' && <label>{t('access.workspaceName')}<input required minLength={2} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} /></label>}
          {error && <div className="error-box">{error}</div>}
          <button className="primary-btn access-submit" disabled={busy}>{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{busy ? t('access.wait') : mode === 'login' ? t('access.signIn') : t('access.createAccount')}</button>
        </form>
      </>}
    </section>
  </div>
}
