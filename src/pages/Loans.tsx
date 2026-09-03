import { FormEvent, useEffect, useMemo, useState } from 'react';
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

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function addMonths(monthDate: string, offset: number) {
  const [year, month] = monthDate.slice(0, 7).split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function monthLabel(value: string) {
  if (!value) return '-';
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function displayRate(value: number | string | null | undefined) {
  const rate = Number(value || 0);
  return rate ? `${rate.toFixed(4)} (${(rate * 100).toFixed(2)}%)` : '0';
}

const loanSelect = '*, staff:profiles!staff_loans_staff_id_fkey(full_name,email,position)';

export function Loans() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [form, setForm] = useState({
    staff_id: '',
    amount: '',
    interest_rate: '',
    repayment_months: '',
    issue_date: today(),
    repayment_start_month: currentMonth().slice(0, 7),
    notes: '',
  });
  const isAdmin = profile?.role === 'admin';

  const calculation = useMemo(() => {
    const amount = Number(form.amount || 0);
    const rate = Number(form.interest_rate || 0);
    const months = Math.max(0, Number(form.repayment_months || 0));
    const interest = amount * rate * months;
    const total = amount + interest;
    const monthly = months > 0 ? total / months : 0;
    return { amount, rate, months, interest, total, monthly };
  }, [form.amount, form.interest_rate, form.repayment_months]);

  async function load() {
    if (!profile) return;
    if (isAdmin) {
      const [{ data: staffRows }, { data: loanRows, error }, { data: repaymentRows, error: repaymentError }] = await Promise.all([
        supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
        supabase.from('staff_loans').select(loanSelect).order('issue_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('staff_loan_repayments').select('*').order('repayment_month', { ascending: true }),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else setLoans(loanRows || []);
      if (repaymentError) setMessage(repaymentError.message); else setRepayments(repaymentRows || []);
    } else {
      const [{ data: loanRows, error }, { data: repaymentRows, error: repaymentError }] = await Promise.all([
        supabase.from('staff_loans').select(loanSelect).eq('staff_id', profile.id).order('issue_date', { ascending: false }),
        supabase.from('staff_loan_repayments').select('*').eq('staff_id', profile.id).order('repayment_month', { ascending: true }),
      ]);
      if (error) setMessage(error.message); else setLoans(loanRows || []);
      if (repaymentError) setMessage(repaymentError.message); else setRepayments(repaymentRows || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);
  useEffect(() => {
    if (!selectedLoanId && loans[0]) setSelectedLoanId(loans[0].id);
    if (selectedLoanId && !loans.some((row) => row.id === selectedLoanId)) setSelectedLoanId(loans[0]?.id || '');
  }, [loans, selectedLoanId]);

  async function addLoan(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    const amount = calculation.amount;
    const months = calculation.months;
    const rate = Number(form.interest_rate || 0);
    if (!form.staff_id || amount <= 0 || months <= 0 || rate < 0) {
      setMessage('Please select staff and enter a valid loan amount, decimal interest rate and repayment months.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      const startMonth = `${form.repayment_start_month}-01`;
      const { data: newLoan, error } = await supabase.from('staff_loans').insert({
        staff_id: form.staff_id,
        created_by: profile.id,
        amount,
        interest_rate: rate,
        repayment_months: months,
        interest_amount: Number(calculation.interest.toFixed(2)),
        total_repayable: Number(calculation.total.toFixed(2)),
        balance: Number(calculation.total.toFixed(2)),
        monthly_repayment: Number(calculation.monthly.toFixed(2)),
        repayment_start_month: startMonth,
        issue_date: form.issue_date,
        status: 'active',
        notes: form.notes.trim() || null,
      }).select('id').single();
      if (error) throw error;

      const monthlyRounded = Number(calculation.monthly.toFixed(2));
      const schedule = Array.from({ length: months }, (_, index) => ({
        loan_id: newLoan.id,
        staff_id: form.staff_id,
        repayment_month: addMonths(startMonth, index),
        scheduled_amount: index === months - 1
          ? Number((calculation.total - monthlyRounded * (months - 1)).toFixed(2))
          : monthlyRounded,
        amount_paid: 0,
        paid: false,
        recorded_by: profile.id,
      }));
      const { error: scheduleError } = await supabase.from('staff_loan_repayments').insert(schedule);
      if (scheduleError) throw scheduleError;

      setMessage('Staff loan and repayment schedule saved successfully.');
      setForm({ staff_id: form.staff_id, amount: '', interest_rate: '', repayment_months: '', issue_date: today(), repayment_start_month: currentMonth().slice(0, 7), notes: '' });
      await load();
      setSelectedLoanId(newLoan.id);
    } catch (error: any) {
      setMessage(error.message || 'Could not save staff loan.');
    } finally { setBusy(false); }
  }

  async function markPayment(row: any, paid: boolean) {
    if (!isAdmin || !profile) return;
    setBusy(true); setMessage('');
    try {
      const amountPaid = paid ? Number(row.scheduled_amount || 0) : 0;
      const { error } = await supabase.from('staff_loan_repayments').update({
        paid,
        amount_paid: amountPaid,
        paid_at: paid ? new Date().toISOString() : null,
        recorded_by: profile.id,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      if (error) throw error;

      const loanRows = repayments.filter((item) => item.loan_id === row.loan_id).map((item) => item.id === row.id ? { ...item, paid, amount_paid: amountPaid } : item);
      const paidTotal = loanRows.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0);
      const loan = loans.find((item) => item.id === row.loan_id);
      const totalRepayable = Number(loan?.total_repayable ?? loan?.amount ?? 0);
      const balance = Math.max(0, Number((totalRepayable - paidTotal).toFixed(2)));
      const completed = balance <= 0.009;
      const { error: loanError } = await supabase.from('staff_loans').update({
        balance,
        status: completed ? 'cleared' : 'active',
        updated_at: new Date().toISOString(),
      }).eq('id', row.loan_id);
      if (loanError) throw loanError;

      setMessage(paid ? 'Repayment marked as paid. Loan balance updated.' : 'Repayment marked as unpaid. Loan balance recalculated.');
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Could not update repayment.');
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
    downloadCsv('staff-loans.csv', loans.map((row) => {
      const schedule = repayments.filter((item) => item.loan_id === row.id);
      const paymentsDone = schedule.filter((item) => item.paid).length;
      return {
        staff: row.staff?.full_name || row.staff?.email,
        position: row.staff?.position,
        issue_date: row.issue_date,
        amount_requested: row.amount,
        interest_rate_decimal: row.interest_rate,
        interest_rate_percent_equivalent: Number(row.interest_rate || 0) * 100,
        repayment_months: row.repayment_months,
        interest_amount: row.interest_amount,
        total_repayable: row.total_repayable,
        monthly_repayment: row.monthly_repayment,
        payments_done: paymentsDone,
        payments_left: Math.max(0, Number(row.repayment_months || schedule.length) - paymentsDone),
        balance: row.balance,
        status: row.status,
        notes: row.notes,
      };
    }));
  }

  const totalActive = loans.filter((row) => row.status === 'active').reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const totalOriginal = loans.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const selectedLoan = loans.find((row) => row.id === selectedLoanId);
  const selectedSchedule = repayments.filter((row) => row.loan_id === selectedLoanId);
  const paymentsDone = selectedSchedule.filter((row) => row.paid).length;
  const paymentsLeft = Math.max(0, Number(selectedLoan?.repayment_months || selectedSchedule.length) - paymentsDone);
  const paidAmount = selectedSchedule.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);

  return <section>
    <div className="page-header"><div><h1>Staff Loans</h1><p>Calculate interest, generate repayment months, track payments and keep each staff member's balance up to date.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid three">
      <div className="metric-card"><span>{isAdmin ? 'Active Loan Balance' : 'My Active Balance'}</span><strong>{money(totalActive)}</strong></div>
      <div className="metric-card"><span>Total Amount Requested</span><strong>{money(totalOriginal)}</strong></div>
      <div className="metric-card"><span>Loan Records</span><strong>{loans.length}</strong></div>
    </div>

    {isAdmin && <form className="panel form-grid" onSubmit={addLoan}>
      <h2>Add Office Loan</h2>
      <p className="hint">Interest = (Amount Requested × Interest Rate) × Number of Months. Enter the interest rate as a decimal. Example: 2.5% should be entered as 0.025, so 4000 × 0.025 × 10 = 1000.</p>
      <div className="grid two">
        <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label>
        <label>Issue Date<input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} required /></label>
        <label>Amount Requested<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
        <label>Interest Rate Decimal<input type="number" min="0" step="0.0001" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} placeholder="Example: 0.025 for 2.5%" required /></label>
        <label>Number of Months for Repayment<input type="number" min="1" step="1" value={form.repayment_months} onChange={(e) => setForm({ ...form, repayment_months: e.target.value })} required /></label>
        <label>First Repayment Month & Year<input type="month" value={form.repayment_start_month} onChange={(e) => setForm({ ...form, repayment_start_month: e.target.value })} required /></label>
      </div>
      <div className="grid four">
        <div className="metric-card"><span>Interest Rate Used</span><strong>{calculation.rate ? `${calculation.rate} = ${(calculation.rate * 100).toFixed(2)}%` : '0'}</strong></div>
        <div className="metric-card"><span>Interest</span><strong>{money(calculation.interest)}</strong></div>
        <div className="metric-card"><span>Total Repayable</span><strong>{money(calculation.total)}</strong></div>
        <div className="metric-card"><span>Monthly Payment</span><strong>{money(calculation.monthly)}</strong></div>
      </div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reason for loan or repayment agreement." /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Loan & Repayment Schedule'}</button>
    </form>}

    {loans.length > 0 && <div className="panel">
      <h2>Repayment Schedule & Balance</h2>
      <label>Select Loan<select value={selectedLoanId} onChange={(e) => setSelectedLoanId(e.target.value)}>{loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.staff?.full_name || loan.staff?.email || 'Staff'} — {money(loan.amount)} — {loan.issue_date}</option>)}</select></label>
      {selectedLoan && <>
        <div className="grid four">
          <div className="metric-card"><span>Payments Done</span><strong>{paymentsDone}</strong></div>
          <div className="metric-card"><span>Payments Left</span><strong>{paymentsLeft}</strong></div>
          <div className="metric-card"><span>Amount Paid</span><strong>{money(paidAmount)}</strong></div>
          <div className="metric-card"><span>Balance Left</span><strong>{money(selectedLoan.balance)}</strong></div>
        </div>
        <div className="table-card"><table><thead><tr><th>Month / Year</th><th>Scheduled Payment</th><th>Amount Paid</th><th>Status</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{selectedSchedule.map((row) => <tr key={row.id}><td>{monthLabel(row.repayment_month)}</td><td>{money(row.scheduled_amount)}</td><td>{money(row.amount_paid)}</td><td><span className={`pill ${row.paid ? 'status-cleared' : 'status-active'}`}>{row.paid ? 'Paid' : 'Pending'}</span></td>{isAdmin && <td><button className={row.paid ? 'danger small-button' : 'primary small-button'} disabled={busy} onClick={() => markPayment(row, !row.paid)}>{row.paid ? 'Mark Unpaid' : 'Mark Paid'}</button></td>}</tr>)}</tbody></table></div>
        {selectedSchedule.length === 0 && <div className="empty">No repayment schedule is available for this older loan record.</div>}
      </>}
    </div>}

    <div className="panel">
      <h2>{isAdmin ? 'All Staff Loans' : 'My Office Loans'}</h2>
      <div className="table-card"><table><thead><tr><th>Date</th><th>Staff</th><th>Amount Requested</th><th>Rate</th><th>Interest</th><th>Total Repayable</th><th>Months</th><th>Monthly Payment</th><th>Paid</th><th>Left</th><th>Balance</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead><tbody>{loans.map((row) => {
        const schedule = repayments.filter((item) => item.loan_id === row.id);
        const done = schedule.filter((item) => item.paid).length;
        const left = Math.max(0, Number(row.repayment_months || schedule.length) - done);
        return <tr key={row.id}><td>{row.issue_date}</td><td>{row.staff?.full_name || row.staff?.email || '-'}</td><td>{money(row.amount)}</td><td>{displayRate(row.interest_rate)}</td><td>{money(row.interest_amount)}</td><td>{money(row.total_repayable ?? row.amount)}</td><td>{row.repayment_months || '-'}</td><td>{row.monthly_repayment ? money(row.monthly_repayment) : '-'}</td><td>{done}</td><td>{left}</td><td>{money(row.balance)}</td><td><span className={`pill status-${row.status}`}>{row.status}</span></td>{isAdmin && <td><div className="button-row"><button className="primary small-button" disabled={busy || row.status === 'active'} onClick={() => updateLoan(row, 'active')}>Active</button><button className="primary small-button" disabled={busy || row.status === 'cleared'} onClick={() => updateLoan(row, 'cleared')}>Clear</button><button className="danger small-button" disabled={busy || row.status === 'cancelled'} onClick={() => updateLoan(row, 'cancelled')}>Cancel</button></div></td>}</tr>;
      })}</tbody></table></div>
      {loans.length === 0 && <div className="empty">No loan records found.</div>}
    </div>
  </section>;
}
