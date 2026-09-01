import { useCallback, useEffect, useState } from 'react'
import { Clock3, Headphones, Inbox, LoaderCircle, RefreshCw, UserCheck } from 'lucide-react'
import { api } from '../api'
import { useI18n } from '../i18n'
import type { CallSession } from '../types'

const AGENT_STORAGE_KEY = 'nemesys_agent_name'

export default function CollaborateQueue() {
  const { language, t } = useI18n()
  const [sessions, setSessions] = useState<CallSession[]>([])
  const [agentName, setAgentName] = useState(() => window.localStorage.getItem(AGENT_STORAGE_KEY) || '')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setSessions(await api.listQueuedSessions()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    api.listQueuedSessions()
      .then(value => { if (active) setSessions(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const claim = async (session: CallSession) => {
    if (!agentName.trim()) return
    setClaimingId(session.id); setError(''); setNotice('')
    try {
      const normalizedAgentName = agentName.trim()
      await api.claimQueueSession(session.id, normalizedAgentName)
      window.localStorage.setItem(AGENT_STORAGE_KEY, normalizedAgentName)
      setSessions(current => current.filter(item => item.id !== session.id))
      setNotice(t('queue.claimed', { agent: normalizedAgentName }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setClaimingId(null)
    }
  }

  const formatQueuedAt = (value?: string | null) => {
    if (!value) return '—'
    return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  }

  return <div className="queue-page">
    <div className="queue-heading">
      <div><span className="eyebrow">{t('queue.eyebrow')}</span><h1>{t('queue.title')}</h1><p>{t('queue.description')}</p></div>
      <div className="queue-heading-actions">
        <span className="queue-count"><Headphones size={15} />{t('queue.waiting', { count: sessions.length })}</span>
        <button className="secondary-btn" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} />{t('metrics.refresh')}</button>
      </div>
    </div>

    <section className="agent-bar panel">
      <label>{t('queue.agentName')}<input value={agentName} onChange={event => setAgentName(event.target.value)} placeholder={t('queue.agentPlaceholder')} /></label>
    </section>

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="inline-notice"><UserCheck size={16} />{notice}</div>}
    {loading && sessions.length === 0 && <div className="loading"><LoaderCircle className="spin" />{t('metrics.loading')}</div>}
    {!loading && sessions.length === 0 && <section className="queue-empty panel"><Inbox size={34} /><h2>{t('queue.emptyTitle')}</h2><p>{t('queue.emptyDescription')}</p></section>}

    <div className="queue-list">
      {sessions.map(session => <article className="queue-card panel" key={session.id}>
        <div className="queue-card-icon"><Headphones size={20} /></div>
        <div className="queue-card-copy">
          <strong>{t('queue.session', { id: session.id.slice(0, 8) })}</strong>
          <span>{t('queue.flow', { id: session.flow_id, version: session.flow_version })}</span>
          <small><Clock3 size={12} />{t('queue.queuedAt', { time: formatQueuedAt(session.queued_at) })}</small>
        </div>
        <div className="queue-card-name">{session.queue_name || '—'}</div>
        <button className="primary-btn" disabled={!agentName.trim() || claimingId !== null} onClick={() => claim(session)}><UserCheck size={16} />{claimingId === session.id ? t('queue.claiming') : t('queue.claim')}</button>
      </article>)}
    </div>
  </div>
}
