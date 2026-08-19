import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const SHARE_VALUE = 20;

function money(value: number | string | null | undefined) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function sharesFromRow(row: any) {
  if (row.number_of_shares !== null && row.number_of_shares !== undefined) return Number(row.number_of_shares || 0);
  return Number(row.amount || 0) / Number(row.share_value || SHARE_VALUE);
}

export function CreditUnion() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ staff_id: '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
  const isAdmin = profile?.role === 'admin';

  const calculated = useMemo(() => {
    const shares = Number(form.number_of_shares || 0);
    const dividendPerShare = Number(form.dividend_per_share || 0);
    return {
      shares,
      amount: shares * SHARE_VALUE,
      dividendAmount: shares * dividendPerShare,
    };
  }, [form.number_of_shares, form.dividend_per_share]);

  async function load() {
    if (!profile) return;
    const contributionSelect = '*, staff:profiles!credit_union_contributions_staff_id_fkey(full_name,email,position)';
    if (isAdmin) {
      const [{ data: staffRows }, { data: contributionRows, error }] = await Promise.all([
        supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
        supabase.from('credit_union_contributions').select(contributionSelect).order('contribution_month', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else setRecords(contributionRows || []);
    } else {
      const { data, error } = await supabase.from('credit_union_contributions').select(contributionSelect).eq('staff_id', profile.id).order('contribution_month', { ascending: false }).limit(500);
      if (error) setMessage(error.message); else setRecords(data || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    if (!form.staff_id || calculated.shares <= 0) { setMessage('Please select staff and enter a valid number of shares.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('credit_union_contributions').insert({
        staff_id: form.staff_id,
        recorded_by: profile.id,
        contribution_month: form.contribution_month,
        share_value: SHARE_VALUE,
        number_of_shares: calculated.shares,
        amount: calculated.amount,
        dividend_per_share: form.dividend_per_share ? Number(form.dividend_per_share) : 0,
        dividend_amount: calculated.dividendAmount,
        contribution_type: form.contribution_type,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
      setMessage('Credit union contribution saved successfully.');
      setForm({ staff_id: form.staff_id, contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
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
      staff: row.staff?.full_name || row.staff?.email,
      position: row.staff?.position,
      month: row.contribution_month,
      number_of_shares: sharesFromRow(row),
      share_value: row.share_value || SHARE_VALUE,
      contribution_amount: row.amount,
      dividend_per_share: row.dividend_per_share,
      dividend_amount: row.dividend_amount,
      type: row.contribution_type,
      notes: row.notes,
      created_at: row.created_at,
    })));
  }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalShares = records.reduce((sum, row) => sum + sharesFromRow(row), 0);
  const totalDividends = records.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0);
  const thisMonth = currentMonth();
  const monthTotal = records.filter((row) => row.contribution_month === thisMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Each credit union share is GHS 20. Record old contributions and current monthly contributions.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four">
      <div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div>
      <div className="metric-card"><span>Total Shares</span><strong>{totalShares.toFixed(2)}</strong></div>
      <div className="metric-card"><span>Total Dividends</span><strong>{money(totalDividends)}</strong></div>
      <div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div>
    </div>

    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}>
      <h2>Add Contribution</h2>
      <p className="hint">Enter old records year by year or month by month. The system multiplies shares by GHS 20 for the contribution amount, and multiplies dividend amount by number of shares.</p>
      <div className="grid two">
        <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
        <label>Contribution Month / Date<input type="date" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label>
        <label>Number of Shares<input type="number" min="0" step="0.01" value={form.number_of_shares} onChange={(e) => setForm({ ...form, number_of_shares: e.target.value })} placeholder="Example: 5" required /></label>
        <label>Share Value<input value="GHS 20.00" disabled /></label>
        <label>Contribution Amount<input value={money(calculated.amount)} disabled /></label>
        <label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={form.dividend_per_share} onChange={(e) => setForm({ ...form, dividend_per_share: e.target.value })} placeholder="Example: 2" /></label>
        <label>Total Dividend<input value={money(calculated.dividendAmount)} disabled /></label>
        <label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="old_record">Old / Past Years Record</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label>
      </div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Example: Contributions from 2022, arrears, or current month." /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button>
    </form>}

    <div className="panel">
      <h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2>
      <div className="table-card"><table><thead><tr><th>Month</th><th>Staff</th><th>Shares</th><th>Contribution</th><th>Dividend / Share</th><th>Total Dividend</th><th>Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{records.map((row) => <tr key={row.id}><td>{row.contribution_month}</td><td>{row.staff?.full_name || row.staff?.email || '-'}</td><td>{sharesFromRow(row).toFixed(2)}</td><td>{money(row.amount)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>
      {records.length === 0 && <div className="empty">No credit union contribution records found.</div>}
    </div>
  </section>;
}
