import { useEffect } from 'react'
import { ArrowRight, BookOpenCheck, CircleHelp, GitBranch, Headphones, ListTree, PlayCircle, ShieldCheck, X } from 'lucide-react'
import { useI18n, type TranslationKey } from '../i18n'

export type LearningDestination = 'catalog' | 'editor' | 'simulator' | 'agent' | 'users'

interface GuideProps {
  hasFlow: boolean
  onNavigate: (destination: LearningDestination) => void
  onDismiss: () => void
}

interface HelpProps {
  canAdminister: boolean
  hasFlow: boolean
  onNavigate: (destination: LearningDestination) => void
  onClose: () => void
}

const steps: { destination: LearningDestination; icon: typeof ListTree; title: TranslationKey; description: TranslationKey; requiresFlow?: boolean }[] = [
  { destination: 'catalog', icon: ListTree, title: 'learning.stepCatalog', description: 'learning.stepCatalogDescription' },
  { destination: 'editor', icon: GitBranch, title: 'learning.stepEditor', description: 'learning.stepEditorDescription', requiresFlow: true },
  { destination: 'simulator', icon: PlayCircle, title: 'learning.stepSimulator', description: 'learning.stepSimulatorDescription', requiresFlow: true },
  { destination: 'agent', icon: Headphones, title: 'learning.stepAgent', description: 'learning.stepAgentDescription' },
]

export function GettingStarted({ hasFlow, onNavigate, onDismiss }: GuideProps) {
  const { t } = useI18n()

  return <section className="getting-started panel" aria-labelledby="getting-started-title">
    <div className="getting-started-heading">
      <div className="getting-started-icon"><BookOpenCheck size={21} /></div>
      <div><span className="eyebrow">{t('learning.eyebrow')}</span><h2 id="getting-started-title">{t('learning.title')}</h2><p>{t('learning.description')}</p></div>
      <button className="guide-dismiss" onClick={onDismiss} aria-label={t('learning.dismiss')} title={t('learning.dismiss')}><X size={16} /></button>
    </div>
    <div className="learning-steps">
      {steps.map((step, index) => {
        const Icon = step.icon
        const disabled = Boolean(step.requiresFlow && !hasFlow)
        return <button key={step.destination} disabled={disabled} onClick={() => onNavigate(step.destination)}>
          <span className="learning-step-number">{index + 1}</span>
          <Icon size={18} />
          <span><strong>{t(step.title)}</strong><small>{disabled ? t('learning.createFirst') : t(step.description)}</small></span>
          <ArrowRight size={15} />
        </button>
      })}
    </div>
  </section>
}

export default function HelpCenter({ canAdminister, hasFlow, onNavigate, onClose }: HelpProps) {
  const { t } = useI18n()

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="help-dialog panel" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <button autoFocus className="dialog-close" aria-label={t('access.close')} onClick={onClose}><X size={17} /></button>
      <div className="help-heading">
        <div className="help-icon"><CircleHelp size={22} /></div>
        <div><span className="eyebrow">{t('help.eyebrow')}</span><h2 id="help-title">{t('help.title')}</h2><p>{t('help.description')}</p></div>
      </div>

      <div className="help-path">
        <strong>{t('help.recommendedPath')}</strong>
        <ol>
          {steps.slice(0, 3).map((step, index) => <li key={step.destination}><span>{index + 1}</span><div><strong>{t(step.title)}</strong><small>{t(step.description)}</small></div></li>)}
        </ol>
      </div>

      <div className="help-actions">
        <button onClick={() => onNavigate('catalog')}><ListTree size={18} /><span><strong>{t('help.manageIvrs')}</strong><small>{t('help.manageIvrsDescription')}</small></span><ArrowRight size={15} /></button>
        <button disabled={!hasFlow} onClick={() => onNavigate('editor')}><GitBranch size={18} /><span><strong>{t('help.editFlow')}</strong><small>{hasFlow ? t('help.editFlowDescription') : t('learning.createFirst')}</small></span><ArrowRight size={15} /></button>
        <button onClick={() => onNavigate('agent')}><Headphones size={18} /><span><strong>{t('help.serveCustomers')}</strong><small>{t('help.serveCustomersDescription')}</small></span><ArrowRight size={15} /></button>
        {canAdminister && <button onClick={() => onNavigate('users')}><ShieldCheck size={18} /><span><strong>{t('help.manageUsers')}</strong><small>{t('help.manageUsersDescription')}</small></span><ArrowRight size={15} /></button>}
      </div>

      <div className="help-tip"><BookOpenCheck size={17} /><div><strong>{t('help.tipTitle')}</strong><span>{t('help.tipDescription')}</span></div></div>
    </section>
  </div>
}
