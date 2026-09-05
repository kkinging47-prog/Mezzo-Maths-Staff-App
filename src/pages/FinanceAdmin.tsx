import { FormEvent, useEffect, useMemo, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

type Tab = 'overview' | 'arrears' | 'billing' | 'payments' | 'expenses' | 'settings';
type School = { id: string; name: string; address?: string | null };
type Billing = { id: string; school_id: string; academic_year: string; term: string; student_count: number; fee_type: string; fee_per_student: number; flat_rate: number; previous_arrears?: number | null; books_bought: number; book_unit_price: number; notes?: string | null; schools?: School };
type Payment = { id: string; school_id: string; amount: number; payment_date: string; mode: string; reference?: string | null; paid_by?: string | null; received_by?: string | null; receipt_number: number; notes?: string | null; schools?: School };
type Expense = { id: string; expense_date: string; item: string; category: string; quantity: number; unit_price: number; paid_from: string; recorded_by?: string | null; notes?: string | null };
type Settings = { company_name: string; address: string; phone: string; email: string; currency: string; receipt_prefix: string; next_receipt_number: string; opening_bank_balance: string };

const defaultSettings: Settings = { company_name: 'Mezzo House Limited', address: 'Accra, Ghana', phone: '', email: 'mezzooffice@gmail.com', currency: 'GHS', receipt_prefix: 'MMA', next_receipt_number: '1', opening_bank_balance: '0' };
const emptyBilling = { school_id: '', academic_year: '2026/2027', term: 'Term 1', student_count: '', fee_type: 'per_student', fee_per_student: '', flat_rate: '', previous_arrears: '', books_bought: '', book_unit_price: '', notes: '' };
const emptyArrears = { school_id: '', previous_arrears: '', notes: 'Outstanding balance from 2025/2026 academic year' };
const emptyPayment = { school_id: '', amount: '', payment_date: new Date().toISOString().slice(0, 10), mode: 'MoMo', reference: '', paid_by: '', notes: '' };
const emptyExpense = { expense_date: new Date().toISOString().slice(0, 10), item: '', category: 'General', quantity: '1', unit_price: '', paid_from: 'Bank', notes: '' };

function money(value: number | string | null | undefined, currency = 'GHS') { return `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function toNumber(value: any) { const num = Number(value); return Number.isFinite(num) ? num : 0; }
function monthKey(value?: string | null) { return value ? value.slice(0, 7) : ''; }
function expectedAmount(row: Partial<Billing>) {
  const fee = row.fee_type === 'flat' ? toNumber(row.flat_rate) : toNumber(row.student_count) * toNumber(row.fee_per_student);
  const books = row.term === 'Term 1' ? toNumber(row.books_bought) * toNumber(row.book_unit_price) : 0;
  return fee + books + toNumber(row.previous_arrears);
}
function receiptNo(payment: Partial<Payment>, settings: Settings) { const year = new Date(payment.payment_date || Date.now()).getFullYear(); return `${settings.receipt_prefix || 'MMA'}-${year}-${String(payment.receipt_number || 1).padStart(4, '0')}`; }

function printHtml(title: string, html: string) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;color:#111827;margin:0;padding:28px;background:#f8fafc}.paper{max-width:780px;margin:0 auto;background:#fff;padding:34px;border:1px solid #e5e7eb;border-radius:16px}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #111827;padding-bottom:16px;margin-bottom:20px}.brand{font-size:26px;font-weight:900}.muted{color:#64748b;font-size:13px;line-height:1.5}.badge{display:inline-block;background:#ecfdf3;color:#027a48;padding:7px 11px;border-radius:999px;font-weight:800;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;border-bottom:1px solid #e5e7eb;padding:11px}th{background:#f8fafc;color:#334155;font-size:12px;text-transform:uppercase}.box{border:1px solid #e5e7eb;border-radius:12px;padding:14px;background:#f8fafc}.amount{font-size:24px;font-weight:900}.right{text-align:right}.actions{max-width:780px;margin:18px auto;text-align:center}.print{padding:12px 18px;border:0;background:#111827;color:white;border-radius:10px;font-weight:800}@media print{body{background:white;padding:0}.paper{border:0;border-radius:0}.actions{display:none}}</style></head><body>${html}<div class="actions"><button class="print" onclick="window.print()">Print / Save as PDF</button></div></body></html>`);
  win.document.close(); win.focus();
}

export function FinanceAdmin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [schools, setSchools] = useState<School[]>([]);
  const [billings, setBillings] = useState<Billing[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsForm, setSettingsForm] = useState<Settings>(defaultSettings);
  const [billingForm, setBillingForm] = useState(emptyBilling);
  const [arrearsForm, setArrearsForm] = useState(emptyArrears);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [billingSearch, setBillingSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  async function loadData() {
    const [schoolRes, billingRes, paymentRes, expenseRes, settingRes] = await Promise.all([
      supabase.from('schools').select('id,name,address').order('name'),
      supabase.from('finance_school_billing').select('*, schools(id,name,address)').order('created_at', { ascending: false }),
      supabase.from('finance_payments').select('*, schools(id,name,address)').order('payment_date', { ascending: false }),
      supabase.from('finance_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('finance_settings').select('key,value'),
    ]);
    const error = schoolRes.error || billingRes.error || paymentRes.error || expenseRes.error;
    if (error) { setType('error'); setMessage(error.message); return; }
    const loadedSchools = (schoolRes.data || []) as School[];
    setSchools(loadedSchools); setBillings((billingRes.data || []) as Billing[]); setPayments((paymentRes.data || []) as Payment[]); setExpenses((expenseRes.data || []) as Expense[]);
    const nextSettings = { ...defaultSettings } as any;
    (settingRes.data || []).forEach((row: any) => { if (row.key in nextSettings) nextSettings[row.key] = String(row.value ?? ''); });
    setSettings(nextSettings); setSettingsForm(nextSettings);
    if (loadedSchools[0]) {
      setBillingForm((prev) => ({ ...prev, school_id: prev.school_id || loadedSchools[0].id }));
      setArrearsForm((prev) => ({ ...prev, school_id: prev.school_id || loadedSchools[0].id }));
      setPaymentForm((prev) => ({ ...prev, school_id: prev.school_id || loadedSchools[0].id }));
    }
  }
  useEffect(() => { loadData(); }, []);

  const paymentsBySchool = useMemo(() => payments.reduce((acc: Record<string, number>, row) => { acc[row.school_id] = (acc[row.school_id] || 0) + toNumber(row.amount); return acc; }, {}), [payments]);
  const billingWithBalance = useMemo(() => billings.map((row) => { const expected = expectedAmount(row); const paid = paymentsBySchool[row.school_id] || 0; return { ...row, expected, paid, balance: expected - paid }; }), [billings, paymentsBySchool]);
  const overview = useMemo(() => { const expected = billings.reduce((sum, row) => sum + expectedAmount(row), 0); const paid = payments.reduce((sum, row) => sum + toNumber(row.amount), 0); const expense = expenses.reduce((sum, row) => sum + toNumber(row.quantity || 1) * toNumber(row.unit_price), 0); const bank = toNumber(settings.opening_bank_balance) + paid - expense; return { expected, paid, expense, bank, owing: Math.max(expected - paid, 0), arrears: billings.reduce((sum, row) => sum + toNumber(row.previous_arrears), 0) }; }, [billings, payments, expenses, settings.opening_bank_balance]);
  const filteredBilling = billingWithBalance.filter((row) => `${row.schools?.name || ''} ${row.academic_year} ${row.term}`.toLowerCase().includes(billingSearch.toLowerCase()));
  const filteredPayments = payments.filter((row) => `${row.schools?.name || ''} ${row.paid_by || ''} ${row.reference || ''}`.toLowerCase().includes(paymentSearch.toLowerCase()));
  const filteredExpenses = expenses.filter((row) => `${row.item} ${row.category} ${row.paid_from}`.toLowerCase().includes(expenseSearch.toLowerCase()));
  const monthPayments = payments.filter((row) => monthKey(row.payment_date) === selectedMonth).reduce((sum, row) => sum + toNumber(row.amount), 0);
  const monthExpenses = expenses.filter((row) => monthKey(row.expense_date) === selectedMonth).reduce((sum, row) => sum + toNumber(row.quantity || 1) * toNumber(row.unit_price), 0);

  async function saveBilling(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const { error } = await supabase.from('finance_school_billing').insert({ school_id: billingForm.school_id, academic_year: billingForm.academic_year, term: billingForm.term, student_count: toNumber(billingForm.student_count), fee_type: billingForm.fee_type, fee_per_student: toNumber(billingForm.fee_per_student), flat_rate: toNumber(billingForm.flat_rate), previous_arrears: toNumber(billingForm.previous_arrears), books_bought: billingForm.term === 'Term 1' ? toNumber(billingForm.books_bought) : 0, book_unit_price: billingForm.term === 'Term 1' ? toNumber(billingForm.book_unit_price) : 0, notes: billingForm.notes || null, created_by: profile?.id });
      if (error) throw error;
      setType('success'); setMessage('New term billing saved.'); setBillingForm({ ...emptyBilling, school_id: billingForm.school_id }); await loadData();
    } catch (error: any) { setType('error'); setMessage(error.message || 'Could not save billing.'); } finally { setBusy(false); }
  }

  async function saveArrears(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const { error } = await supabase.from('finance_school_billing').insert({ school_id: arrearsForm.school_id, academic_year: '2026/2027', term: 'Term 1', student_count: 0, fee_type: 'flat', fee_per_student: 0, flat_rate: 0, previous_arrears: toNumber(arrearsForm.previous_arrears), books_bought: 0, book_unit_price: 0, notes: arrearsForm.notes || 'Outstanding balance from 2025/2026 academic year', created_by: profile?.id });
      if (error) throw error;
      setType('success'); setMessage('Previous academic year arrears added to the 2026/2027 Term 1 account.'); setArrearsForm({ ...emptyArrears, school_id: arrearsForm.school_id }); await loadData();
    } catch (error: any) { setType('error'); setMessage(error.message || 'Could not save arrears.'); } finally { setBusy(false); }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const receiptNumber = toNumber(settings.next_receipt_number) || 1;
      const record = { school_id: paymentForm.school_id, amount: toNumber(paymentForm.amount), payment_date: paymentForm.payment_date, mode: paymentForm.mode, reference: paymentForm.reference || null, paid_by: paymentForm.paid_by || null, received_by: profile?.full_name || profile?.email || 'Admin', receipt_number: receiptNumber, notes: paymentForm.notes || null, created_by: profile?.id };
      const { data, error } = await supabase.from('finance_payments').insert(record).select('*, schools(id,name,address)').single();
      if (error) throw error;
      await saveSettingRows({ ...settings, next_receipt_number: String(receiptNumber + 1) }, false);
      setType('success'); setMessage('Payment saved. Receipt opened for printing.'); setPaymentForm({ ...emptyPayment, school_id: paymentForm.school_id }); await loadData(); printReceipt(data as Payment);
    } catch (error: any) { setType('error'); setMessage(error.message || 'Could not save payment.'); } finally { setBusy(false); }
  }

  async function saveExpense(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const { error } = await supabase.from('finance_expenses').insert({ expense_date: expenseForm.expense_date, item: expenseForm.item, category: expenseForm.category, quantity: toNumber(expenseForm.quantity || 1), unit_price: toNumber(expenseForm.unit_price), paid_from: expenseForm.paid_from, recorded_by: profile?.full_name || profile?.email || 'Admin', notes: expenseForm.notes || null, created_by: profile?.id });
      if (error) throw error;
      setType('success'); setMessage('Expense saved.'); setExpenseForm(emptyExpense); await loadData();
    } catch (error: any) { setType('error'); setMessage(error.message || 'Could not save expense.'); } finally { setBusy(false); }
  }

  async function saveSettingRows(next: Settings, showMessage = true) {
    const rows = Object.entries(next).map(([key, value]) => ({ key, value: String(value), updated_by: profile?.id, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('finance_settings').upsert(rows, { onConflict: 'key' });
    if (error) throw error; setSettings(next); setSettingsForm(next); if (showMessage) { setType('success'); setMessage('Finance settings saved.'); }
  }
  async function saveSettings(event: FormEvent) { event.preventDefault(); setBusy(true); try { await saveSettingRows(settingsForm); await loadData(); } catch (error: any) { setType('error'); setMessage(error.message || 'Could not save settings.'); } finally { setBusy(false); } }

  function printReceipt(payment: Payment) {
    const school = payment.schools || schools.find((item) => item.id === payment.school_id);
    const html = `<div class="paper"><div class="top"><div><div class="brand">${settings.company_name}</div><div class="muted">${settings.address}<br>${settings.phone} ${settings.email}</div></div><div class="right"><span class="badge">OFFICIAL RECEIPT</span><h2>${receiptNo(payment, settings)}</h2><div class="muted">Date: ${payment.payment_date}</div></div></div><div class="box"><div class="muted">Received from</div><h3>${payment.paid_by || school?.name || 'Client'}</h3><div class="muted">School / Client: ${school?.name || 'School'}<br>Mode: ${payment.mode}<br>Reference: ${payment.reference || '-'}</div></div><table><tbody><tr><th>Description</th><th class="right">Amount</th></tr><tr><td>School payment</td><td class="right amount">${money(payment.amount, settings.currency)}</td></tr></tbody></table><p class="muted">Received by: ${payment.received_by || 'Admin'}</p></div>`;
    printHtml('Receipt', html);
  }

  function exportSummaryCsv() {
    const rows = [['School','Academic Year','Term','Current Fee','Books','Previous Arrears','Expected','Paid','Balance'], ...billingWithBalance.map((row) => [row.schools?.name || '', row.academic_year, row.term, row.fee_type === 'flat' ? row.flat_rate : row.student_count * row.fee_per_student, row.term === 'Term 1' ? row.books_bought * row.book_unit_price : 0, row.previous_arrears || 0, row.expected, row.paid, row.balance])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `finance-summary-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return <section>
    <div className="page-header"><div><h1>Finance Admin</h1><p>Add 2025/2026 arrears, prepare 2026/2027 billing, record payments, receipts and expenses.</p></div><button className="primary" type="button" onClick={exportSummaryCsv}>Download Summary CSV</button></div>
    <StatusMessage message={message} type={type} />
    <div className="chips finance-tabs">{(['overview','arrears','billing','payments','expenses','settings'] as Tab[]).map((item) => <button key={item} type="button" className={`chip ${tab === item ? 'selected' : ''}`} onClick={() => setTab(item)}>{item === 'overview' ? 'Overview' : item === 'arrears' ? '2025/2026 Arrears' : item === 'billing' ? '2026/2027 Billing' : item === 'payments' ? 'Payments & Receipts' : item === 'expenses' ? 'Expenses' : 'Settings'}</button>)}</div>

    {tab === 'overview' && <><div className="grid four"><div className="metric-card"><span>Total Expected</span><strong>{money(overview.expected, settings.currency)}</strong></div><div className="metric-card"><span>Previous Arrears Included</span><strong>{money(overview.arrears, settings.currency)}</strong></div><div className="metric-card"><span>Total Paid</span><strong>{money(overview.paid, settings.currency)}</strong></div><div className="metric-card"><span>Schools Owing</span><strong>{money(overview.owing, settings.currency)}</strong></div><div className="metric-card"><span>Estimated Bank</span><strong>{money(overview.bank, settings.currency)}</strong></div></div><div className="grid two"><div className="panel"><h2>Monthly Cash Position</h2><label>Month<input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} /></label><div className="approval-card approved"><span>Payments received: {money(monthPayments, settings.currency)}</span><span>Expenses paid: {money(monthExpenses, settings.currency)}</span><span>Net movement: {money(monthPayments - monthExpenses, settings.currency)}</span></div></div><div className="panel"><h2>Schools Owing</h2><div className="table-card compact-table"><table><thead><tr><th>School</th><th>Expected</th><th>Paid</th><th>Owing</th></tr></thead><tbody>{billingWithBalance.filter((row) => row.balance > 0).map((row) => <tr key={row.id}><td>{row.schools?.name || 'School'}</td><td>{money(row.expected, settings.currency)}</td><td>{money(row.paid, settings.currency)}</td><td><strong>{money(row.balance, settings.currency)}</strong></td></tr>)}</tbody></table></div></div></div></>}

    {tab === 'arrears' && <div className="grid two"><form className="panel form-grid" onSubmit={saveArrears}><h2>Add 2025/2026 Arrears</h2><p className="hint">Use this for schools that still owe from the last academic year. It will be added to their 2026/2027 Term 1 account.</p><label>School<select required value={arrearsForm.school_id} onChange={(e) => setArrearsForm({ ...arrearsForm, school_id: e.target.value })}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><label>Arrears Amount<input required type="number" value={arrearsForm.previous_arrears} onChange={(e) => setArrearsForm({ ...arrearsForm, previous_arrears: e.target.value })} /></label><label>Notes<textarea value={arrearsForm.notes} onChange={(e) => setArrearsForm({ ...arrearsForm, notes: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Arrears'}</button></form><div className="panel"><h2>Arrears Records</h2><div className="table-card compact-table"><table><thead><tr><th>School</th><th>Year/Term</th><th>Arrears</th><th>Note</th></tr></thead><tbody>{billings.filter((row) => toNumber(row.previous_arrears) > 0).map((row) => <tr key={row.id}><td>{row.schools?.name || 'School'}</td><td>{row.academic_year}<br />{row.term}</td><td><strong>{money(row.previous_arrears, settings.currency)}</strong></td><td>{row.notes || '-'}</td></tr>)}</tbody></table></div></div></div>}

    {tab === 'billing' && <div className="grid two"><form className="panel form-grid" onSubmit={saveBilling}><h2>New Term Billing</h2><label>School<select required value={billingForm.school_id} onChange={(e) => setBillingForm({ ...billingForm, school_id: e.target.value })}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><div className="grid two"><label>Academic Year<input value={billingForm.academic_year} onChange={(e) => setBillingForm({ ...billingForm, academic_year: e.target.value })} /></label><label>Term<select value={billingForm.term} onChange={(e) => setBillingForm({ ...billingForm, term: e.target.value })}><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label></div><div className="grid two"><label>Number of Students<input type="number" value={billingForm.student_count} onChange={(e) => setBillingForm({ ...billingForm, student_count: e.target.value })} /></label><label>Fee Type<select value={billingForm.fee_type} onChange={(e) => setBillingForm({ ...billingForm, fee_type: e.target.value })}><option value="per_student">Per student</option><option value="flat">Flat rate</option></select></label></div>{billingForm.fee_type === 'per_student' ? <label>Amount Per Student<input type="number" value={billingForm.fee_per_student} onChange={(e) => setBillingForm({ ...billingForm, fee_per_student: e.target.value })} /></label> : <label>Flat Amount<input type="number" value={billingForm.flat_rate} onChange={(e) => setBillingForm({ ...billingForm, flat_rate: e.target.value })} /></label>}<label>Previous Arrears from 2025/2026<input type="number" value={billingForm.previous_arrears} onChange={(e) => setBillingForm({ ...billingForm, previous_arrears: e.target.value })} placeholder="Leave 0 if none" /></label>{billingForm.term === 'Term 1' && <div className="grid two"><label>Books Bought<input type="number" value={billingForm.books_bought} onChange={(e) => setBillingForm({ ...billingForm, books_bought: e.target.value })} /></label><label>Book Unit Price<input type="number" value={billingForm.book_unit_price} onChange={(e) => setBillingForm({ ...billingForm, book_unit_price: e.target.value })} /></label></div>}<label>Notes<textarea value={billingForm.notes} onChange={(e) => setBillingForm({ ...billingForm, notes: e.target.value })} /></label><div className="approval-card"><span>Expected amount: {money(expectedAmount({ ...billingForm, student_count: toNumber(billingForm.student_count), fee_per_student: toNumber(billingForm.fee_per_student), flat_rate: toNumber(billingForm.flat_rate), previous_arrears: toNumber(billingForm.previous_arrears), books_bought: toNumber(billingForm.books_bought), book_unit_price: toNumber(billingForm.book_unit_price) }), settings.currency)}</span></div><button className="primary" disabled={busy}>Save Billing</button></form><div className="panel"><h2>Billing Records</h2><label>Search<input value={billingSearch} onChange={(e) => setBillingSearch(e.target.value)} placeholder="Search school, year or term" /></label><div className="table-card compact-table"><table><thead><tr><th>School</th><th>Year/Term</th><th>Current Fee + Books</th><th>Arrears</th><th>Expected</th><th>Paid</th><th>Balance</th></tr></thead><tbody>{filteredBilling.map((row) => <tr key={row.id}><td>{row.schools?.name || 'School'}</td><td>{row.academic_year}<br />{row.term}</td><td>{money(row.expected - toNumber(row.previous_arrears), settings.currency)}</td><td>{money(row.previous_arrears, settings.currency)}</td><td>{money(row.expected, settings.currency)}</td><td>{money(row.paid, settings.currency)}</td><td><strong>{money(row.balance, settings.currency)}</strong></td></tr>)}</tbody></table></div></div></div>}

    {tab === 'payments' && <div className="grid two"><form className="panel form-grid" onSubmit={savePayment}><h2>Record Payment</h2><label>School<select required value={paymentForm.school_id} onChange={(e) => setPaymentForm({ ...paymentForm, school_id: e.target.value })}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><div className="grid two"><label>Amount Paid<input required type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></label><label>Date Paid<input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} /></label></div><label>Mode of Payment<select value={paymentForm.mode} onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })}><option>MoMo</option><option>Cash</option><option>Cheque</option><option>Bank Transfer</option></select></label><label>Reference / Transaction ID<input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} /></label><label>Paid By<input value={paymentForm.paid_by} onChange={(e) => setPaymentForm({ ...paymentForm, paid_by: e.target.value })} /></label><label>Notes<textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></label><button className="primary" disabled={busy}>Save & Generate Receipt</button></form><div className="panel"><h2>Payment History</h2><label>Search<input value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} placeholder="Search payments" /></label><div className="table-card compact-table"><table><thead><tr><th>Receipt</th><th>School</th><th>Amount</th><th>Date</th><th>Mode</th><th>Action</th></tr></thead><tbody>{filteredPayments.map((row) => <tr key={row.id}><td>{receiptNo(row, settings)}</td><td>{row.schools?.name || 'School'}</td><td>{money(row.amount, settings.currency)}</td><td>{row.payment_date}</td><td>{row.mode}<br />{row.reference}</td><td><button type="button" className="download-link" onClick={() => printReceipt(row)}>Receipt</button></td></tr>)}</tbody></table></div></div></div>}

    {tab === 'expenses' && <div className="grid two"><form className="panel form-grid" onSubmit={saveExpense}><h2>Record Expense</h2><label>Date<input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} /></label><label>Item / Description<input required value={expenseForm.item} onChange={(e) => setExpenseForm({ ...expenseForm, item: e.target.value })} /></label><div className="grid two"><label>Category<input value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} /></label><label>Paid From<select value={expenseForm.paid_from} onChange={(e) => setExpenseForm({ ...expenseForm, paid_from: e.target.value })}><option>Bank</option><option>Cash</option><option>MoMo</option><option>Other</option></select></label></div><div className="grid two"><label>Quantity<input type="number" value={expenseForm.quantity} onChange={(e) => setExpenseForm({ ...expenseForm, quantity: e.target.value })} /></label><label>Unit Price<input type="number" value={expenseForm.unit_price} onChange={(e) => setExpenseForm({ ...expenseForm, unit_price: e.target.value })} /></label></div><label>Notes<textarea value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} /></label><button className="primary" disabled={busy}>Save Expense</button></form><div className="panel"><h2>Expense History</h2><label>Search<input value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} placeholder="Search expenses" /></label><div className="table-card compact-table"><table><thead><tr><th>Date</th><th>Item</th><th>Category</th><th>Paid From</th><th>Total</th></tr></thead><tbody>{filteredExpenses.map((row) => <tr key={row.id}><td>{row.expense_date}</td><td>{row.item}</td><td>{row.category}</td><td>{row.paid_from}</td><td>{money(toNumber(row.quantity || 1) * toNumber(row.unit_price), settings.currency)}</td></tr>)}</tbody></table></div></div></div>}

    {tab === 'settings' && <form className="panel form-grid" onSubmit={saveSettings}><h2>Finance Settings</h2><div className="grid two"><label>Company Name<input value={settingsForm.company_name} onChange={(e) => setSettingsForm({ ...settingsForm, company_name: e.target.value })} /></label><label>Currency<input value={settingsForm.currency} onChange={(e) => setSettingsForm({ ...settingsForm, currency: e.target.value })} /></label></div><label>Address<input value={settingsForm.address} onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })} /></label><div className="grid two"><label>Phone<input value={settingsForm.phone} onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })} /></label><label>Email<input value={settingsForm.email} onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })} /></label></div><div className="grid two"><label>Receipt Prefix<input value={settingsForm.receipt_prefix} onChange={(e) => setSettingsForm({ ...settingsForm, receipt_prefix: e.target.value })} /></label><label>Next Receipt Number<input type="number" value={settingsForm.next_receipt_number} onChange={(e) => setSettingsForm({ ...settingsForm, next_receipt_number: e.target.value })} /></label></div><label>Opening Bank Balance<input type="number" value={settingsForm.opening_bank_balance} onChange={(e) => setSettingsForm({ ...settingsForm, opening_bank_balance: e.target.value })} /></label><button className="primary" disabled={busy}>Save Finance Settings</button></form>}
  </section>;
}
