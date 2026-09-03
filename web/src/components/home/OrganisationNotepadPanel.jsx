import React, { useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import Panel from '../Panel'
import HomeContentModal from './HomeContentModal'
import { useAuth } from '../../contexts/AuthContext'
import {
  createOrganisationNotepadEntry,
  deleteOrganisationNotepadEntry,
  listOrganisationNotepad,
  updateOrganisationNotepadEntry,
} from '../../lib/dataService'

export default function OrganisationNotepadPanel() {
  const { session } = useAuth()
  const profile = session?.profile || {}
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listOrganisationNotepad())
    } catch (err) {
      setError(err.message || 'Unable to load the organisation notepad.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const currentUserId = session?.user?.id || profile.id
  const canManage = (row) => Boolean(profile.is_management || (row.created_by && row.created_by === currentUserId) || row.created_by_username === profile.username)

  async function save(payload) {
    if (modal?.item?.id) {
      await updateOrganisationNotepadEntry(modal.item.id, payload)
    } else {
      await createOrganisationNotepadEntry({
        ...payload,
        created_by_name: profile.display_name || profile.username || 'RecordsWeb user',
        created_by_username: profile.username || '',
      })
    }
    setModal(null)
    await load()
  }

  async function remove(row) {
    if (!canManage(row)) return
    if (!window.confirm(`Delete the notepad entry “${row.title}”?`)) return
    try {
      await deleteOrganisationNotepadEntry(row.id)
      await load()
    } catch (err) {
      setError(err.message || 'Unable to delete the notepad entry.')
    }
  }

  return (
    <>
      <Panel
        title="Organisation Notepad"
        count={rows.length}
        actions={
          <div className="home-panel-actions">
            <button className="panel-icon-button" type="button" onClick={load} title="Refresh"><RefreshCcw size={13}/></button>
            <button className="panel-add-button" type="button" onClick={() => setModal({ item: null })}><Plus size={13}/> Add note</button>
          </div>
        }
      >
        {error && <div className="home-inline-error">{error}</div>}
        {loading ? (
          <div className="empty-state compact-empty">Loading organisation notepad…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state compact-empty">No organisation notes have been added.</div>
        ) : (
          <div className="notepad-list organisation-notepad-list">
            {rows.map((row) => (
              <article key={row.id}>
                <div className="home-entry-heading">
                  <strong>{row.title}</strong>
                  {canManage(row) && (
                    <span className="home-entry-actions">
                      <button type="button" onClick={() => setModal({ item: row })} title="Edit note"><Edit3 size={12}/></button>
                      <button type="button" onClick={() => remove(row)} title="Delete note"><Trash2 size={12}/></button>
                    </span>
                  )}
                </div>
                <span className="home-entry-body">{row.body}</span>
                <small>{row.created_by_name || 'Staff member'} · {formatDateTime(row.updated_at || row.created_at)}</small>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {modal && <NotepadModal item={modal.item} onClose={() => setModal(null)} onSave={save}/>} 
    </>
  )
}

function NotepadModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    title: item?.title || '',
    body: item?.body || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave({ title: form.title.trim(), body: form.body.trim() })
    } catch (err) {
      setError(err.message || 'Unable to save the notepad entry.')
      setSaving(false)
    }
  }

  return (
    <HomeContentModal
      title={item ? 'Edit organisation note' : 'Add organisation note'}
      subtitle="Visible to Grove Way Health Centre staff"
      onClose={onClose}
      error={error}
      footer={<><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" disabled={saving || !form.title.trim() || !form.body.trim()} onClick={submit}>{saving ? 'Saving…' : 'Save note'}</button></>}
    >
      <label>Title<input autoFocus maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
      <label>Note<textarea className="modal-long-text" maxLength={4000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}/></label>
    </HomeContentModal>
  )
}

function formatDateTime(value) {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
