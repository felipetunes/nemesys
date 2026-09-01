import { useEffect, useRef, useState } from 'react'
import { CircleHelp, LogOut, Settings, UserRound } from 'lucide-react'
import { useI18n, type TranslationKey } from '../i18n'
import type { AuthMe } from '../types'

interface Props {
  currentUser: AuthMe | null
  onOpenSettings: () => void
  onOpenHelp: () => void
  onSignOut: () => void | Promise<void>
}

function initials(email: string | undefined) {
  if (!email) return ''
  const nameParts = email.split('@')[0].split(/[._-]+/).filter(Boolean)
  return nameParts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || email[0].toUpperCase()
}

export default function ProfileMenu({ currentUser, onOpenSettings, onOpenHelp, onSignOut }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const workspace = currentUser?.workspaces.find(item => item.id === currentUser.active_workspace_id)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const run = (action: () => void | Promise<void>) => {
    setOpen(false)
    void action()
  }

  return <div className="profile-menu" ref={root}>
    <button
      className={`profile-avatar-button${open ? ' active' : ''}`}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={t('profile.openMenu')}
      title={t('profile.openMenu')}
      onClick={() => setOpen(value => !value)}
    >
      <span className="profile-avatar" aria-hidden="true">{currentUser ? initials(currentUser.email) : <UserRound size={18} />}</span>
      <span className="profile-presence" aria-hidden="true" />
    </button>

    {open && <div className="profile-popover panel" role="menu" aria-label={t('profile.menuLabel')}>
      <div className="profile-summary">
        <span className="profile-avatar profile-avatar--large" aria-hidden="true">{currentUser ? initials(currentUser.email) : <UserRound size={20} />}</span>
        <div>
          <strong>{currentUser?.email || t('authPortal.demoMode')}</strong>
          <span>{workspace ? `${workspace.name} · ${t(`role.${workspace.role}` as TranslationKey)}` : t('profile.demoDescription')}</span>
        </div>
      </div>
      <div className="profile-menu-actions">
        <button type="button" role="menuitem" onClick={() => run(onOpenSettings)}><Settings size={16} /><span><strong>{t('profile.settings')}</strong><small>{t('profile.settingsDescription')}</small></span></button>
        <button type="button" role="menuitem" onClick={() => run(onOpenHelp)}><CircleHelp size={16} /><span><strong>{t('actions.help')}</strong><small>{t('profile.helpDescription')}</small></span></button>
        <button className="profile-signout" type="button" role="menuitem" onClick={() => run(onSignOut)}><LogOut size={16} /><span><strong>{t('access.signOut')}</strong><small>{t('profile.signOutDescription')}</small></span></button>
      </div>
    </div>}
  </div>
}
