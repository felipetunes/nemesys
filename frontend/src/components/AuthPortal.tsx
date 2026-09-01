import { useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, Languages, LockKeyhole, LogIn, Network, ShieldCheck, UserPlus, UsersRound, Workflow } from 'lucide-react'
import { api } from '../api'
import { useI18n, type Language, type TranslationKey } from '../i18n'
import type { AuthTokenResponse } from '../types'

interface Props {
  allowDemo: boolean
  sessionExpired: boolean
  onAuthenticated: () => void
  onDemo: () => void
}

export default function AuthPortal({ allowDemo, sessionExpired, onAuthenticated, onDemo }: Props) {
  const { language, setLanguage, t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [pendingSession, setPendingSession] = useState<AuthTokenResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const activateSession = (result: AuthTokenResponse, workspaceId: string) => {
    window.sessionStorage.setItem('nemesys_management_token', result.token)
    window.sessionStorage.setItem('nemesys_workspace_id', workspaceId)
    onAuthenticated()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = mode === 'login'
        ? await api.login(email.trim(), password)
        : await api.register(email.trim(), password, workspaceName.trim())
      if (result.workspaces.length === 0) throw new Error(t('access.noMembership'))
      if (result.workspaces.length === 1) activateSession(result, result.workspaces[0].id)
      else setPendingSession(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-portal">
    <header className="auth-portal-header">
      <div className="auth-brand"><span><Network size={21} /></span><div><strong>Nemesys</strong><small>{t('brand.tagline')}</small></div></div>
      <label className="language-picker" title={t('actions.language')}><Languages size={16} /><select aria-label={t('actions.language')} value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="pt-BR">PT-BR</option><option value="en-US">EN-US</option></select></label>
    </header>

    <div className="auth-portal-layout">
      <section className="auth-portal-intro">
        <span className="eyebrow">{t('authPortal.eyebrow')}</span>
        <h1>{t('authPortal.title')}</h1>
        <p>{t('authPortal.description')}</p>
        <div className="auth-benefits">
          <div><span><LockKeyhole size={18} /></span><div><strong>{t('authPortal.isolatedTitle')}</strong><small>{t('authPortal.isolatedDescription')}</small></div></div>
          <div><span><UsersRound size={18} /></span><div><strong>{t('authPortal.rolesTitle')}</strong><small>{t('authPortal.rolesDescription')}</small></div></div>
          <div><span><Workflow size={18} /></span><div><strong>{t('authPortal.personalTitle')}</strong><small>{t('authPortal.personalDescription')}</small></div></div>
        </div>
      </section>

      <section className="auth-card panel" aria-labelledby="auth-portal-form-title">
        <div className="auth-card-icon"><ShieldCheck size={23} /></div>
        {pendingSession ? <>
          <span className="eyebrow">{t('authPortal.workspaceEyebrow')}</span>
          <h2 id="auth-portal-form-title">{t('authPortal.chooseWorkspace')}</h2>
          <p>{t('authPortal.chooseWorkspaceDescription')}</p>
          <div className="workspace-choices">
            {pendingSession.workspaces.map(workspace => <button key={workspace.id} onClick={() => activateSession(pendingSession, workspace.id)}><span><strong>{workspace.name}</strong><small>{t(`role.${workspace.role}` as TranslationKey)}</small></span><ArrowRight size={16} /></button>)}
          </div>
          <button className="clear-access" onClick={() => setPendingSession(null)}>{t('authPortal.backToLogin')}</button>
        </> : <>
          <span className="eyebrow">{t('authPortal.formEyebrow')}</span>
          <h2 id="auth-portal-form-title">{t(mode === 'login' ? 'authPortal.welcomeBack' : 'authPortal.createWorkspace')}</h2>
          <p>{t(mode === 'login' ? 'authPortal.loginDescription' : 'authPortal.registerDescription')}</p>
          {sessionExpired && <div className="auth-session-note"><LockKeyhole size={15} />{t('authPortal.sessionExpired')}</div>}
          <div className="access-tabs" role="tablist" aria-label={t('access.dialogLabel')}>
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>{t('access.signIn')}</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>{t('access.createOwner')}</button>
          </div>
          <form onSubmit={submit}>
            <label>{t('access.email')}<input autoFocus type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="nome@empresa.com" /></label>
            <label>{t('access.password')}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 12 : 1} required value={password} onChange={event => setPassword(event.target.value)} /></label>
            {mode === 'register' && <label>{t('access.workspaceName')}<input required minLength={2} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder={t('authPortal.workspacePlaceholder')} /></label>}
            {mode === 'register' && <div className="auth-form-hint"><CheckCircle2 size={14} />{t('authPortal.passwordHint')}</div>}
            {error && <div className="error-box auth-error" role="alert">{error}</div>}
            <button className="primary-btn access-submit" disabled={busy}>{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{busy ? t('access.wait') : t(mode === 'login' ? 'access.signIn' : 'access.createAccount')}</button>
          </form>
          {allowDemo && <div className="demo-access"><span>{t('authPortal.or')}</span><button className="secondary-btn" onClick={onDemo}><Workflow size={16} />{t('authPortal.tryDemo')}</button><small>{t('authPortal.demoDescription')}</small></div>}
        </>}
      </section>
    </div>
  </main>
}
