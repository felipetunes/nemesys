import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot, CircleStop, GitBranch, Headphones, MessageSquareText, MousePointerClick, Play, Variable } from 'lucide-react'
import type { NodeKind } from '../types'

const icons: Record<NodeKind, typeof Play> = {
  start: Play,
  prompt: MessageSquareText,
  collect_input: MousePointerClick,
  ai_intent: Bot,
  decision: GitBranch,
  set_variable: Variable,
  queue: Headphones,
  end: CircleStop,
}

export default function IvrNode({ data, selected }: NodeProps) {
  const kind = (data.kind || 'prompt') as NodeKind
  const Icon = icons[kind]
  return (
    <div className={`ivr-node ivr-node--${kind} ${selected ? 'is-selected' : ''}`}>
      {kind !== 'start' && <Handle type="target" position={Position.Left} />}
      <div className="ivr-node__icon"><Icon size={16} /></div>
      <div className="ivr-node__body">
        <span className="ivr-node__kind">{kind.replace('_', ' ')}</span>
        <strong>{String(data.label || kind)}</strong>
      </div>
      {kind !== 'end' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}
