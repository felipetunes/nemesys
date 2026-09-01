import { useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Clock3, GitBranch, Layers3, Plus, Workflow, X } from 'lucide-react'
import { useI18n } from '../i18n'
import type { FlowDefinition } from '../types'

interface Props {
  flows: FlowDefinition[]
  selectedFlowId: string | null
  creating: boolean
  onCreate: (name: string, description: string) => Promise<void>
  onOpen: (flow: FlowDefinition) => Promise<void>
}

export default function FlowCatalog({ flows, selectedFlowId, creating, onCreate, onOpen }: Props) {
  const { language, t } = useI18n()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const sortedFlows = useMemo(() => [...flows].sort((a, b) => a.name.localeCompare(b.name, language)), [flows, language])

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

  const formatUpdatedAt = (value?: string) => {
    if (!value) return t('catalog.neverUpdated')
    return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  }

  return <div className="catalog-page">
    <div className="catalog-heading">
      <div><span className="eyebrow">{t('catalog.eyebrow')}</span><h1>{t('catalog.title')}</h1><p>{t('catalog.description')}</p></div>
      <button className="primary-btn large" onClick={() => setShowCreate(true)}><Plus size={17} />{t('catalog.newIvr')}</button>
    </div>

    <div className="catalog-summary"><Layers3 size={17} /><strong>{flows.length === 1 ? t('catalog.countOne') : t('catalog.countMany', { count: flows.length })}</strong></div>

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

    {!showCreate && flows.length === 0 && <section className="catalog-empty panel">
      <Workflow size={38} />
      <h2>{t('catalog.emptyTitle')}</h2>
      <p>{t('catalog.emptyDescription')}</p>
      <button className="primary-btn" onClick={() => setShowCreate(true)}><Plus size={16} />{t('catalog.newIvr')}</button>
    </section>}

    <div className="flow-cards">
      {sortedFlows.map(flow => <article className={`flow-card panel${flow.id === selectedFlowId ? ' selected' : ''}`} key={flow.id}>
        <div className="flow-card-icon"><Workflow size={21} /></div>
        <div className="flow-card-copy">
          <div className="flow-card-title"><h2>{flow.name}</h2>{flow.id === selectedFlowId && <span>{t('catalog.selected')}</span>}</div>
          <p>{flow.description || t('catalog.noDescription')}</p>
          <div className="flow-card-meta">
            <span><GitBranch size={13} />{t('catalog.nodes', { count: flow.nodes.length })}</span>
            <span><Clock3 size={13} />{t('catalog.updated', { date: formatUpdatedAt(flow.updated_at) })}</span>
            <code>{flow.id}</code>
          </div>
        </div>
        <button className={flow.id === selectedFlowId ? 'secondary-btn' : 'primary-btn'} onClick={() => onOpen(flow)}>{t('catalog.open')}<ArrowRight size={16} /></button>
      </article>)}
    </div>
  </div>
}
