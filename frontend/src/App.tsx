import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  Cable,
  CircleHelp,
  GitBranch,
  Headphones,
  History,
  KeyRound,
  Languages,
  ListTree,
  LoaderCircle,
  Network,
  PlayCircle,
  Save,
  ShieldCheck,
  UsersRound,
  Workflow,
} from 'lucide-react'
import { api, AUTH_EXPIRED_EVENT } from './api'
import AccessDialog from './components/AccessDialog'
import AuthPortal from './components/AuthPortal'
import CollaborateQueue from './components/CollaborateQueue'
import FlowCatalog from './components/FlowCatalog'
import HelpCenter, { GettingStarted, type LearningDestination } from './components/LearningGuide'
import MetricsDashboard from './components/MetricsDashboard'
import Simulator from './components/Simulator'
import VersionHistory from './components/VersionHistory'
import { createFlowId, createStarterFlow } from './flowFactory'
import { useI18n, type Language } from './i18n'
import type { AuthMe, FlowDefinition } from './types'
import { validationErrorMessage, validationSuccessMessage } from './validation'

type Application = 'architect' | 'collaborate' | 'admin'
type ArchitectTab = 'ivrs' | 'editor' | 'simulator' | 'history' | 'architecture'
type CollaborateTab = 'overview' | 'queue'
type AccessState = 'checking' | 'locked' | 'authenticated' | 'demo'

const APPLICATION_STORAGE_KEY = 'nemesys_application'
const SELECTED_FLOW_STORAGE_KEY = 'nemesys_selected_flow'
const GUIDE_HIDDEN_STORAGE_KEY = 'nemesys_getting_started_hidden'
const FlowEditor = lazy(() => import('./components/FlowEditor'))
const UserManagement = lazy(() => import('./components/UserManagement'))

function initialApplication(): Application {
  const stored = window.localStorage.getItem(APPLICATION_STORAGE_KEY)
  return stored === 'collaborate' || stored === 'admin' ? stored : 'architect'
}

export default function App() {
  const { language, setLanguage, t } = useI18n()
  const [flows, setFlows] = useState<FlowDefinition[]>([])
  const [flow, setFlow] = useState<FlowDefinition | null>(null)
  const [historyFlow, setHistoryFlow] = useState<FlowDefinition | null>(null)
  const [application, setApplicationState] = useState<Application>(initialApplication)
  const [architectTab, setArchitectTab] = useState<ArchitectTab>('ivrs')
  const [collaborateTab, setCollaborateTab] = useState<CollaborateTab>('overview')
  const [flowLoading, setFlowLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [creatingFlow, setCreatingFlow] = useState(false)
  const [busyFlowId, setBusyFlowId] = useState<string | null>(null)
  const [restoringVersion, setRestoringVersion] = useState(false)
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [flowError, setFlowError] = useState('')
  const [hasManagementToken, setHasManagementToken] = useState(() => Boolean(window.sessionStorage.getItem('nemesys_management_token')))
  const [currentUser, setCurrentUser] = useState<AuthMe | null>(null)
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [authRequired, setAuthRequired] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [accessRevision, setAccessRevision] = useState(0)
  const [showAccess, setShowAccess] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showGuide, setShowGuide] = useState(() => window.localStorage.getItem(GUIDE_HIDDEN_STORAGE_KEY) !== 'true')
  const [editorDirty, setEditorDirty] = useState(false)

  const resetWorkspaceState = useCallback(() => {
    setFlows([])
    setFlow(null)
    setHistoryFlow(null)
    setPublishedVersion(null)
    setFlowLoading(true)
    setFlowError('')
    setActionError('')
    setEditorDirty(false)
  }, [])

  const refreshAccess = useCallback(async () => {
    resetWorkspaceState()
    setAccessState('checking')
    setSessionExpired(false)
    try {
      const user = await api.me()
      const role = user.workspaces.find(item => item.id === user.active_workspace_id)?.role
      if (role === 'viewer') {
        setArchitectTab(current => current === 'simulator' ? 'ivrs' : current)
        setCollaborateTab(current => current === 'queue' ? 'overview' : current)
      }
      setCurrentUser(user)
      setHasManagementToken(true)
      setAccessState('authenticated')
      setAccessRevision(value => value + 1)
      setShowAccess(false)
    } catch {
      window.sessionStorage.removeItem('nemesys_management_token')
      window.sessionStorage.removeItem('nemesys_workspace_id')
      setCurrentUser(null)
      setHasManagementToken(false)
      setAccessState('locked')
    }
  }, [resetWorkspaceState])

  useEffect(() => {
    let active = true
    api.health()
      .then(health => {
        if (!active) return
        setAuthRequired(health.management_api_protected)
        if (window.sessionStorage.getItem('nemesys_management_token')) void refreshAccess()
        else setAccessState('locked')
      })
      .catch(() => { if (active) setAccessState('locked') })
    return () => { active = false }
  }, [refreshAccess])

  useEffect(() => {
    const handleExpiredSession = () => {
      resetWorkspaceState()
      setCurrentUser(null)
      setHasManagementToken(false)
      setSessionExpired(true)
      setAccessState('locked')
      setShowAccess(false)
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession)
  }, [resetWorkspaceState])

  useEffect(() => {
    if (accessState !== 'authenticated' && accessState !== 'demo') return
    let active = true
    api.listFlows(true)
      .then(async drafts => {
        if (!active) return
        setFlows(drafts)
        setFlowError('')
        const activeDrafts = drafts.filter(item => !item.archived_at)
        if (activeDrafts.length === 0) {
          setFlow(null)
          setHistoryFlow(null)
          setPublishedVersion(null)
          return
        }
        const preferredId = window.localStorage.getItem(SELECTED_FLOW_STORAGE_KEY)
        const draft = activeDrafts.find(item => item.id === preferredId) || activeDrafts[0]
        const versions = await api.getFlowVersions(draft.id)
        if (!active) return
        setFlow(draft)
        setHistoryFlow(draft)
        setPublishedVersion(versions[0]?.version ?? null)
        window.localStorage.setItem(SELECTED_FLOW_STORAGE_KEY, draft.id)
      })
      .catch(error => { if (active) setFlowError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (active) setFlowLoading(false) })
    return () => { active = false }
  }, [accessRevision, accessState])

  const activeRole = currentUser?.workspaces.find(item => item.id === currentUser.active_workspace_id)?.role
  const canEdit = accessState === 'demo' || activeRole === 'editor' || activeRole === 'admin' || activeRole === 'owner'
  const canAdminister = activeRole === 'admin' || activeRole === 'owner'
  const visibleApplication = application === 'admin' && !canAdminister ? 'architect' : application

  const setApplication = (nextApplication: Application) => {
    if (nextApplication !== 'architect' && visibleApplication === 'architect' && architectTab === 'editor' && editorDirty && !window.confirm(t('flow.leaveUnsavedConfirm'))) return false
    if (nextApplication !== 'architect') setEditorDirty(false)
    window.localStorage.setItem(APPLICATION_STORAGE_KEY, nextApplication)
    setApplicationState(nextApplication)
    setActionError('')
    return true
  }

  const openArchitectTab = (nextTab: ArchitectTab) => {
    if (nextTab !== 'editor' && architectTab === 'editor' && editorDirty && !window.confirm(t('flow.leaveUnsavedConfirm'))) return false
    if (nextTab !== 'editor') setEditorDirty(false)
    setArchitectTab(nextTab)
    return true
  }

  const navigateToLearningDestination = (destination: LearningDestination) => {
    setShowHelp(false)
    setActionError('')
    if ((destination === 'agent' || destination === 'simulator') && !canEdit) return
    if (destination === 'agent') {
      if (!setApplication('collaborate')) return
      setCollaborateTab('queue')
      return
    }
    if (destination === 'users') {
      setApplication('admin')
      return
    }
    if (!setApplication('architect')) return
    openArchitectTab(destination === 'catalog' ? 'ivrs' : destination)
  }

  const dismissGuide = () => {
    window.localStorage.setItem(GUIDE_HIDDEN_STORAGE_KEY, 'true')
    setShowGuide(false)
  }

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2200)
  }

  const openFlow = async (nextFlow: FlowDefinition) => {
    setFlowLoading(true); setActionError(''); setFlowError('')
    try {
      const versions = await api.getFlowVersions(nextFlow.id)
      setFlow(nextFlow)
      setHistoryFlow(nextFlow)
      setPublishedVersion(versions[0]?.version ?? null)
      window.localStorage.setItem(SELECTED_FLOW_STORAGE_KEY, nextFlow.id)
      setArchitectTab('editor')
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : String(error))
    } finally {
      setFlowLoading(false)
    }
  }

  const openHistory = async (nextFlow: FlowDefinition) => {
    setHistoryFlow(nextFlow)
    setActionError('')
    setArchitectTab('history')
  }

  const createFlow = async (name: string, description: string) => {
    setCreatingFlow(true); setActionError('')
    try {
      const starter = createStarterFlow(createFlowId(name), name, description, {
        startLabel: t('node.start'),
        endLabel: t('node.end'),
        endMessage: t('node.defaultEndMessage'),
      })
      const created = await api.importFlow(starter, false)
      setFlows(current => [...current.filter(item => item.id !== created.id), created])
      setHistoryFlow(created)
      showNotice(t('notice.flowCreated', { name: created.name }))
      await openFlow(created)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      setCreatingFlow(false)
    }
  }

  const save = async (next: FlowDefinition) => {
    setSaving(true); setNotice(''); setActionError('')
    try {
      const validation = await api.validateFlow(next)
      if (!validation.valid) throw new Error(validationErrorMessage(validation))
      const saved = await api.saveFlow(next)
      setFlow(saved)
      setHistoryFlow(saved)
      setFlows(current => current.map(item => item.id === saved.id ? saved : item))
      showNotice(validationSuccessMessage(validation, t('notice.draftSaved'), count => t('validation.warningCount', { count })))
      return true
    }
    catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      return false
    }
    finally { setSaving(false) }
  }

  const publish = async (next: FlowDefinition) => {
    setPublishing(true); setNotice(''); setActionError('')
    try {
      const validation = await api.validateFlow(next)
      if (!validation.valid) throw new Error(validationErrorMessage(validation))
      const saved = await api.saveFlow(next)
      setFlow(saved)
      setHistoryFlow(saved)
      setFlows(current => current.map(item => item.id === saved.id ? saved : item))
      const published = await api.publishFlow(saved.id)
      setPublishedVersion(published.version ?? null)
      showNotice(validationSuccessMessage(
        validation,
        t('notice.versionPublished', { version: published.version ?? '—' }),
        count => t('validation.warningCount', { count }),
      ))
      return true
    }
    catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
      return false
    }
    finally { setPublishing(false) }
  }

  const duplicateFlow = async (source: FlowDefinition) => {
    setBusyFlowId(source.id); setActionError('')
    try {
      const name = t('catalog.copyName', { name: source.name })
      const duplicate = await api.duplicateFlow(source.id, createFlowId(name), name, source.description)
      setFlows(current => [...current, duplicate])
      showNotice(t('notice.flowDuplicated', { name: duplicate.name }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyFlowId(null)
    }
  }

  const archiveFlow = async (target: FlowDefinition) => {
    setBusyFlowId(target.id); setActionError('')
    try {
      const archived = await api.archiveFlow(target.id)
      setFlows(current => current.map(item => item.id === archived.id ? archived : item))
      setHistoryFlow(current => current?.id === archived.id ? archived : current)
      if (flow?.id === archived.id) {
        setFlow(null)
        setPublishedVersion(null)
        window.localStorage.removeItem(SELECTED_FLOW_STORAGE_KEY)
      }
      showNotice(t('notice.flowArchived', { name: archived.name }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyFlowId(null)
    }
  }

  const restoreFlow = async (target: FlowDefinition) => {
    setBusyFlowId(target.id); setActionError('')
    try {
      const restored = await api.restoreFlow(target.id)
      const versions = await api.getFlowVersions(restored.id)
      setFlows(current => current.map(item => item.id === restored.id ? restored : item))
      setFlow(restored)
      setHistoryFlow(restored)
      setPublishedVersion(versions[0]?.version ?? null)
      window.localStorage.setItem(SELECTED_FLOW_STORAGE_KEY, restored.id)
      showNotice(t('notice.flowRestored', { name: restored.name }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyFlowId(null)
    }
  }

  const deleteFlow = async (target: FlowDefinition) => {
    setBusyFlowId(target.id); setActionError('')
    try {
      await api.deleteFlow(target.id)
      setFlows(current => current.filter(item => item.id !== target.id))
      setHistoryFlow(current => current?.id === target.id ? null : current)
      showNotice(t('notice.flowDeleted', { name: target.name }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyFlowId(null)
    }
  }

  const restoreFlowVersion = async (version: number) => {
    const target = historyFlow ?? flow
    if (!target) return
    setRestoringVersion(true); setActionError('')
    try {
      const restored = await api.restoreFlowVersion(target.id, version)
      setFlows(current => current.map(item => item.id === restored.id ? restored : item))
      setFlow(current => current?.id === restored.id ? restored : current)
      setHistoryFlow(restored)
      showNotice(t('notice.versionRestored', { version }))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setRestoringVersion(false)
    }
  }

  const exportFlow = (current: FlowDefinition) => {
    const portable: FlowDefinition = { ...current, version: null, published_at: null }
    delete portable.updated_at
    delete portable.archived_at
    const href = URL.createObjectURL(new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = `${portable.id}.flow.json`
    anchor.click()
    URL.revokeObjectURL(href)
    showNotice(t('notice.flowExported'))
  }

  const importFlow = async (file: File) => {
    setImporting(true); setNotice(''); setActionError('')
    try {
      const parsed = JSON.parse(await file.text()) as FlowDefinition
      const imported = await api.importFlow(parsed, true)
      setFlow(imported)
      setHistoryFlow(imported)
      setFlows(current => [...current.filter(item => item.id !== imported.id), imported])
      const versions = await api.getFlowVersions(imported.id)
      setPublishedVersion(versions[0]?.version ?? null)
      window.localStorage.setItem(SELECTED_FLOW_STORAGE_KEY, imported.id)
      setFlowError('')
      showNotice(t('notice.flowImported', { name: imported.name }))
    }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
    finally { setImporting(false) }
  }

  const enterDemo = () => {
    window.sessionStorage.removeItem('nemesys_management_token')
    window.sessionStorage.removeItem('nemesys_workspace_id')
    resetWorkspaceState()
    setCurrentUser(null)
    setHasManagementToken(false)
    setSessionExpired(false)
    setApplicationState('architect')
    setArchitectTab('ivrs')
    setAccessState('demo')
    setAccessRevision(value => value + 1)
  }

  const clearAccess = async () => {
    try {
      if (window.sessionStorage.getItem('nemesys_management_token')) await api.logout()
    } catch {
      // Local cleanup still signs the user out when the server session already expired.
    } finally {
      window.sessionStorage.removeItem('nemesys_management_token')
      window.sessionStorage.removeItem('nemesys_workspace_id')
      resetWorkspaceState()
      setCurrentUser(null)
      setHasManagementToken(false)
      setSessionExpired(false)
      setAccessState('locked')
      setShowAccess(false)
    }
  }

  const changeWorkspace = (workspaceId: string) => {
    window.sessionStorage.setItem('nemesys_workspace_id', workspaceId)
    void refreshAccess()
  }

  if (accessState === 'checking') return <div className="auth-loading"><LoaderCircle className="spin" /><strong>Nemesys</strong><span>{t('authPortal.checkingSession')}</span></div>
  if (accessState === 'locked') return <AuthPortal allowDemo={!authRequired} sessionExpired={sessionExpired} onAuthenticated={() => void refreshAccess()} onDemo={enterDemo} />

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t('actions.skipToContent')}</a>
      <header className="shell-header">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark"><Network size={20} /></div>
            <div><strong>Nemesys</strong><span>{t('brand.tagline')}</span></div>
          </div>

          <div className="app-switcher" role="group" aria-label={t('actions.applications')}>
            <button className={visibleApplication === 'architect' ? 'active' : ''} onClick={() => setApplication('architect')}>
              <Workflow size={18} />
              <span><strong>{t('app.architect')}</strong><small>{t('app.architect.description')}</small></span>
            </button>
            <button className={visibleApplication === 'collaborate' ? 'active' : ''} onClick={() => setApplication('collaborate')}>
              <UsersRound size={18} />
              <span><strong>{t('app.collaborate')}</strong><small>{t('app.collaborate.description')}</small></span>
            </button>
            {canAdminister && <button className={visibleApplication === 'admin' ? 'active' : ''} onClick={() => setApplication('admin')}>
              <ShieldCheck size={18} />
              <span><strong>{t('app.admin')}</strong><small>{t('app.admin.description')}</small></span>
            </button>}
          </div>

          <div className="topbar-actions">
            <label className="language-picker" title={t('actions.language')}>
              <Languages size={16} />
              <select aria-label={t('actions.language')} value={language} onChange={event => setLanguage(event.target.value as Language)}>
                <option value="pt-BR">PT-BR</option>
                <option value="en-US">EN-US</option>
              </select>
            </label>
            <button className="help-btn" onClick={() => setShowHelp(true)} title={t('actions.help')}><CircleHelp size={16} />{t('actions.help')}</button>
            <button className={`access-btn${hasManagementToken ? ' configured' : ' demo'}`} onClick={() => setShowAccess(true)} title={t('actions.configureAccess')}><KeyRound size={16} /><span>{currentUser?.email || t('authPortal.demoMode')}</span></button>
          </div>
        </div>

        <div className="contextbar">
          <div className="context-title">
            {visibleApplication === 'architect' ? <Workflow size={18} /> : visibleApplication === 'collaborate' ? <UsersRound size={18} /> : <ShieldCheck size={18} />}
            <div>
              <strong>{visibleApplication === 'architect' ? t('app.architect') : visibleApplication === 'collaborate' ? t('app.collaborate') : t('app.admin')}</strong>
              <span>{visibleApplication === 'architect' ? t('app.architect.description') : visibleApplication === 'collaborate' ? t('app.collaborate.description') : t('app.admin.description')}</span>
            </div>
          </div>
          {visibleApplication === 'architect' ? (
            <nav className="section-nav" aria-label={t('app.architect')}>
              <button className={architectTab === 'ivrs' ? 'active' : ''} onClick={() => openArchitectTab('ivrs')}><ListTree size={16} />{t('nav.ivrs')}</button>
              <button className={architectTab === 'editor' ? 'active' : ''} onClick={() => openArchitectTab('editor')}><GitBranch size={16} />{t('nav.editor')}</button>
              {canEdit && <button className={architectTab === 'simulator' ? 'active' : ''} onClick={() => openArchitectTab('simulator')}><PlayCircle size={16} />{t('nav.simulator')}</button>}
              <button className={architectTab === 'history' ? 'active' : ''} onClick={() => openArchitectTab('history')}><History size={16} />{t('nav.history')}</button>
              <button className={architectTab === 'architecture' ? 'active' : ''} onClick={() => openArchitectTab('architecture')}><Activity size={16} />{t('nav.architecture')}</button>
            </nav>
          ) : visibleApplication === 'collaborate' ? (
            <nav className="section-nav" aria-label={t('app.collaborate')}>
              <button className={collaborateTab === 'overview' ? 'active' : ''} onClick={() => setCollaborateTab('overview')}><BarChart3 size={16} />{t('nav.overview')}</button>
              {canEdit && <button className={collaborateTab === 'queue' ? 'active' : ''} onClick={() => setCollaborateTab('queue')}><Headphones size={16} />{t('nav.queue')}</button>}
            </nav>
          ) : (
            <nav className="section-nav" aria-label={t('app.admin')}>
              <button className="active"><UsersRound size={16} />{t('nav.users')}</button>
            </nav>
          )}
        </div>
      </header>

      <main id="main-content">
        {notice && <div className="toast"><Save size={15} />{notice}</div>}
        {actionError && <div className="error-box top-error">{actionError}</div>}

        {!flowLoading && visibleApplication === 'architect' && architectTab === 'ivrs' && showGuide && <GettingStarted hasFlow={Boolean(flow)} canEdit={canEdit} onNavigate={navigateToLearningDestination} onDismiss={dismissGuide} />}

        {visibleApplication === 'architect' && <>
          {flowError && <div className="error-box top-error">{flowError}</div>}
          {flowLoading && <div className="loading"><LoaderCircle className="spin" />{t('app.loadingFlow')}</div>}
          {!flowLoading && architectTab === 'ivrs' && <FlowCatalog canEdit={canEdit} canAdminister={canAdminister} flows={flows} selectedFlowId={flow?.id ?? null} creating={creatingFlow} busyFlowId={busyFlowId} onCreate={createFlow} onOpen={openFlow} onHistory={openHistory} onDuplicate={duplicateFlow} onArchive={archiveFlow} onRestore={restoreFlow} onDelete={deleteFlow} />}
          {!flowLoading && architectTab === 'editor' && (flow ? <Suspense fallback={<div className="loading"><LoaderCircle className="spin" />{t('app.loadingEditor')}</div>}><FlowEditor key={`${flow.id}:${flow.updated_at ?? ''}`} readOnly={!canEdit} flow={flow} onSave={save} onPublish={publish} onExport={exportFlow} onImport={importFlow} onTest={() => setArchitectTab('simulator')} onDirtyChange={setEditorDirty} saving={saving} publishing={publishing} importing={importing} publishedVersion={publishedVersion} /></Suspense> : <FlowSelectionRequired onBack={() => openArchitectTab('ivrs')} />)}
          {!flowLoading && architectTab === 'simulator' && (canEdit ? flow ? <Simulator flow={flow} /> : <FlowSelectionRequired onBack={() => setArchitectTab('ivrs')} /> : <AccessRestricted />)}
          {!flowLoading && architectTab === 'history' && ((historyFlow ?? flow) ? <VersionHistory key={`${(historyFlow ?? flow)!.id}:${(historyFlow ?? flow)!.updated_at ?? ''}`} canRestore={canEdit} flow={(historyFlow ?? flow)!} restoring={restoringVersion} onRestore={restoreFlowVersion} /> : <FlowSelectionRequired onBack={() => setArchitectTab('ivrs')} />)}
          {!flowLoading && architectTab === 'architecture' && <Architecture />}
        </>}

        {visibleApplication === 'collaborate' && <>
          {collaborateTab === 'overview' && <MetricsDashboard />}
          {collaborateTab === 'queue' && (canEdit ? <CollaborateQueue /> : <AccessRestricted />)}
        </>}

        {visibleApplication === 'admin' && <Suspense fallback={<div className="loading"><LoaderCircle className="spin" />{t('users.loading')}</div>}><UserManagement key={accessRevision} /></Suspense>}
      </main>
      {showAccess && <AccessDialog configured={hasManagementToken} currentUser={currentUser} onClose={() => setShowAccess(false)} onAuthenticated={() => void refreshAccess()} onClear={clearAccess} onWorkspaceChange={changeWorkspace} />}
      {showHelp && <HelpCenter canAdminister={canAdminister} canEdit={canEdit} hasFlow={Boolean(flow)} onNavigate={navigateToLearningDestination} onClose={() => setShowHelp(false)} />}
    </div>
  )
}

function FlowSelectionRequired({ onBack }: { onBack: () => void }) {
  const { t } = useI18n()
  return <section className="selection-required panel">
    <Workflow size={36} />
    <h2>{t('flow.selectTitle')}</h2>
    <p>{t('flow.selectDescription')}</p>
    <button className="primary-btn" onClick={onBack}><ListTree size={16} />{t('flow.backToCatalog')}</button>
  </section>
}

function AccessRestricted() {
  const { t } = useI18n()
  return <section className="selection-required panel"><ShieldCheck size={36} /><h2>{t('permissions.title')}</h2><p>{t('permissions.description')}</p></section>
}

function Architecture() {
  const { t } = useI18n()
  return <div className="architecture panel">
    <div className="arch-copy"><span className="eyebrow">{t('architect.eyebrow')}</span><h1>{t('architect.title')}</h1><p>{t('architect.description')}</p></div>
    <div className="arch-diagram">
      <div className="arch-node"><PlayCircle /><strong>{t('architect.browser')}</strong><span>{t('architect.restInput')}</span></div>
      <div className="arch-arrow">→</div>
      <div className="arch-node emphasis"><Network /><strong>{t('architect.engine')}</strong><span>{t('architect.stateTrace')}</span></div>
      <div className="arch-arrow">→</div>
      <div className="arch-stack"><div className="arch-node"><Bot /><strong>OpenAI</strong><span>{t('architect.intentOnly')}</span></div><div className="arch-node"><Cable /><strong>{t('architect.telephony')}</strong><span>{t('architect.webhooks')}</span></div></div>
    </div>
    <div className="principles">
      <div><strong>{t('architect.deterministic')}</strong><p>{t('architect.deterministicDescription')}</p></div>
      <div><strong>{t('architect.offline')}</strong><p>{t('architect.offlineDescription')}</p></div>
      <div><strong>{t('architect.inspectable')}</strong><p>{t('architect.inspectableDescription')}</p></div>
    </div>
  </div>
}
