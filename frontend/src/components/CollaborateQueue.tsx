import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Bot, ClipboardCheck, Clock3, Contact, Headphones, Inbox, ListChecks, LoaderCircle, MessageSquareText, Radio, RefreshCw, Save, Sparkles, UserCheck, UserRound } from 'lucide-react'
import { api } from '../api'
import { getManagementToken } from '../authStorage'
import { useI18n, type TranslationKey } from '../i18n'
import type { AgentPresence, AgentRoutingStatus, AgentState, AuthMe, CallSession, WrapUpCode } from '../types'

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
  const isAuthenticated = Boolean(getManagementToken())
  const storedAgentName = window.localStorage.getItem(AGENT_STORAGE_KEY) || ''
  const [sessions, setSessions] = useState<CallSession[]>([])
  const [assignedSessions, setAssignedSessions] = useState<CallSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState(storedAgentName)
  const [activeAgentName, setActiveAgentName] = useState(storedAgentName)
  const [currentUser, setCurrentUser] = useState<AuthMe | null>(null)
  const [agentState, setAgentState] = useState<AgentState | null>(null)
  const [wrapUpCodes, setWrapUpCodes] = useState<Record<string, WrapUpCode>>({})
  const [wrapUpNotes, setWrapUpNotes] = useState<Record<string, string>>({})
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [wrappingId, setWrappingId] = useState<string | null>(null)
  const [presenceUpdating, setPresenceUpdating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const applyQueueState = useCallback((state: Awaited<ReturnType<typeof fetchQueueState>>) => {
    setSessions(state.waiting)
    setAssignedSessions(state.assigned)
    setAgentState(state.agent)
    setSelectedSessionId(current => state.assigned.some(item => item.id === current) ? current : state.assigned[0]?.id || null)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      applyQueueState(await fetchQueueState(activeAgentName))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [activeAgentName, applyQueueState])

  useEffect(() => {
    let active = true
    const identity = isAuthenticated ? api.me() : Promise.resolve(null)
    identity
      .then(me => {
        if (!active) return
        setCurrentUser(me)
        const resolvedName = me?.email || window.localStorage.getItem(AGENT_STORAGE_KEY) || ''
        setAgentName(resolvedName)
        setActiveAgentName(resolvedName)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { active = false }
  }, [isAuthenticated])

  useEffect(() => {
    let active = true
    fetchQueueState(activeAgentName)
      .then(state => {
        if (!active) return
        applyQueueState(state)
        setError('')
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [activeAgentName, applyQueueState])

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
    setPresenceUpdating(true)
    setError('')
    try {
      setAgentState(await api.updateAgentPresence(activeAgentName, presence))
      setNotice(t('queue.presenceUpdated'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setPresenceUpdating(false)
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
      setSelectedSessionId(claimed.id)
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
      const remaining = assignedSessions.filter(item => item.id !== session.id)
      setAssignedSessions(remaining)
      setSelectedSessionId(remaining[0]?.id || null)
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

  const selectedSession = assignedSessions.find(session => session.id === selectedSessionId) || assignedSessions[0]
  const currentWorkspace = currentUser?.workspaces.find(workspace => workspace.id === currentUser.active_workspace_id)
  const nextActionKey: TranslationKey = !activeAgentName
    ? 'agentDesktop.identityAction'
    : agentState?.routing_status === 'interacting'
      ? 'agentDesktop.interactingAction'
      : agentState?.presence === 'on_queue' && agentState.routing_status === 'idle'
        ? 'agentDesktop.readyAction'
        : agentState?.routing_status === 'not_responding'
          ? 'agentDesktop.unavailableAction'
          : 'agentDesktop.queueAction'

  return <div className="queue-page agent-desktop-page">
    <div className="queue-heading">
      <div><span className="eyebrow">{t('queue.eyebrow')}</span><h1>{t('agentDesktop.title')}</h1><p>{t('agentDesktop.description')}</p></div>
      <div className="queue-heading-actions">
        <span className="queue-count"><Headphones size={15} />{t('queue.waiting', { count: sessions.length })}</span>
        <span className="queue-count"><ClipboardCheck size={15} />{t('queue.assignedCount', { count: assignedSessions.length })}</span>
        <button className="secondary-btn" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} />{t('metrics.refresh')}</button>
      </div>
    </div>

    <section className="agent-console panel">
      <div className="agent-profile">
        <span className="agent-avatar"><UserRound size={22} /></span>
        <div><small>{t('agentDesktop.signedInAs')}</small><strong>{activeAgentName || t('agentDesktop.noAgent')}</strong><span>{currentWorkspace ? t('agentDesktop.role', { role: t(`role.${currentWorkspace.role}` as TranslationKey) }) : t('agentDesktop.offlineIdentity')}</span></div>
      </div>
      <div className="agent-availability">
        <label>{t('queue.presence')}<select disabled={!activeAgentName || presenceUpdating || agentState?.routing_status === 'interacting'} value={agentState?.presence || 'offline'} onChange={event => void updatePresence(event.target.value as AgentPresence)}>{presenceOptions.map(presence => <option key={presence} value={presence}>{t(presenceKeys[presence])}</option>)}</select></label>
        <div className="agent-routing"><span>{t('queue.routingStatus')}</span><strong className={`state-pill state-pill--${agentState?.routing_status || 'off_queue'}`}>{t(routingKeys[agentState?.routing_status || 'off_queue'])}</strong></div>
      </div>
      {!currentUser && <form className="agent-identity" onSubmit={useAgent}>
        <label>{t('queue.agentName')}<input value={agentName} onChange={event => setAgentName(event.target.value)} placeholder={t('queue.agentPlaceholder')} /></label>
        <button className="secondary-btn" type="submit" disabled={!agentName.trim()}><UserCheck size={16} />{t('queue.useAgent')}</button>
      </form>}
    </section>

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="inline-notice"><UserCheck size={16} />{notice}</div>}
    <section className={`agent-next-action${agentState?.presence === 'on_queue' && agentState.routing_status === 'idle' ? ' ready' : ''}`} aria-live="polite">
      <Sparkles size={18} />
      <div><strong>{t('agentDesktop.nextAction')}</strong><span>{t(nextActionKey)}</span></div>
      {activeAgentName && agentState?.routing_status !== 'interacting' && <button className={agentState?.presence === 'on_queue' ? 'secondary-btn' : 'primary-btn'} disabled={presenceUpdating} onClick={() => void updatePresence(agentState?.presence === 'on_queue' ? 'available' : 'on_queue')}><Headphones size={16} />{t(agentState?.presence === 'on_queue' ? 'queue.leaveQueue' : 'queue.enterQueue')}</button>}
    </section>
    {loading && sessions.length === 0 && assignedSessions.length === 0 && <div className="loading"><LoaderCircle className="spin" />{t('metrics.loading')}</div>}

    <section className="agent-workspace panel">
      <aside className="interaction-inbox">
        <div className="interaction-inbox-heading"><div><ListChecks size={17} /><strong>{t('queue.assignedTitle')}</strong></div><span>{assignedSessions.length}</span></div>
        {assignedSessions.length === 0 && <div className="interaction-inbox-empty"><ClipboardCheck size={26} /><span>{t('queue.noAssigned')}</span></div>}
        {assignedSessions.map(session => <button key={session.id} className={selectedSession?.id === session.id ? 'active' : ''} onClick={() => setSelectedSessionId(session.id)}>
          <span className="interaction-channel"><Headphones size={16} /></span>
          <span><strong>{t('queue.session', { id: session.id.slice(0, 8) })}</strong><small>{session.queue_name || '—'} · {t(`status.${session.status}` as TranslationKey)}</small></span>
        </button>)}
      </aside>

      <div className="interaction-detail">
        {!selectedSession && <div className="interaction-placeholder"><Contact size={38} /><h2>{t('agentDesktop.readyTitle')}</h2><p>{t('agentDesktop.readyDescription')}</p></div>}
        {selectedSession && <>
          <div className="interaction-detail-heading">
            <div><span className="eyebrow">{t('agentDesktop.activeInteraction')}</span><h2>{t('queue.session', { id: selectedSession.id.slice(0, 8) })}</h2><p>{t('queue.flow', { id: selectedSession.flow_id, version: selectedSession.flow_version })}</p></div>
            <strong className={`state-pill state-pill--${selectedSession.status === 'wrap_up' ? 'interacting' : 'idle'}`}>{t(`status.${selectedSession.status}` as TranslationKey)}</strong>
          </div>
          <div className="customer-context">
            <div><Radio size={16} /><span>{t('agentDesktop.channel')}</span><strong>{String(selectedSession.variables.channel || 'browser')}</strong></div>
            <div><Bot size={16} /><span>{t('agentDesktop.intent')}</span><strong>{String(selectedSession.variables.intent || '—').replaceAll('_', ' ')}</strong></div>
            <div><Headphones size={16} /><span>{t('agentDesktop.queue')}</span><strong>{selectedSession.queue_name || '—'}</strong></div>
          </div>
          <div className="interaction-journey">
            <div className="interaction-section-title"><MessageSquareText size={15} /><strong>{t('agentDesktop.journey')}</strong></div>
            <div className="journey-list">{selectedSession.trace.slice(-6).map(event => <div key={event.seq}><span>{String(event.seq).padStart(2, '0')}</span><div><strong>{event.type.replaceAll('_', ' ')}</strong><p>{event.message}</p></div></div>)}</div>
          </div>
          {selectedSession.status === 'wrap_up' && <div className="wrap-up-panel">
            <div className="interaction-section-title"><ClipboardCheck size={15} /><strong>{t('queue.wrapUpTitle')}</strong></div>
            <div className="wrap-up-form">
              <label>{t('queue.wrapUpCode')}<select value={wrapUpCodes[selectedSession.id] || 'resolved'} onChange={event => setWrapUpCodes(current => ({ ...current, [selectedSession.id]: event.target.value as WrapUpCode }))}>{wrapUpOptions.map(code => <option key={code} value={code}>{t(wrapUpKeys[code])}</option>)}</select></label>
              <label>{t('queue.wrapUpNotes')}<textarea value={wrapUpNotes[selectedSession.id] || ''} onChange={event => setWrapUpNotes(current => ({ ...current, [selectedSession.id]: event.target.value }))} placeholder={t('queue.wrapUpNotesPlaceholder')} /></label>
              <button className="primary-btn" disabled={wrappingId !== null} onClick={() => void completeWrapUp(selectedSession)}><Save size={16} />{wrappingId === selectedSession.id ? t('queue.wrappingUp') : t('queue.completeWrapUp')}</button>
            </div>
          </div>}
        </>}
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
