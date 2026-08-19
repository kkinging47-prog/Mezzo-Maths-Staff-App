import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

function money(value: number | string | null | undefined) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function CreditUnion() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ staff_id: '', contribution_month: currentMonth(), amount: '', contribution_type: 'monthly', notes: '' });
  const isAdmin = profile?.role === 'admin';

  async function load() {
    if (!profile) return;
    if (isAdmin) {
      const [{ data: staffRows }, { data: contributionRows, error }] = await Promise.all([
        supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
        supabase.from('credit_union_contributions').select('*, profiles(full_name,email,position)').order('contribution_month', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else setRecords(contributionRows || []);
    } else {
      const { data, error } = await supabase.from('credit_union_contributions').select('*, profiles(full_name,email,position)').eq('staff_id', profile.id).order('contribution_month', { ascending: false }).limit(200);
      if (error) setMessage(error.message); else setRecords(data || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    const amount = Number(form.amount || 0);
    if (!form.staff_id || amount <= 0) { setMessage('Please select staff and enter a valid amount.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('credit_union_contributions').insert({
        staff_id: form.staff_id,
        recorded_by: profile.id,
        contribution_month: form.contribution_month,
        amount,
        contribution_type: form.contribution_type,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
      setMessage('Credit union contribution saved successfully.');
      setForm({ staff_id: form.staff_id, contribution_month: currentMonth(), amount: '', contribution_type: 'monthly', notes: '' });
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Could not save contribution.');
    } finally { setBusy(false); }
  }

  async function deleteContribution(id: string) {
    if (!isAdmin) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('credit_union_contributions').delete().eq('id', id);
    setBusy(false);
    if (error) setMessage(error.message); else { setMessage('Contribution removed.'); await load(); }
  }

  function exportCsv() {
    downloadCsv('credit-union-contributions.csv', records.map((row) => ({
      staff: row.profiles?.full_name || row.profiles?.email,
      position: row.profiles?.position,
      month: row.contribution_month,
      amount: row.amount,
      type: row.contribution_type,
      notes: row.notes,
      created_at: row.created_at,
    })));
  }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const thisMonth = currentMonth();
  const monthTotal = records.filter((row) => row.contribution_month === thisMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Record and monitor staff credit union contributions.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid three">
      <div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div>
      <div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div>
      <div className="metric-card"><span>Records</span><strong>{records.length}</strong></div>
    </div>

    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}>
      <h2>Add Contribution</h2>
      <p className="hint">Use this to record credit union deductions or contributions for staff. Staff can only see their own records.</p>
      <div className="grid two">
        <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
        <label>Contribution Month<input type="date" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label>
        <label>Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
        <label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label>
      </div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional note." /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button>
    </form>}

    <div className="panel">
      <h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2>
      <div className="table-card"><table><thead><tr><th>Month</th><th>Staff</th><th>Amount</th><th>Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{records.map((row) => <tr key={row.id}><td>{row.contribution_month}</td><td>{row.profiles?.full_name || row.profiles?.email || '-'}</td><td>{money(row.amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>
      {records.length === 0 && <div className="empty">No credit union contribution records found.</div>}
    </div>
  </section>;
}
