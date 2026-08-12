import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

function money(value: number | string | null | undefined) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function Loans() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ staff_id: '', amount: '', balance: '', monthly_repayment: '', issue_date: today(), status: 'active', notes: '' });
  const isAdmin = profile?.role === 'admin';

  async function load() {
    if (!profile) return;
    if (isAdmin) {
      const [{ data: staffRows }, { data: loanRows, error }] = await Promise.all([
        supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
        supabase.from('staff_loans').select('*, profiles(full_name,email,position)').order('issue_date', { ascending: false }).order('created_at', { ascending: false }),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else setLoans(loanRows || []);
    } else {
      const { data, error } = await supabase.from('staff_loans').select('*, profiles(full_name,email,position)').eq('staff_id', profile.id).order('issue_date', { ascending: false });
      if (error) setMessage(error.message); else setLoans(data || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);

  async function addLoan(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    const amount = Number(form.amount || 0);
    const balance = Number(form.balance || form.amount || 0);
    if (!form.staff_id || amount <= 0) { setMessage('Please select staff and enter a valid loan amount.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('staff_loans').insert({
        staff_id: form.staff_id,
        created_by: profile.id,
        amount,
        balance,
        monthly_repayment: form.monthly_repayment ? Number(form.monthly_repayment) : null,
        issue_date: form.issue_date,
        status: form.status,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
      setMessage('Staff loan saved successfully.');
      setForm({ staff_id: form.staff_id, amount: '', balance: '', monthly_repayment: '', issue_date: today(), status: 'active', notes: '' });
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Could not save staff loan.');
    } finally { setBusy(false); }
  }

  async function updateLoan(row: any, status: 'active' | 'cleared' | 'cancelled') {
    if (!isAdmin) return;
    setBusy(true); setMessage('');
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (status === 'cleared') updates.balance = 0;
    const { error } = await supabase.from('staff_loans').update(updates).eq('id', row.id);
    setBusy(false);
    if (error) setMessage(error.message); else { setMessage(status === 'cleared' ? 'Loan marked as cleared.' : 'Loan updated.'); await load(); }
  }

  function exportCsv() {
    downloadCsv('staff-loans.csv', loans.map((row) => ({
      staff: row.profiles?.full_name || row.profiles?.email,
      position: row.profiles?.position,
      issue_date: row.issue_date,
      amount: row.amount,
      balance: row.balance,
      monthly_repayment: row.monthly_repayment,
      status: row.status,
      notes: row.notes,
    })));
  }

  const totalActive = loans.filter((row) => row.status === 'active').reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const totalOriginal = loans.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return <section>
    <div className="page-header"><div><h1>Staff Loans</h1><p>Record office loans and let staff see their own loan balances.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid three">
      <div className="metric-card"><span>{isAdmin ? 'Active Loan Balance' : 'My Active Balance'}</span><strong>{money(totalActive)}</strong></div>
      <div className="metric-card"><span>Total Recorded</span><strong>{money(totalOriginal)}</strong></div>
      <div className="metric-card"><span>Records</span><strong>{loans.length}</strong></div>
    </div>

    {isAdmin && <form className="panel form-grid" onSubmit={addLoan}>
      <h2>Add Office Loan</h2>
      <p className="hint">Use this when a staff member takes a loan from the office. Staff members can only see their own loan records.</p>
      <div className="grid two">
        <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
        <label>Issue Date<input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} required /></label>
        <label>Loan Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value, balance: form.balance || e.target.value })} required /></label>
        <label>Current Balance<input type="number" min="0" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="Same as loan amount if blank" /></label>
        <label>Monthly Repayment<input type="number" min="0" step="0.01" value={form.monthly_repayment} onChange={(e) => setForm({ ...form, monthly_repayment: e.target.value })} /></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="cleared">Cleared</option><option value="cancelled">Cancelled</option></select></label>
      </div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reason, repayment agreement, or any office note." /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Loan'}</button>
    </form>}

    <div className="panel">
      <h2>{isAdmin ? 'All Staff Loans' : 'My Office Loans'}</h2>
      <div className="table-card"><table><thead><tr><th>Date</th><th>Staff</th><th>Amount</th><th>Balance</th><th>Monthly Repayment</th><th>Status</th><th>Notes</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>{loans.map((row) => <tr key={row.id}><td>{row.issue_date}</td><td>{row.profiles?.full_name || row.profiles?.email || '-'}</td><td>{money(row.amount)}</td><td>{money(row.balance)}</td><td>{row.monthly_repayment ? money(row.monthly_repayment) : '-'}</td><td><span className={`pill status-${row.status}`}>{row.status}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><div className="button-row"><button className="primary small-button" disabled={busy || row.status === 'active'} onClick={() => updateLoan(row, 'active')}>Active</button><button className="primary small-button" disabled={busy || row.status === 'cleared'} onClick={() => updateLoan(row, 'cleared')}>Clear</button><button className="danger small-button" disabled={busy || row.status === 'cancelled'} onClick={() => updateLoan(row, 'cancelled')}>Cancel</button></div></td>}</tr>)}</tbody></table></div>
      {loans.length === 0 && <div className="empty">No loan records found.</div>}
    </div>
  </section>;
}
