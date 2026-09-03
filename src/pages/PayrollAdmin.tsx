import { FormEvent, useEffect, useMemo, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const SSNIT_EMPLOYEE_RATE = 0.055;
const months = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];
const payeBands = [
  { amount: 588, rate: 0 },
  { amount: 80, rate: 0.05 },
  { amount: 100, rate: 0.10 },
  { amount: 2900, rate: 0.175 },
  { amount: 16000, rate: 0.25 },
  { amount: 30332, rate: 0.30 },
];

type PayrollDraft = {
  staff_id: string;
  staff_name: string;
  staff_no: string;
  email: string;
  ssnit_number: string;
  month: string;
  basic_salary: string;
  allowances: string;
  deductions: string;
  paid_on: string;
  previous_found: boolean;
};

type PayrollSummaryRow = PayrollDraft & {
  ssnit: number;
  paye: number;
  loan: number;
  credit: number;
  attendance: number;
  totalDeductions: number;
  gross: number;
  net: number;
};

function currentYear() { return String(new Date().getFullYear()); }
function currentMonth() { return String(new Date().getMonth() + 1).padStart(2, '0'); }
function monthStart(year: string, month: string) { return `${year}-${month}-01`; }
function monthKey(value?: string | null) { return value ? value.slice(0, 7) : ''; }
function previousMonthStart(year: string, month: string) {
  const y = Number(year);
  const m = Number(month);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return date.toISOString().slice(0, 10);
}
function money(value: number | string | null | undefined) {
  return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function calculatePayeMonthly(basicSalary: number) {
  let remaining = Math.max(0, Number(basicSalary || 0));
  let tax = 0;
  payeBands.forEach((band) => {
    if (remaining <= 0) return;
    const taxable = Math.min(remaining, band.amount);
    tax += taxable * band.rate;
    remaining -= taxable;
  });
  if (remaining > 0) tax += remaining * 0.35;
  return Number(tax.toFixed(2));
}
function staffLabel(row: Profile) { return row.full_name || row.email || row.id; }

export function PayrollAdmin() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loanRepayments, setLoanRepayments] = useState<any[]>([]);
  const [creditUnionRows, setCreditUnionRows] = useState<any[]>([]);
  const [attendanceDeductions, setAttendanceDeductions] = useState<any[]>([]);
  const [year, setYear] = useState(currentYear());
  const [month, setMonth] = useState(currentMonth());
  const [paidOn, setPaidOn] = useState('');
  const [drafts, setDrafts] = useState<PayrollDraft[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  const selectedMonthStart = monthStart(year, month);
  const selectedMonthKey = selectedMonthStart.slice(0, 7);
  const previousMonth = previousMonthStart(year, month);
  const selectedMonthName = months.find((item) => item.value === month)?.label || month;

  async function loadData() {
    const [{ data: staffData, error: staffError }, { data: payrollData }, { data: loanData }, { data: creditData }, { data: attendanceData }] = await Promise.all([
      supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
      supabase.from('payrolls').select('*').order('month', { ascending: false }),
      supabase.from('staff_loan_repayments').select('*').order('repayment_month', { ascending: false }),
      supabase.from('credit_union_contributions').select('*').order('contribution_month', { ascending: false }),
      supabase.from('attendance_deductions').select('*').eq('status', 'approved').order('work_date', { ascending: false }),
    ]);
    if (staffError) { setType('error'); setMessage(staffError.message); return; }
    setStaff(((staffData || []) as Profile[]).filter((person) => person.role !== 'admin'));
    setPayrolls(payrollData || []);
    setLoanRepayments(loanData || []);
    setCreditUnionRows(creditData || []);
    setAttendanceDeductions(attendanceData || []);
  }

  useEffect(() => { loadData(); }, []);

  const existingCurrentRows = useMemo(() => payrolls.filter((row) => monthKey(row.month) === selectedMonthKey), [payrolls, selectedMonthKey]);

  function buildDraftsFromPrevious() {
    const nextDrafts = staff.map((person) => {
      const previous = payrolls.find((row) => row.staff_id === person.id && monthKey(row.month) === previousMonth.slice(0, 7));
      const current = payrolls.find((row) => row.staff_id === person.id && monthKey(row.month) === selectedMonthKey);
      const source = current || previous;
      return {
        staff_id: person.id,
        staff_name: staffLabel(person),
        staff_no: person.staff_no || '',
        email: person.email || '',
        ssnit_number: person.ssnit_number || '',
        month: selectedMonthStart,
        basic_salary: String(Number(source?.basic_salary || 0)),
        allowances: String(Number(source?.allowances || 0)),
        deductions: String(Number(source?.deductions || 0)),
        paid_on: paidOn,
        previous_found: Boolean(previous),
      };
    });
    setDrafts(nextDrafts);
    setSelectedRows(Object.fromEntries(nextDrafts.map((row) => [row.staff_id, true])));
    setType('success');
    setMessage(`Generated ${nextDrafts.length} editable payslip drafts using ${previousMonth.slice(0, 7)} salary data where available.`);
  }

  function updateDraft(staffId: string, patch: Partial<PayrollDraft>) {
    setDrafts((rows) => rows.map((row) => row.staff_id === staffId ? { ...row, ...patch } : row));
  }

  function summarize(row: PayrollDraft): PayrollSummaryRow {
    const basic = Number(row.basic_salary || 0);
    const allowances = Number(row.allowances || 0);
    const adminDeduction = Number(row.deductions || 0);
    const ssnit = row.ssnit_number.trim() ? Number((basic * SSNIT_EMPLOYEE_RATE).toFixed(2)) : 0;
    const paye = calculatePayeMonthly(basic);
    const loan = loanRepayments.filter((item) => item.staff_id === row.staff_id && monthKey(item.repayment_month) === selectedMonthKey).reduce((sum, item) => sum + Number(item.scheduled_amount || 0), 0);
    const credit = creditUnionRows.filter((item) => item.staff_id === row.staff_id && monthKey(item.contribution_month) === selectedMonthKey).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const attendance = attendanceDeductions.filter((item) => item.staff_id === row.staff_id && monthKey(item.work_date) === selectedMonthKey).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const gross = basic + allowances;
    const totalDeductions = adminDeduction + ssnit + paye + loan + credit + attendance;
    const net = gross - totalDeductions;
    return { ...row, ssnit, paye, loan, credit, attendance, totalDeductions, gross, net };
  }

  const sourceRows = drafts.length > 0 ? drafts : existingCurrentRows.map((row) => {
    const person = staff.find((item) => item.id === row.staff_id);
    return {
      staff_id: row.staff_id,
      staff_name: staffLabel(person || ({ id: row.staff_id } as Profile)),
      staff_no: person?.staff_no || '',
      email: person?.email || '',
      ssnit_number: person?.ssnit_number || '',
      month: row.month,
      basic_salary: String(Number(row.basic_salary || 0)),
      allowances: String(Number(row.allowances || 0)),
      deductions: String(Number(row.deductions || 0)),
      paid_on: row.paid_on || '',
      previous_found: true,
    };
  });

  const summaryRows = useMemo(() => sourceRows.map(summarize), [sourceRows, selectedMonthKey, loanRepayments, creditUnionRows, attendanceDeductions]);
  const selectedSummaryRows = summaryRows.filter((row) => drafts.length === 0 || selectedRows[row.staff_id]);
  const totals = selectedSummaryRows.reduce((sum, row) => ({
    gross: sum.gross + row.gross,
    basic: sum.basic + Number(row.basic_salary || 0),
    allowances: sum.allowances + Number(row.allowances || 0),
    deductions: sum.deductions + row.totalDeductions,
    net: sum.net + row.net,
  }), { gross: 0, basic: 0, allowances: 0, deductions: 0, net: 0 });

  async function approveAll(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const rows = drafts.filter((row) => selectedRows[row.staff_id]);
    if (!rows.length) { setType('error'); setMessage('Select at least one staff member before approving payslips.'); return; }
    setBusy(true);
    try {
      for (const row of rows) {
        await supabase.from('payrolls').delete().eq('staff_id', row.staff_id).eq('month', selectedMonthStart);
      }
      const records = rows.map((row) => ({
        staff_id: row.staff_id,
        month: selectedMonthStart,
        basic_salary: Number(row.basic_salary || 0),
        allowances: Number(row.allowances || 0),
        deductions: Number(row.deductions || 0),
        paid_on: row.paid_on || paidOn || null,
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('payrolls').insert(records);
      if (error) throw error;
      await supabase.from('notifications').insert(rows.map((row) => ({ user_id: row.staff_id, title: 'Payslip approved', body: `Your ${selectedMonthName} ${year} payslip is now available under Letters & Payslips.` })));
      setType('success');
      setMessage(`${rows.length} payslips approved and published.`);
      setDrafts([]);
      await loadData();
    } catch (error: any) {
      setType('error');
      setMessage(error.message || 'Could not approve payslips.');
    } finally {
      setBusy(false);
    }
  }

  function downloadSummaryCsv() {
    const headers = ['Staff', 'Staff No', 'Basic', 'Allowances', 'Gross', 'SSNIT', 'PAYE', 'Other/Admin', 'Loan', 'Credit Union', 'Attendance', 'Total Deductions', 'Net Pay'];
    const body = summaryRows.map((row) => [row.staff_name, row.staff_no, row.basic_salary, row.allowances, row.gross, row.ssnit, row.paye, row.deductions, row.loan, row.credit, row.attendance, row.totalDeductions, row.net]);
    const csv = [headers, ...body].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-summary-${selectedMonthKey}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section>
    <div className="page-header"><div><h1>Payroll</h1><p>Generate monthly payslips from the previous month, edit where necessary, approve and review salary totals.</p></div><button type="button" className="primary" onClick={downloadSummaryCsv} disabled={summaryRows.length === 0}>Download Summary CSV</button></div>
    <StatusMessage message={message} type={type} />

    <div className="panel form-grid payroll-control-panel">
      <h2>Generate Payslips</h2>
      <div className="payroll-controls-grid">
        <label>Year<input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2026" /></label>
        <label>Month<select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Default Paid On<input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
      </div>
      <div className="button-row"><button type="button" className="primary" onClick={buildDraftsFromPrevious}>Generate All Payslips from Previous Month</button><button type="button" className="secondary" onClick={() => setDrafts([])}>Clear Drafts / View Approved Summary</button></div>
      <p className="hint">The system uses the previous month’s basic salary, allowances and admin deductions. You can edit any staff member before approval.</p>
    </div>

    <div className="grid four">
      <div className="metric-card"><span>Staff Count</span><strong>{selectedSummaryRows.length}</strong></div>
      <div className="metric-card"><span>Total Gross</span><strong>{money(totals.gross)}</strong></div>
      <div className="metric-card"><span>Total Deductions</span><strong>{money(totals.deductions)}</strong></div>
      <div className="metric-card"><span>Total Net Salary To Pay</span><strong>{money(totals.net)}</strong></div>
    </div>

    {drafts.length > 0 && <form className="panel form-grid payroll-draft-panel" onSubmit={approveAll}>
      <div className="section-title-row"><h2>Editable Payslip Drafts for {selectedMonthName} {year}</h2><button className="primary" disabled={busy}>{busy ? 'Approving...' : 'Approve Selected Payslips'}</button></div>
      <div className="table-card compact-table payroll-table-card"><table><thead><tr><th>Use</th><th>Staff</th><th>Basic</th><th>Allowances</th><th>Other/Admin</th><th>Paid On</th><th>Auto Deductions</th><th>Net Pay</th></tr></thead><tbody>{summaryRows.map((row) => <tr key={row.staff_id}><td><input type="checkbox" checked={Boolean(selectedRows[row.staff_id])} onChange={(e) => setSelectedRows((prev) => ({ ...prev, [row.staff_id]: e.target.checked }))} /></td><td><strong>{row.staff_name}</strong><br /><span className="muted">{row.staff_no || row.email || (row.previous_found ? 'Previous salary found' : 'No previous salary')}</span></td><td><input type="number" value={row.basic_salary} onChange={(e) => updateDraft(row.staff_id, { basic_salary: e.target.value })} /></td><td><input type="number" value={row.allowances} onChange={(e) => updateDraft(row.staff_id, { allowances: e.target.value })} /></td><td><input type="number" value={row.deductions} onChange={(e) => updateDraft(row.staff_id, { deductions: e.target.value })} /></td><td><input type="date" value={row.paid_on} onChange={(e) => updateDraft(row.staff_id, { paid_on: e.target.value })} /></td><td><span>SSNIT: {money(row.ssnit)}</span><br /><span>PAYE: {money(row.paye)}</span><br /><span>Loan: {money(row.loan)}</span><br /><span>Credit Union: {money(row.credit)}</span><br /><span>Attendance: {money(row.attendance)}</span></td><td><strong>{money(row.net)}</strong><br /><span className="muted">Deduct: {money(row.totalDeductions)}</span></td></tr>)}</tbody></table></div>
    </form>}

    <div className="panel staff-admin-panel">
      <div className="section-title-row"><h2>Salary Summary for {selectedMonthName} {year}</h2><span className="pill">{existingCurrentRows.length} approved records</span></div>
      <p className="hint">This summary shows what the company will pay for the selected month. When drafts are open, the summary uses the editable draft values.</p>
      {summaryRows.length === 0 ? <div className="empty">No approved payslips or generated drafts for this month yet.</div> : <div className="table-card compact-table payroll-table-card"><table><thead><tr><th>Staff</th><th>Basic</th><th>Allowances</th><th>Gross</th><th>SSNIT</th><th>PAYE</th><th>Loan</th><th>Credit Union</th><th>Attendance</th><th>Total Deductions</th><th>Net Pay</th></tr></thead><tbody>{summaryRows.map((row) => <tr key={row.staff_id}><td><strong>{row.staff_name}</strong><br /><span className="muted">{row.staff_no || row.email || '-'}</span></td><td>{money(row.basic_salary)}</td><td>{money(row.allowances)}</td><td>{money(row.gross)}</td><td>{money(row.ssnit)}</td><td>{money(row.paye)}</td><td>{money(row.loan)}</td><td>{money(row.credit)}</td><td>{money(row.attendance)}</td><td>{money(row.totalDeductions)}</td><td><strong>{money(row.net)}</strong></td></tr>)}</tbody></table></div>}
    </div>
  </section>;
}
