import React, { useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import Panel from '../Panel'
import HomeContentModal from './HomeContentModal'
import { useAuth } from '../../contexts/AuthContext'
import {
  createOrganisationNews,
  deleteOrganisationNews,
  listOrganisationNews,
  updateOrganisationNews,
} from '../../lib/dataService'

const categories = ['News', 'Update', 'System', 'Notice', 'Alert']

export default function OrganisationNewsPanel() {
  const { session } = useAuth()
  const profile = session?.profile || {}
  const isManagement = Boolean(profile.is_management)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await listOrganisationNews())
    } catch (err) {
      setError(err.message || 'Unable to load organisation news.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visibleRows = useMemo(() => {
    if (isManagement) return rows
    const now = new Date()
    return rows.filter((row) => {
      if (row.active === false) return false
      if (!row.expires_at) return true
      const expiry = new Date(`${String(row.expires_at).slice(0, 10)}T23:59:59`)
      return expiry >= now
    })
  }, [rows, isManagement])

  async function save(payload) {
    if (!isManagement) return
    if (modal?.item?.id) await updateOrganisationNews(modal.item.id, payload)
    else await createOrganisationNews({
      ...payload,
      author_name: profile.display_name || profile.username || 'Management',
    })
    setModal(null)
    await load()
  }

  async function remove(row) {
    if (!isManagement) return
    if (!window.confirm(`Delete the news item “${row.title}”?`)) return
    try {
      await deleteOrganisationNews(row.id)
      await load()
    } catch (err) {
      setError(err.message || 'Unable to delete the news item.')
    }
  }

  return (
    <>
      <Panel
        title="Latest News"
        count={visibleRows.length}
        actions={
          <div className="home-panel-actions">
            <button className="panel-icon-button" type="button" onClick={load} title="Refresh"><RefreshCcw size={13}/></button>
            {isManagement && <button className="panel-add-button" type="button" onClick={() => setModal({ item: null })}><Plus size={13}/> Add news</button>}
          </div>
        }
      >
        {error && <div className="home-inline-error">{error}</div>}
        {loading ? (
          <div className="empty-state compact-empty">Loading news…</div>
        ) : visibleRows.length === 0 ? (
          <div className="empty-state compact-empty">There are currently no news items.</div>
        ) : (
          <div className="updates-list organisation-news-list">
            {visibleRows.map((row) => (
              <article key={row.id} className={row.active === false ? 'inactive-home-entry' : ''}>
                <div className="home-entry-heading">
                  <span className={`badge ${badgeClass(row.category)}`}>{row.category || 'News'}</span>
                  {isManagement && (
                    <span className="home-entry-actions">
                      <button type="button" onClick={() => setModal({ item: row })} title="Edit news"><Edit3 size={12}/></button>
                      <button type="button" onClick={() => remove(row)} title="Delete news"><Trash2 size={12}/></button>
                    </span>
                  )}
                </div>
                <strong>{row.title}</strong>
                <p>{row.body}</p>
                <small>{formatDate(row.published_at || row.created_at)}{row.author_name ? ` · ${row.author_name}` : ''}{row.active === false ? ' · Inactive' : ''}</small>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {modal && isManagement && <NewsModal item={modal.item} onClose={() => setModal(null)} onSave={save}/>} 
    </>
  )
}

function NewsModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    title: item?.title || '',
    body: item?.body || '',
    category: item?.category || 'News',
    published_at: item?.published_at ? String(item.published_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    expires_at: item?.expires_at ? String(item.expires_at).slice(0, 10) : '',
    active: item?.active !== false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        expires_at: form.expires_at || null,
      })
    } catch (err) {
      setError(err.message || 'Unable to save the news item.')
      setSaving(false)
    }
  }

  return (
    <HomeContentModal
      title={item ? 'Edit news item' : 'Add news item'}
      subtitle="Management · Grove Way Health Centre"
      onClose={onClose}
      error={error}
      footer={<><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="button" disabled={saving || !form.title.trim() || !form.body.trim()} onClick={submit}>{saving ? 'Saving…' : 'Save news'}</button></>}
    >
      <label>Headline<input autoFocus maxLength={180} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
      <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label>News text<textarea className="modal-long-text" maxLength={6000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}/></label>
      <div className="home-date-fields">
        <label>Publish date<input type="date" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })}/></label>
        <label>Expiry date<input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })}/></label>
      </div>
      <label className="modal-checkbox-row"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/><span>Visible to staff</span></label>
    </HomeContentModal>
  )
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

function badgeClass(category) {
  if (category === 'System') return 'success'
  if (category === 'Alert') return 'warning'
  if (category === 'Notice') return 'neutral'
  return 'info'
}
