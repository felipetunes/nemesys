import { useEffect, useMemo, useState } from 'react'
import { Clock3, GitCompareArrows, History, LoaderCircle, RotateCcw } from 'lucide-react'
import { api } from '../api'
import { summarizeFlowDiff } from '../flowDiff'
import { useI18n } from '../i18n'
import type { FlowDefinition } from '../types'

interface Props {
  flow: FlowDefinition
  restoring: boolean
  onRestore: (version: number) => Promise<void>
}

export default function VersionHistory({ flow, restoring, onRestore }: Props) {
  const { language, t } = useI18n()
  const [versions, setVersions] = useState<FlowDefinition[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.getFlowVersions(flow.id)
      .then(items => {
        if (!active) return
        setError('')
        setVersions(items)
        setSelectedVersion(current => items.some(item => item.version === current) ? current : (items[0]?.version ?? null))
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [flow.id])

  const selected = versions.find(item => item.version === selectedVersion) ?? null
  const diff = useMemo(() => selected ? summarizeFlowDiff(selected, flow) : null, [selected, flow])
  const totalChanges = diff
    ? diff.nodesAdded + diff.nodesRemoved + diff.nodesChanged + diff.edgesAdded + diff.edgesRemoved + diff.edgesChanged + Number(diff.metadataChanged)
    : 0

  const formatDate = (value?: string | null) => value
    ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—'

  const restore = async () => {
    if (!selected?.version) return
    if (!window.confirm(t('history.restoreConfirm', { version: selected.version }))) return
    await onRestore(selected.version)
  }

  return <div className="history-page">
    <div className="history-heading">
      <div><span className="eyebrow">ARCHITECT</span><h1>{t('history.title')}</h1><p>{t('history.description', { name: flow.name })}</p></div>
      {selected && <button className="primary-btn large" disabled={restoring || Boolean(flow.archived_at)} onClick={restore}>
        {restoring ? <LoaderCircle className="spin" size={17} /> : <RotateCcw size={17} />}
        {restoring ? t('history.restoring') : t('history.restore')}
      </button>}
    </div>

    {flow.archived_at && <div className="history-archived-note">{t('history.archivedHint')}</div>}
    {error && <div className="error-box">{error}</div>}
    {loading && <div className="loading"><LoaderCircle className="spin" />{t('history.loading')}</div>}

    {!loading && versions.length === 0 && <section className="history-empty panel">
      <History size={38} />
      <h2>{t('history.emptyTitle')}</h2>
      <p>{t('history.emptyDescription')}</p>
    </section>}

    {!loading && versions.length > 0 && <div className="history-layout">
      <aside className="version-list panel">
        <div className="version-list-title"><History size={15} />{t('history.versions')}</div>
        {versions.map(item => <button key={item.version} className={item.version === selectedVersion ? 'active' : ''} onClick={() => setSelectedVersion(item.version ?? null)}>
          <strong>{t('history.version', { version: item.version ?? '—' })}</strong>
          <span><Clock3 size={12} />{formatDate(item.published_at)}</span>
        </button>)}
      </aside>

      {selected && diff && <section className="version-comparison panel">
        <div className="comparison-heading">
          <div><GitCompareArrows size={20} /><div><strong>{t('history.comparisonTitle', { version: selected.version ?? '—' })}</strong><span>{t('history.comparisonDescription')}</span></div></div>
          <span className={`change-count${totalChanges === 0 ? ' unchanged' : ''}`}>{totalChanges === 0 ? t('history.noChanges') : t('history.changeCount', { count: totalChanges })}</span>
        </div>
        <div className="comparison-grid">
          <ChangeCard title={t('history.nodes')} added={diff.nodesAdded} removed={diff.nodesRemoved} changed={diff.nodesChanged} />
          <ChangeCard title={t('history.connections')} added={diff.edgesAdded} removed={diff.edgesRemoved} changed={diff.edgesChanged} />
          <div className="change-card"><strong>{t('history.metadata')}</strong><span className={diff.metadataChanged ? 'changed' : 'unchanged'}>{diff.metadataChanged ? t('history.modified') : t('history.unchanged')}</span></div>
        </div>
        <div className="version-snapshot">
          <div><span>{t('history.publishedName')}</span><strong>{selected.name}</strong></div>
          <div><span>{t('history.publishedAt')}</span><strong>{formatDate(selected.published_at)}</strong></div>
          <div><span>{t('history.structure')}</span><strong>{t('history.structureCount', { nodes: selected.nodes.length, edges: selected.edges.length })}</strong></div>
        </div>
        <p className="restore-hint">{t('history.restoreHint')}</p>
      </section>}
    </div>}
  </div>
}

function ChangeCard({ title, added, removed, changed }: { title: string; added: number; removed: number; changed: number }) {
  const { t } = useI18n()
  return <div className="change-card">
    <strong>{title}</strong>
    <div><span className="added">+{added} {t('history.added')}</span><span className="removed">−{removed} {t('history.removed')}</span><span className="changed">~{changed} {t('history.changed')}</span></div>
  </div>
}
