import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Gauge, LoaderCircle, RefreshCw } from 'lucide-react'
import { api } from '../api'
import type { MetricsSummary } from '../types'

function Distribution({ title, values }: { title: string; values: Record<string, number> }) {
  const maximum = Math.max(...Object.values(values), 1)
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1])
  return <section className="metric-distribution panel">
    <h2>{title}</h2>
    {entries.length === 0 && <div className="empty-state">No data yet.</div>}
    {entries.map(([label, value]) => <div className="metric-bar-row" key={label}>
      <div><span>{label.replaceAll('_', ' ')}</span><strong>{value}</strong></div>
      <div className="metric-bar-track"><span style={{ width: `${(value / maximum) * 100}%` }} /></div>
    </div>)}
  </section>
}

export default function MetricsDashboard() {
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

  if (loading && !metrics) return <div className="loading"><LoaderCircle className="spin" />Loading operational metrics…</div>
  if (error && !metrics) return <div className="error-box top-error">{error}</div>
  if (!metrics) return null

  return <div className="metrics-page">
    <div className="metrics-heading">
      <div><span className="eyebrow">OPERATIONS</span><h1>Runtime metrics</h1><p>Derived from persisted sessions and execution traces.</p></div>
      <button className="secondary-btn" onClick={load} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16} />Refresh</button>
    </div>
    {error && <div className="error-box">{error}</div>}
    <div className="metric-cards">
      <div className="metric-card panel"><Activity /><span>Total sessions</span><strong>{metrics.total_sessions}</strong></div>
      <div className="metric-card panel"><Clock3 /><span>Last 24 hours</span><strong>{metrics.sessions_last_24h}</strong></div>
      <div className="metric-card panel"><CheckCircle2 /><span>Completion rate</span><strong>{Math.round(metrics.completion_rate * 100)}%</strong></div>
      <div className="metric-card panel"><Gauge /><span>Average duration</span><strong>{metrics.average_duration_seconds.toFixed(1)}s</strong></div>
    </div>
    <div className="metric-grid">
      <Distribution title="Session status" values={metrics.status_counts} />
      <Distribution title="Detected intents" values={metrics.intent_counts} />
      <Distribution title="Channels" values={metrics.channel_counts} />
    </div>
  </div>
}
