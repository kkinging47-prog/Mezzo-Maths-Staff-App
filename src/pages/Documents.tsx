import { useEffect, useMemo, useState } from 'react';
import { generateAppointmentLetter, generatePayslip, PayslipDeductionLine } from '../lib/documents';
import { generateBindingAgreement } from '../lib/bindingAgreement';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { AppointmentLetterRequest, Payroll } from '../types';
import { StatusMessage } from '../components/StatusMessage';

const SSNIT_EMPLOYEE_RATE = 0.055;
const payeBands = [
  { amount: 588, rate: 0 },
  { amount: 80, rate: 0.05 },
  { amount: 100, rate: 0.10 },
  { amount: 2900, rate: 0.175 },
  { amount: 16000, rate: 0.25 },
  { amount: 30332, rate: 0.30 },
];

function monthKey(value?: string | null) {
  return value ? value.slice(0, 7) : '';
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

export function Documents() {
  const { profile } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [appointmentRequests, setAppointmentRequests] = useState<AppointmentLetterRequest[]>([]);
  const [uploadedLetters, setUploadedLetters] = useState<any[]>([]);
  const [bindingRecord, setBindingRecord] = useState<any>(null);
  const [loanRepayments, setLoanRepayments] = useState<any[]>([]);
  const [creditUnionRows, setCreditUnionRows] = useState<any[]>([]);
  const [attendanceDeductions, setAttendanceDeductions] = useState<any[]>([]);
  const [signatureName, setSignatureName] = useState('');
  const [selectedPayroll, setSelectedPayroll] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [requestBusy, setRequestBusy] = useState(false);

  async function load() {
    if (!profile) return;
    const [{ data: payrollData, error: payrollError }, { data: requestData, error: requestError }, { data: uploadData }, { data: agreementData }, { data: loanData }, { data: creditData }, { data: attendanceData }] = await Promise.all([
      supabase.from('payrolls').select('*').eq('staff_id', profile.id).order('month', { ascending: false }),
      supabase.from('appointment_letter_requests').select('*').eq('staff_id', profile.id).order('requested_at', { ascending: false }),
      supabase.from('appointment_letter_uploads').select('*').eq('staff_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('binding_agreements').select('*').eq('staff_id', profile.id).maybeSingle(),
      supabase.from('staff_loan_repayments').select('*, staff_loans(balance,total_repayable,amount)').eq('staff_id', profile.id).order('repayment_month', { ascending: false }),
      supabase.from('credit_union_contributions').select('*').eq('staff_id', profile.id).order('contribution_month', { ascending: false }),
      supabase.from('attendance_deductions').select('*').eq('staff_id', profile.id).eq('status', 'approved').order('work_date', { ascending: false }),
    ]);
    if (payrollError || requestError) { setType('error'); setMessage(payrollError?.message || requestError?.message || 'Could not load documents.'); return; }
    setPayrolls((payrollData || []) as Payroll[]);
    setAppointmentRequests((requestData || []) as AppointmentLetterRequest[]);
    setUploadedLetters(uploadData || []);
    setBindingRecord(agreementData || null);
    setLoanRepayments(loanData || []);
    setCreditUnionRows(creditData || []);
    setAttendanceDeductions(attendanceData || []);
    if (payrollData?.[0]) setSelectedPayroll((current) => current || payrollData[0].id);
  }

  useEffect(() => { load(); }, [profile?.id]);

  const payroll = payrolls.find((item) => item.id === selectedPayroll);
  const selectedMonth = monthKey(payroll?.month);
  const latestRequest = appointmentRequests[0];
  const approvedRequest = latestRequest?.status === 'approved' ? latestRequest : undefined;
  const pendingRequest = latestRequest?.status === 'pending' ? latestRequest : undefined;

  const payslipDeductionLines = useMemo<PayslipDeductionLine[]>(() => {
    if (!selectedMonth || !payroll) return [];
    const basicSalary = Number(payroll.basic_salary || 0);
    const ssnitNumber = String(profile?.ssnit_number || '').trim();
    const ssnitDeduction = ssnitNumber ? Number((basicSalary * SSNIT_EMPLOYEE_RATE).toFixed(2)) : 0;
    const paye = calculatePayeMonthly(basicSalary);
    const loanDue = loanRepayments.filter((row) => monthKey(row.repayment_month) === selectedMonth).reduce((sum, row) => sum + Number(row.scheduled_amount || 0), 0);
    const creditUnion = creditUnionRows.filter((row) => monthKey(row.contribution_month) === selectedMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const attendance = attendanceDeductions.filter((row) => monthKey(row.work_date) === selectedMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const lines: PayslipDeductionLine[] = [];
    if (ssnitDeduction > 0) lines.push({ label: `SSNIT Employee Deduction (${ssnitNumber})`, amount: ssnitDeduction, note: '5.5% calculated on basic salary because SSNIT number is on file.' });
    lines.push({ label: 'PAYE Tax', amount: paye, note: 'Calculated on basic salary only using the monthly PAYE schedule.' });
    if (loanDue > 0) lines.push({ label: 'Staff Loan Repayment', amount: loanDue, note: 'Scheduled loan repayment for this payslip month.' });
    if (creditUnion > 0) lines.push({ label: 'Credit Union Contribution', amount: creditUnion, note: 'Credit union shares/contribution for this payslip month.' });
    if (attendance > 0) lines.push({ label: 'Attendance Deductions', amount: attendance, note: 'Approved attendance deduction(s) for this month.' });
    return lines;
  }, [selectedMonth, payroll, profile?.ssnit_number, loanRepayments, creditUnionRows, attendanceDeductions]);

  const totalAutomaticDeductions = payslipDeductionLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const totalPayslipDeductions = Number(payroll?.deductions || 0) + totalAutomaticDeductions;
  const netPay = Number(payroll?.basic_salary || 0) + Number(payroll?.allowances || 0) - totalPayslipDeductions;

  async function requestAppointmentLetter() {
    if (!profile) return;
    setRequestBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('appointment_letter_requests').insert({ staff_id: profile.id });
      if (error) throw error;
      setType('success'); setMessage('Appointment letter request sent to admin for approval.'); await load();
    } catch (error: any) {
      setType('error'); setMessage(error.message || 'Could not send appointment letter request.');
    } finally { setRequestBusy(false); }
  }

  function downloadAppointmentLetter() { if (profile && approvedRequest) generateAppointmentLetter(profile, approvedRequest); }

  async function openUploadedLetter(filePath: string) {
    const { data, error } = await supabase.storage.from('appointment-letters').createSignedUrl(filePath, 3600);
    if (error) { setType('error'); setMessage(error.message); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function signBindingAgreement() {
    if (!profile) return;
    const name = signatureName.trim() || profile.full_name || '';
    if (!name) { setType('error'); setMessage('Type your full name before signing.'); return; }
    const { error } = await supabase.from('binding_agreements').upsert({ staff_id: profile.id, signed_name: name, signed_at: new Date().toISOString() }, { onConflict: 'staff_id' });
    if (error) { setType('error'); setMessage(error.message); }
    else { setType('success'); setMessage('Binding agreement signed. A PDF copy is downloading.'); generateBindingAgreement(profile, name); await load(); }
  }

  return <section>
    <div className="page-header"><div><h1>Letters & Payslips</h1><p>Request appointment letter approval, sign binding agreement and download payslips.</p></div></div>
    <StatusMessage message={message} type={type} />
    <div className="grid two">
      <div className="panel form-grid">
        <h2>Appointment Letter</h2>
        <p className="muted">Admin can upload your appointment letter here. You can also request approval to generate a PDF copy.</p>
        {uploadedLetters.length > 0 && <div className="approval-card approved"><strong>Uploaded by Admin</strong>{uploadedLetters.map((letter) => <span key={letter.id}><button className="download-link" onClick={() => openUploadedLetter(letter.file_path)}>{letter.file_name || 'Open appointment letter'}</button>{letter.letter_date ? ` · ${letter.letter_date}` : ''}</span>)}</div>}
        {approvedRequest ? <><div className="approval-card approved"><strong>Approved</strong><span>Position: {approvedRequest.position || profile?.position || '-'}</span><span>Monthly salary: {approvedRequest.monthly_salary ? `GHS ${Number(approvedRequest.monthly_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'As approved by management'}</span></div><button className="primary" onClick={downloadAppointmentLetter}>Download Generated Appointment Letter PDF</button></> : pendingRequest ? <div className="approval-card pending"><strong>Pending admin approval</strong><span>Requested on {new Date(pendingRequest.requested_at).toLocaleDateString()}.</span></div> : <><button className="primary" disabled={requestBusy} onClick={requestAppointmentLetter}>{requestBusy ? 'Sending request...' : 'Request Admin Approval'}</button>{latestRequest?.status === 'rejected' && <div className="approval-card rejected"><strong>Previous request rejected</strong><span>{latestRequest.admin_notes || 'No reason was added by admin.'}</span></div>}</>}
      </div>
      <div className="panel form-grid"><h2>Employee Binding Agreement</h2><p className="muted">Every new entrant should sign this agreement covering Mezzo House knowledge, methods, intellectual property and confidentiality.</p>{bindingRecord ? <div className="approval-card approved"><strong>Signed</strong><span>Signed as {bindingRecord.signed_name}</span><span>{new Date(bindingRecord.signed_at).toLocaleString()}</span><button className="primary" onClick={() => profile && generateBindingAgreement(profile, bindingRecord.signed_name)}>Download Signed Copy</button></div> : <><label>Type your full name as signature<input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder={profile?.full_name || 'Full name'} /></label><button className="primary" onClick={signBindingAgreement}>Sign and Download Agreement</button></>}</div>
      <div className="panel form-grid"><h2>Monthly Payslip</h2>{payrolls.length === 0 ? <p className="muted">No payslip has been uploaded for your account yet.</p> : <><label>Month<select value={selectedPayroll} onChange={(e) => setSelectedPayroll(e.target.value)}>{payrolls.map((row) => <option key={row.id} value={row.id}>{new Date(row.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>)}</select></label>{payroll && <div className="approval-card approved"><strong>Payslip Deduction Preview</strong><span>Basic salary: {money(payroll.basic_salary)}</span><span>Allowances: {money(payroll.allowances)}</span>{Number(payroll.deductions || 0) > 0 && <span>Other deductions: {money(payroll.deductions)}</span>}{payslipDeductionLines.map((line) => <span key={line.label}>{line.label}: {money(line.amount)}</span>)}<span>Total deductions: {money(totalPayslipDeductions)}</span><span>Net pay after deductions: {money(netPay)}</span><span className="muted">PAYE is calculated on basic salary only. SSNIT shows only when a SSNIT number is saved in My Details.</span></div>}<button className="primary" onClick={() => profile && payroll && generatePayslip(profile, payroll, payslipDeductionLines)}>Generate Payslip PDF</button></>}</div>
    </div>
  </section>;
}
