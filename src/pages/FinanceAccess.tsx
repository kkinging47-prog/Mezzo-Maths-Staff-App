import { FormEvent, useEffect, useMemo, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

type AccessRow = {
  id: string;
  profile_id: string;
  access_level: 'finance_admin' | 'finance_viewer';
  active: boolean;
  notes?: string | null;
  profiles?: Pick<Profile, 'id' | 'full_name' | 'email' | 'position' | 'staff_no'> | null;
};

function staffLabel(row?: Pick<Profile, 'full_name' | 'email' | 'staff_no' | 'position'> | null) {
  return [row?.full_name, row?.staff_no, row?.email, row?.position].filter(Boolean).join(' · ') || 'Staff member';
}

export function FinanceAccess() {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [accessRows, setAccessRows] = useState<AccessRow[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ profile_id: '', access_level: 'finance_admin', notes: '' });
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  async function loadData() {
    const [{ data: staffData, error: staffError }, { data: accessData, error: accessError }] = await Promise.all([
      supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
      supabase.from('finance_user_access').select('*, profiles(id,full_name,email,position,staff_no)').order('created_at', { ascending: false }),
    ]);
    if (staffError || accessError) { setType('error'); setMessage((staffError || accessError)?.message || 'Could not load finance users.'); return; }
    const staffList = (staffData || []) as Profile[];
    setStaff(staffList);
    setAccessRows((accessData || []) as AccessRow[]);
    if (!form.profile_id && staffList[0]) setForm((prev) => ({ ...prev, profile_id: staffList[0].id }));
  }

  useEffect(() => { loadData(); }, []);

  const filteredStaff = useMemo(() => {
    const text = query.toLowerCase().trim();
    if (!text) return staff;
    return staff.filter((row) => staffLabel(row).toLowerCase().includes(text));
  }, [staff, query]);

  async function saveAccess(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from('finance_user_access').upsert({
        profile_id: form.profile_id,
        access_level: form.access_level,
        active: true,
        notes: form.notes || null,
      }, { onConflict: 'profile_id' });
      if (error) throw error;
      setType('success'); setMessage('Finance access saved.'); setForm((prev) => ({ ...prev, notes: '' })); await loadData();
    } catch (error: any) {
      setType('error'); setMessage(error.message || 'Could not save finance access.');
    } finally { setBusy(false); }
  }

  async function toggleAccess(row: AccessRow) {
    const { error } = await supabase.from('finance_user_access').update({ active: !row.active }).eq('id', row.id);
    if (error) { setType('error'); setMessage(error.message); return; }
    setType('success'); setMessage(row.active ? 'Finance access disabled.' : 'Finance access enabled.'); await loadData();
  }

  async function changeLevel(row: AccessRow, access_level: string) {
    const { error } = await supabase.from('finance_user_access').update({ access_level }).eq('id', row.id);
    if (error) { setType('error'); setMessage(error.message); return; }
    setType('success'); setMessage('Finance role updated.'); await loadData();
  }

  return <section>
    <div className="page-header"><div><h1>Finance User Access</h1><p>Give finance-only access without making the person a full system admin.</p></div></div>
    <StatusMessage message={message} type={type} />

    <div className="grid two">
      <form className="panel form-grid" onSubmit={saveAccess}>
        <h2>Add / Update Finance User</h2>
        <label>Search staff<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, staff number or position" /></label>
        <label>Staff<select required value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })}>{filteredStaff.map((row) => <option key={row.id} value={row.id}>{staffLabel(row)}</option>)}</select></label>
        <label>Access Level<select value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })}><option value="finance_admin">Finance Admin - can add/edit records</option><option value="finance_viewer">Finance Viewer - can view reports only</option></select></label>
        <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional reason or responsibility" /></label>
        <button className="primary" disabled={busy}>Save Finance Access</button>
      </form>

      <div className="panel">
        <h2>Current Finance Users</h2>
        <div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{accessRows.map((row) => <tr key={row.id}><td><strong>{staffLabel(row.profiles)}</strong>{row.notes && <><br /><span className="muted">{row.notes}</span></>}</td><td><select value={row.access_level} onChange={(e) => changeLevel(row, e.target.value)}><option value="finance_admin">Finance Admin</option><option value="finance_viewer">Finance Viewer</option></select></td><td><span className={`pill ${row.active ? 'status-active' : 'status-left'}`}>{row.active ? 'Active' : 'Disabled'}</span></td><td><button type="button" className={row.active ? 'danger small-button' : 'primary small-button'} onClick={() => toggleAccess(row)}>{row.active ? 'Disable' : 'Enable'}</button></td></tr>)}</tbody></table></div>
        {accessRows.length === 0 && <div className="empty">No finance-only users have been added yet.</div>}
      </div>
    </div>
  </section>;
}
