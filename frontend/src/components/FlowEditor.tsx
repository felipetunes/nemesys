import { useCallback, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
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
import { Bot, CircleStop, Download, FileUp, GitBranch, Headphones, MessageSquareText, MousePointerClick, Play, Plus, Save, Trash2, UploadCloud, Variable } from 'lucide-react'
import IvrNode from './IvrNode'
import type { FlowDefinition, FlowNode, NodeKind } from '../types'

interface Props {
  flow: FlowDefinition
  onSave: (flow: FlowDefinition) => Promise<void>
  onPublish: (flow: FlowDefinition) => Promise<void>
  onExport: (flow: FlowDefinition) => void
  onImport: (file: File) => Promise<void>
  saving: boolean
  publishing: boolean
  importing: boolean
  publishedVersion: number | null
}

const palette: { type: NodeKind; label: string; icon: typeof Play }[] = [
  { type: 'prompt', label: 'Prompt', icon: MessageSquareText },
  { type: 'collect_input', label: 'Collect input', icon: MousePointerClick },
  { type: 'ai_intent', label: 'AI intent', icon: Bot },
  { type: 'decision', label: 'Decision', icon: GitBranch },
  { type: 'set_variable', label: 'Set variable', icon: Variable },
  { type: 'queue', label: 'Agent queue', icon: Headphones },
  { type: 'end', label: 'End', icon: CircleStop },
]

function toRfNode(n: FlowNode): Node {
  return { id: n.id, type: 'ivr', position: { x: n.x, y: n.y }, data: { label: n.label, kind: n.type, config: n.config } }
}

export default function FlowEditor({ flow, onSave, onPublish, onExport, onImport, saving, publishing, importing, publishedVersion }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes.map(toRfNode))
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    flow.edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label || e.condition || undefined, data: { condition: e.condition } })),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const [toFlowPosition, setToFlowPosition] = useState<((position: { x: number; y: number }) => { x: number; y: number }) | null>(null)
  const nodeTypes = useMemo(() => ({ ivr: IvrNode }), [])
  const selected = nodes.find(n => n.id === selectedId)
  const selectedEdge = edges.find(e => e.id === selectedEdgeId)

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, id: `e-${crypto.randomUUID()}` }, eds))
  }, [setEdges])

  const addNode = (kind: NodeKind, position?: { x: number; y: number }) => {
    const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`
    const defaults: Record<NodeKind, Record<string, unknown>> = {
      start: {},
      prompt: { message: 'Novo prompt' },
      collect_input: { prompt: 'Diga ou digite uma opção.', variable: 'input', input_mode: 'speech_or_dtmf' },
      ai_intent: { source_variable: 'input', result_variable: 'intent', intents: ['option_a', 'fallback'] },
      decision: { variable: 'intent' },
      set_variable: { variable: 'name', value: 'value' },
      queue: { queue_name: 'customer-care', message: 'Você entrou na fila de atendimento humano.' },
      end: { message: 'Até logo!' },
    }
    const node: Node = {
      id,
      type: 'ivr',
      position: position ?? { x: 420 + (nodes.length % 3) * 40, y: 120 + (nodes.length % 7) * 60 },
      data: { label: palette.find(p => p.type === kind)?.label || kind, kind, config: defaults[kind] },
    }
    setNodes(items => [...items, node])
    setSelectedId(id)
    setSelectedEdgeId(null)
  }

  const dropNode = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData('application/revelys-node-kind') as NodeKind
    if (!toFlowPosition || !palette.some(item => item.type === kind)) return
    addNode(kind, toFlowPosition({ x: event.clientX, y: event.clientY }))
  }

  const updateSelected = (field: 'label' | 'config', value: unknown) => {
    if (!selectedId) return
    setNodes(items => items.map(n => n.id === selectedId ? { ...n, data: { ...n.data, [field]: value } } : n))
  }

  const updateSelectedEdge = (condition: string) => {
    if (!selectedEdgeId) return
    setEdges(items => items.map(e => e.id === selectedEdgeId ? { ...e, label: condition || undefined, data: { ...(e.data || {}), condition: condition || null } } : e))
  }

  const deleteSelection = () => {
    if (selectedId) {
      const node = nodes.find(n => n.id === selectedId)
      if (node?.data.kind === 'start') return
      setNodes(items => items.filter(n => n.id !== selectedId))
      setEdges(items => items.filter(e => e.source !== selectedId && e.target !== selectedId))
      setSelectedId(null)
    } else if (selectedEdgeId) {
      setEdges(items => items.filter(e => e.id !== selectedEdgeId))
      setSelectedEdgeId(null)
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

  return (
    <div className="editor-layout">
      <aside className="palette panel">
        <div className="section-title"><Plus size={15} /> Nodes</div>
        {palette.map(item => {
          const Icon = item.icon
          return <button key={item.type} className="palette-btn" draggable onDragStart={event => { event.dataTransfer.setData('application/revelys-node-kind', item.type); event.dataTransfer.effectAllowed = 'copy' }} onClick={() => addNode(item.type)}><Icon size={16} /><span>{item.label}</span></button>
        })}
        <div className="palette-note"><Play size={14} /> Start nodes are intentionally unique. Use the seeded one.</div>
      </aside>

      <section className="canvas panel">
        <div className="canvas-toolbar">
          <div><strong>{flow.name}</strong><span>{nodes.length} nodes · {edges.length} edges · published v{publishedVersion ?? '—'}</span></div>
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
            <button className="icon-btn" title="Import flow JSON" aria-label="Import flow JSON" disabled={saving || publishing || importing} onClick={() => importInput.current?.click()}><FileUp size={16} /></button>
            <button className="icon-btn" title="Export flow JSON" aria-label="Export flow JSON" disabled={saving || publishing || importing} onClick={() => onExport(buildFlow())}><Download size={16} /></button>
            <button className="secondary-btn" disabled={saving || publishing || importing} onClick={() => onSave(buildFlow())}><Save size={16} />{saving ? 'Saving…' : 'Save draft'}</button>
            <button className="primary-btn" disabled={saving || publishing || importing} onClick={() => onPublish(buildFlow())}><UploadCloud size={16} />{publishing ? 'Publishing…' : 'Publish'}</button>
          </div>
        </div>
        <div className="flow-area">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
        <div className="section-title">Properties</div>
        {!selected && !selectedEdge && <div className="empty-state">Select a node or edge to inspect its configuration.</div>}
        {selectedEdge && <>
          <label>Route condition<input value={String((selectedEdge.data?.condition as string | null | undefined) || selectedEdge.label || '')} onChange={e => updateSelectedEdge(e.target.value)} placeholder="ex. cancellation or fallback" /></label>
          <div className="field-hint">Conditional edges are matched against AI intent or decision values. Leave blank for the default route.</div>
          <button className="danger-btn" onClick={deleteSelection}><Trash2 size={15} />Delete edge</button>
        </>}
        {selected && <>
          <label>Label<input value={String(selected.data.label || '')} onChange={e => updateSelected('label', e.target.value)} /></label>
          <div className="field-hint">Node ID: {selected.id}</div>
          {kind === 'prompt' && <label>Message<textarea value={String(config.message || '')} onChange={e => updateSelected('config', { ...config, message: e.target.value })} /></label>}
          {kind === 'collect_input' && <>
            <label>Prompt<textarea value={String(config.prompt || '')} onChange={e => updateSelected('config', { ...config, prompt: e.target.value })} /></label>
            <label>Variable<input value={String(config.variable || '')} onChange={e => updateSelected('config', { ...config, variable: e.target.value })} /></label>
          </>}
          {kind === 'ai_intent' && <>
            <label>Source variable<input value={String(config.source_variable || '')} onChange={e => updateSelected('config', { ...config, source_variable: e.target.value })} /></label>
            <label>Result variable<input value={String(config.result_variable || '')} onChange={e => updateSelected('config', { ...config, result_variable: e.target.value })} /></label>
            <label>Intents<textarea value={Array.isArray(config.intents) ? config.intents.join(', ') : ''} onChange={e => updateSelected('config', { ...config, intents: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} /></label>
          </>}
          {kind === 'decision' && <label>Variable<input value={String(config.variable || '')} onChange={e => updateSelected('config', { ...config, variable: e.target.value })} /></label>}
          {kind === 'set_variable' && <>
            <label>Variable<input value={String(config.variable || '')} onChange={e => updateSelected('config', { ...config, variable: e.target.value })} /></label>
            <label>Value<input value={String(config.value || '')} onChange={e => updateSelected('config', { ...config, value: e.target.value })} /></label>
          </>}
          {kind === 'queue' && <>
            <label>Queue name<input value={String(config.queue_name || '')} onChange={e => updateSelected('config', { ...config, queue_name: e.target.value })} /></label>
            <label>Waiting message<textarea value={String(config.message || '')} onChange={e => updateSelected('config', { ...config, message: e.target.value })} /></label>
          </>}
          {kind === 'end' && <label>Final message<textarea value={String(config.message || '')} onChange={e => updateSelected('config', { ...config, message: e.target.value })} /></label>}
          <div className="field-hint">Select an outgoing edge to edit its routing condition.</div>
          {kind !== 'start' && <button className="danger-btn" onClick={deleteSelection}><Trash2 size={15} />Delete node</button>}
        </>}
      </aside>
    </div>
  )
}
