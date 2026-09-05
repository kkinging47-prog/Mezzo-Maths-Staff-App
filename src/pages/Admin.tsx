import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { StatusMessage } from '../components/StatusMessage';
import { AdminStaffManager } from '../components/AdminStaffManager';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { dataUrlToFile, generateBirthdayCardImage } from '../lib/birthdayCard';
import { AppointmentLetterRequest, Profile, School } from '../types';

type AdminTab = 'actions' | 'staff' | 'approvals' | 'birthdays';
type ToastType = 'info' | 'success' | 'error';
type AssignmentRow = { staff_id: string; school_id: string; schools?: Pick<School, 'id' | 'name'> | null };
type ApprovalForm = { appointment_date: string; position: string; monthly_salary: string; admin_notes: string };

const birthdayMessage = 'Today marks a very special day in your life. We join you to celebrate this day and we pray that the Lord will bless you and keep you in health, strength and prosperity. We all wish you a happy birthday and we say God bless you.';
const emptyApproval: ApprovalForm = { appointment_date: '', position: 'Mezzo Maths Tutor', monthly_salary: '', admin_notes: '' };
const emptySchool = { name: '', address: '', latitude: '', longitude: '', radius_m: '100' };
const emptyPost = { title: '', body: '', priority: 'normal' };
const emptyMeeting = { title: '', room_name: '', scheduled_at: '', description: '' };

function dateOnly(value?: string | null) { return value && value.length >= 10 ? value.slice(0, 10) : ''; }
function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function prettyDate(value?: string | null) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '-'; }
function birthdayDate(dateOfBirth?: string | null) { const d = dateOfBirth ? new Date(dateOfBirth) : null; if (!d || Number.isNaN(d.getTime())) return ''; return `${new Date().getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`; }
function safeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'birthday-card'; }
function staffLabel(row: Profile) { return [row.full_name, row.staff_no, row.email, row.position].filter(Boolean).join(' · ') || row.id; }

export function Admin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<AdminTab>('actions');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [busy, setBusy] = useState(false);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [requests, setRequests] = useState<AppointmentLetterRequest[]>([]);
  const [approvalForms, setApprovalForms] = useState<Record<string, ApprovalForm>>({});
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [schoolForm, setSchoolForm] = useState(emptySchool);
  const [postForm, setPostForm] = useState(emptyPost);
  const [meetingForm, setMeetingForm] = useState(emptyMeeting);
  const [birthdayPreview, setBirthdayPreview] = useState('');
  const [birthdayBusy, setBirthdayBusy] = useState(false);
  const [birthdayForm, setBirthdayForm] = useState({ staff_id: '', display_name: '', position: 'Mezzo Maths Tutor', birthday_date: '', message: birthdayMessage });

  function show(text: string, nextType: ToastType = 'success') {
    setType(nextType); setMessage(text); setToast({ message: text, type: nextType });
    window.setTimeout(() => setToast(null), 4500);
  }
  function fail(error: any) { show(error?.message || 'Action failed.', 'error'); }

  async function loadCoreData() {
    const [{ data: profileData, error: profileError }, { data: schoolData, error: schoolError }, { data: assignmentData, error: assignmentError }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('staff_school_assignments').select('staff_id, school_id, schools(id,name)').order('staff_id'),
    ]);
    if (profileError || schoolError || assignmentError) { fail(profileError || schoolError || assignmentError); return; }
    const profiles = (profileData || []) as Profile[];
    const schoolRows = (schoolData || []) as School[];
    setStaff(profiles); setSchools(schoolRows); setAssignments((assignmentData || []) as AssignmentRow[]);
    setSelectedStaffId((prev) => prev || profiles.find((item) => item.role !== 'admin')?.id || profiles[0]?.id || '');
    setSelectedSchoolId((prev) => prev || schoolRows[0]?.id || '');
    setBirthdayForm((prev) => ({ ...prev, staff_id: prev.staff_id || profiles.find((item) => item.role !== 'admin')?.id || profiles[0]?.id || '' }));
  }

  async function loadRequests() {
    const { data, error } = await supabase.from('appointment_letter_requests').select('*').order('requested_at', { ascending: false });
    if (error) { fail(error); return; }
    const rows = (data || []) as AppointmentLetterRequest[];
    setRequests(rows);
    setApprovalForms((previous) => {
      const next = { ...previous };
      rows.forEach((request) => {
        const person = staff.find((row) => row.id === request.staff_id);
        if (!next[request.id]) next[request.id] = { appointment_date: dateOnly(request.appointment_date) || dateOnly(person?.date_employed), position: request.position || person?.position || 'Mezzo Maths Tutor', monthly_salary: request.monthly_salary ? String(request.monthly_salary) : '', admin_notes: request.admin_notes || '' };
      });
      return next;
    });
  }

  useEffect(() => { loadCoreData(); }, []);
  useEffect(() => { if (tab === 'approvals') loadRequests(); }, [tab, staff.length]);
  useEffect(() => { const person = staff.find((row) => row.id === birthdayForm.staff_id); if (!person) return; setBirthdayForm((prev) => ({ ...prev, display_name: person.full_name || person.email || prev.display_name, position: person.position || prev.position, birthday_date: birthdayDate(person.date_of_birth) || prev.birthday_date })); setBirthdayPreview(''); }, [birthdayForm.staff_id, staff]);

  const staffOptions = useMemo(() => staff.filter((row) => row.role !== 'admin').map((row) => ({ value: row.id, label: staffLabel(row) })), [staff]);
  const selectedStaff = staff.find((row) => row.id === selectedStaffId);
  const selectedSchool = schools.find((row) => row.id === selectedSchoolId);
  const selectedAssignments = useMemo(() => assignments.filter((row) => row.staff_id === selectedStaffId), [assignments, selectedStaffId]);
  const selectedSchoolAlreadyAssigned = selectedAssignments.some((row) => row.school_id === selectedSchoolId);
  const pendingCount = requests.filter((row) => row.status === 'pending').length;

  async function notifyStaff(staffId: string, title: string, body: string) { await supabase.from('notifications').insert({ user_id: staffId, title, body }); }

  async function createSchool(event: FormEvent) {
    event.preventDefault();
    if (!schoolForm.name.trim()) return fail(new Error('School name is required.'));
    setBusy(true);
    try {
      const { error } = await supabase.from('schools').insert({ name: schoolForm.name.trim(), address: schoolForm.address.trim() || null, latitude: schoolForm.latitude.trim() ? Number(schoolForm.latitude) : null, longitude: schoolForm.longitude.trim() ? Number(schoolForm.longitude) : null, radius_m: Number(schoolForm.radius_m || 100) });
      if (error) throw error;
      setSchoolForm(emptySchool); await loadCoreData(); show('School saved successfully.');
    } catch (error: any) { fail(error); } finally { setBusy(false); }
  }

  async function assignSchool(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!selectedStaffId || !selectedSchoolId) return fail(new Error('Select both teacher and school.'));
    if (selectedSchoolAlreadyAssigned) return show(`${selectedStaff?.full_name || 'This teacher'} is already assigned to ${selectedSchool?.name || 'this school'}.`, 'info');
    setBusy(true);
    try {
      const { data: existing, error: existingError } = await supabase.from('staff_school_assignments').select('staff_id, school_id').eq('staff_id', selectedStaffId).eq('school_id', selectedSchoolId).maybeSingle();
      if (existingError) throw existingError;
      if (existing) { await loadCoreData(); return show(`${selectedStaff?.full_name || 'This teacher'} is already assigned to ${selectedSchool?.name || 'this school'}.`, 'info'); }
      const { error } = await supabase.from('staff_school_assignments').insert({ staff_id: selectedStaffId, school_id: selectedSchoolId, assigned_by: profile.id });
      if (error) throw error;
      await loadCoreData(); show(`${selectedStaff?.full_name || 'Teacher'} assigned to ${selectedSchool?.name || 'school'} successfully.`);
    } catch (error: any) { fail(error); } finally { setBusy(false); }
  }

  async function createPost(event: FormEvent) { event.preventDefault(); if (!profile) return; setBusy(true); try { const { error } = await supabase.from('company_posts').insert({ ...postForm, post_type: 'update', author_id: profile.id }); if (error) throw error; setPostForm(emptyPost); show('Company update posted successfully.'); } catch (error: any) { fail(error); } finally { setBusy(false); } }
  async function createMeeting(event: FormEvent) { event.preventDefault(); if (!profile) return; setBusy(true); try { const cleanRoom = meetingForm.room_name || `mezzo-${Date.now()}`; const { error } = await supabase.from('meetings').insert({ ...meetingForm, room_name: cleanRoom.replace(/\s+/g, '-'), created_by: profile.id, scheduled_at: meetingForm.scheduled_at || null }); if (error) throw error; setMeetingForm(emptyMeeting); show('Meeting created successfully.'); } catch (error: any) { fail(error); } finally { setBusy(false); } }
  function setApproval(id: string, patch: Partial<ApprovalForm>) { setApprovalForms((prev) => ({ ...prev, [id]: { ...(prev[id] || emptyApproval), ...patch } })); }
  async function approveRequest(request: AppointmentLetterRequest) { if (!profile) return; const form = approvalForms[request.id] || emptyApproval; if (!form.appointment_date || !form.position || !form.monthly_salary || Number(form.monthly_salary) <= 0) return fail(new Error('Add effective date, position and monthly salary before approval.')); setBusy(true); try { const { error } = await supabase.from('appointment_letter_requests').update({ status: 'approved', decided_by: profile.id, decided_at: new Date().toISOString(), appointment_date: form.appointment_date, position: form.position, monthly_salary: Number(form.monthly_salary), admin_notes: form.admin_notes || null }).eq('id', request.id); if (error) throw error; await notifyStaff(request.staff_id, 'Appointment letter approved', 'Your appointment letter has been approved. Open Letters & Payslips to download it.'); await loadRequests(); show('Appointment letter approved.'); } catch (error: any) { fail(error); } finally { setBusy(false); } }
  async function rejectRequest(request: AppointmentLetterRequest) { if (!profile) return; const form = approvalForms[request.id] || emptyApproval; setBusy(true); try { const { error } = await supabase.from('appointment_letter_requests').update({ status: 'rejected', decided_by: profile.id, decided_at: new Date().toISOString(), admin_notes: form.admin_notes || 'Please contact admin for more details.' }).eq('id', request.id); if (error) throw error; await notifyStaff(request.staff_id, 'Appointment letter request rejected', form.admin_notes || 'Your appointment letter request was not approved. Please contact admin.'); await loadRequests(); show('Appointment letter request rejected.'); } catch (error: any) { fail(error); } finally { setBusy(false); } }
  async function generateBirthdayPreview() { setBirthdayBusy(true); try { const person = staff.find((row) => row.id === birthdayForm.staff_id); const dataUrl = await generateBirthdayCardImage({ staffName: birthdayForm.display_name, position: birthdayForm.position, birthdayDate: birthdayForm.birthday_date, message: birthdayForm.message, photoUrl: person?.photo_url }); setBirthdayPreview(dataUrl); show('Birthday e-card preview generated.'); } catch (error: any) { fail(error); } finally { setBirthdayBusy(false); } }
  async function createBirthdayPost(event: FormEvent) { event.preventDefault(); if (!profile) return; setBirthdayBusy(true); try { const person = staff.find((row) => row.id === birthdayForm.staff_id); const dataUrl = birthdayPreview || await generateBirthdayCardImage({ staffName: birthdayForm.display_name, position: birthdayForm.position, birthdayDate: birthdayForm.birthday_date, message: birthdayForm.message, photoUrl: person?.photo_url }); const fileName = `${safeName(birthdayForm.display_name)}-${Date.now()}.jpg`; const path = `birthdays/${birthdayForm.staff_id}/${fileName}`; const file = dataUrlToFile(dataUrl, fileName); const { error: uploadError } = await supabase.storage.from('birthday-cards').upload(path, file, { upsert: true, contentType: 'image/jpeg' }); if (uploadError) throw uploadError; const { data } = supabase.storage.from('birthday-cards').getPublicUrl(path); const { error: postError } = await supabase.from('company_posts').insert({ title: `Happy Birthday ${birthdayForm.display_name}`, body: birthdayForm.message, priority: 'important', post_type: 'birthday', image_url: data.publicUrl, image_path: path, author_id: profile.id }); if (postError) throw postError; setBirthdayPreview(data.publicUrl); show('Birthday e-card posted to the dashboard.'); } catch (error: any) { fail(error); } finally { setBirthdayBusy(false); } }

  return <section>
    {toast && <div className={`admin-toast ${toast.type}`}><CheckCircle size={18} /><span>{toast.message}</span><button type="button" onClick={() => setToast(null)}><X size={15} /></button></div>}
    <div className="page-header"><div><h1>Admin Control</h1><p>Manage staff, school assignments, updates, meetings, appointment approvals and birthday e-cards.</p></div></div>
    <StatusMessage message={message} type={type} />
    <div className="chips admin-tabs"><button type="button" className={`chip ${tab === 'actions' ? 'selected' : ''}`} onClick={() => setTab('actions')}>Quick Actions</button><button type="button" className={`chip ${tab === 'staff' ? 'selected' : ''}`} onClick={() => setTab('staff')}>Staff Management</button><button type="button" className={`chip ${tab === 'approvals' ? 'selected' : ''}`} onClick={() => setTab('approvals')}>Appointment Approvals {pendingCount ? `(${pendingCount})` : ''}</button><button type="button" className={`chip ${tab === 'birthdays' ? 'selected' : ''}`} onClick={() => setTab('birthdays')}>Birthday Cards</button></div>
    {tab === 'staff' && <AdminStaffManager staff={staff} currentUserId={profile?.id} onChanged={loadCoreData} onSuccess={(text) => show(text, 'success')} onError={fail} />}
    {tab === 'actions' && <div className="grid two"><form className="panel form-grid" onSubmit={assignSchool}><h2>Assign Staff to School</h2><label>Teacher<select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="assignment-status-card"><strong>{selectedStaff?.full_name || selectedStaff?.email || 'Selected teacher'}</strong>{selectedAssignments.length === 0 ? <p className="status info">This teacher has not been assigned to any school yet.</p> : <p className="status success">Already assigned to: {selectedAssignments.map((row) => row.schools?.name || row.school_id).join(', ')}</p>}</div><label>School<select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>{selectedSchoolAlreadyAssigned && <p className="status info">This teacher is already assigned to the selected school. Choose another school to add an extra assignment.</p>}<button className="primary" disabled={busy || !selectedStaffId || !selectedSchoolId || selectedSchoolAlreadyAssigned}>{busy ? 'Saving...' : 'Assign School'}</button></form><form className="panel form-grid" onSubmit={createPost}><h2>Post Company Update</h2><label>Title<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} required /></label><label>Priority<select value={postForm.priority} onChange={(e) => setPostForm({ ...postForm, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label>Message<textarea value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })} required /></label><button className="primary" disabled={busy}>Post Update</button></form><form className="panel form-grid" onSubmit={createSchool}><h2>Add School Location</h2><label>School Name<input value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} required /></label><label>Address<input value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} /></label><div className="grid two"><label>Latitude <small className="muted">optional</small><input value={schoolForm.latitude} onChange={(e) => setSchoolForm({ ...schoolForm, latitude: e.target.value })} /></label><label>Longitude <small className="muted">optional</small><input value={schoolForm.longitude} onChange={(e) => setSchoolForm({ ...schoolForm, longitude: e.target.value })} /></label></div><label>Allowed radius in meters<input type="number" value={schoolForm.radius_m} onChange={(e) => setSchoolForm({ ...schoolForm, radius_m: e.target.value })} /></label><button className="primary" disabled={busy}>Save School</button></form><form className="panel form-grid" onSubmit={createMeeting}><h2>Create Meeting</h2><label>Meeting Title<input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} required /></label><label>Room Name<input value={meetingForm.room_name} onChange={(e) => setMeetingForm({ ...meetingForm, room_name: e.target.value })} placeholder="leave blank to auto-generate" /></label><label>Scheduled At<input type="datetime-local" value={meetingForm.scheduled_at} onChange={(e) => setMeetingForm({ ...meetingForm, scheduled_at: e.target.value })} /></label><label>Description<textarea value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} /></label><button className="primary" disabled={busy}>Create Meeting</button></form></div>}
    {tab === 'approvals' && <div className="panel staff-admin-panel"><h2>Appointment Letter Approvals {pendingCount > 0 && <span className="pill">{pendingCount} pending</span>}</h2>{requests.length === 0 ? <div className="empty">No appointment letter requests yet.</div> : <div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>Requested</th><th>Status</th><th>Details</th><th>Action</th></tr></thead><tbody>{requests.map((request) => { const person = staff.find((row) => row.id === request.staff_id); const form = approvalForms[request.id] || emptyApproval; return <tr key={request.id}><td><strong>{person?.full_name || 'Staff Member'}</strong><br /><span className="muted">{person?.email || request.staff_id}</span></td><td>{prettyDate(request.requested_at)}</td><td><span className={`pill request-${request.status}`}>{request.status}</span></td><td>{request.status === 'pending' ? <div className="approval-form-grid"><label>Effective Date<input type="date" value={form.appointment_date} onChange={(e) => setApproval(request.id, { appointment_date: e.target.value })} /></label><label>Position<input value={form.position} onChange={(e) => setApproval(request.id, { position: e.target.value })} /></label><label>Monthly Salary<input type="number" value={form.monthly_salary} onChange={(e) => setApproval(request.id, { monthly_salary: e.target.value })} placeholder="1800" /></label><label>Admin Notes<textarea value={form.admin_notes} onChange={(e) => setApproval(request.id, { admin_notes: e.target.value })} /></label></div> : <div className="approval-summary"><span>Effective date: {request.appointment_date || '-'}</span><span>Position: {request.position || '-'}</span><span>Salary: {request.monthly_salary ? money(request.monthly_salary) : '-'}</span><span>Decision date: {prettyDate(request.decided_at)}</span>{request.admin_notes && <span>Notes: {request.admin_notes}</span>}</div>}</td><td>{request.status === 'pending' ? <div className="button-row"><button type="button" className="primary small-button" disabled={busy} onClick={() => approveRequest(request)}>Approve</button><button type="button" className="danger small-button" disabled={busy} onClick={() => rejectRequest(request)}>Reject</button></div> : <span className="muted">Completed</span>}</td></tr>; })}</tbody></table></div>}</div>}
    {tab === 'birthdays' && <form className="panel form-grid birthday-admin" onSubmit={createBirthdayPost}><h2>Generate Birthday E-Card</h2><label>Staff<select value={birthdayForm.staff_id} onChange={(e) => setBirthdayForm({ ...birthdayForm, staff_id: e.target.value })}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="grid two"><label>Name on Card<input value={birthdayForm.display_name} onChange={(e) => setBirthdayForm({ ...birthdayForm, display_name: e.target.value })} required /></label><label>Position / Role<input value={birthdayForm.position} onChange={(e) => setBirthdayForm({ ...birthdayForm, position: e.target.value })} /></label></div><label>Birthday Date<input type="date" value={birthdayForm.birthday_date} onChange={(e) => setBirthdayForm({ ...birthdayForm, birthday_date: e.target.value })} /></label><label>Birthday Message<textarea value={birthdayForm.message} onChange={(e) => setBirthdayForm({ ...birthdayForm, message: e.target.value })} required /></label><div className="button-row"><button className="primary" type="button" disabled={birthdayBusy} onClick={generateBirthdayPreview}>{birthdayBusy ? 'Working...' : 'Preview Card'}</button><button className="primary" disabled={birthdayBusy}>{birthdayBusy ? 'Posting...' : 'Post to Dashboard'}</button></div>{birthdayPreview && <div className="birthday-preview-card"><img src={birthdayPreview} alt="Generated birthday e-card preview" /><a className="download-link" href={birthdayPreview} download={`${safeName(birthdayForm.display_name)}-birthday-card.jpg`}>Download Card</a></div>}</form>}
  </section>;
}
