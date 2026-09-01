import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ClipboardCheck, Clock3, Headphones, Inbox, LoaderCircle, RefreshCw, Save, UserCheck } from 'lucide-react'
import { api } from '../api'
import { useI18n, type TranslationKey } from '../i18n'
import type { AgentPresence, AgentRoutingStatus, AgentState, CallSession, WrapUpCode } from '../types'

const AGENT_STORAGE_KEY = 'nemesys_agent_name'
const presenceOptions: AgentPresence[] = ['offline', 'available', 'away', 'busy', 'on_queue']
const wrapUpOptions: WrapUpCode[] = ['resolved', 'transferred', 'callback_requested', 'no_response', 'other']

const presenceKeys: Record<AgentPresence, TranslationKey> = {
  offline: 'presence.offline',
  available: 'presence.available',
  away: 'presence.away',
  busy: 'presence.busy',
  on_queue: 'presence.on_queue',
}

const routingKeys: Record<AgentRoutingStatus, TranslationKey> = {
  off_queue: 'routing.off_queue',
  idle: 'routing.idle',
  interacting: 'routing.interacting',
  not_responding: 'routing.not_responding',
}

const wrapUpKeys: Record<WrapUpCode, TranslationKey> = {
  resolved: 'wrapUp.resolved',
  transferred: 'wrapUp.transferred',
  callback_requested: 'wrapUp.callback_requested',
  no_response: 'wrapUp.no_response',
  other: 'wrapUp.other',
}

async function fetchQueueState(agentName: string) {
  const [waiting, agents, assigned] = await Promise.all([
    api.listQueuedSessions(),
    api.listAgentStates(),
    agentName ? api.listAssignedSessions(agentName) : Promise.resolve([]),
  ])
  return { waiting, assigned, agent: agents.find(item => item.agent_name === agentName) || null }
}

export default function CollaborateQueue() {
  const { language, t } = useI18n()
  const storedAgentName = window.localStorage.getItem(AGENT_STORAGE_KEY) || ''
  const [sessions, setSessions] = useState<CallSession[]>([])
  const [assignedSessions, setAssignedSessions] = useState<CallSession[]>([])
  const [agentName, setAgentName] = useState(storedAgentName)
  const [activeAgentName, setActiveAgentName] = useState(storedAgentName)
  const [agentState, setAgentState] = useState<AgentState | null>(null)
  const [wrapUpCodes, setWrapUpCodes] = useState<Record<string, WrapUpCode>>({})
  const [wrapUpNotes, setWrapUpNotes] = useState<Record<string, string>>({})
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [wrappingId, setWrappingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const state = await fetchQueueState(activeAgentName)
      setSessions(state.waiting)
      setAssignedSessions(state.assigned)
      setAgentState(state.agent)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [activeAgentName])

  useEffect(() => {
    let active = true
    fetchQueueState(activeAgentName)
      .then(state => {
        if (!active) return
        setSessions(state.waiting)
        setAssignedSessions(state.assigned)
        setAgentState(state.agent)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [activeAgentName])

  const useAgent = (event: FormEvent) => {
    event.preventDefault()
    const normalizedAgentName = agentName.trim()
    if (!normalizedAgentName) return
    window.localStorage.setItem(AGENT_STORAGE_KEY, normalizedAgentName)
    setAgentName(normalizedAgentName)
    setNotice('')
    if (normalizedAgentName === activeAgentName) void load()
    else setActiveAgentName(normalizedAgentName)
  }

  const updatePresence = async (presence: AgentPresence) => {
    if (!activeAgentName) return
    setError('')
    try {
      setAgentState(await api.updateAgentPresence(activeAgentName, presence))
      setNotice(t('queue.presenceUpdated'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const claim = async (session: CallSession) => {
    if (!activeAgentName || agentState?.presence !== 'on_queue' || agentState.routing_status !== 'idle') return
    setClaimingId(session.id)
    setError('')
    setNotice('')
    try {
      const claimed = await api.claimQueueSession(session.id, activeAgentName)
      setSessions(current => current.filter(item => item.id !== session.id))
      setAssignedSessions(current => [claimed, ...current.filter(item => item.id !== claimed.id)])
      setAgentState(current => current ? { ...current, routing_status: 'interacting' } : current)
      setNotice(t('queue.claimed', { agent: activeAgentName }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setClaimingId(null)
    }
  }

  const completeWrapUp = async (session: CallSession) => {
    const code = wrapUpCodes[session.id] || 'resolved'
    setWrappingId(session.id)
    setError('')
    setNotice('')
    try {
      await api.completeWrapUp(session.id, code, wrapUpNotes[session.id] || '')
      setAssignedSessions(current => current.filter(item => item.id !== session.id))
      setAgentState(current => current ? { ...current, routing_status: current.presence === 'on_queue' ? 'idle' : 'off_queue' } : current)
      setNotice(t('queue.wrapUpCompleted'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setWrappingId(null)
    }
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  }

  return <div className="queue-page">
    <div className="queue-heading">
      <div><span className="eyebrow">{t('queue.eyebrow')}</span><h1>{t('queue.title')}</h1><p>{t('queue.description')}</p></div>
      <div className="queue-heading-actions">
        <span className="queue-count"><Headphones size={15} />{t('queue.waiting', { count: sessions.length })}</span>
        <span className="queue-count"><ClipboardCheck size={15} />{t('queue.assignedCount', { count: assignedSessions.length })}</span>
        <button className="secondary-btn" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} />{t('metrics.refresh')}</button>
      </div>
    </div>

    <section className="agent-bar panel">
      <form className="agent-identity" onSubmit={useAgent}>
        <label>{t('queue.agentName')}<input value={agentName} onChange={event => setAgentName(event.target.value)} placeholder={t('queue.agentPlaceholder')} /></label>
        <button className="secondary-btn" type="submit" disabled={!agentName.trim()}><UserCheck size={16} />{t('queue.useAgent')}</button>
      </form>
      <div className="agent-availability">
        <label>{t('queue.presence')}<select disabled={!activeAgentName} value={agentState?.presence || 'offline'} onChange={event => void updatePresence(event.target.value as AgentPresence)}>{presenceOptions.map(presence => <option key={presence} value={presence}>{t(presenceKeys[presence])}</option>)}</select></label>
        <div className="agent-routing"><span>{t('queue.routingStatus')}</span><strong className={`state-pill state-pill--${agentState?.routing_status || 'off_queue'}`}>{t(routingKeys[agentState?.routing_status || 'off_queue'])}</strong></div>
      </div>
      {activeAgentName && <small className="agent-active">{t('queue.activeAgent', { agent: activeAgentName })}</small>}
    </section>

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="inline-notice"><UserCheck size={16} />{notice}</div>}
    {(agentState?.presence !== 'on_queue' || agentState.routing_status !== 'idle') && <div className="queue-guidance">{t('queue.claimRequiresOnQueue')}</div>}
    {loading && sessions.length === 0 && assignedSessions.length === 0 && <div className="loading"><LoaderCircle className="spin" />{t('metrics.loading')}</div>}

    <section className="queue-section">
      <div className="queue-section-heading"><h2>{t('queue.assignedTitle')}</h2><span>{assignedSessions.length}</span></div>
      {!loading && assignedSessions.length === 0 && <div className="queue-section-empty panel"><ClipboardCheck size={24} /><span>{t('queue.noAssigned')}</span></div>}
      <div className="queue-list">
        {assignedSessions.map(session => <article className="queue-card queue-card--assigned panel" key={session.id}>
          <div className="queue-card-icon"><UserCheck size={20} /></div>
          <div className="queue-card-copy">
            <strong>{t('queue.session', { id: session.id.slice(0, 8) })}</strong>
            <span>{t('queue.flow', { id: session.flow_id, version: session.flow_version })}</span>
            <small>{t('queue.interactionStatus', { status: t(`status.${session.status}` as TranslationKey) })}</small>
          </div>
          {session.status === 'wrap_up' && <div className="wrap-up-form">
            <label>{t('queue.wrapUpCode')}<select value={wrapUpCodes[session.id] || 'resolved'} onChange={event => setWrapUpCodes(current => ({ ...current, [session.id]: event.target.value as WrapUpCode }))}>{wrapUpOptions.map(code => <option key={code} value={code}>{t(wrapUpKeys[code])}</option>)}</select></label>
            <label>{t('queue.wrapUpNotes')}<textarea value={wrapUpNotes[session.id] || ''} onChange={event => setWrapUpNotes(current => ({ ...current, [session.id]: event.target.value }))} placeholder={t('queue.wrapUpNotesPlaceholder')} /></label>
            <button className="primary-btn" disabled={wrappingId !== null} onClick={() => void completeWrapUp(session)}><Save size={16} />{wrappingId === session.id ? t('queue.wrappingUp') : t('queue.completeWrapUp')}</button>
          </div>}
        </article>)}
      </div>
    </section>

    <section className="queue-section">
      <div className="queue-section-heading"><h2>{t('queue.waitingTitle')}</h2><span>{sessions.length}</span></div>
      {!loading && sessions.length === 0 && <section className="queue-empty panel"><Inbox size={34} /><h2>{t('queue.emptyTitle')}</h2><p>{t('queue.emptyDescription')}</p></section>}
      <div className="queue-list">
        {sessions.map(session => <article className="queue-card panel" key={session.id}>
          <div className="queue-card-icon"><Headphones size={20} /></div>
          <div className="queue-card-copy">
            <strong>{t('queue.session', { id: session.id.slice(0, 8) })}</strong>
            <span>{t('queue.flow', { id: session.flow_id, version: session.flow_version })}</span>
            <small><Clock3 size={12} />{t('queue.queuedAt', { time: formatDateTime(session.queued_at) })}</small>
          </div>
          <div className="queue-card-name">{session.queue_name || '—'}</div>
          <button className="primary-btn" disabled={agentState?.presence !== 'on_queue' || agentState.routing_status !== 'idle' || claimingId !== null} onClick={() => void claim(session)}><UserCheck size={16} />{claimingId === session.id ? t('queue.claiming') : t('queue.claim')}</button>
        </article>)}
      </div>
    </section>
  </div>
}
