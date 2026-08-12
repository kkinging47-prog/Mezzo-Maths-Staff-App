import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy.toISOString().slice(0, 10);
}

function startOfMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

export function DeductionSummary({ profile }: { profile: Profile | null }) {
  const [dayAmount, setDayAmount] = useState(0);
  const [weekAmount, setWeekAmount] = useState(0);
  const [monthAmount, setMonthAmount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);

  async function load() {
    if (!profile) return;
    const [{ data: dayRows }, { data: weekRows }, { data: monthRows }, { data: pendingRows }] = await Promise.all([
      supabase.from('attendance_deductions').select('amount').eq('staff_id', profile.id).eq('status', 'approved').eq('work_date', today()),
      supabase.from('attendance_deductions').select('amount').eq('staff_id', profile.id).eq('status', 'approved').gte('work_date', startOfWeek()),
      supabase.from('attendance_deductions').select('amount').eq('staff_id', profile.id).eq('status', 'approved').gte('work_date', startOfMonth()),
      supabase.from('attendance_deductions').select('amount').eq('staff_id', profile.id).eq('status', 'pending'),
    ]);
    setDayAmount((dayRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0));
    setWeekAmount((weekRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0));
    setMonthAmount((monthRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0));
    setPendingAmount((pendingRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0));
  }

  useEffect(() => { load(); }, [profile?.id]);

  if (!profile) return null;
  return (
    <div className="panel deduction-summary">
      <div className="section-title-row"><h2>Attendance Deduction Summary</h2><Link to="/deductions" className="download-link">View details</Link></div>
      <p className="hint">Confirmed deductions are shown here. Pending items show what admin has not approved or rejected yet.</p>
      <div className="grid three">
        <div className="metric-card"><span>Today</span><strong>{money(dayAmount)}</strong></div>
        <div className="metric-card"><span>This Week</span><strong>{money(weekAmount)}</strong></div>
        <div className="metric-card"><span>This Month</span><strong>{money(monthAmount)}</strong></div>
      </div>
      <p className="muted">Pending review: <strong>{money(pendingAmount)}</strong></p>
    </div>
  );
}
