import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Gauge, LoaderCircle, RefreshCw } from 'lucide-react'
import { api } from '../api'
import { useI18n, type TranslationKey } from '../i18n'
import type { MetricsSummary } from '../types'

function Distribution({ title, values, formatLabel }: { title: string; values: Record<string, number>; formatLabel?: (label: string) => string }) {
  const { t } = useI18n()
  const maximum = Math.max(...Object.values(values), 1)
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1])
  return <section className="metric-distribution panel">
    <h2>{title}</h2>
    {entries.length === 0 && <div className="empty-state">{t('metrics.noData')}</div>}
    {entries.map(([label, value]) => <div className="metric-bar-row" key={label}>
      <div><span>{formatLabel ? formatLabel(label) : label.replaceAll('_', ' ')}</span><strong>{value}</strong></div>
      <div className="metric-bar-track"><span style={{ width: `${(value / maximum) * 100}%` }} /></div>
    </div>)}
  </section>
}

export default function MetricsDashboard() {
  const { language, t } = useI18n()
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true); setError('')
    try { setMetrics(await api.getMetrics()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let active = true
    api.getMetrics()
      .then(value => { if (active) setMetrics(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading && !metrics) return <div className="loading"><LoaderCircle className="spin" />{t('metrics.loading')}</div>
  if (error && !metrics) return <div className="error-box top-error">{error}</div>
  if (!metrics) return null

  const statusKeys: Record<string, TranslationKey> = {
    running: 'status.running',
    waiting_input: 'status.waiting_input',
    queued: 'status.queued',
    completed: 'status.completed',
    failed: 'status.failed',
  }
  const channelKeys: Record<string, TranslationKey> = {
    browser: 'channel.browser',
    twilio: 'channel.twilio',
    generic: 'channel.generic',
  }

  return <div className="metrics-page">
    <div className="metrics-heading">
      <div><span className="eyebrow">{t('metrics.eyebrow')}</span><h1>{t('metrics.title')}</h1><p>{t('metrics.description')}</p></div>
      <button className="secondary-btn" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} />{t('metrics.refresh')}</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="metric-cards">
      <div className="metric-card panel"><Activity /><span>{t('metrics.totalSessions')}</span><strong>{metrics.total_sessions}</strong></div>
      <div className="metric-card panel"><Clock3 /><span>{t('metrics.last24Hours')}</span><strong>{metrics.sessions_last_24h}</strong></div>
      <div className="metric-card panel"><CheckCircle2 /><span>{t('metrics.completionRate')}</span><strong>{Math.round(metrics.completion_rate * 100)}%</strong></div>
      <div className="metric-card panel"><Gauge /><span>{t('metrics.averageDuration')}</span><strong>{metrics.average_duration_seconds.toLocaleString(language, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}s</strong></div>
    </div>
    <div className="metric-grid">
      <Distribution title={t('metrics.sessionStatus')} values={metrics.status_counts} formatLabel={label => statusKeys[label] ? t(statusKeys[label]) : label.replaceAll('_', ' ')} />
      <Distribution title={t('metrics.detectedIntents')} values={metrics.intent_counts} />
      <Distribution title={t('metrics.channels')} values={metrics.channel_counts} formatLabel={label => channelKeys[label] ? t(channelKeys[label]) : label.replaceAll('_', ' ')} />
    </div>
  </div>
}
