import { useEffect, useMemo, useState } from 'react'
import { Bot, CheckCircle2, CircleDot, Headset, Mic, PhoneCall, RotateCcw, Send, Terminal, UserRound, Volume2, XCircle } from 'lucide-react'
import { api } from '../api'
import { BrowserSpeechProvider } from '../speech'
import type { CallSession, FlowDefinition, TraceEvent } from '../types'

interface Props { flow: FlowDefinition }

function eventIcon(event: TraceEvent) {
  if (event.type === 'ai_intent') return <Bot size={14} />
  if (event.type === 'input_received') return <UserRound size={14} />
  if (event.type === 'session_completed') return <CheckCircle2 size={14} />
  if (event.type === 'session_queued' || event.type === 'agent_connected') return <Headset size={14} />
  if (event.type === 'error') return <XCircle size={14} />
  return <CircleDot size={12} />
}

export default function Simulator({ flow }: Props) {
  const [session, setSession] = useState<CallSession | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const speech = useMemo(() => new BrowserSpeechProvider(), [])

  const visibleEvents = useMemo(() => session?.trace.filter(e => ['prompt', 'input_requested', 'input_received', 'ai_intent', 'session_queued', 'agent_connected', 'session_completed', 'error'].includes(e.type)) || [], [session])

  useEffect(() => () => speech.cancel(), [speech])

  const start = async () => {
    setBusy(true); setError('')
    try { setSession(await api.createSession(flow.id)); setInput('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const submit = async () => {
    if (!session || !input.trim()) return
    setBusy(true); setError('')
    try { setSession(await api.submitInput(session.id, input.trim())); setInput('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const connectAgent = async () => {
    if (!session) return
    setBusy(true); setError('')
    try { setSession(await api.claimQueueSession(session.id, 'Browser Agent')) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const listen = async () => {
    setListening(true); setError('')
    try { setInput(await speech.listen()) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setListening(false) }
  }

  return (
    <div className="sim-grid">
      <section className="phone panel">
        <div className="phone-head"><PhoneCall size={18} /><div><strong>Browser Call Simulator</strong><span>{session ? session.id.slice(0, 8) : 'No active session'}</span></div>{session?.last_prompt && speech.canSpeak && <button className="voice-btn" title="Speak latest prompt" aria-label="Speak latest prompt" onClick={() => speech.speak(session.last_prompt || '')}><Volume2 size={15} /></button>}<span className={`status status--${session?.status || 'idle'}`}>{session?.status || 'idle'}</span></div>
        {!session && <div className="sim-hero"><div className="sim-hero__orb"><PhoneCall size={34} /></div><h2>Call your flow without a phone</h2><p>The browser uses exactly the same runtime that powers the telephony adapter.</p><button className="primary-btn large" onClick={start} disabled={busy}><PhoneCall size={17} />Start demo call</button></div>}
        {session && <div className="conversation">
          {visibleEvents.map(event => <div key={event.seq} className={`bubble-row ${event.type === 'input_received' ? 'bubble-row--user' : ''}`}>
            <div className={`bubble ${event.type === 'input_received' ? 'bubble--user' : 'bubble--system'}`}>
              <div className="bubble-meta">{eventIcon(event)} {event.type.replace('_', ' ')}</div>
              <div>{event.message}</div>
              {event.type === 'ai_intent' && <small>{String(event.data.provider || '')} · {Math.round(Number(event.data.confidence || 0) * 100)}% confidence</small>}
            </div>
          </div>)}
          {session.status === 'waiting_input' && <div className="input-dock">
            <input autoFocus placeholder="Fale ou digite: ex. 'quero cancelar' ou 2" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
            {speech.canRecognize && <button className={`voice-btn${listening ? ' listening' : ''}`} title="Use microphone" aria-label="Use microphone" disabled={busy || listening} onClick={listen}><Mic size={16} /></button>}
            <button className="primary-btn" disabled={busy || !input.trim()} onClick={submit}><Send size={16} />Send</button>
          </div>}
          {session.status === 'queued' && <div className="queue-dock"><Headset size={20} /><div><strong>Waiting in {session.queue_name}</strong><span>Use the agent simulator to continue this session.</span></div><button className="primary-btn" disabled={busy} onClick={connectAgent}>{busy ? 'Connecting…' : 'Connect agent'}</button></div>}
          {(session.status === 'completed' || session.status === 'failed') && <button className="secondary-btn restart" onClick={start}><RotateCcw size={16} />Run another call</button>}
        </div>}
        {error && <div className="error-box">{error}</div>}
      </section>

      <section className="trace panel">
        <div className="trace-head"><Terminal size={17} /><div><strong>Execution trace</strong><span>Every state transition is inspectable</span></div></div>
        {!session && <div className="empty-state">Start a call to see the runtime trace.</div>}
        {session && <div className="trace-list">{session.trace.map(event => <div key={event.seq} className="trace-row">
          <span className="trace-seq">{String(event.seq).padStart(2, '0')}</span>
          <div><strong>{event.type}</strong><p>{event.message}</p>{event.node_id && <code>{event.node_id}</code>}</div>
        </div>)}</div>}
        {session && <div className="vars"><strong>Session variables</strong><pre>{JSON.stringify(session.variables, null, 2)}</pre></div>}
      </section>
    </div>
  )
}
