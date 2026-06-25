import { useEffect, useMemo, useState } from 'react';
import { generateAppointmentLetter, generatePayslip } from '../lib/documents';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { AppointmentLetterRequest, Payroll } from '../types';
import { StatusMessage } from '../components/StatusMessage';

export function Documents() {
  const { profile } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [appointmentRequests, setAppointmentRequests] = useState<AppointmentLetterRequest[]>([]);
  const [selectedPayroll, setSelectedPayroll] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [requestBusy, setRequestBusy] = useState(false);

  async function load() {
    if (!profile) return;
    const [{ data: payrollData, error: payrollError }, { data: requestData, error: requestError }] = await Promise.all([
      supabase.from('payrolls').select('*').eq('staff_id', profile.id).order('month', { ascending: false }),
      supabase.from('appointment_letter_requests').select('*').eq('staff_id', profile.id).order('requested_at', { ascending: false }),
    ]);

    if (payrollError || requestError) {
      setType('error');
      setMessage(payrollError?.message || requestError?.message || 'Could not load documents.');
      return;
    }

    setPayrolls((payrollData || []) as Payroll[]);
    setAppointmentRequests((requestData || []) as AppointmentLetterRequest[]);
    if (payrollData?.[0]) setSelectedPayroll(payrollData[0].id);
  }

  useEffect(() => { load(); }, [profile?.id]);

  const payroll = payrolls.find((item) => item.id === selectedPayroll);
  const latestRequest = appointmentRequests[0];
  const approvedRequest = useMemo(() => appointmentRequests.find((item) => item.status === 'approved'), [appointmentRequests]);
  const pendingRequest = latestRequest?.status === 'pending' ? latestRequest : undefined;

  async function requestAppointmentLetter() {
    if (!profile) return;
    setRequestBusy(true);
    setMessage('');
    try {
      const { error } = await supabase.from('appointment_letter_requests').insert({ staff_id: profile.id });
      if (error) throw error;
      setType('success');
      setMessage('Appointment letter request sent to admin for approval. You can download it after approval.');
      await load();
    } catch (error: any) {
      setType('error');
      setMessage(error.message || 'Could not send appointment letter request.');
    } finally {
      setRequestBusy(false);
    }
  }

  function downloadAppointmentLetter() {
    if (!profile || !approvedRequest) return;
    try {
      generateAppointmentLetter(profile, approvedRequest);
    } catch (error: any) {
      setType('error');
      setMessage(error.message || 'Could not generate appointment letter.');
    }
  }

  return (
    <section>
      <div className="page-header"><div><h1>Letters & Payslips</h1><p>Request appointment letter approval and download monthly payslips.</p></div></div>
      <StatusMessage message={message} type={type} />
      <div className="grid two">
        <div className="panel form-grid">
          <h2>Appointment Letter</h2>
          <p className="muted">Your appointment letter uses the official Mezzo House Ltd. appointment template. Admin must approve it before you can download the PDF.</p>
          {approvedRequest ? (
            <>
              <div className="approval-card approved">
                <strong>Approved</strong>
                <span>Approved on {approvedRequest.decided_at ? new Date(approvedRequest.decided_at).toLocaleDateString() : 'recorded date'}.</span>
                <span>Position: {approvedRequest.position || profile?.position || '-'}</span>
                <span>Monthly salary: {approvedRequest.monthly_salary ? `GHS ${Number(approvedRequest.monthly_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'As approved by management'}</span>
              </div>
              <button className="primary" onClick={downloadAppointmentLetter}>Download Appointment Letter PDF</button>
            </>
          ) : pendingRequest ? (
            <div className="approval-card pending">
              <strong>Pending admin approval</strong>
              <span>Requested on {new Date(pendingRequest.requested_at).toLocaleDateString()}.</span>
              <span>You will see the download button here once admin approves it.</span>
            </div>
          ) : (
            <>
              {latestRequest?.status === 'rejected' && (
                <div className="approval-card rejected">
                  <strong>Previous request rejected</strong>
                  <span>{latestRequest.admin_notes || 'No reason was added by admin.'}</span>
                </div>
              )}
              <button className="primary" disabled={requestBusy} onClick={requestAppointmentLetter}>{requestBusy ? 'Sending request...' : 'Request Admin Approval'}</button>
            </>
          )}
        </div>
        <div className="panel">
          <h2>Monthly Payslip</h2>
          {payrolls.length === 0 ? <p className="muted">No payslip has been uploaded for your account yet.</p> : (
            <>
              <label>Month<select value={selectedPayroll} onChange={(e) => setSelectedPayroll(e.target.value)}>{payrolls.map((row) => <option key={row.id} value={row.id}>{new Date(row.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</option>)}</select></label>
              <button className="primary" onClick={() => profile && payroll && generatePayslip(profile, payroll)}>Generate Payslip PDF</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
