import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot, CircleStop, GitBranch, Headphones, MessageSquareText, MousePointerClick, Play, Variable } from 'lucide-react'
import { useI18n, type TranslationKey } from '../i18n'
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

const nodeLabelKeys: Record<NodeKind, TranslationKey> = {
  start: 'node.start',
  prompt: 'node.prompt',
  collect_input: 'node.collect_input',
  ai_intent: 'node.ai_intent',
  decision: 'node.decision',
  set_variable: 'node.set_variable',
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
  queue: 'node.queueDescription',
  end: 'node.endDescription',
}

export default function IvrNode({ data, selected }: NodeProps) {
  const { t } = useI18n()
  const kind = (data.kind || 'prompt') as NodeKind
  const Icon = icons[kind]
  return (
    <div className={`ivr-node ivr-node--${kind} ${selected ? 'is-selected' : ''}`} tabIndex={0} aria-label={`${String(data.label || kind)}. ${t(nodeDescriptionKeys[kind])}`}>
      {kind !== 'start' && <Handle type="target" position={Position.Left} />}
      <div className="ivr-node__icon"><Icon size={16} /></div>
      <div className="ivr-node__body">
        <span className="ivr-node__kind">{t(nodeLabelKeys[kind])}</span>
        <strong>{String(data.label || kind)}</strong>
      </div>
      <div className="ivr-node__tooltip" role="tooltip"><strong>{t(nodeLabelKeys[kind])}</strong><span>{t(nodeDescriptionKeys[kind])}</span></div>
      {kind !== 'end' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}
