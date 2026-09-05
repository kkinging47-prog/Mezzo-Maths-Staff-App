import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AdminStaffManager } from '../components/AdminStaffManager';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { AppointmentLetterRequest, Profile, School } from '../types';

type Tab = 'quick' | 'staff' | 'appointments';
type Assignment = { staff_id: string; school_id: string; schools?: Pick<School, 'id' | 'name' | 'address'> | null };
type Popup = { message: string; type: 'success' | 'error' | 'info' } | null;

function staffLabel(row: Profile) {
  return [row.full_name, row.staff_no, row.email, row.position].filter(Boolean).join(' · ') || row.id;
}
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function prettyDate(value?: string | null) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '-'; }
function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function AdminPopup({ popup, onClose }: { popup: Popup; onClose: () => void }) {
  if (!popup) return null;
  return <div className={`admin-popup ${popup.type}`} role="status"><div><strong>{popup.type === 'error' ? 'Action failed' : popup.type === 'success' ? 'Done' : 'Notice'}</strong><p>{popup.message}</p></div><button type="button" onClick={onClose}>Close</button></div>;
}

export function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('quick');
  const [staff, setStaff] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [requests, setRequests] = useState<AppointmentLetterRequest[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [postForm, setPostForm] = useState({ title: '', body: '', priority: 'normal' });
  const [meetingForm, setMeetingForm] = useState({ title: '', room_name: '', scheduled_at: '', description: '' });
  const [schoolForm, setSchoolForm] = useState({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' });
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<Popup>(null);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);

  function show(message: string, type: 'success' | 'error' | 'info' = 'success') { setPopup({ message, type }); window.setTimeout(() => setPopup(null), 5000); }
  function fail(error: any) { show(error?.message || 'Action failed.', 'error'); }

  async function loadCoreData() {
    setLoading(true);
    const [{ data: profileData, error: profileError }, { data: schoolData, error: schoolError }, { data: assignmentData, error: assignmentError }] = await Promise.all([
      supabase.from('profiles').select('id,role,staff_no,full_name,email,phone,position,department,status,photo_url,date_employed,date_of_birth,ssnit_number').order('full_name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('staff_school_assignments').select('staff_id,school_id,schools(id,name,address)').order('staff_id'),
    ]);
    setLoading(false);
    if (profileError || schoolError || assignmentError) { fail(profileError || schoolError || assignmentError); return; }
    const profileRows = (profileData || []) as Profile[];
    const schoolRows = (schoolData || []) as School[];
    setStaff(profileRows); setSchools(schoolRows); setAssignments((assignmentData || []) as Assignment[]);
    if (!selectedStaffId && profileRows[0]) setSelectedStaffId(profileRows[0].id);
    if (!selectedSchoolId && schoolRows[0]) setSelectedSchoolId(schoolRows[0].id);
  }

  async function loadAppointments() {
    setLoading(true);
    const { data, error } = await supabase.from('appointment_letter_requests').select('*').order('requested_at', { ascending: false }).limit(100);
    setLoading(false);
    if (error) { fail(error); return; }
    setRequests((data || []) as AppointmentLetterRequest[]); setAppointmentsLoaded(true);
  }

  useEffect(() => { loadCoreData(); }, []);
  useEffect(() => { if (tab === 'appointments' && !appointmentsLoaded) loadAppointments(); }, [tab, appointmentsLoaded]);

  const staffOptions = useMemo(() => {
    const query = normalize(staffSearch);
    const rows = query ? staff.filter((row) => normalize(staffLabel(row)).includes(query)) : staff;
    return rows.slice(0, 250).map((row) => ({ value: row.id, label: staffLabel(row) }));
  }, [staff, staffSearch]);
  const selectedStaff = useMemo(() => staff.find((row) => row.id === selectedStaffId), [staff, selectedStaffId]);
  const selectedSchool = useMemo(() => schools.find((row) => row.id === selectedSchoolId), [schools, selectedSchoolId]);
  const selectedAssignments = useMemo(() => assignments.filter((row) => row.staff_id === selectedStaffId), [assignments, selectedStaffId]);
  const alreadyAssigned = selectedAssignments.some((row) => row.school_id === selectedSchoolId);

  async function createSchool(event: FormEvent) {
    event.preventDefault();
    const name = schoolForm.name.trim();
    if (!name) return show('School name is required.', 'error');
    const { error } = await supabase.from('schools').insert({ name, address: schoolForm.address.trim() || null, latitude: schoolForm.latitude.trim() ? Number(schoolForm.latitude) : null, longitude: schoolForm.longitude.trim() ? Number(schoolForm.longitude) : null, radius_m: Number(schoolForm.radius_m || 100) });
    if (error) return fail(error);
    setSchoolForm({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' });
    show('School saved successfully.'); await loadCoreData();
  }

  async function assignSchool(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!selectedStaffId || !selectedSchoolId) return show('Select both teacher and school.', 'error');
    if (alreadyAssigned) return show('This teacher is already assigned to the selected school. Choose another school.', 'info');
    const { error } = await supabase.from('staff_school_assignments').insert({ staff_id: selectedStaffId, school_id: selectedSchoolId, assigned_by: profile.id });
    if (error) return fail(error);
    show(`${selectedStaff?.full_name || 'Teacher'} assigned to ${selectedSchool?.name || 'school'} successfully.`); await loadCoreData();
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const { error } = await supabase.from('company_posts').insert({ title: postForm.title, body: postForm.body, priority: postForm.priority, post_type: 'update', author_id: profile.id });
    if (error) return fail(error);
    setPostForm({ title: '', body: '', priority: 'normal' }); show('Company update posted successfully.');
  }

  async function createMeeting(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const cleanRoom = (meetingForm.room_name || `mezzo-${Date.now()}`).replace(/\s+/g, '-').toLowerCase();
    const { error } = await supabase.from('meetings').insert({ title: meetingForm.title, description: meetingForm.description || null, room_name: cleanRoom, scheduled_at: meetingForm.scheduled_at || null, created_by: profile.id, active: true });
    if (error) return fail(error);
    setMeetingForm({ title: '', room_name: '', scheduled_at: '', description: '' }); show('Meeting created successfully.');
  }

  async function decideAppointment(request: AppointmentLetterRequest, status: 'approved' | 'rejected') {
    if (!profile) return;
    const { error } = await supabase.from('appointment_letter_requests').update({ status, decided_by: profile.id, decided_at: new Date().toISOString() }).eq('id', request.id);
    if (error) return fail(error);
    await supabase.from('notifications').insert({ user_id: request.staff_id, title: status === 'approved' ? 'Appointment letter approved' : 'Appointment letter request rejected', body: status === 'approved' ? 'Your appointment letter has been approved. Open Letters & Payslips to download it.' : 'Your appointment letter request was not approved. Please contact admin.' });
    show(`Appointment request ${status}.`); await loadAppointments();
  }

  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;

  return <section>
    <AdminPopup popup={popup} onClose={() => setPopup(null)} />
    <div className="page-header"><div><h1>Admin Control</h1><p>Manage quick admin actions, staff records and appointment approvals.</p></div>{loading && <span className="pill">Loading...</span>}</div>
    <div className="chips admin-tabs"><button type="button" className={`chip ${tab === 'quick' ? 'selected' : ''}`} onClick={() => setTab('quick')}>Quick Actions</button><button type="button" className={`chip ${tab === 'staff' ? 'selected' : ''}`} onClick={() => setTab('staff')}>Staff Management</button><button type="button" className={`chip ${tab === 'appointments' ? 'selected' : ''}`} onClick={() => setTab('appointments')}>Appointment Approvals</button></div>
    {tab === 'quick' && <div className="grid two"><form className="panel form-grid" onSubmit={assignSchool}><h2>Assign Staff to School</h2><label>Search Teacher<input value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} placeholder="Type name, email, staff number or position" /></label><label>Teacher<select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="assignment-status-card"><strong>{selectedStaff?.full_name || 'Selected staff'}</strong>{selectedAssignments.length === 0 ? <p>This teacher has not been assigned to any school yet.</p> : <p>Assigned schools: {selectedAssignments.map((row) => row.schools?.name || row.school_id).join(', ')}</p>}</div><label>School<select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>{alreadyAssigned && <div className="status info">This teacher is already assigned to this school. No duplicate will be created.</div>}<button className="primary" disabled={alreadyAssigned || !selectedStaffId || !selectedSchoolId}>Assign School</button></form><form className="panel form-grid" onSubmit={createPost}><h2>Post Company Update</h2><label>Title<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} required /></label><label>Priority<select value={postForm.priority} onChange={(e) => setPostForm({ ...postForm, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label>Message<textarea value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })} required /></label><button className="primary">Post Update</button></form><form className="panel form-grid" onSubmit={createSchool}><h2>Add School</h2><label>School Name<input value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} required /></label><label>Address<input value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} /></label><div className="grid two"><label>Latitude <small className="muted">optional</small><input value={schoolForm.latitude} onChange={(e) => setSchoolForm({ ...schoolForm, latitude: e.target.value })} /></label><label>Longitude <small className="muted">optional</small><input value={schoolForm.longitude} onChange={(e) => setSchoolForm({ ...schoolForm, longitude: e.target.value })} /></label></div><label>Allowed radius in meters<input type="number" value={schoolForm.radius_m} onChange={(e) => setSchoolForm({ ...schoolForm, radius_m: e.target.value })} /></label><button className="primary">Save School</button></form><form className="panel form-grid" onSubmit={createMeeting}><h2>Create Meeting</h2><label>Meeting Title<input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} required /></label><label>Room Name<input value={meetingForm.room_name} onChange={(e) => setMeetingForm({ ...meetingForm, room_name: e.target.value })} placeholder="Leave blank to auto-generate" /></label><label>Scheduled At<input type="datetime-local" value={meetingForm.scheduled_at} onChange={(e) => setMeetingForm({ ...meetingForm, scheduled_at: e.target.value })} /></label><label>Description<textarea value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} /></label><button className="primary">Create Meeting</button></form></div>}
    {tab === 'staff' && <AdminStaffManager staff={staff} currentUserId={profile?.id} onChanged={loadCoreData} onSuccess={(text) => show(text)} onError={fail} />}
    {tab === 'appointments' && <div className="panel staff-admin-panel"><h2>Appointment Letter Approvals</h2>{requests.length === 0 ? <div className="empty">No appointment letter requests found.</div> : <div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>Requested</th><th>Status</th><th>Salary</th><th>Action</th></tr></thead><tbody>{requests.map((request) => { const person = staff.find((row) => row.id === request.staff_id); return <tr key={request.id}><td><strong>{person?.full_name || 'Staff Member'}</strong><br /><span className="muted">{person?.email || request.staff_id}</span></td><td>{prettyDate(request.requested_at)}</td><td><span className={`pill request-${request.status}`}>{request.status}</span></td><td>{request.monthly_salary ? money(request.monthly_salary) : '-'}</td><td>{request.status === 'pending' ? <div className="button-row"><button type="button" className="primary small-button" onClick={() => decideAppointment(request, 'approved')}>Approve</button><button type="button" className="danger small-button" onClick={() => decideAppointment(request, 'rejected')}>Reject</button></div> : <span className="muted">Completed</span>}</td></tr>; })}</tbody></table></div>}</div>}
  </section>;
}
