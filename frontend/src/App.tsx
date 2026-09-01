import { useEffect, useState } from 'react'
import { Activity, BarChart3, Bot, Cable, GitBranch, Github, KeyRound, LoaderCircle, Network, PlayCircle, Save } from 'lucide-react'
import { api } from './api'
import AccessDialog from './components/AccessDialog'
import FlowEditor from './components/FlowEditor'
import MetricsDashboard from './components/MetricsDashboard'
import Simulator from './components/Simulator'
import type { FlowDefinition } from './types'
import { validationErrorMessage, validationSuccessMessage } from './validation'

export default function App() {
  const [flow, setFlow] = useState<FlowDefinition | null>(null)
  const [tab, setTab] = useState<'editor' | 'simulator' | 'metrics' | 'architecture'>('editor')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [hasManagementToken, setHasManagementToken] = useState(() => Boolean(window.sessionStorage.getItem('revelys_management_token')))
  const [accessRevision, setAccessRevision] = useState(0)
  const [showAccess, setShowAccess] = useState(false)

  useEffect(() => {
    api.listFlows()
      .then(async drafts => {
        if (drafts.length === 0) throw new Error('This workspace has no flows. Import a flow JSON to get started.')
        const draft = drafts[0]
        const versions = await api.getFlowVersions(draft.id)
        setFlow(draft)
        setPublishedVersion(versions[0]?.version ?? null)
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [accessRevision])

  const save = async (next: FlowDefinition) => {
    setSaving(true); setNotice(''); setError('')
    try {
      const validation = await api.validateFlow(next)
      if (!validation.valid) throw new Error(validationErrorMessage(validation))
      const saved = await api.saveFlow(next)
      setFlow(saved)
      setNotice(validationSuccessMessage(validation, 'Draft saved successfully.'))
      setTimeout(() => setNotice(''), 2200)
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const publish = async (next: FlowDefinition) => {
    setPublishing(true); setNotice(''); setError('')
    try {
      const validation = await api.validateFlow(next)
      if (!validation.valid) throw new Error(validationErrorMessage(validation))
      const saved = await api.saveFlow(next)
      setFlow(saved)
      const published = await api.publishFlow(saved.id)
      setPublishedVersion(published.version ?? null)
      setNotice(validationSuccessMessage(validation, `Version ${published.version} published successfully.`))
      setTimeout(() => setNotice(''), 2200)
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
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
    setNotice('Flow exported successfully.')
    setTimeout(() => setNotice(''), 2200)
  }

  const importFlow = async (file: File) => {
    setImporting(true); setNotice(''); setError('')
    try {
      const parsed = JSON.parse(await file.text()) as FlowDefinition
      const imported = await api.importFlow(parsed, true)
      setFlow(imported)
      setPublishedVersion(null)
      setNotice(`Flow “${imported.name}” imported as a draft.`)
      setTimeout(() => setNotice(''), 2200)
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setImporting(false) }
  }

  const refreshAccess = () => {
    setHasManagementToken(Boolean(window.sessionStorage.getItem('revelys_management_token')))
    setFlow(null)
    setError('')
    setAccessRevision(value => value + 1)
    setShowAccess(false)
  }

  const clearAccess = () => {
    window.sessionStorage.removeItem('revelys_management_token')
    window.sessionStorage.removeItem('revelys_workspace_id')
    refreshAccess()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Network size={20} /></div><div><strong>Revelys</strong><span>AI-assisted call flow engineering</span></div></div>
        <nav>
          <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}><GitBranch size={16} />Flow editor</button>
          <button className={tab === 'simulator' ? 'active' : ''} onClick={() => setTab('simulator')}><PlayCircle size={16} />Simulator</button>
          <button className={tab === 'metrics' ? 'active' : ''} onClick={() => setTab('metrics')}><BarChart3 size={16} />Metrics</button>
          <button className={tab === 'architecture' ? 'active' : ''} onClick={() => setTab('architecture')}><Activity size={16} />Architecture</button>
        </nav>
        <div className="topbar-actions">
          <button className={`access-btn${hasManagementToken ? ' configured' : ''}`} onClick={() => setShowAccess(true)} title="Configure workspace access"><KeyRound size={16} />Access</button>
          <a className="github-link" href="https://github.com/felipetunes/revelys" target="_blank" rel="noreferrer"><Github size={17} />GitHub</a>
        </div>
      </header>

      <main>
        {notice && <div className="toast"><Save size={15} />{notice}</div>}
        {error && <div className="error-box top-error">{error}</div>}
        {!flow && !error && <div className="loading"><LoaderCircle className="spin" />Loading demo flow…</div>}
        {flow && tab === 'editor' && <FlowEditor key={`${flow.id}:${flow.updated_at ?? ''}`} flow={flow} onSave={save} onPublish={publish} onExport={exportFlow} onImport={importFlow} saving={saving} publishing={publishing} importing={importing} publishedVersion={publishedVersion} />}
        {flow && tab === 'simulator' && <Simulator flow={flow} />}
        {flow && tab === 'metrics' && <MetricsDashboard />}
        {flow && tab === 'architecture' && <Architecture />}
      </main>
      {showAccess && <AccessDialog configured={hasManagementToken} onClose={() => setShowAccess(false)} onAuthenticated={refreshAccess} onClear={clearAccess} />}
    </div>
  )
}

function Architecture() {
  return <div className="architecture panel">
    <div className="arch-copy"><span className="eyebrow">SYSTEM DESIGN</span><h1>One runtime, multiple channels.</h1><p>The browser simulator and telephony adapter both drive the same deterministic flow engine. AI is bounded to classification; it cannot arbitrarily mutate routing.</p></div>
    <div className="arch-diagram">
      <div className="arch-node"><PlayCircle /><strong>Browser simulator</strong><span>REST input</span></div>
      <div className="arch-arrow">→</div>
      <div className="arch-node emphasis"><Network /><strong>Flow engine</strong><span>state + trace</span></div>
      <div className="arch-arrow">→</div>
      <div className="arch-stack"><div className="arch-node"><Bot /><strong>OpenAI</strong><span>intent only</span></div><div className="arch-node"><Cable /><strong>Telephony</strong><span>webhooks</span></div></div>
    </div>
    <div className="principles"><div><strong>Deterministic routing</strong><p>Models return a closed intent enum. Edges remain explicit.</p></div><div><strong>Offline first</strong><p>No API key? The local classifier keeps the demo usable.</p></div><div><strong>Inspectable execution</strong><p>Every prompt, transition, variable and AI result appears in the trace.</p></div></div>
  </div>
}
