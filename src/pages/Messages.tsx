import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

function isAdminOrSupervisor(profile?: Profile | null) {
  return profile?.role === 'admin' || String(profile?.position || '').toLowerCase().includes('supervisor');
}

export function Messages() {
  const { profile } = useAuth();
  const [recipients, setRecipients] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ recipient_id: '', subject: '', body: '' });
  const adminOrSupervisor = useMemo(() => isAdminOrSupervisor(profile), [profile?.role, profile?.position]);

  async function load() {
    if (!profile) return;
    const [{ data: people }, { data: msgData, error }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email,position,role,status').neq('id', profile.id).neq('status', 'left').order('full_name'),
      supabase.from('staff_messages').select('*, sender:sender_id(full_name,email,position), recipient:recipient_id(full_name,email,position)').order('created_at', { ascending: false }).limit(200),
    ]);
    const list = ((people || []) as Profile[]).filter((person) => adminOrSupervisor || person.role === 'admin' || String(person.position || '').toLowerCase().includes('supervisor'));
    setRecipients(list);
    if (!form.recipient_id && list[0]) setForm((prev) => ({ ...prev, recipient_id: list[0].id }));
    if (error) setMessage(error.message); else setMessages(msgData || []);
  }

  useEffect(() => { load(); }, [profile?.id, adminOrSupervisor]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!form.recipient_id || !form.subject.trim() || !form.body.trim()) { setMessage('Please choose recipient, subject and message.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('staff_messages').insert({ sender_id: profile.id, recipient_id: form.recipient_id, subject: form.subject.trim(), body: form.body.trim() });
      if (error) throw error;
      setMessage('Message sent successfully.');
      setForm({ recipient_id: recipients[0]?.id || '', subject: '', body: '' });
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Message could not be sent.');
    } finally { setBusy(false); }
  }

  async function markRead(row: any) {
    if (!profile || row.recipient_id !== profile.id || row.read_at) return;
    await supabase.from('staff_messages').update({ read_at: new Date().toISOString() }).eq('id', row.id).eq('recipient_id', profile.id);
    await load();
  }

  return <section>
    <div className="page-header"><div><h1>Inbox</h1><p>Send and receive private staff messages.</p></div></div>
    {message && <div className="status info">{message}</div>}
    <form className="panel form-grid" onSubmit={sendMessage}>
      <h2>Send Personal Message</h2>
      <p className="hint">Admins and supervisors can message staff. Staff can message admins and supervisors.</p>
      <label>Recipient<select value={form.recipient_id} onChange={(e) => setForm({ ...form, recipient_id: e.target.value })} required>{recipients.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email} · {person.position || person.role}</option>)}</select></label>
      <label>Subject<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></label>
      <label>Message<textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></label>
      <button className="primary" disabled={busy || recipients.length === 0}>{busy ? 'Sending...' : 'Send Message'}</button>
      {recipients.length === 0 && <p className="warning">No eligible recipients found.</p>}
    </form>
    <div className="panel">
      <h2>Messages</h2>
      <div className="message-list">{messages.length === 0 && <div className="empty">No messages yet.</div>}{messages.map((row) => <article key={row.id} className={`summary-card ${row.recipient_id === profile?.id && !row.read_at ? 'unread-message' : ''}`} onClick={() => markRead(row)}><div className="post-head"><div><strong>{row.subject}</strong><span>{new Date(row.created_at).toLocaleString()}</span></div><em>{row.recipient_id === profile?.id ? 'Inbox' : 'Sent'}</em></div><p>{row.body}</p><p className="muted">From: {row.sender?.full_name || row.sender?.email || '-'} · To: {row.recipient?.full_name || row.recipient?.email || '-'}</p></article>)}</div>
    </div>
  </section>;
}
