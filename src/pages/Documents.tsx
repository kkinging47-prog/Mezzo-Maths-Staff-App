import { useEffect, useState } from 'react';
import { generateEmploymentLetter, generatePayslip } from '../lib/documents';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Payroll } from '../types';
import { StatusMessage } from '../components/StatusMessage';

export function Documents() {
  const { profile } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [selectedPayroll, setSelectedPayroll] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      if (!profile) return;
      const { data, error } = await supabase.from('payrolls').select('*').eq('staff_id', profile.id).order('month', { ascending: false });
      if (error) setMessage(error.message);
      else {
        setPayrolls((data || []) as Payroll[]);
        if (data?.[0]) setSelectedPayroll(data[0].id);
      }
    }
    load();
  }, [profile?.id]);

  const payroll = payrolls.find((item) => item.id === selectedPayroll);

  return (
    <section>
      <div className="page-header"><div><h1>Letters & Payslips</h1><p>Generate employment letter and monthly payslips.</p></div></div>
      <StatusMessage message={message} type="error" />
      <div className="grid two">
        <div className="panel">
          <h2>Employment Letter</h2>
          <p className="muted">The letter uses your saved staff name, position and date employed.</p>
          <button className="primary" onClick={() => profile && generateEmploymentLetter(profile)}>Generate Employment Letter</button>
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
