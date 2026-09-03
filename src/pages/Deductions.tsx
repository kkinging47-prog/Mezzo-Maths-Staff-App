import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';

function isSupervisor(profile: any) {
  return String(profile?.position || '').toLowerCase().includes('supervisor');
}
function money(value: number) { return `GHS ${Number(value || 0).toFixed(2)}`; }
function today() { return new Date().toISOString().slice(0, 10); }
function weekStart() { const d = new Date(); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d.toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

const deductionSelect = '*, staff:profiles!attendance_deductions_staff_id_fkey(full_name,email,position), schools(name)';

export function Deductions() {
  const { profile } = useAuth();
  const [deductions, setDeductions] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [checkDate, setCheckDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const admin = profile?.role === 'admin';
  const supervisor = useMemo(() => isSupervisor(profile), [profile?.position]);
  const canReview = admin;
  const canViewAll = admin || supervisor;

  async function load() {
    if (!profile) return;
    let query = supabase.from('attendance_deductions').select(deductionSelect).order('work_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
    if (!canViewAll) query = query.eq('staff_id', profile.id);
    const { data, error } = await query;
    if (error) setMessage(error.message); else setDeductions(data || []);
  }

  useEffect(() => { load(); }, [profile?.id, canViewAll]);

  async function runCheck(event: FormEvent) {
    event.preventDefault();
    if (!canReview) return;
    setBusy(true); setMessage('');
    try {
      const { data, error } = await supabase.rpc('create_daily_attendance_deductions', { p_work_date: checkDate });
      if (error) throw error;
      setMessage(`${data || 0} defaulter deduction notification(s) created for ${checkDate}.`);
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Could not run defaulter check.');
    } finally { setBusy(false); }
  }

  async function review(id: string, status: 'approved' | 'rejected') {
    if (!profile || !canReview) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('attendance_deductions').update({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString(), admin_notes: adminNote[id] || null, updated_at: new Date().toISOString() }).eq('id', id);
    setBusy(false);
    if (error) setMessage(error.message); else { setMessage(status === 'approved' ? 'Deduction approved.' : 'Deduction rejected.'); await load(); }
  }

  const approved = deductions.filter((row) => row.status === 'approved');
  const pending = deductions.filter((row) => row.status === 'pending');
  const dayTotal = approved.filter((row) => row.work_date === today()).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const weekTotal = approved.filter((row) => row.work_date >= weekStart()).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const monthTotal = approved.filter((row) => row.work_date >= monthStart()).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pendingTotal = pending.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  function exportCsv() {
    downloadCsv('attendance-deductions.csv', deductions.map((row) => ({
      date: row.work_date,
      staff: row.staff?.full_name || row.staff?.email,
      school: row.schools?.name,
      amount: row.amount,
      status: row.status,
      reason: row.reason,
      admin_notes: row.admin_notes,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
    })));
  }

  return <section>
    <div className="page-header"><div><h1>Attendance Deductions</h1><p>GHS 10 pending deduction is created when a staff member misses check-in on a designated timetable day.</p></div>{canViewAll && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four">
      <div className="metric-card"><span>Today</span><strong>{money(dayTotal)}</strong></div>
      <div className="metric-card"><span>This Week</span><strong>{money(weekTotal)}</strong></div>
      <div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div>
      <div className="metric-card"><span>Pending Review</span><strong>{money(pendingTotal)}</strong></div>
    </div>

    {canReview && <form className="panel form-grid" onSubmit={runCheck}>
      <h2>Run Defaulter Check</h2>
      <p className="hint">This checks the selected date and creates pending deductions only for staff who missed attendance after their school's reopening date.</p>
      <div className="grid two"><label>Date to check<input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} required /></label><button className="primary" disabled={busy}>{busy ? 'Checking...' : 'Create Pending Deductions'}</button></div>
    </form>}

    {canReview && <div className="panel"><h2>Admin Notifications: Pending Deductions</h2>{pending.length === 0 && <div className="empty">No pending deductions waiting for approval.</div>}<div className="table-card"><table><thead><tr><th>Date</th><th>Staff</th><th>School</th><th>Amount</th><th>Reason</th><th>Admin Note</th><th>Decision</th></tr></thead><tbody>{pending.map((row) => <tr key={row.id}><td>{row.work_date}</td><td>{row.staff?.full_name || row.staff?.email}</td><td>{row.schools?.name || '-'}</td><td>{money(row.amount)}</td><td>{row.reason}</td><td><input value={adminNote[row.id] || ''} onChange={(e) => setAdminNote({ ...adminNote, [row.id]: e.target.value })} placeholder="Optional note" /></td><td><div className="button-row"><button className="primary small-button" disabled={busy} onClick={() => review(row.id, 'approved')}>Approve</button><button className="danger small-button" disabled={busy} onClick={() => review(row.id, 'rejected')}>Reject</button></div></td></tr>)}</tbody></table></div></div>}

    <div className="panel"><h2>{canViewAll ? 'All Deduction Records' : 'My Deduction Records'}</h2><div className="table-card"><table><thead><tr><th>Date</th><th>Staff</th><th>School</th><th>Amount</th><th>Status</th><th>Reason</th><th>Admin Note</th></tr></thead><tbody>{deductions.map((row) => <tr key={row.id}><td>{row.work_date}</td><td>{row.staff?.full_name || row.staff?.email}</td><td>{row.schools?.name || '-'}</td><td>{money(row.amount)}</td><td><span className={`pill status-${row.status}`}>{row.status}</span></td><td>{row.reason}</td><td>{row.admin_notes || '-'}</td></tr>)}</tbody></table></div>{deductions.length === 0 && <div className="empty">No deduction records found.</div>}</div>
  </section>;
}
