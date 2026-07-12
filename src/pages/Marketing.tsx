import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';

const statusOptions = ['Prospect identified', 'Proposal submitted', 'Presentation done', 'Follow-up needed', 'Interested', 'Not interested', 'Signed / Converted'];

function canViewAllMarketing(profile: any) {
  const role = String(profile?.role || '').toLowerCase();
  const position = String(profile?.position || '').toLowerCase();
  const department = String(profile?.department || '').toLowerCase();
  return role === 'admin'
    || position.includes('marketer')
    || position.includes('marketing')
    || position.includes('office staff')
    || position.includes('administration')
    || department.includes('marketing')
    || department.includes('administration')
    || department.includes('human resource');
}

export function Marketing() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ school_name: '', location: '', contact_person: '', contact_phone: '', status: 'Proposal submitted', notes: '' });
  const viewAll = useMemo(() => canViewAllMarketing(profile), [profile?.role, profile?.position, profile?.department]);

  async function load() {
    if (!profile) return;
    let query = supabase.from('marketing_records').select('*, profiles(full_name,email,position)').order('created_at', { ascending: false }).limit(300);
    if (!viewAll) query = query.eq('staff_id', profile.id);
    const { data, error } = await query;
    if (error) setMessage(error.message); else setRecords(data || []);
  }

  useEffect(() => { load(); }, [profile?.id, viewAll]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!form.school_name.trim() || !form.location.trim() || !form.contact_person.trim()) { setMessage('Please add school name, location and contact person.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('marketing_records').insert({
        staff_id: profile.id,
        school_name: form.school_name.trim(),
        location: form.location.trim(),
        contact_person: form.contact_person.trim(),
        contact_phone: form.contact_phone.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
      setMessage('Marketing information saved successfully.');
      setForm({ school_name: '', location: '', contact_person: '', contact_phone: '', status: 'Proposal submitted', notes: '' });
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Marketing information could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    downloadCsv('mezzo-marketing-records.csv', records.map((row) => ({
      school_name: row.school_name,
      location: row.location,
      contact_person: row.contact_person,
      contact_phone: row.contact_phone,
      status: row.status,
      submitted_by: row.profiles?.full_name || row.profiles?.email,
      position: row.profiles?.position,
      notes: row.notes,
      date: row.created_at,
    })));
  }

  return <section>
    <div className="page-header"><div><h1>Marketing Records</h1><p>Record school visits, proposals and presentations.</p></div>{viewAll && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <form className="panel form-grid" onSubmit={submit}>
      <h2>Add Marketing Information</h2>
      <p className="hint">Teachers who visit schools for marketing can submit the school details here. Marketing, office staff and admins can view all entries.</p>
      <div className="grid two">
        <label>School Name<input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} required /></label>
        <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required /></label>
        <label>Contact Person<input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} required /></label>
        <label>Contact Number<input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
      </div>
      <label>Notes / Next Step<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Example: Headteacher requested follow-up next week." /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Marketing Record'}</button>
    </form>

    <div className="panel">
      <h2>{viewAll ? 'All Marketing Information' : 'My Marketing Information'}</h2>
      <div className="table-card"><table><thead><tr><th>Date</th><th>School</th><th>Location</th><th>Contact Person</th><th>Contact</th><th>Status</th><th>Submitted By</th><th>Notes</th></tr></thead><tbody>{records.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleDateString()}</td><td>{row.school_name}</td><td>{row.location}</td><td>{row.contact_person}</td><td>{row.contact_phone || '-'}</td><td><span className="pill">{row.status}</span></td><td>{row.profiles?.full_name || row.profiles?.email || '-'}</td><td>{row.notes || '-'}</td></tr>)}</tbody></table></div>
      {records.length === 0 && <div className="empty">No marketing records found yet.</div>}
    </div>
  </section>;
}
