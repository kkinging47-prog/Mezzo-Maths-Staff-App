import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const statusOptions = ['Open', 'Responded', 'Resolved', 'Closed'];

function canIssueQuery(profile?: Profile | null) {
  return profile?.role === 'admin' || String(profile?.position || '').toLowerCase().includes('supervisor');
}

export function Queries() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ staff_id: '', rule_violated: '', details: '', action_required: '', due_date: '', status: 'Open' });
  const allowed = useMemo(() => canIssueQuery(profile), [profile?.role, profile?.position]);

  async function load() {
    if (!profile) return;
    const requests: any[] = [
      supabase.from('staff_queries').select('*, issued_by_profile:issued_by(full_name,email,position), staff_profile:staff_id(full_name,email,position)').order('created_at', { ascending: false }).limit(200),
    ];
    if (allowed) requests.push(supabase.from('profiles').select('id,full_name,email,position,status').neq('status', 'left').order('full_name'));
    const [queryResult, staffResult] = await Promise.all(requests);
    if (queryResult.error) setMessage(queryResult.error.message); else setQueries(queryResult.data || []);
    if (staffResult?.data) {
      const list = (staffResult.data as Profile[]).filter((person) => person.id !== profile.id);
      setStaff(list);
      if (!form.staff_id && list[0]) setForm((prev) => ({ ...prev, staff_id: list[0].id }));
    }
  }

  useEffect(() => { load(); }, [profile?.id, allowed]);

  async function issueQuery(event: FormEvent) {
    event.preventDefault();
    if (!profile || !allowed) return;
    if (!form.staff_id || !form.rule_violated.trim() || !form.details.trim()) { setMessage('Please select staff and enter the rule violated and details.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('staff_queries').insert({
        staff_id: form.staff_id,
        issued_by: profile.id,
        rule_violated: form.rule_violated.trim(),
        details: form.details.trim(),
        action_required: form.action_required.trim() || null,
        due_date: form.due_date || null,
        status: form.status,
      });
      if (error) throw error;
      setMessage('Staff query issued successfully.');
      setForm({ staff_id: staff[0]?.id || '', rule_violated: '', details: '', action_required: '', due_date: '', status: 'Open' });
      await load();
    } catch (error: any) { setMessage(error.message || 'Query could not be issued.'); } finally { setBusy(false); }
  }

  async function submitResponse(row: any) {
    if (!profile) return;
    const body = responseText[row.id]?.trim();
    if (!body) { setMessage('Please type your response first.'); return; }
    const { error } = await supabase.from('staff_queries').update({ staff_response: body, responded_at: new Date().toISOString(), status: 'Responded' }).eq('id', row.id).eq('staff_id', profile.id);
    if (error) setMessage(error.message); else { setMessage('Your response has been submitted.'); setResponseText((prev) => ({ ...prev, [row.id]: '' })); await load(); }
  }

  async function updateStatus(row: any, status: string) {
    const { error } = await supabase.from('staff_queries').update({ status, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) setMessage(error.message); else { setMessage('Query status updated.'); await load(); }
  }

  return <section>
    <div className="page-header"><div><h1>Staff Queries</h1><p>Issue and respond to formal queries for rule violations.</p></div></div>
    {message && <div className="status info">{message}</div>}
    {allowed && <form className="panel form-grid" onSubmit={issueQuery}>
      <h2>Create Staff Query</h2>
      <p className="hint">Use this when a staff member has violated company rules or needs to explain an incident.</p>
      <div className="grid two"><label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email} · {person.position}</option>)}</select></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Rule Violated<input value={form.rule_violated} onChange={(e) => setForm({ ...form, rule_violated: e.target.value })} required /></label><label>Response Due Date<input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label></div>
      <label>Details of Violation<textarea value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} required /></label>
      <label>Action Required<textarea value={form.action_required} onChange={(e) => setForm({ ...form, action_required: e.target.value })} /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving query...' : 'Issue Query'}</button>
    </form>}
    <div className="panel">
      <h2>{allowed ? 'All Staff Queries' : 'My Queries'}</h2>
      {queries.length === 0 && <div className="empty">No queries found.</div>}
      {queries.map((row) => <article key={row.id} className="summary-card"><div className="post-head"><div><strong>{row.rule_violated}</strong><span>{new Date(row.created_at).toLocaleString()}</span></div><em>{row.status}</em></div><p>{row.details}</p>{row.action_required && <p><strong>Action Required:</strong> {row.action_required}</p>}{row.due_date && <p><strong>Due Date:</strong> {row.due_date}</p>}<p className="muted">Staff: {row.staff_profile?.full_name || row.staff_profile?.email || '-'} · Issued by: {row.issued_by_profile?.full_name || row.issued_by_profile?.email || '-'}</p>{row.staff_response && <div className="status success"><strong>Staff Response:</strong> {row.staff_response}</div>}{row.staff_id === profile?.id && row.status !== 'Closed' && <div className="form-grid"><label>My Response<textarea value={responseText[row.id] || ''} onChange={(e) => setResponseText((prev) => ({ ...prev, [row.id]: e.target.value }))} /></label><button className="primary small-button" onClick={() => submitResponse(row)}>Submit Response</button></div>}{allowed && <div className="button-row">{statusOptions.map((item) => <button key={item} type="button" className="secondary small-button" onClick={() => updateStatus(row, item)}>{item}</button>)}</div>}</article>)}
    </div>
  </section>;
}
