import { useEffect, useState, type FormEvent } from 'react'
import { Power, RefreshCw, ShieldCheck, Trash2, UserPlus, UsersRound, X } from 'lucide-react'
import { api } from '../api'
import { useI18n, type TranslationKey } from '../i18n'
import type { AuthMe, WorkspaceMember, WorkspaceRole } from '../types'

const roles: WorkspaceRole[] = ['viewer', 'editor', 'admin', 'owner']
const roleKeys: Record<WorkspaceRole, TranslationKey> = {
  viewer: 'role.viewer',
  editor: 'role.editor',
  admin: 'role.admin',
  owner: 'role.owner',
}

export default function UserManagement() {
  const { language, t } = useI18n()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [currentUser, setCurrentUser] = useState<AuthMe | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('editor')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextMembers, me] = await Promise.all([api.listWorkspaceMembers(), api.me()])
      setMembers(nextMembers)
      setCurrentUser(me)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([api.listWorkspaceMembers(), api.me()])
      .then(([nextMembers, me]) => {
        if (!active) return
        setMembers(nextMembers)
        setCurrentUser(me)
        if (nextMembers.length === 0) setShowCreate(true)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const createUser = async (event: FormEvent) => {
    event.preventDefault()
    setCreating(true)
    setError('')
    setNotice('')
    try {
      const member = await api.createWorkspaceUser(email.trim(), password, role)
      setMembers(current => [...current.filter(item => item.user_id !== member.user_id), member].sort((a, b) => a.email.localeCompare(b.email)))
      setEmail('')
      setPassword('')
      setRole('editor')
      setShowCreate(false)
      setNotice(t('users.created', { email: member.email }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setCreating(false)
    }
  }

  const updateRole = async (member: WorkspaceMember, nextRole: WorkspaceRole) => {
    setBusyUserId(member.user_id)
    setError('')
    try {
      const updated = await api.updateWorkspaceMemberRole(member.user_id, nextRole)
      setMembers(current => current.map(item => item.user_id === updated.user_id ? updated : item))
      setNotice(t('users.roleUpdated'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyUserId(null)
    }
  }

  const toggleStatus = async (member: WorkspaceMember) => {
    setBusyUserId(member.user_id)
    setError('')
    try {
      const updated = await api.updateWorkspaceMemberStatus(member.user_id, !member.active)
      setMembers(current => current.map(item => item.user_id === updated.user_id ? updated : item))
      setNotice(t(updated.active ? 'users.activated' : 'users.deactivated'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyUserId(null)
    }
  }

  const removeMember = async (member: WorkspaceMember) => {
    if (!window.confirm(t('users.removeConfirm', { email: member.email }))) return
    setBusyUserId(member.user_id)
    setError('')
    try {
      await api.removeWorkspaceMember(member.user_id)
      setMembers(current => current.filter(item => item.user_id !== member.user_id))
      setNotice(t('users.removed'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusyUserId(null)
    }
  }

  const formatDate = (value?: string | null) => value
    ? new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : t('users.never')

  return <div className="users-page">
    <div className="users-heading">
      <div><span className="eyebrow">{t('users.eyebrow')}</span><h1>{t('users.title')}</h1><p>{t('users.description')}</p></div>
      <div className="users-heading-actions">
        <button className="secondary-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />{t('metrics.refresh')}</button>
        <button className="primary-btn" onClick={() => setShowCreate(true)}><UserPlus size={16} />{t('users.add')}</button>
      </div>
    </div>

    {showCreate && <section className="user-create panel">
      <button className="dialog-close" aria-label={t('access.close')} onClick={() => setShowCreate(false)}><X size={17} /></button>
      <div className="user-create-copy"><div className="user-create-icon"><UserPlus size={22} /></div><div><h2>{t('users.createTitle')}</h2><p>{t('users.createDescription')}</p></div></div>
      <form onSubmit={createUser}>
        <label>{t('access.email')}<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="agent@example.com" /></label>
        <label>{t('users.initialPassword')}<input type="password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label>{t('users.role')}<select value={role} onChange={event => setRole(event.target.value as WorkspaceRole)}>{roles.map(item => <option key={item} value={item}>{t(roleKeys[item])}</option>)}</select></label>
        <button className="primary-btn" disabled={creating}><UserPlus size={16} />{creating ? t('users.creating') : t('users.create')}</button>
      </form>
      <div className="user-create-hints"><small>{t('users.passwordHint')}</small><small><ShieldCheck size={13} />{t(`role.${role}Description` as TranslationKey)}</small></div>
    </section>}

    {error && <div className="error-box">{error}</div>}
    {notice && <div className="inline-notice"><ShieldCheck size={16} />{notice}</div>}

    <section className="users-list panel">
      <div className="users-list-heading"><div><UsersRound size={18} /><strong>{t('users.members')}</strong></div><span>{members.length}</span></div>
      {loading && members.length === 0 && <div className="loading"><RefreshCw className="spin" />{t('users.loading')}</div>}
      {!loading && members.length === 0 && <div className="users-empty"><UsersRound size={30} /><strong>{t('users.emptyTitle')}</strong><span>{t('users.emptyDescription')}</span></div>}
      {members.length > 0 && <div className="users-table">
        <div className="users-table-head"><span>{t('users.user')}</span><span>{t('users.status')}</span><span>{t('users.lastLogin')}</span><span>{t('users.role')}</span><span>{t('users.actions')}</span></div>
        {members.map(member => {
          const isCurrentUser = member.user_id === currentUser?.user_id
          return <article className={`user-row${member.active ? '' : ' inactive'}`} key={member.user_id}>
            <div className="user-identity"><span className="user-avatar">{member.email.slice(0, 1).toUpperCase()}</span><div><strong>{member.email}</strong><small>{isCurrentUser ? t('users.you') : t('users.createdAt', { date: formatDate(member.created_at) })}</small></div></div>
            <span className={`member-status ${member.active ? 'active' : 'inactive'}`}><Power size={12} />{t(member.active ? 'users.active' : 'users.inactive')}</span>
            <span className="last-login">{formatDate(member.last_login_at)}</span>
            <select aria-label={t('users.roleFor', { email: member.email })} value={member.role} disabled={busyUserId !== null || isCurrentUser} onChange={event => void updateRole(member, event.target.value as WorkspaceRole)}>{roles.map(item => <option key={item} value={item}>{t(roleKeys[item])}</option>)}</select>
            <div className="user-actions">
              <button className="icon-btn" title={t(member.active ? 'users.deactivate' : 'users.activate')} aria-label={t(member.active ? 'users.deactivate' : 'users.activate')} disabled={busyUserId !== null || isCurrentUser} onClick={() => void toggleStatus(member)}><Power size={15} /></button>
              <button className="icon-btn destructive" title={t('users.remove')} aria-label={t('users.remove')} disabled={busyUserId !== null || isCurrentUser} onClick={() => void removeMember(member)}><Trash2 size={15} /></button>
            </div>
          </article>
        })}
      </div>}
    </section>
  </div>
}
