import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { AppointmentLetterRequest, Profile, School } from '../types';

type Tab = 'dashboard' | 'quick' | 'assignments' | 'approvals' | 'tools';
type Assignment = { staff_id: string; school_id: string; schools?: Pick<School, 'id' | 'name' | 'address'> | null };
type Notice = { text: string; type: 'success' | 'error' | 'info' };
type DashboardStats = { pendingDeductions: number; monthDeductions: number; monthPayslips: number; schoolsOwing: number; financeBalance: number };

function staffLabel(row: Profile) { return [row.full_name, row.staff_no, row.email, row.position].filter(Boolean).join(' · ') || row.id; }
function isTeacher(row: Profile) { const p = String(row.position || '').toLowerCase(); const d = String(row.department || '').toLowerCase(); return p.includes('tutor') || p.includes('teacher') || d.includes('teaching'); }
function prettyDate(value?: string | null) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '-'; }
function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

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
  const [stats, setStats] = useState<DashboardStats>({ pendingDeductions: 0, monthDeductions: 0, monthPayslips: 0, schoolsOwing: 0, financeBalance: 0 });
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [postForm, setPostForm] = useState({ title: '', body: '', priority: 'normal' });
  const [schoolForm, setSchoolForm] = useState({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' });
  const [meetingForm, setMeetingForm] = useState({ title: '', room_name: '', scheduled_at: '', description: '' });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  const teachers = useMemo(() => staff.filter(isTeacher), [staff]);
  const activeTeachers = teachers.filter((row) => row.status !== 'left').length;
  const selectedStaff = useMemo(() => staff.find((row) => row.id === selectedStaffId), [staff, selectedStaffId]);
  const selectedSchool = useMemo(() => schools.find((row) => row.id === selectedSchoolId), [schools, selectedSchoolId]);
  const selectedAssignments = useMemo(() => assignments.filter((row) => row.staff_id === selectedStaffId), [assignments, selectedStaffId]);
  const alreadyAssigned = useMemo(() => assignments.some((row) => row.staff_id === selectedStaffId && row.school_id === selectedSchoolId), [assignments, selectedStaffId, selectedSchoolId]);
  const teachersWithoutSchool = teachers.filter((teacher) => !assignments.some((assignment) => assignment.staff_id === teacher.id)).length;
  const schoolsWithGps = schools.filter((school) => school.latitude !== null && school.latitude !== undefined && school.longitude !== null && school.longitude !== undefined).length;
  const schoolsWithoutGps = Math.max(0, schools.length - schoolsWithGps);
  const currentMonth = new Date().toISOString().slice(0, 7);

  function show(type: Notice['type'], text: string) { setNotice({ type, text }); window.setTimeout(() => setNotice((current) => current?.text === text ? null : current), 5000); }

  async function loadCore() {
    const [{ data: profileData, error: profileError }, { data: schoolData, error: schoolError }, { data: assignmentData, error: assignmentError }, { count: pendingDeductions }, { data: deductionRows }, { count: monthPayslips }, { data: billingData }, { data: paymentData }, { data: expenseData }, { data: settingsData }, { data: appointmentData }] = await Promise.all([
      supabase.from('profiles').select('id,role,staff_no,full_name,email,position,department,status').neq('role', 'admin').order('full_name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('staff_school_assignments').select('staff_id,school_id,schools(id,name,address)'),
      supabase.from('attendance_deductions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('attendance_deductions').select('amount,work_date').gte('work_date', `${currentMonth}-01`),
      supabase.from('payrolls').select('id', { count: 'exact', head: true }).gte('month', `${currentMonth}-01`),
      supabase.from('finance_school_billing').select('school_id,student_count,fee_type,fee_per_student,flat_rate,books_bought,book_unit_price,previous_arrears'),
      supabase.from('finance_payments').select('school_id,amount'),
      supabase.from('finance_expenses').select('quantity,unit_price'),
      supabase.from('finance_settings').select('key,value'),
      supabase.from('appointment_letter_requests').select('*').order('requested_at', { ascending: false }).limit(50),
    ]);
    const error = profileError || schoolError || assignmentError;
    if (error) { show('error', error.message); return; }
    const activeStaff = ((profileData || []) as Profile[]).filter((row) => row.status !== 'left');
    setStaff(activeStaff); setSchools((schoolData || []) as School[]); setRequests((appointmentData || []) as AppointmentLetterRequest[]);
    setAssignments(((assignmentData || []) as any[]).map((row) => ({ ...row, schools: Array.isArray(row.schools) ? row.schools[0] : row.schools })));
    setSelectedStaffId((current) => current || activeStaff[0]?.id || '');
    setSelectedSchoolId((current) => current || schoolData?.[0]?.id || '');
    const expected = (billingData || []).reduce((sum: number, row: any) => sum + (row.fee_type === 'flat' ? Number(row.flat_rate || 0) : Number(row.student_count || 0) * Number(row.fee_per_student || 0)) + Number(row.books_bought || 0) * Number(row.book_unit_price || 0) + Number(row.previous_arrears || 0), 0);
    const paid = (paymentData || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const expenses = (expenseData || []).reduce((sum: number, row: any) => sum + Number(row.quantity || 1) * Number(row.unit_price || 0), 0);
    const opening = Number((settingsData || []).find((row: any) => row.key === 'opening_bank_balance')?.value || 0);
    setStats({ pendingDeductions: pendingDeductions || 0, monthDeductions: (deductionRows || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0), monthPayslips: monthPayslips || 0, schoolsOwing: Math.max(0, expected - paid), financeBalance: opening + paid - expenses });
  }

  async function loadApprovals() { const { data, error } = await supabase.from('appointment_letter_requests').select('*').order('requested_at', { ascending: false }).limit(50); if (error) show('error', error.message); else setRequests((data || []) as AppointmentLetterRequest[]); }
  useEffect(() => { loadCore(); }, []);
  useEffect(() => { if (tab === 'approvals') loadApprovals(); }, [tab]);

  async function notifyStaff(staffId: string, title: string, body: string) { if (!profile) return; await supabase.from('staff_messages').insert({ sender_id: profile.id, recipient_id: staffId, subject: title, body }); }

  async function assignSchool(event: FormEvent) {
    event.preventDefault(); if (!profile) return;
    if (!selectedStaffId || !selectedSchoolId) { show('error', 'Select both teacher and school.'); return; }
    if (alreadyAssigned) { show('info', `${selectedStaff?.full_name || 'This teacher'} is already assigned to ${selectedSchool?.name || 'this school'}.`); return; }
    setBusy(true); const { error } = await supabase.from('staff_school_assignments').insert({ staff_id: selectedStaffId, school_id: selectedSchoolId, assigned_by: profile.id }); setBusy(false);
    if (error) show('error', error.message); else { show('success', `${selectedStaff?.full_name || 'Teacher'} assigned to ${selectedSchool?.name || 'school'} successfully.`); await loadCore(); }
  }

  async function unassignSchool(assignment: Assignment) {
    if (!window.confirm(`Remove ${selectedStaff?.full_name || 'this teacher'} from ${assignment.schools?.name || 'this school'}?`)) return;
    setBusy(true); const { error } = await supabase.from('staff_school_assignments').delete().eq('staff_id', assignment.staff_id).eq('school_id', assignment.school_id); setBusy(false);
    if (error) show('error', error.message); else { show('success', 'School unassigned successfully.'); await loadCore(); }
  }

  async function createPost(event: FormEvent) { event.preventDefault(); if (!profile) return; setBusy(true); const { error } = await supabase.from('company_posts').insert({ ...postForm, post_type: 'update', author_id: profile.id }); setBusy(false); if (error) show('error', error.message); else { show('success', 'Company update posted successfully.'); setPostForm({ title: '', body: '', priority: 'normal' }); } }
  async function createSchool(event: FormEvent) { event.preventDefault(); const latitude = schoolForm.latitude.trim() ? Number(schoolForm.latitude) : null; const longitude = schoolForm.longitude.trim() ? Number(schoolForm.longitude) : null; setBusy(true); const { error } = await supabase.from('schools').insert({ name: schoolForm.name.trim(), address: schoolForm.address.trim() || null, latitude, longitude, radius_m: Number(schoolForm.radius_m || 100) }); setBusy(false); if (error) show('error', error.message); else { show('success', 'School saved successfully.'); setSchoolForm({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' }); await loadCore(); } }
  async function createMeeting(event: FormEvent) { event.preventDefault(); if (!profile) return; const cleanRoom = (meetingForm.room_name || `mezzo-${Date.now()}`).replace(/\s+/g, '-'); setBusy(true); const { error } = await supabase.from('meetings').insert({ title: meetingForm.title, room_name: cleanRoom, scheduled_at: meetingForm.scheduled_at || null, description: meetingForm.description || null, created_by: profile.id }); setBusy(false); if (error) show('error', error.message); else { show('success', 'Meeting created successfully.'); setMeetingForm({ title: '', room_name: '', scheduled_at: '', description: '' }); } }
  async function decideRequest(request: AppointmentLetterRequest, status: 'approved' | 'rejected') { if (!profile) return; setBusy(true); const { error } = await supabase.from('appointment_letter_requests').update({ status, decided_by: profile.id, decided_at: new Date().toISOString() }).eq('id', request.id); setBusy(false); if (error) show('error', error.message); else { await notifyStaff(request.staff_id, status === 'approved' ? 'Appointment letter approved' : 'Appointment letter request rejected', status === 'approved' ? 'Your appointment letter has been approved. Open Letters & Payslips to download it.' : 'Your appointment letter request was not approved. Please contact admin.'); show('success', `Appointment letter ${status}.`); await loadApprovals(); } }

  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;

  return <section className="admin-light-page"><PopupNotice notice={notice} onClose={() => setNotice(null)} /><div className="page-header"><div><h1>Admin Dashboard</h1><p>Staff, school, attendance and finance summary.</p></div><button type="button" className="small-button" onClick={loadCore}>Refresh</button></div>
    <div className="chips finance-tabs"><button type="button" className={`chip ${tab === 'dashboard' ? 'selected' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button><button type="button" className={`chip ${tab === 'quick' ? 'selected' : ''}`} onClick={() => setTab('quick')}>Quick Actions</button><button type="button" className={`chip ${tab === 'assignments' ? 'selected' : ''}`} onClick={() => setTab('assignments')}>Teachers & Schools</button><button type="button" className={`chip ${tab === 'approvals' ? 'selected' : ''}`} onClick={() => setTab('approvals')}>Appointment Approvals</button><button type="button" className={`chip ${tab === 'tools' ? 'selected' : ''}`} onClick={() => setTab('tools')}>Other Tools</button></div>
    {tab === 'dashboard' && <><div className="grid four"><div className="metric-card"><span>Active Teachers</span><strong>{activeTeachers}</strong></div><div className="metric-card"><span>Active Staff</span><strong>{staff.length}</strong></div><div className="metric-card"><span>Schools</span><strong>{schools.length}</strong></div><div className="metric-card"><span>School Assignments</span><strong>{assignments.length}</strong></div><div className="metric-card"><span>Teachers Without School</span><strong>{teachersWithoutSchool}</strong></div><div className="metric-card"><span>Schools With GPS</span><strong>{schoolsWithGps}</strong></div><div className="metric-card"><span>Schools Without GPS</span><strong>{schoolsWithoutGps}</strong></div><div className="metric-card"><span>Pending Letters</span><strong>{requests.filter((row) => row.status === 'pending').length}</strong></div><div className="metric-card"><span>Pending Deductions</span><strong>{stats.pendingDeductions}</strong></div><div className="metric-card"><span>This Month Deductions</span><strong>{money(stats.monthDeductions)}</strong></div><div className="metric-card"><span>This Month Payslips</span><strong>{stats.monthPayslips}</strong></div><div className="metric-card"><span>Schools Owing</span><strong>{money(stats.schoolsOwing)}</strong></div></div><div className="grid two"><div className="panel"><h2>Finance Position</h2><div className="approval-card approved"><span>Estimated bank balance: <strong>{money(stats.financeBalance)}</strong></span><span>School balances/arrears owing: <strong>{money(stats.schoolsOwing)}</strong></span></div></div><div className="panel"><h2>Attention Needed</h2><div className="approval-card"><span>{teachersWithoutSchool} teacher(s) without assigned school.</span><span>{schoolsWithoutGps} school(s) without saved GPS coordinates.</span><span>{stats.pendingDeductions} pending deduction(s) awaiting review.</span></div></div></div></>}
    {tab === 'quick' && <div className="grid two"><form className="panel form-grid" onSubmit={assignSchool}><h2>Assign / Unassign Staff to School</h2><label>Teacher<select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>{staff.map((row) => <option key={row.id} value={row.id}>{staffLabel(row)}</option>)}</select></label><div className="approval-card approved"><strong>Selected teacher</strong><span>{selectedStaff?.full_name || selectedStaff?.email || 'No teacher selected'}</span>{selectedAssignments.length === 0 ? <span>This teacher has not been assigned to any school yet.</span> : <span>Assigned schools are shown below.</span>}{selectedAssignments.map((assignment) => <span key={`${assignment.staff_id}-${assignment.school_id}`} className="button-row"><span>{assignment.schools?.name || assignment.school_id}</span><button type="button" className="danger small-button" disabled={busy} onClick={() => unassignSchool(assignment)}>Unassign</button></span>)}</div><label>School<select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>{alreadyAssigned && <p className="status info">This teacher is already assigned to this school. Choose another school if needed.</p>}<button className="primary" disabled={busy || !selectedStaffId || !selectedSchoolId || alreadyAssigned}>{busy ? 'Working...' : 'Assign School'}</button></form><form className="panel form-grid" onSubmit={createPost}><h2>Post Company Update</h2><label>Title<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} required /></label><label>Priority<select value={postForm.priority} onChange={(e) => setPostForm({ ...postForm, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label>Message<textarea value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })} required /></label><button className="primary" disabled={busy}>{busy ? 'Posting...' : 'Post Update'}</button></form><form className="panel form-grid" onSubmit={createSchool}><h2>Add School</h2><label>School Name<input value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} required /></label><label>Address<input value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} /></label><div className="grid two"><label>Latitude optional<input value={schoolForm.latitude} onChange={(e) => setSchoolForm({ ...schoolForm, latitude: e.target.value })} /></label><label>Longitude optional<input value={schoolForm.longitude} onChange={(e) => setSchoolForm({ ...schoolForm, longitude: e.target.value })} /></label></div><label>Allowed radius in meters<input type="number" value={schoolForm.radius_m} onChange={(e) => setSchoolForm({ ...schoolForm, radius_m: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save School'}</button></form><form className="panel form-grid" onSubmit={createMeeting}><h2>Create Meeting</h2><label>Meeting Title<input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} required /></label><label>Room Name<input value={meetingForm.room_name} onChange={(e) => setMeetingForm({ ...meetingForm, room_name: e.target.value })} placeholder="leave blank to auto-generate" /></label><label>Scheduled At<input type="datetime-local" value={meetingForm.scheduled_at} onChange={(e) => setMeetingForm({ ...meetingForm, scheduled_at: e.target.value })} /></label><label>Description<textarea value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Creating...' : 'Create Meeting'}</button></form></div>}
    {tab === 'assignments' && <div className="panel"><h2>All Teachers and Assigned Schools</h2><div className="table-card compact-table"><table><thead><tr><th>Teacher</th><th>Position</th><th>Assigned Schools</th><th>Status</th></tr></thead><tbody>{teachers.map((teacher) => { const rows = assignments.filter((assignment) => assignment.staff_id === teacher.id); return <tr key={teacher.id}><td>{teacher.full_name || teacher.email}</td><td>{teacher.position || '-'}</td><td>{rows.length ? rows.map((row) => row.schools?.name || row.school_id).join(', ') : '-'}</td><td><span className={`pill ${rows.length ? 'status-approved' : 'status-pending'}`}>{rows.length ? `${rows.length} school(s)` : 'No school assigned'}</span></td></tr>; })}</tbody></table></div></div>}
    {tab === 'approvals' && <div className="panel"><h2>Appointment Letter Approvals</h2>{requests.length === 0 ? <div className="empty">No appointment requests found.</div> : <div className="table-card compact-table"><table><thead><tr><th>Staff ID</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td>{request.staff_id}</td><td>{prettyDate(request.requested_at)}</td><td><span className="pill">{request.status}</span></td><td>{request.status === 'pending' ? <div className="button-row"><button type="button" className="primary small-button" disabled={busy} onClick={() => decideRequest(request, 'approved')}>Approve</button><button type="button" className="danger small-button" disabled={busy} onClick={() => decideRequest(request, 'rejected')}>Reject</button></div> : <span className="muted">Completed</span>}</td></tr>)}</tbody></table></div>}</div>}
    {tab === 'tools' && <div className="grid two"><div className="panel"><h2>Staff Management</h2><p>Use the dedicated staff settings area to add, edit or disable staff accounts.</p><Link className="primary" to="/admin-settings">Open Admin Settings</Link></div><div className="panel"><h2>Payroll</h2><p>Generated payslips and monthly salary summaries.</p><Link className="primary" to="/payroll">Open Payroll</Link></div><div className="panel"><h2>School Settings</h2><p>Edit GPS, reopening dates and active status.</p><Link className="primary" to="/school-settings">Open School Settings</Link></div><div className="panel"><h2>Finance Admin</h2><p>School billing, arrears, receipts, expenses and bank position.</p><Link className="primary" to="/finance-admin">Open Finance Admin</Link></div></div>}
  </section>;
}
