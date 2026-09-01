import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import { Bot, ChevronDown, CircleStop, Download, FileUp, Flag, GitBranch, Headphones, MessageSquareText, MousePointerClick, Play, PlayCircle, Plus, Save, Sparkles, Trash2, UploadCloud, Variable } from 'lucide-react'
import { useI18n, type TranslationKey } from '../i18n'
import IvrNode from './IvrNode'
import type { FlowDefinition, FlowNode, NodeKind } from '../types'

interface Props {
  flow: FlowDefinition
  onSave: (flow: FlowDefinition) => Promise<boolean>
  onPublish: (flow: FlowDefinition) => Promise<boolean>
  onExport: (flow: FlowDefinition) => void
  onImport: (file: File) => Promise<void>
  onTest: () => void
  onDirtyChange: (dirty: boolean) => void
  saving: boolean
  publishing: boolean
  importing: boolean
  publishedVersion: number | null
}

const palette: { type: NodeKind; icon: typeof Play }[] = [
  { type: 'prompt', icon: MessageSquareText },
  { type: 'collect_input', icon: MousePointerClick },
  { type: 'ai_intent', icon: Bot },
  { type: 'decision', icon: GitBranch },
  { type: 'set_variable', icon: Variable },
  { type: 'set_outcome', icon: Flag },
  { type: 'queue', icon: Headphones },
  { type: 'end', icon: CircleStop },
]

const essentialNodeTypes: NodeKind[] = ['prompt', 'collect_input', 'queue', 'end']
const advancedNodeTypes: NodeKind[] = ['ai_intent', 'decision', 'set_variable', 'set_outcome']

const nodeLabelKeys: Record<NodeKind, TranslationKey> = {
  start: 'node.start',
  prompt: 'node.prompt',
  collect_input: 'node.collect_input',
  ai_intent: 'node.ai_intent',
  decision: 'node.decision',
  set_variable: 'node.set_variable',
  set_outcome: 'node.set_outcome',
  queue: 'node.queue',
  end: 'node.end',
}

const nodeDescriptionKeys: Record<NodeKind, TranslationKey> = {
  start: 'node.startDescription',
  prompt: 'node.promptDescription',
  collect_input: 'node.collect_inputDescription',
  ai_intent: 'node.ai_intentDescription',
  decision: 'node.decisionDescription',
  set_variable: 'node.set_variableDescription',
  set_outcome: 'node.set_outcomeDescription',
  queue: 'node.queueDescription',
  end: 'node.endDescription',
}

function toRfNode(n: FlowNode): Node {
  return { id: n.id, type: 'ivr', position: { x: n.x, y: n.y }, data: { label: n.label, kind: n.type, config: n.config } }
}

export default function FlowEditor({ flow, onSave, onPublish, onExport, onImport, onTest, onDirtyChange, saving, publishing, importing, publishedVersion }: Props) {
  const { t } = useI18n()
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes.map(toRfNode))
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    flow.edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || e.condition || undefined, data: { condition: e.condition } })),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dirty, setDirty] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const [toFlowPosition, setToFlowPosition] = useState<((position: { x: number; y: number }) => { x: number; y: number }) | null>(null)
  const nodeTypes = useMemo(() => ({ ivr: IvrNode }), [])
  const selected = nodes.find(n => n.id === selectedId)
  const selectedEdge = edges.find(e => e.id === selectedEdgeId)

  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectDraft)
    return () => window.removeEventListener('beforeunload', protectDraft)
  }, [dirty])

  const onConnect = useCallback((connection: Connection) => {
    setDirty(true)
    onDirtyChange(true)
    setEdges(eds => addEdge({ ...connection, id: `e-${crypto.randomUUID()}` }, eds))
  }, [onDirtyChange, setEdges])

  const handleNodesChange = useCallback((changes: Parameters<typeof onNodesChange>[0]) => {
    if (changes.some(change => ['position', 'remove', 'add', 'replace'].includes(change.type))) {
      setDirty(true)
      onDirtyChange(true)
    }
    onNodesChange(changes)
  }, [onDirtyChange, onNodesChange])

  const handleEdgesChange = useCallback((changes: Parameters<typeof onEdgesChange>[0]) => {
    if (changes.some(change => ['remove', 'add', 'replace'].includes(change.type))) {
      setDirty(true)
      onDirtyChange(true)
    }
    onEdgesChange(changes)
  }, [onDirtyChange, onEdgesChange])

  const addNode = (kind: NodeKind, position?: { x: number; y: number }) => {
    const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`
    const defaults: Record<NodeKind, Record<string, unknown>> = {
      start: {},
      prompt: { message: t('node.defaultPrompt') },
      collect_input: { prompt: t('node.defaultCollectPrompt'), variable: 'input', input_mode: 'speech_or_dtmf' },
      ai_intent: { source_variable: 'input', result_variable: 'intent', intents: ['option_a', 'fallback'] },
      decision: { variable: 'intent' },
      set_variable: { variable: 'name', value: 'value' },
      set_outcome: { name: 'customer_goal', result: 'success' },
      queue: { queue_name: 'customer-care', message: t('node.defaultQueueMessage') },
      end: { message: t('node.defaultEndMessage') },
    }
    const node: Node = {
      id,
      type: 'ivr',
      position: position ?? { x: 420 + (nodes.length % 3) * 40, y: 120 + (nodes.length % 7) * 60 },
      data: { label: t(nodeLabelKeys[kind]), kind, config: defaults[kind] },
    }
    setNodes(items => [...items, node])
    setDirty(true)
    onDirtyChange(true)
    setSelectedId(id)
    setSelectedEdgeId(null)
  }

  const dropNode = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/nemesys-node-kind') as NodeKind
    if (!toFlowPosition || !palette.some(item => item.type === kind)) return
    addNode(kind, toFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const updateSelected = (field: 'label' | 'config', value: unknown) => {
    if (!selectedId) return
    setDirty(true)
    onDirtyChange(true)
    setNodes(items => items.map(n => n.id === selectedId ? { ...n, data: { ...n.data, [field]: value } } : n))
  }

  const updateSelectedEdge = (condition: string) => {
    if (!selectedEdgeId) return
    setDirty(true)
    onDirtyChange(true)
    setEdges(items => items.map(e => e.id === selectedEdgeId ? { ...e, label: condition || undefined, data: { ...(e.data || {}), condition: condition || null } } : e))
  }

  const deleteSelection = () => {
    if (!window.confirm(t('flow.deleteSelectionConfirm'))) return
    if (selectedId) {
      const node = nodes.find(n => n.id === selectedId)
      if (node?.data.kind === 'start') return
      setNodes(items => items.filter(n => n.id !== selectedId))
      setEdges(items => items.filter(e => e.source !== selectedId && e.target !== selectedId))
      setSelectedId(null)
      setDirty(true)
      onDirtyChange(true)
    } else if (selectedEdgeId) {
      setEdges(items => items.filter(e => e.id !== selectedEdgeId))
      setSelectedEdgeId(null)
      setDirty(true)
      onDirtyChange(true)
    }
  }

  const buildFlow = (): FlowDefinition => ({
    ...flow,
    nodes: nodes.map(n => ({
      id: n.id,
      type: n.data.kind as NodeKind,
      label: String(n.data.label),
      x: n.position.x,
      y: n.position.y,
      config: n.data.config as Record<string, unknown>,
    })),
    edges: edges.map((e: Edge) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      condition: (e.data?.condition as string | undefined) || (typeof e.label === 'string' ? e.label : null),
      label: typeof e.label === 'string' ? e.label : null,
    })),
  })

  const config = (selected?.data.config || {}) as Record<string, unknown>
  const kind = selected?.data.kind as NodeKind | undefined

  const saveDraft = async () => {
    if (await onSave(buildFlow())) {
      setDirty(false)
      onDirtyChange(false)
    }
  }

  const publishFlow = async () => {
    if (await onPublish(buildFlow())) {
      setDirty(false)
      onDirtyChange(false)
    }
  }

  const saveAndTest = async () => {
    if (await onSave(buildFlow())) {
      setDirty(false)
      onDirtyChange(false)
      onTest()
    }
  }

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveDraft()
      return
    }
    if (modifier && event.key === 'Enter') {
      event.preventDefault()
      void saveAndTest()
      return
    }
    const target = event.target as HTMLElement
    if ((event.key === 'Delete' || event.key === 'Backspace') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && (selectedId || selectedEdgeId)) {
      event.preventDefault()
      deleteSelection()
    }
  }

  const renderPaletteButton = (type: NodeKind) => {
    const item = palette.find(candidate => candidate.type === type)!
    const Icon = item.icon
    return <button key={item.type} className="palette-btn" title={t(nodeDescriptionKeys[item.type])} draggable onDragStart={event => { event.dataTransfer.setData('application/nemesys-node-kind', item.type); event.dataTransfer.effectAllowed = 'copy' }} onClick={() => addNode(item.type)}><Icon size={16} /><span>{t(nodeLabelKeys[item.type])}</span></button>
  }

  return (
    <div className="editor-layout" onKeyDown={handleEditorKeyDown}>
      <aside className="palette panel">
        <div className="section-title"><Plus size={15} /> {t('flow.nodes')}</div>
        <p className="palette-instruction">{t('flow.paletteInstruction')}</p>
        <div className="palette-group"><span>{t('flow.groupEssential')}</span>{essentialNodeTypes.map(renderPaletteButton)}</div>
        <div className={`palette-advanced${showAdvanced ? ' open' : ''}`}>
          <button className="palette-advanced-toggle" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(current => !current)}><Sparkles size={14} /><span><strong>{t('flow.groupAdvanced')}</strong><small>{t('flow.groupAdvancedDescription')}</small></span><ChevronDown size={14} /></button>
          {showAdvanced && <div className="palette-group">{advancedNodeTypes.map(renderPaletteButton)}</div>}
        </div>
        <div className="palette-note"><Play size={14} /> {t('flow.paletteNote')}</div>
        <div className="editor-shortcuts"><span>{t('flow.shortcuts')}</span><div><kbd>Ctrl</kbd><kbd>S</kbd>{t('flow.shortcutSave')}</div><div><kbd>Ctrl</kbd><kbd>Enter</kbd>{t('flow.shortcutTest')}</div></div>
      </aside>

      <section className="canvas panel">
        <div className="canvas-toolbar">
          <div><strong>{flow.name}</strong><span>{t('flow.stats', { nodes: nodes.length, edges: edges.length, version: publishedVersion ?? '—' })}</span><small className={dirty ? 'draft-state unsaved' : 'draft-state'}>{dirty ? t('flow.unsavedChanges') : t('flow.allSaved')}</small></div>
          <div className="toolbar-actions">
            <input
              ref={importInput}
              className="file-input"
              type="file"
              accept="application/json,.json"
              onChange={event => {
                const file = event.target.files?.[0]
                if (file) void onImport(file)
                event.target.value = ''
              }}
            />
            <button className="secondary-btn toolbar-file-action" title={t('flow.import')} disabled={saving || publishing || importing} onClick={() => importInput.current?.click()}><FileUp size={16} /><span className="button-label">{t('flow.importShort')}</span></button>
            <button className="secondary-btn toolbar-file-action" title={t('flow.export')} disabled={saving || publishing || importing} onClick={() => onExport(buildFlow())}><Download size={16} /><span className="button-label">{t('flow.exportShort')}</span></button>
            <button className="secondary-btn" title={t('flow.shortcutSaveTitle')} disabled={saving || publishing || importing} onClick={() => void saveDraft()}><Save size={16} />{saving ? t('flow.saving') : t('flow.saveDraft')}</button>
            <button className="secondary-btn guided-action" title={t('flow.shortcutTestTitle')} disabled={saving || publishing || importing} onClick={() => void saveAndTest()}><PlayCircle size={16} />{t('flow.saveAndTest')}</button>
            <button className="primary-btn" disabled={saving || publishing || importing} onClick={() => void publishFlow()}><UploadCloud size={16} />{publishing ? t('flow.publishing') : t('flow.publish')}</button>
          </div>
        </div>
        <div className="flow-area">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onInit={instance => setToFlowPosition(() => (position: { x: number; y: number }) => instance.screenToFlowPosition(position))}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
            onDrop={dropNode}
            onNodeClick={(_, node) => { setSelectedId(node.id); setSelectedEdgeId(null) }}
            onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null) }}
            onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null) }}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background gap={24} size={1} />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </div>
      </section>

      <aside className="properties panel">
        <div className="section-title">{t('flow.properties')}</div>
        {!selected && !selectedEdge && <div className="properties-guide"><MousePointerClick size={23} /><strong>{t('flow.selectHintTitle')}</strong><span>{t('flow.selectHint')}</span><ol><li>{t('flow.guideAdd')}</li><li>{t('flow.guideConnect')}</li><li>{t('flow.guideConfigure')}</li></ol></div>}
        {selectedEdge && <>
          <label>{t('flow.routeCondition')}<input value={String((selectedEdge.data?.condition as string | null | undefined) || selectedEdge.label || '')} onChange={e => updateSelectedEdge(e.target.value)} placeholder={t('flow.routePlaceholder')} /></label>
          <div className="field-hint">{t('flow.routeHint')}</div>
          <button className="danger-btn" onClick={deleteSelection}><Trash2 size={15} />{t('flow.deleteEdge')}</button>
        </>}
        {selected && <>
          {kind && <div className="selected-kind-help"><strong>{t(nodeLabelKeys[kind])}</strong><span>{t(nodeDescriptionKeys[kind])}</span></div>}
          <label>{t('flow.label')}<input value={String(selected.data.label || '')} onChange={e => updateSelected('label', e.target.value)} /></label>
          <div className="field-hint">{t('flow.nodeId', { id: selected.id })}</div>
          {kind === 'prompt' && <label>{t('flow.message')}<textarea value={String(config.message || '')} onChange={e => updateSelected('config', { ...config, message: e.target.value })} /></label>}
          {kind === 'collect_input' && <>
            <label>{t('flow.prompt')}<textarea value={String(config.prompt || '')} onChange={e => updateSelected('config', { ...config, prompt: e.target.value })} /></label>
            <label>{t('flow.variable')}<input value={String(config.variable || '')} onChange={e => updateSelected('config', { ...config, variable: e.target.value })} /></label>
          </>}
          {kind === 'ai_intent' && <>
            <label>{t('flow.sourceVariable')}<input value={String(config.source_variable || '')} onChange={e => updateSelected('config', { ...config, source_variable: e.target.value })} /></label>
            <label>{t('flow.resultVariable')}<input value={String(config.result_variable || '')} onChange={e => updateSelected('config', { ...config, result_variable: e.target.value })} /></label>
            <label>{t('flow.intents')}<textarea value={Array.isArray(config.intents) ? config.intents.join(', ') : ''} onChange={e => updateSelected('config', { ...config, intents: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></label>
          </>}
          {kind === 'decision' && <label>{t('flow.variable')}<input value={String(config.variable || '')} onChange={e => updateSelected('config', { ...config, variable: e.target.value })} /></label>}
          {kind === 'set_variable' && <>
            <label>{t('flow.variable')}<input value={String(config.variable || '')} onChange={e => updateSelected('config', { ...config, variable: e.target.value })} /></label>
            <label>{t('flow.value')}<input value={String(config.value || '')} onChange={e => updateSelected('config', { ...config, value: e.target.value })} /></label>
          </>}
          {kind === 'set_outcome' && <>
            <label>{t('flow.outcomeName')}<input value={String(config.name || '')} onChange={e => updateSelected('config', { ...config, name: e.target.value })} /></label>
            <label>{t('flow.outcomeResult')}<select value={String(config.result || 'success')} onChange={e => updateSelected('config', { ...config, result: e.target.value })}><option value="success">{t('flow.outcomeSuccess')}</option><option value="failure">{t('flow.outcomeFailure')}</option></select></label>
          </>}
          {kind === 'queue' && <>
            <label>{t('flow.queueName')}<input value={String(config.queue_name || '')} onChange={e => updateSelected('config', { ...config, queue_name: e.target.value })} /></label>
            <label>{t('flow.waitingMessage')}<textarea value={String(config.message || '')} onChange={e => updateSelected('config', { ...config, message: e.target.value })} /></label>
          </>}
          {kind === 'end' && <label>{t('flow.finalMessage')}<textarea value={String(config.message || '')} onChange={e => updateSelected('config', { ...config, message: e.target.value })} /></label>}
          <div className="field-hint">{t('flow.edgeHint')}</div>
          {kind !== 'start' && <button className="danger-btn" onClick={deleteSelection}><Trash2 size={15} />{t('flow.deleteNode')}</button>}
        </>}
      </aside>
    </div>
  )
}
