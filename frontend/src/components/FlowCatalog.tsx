import { useMemo, useState, type FormEvent } from 'react'
import { Archive, ArrowRight, Clock3, Copy, GitBranch, History, Layers3, Plus, RotateCcw, Trash2, Workflow, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { FlowDefinition } from '../types'

interface Props {
  flows: FlowDefinition[]
  selectedFlowId: string | null
  creating: boolean
  busyFlowId: string | null
  onCreate: (name: string, description: string) => Promise<void>
  onOpen: (flow: FlowDefinition) => Promise<void>
  onHistory: (flow: FlowDefinition) => Promise<void>
  onDuplicate: (flow: FlowDefinition) => Promise<void>
  onArchive: (flow: FlowDefinition) => Promise<void>
  onRestore: (flow: FlowDefinition) => Promise<void>
  onDelete: (flow: FlowDefinition) => Promise<void>
}

export default function FlowCatalog({
  flows,
  selectedFlowId,
  creating,
  busyFlowId,
  onCreate,
  onOpen,
  onHistory,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: Props) {
  const { language, t } = useI18n()
  const [showCreate, setShowCreate] = useState(false)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const activeFlows = useMemo(() => flows.filter(flow => !flow.archived_at), [flows])
  const archivedFlows = useMemo(() => flows.filter(flow => Boolean(flow.archived_at)), [flows])
  const visibleFlows = useMemo(
    () => [...(view === 'active' ? activeFlows : archivedFlows)].sort((a, b) => a.name.localeCompare(b.name, language)),
    [activeFlows, archivedFlows, language, view],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    try {
      await onCreate(name, description)
      setName('')
      setDescription('')
      setShowCreate(false)
    } catch {
      // The parent displays the API error and keeps the form open for correction.
    }
  }

  const formatUpdatedAt = (value?: string | null) => {
    if (!value) return t('catalog.neverUpdated')
    return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  }

  const archive = async (flow: FlowDefinition) => {
    if (window.confirm(t('catalog.archiveConfirm', { name: flow.name }))) await onArchive(flow)
  }

  const deleteFlow = async (flow: FlowDefinition) => {
    if (window.confirm(t('catalog.deleteConfirm', { name: flow.name }))) await onDelete(flow)
  }

  return <div className="catalog-page">
    <div className="catalog-heading">
      <div><span className="eyebrow">ARCHITECT</span><h1>{t('catalog.title')}</h1><p>{t('catalog.description')}</p></div>
      <button className="primary-btn large" onClick={() => { setView('active'); setShowCreate(true) }}><Plus size={17} />{t('catalog.newIvr')}</button>
    </div>

    <div className="catalog-toolbar">
      <div className="catalog-summary"><Layers3 size={17} /><strong>{activeFlows.length === 1 ? t('catalog.countOne') : t('catalog.countMany', { count: activeFlows.length })}</strong></div>
      <div className="catalog-filters" role="group" aria-label={t('catalog.filters')}>
        <button className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>{t('catalog.active')}<span>{activeFlows.length}</span></button>
        <button className={view === 'archived' ? 'active' : ''} onClick={() => { setShowCreate(false); setView('archived') }}>{t('catalog.archived')}<span>{archivedFlows.length}</span></button>
      </div>
    </div>

    {showCreate && <section className="create-flow panel">
      <button className="dialog-close" aria-label={t('access.close')} onClick={() => setShowCreate(false)}><X size={17} /></button>
      <div className="create-flow-icon"><Workflow size={22} /></div>
      <h2>{t('catalog.createTitle')}</h2>
      <p>{t('catalog.createDescription')}</p>
      <form onSubmit={submit}>
        <label>{t('catalog.name')}<input autoFocus required minLength={2} value={name} onChange={event => setName(event.target.value)} placeholder={t('catalog.namePlaceholder')} /></label>
        <label>{t('catalog.flowDescription')}<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t('catalog.descriptionPlaceholder')} /></label>
        <div className="create-flow-actions">
          <button type="button" className="secondary-btn" onClick={() => setShowCreate(false)}>{t('catalog.cancel')}</button>
          <button className="primary-btn" disabled={creating || !name.trim()}><Plus size={16} />{creating ? t('catalog.creating') : t('catalog.create')}</button>
        </div>
      </form>
    </section>}

    {!showCreate && visibleFlows.length === 0 && <section className="catalog-empty panel">
      {view === 'active' ? <Workflow size={38} /> : <Archive size={38} />}
      <h2>{view === 'active' ? t('catalog.emptyTitle') : t('catalog.noArchivedTitle')}</h2>
      <p>{view === 'active' ? t('catalog.emptyDescription') : t('catalog.noArchivedDescription')}</p>
      {view === 'active' && <button className="primary-btn" onClick={() => setShowCreate(true)}><Plus size={16} />{t('catalog.newIvr')}</button>}
    </section>}

    <div className="flow-cards">
      {visibleFlows.map(flow => {
        const isArchived = Boolean(flow.archived_at)
        const busy = busyFlowId === flow.id
        return <article className={`flow-card panel${flow.id === selectedFlowId ? ' selected' : ''}${isArchived ? ' archived' : ''}`} key={flow.id}>
          <div className="flow-card-icon">{isArchived ? <Archive size={21} /> : <Workflow size={21} />}</div>
          <div className="flow-card-copy">
            <div className="flow-card-title"><h2>{flow.name}</h2>{flow.id === selectedFlowId && !isArchived && <span>{t('catalog.selected')}</span>}{isArchived && <span className="archived-badge">{t('catalog.archived')}</span>}</div>
            <p>{flow.description || t('catalog.noDescription')}</p>
            <div className="flow-card-meta">
              <span><GitBranch size={13} />{t('catalog.nodes', { count: flow.nodes.length })}</span>
              <span><Clock3 size={13} />{isArchived ? t('catalog.archivedAt', { date: formatUpdatedAt(flow.archived_at) }) : t('catalog.updated', { date: formatUpdatedAt(flow.updated_at) })}</span>
              <code>{flow.id}</code>
            </div>
          </div>
          <div className="flow-card-actions">
            <button className="secondary-btn" disabled={busy} onClick={() => onHistory(flow)} title={t('catalog.history')}><History size={15} />{t('catalog.history')}</button>
            {!isArchived && <>
              <button className="secondary-btn" disabled={busy} onClick={() => onDuplicate(flow)} title={t('catalog.duplicate')}><Copy size={15} />{t('catalog.duplicate')}</button>
              <button className="secondary-btn" disabled={busy} onClick={() => archive(flow)} title={t('catalog.archive')}><Archive size={15} />{t('catalog.archive')}</button>
              <button className={flow.id === selectedFlowId ? 'secondary-btn' : 'primary-btn'} disabled={busy} onClick={() => onOpen(flow)}>{t('catalog.open')}<ArrowRight size={16} /></button>
            </>}
            {isArchived && <>
              <button className="primary-btn" disabled={busy} onClick={() => onRestore(flow)}><RotateCcw size={15} />{t('catalog.restore')}</button>
              <button className="icon-btn destructive" disabled={busy} onClick={() => deleteFlow(flow)} title={t('catalog.delete')} aria-label={t('catalog.delete')}><Trash2 size={15} /></button>
            </>}
          </div>
        </article>
      })}
    </div>
  </div>
}
