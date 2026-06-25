import { useEffect, useState } from 'react';
import { generateAppointmentLetter, generatePayslip } from '../lib/documents';
import { generateBindingAgreement } from '../lib/bindingAgreement';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { AppointmentLetterRequest, Payroll } from '../types';
import { StatusMessage } from '../components/StatusMessage';

export function Documents() {
  const { profile } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [appointmentRequests, setAppointmentRequests] = useState<AppointmentLetterRequest[]>([]);
  const [bindingRecord, setBindingRecord] = useState<any>(null);
  const [signatureName, setSignatureName] = useState('');
  const [selectedPayroll, setSelectedPayroll] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [requestBusy, setRequestBusy] = useState(false);
  async function load() {
    if (!profile) return;
    const [{ data: payrollData, error: payrollError }, { data: requestData, error: requestError }, { data: agreementData }] = await Promise.all([
      supabase.from('payrolls').select('*').eq('staff_id', profile.id).order('month', { ascending: false }),
      supabase.from('appointment_letter_requests').select('*').eq('staff_id', profile.id).order('requested_at', { ascending: false }),
      supabase.from('binding_agreements').select('*').eq('staff_id', profile.id).maybeSingle(),
    ]);
    if (payrollError || requestError) { setType('error'); setMessage(payrollError?.message || requestError?.message || 'Could not load documents.'); return; }
    setPayrolls((payrollData || []) as Payroll[]); setAppointmentRequests((requestData || []) as AppointmentLetterRequest[]); setBindingRecord(agreementData || null); if (payrollData?.[0]) setSelectedPayroll(payrollData[0].id);
  }
  useEffect(() => { load(); }, [profile?.id]);
  const payroll = payrolls.find((item) => item.id === selectedPayroll);
  const latestRequest = appointmentRequests[0];
  const approvedRequest = latestRequest?.status === 'approved' ? latestRequest : undefined;
  const pendingRequest = latestRequest?.status === 'pending' ? latestRequest : undefined;
  async function requestAppointmentLetter() { if (!profile) return; setRequestBusy(true); setMessage(''); try { const { error } = await supabase.from('appointment_letter_requests').insert({ staff_id: profile.id }); if (error) throw error; setType('success'); setMessage('Appointment letter request sent to admin for approval.'); await load(); } catch (error: any) { setType('error'); setMessage(error.message || 'Could not send appointment letter request.'); } finally { setRequestBusy(false); } }
  function downloadAppointmentLetter() { if (profile && approvedRequest) generateAppointmentLetter(profile, approvedRequest); }
  async function signBindingAgreement() { if (!profile) return; const name = signatureName.trim() || profile.full_name || ''; if (!name) { setType('error'); setMessage('Type your full name before signing.'); return; } const { error } = await supabase.from('binding_agreements').upsert({ staff_id: profile.id, signed_name: name, signed_at: new Date().toISOString() }, { onConflict: 'staff_id' }); if (error) { setType('error'); setMessage(error.message); } else { setType('success'); setMessage('Binding agreement signed. A PDF copy is downloading.'); generateBindingAgreement(profile, name); await load(); } }
  return <section><div className="page-header"><div><h1>Letters & Payslips</h1><p>Request appointment letter approval, sign binding agreement and download payslips.</p></div></div><StatusMessage message={message} type={type} /><div className="grid two"><div className="panel form-grid"><h2>Appointment Letter</h2><p className="muted">Admin must approve your appointment letter before you can download the PDF.</p>{approvedRequest ? <><div className="approval-card approved"><strong>Approved</strong><span>Position: {approvedRequest.position || profile?.position || '-'}</span><span>Monthly salary: {approvedRequest.monthly_salary ? `GHS ${Number(approvedRequest.monthly_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'As approved by management'}</span></div><button className="primary" onClick={downloadAppointmentLetter}>Download Appointment Letter PDF</button></> : pendingRequest ? <div className="approval-card pending"><strong>Pending admin approval</strong><span>Requested on {new Date(pendingRequest.requested_at).toLocaleDateString()}.</span></div> : <><button className="primary" disabled={requestBusy} onClick={requestAppointmentLetter}>{requestBusy ? 'Sending request...' : 'Request Admin Approval'}</button>{latestRequest?.status === 'rejected' && <div className="approval-card rejected"><strong>Previous request rejected</strong><span>{latestRequest.admin_notes || 'No reason was added by admin.'}</span></div>}</>}</div><div className="panel form-grid"><h2>Employee Binding Agreement</h2><p className="muted">Every new entrant should sign this agreement covering Mezzo House knowledge, methods, intellectual property and confidentiality.</p>{bindingRecord ? <div className="approval-card approved"><strong>Signed</strong><span>Signed as {bindingRecord.signed_name}</span><span>{new Date(bindingRecord.signed_at).toLocaleString()}</span><button className="primary" onClick={() => profile && generateBindingAgreement(profile, bindingRecord.signed_name)}>Download Signed Copy</button></div> : <><label>Type your full name as signature<input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder={profile?.full_name || 'Full name'} /></label><button className="primary" onClick={signBindingAgreement}>Sign and Download Agreement</button></>}</div><div className="panel"><h2>Monthly Payslip</h2>{payrolls.length === 0 ? <p className="muted">No payslip has been uploaded for your account yet.</p> : <><label>Month<select value={selectedPayroll} onChange={(e) => setSelectedPayroll(e.target.value)}>{payrolls.map((row) => <option key={row.id} value={row.id}>{new Date(row.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>)}</select></label><button className="primary" onClick={() => profile && payroll && generatePayslip(profile, payroll)}>Generate Payslip PDF</button></>}</div></div></section>;
}
