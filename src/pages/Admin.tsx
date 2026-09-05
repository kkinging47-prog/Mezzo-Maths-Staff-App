import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { AppointmentLetterRequest, Profile, School } from '../types';

type Tab = 'dashboard' | 'quick' | 'approvals' | 'tools';
type Assignment = { staff_id: string; school_id: string; schools?: Pick<School, 'id' | 'name' | 'address'> | null };
type Notice = { text: string; type: 'success' | 'error' | 'info' };
type Summary = {
  activeTeachers: number;
  inactiveStaff: number;
  totalSchools: number;
  schoolsWithGps: number;
  schoolsWithoutGps: number;
  totalAssignments: number;
  unassignedTeachers: number;
  pendingAppointments: number;
  pendingDeductions: number;
  approvedDeductionsMonth: number;
  approvedPayrollMonth: number;
  unpaidSchools: number;
  outstandingBalance: number;
};

const emptySummary: Summary = {
  activeTeachers: 0,
  inactiveStaff: 0,
  totalSchools: 0,
  schoolsWithGps: 0,
  schoolsWithoutGps: 0,
  totalAssignments: 0,
  unassignedTeachers: 0,
  pendingAppointments: 0,
  pendingDeductions: 0,
  approvedDeductionsMonth: 0,
  approvedPayrollMonth: 0,
  unpaidSchools: 0,
  outstandingBalance: 0,
};

function staffLabel(row: Profile) {
  return [row.full_name, row.staff_no, row.email, row.position].filter(Boolean).join(' · ') || row.id;
}
function monthKey(value?: string | null) { return value ? value.slice(0, 7) : ''; }
function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function prettyDate(value?: string | null) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '-'; }
function expectedAmount(row: any) {
  const fee = row.fee_type === 'flat' ? Number(row.flat_rate || 0) : Number(row.student_count || 0) * Number(row.fee_per_student || 0);
  const books = row.term === 'Term 1' ? Number(row.books_bought || 0) * Number(row.book_unit_price || 0) : 0;
  const arrears = Number(row.previous_arrears || 0);
  return fee + books + arrears;
}

function PopupNotice({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null;
  return <div className={`admin-toast ${notice.type}`} role="alert"><strong>{notice.type === 'error' ? 'Action failed' : notice.type === 'success' ? 'Done' : 'Notice'}</strong><span>{notice.text}</span><button type="button" onClick={onClose}>×</button></div>;
}

export function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [staff, setStaff] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [requests, setRequests] = useState<AppointmentLetterRequest[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [postForm, setPostForm] = useState({ title: '', body: '', priority: 'normal' });
  const [schoolForm, setSchoolForm] = useState({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' });
  const [meetingForm, setMeetingForm] = useState({ title: '', room_name: '', scheduled_at: '', description: '' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedStaff = useMemo(() => staff.find((row) => row.id === selectedStaffId), [staff, selectedStaffId]);
  const selectedSchool = useMemo(() => schools.find((row) => row.id === selectedSchoolId), [schools, selectedSchoolId]);
  const selectedAssignments = useMemo(() => assignments.filter((row) => row.staff_id === selectedStaffId), [assignments, selectedStaffId]);
  const alreadyAssigned = useMemo(() => assignments.some((row) => row.staff_id === selectedStaffId && row.school_id === selectedSchoolId), [assignments, selectedStaffId, selectedSchoolId]);
  const unassignedTeachers = useMemo(() => staff.filter((row) => !assignments.some((item) => item.staff_id === row.id)), [staff, assignments]);

  function show(type: Notice['type'], text: string) {
    setNotice({ type, text });
    window.setTimeout(() => setNotice((current) => current?.text === text ? null : current), 5000);
  }

  async function loadCore() {
    setLoading(true);
    const nowMonth = new Date().toISOString().slice(0, 7);
    const [profileRes, schoolRes, assignmentRes, requestRes, deductionRes, payrollRes, billingRes, paymentRes] = await Promise.all([
      supabase.from('profiles').select('id,role,staff_no,full_name,email,position,department,status').neq('role', 'admin').order('full_name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('staff_school_assignments').select('staff_id,school_id,schools(id,name,address)'),
      supabase.from('appointment_letter_requests').select('id,staff_id,status,requested_at').order('requested_at', { ascending: false }).limit(50),
      supabase.from('attendance_deductions').select('status,amount,work_date'),
      supabase.from('payrolls').select('status,month,staff_id'),
      supabase.from('finance_school_billing').select('*'),
      supabase.from('finance_payments').select('school_id,amount'),
    ]);
    setLoading(false);
    const error = profileRes.error || schoolRes.error || assignmentRes.error;
    if (error) { show('error', error.message); return; }

    const activeStaff = ((profileRes.data || []) as Profile[]).filter((row) => row.status !== 'left');
    const inactive = ((profileRes.data || []) as Profile[]).filter((row) => row.status === 'left').length;
    const schoolRows = (schoolRes.data || []) as School[];
    const assignmentRows = ((assignmentRes.data || []) as any[]).map((row) => ({ ...row, schools: Array.isArray(row.schools) ? row.schools[0] : row.schools })) as Assignment[];
    const appointmentRows = (requestRes.data || []) as AppointmentLetterRequest[];
    setStaff(activeStaff);
    setSchools(schoolRows);
    setAssignments(assignmentRows);
    setRequests(appointmentRows);
    setSelectedStaffId((current) => current || activeStaff[0]?.id || '');
    setSelectedSchoolId((current) => current || schoolRows[0]?.id || '');

    const deductions = deductionRes.data || [];
    const payrolls = payrollRes.data || [];
    const billings = billingRes.data || [];
    const payments = paymentRes.data || [];
    const paidBySchool = payments.reduce((acc: Record<string, number>, row: any) => { acc[row.school_id] = (acc[row.school_id] || 0) + Number(row.amount || 0); return acc; }, {});
    const billingBySchool = billings.reduce((acc: Record<string, number>, row: any) => { acc[row.school_id] = (acc[row.school_id] || 0) + expectedAmount(row); return acc; }, {});
    const balances = Object.entries(billingBySchool).map(([schoolId, expected]) => Math.max(Number(expected) - (paidBySchool[schoolId] || 0), 0));

    setSummary({
      activeTeachers: activeStaff.length,
      inactiveStaff: inactive,
      totalSchools: schoolRows.length,
      schoolsWithGps: schoolRows.filter((row) => row.latitude !== null && row.latitude !== undefined && row.longitude !== null && row.longitude !== undefined).length,
      schoolsWithoutGps: schoolRows.filter((row) => row.latitude === null || row.latitude === undefined || row.longitude === null || row.longitude === undefined).length,
      totalAssignments: assignmentRows.length,
      unassignedTeachers: activeStaff.filter((row) => !assignmentRows.some((item) => item.staff_id === row.id)).length,
      pendingAppointments: appointmentRows.filter((row) => row.status === 'pending').length,
      pendingDeductions: deductions.filter((row: any) => row.status === 'pending').length,
      approvedDeductionsMonth: deductions.filter((row: any) => row.status === 'approved' && monthKey(row.work_date) === nowMonth).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
      approvedPayrollMonth: new Set(payrolls.filter((row: any) => row.status === 'approved' && monthKey(row.month) === nowMonth).map((row: any) => row.staff_id)).size,
      unpaidSchools: balances.filter((value) => value > 0).length,
      outstandingBalance: balances.reduce((sum, value) => sum + value, 0),
    });
  }

  useEffect(() => { loadCore(); }, []);

  async function notifyStaff(staffId: string, title: string, body: string) { await supabase.from('notifications').insert({ user_id: staffId, title, body }); }

  async function assignSchool(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!selectedStaffId || !selectedSchoolId) { show('error', 'Select both teacher and school.'); return; }
    if (alreadyAssigned) { show('info', `${selectedStaff?.full_name || 'This teacher'} is already assigned to ${selectedSchool?.name || 'this school'}.`); return; }
    setBusy(true);
    const { error } = await supabase.from('staff_school_assignments').insert({ staff_id: selectedStaffId, school_id: selectedSchoolId, assigned_by: profile.id });
    setBusy(false);
    if (error) show('error', error.message);
    else { show('success', `${selectedStaff?.full_name || 'Teacher'} assigned to ${selectedSchool?.name || 'school'} successfully.`); await loadCore(); }
  }

  async function unassignSchool(schoolId: string, schoolName?: string | null) {
    if (!selectedStaffId) return;
    const confirmed = window.confirm(`Remove ${selectedStaff?.full_name || 'this teacher'} from ${schoolName || 'this school'}?`);
    if (!confirmed) return;
    setBusy(true);
    const { error } = await supabase.from('staff_school_assignments').delete().eq('staff_id', selectedStaffId).eq('school_id', schoolId);
    setBusy(false);
    if (error) show('error', error.message);
    else { show('success', `${selectedStaff?.full_name || 'Teacher'} has been unassigned from ${schoolName || 'the school'}.`); await loadCore(); }
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from('company_posts').insert({ ...postForm, post_type: 'update', author_id: profile.id });
    setBusy(false);
    if (error) show('error', error.message);
    else { show('success', 'Company update posted successfully.'); setPostForm({ title: '', body: '', priority: 'normal' }); }
  }

  async function createSchool(event: FormEvent) {
    event.preventDefault();
    const latitude = schoolForm.latitude.trim() ? Number(schoolForm.latitude) : null;
    const longitude = schoolForm.longitude.trim() ? Number(schoolForm.longitude) : null;
    setBusy(true);
    const { error } = await supabase.from('schools').insert({ name: schoolForm.name.trim(), address: schoolForm.address.trim() || null, latitude, longitude, radius_m: Number(schoolForm.radius_m || 100) });
    setBusy(false);
    if (error) show('error', error.message);
    else { show('success', 'School saved successfully.'); setSchoolForm({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' }); await loadCore(); }
  }

  async function createMeeting(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const cleanRoom = (meetingForm.room_name || `mezzo-${Date.now()}`).replace(/\s+/g, '-');
    setBusy(true);
    const { error } = await supabase.from('meetings').insert({ title: meetingForm.title, room_name: cleanRoom, scheduled_at: meetingForm.scheduled_at || null, description: meetingForm.description || null, created_by: profile.id });
    setBusy(false);
    if (error) show('error', error.message);
    else { show('success', 'Meeting created successfully.'); setMeetingForm({ title: '', room_name: '', scheduled_at: '', description: '' }); }
  }

  async function loadApprovals() {
    const { data, error } = await supabase.from('appointment_letter_requests').select('id,staff_id,status,requested_at').order('requested_at', { ascending: false }).limit(50);
    if (error) show('error', error.message); else setRequests((data || []) as AppointmentLetterRequest[]);
  }

  async function decideRequest(request: AppointmentLetterRequest, status: 'approved' | 'rejected') {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from('appointment_letter_requests').update({ status, decided_by: profile.id, decided_at: new Date().toISOString() }).eq('id', request.id);
    setBusy(false);
    if (error) show('error', error.message);
    else { await notifyStaff(request.staff_id, status === 'approved' ? 'Appointment letter approved' : 'Appointment letter request rejected', status === 'approved' ? 'Your appointment letter has been approved. Open Letters & Payslips to download it.' : 'Your appointment letter request was not approved. Please contact admin.'); show('success', `Appointment letter ${status}.`); await loadApprovals(); await loadCore(); }
  }

  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;

  return <section className="admin-light-page">
    <PopupNotice notice={notice} onClose={() => setNotice(null)} />
    <div className="page-header"><div><h1>Admin Dashboard</h1><p>Staff, schools, assignments, deductions, payroll and finance summary.</p></div><button type="button" className="secondary" onClick={loadCore}>{loading ? 'Loading...' : 'Refresh'}</button></div>

    <div className="chips finance-tabs">
      {(['dashboard', 'quick', 'approvals', 'tools'] as Tab[]).map((item) => <button key={item} type="button" className={`chip ${tab === item ? 'selected' : ''}`} onClick={() => { setTab(item); if (item === 'approvals') loadApprovals(); }}>{item === 'dashboard' ? 'Dashboard' : item === 'quick' ? 'Quick Actions' : item === 'approvals' ? 'Appointment Approvals' : 'Other Admin Tools'}</button>)}
    </div>

    {tab === 'dashboard' && <>
      <div className="grid four">
        <div className="metric-card"><span>Active Teachers / Staff</span><strong>{summary.activeTeachers}</strong></div>
        <div className="metric-card"><span>Schools</span><strong>{summary.totalSchools}</strong></div>
        <div className="metric-card"><span>School Assignments</span><strong>{summary.totalAssignments}</strong></div>
        <div className="metric-card"><span>Unassigned Teachers</span><strong>{summary.unassignedTeachers}</strong></div>
        <div className="metric-card"><span>Schools With GPS</span><strong>{summary.schoolsWithGps}</strong></div>
        <div className="metric-card"><span>Schools Without GPS</span><strong>{summary.schoolsWithoutGps}</strong></div>
        <div className="metric-card"><span>Pending Appointment Letters</span><strong>{summary.pendingAppointments}</strong></div>
        <div className="metric-card"><span>Pending Deductions</span><strong>{summary.pendingDeductions}</strong></div>
        <div className="metric-card"><span>This Month Deductions</span><strong>{money(summary.approvedDeductionsMonth)}</strong></div>
        <div className="metric-card"><span>This Month Payslips</span><strong>{summary.approvedPayrollMonth}</strong></div>
        <div className="metric-card"><span>Schools Owing</span><strong>{summary.unpaidSchools}</strong></div>
        <div className="metric-card"><span>Total Finance Balance</span><strong>{money(summary.outstandingBalance)}</strong></div>
      </div>
      <div className="grid two">
        <div className="panel"><h2>Teachers Without School Assignment</h2>{unassignedTeachers.length === 0 ? <p className="status success">All active teachers have at least one school assignment.</p> : <div className="table-card compact-table"><table><thead><tr><th>Teacher</th><th>Position</th></tr></thead><tbody>{unassignedTeachers.slice(0, 20).map((row) => <tr key={row.id}><td>{staffLabel(row)}</td><td>{row.position || '-'}</td></tr>)}</tbody></table></div>}</div>
        <div className="panel"><h2>Next Steps</h2><p>Use Finance Admin to add last academic year's arrears and create the new 2026/2027 Term 1 billing.</p><div className="button-row"><Link className="primary" to="/finance-admin">Open Finance Admin</Link><Link className="secondary" to="/payroll">Open Payroll</Link></div></div>
      </div>
    </>}

    {tab === 'quick' && <div className="grid two">
      <form className="panel form-grid" onSubmit={assignSchool}>
        <h2>Assign / Unassign Staff to School</h2>
        <label>Teacher<select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>{staff.map((row) => <option key={row.id} value={row.id}>{staffLabel(row)}</option>)}</select></label>
        <div className="approval-card approved">
          <strong>Selected teacher</strong><span>{selectedStaff?.full_name || selectedStaff?.email || 'No teacher selected'}</span>
          {selectedAssignments.length === 0 ? <span>This teacher has not been assigned to any school yet.</span> : <div><span>Assigned schools:</span><div className="assignment-list">{selectedAssignments.map((row) => <div key={row.school_id} className="assignment-chip"><span>{row.schools?.name || row.school_id}</span><button type="button" className="danger small-button" disabled={busy} onClick={() => unassignSchool(row.school_id, row.schools?.name)}>Unassign</button></div>)}</div></div>}
        </div>
        <label>School<select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
        {alreadyAssigned && <p className="status info">This teacher is already assigned to this school. Choose another school if needed.</p>}
        <button className="primary" disabled={busy || !selectedStaffId || !selectedSchoolId || alreadyAssigned}>{busy ? 'Working...' : 'Assign School'}</button>
      </form>

      <form className="panel form-grid" onSubmit={createPost}><h2>Post Company Update</h2><label>Title<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} required /></label><label>Priority<select value={postForm.priority} onChange={(e) => setPostForm({ ...postForm, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label>Message<textarea value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })} required /></label><button className="primary" disabled={busy}>{busy ? 'Posting...' : 'Post Update'}</button></form>

      <form className="panel form-grid" onSubmit={createSchool}><h2>Add School</h2><label>School Name<input value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} required /></label><label>Address<input value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} /></label><div className="grid two"><label>Latitude optional<input value={schoolForm.latitude} onChange={(e) => setSchoolForm({ ...schoolForm, latitude: e.target.value })} /></label><label>Longitude optional<input value={schoolForm.longitude} onChange={(e) => setSchoolForm({ ...schoolForm, longitude: e.target.value })} /></label></div><label>Allowed radius in meters<input type="number" value={schoolForm.radius_m} onChange={(e) => setSchoolForm({ ...schoolForm, radius_m: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save School'}</button></form>

      <form className="panel form-grid" onSubmit={createMeeting}><h2>Create Meeting</h2><label>Meeting Title<input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} required /></label><label>Room Name<input value={meetingForm.room_name} onChange={(e) => setMeetingForm({ ...meetingForm, room_name: e.target.value })} placeholder="leave blank to auto-generate" /></label><label>Scheduled At<input type="datetime-local" value={meetingForm.scheduled_at} onChange={(e) => setMeetingForm({ ...meetingForm, scheduled_at: e.target.value })} /></label><label>Description<textarea value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Creating...' : 'Create Meeting'}</button></form>
    </div>}

    {tab === 'approvals' && <div className="panel"><h2>Appointment Letter Approvals</h2>{requests.length === 0 ? <div className="empty">No appointment requests found.</div> : <div className="table-card compact-table"><table><thead><tr><th>Staff ID</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{request.staff_id}</td><td>{prettyDate(request.requested_at)}</td><td><span className="pill">{request.status}</span></td><td>{request.status === 'pending' ? <div className="button-row"><button type="button" className="primary small-button" disabled={busy} onClick={() => decideRequest(request, 'approved')}>Approve</button><button type="button" className="danger small-button" disabled={busy} onClick={() => decideRequest(request, 'rejected')}>Reject</button></div> : <span className="muted">Completed</span>}</td></tr>)}</tbody></table></div>}</div>}

    {tab === 'tools' && <div className="grid two"><div className="panel"><h2>Payroll</h2><p>Generate payslips and monthly salary summaries.</p><Link className="primary" to="/payroll">Open Payroll</Link></div><div className="panel"><h2>Finance Admin</h2><p>Add arrears, school billing, receipts, expenses and bank position.</p><Link className="primary" to="/finance-admin">Open Finance Admin</Link></div><div className="panel"><h2>School Settings</h2><p>Edit GPS, reopening dates and active status.</p><Link className="primary" to="/school-settings">Open School Settings</Link></div><div className="panel"><h2>Admin Settings</h2><p>Company settings, logo, document settings and admin signature.</p><Link className="primary" to="/admin-settings">Open Admin Settings</Link></div></div>}
  </section>;
}
