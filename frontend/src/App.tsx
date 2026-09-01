import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  Cable,
  GitBranch,
  Headphones,
  KeyRound,
  Languages,
  ListTree,
  LoaderCircle,
  Network,
  PlayCircle,
  Save,
  UsersRound,
  Workflow,
} from 'lucide-react'
import { api } from './api'
import AccessDialog from './components/AccessDialog'
import CollaborateQueue from './components/CollaborateQueue'
import FlowCatalog from './components/FlowCatalog'
import FlowEditor from './components/FlowEditor'
import MetricsDashboard from './components/MetricsDashboard'
import Simulator from './components/Simulator'
import { createFlowId, createStarterFlow } from './flowFactory'
import { useI18n, type Language } from './i18n'
import type { FlowDefinition } from './types'
import { validationErrorMessage, validationSuccessMessage } from './validation'

type Application = 'architect' | 'collaborate'
type ArchitectTab = 'ivrs' | 'editor' | 'simulator' | 'architecture'
type CollaborateTab = 'overview' | 'queue'

const APPLICATION_STORAGE_KEY = 'nemesys_application'
const SELECTED_FLOW_STORAGE_KEY = 'nemesys_selected_flow'

function initialApplication(): Application {
  const stored = window.localStorage.getItem(APPLICATION_STORAGE_KEY)
  return stored === 'collaborate' ? 'collaborate' : 'architect'
}

export default function App() {
  const { language, setLanguage, t } = useI18n()
  const [flows, setFlows] = useState<FlowDefinition[]>([])
  const [flow, setFlow] = useState<FlowDefinition | null>(null)
  const [application, setApplicationState] = useState<Application>(initialApplication)
  const [architectTab, setArchitectTab] = useState<ArchitectTab>('ivrs')
  const [collaborateTab, setCollaborateTab] = useState<CollaborateTab>('overview')
  const [flowLoading, setFlowLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [creatingFlow, setCreatingFlow] = useState(false)
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [flowError, setFlowError] = useState('')
  const [hasManagementToken, setHasManagementToken] = useState(() => Boolean(window.sessionStorage.getItem('nemesys_management_token')))
  const [accessRevision, setAccessRevision] = useState(0)
  const [showAccess, setShowAccess] = useState(false)

  useEffect(() => {
    let active = true
    api.listFlows()
      .then(async drafts => {
        if (!active) return
        setFlows(drafts)
        setFlowError('')
        if (drafts.length === 0) {
          setFlow(null)
          setPublishedVersion(null)
          return
        }
        const preferredId = window.localStorage.getItem(SELECTED_FLOW_STORAGE_KEY)
        const draft = drafts.find(item => item.id === preferredId) || drafts[0]
        const versions = await api.getFlowVersions(draft.id)
        if (!active) return
        setFlow(draft)
        setPublishedVersion(versions[0]?.version ?? null)
        window.localStorage.setItem(SELECTED_FLOW_STORAGE_KEY, draft.id)
      })
      .catch(error => { if (active) setFlowError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (active) setFlowLoading(false) })
    return () => { active = false }
  }, [accessRevision])

  const setApplication = (nextApplication: Application) => {
    window.localStorage.setItem(APPLICATION_STORAGE_KEY, nextApplication)
    setApplicationState(nextApplication)
    setActionError('')
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
      setPublishedVersion(versions[0]?.version ?? null)
      window.localStorage.setItem(SELECTED_FLOW_STORAGE_KEY, nextFlow.id)
      setArchitectTab('editor')
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : String(error))
    } finally {
      setFlowLoading(false)
    }
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
      setFlows(current => current.map(item => item.id === saved.id ? saved : item))
      showNotice(validationSuccessMessage(validation, t('notice.draftSaved'), count => t('validation.warningCount', { count })))
    }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
    finally { setSaving(false) }
  }

  const publish = async (next: FlowDefinition) => {
    setPublishing(true); setNotice(''); setActionError('')
    try {
      const validation = await api.validateFlow(next)
      if (!validation.valid) throw new Error(validationErrorMessage(validation))
      const saved = await api.saveFlow(next)
      setFlow(saved)
      setFlows(current => current.map(item => item.id === saved.id ? saved : item))
      const published = await api.publishFlow(saved.id)
      setPublishedVersion(published.version ?? null)
      showNotice(validationSuccessMessage(
        validation,
        t('notice.versionPublished', { version: published.version ?? '—' }),
        count => t('validation.warningCount', { count }),
      ))
    }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)) }
    finally { setPublishing(false) }
  }

  const exportFlow = (current: FlowDefinition) => {
    const portable: FlowDefinition = { ...current, version: null, published_at: null }
    delete portable.updated_at
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

  const refreshAccess = () => {
    setHasManagementToken(Boolean(window.sessionStorage.getItem('nemesys_management_token')))
    setFlows([])
    setFlow(null)
    setFlowLoading(true)
    setFlowError('')
    setActionError('')
    setAccessRevision(value => value + 1)
    setShowAccess(false)
  }

  const clearAccess = () => {
    window.sessionStorage.removeItem('nemesys_management_token')
    window.sessionStorage.removeItem('nemesys_workspace_id')
    refreshAccess()
  }

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark"><Network size={20} /></div>
            <div><strong>Nemesys</strong><span>{t('brand.tagline')}</span></div>
          </div>

          <div className="app-switcher" role="group" aria-label={t('actions.applications')}>
            <button className={application === 'architect' ? 'active' : ''} onClick={() => setApplication('architect')}>
              <Workflow size={18} />
              <span><strong>{t('app.architect')}</strong><small>{t('app.architect.description')}</small></span>
            </button>
            <button className={application === 'collaborate' ? 'active' : ''} onClick={() => setApplication('collaborate')}>
              <UsersRound size={18} />
              <span><strong>{t('app.collaborate')}</strong><small>{t('app.collaborate.description')}</small></span>
            </button>
          </div>

          <div className="topbar-actions">
            <label className="language-picker" title={t('actions.language')}>
              <Languages size={16} />
              <select aria-label={t('actions.language')} value={language} onChange={event => setLanguage(event.target.value as Language)}>
                <option value="pt-BR">PT-BR</option>
                <option value="en-US">EN-US</option>
              </select>
            </label>
            <button className={`access-btn${hasManagementToken ? ' configured' : ''}`} onClick={() => setShowAccess(true)} title={t('actions.configureAccess')}><KeyRound size={16} />{t('actions.access')}</button>
          </div>
        </div>

        <div className="contextbar">
          <div className="context-title">
            {application === 'architect' ? <Workflow size={18} /> : <UsersRound size={18} />}
            <div>
              <strong>{application === 'architect' ? t('app.architect') : t('app.collaborate')}</strong>
              <span>{application === 'architect' ? t('app.architect.description') : t('app.collaborate.description')}</span>
            </div>
          </div>
          {application === 'architect' ? (
            <nav className="section-nav" aria-label={t('app.architect')}>
              <button className={architectTab === 'ivrs' ? 'active' : ''} onClick={() => setArchitectTab('ivrs')}><ListTree size={16} />{t('nav.ivrs')}</button>
              <button className={architectTab === 'editor' ? 'active' : ''} onClick={() => setArchitectTab('editor')}><GitBranch size={16} />{t('nav.editor')}</button>
              <button className={architectTab === 'simulator' ? 'active' : ''} onClick={() => setArchitectTab('simulator')}><PlayCircle size={16} />{t('nav.simulator')}</button>
              <button className={architectTab === 'architecture' ? 'active' : ''} onClick={() => setArchitectTab('architecture')}><Activity size={16} />{t('nav.architecture')}</button>
            </nav>
          ) : (
            <nav className="section-nav" aria-label={t('app.collaborate')}>
              <button className={collaborateTab === 'overview' ? 'active' : ''} onClick={() => setCollaborateTab('overview')}><BarChart3 size={16} />{t('nav.overview')}</button>
              <button className={collaborateTab === 'queue' ? 'active' : ''} onClick={() => setCollaborateTab('queue')}><Headphones size={16} />{t('nav.queue')}</button>
            </nav>
          )}
        </div>
      </header>

      <main>
        {notice && <div className="toast"><Save size={15} />{notice}</div>}
        {actionError && <div className="error-box top-error">{actionError}</div>}

        {application === 'architect' && <>
          {flowError && <div className="error-box top-error">{flowError}</div>}
          {flowLoading && <div className="loading"><LoaderCircle className="spin" />{t('app.loadingFlow')}</div>}
          {!flowLoading && architectTab === 'ivrs' && <FlowCatalog flows={flows} selectedFlowId={flow?.id ?? null} creating={creatingFlow} onCreate={createFlow} onOpen={openFlow} />}
          {!flowLoading && architectTab === 'editor' && (flow ? <FlowEditor key={`${flow.id}:${flow.updated_at ?? ''}`} flow={flow} onSave={save} onPublish={publish} onExport={exportFlow} onImport={importFlow} saving={saving} publishing={publishing} importing={importing} publishedVersion={publishedVersion} /> : <FlowSelectionRequired onBack={() => setArchitectTab('ivrs')} />)}
          {!flowLoading && architectTab === 'simulator' && (flow ? <Simulator flow={flow} /> : <FlowSelectionRequired onBack={() => setArchitectTab('ivrs')} />)}
          {!flowLoading && architectTab === 'architecture' && <Architecture />}
        </>}

        {application === 'collaborate' && <>
          {collaborateTab === 'overview' && <MetricsDashboard />}
          {collaborateTab === 'queue' && <CollaborateQueue />}
        </>}
      </main>
      {showAccess && <AccessDialog configured={hasManagementToken} onClose={() => setShowAccess(false)} onAuthenticated={refreshAccess} onClear={clearAccess} />}
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
