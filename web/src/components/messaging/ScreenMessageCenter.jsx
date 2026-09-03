import React, { useEffect, useMemo, useState } from 'react'
import { Mail, RefreshCcw, Reply, Send, X } from 'lucide-react'
import ModalPortal from '../ModalPortal'
import { listMessageStaff, listScreenMessages, markScreenMessageRead, sendScreenMessages, subscribeStaffPresence, subscribeToScreenMessages } from '../../lib/staffMessaging'
import { setUrgentTabState } from '../../lib/webRuntime'

export default function ScreenMessageCenter({ session }) {
  const profile = session?.profile || {}
  const userId = session?.user?.id || profile.id
  const [messages, setMessages] = useState([])
  const [staff, setStaff] = useState([])
  const [onlineIds, setOnlineIds] = useState(new Set())
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('inbox')
  const [urgentPopup, setUrgentPopup] = useState(null)
  const [selectedMessage, setSelectedMessage] = useState(null)

  async function load() {
    if (!userId) return
    const [messageRows, staffRows] = await Promise.all([listScreenMessages(userId), listMessageStaff()])
    setMessages(messageRows)
    setStaff(staffRows)
  }

  useEffect(() => { load().catch(() => {}) }, [userId])
  useEffect(() => subscribeStaffPresence({ ...profile, id: userId }, setOnlineIds), [userId, profile.username, profile.role])
  useEffect(() => subscribeToScreenMessages(userId, (row) => {
    setMessages((current) => [row, ...current.filter((x) => x.id !== row.id)])
    if (row.urgent) {
      setUrgentPopup(row)
      setUrgentTabState(true)
    }
  }), [userId])

  const unread = messages.filter((m) => !m.read_at).length
  const urgentUnread = messages.some((m) => m.urgent && !m.read_at)

  async function viewMessage(message) {
    setSelectedMessage(message)
    setUrgentPopup(null)
    setUrgentTabState(false)
    if (!message.read_at) {
      await markScreenMessageRead(message.id).catch(() => {})
      setMessages((current) => current.map((x) => x.id === message.id ? { ...x, read_at: new Date().toISOString() } : x))
    }
    setOpen(true)
    setTab('inbox')
  }

  return <>
    <button className={`icon-btn message-center-button ${urgentUnread ? 'urgent-unread' : ''}`} title="Screen messages" onClick={() => { setOpen(true); setTab('inbox'); load().catch(() => {}) }}>
      <Mail size={18}/>{unread > 0 && <span className="message-badge">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <MessageWindow profile={{...profile,id:userId}} messages={messages} staff={staff} onlineIds={onlineIds} tab={tab} setTab={setTab} selectedMessage={selectedMessage} setSelectedMessage={setSelectedMessage} onView={viewMessage} onReload={load} onClose={() => setOpen(false)} />}
    {urgentPopup && <UrgentMessagePopup count={messages.filter((m)=>m.urgent&&!m.read_at).length || 1} onView={() => viewMessage(urgentPopup)} onClose={() => setUrgentPopup(null)} />}
  </>
}

function UrgentMessagePopup({ count, onView, onClose }) {
  return <ModalPortal onClose={onClose} ariaLabel="Urgent Message">
    <div className="urgent-message-popup">
      <header><strong>Urgent Message</strong><button onClick={onClose}><X size={14}/></button></header>
      <div className="urgent-message-body"><Mail size={42}/><strong>You have {count} urgent screen message{count === 1 ? '' : 's'}.</strong></div>
      <footer><button className="primary-button" onClick={onView}>View</button><button className="secondary-button" onClick={onClose}>Close</button></footer>
    </div>
  </ModalPortal>
}

function MessageWindow({ profile, messages, staff, onlineIds, tab, setTab, selectedMessage, setSelectedMessage, onView, onReload, onClose }) {
  const [replyMessage, setReplyMessage] = useState(null)

  function composeNew() {
    setReplyMessage(null)
    setTab('send')
  }

  function replyTo(message) {
    if (!message?.sender_id) return
    setReplyMessage(message)
    setTab('send')
  }

  return <ModalPortal onClose={onClose} ariaLabel="Screen Messages">
    <div className="screen-message-window">
      <header><strong>Screen Messages</strong><div><button title="Refresh" onClick={()=>onReload().catch(()=>{})}><RefreshCcw size={14}/></button><button onClick={onClose}><X size={15}/></button></div></header>
      <div className="screen-message-tabs"><button className={tab==='inbox'?'active':''} onClick={()=>setTab('inbox')}>Inbox</button><button className={tab==='send'?'active':''} onClick={composeNew}>Send Screen Message</button></div>
      {tab === 'send'
        ? <SendMessageForm key={replyMessage?.id || 'new-message'} profile={profile} staff={staff} onlineIds={onlineIds} replyMessage={replyMessage} onCancelReply={() => { setReplyMessage(null); setTab('inbox') }} onSent={() => { setReplyMessage(null); setTab('inbox'); onReload().catch(()=>{}) }}/>
        : <Inbox messages={messages} selected={selectedMessage} onSelect={(m)=>{setSelectedMessage(m);onView(m)}} onReply={replyTo} />}
    </div>
  </ModalPortal>
}

function SendMessageForm({ profile, staff, onlineIds, replyMessage, onCancelReply, onSent }) {
  const replySubject = replyMessage?.subject ? (String(replyMessage.subject).toLowerCase().startsWith('re:') ? replyMessage.subject : `RE: ${replyMessage.subject}`) : ''
  const [subject,setSubject]=useState(replySubject)
  const [body,setBody]=useState('')
  const [urgent,setUrgent]=useState(false)
  const [query,setQuery]=useState('')
  const [showOffline,setShowOffline]=useState(true)
  const [selected,setSelected]=useState(() => new Set(replyMessage?.sender_id ? [replyMessage.sender_id] : []))
  const [sending,setSending]=useState(false)
  const [error,setError]=useState('')
  const filtered=useMemo(()=>staff.filter(s=>s.id!==profile.id).filter(s=>showOffline||onlineIds.has(s.id)).filter(s=>`${s.last_name||''} ${s.first_name||''} ${s.display_name||''} ${s.role||''}`.toLowerCase().includes(query.toLowerCase())),[staff,query,showOffline,onlineIds,profile.id])
  function toggle(id){setSelected(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next})}
  async function send(){setSending(true);setError('');try{await sendScreenMessages({sender:profile,recipientIds:[...selected],subject,body,urgent});onSent()}catch(err){setError(err.message||'Unable to send message.');setSending(false)}}
  return <div className="screen-message-compose">
    {replyMessage && <div className="screen-message-reply-banner"><Reply size={13}/><span>Replying to <strong>{replyMessage.sender_name}</strong> about “{replyMessage.subject}”.</span><button type="button" onClick={onCancelReply}>Cancel reply</button></div>}
    <label>Subject:<div className="counted-field"><input autoFocus={!replyMessage} maxLength={100} value={subject} onChange={e=>setSubject(e.target.value)}/><span>{100-subject.length}</span></div></label>
    <label>Message:<div className="counted-field"><textarea autoFocus={Boolean(replyMessage)} maxLength={500} value={body} onChange={e=>setBody(e.target.value)}/><span>{500-body.length}</span></div></label>
    <label className="urgent-check"><input type="checkbox" checked={urgent} onChange={e=>setUrgent(e.target.checked)}/> Urgent</label>
    <div className="recipient-bar"><strong>To:</strong><span>Find by name</span><label><input type="checkbox" checked={showOffline} onChange={e=>setShowOffline(e.target.checked)}/> Show offline users</label></div>
    <input className="recipient-search" placeholder="Find user" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="recipient-list">{filtered.map(s=><label key={s.id}><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggle(s.id)}/><span className={`presence-dot ${onlineIds.has(s.id)?'online':'offline'}`}/><span><strong>{String(s.last_name||'').toUpperCase()}, {s.first_name} {s.title?`(${s.title})`:''}</strong><small>{s.role}</small></span></label>)}</div>
    {error&&<div className="form-error">{error}</div>}
    <footer><button className="primary-button" disabled={sending||!subject.trim()||!body.trim()||selected.size===0} onClick={send}><Send size={13}/>{sending?'Sending…':'Send'}</button></footer>
  </div>
}

function Inbox({ messages, selected, onSelect, onReply }) {
  return <div className="screen-message-inbox"><div className="message-list">{messages.length===0?<div className="empty-state">No screen messages.</div>:messages.map(m=><button key={m.id} className={`${!m.read_at?'unread':''} ${selected?.id===m.id?'selected':''}`} onClick={()=>onSelect(m)}><span>{m.urgent?'!':''}</span><div><strong>{m.subject}</strong><small>{m.sender_name} · {m.sender_role}</small></div><time>{new Date(m.created_at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'})}</time></button>)}</div><div className="message-preview">{selected?<><h3>{selected.subject}</h3><p className="message-from">From: {selected.sender_name} ({selected.sender_role})</p><p>{selected.body}</p><div className="message-preview-actions"><button type="button" className="primary-button" onClick={()=>onReply(selected)}><Reply size={13}/> Reply</button></div></>:<div className="empty-state">Select a message to view it.</div>}</div></div>
}
