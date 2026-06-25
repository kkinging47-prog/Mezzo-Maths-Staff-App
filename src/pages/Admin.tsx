import { FormEvent, useEffect, useMemo, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { AdminStaffManager } from '../components/AdminStaffManager';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { dataUrlToFile, generateBirthdayCardImage } from '../lib/birthdayCard';
import { AppointmentLetterRequest, Profile, School } from '../types';

const birthdayMessage = 'Today marks a very special day in your life. We join you to celebrate this day and we pray that the Lord will bless you and keep you in health, strength and prosperity. We all wish you a happy birthday and we say God bless you.';
type ApprovalForm = { appointment_date: string; position: string; monthly_salary: string; admin_notes: string };
const emptyApproval: ApprovalForm = { appointment_date: '', position: 'Mezzo Maths Tutor', monthly_salary: '', admin_notes: '' };
function safeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'birthday-card'; }
function dateOnly(value?: string | null) { return value && value.length >= 10 ? value.slice(0, 10) : ''; }
function prettyDate(value?: string | null) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '-'; }
function birthdayDate(dateOfBirth?: string | null) { const d = dateOfBirth ? new Date(dateOfBirth) : null; if (!d || Number.isNaN(d.getTime())) return ''; return `${new Date().getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`; }

export function Admin() {
  const { profile } = useAuth();
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [staff, setStaff] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [requests, setRequests] = useState<AppointmentLetterRequest[]>([]);
  const [approvalForms, setApprovalForms] = useState<Record<string, ApprovalForm>>({});
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [birthdayPreview, setBirthdayPreview] = useState('');
  const [birthdayBusy, setBirthdayBusy] = useState(false);
  const [schoolForm, setSchoolForm] = useState({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' });
  const [postForm, setPostForm] = useState({ title: '', body: '', priority: 'normal' });
  const [meetingForm, setMeetingForm] = useState({ title: '', room_name: '', scheduled_at: '', description: '' });
  const [payrollForm, setPayrollForm] = useState({ staff_id: '', month: '', basic_salary: '', allowances: '0', deductions: '0', paid_on: '' });
  const [birthdayForm, setBirthdayForm] = useState({ staff_id: '', display_name: '', position: 'Mezzo Maths Tutor', birthday_date: '', message: birthdayMessage });
  const staffOptions = useMemo(() => staff.map((row) => ({ value: row.id, label: row.full_name || row.email || row.id })), [staff]);
  const selectedBirthdayStaff = staff.find((row) => row.id === birthdayForm.staff_id);
  const pendingCount = requests.filter((row) => row.status === 'pending').length;
  function ok(text: string) { setType('success'); setMessage(text); }
  function fail(error: any) { setType('error'); setMessage(error?.message || 'Action failed.'); }

  async function loadData() {
    const [{ data: profileData, error: profileError }, { data: schoolData, error: schoolError }, { data: requestData, error: requestError }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('schools').select('*').order('name'),
      supabase.from('appointment_letter_requests').select('*').order('requested_at', { ascending: false }),
    ]);
    if (profileError || schoolError || requestError) { fail(profileError || schoolError || requestError); return; }
    const profiles = (profileData || []) as Profile[];
    const appointments = (requestData || []) as AppointmentLetterRequest[];
    setStaff(profiles); setSchools((schoolData || []) as School[]); setRequests(appointments);
    setApprovalForms((previous) => {
      const next = { ...previous };
      appointments.forEach((request) => {
        const person = profiles.find((row) => row.id === request.staff_id);
        if (!next[request.id]) next[request.id] = { appointment_date: dateOnly(request.appointment_date) || dateOnly(person?.date_employed), position: request.position || person?.position || 'Mezzo Maths Tutor', monthly_salary: request.monthly_salary ? String(request.monthly_salary) : '', admin_notes: request.admin_notes || '' };
      });
      return next;
    });
    if (!selectedStaffId && profiles[0]) setSelectedStaffId(profiles[0].id);
    if (!selectedSchoolId && schoolData?.[0]) setSelectedSchoolId(schoolData[0].id);
    if (!payrollForm.staff_id && profiles[0]) setPayrollForm((prev) => ({ ...prev, staff_id: profiles[0].id }));
    if (!birthdayForm.staff_id && profiles[0]) setBirthdayForm((prev) => ({ ...prev, staff_id: profiles[0].id }));
  }
  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    const person = staff.find((row) => row.id === birthdayForm.staff_id);
    if (!person) return;
    setBirthdayForm((prev) => ({ ...prev, display_name: person.full_name || person.email || prev.display_name, position: person.position || prev.position, birthday_date: birthdayDate(person.date_of_birth) || prev.birthday_date }));
    setBirthdayPreview('');
  }, [birthdayForm.staff_id, staff]);

  function setApproval(id: string, patch: Partial<ApprovalForm>) { setApprovalForms((prev) => ({ ...prev, [id]: { ...(prev[id] || emptyApproval), ...patch } })); }
  async function notifyStaff(staffId: string, title: string, body: string) { await supabase.from('notifications').insert({ user_id: staffId, title, body }); }
  async function approveRequest(request: AppointmentLetterRequest) {
    if (!profile) return;
    const form = approvalForms[request.id] || emptyApproval;
    if (!form.appointment_date || !form.position || !form.monthly_salary || Number(form.monthly_salary) <= 0) { fail(new Error('Add effective date, position and monthly salary before approval.')); return; }
    const { error } = await supabase.from('appointment_letter_requests').update({ status: 'approved', decided_by: profile.id, decided_at: new Date().toISOString(), appointment_date: form.appointment_date, position: form.position, monthly_salary: Number(form.monthly_salary), admin_notes: form.admin_notes || null }).eq('id', request.id);
    if (error) fail(error); else { await notifyStaff(request.staff_id, 'Appointment letter approved', 'Your appointment letter has been approved. Open Letters & Payslips to download it.'); ok('Appointment letter approved.'); loadData(); }
  }
  async function rejectRequest(request: AppointmentLetterRequest) {
    if (!profile) return;
    const form = approvalForms[request.id] || emptyApproval;
    const { error } = await supabase.from('appointment_letter_requests').update({ status: 'rejected', decided_by: profile.id, decided_at: new Date().toISOString(), admin_notes: form.admin_notes || 'Please contact admin for more details.' }).eq('id', request.id);
    if (error) fail(error); else { await notifyStaff(request.staff_id, 'Appointment letter request rejected', form.admin_notes || 'Your appointment letter request was not approved. Please contact admin.'); ok('Appointment letter request rejected.'); loadData(); }
  }
  async function createSchool(event: FormEvent) { event.preventDefault(); const { error } = await supabase.from('schools').insert({ name: schoolForm.name, address: schoolForm.address, latitude: Number(schoolForm.latitude), longitude: Number(schoolForm.longitude), radius_m: Number(schoolForm.radius_m || 100) }); if (error) fail(error); else { ok('School created successfully.'); setSchoolForm({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' }); loadData(); } }
  async function assignSchool(event: FormEvent) { event.preventDefault(); if (!profile) return; const { error } = await supabase.from('staff_school_assignments').upsert({ staff_id: selectedStaffId, school_id: selectedSchoolId, assigned_by: profile.id }); if (error) fail(error); else ok('School assigned to staff successfully.'); }
  async function createPost(event: FormEvent) { event.preventDefault(); if (!profile) return; const { error } = await supabase.from('company_posts').insert({ ...postForm, post_type: 'update', author_id: profile.id }); if (error) fail(error); else { ok('Company update posted successfully.'); setPostForm({ title: '', body: '', priority: 'normal' }); } }
  async function createMeeting(event: FormEvent) { event.preventDefault(); if (!profile) return; const cleanRoom = meetingForm.room_name || `mezzo-${Date.now()}`; const { error } = await supabase.from('meetings').insert({ ...meetingForm, room_name: cleanRoom.replace(/\s+/g, '-'), created_by: profile.id, scheduled_at: meetingForm.scheduled_at || null }); if (error) fail(error); else { ok('Meeting created successfully.'); setMeetingForm({ title: '', room_name: '', scheduled_at: '', description: '' }); } }
  async function createPayroll(event: FormEvent) { event.preventDefault(); const { error } = await supabase.from('payrolls').insert({ staff_id: payrollForm.staff_id, month: payrollForm.month, basic_salary: Number(payrollForm.basic_salary || 0), allowances: Number(payrollForm.allowances || 0), deductions: Number(payrollForm.deductions || 0), paid_on: payrollForm.paid_on || null }); if (error) fail(error); else { ok('Payslip record created.'); setPayrollForm((prev) => ({ ...prev, month: '', basic_salary: '', allowances: '0', deductions: '0', paid_on: '' })); } }
  async function generateBirthdayPreview() { setBirthdayBusy(true); try { const dataUrl = await generateBirthdayCardImage({ staffName: birthdayForm.display_name, position: birthdayForm.position, birthdayDate: birthdayForm.birthday_date, message: birthdayForm.message, photoUrl: selectedBirthdayStaff?.photo_url }); setBirthdayPreview(dataUrl); ok('Birthday e-card preview generated.'); } catch (error: any) { fail(error); } finally { setBirthdayBusy(false); } }
  async function createBirthdayPost(event: FormEvent) { event.preventDefault(); if (!profile) return; setBirthdayBusy(true); try { const dataUrl = birthdayPreview || await generateBirthdayCardImage({ staffName: birthdayForm.display_name, position: birthdayForm.position, birthdayDate: birthdayForm.birthday_date, message: birthdayForm.message, photoUrl: selectedBirthdayStaff?.photo_url }); const fileName = `${safeName(birthdayForm.display_name)}-${Date.now()}.jpg`; const path = `birthdays/${birthdayForm.staff_id}/${fileName}`; const file = dataUrlToFile(dataUrl, fileName); const { error: uploadError } = await supabase.storage.from('birthday-cards').upload(path, file, { upsert: true, contentType: 'image/jpeg' }); if (uploadError) throw uploadError; const { data } = supabase.storage.from('birthday-cards').getPublicUrl(path); const { error: postError } = await supabase.from('company_posts').insert({ title: `Happy Birthday ${birthdayForm.display_name}`, body: birthdayForm.message, priority: 'important', post_type: 'birthday', image_url: data.publicUrl, image_path: path, author_id: profile.id }); if (postError) throw postError; setBirthdayPreview(data.publicUrl); ok('Birthday e-card posted to the dashboard.'); } catch (error: any) { fail(error); } finally { setBirthdayBusy(false); } }

  return <section>
    <div className="page-header"><div><h1>Admin Control</h1><p>Manage staff, schools, updates, meetings, payslips, appointment approvals and birthday e-cards.</p></div></div>
    <StatusMessage message={message} type={type} />
    <AdminStaffManager staff={staff} currentUserId={profile?.id} onChanged={loadData} onSuccess={ok} onError={fail} />
    <div className="panel staff-admin-panel"><h2>Appointment Letter Approvals {pendingCount > 0 && <span className="pill">{pendingCount} pending</span>}</h2><p className="hint">Staff can request appointment letters from Letters & Payslips. They can download only after approval.</p>{requests.length === 0 ? <div className="empty">No appointment letter requests yet.</div> : <div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>Requested</th><th>Status</th><th>Details</th><th>Action</th></tr></thead><tbody>{requests.map((request) => { const person = staff.find((row) => row.id === request.staff_id); const form = approvalForms[request.id] || emptyApproval; return <tr key={request.id}><td><strong>{person?.full_name || 'Staff Member'}</strong><br /><span className="muted">{person?.email || request.staff_id}</span></td><td>{prettyDate(request.requested_at)}</td><td><span className={`pill request-${request.status}`}>{request.status}</span></td><td>{request.status === 'pending' ? <div className="approval-form-grid"><label>Effective Date<input type="date" value={form.appointment_date} onChange={(e) => setApproval(request.id, { appointment_date: e.target.value })} /></label><label>Position<input value={form.position} onChange={(e) => setApproval(request.id, { position: e.target.value })} /></label><label>Monthly Salary<input type="number" value={form.monthly_salary} onChange={(e) => setApproval(request.id, { monthly_salary: e.target.value })} placeholder="1800" /></label><label>Admin Notes<textarea value={form.admin_notes} onChange={(e) => setApproval(request.id, { admin_notes: e.target.value })} /></label></div> : <div className="approval-summary"><span>Effective date: {request.appointment_date || '-'}</span><span>Position: {request.position || '-'}</span><span>Salary: {request.monthly_salary ? `GHS ${Number(request.monthly_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</span><span>Decision date: {prettyDate(request.decided_at)}</span>{request.admin_notes && <span>Notes: {request.admin_notes}</span>}</div>}</td><td>{request.status === 'pending' ? <div className="button-row"><button type="button" className="primary small-button" onClick={() => approveRequest(request)}>Approve</button><button type="button" className="danger small-button" onClick={() => rejectRequest(request)}>Reject</button></div> : <span className="muted">Completed</span>}</td></tr>; })}</tbody></table></div>}</div>
    <div className="grid two">
      <form className="panel form-grid" onSubmit={createSchool}><h2>Add School Location</h2><label>School Name<input value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} required /></label><label>Address<input value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} /></label><div className="grid two"><label>Latitude<input value={schoolForm.latitude} onChange={(e) => setSchoolForm({ ...schoolForm, latitude: e.target.value })} required /></label><label>Longitude<input value={schoolForm.longitude} onChange={(e) => setSchoolForm({ ...schoolForm, longitude: e.target.value })} required /></label></div><label>Allowed radius in meters<input type="number" value={schoolForm.radius_m} onChange={(e) => setSchoolForm({ ...schoolForm, radius_m: e.target.value })} /></label><button className="primary">Save School</button></form>
      <form className="panel form-grid" onSubmit={assignSchool}><h2>Assign Staff to School</h2><label>Staff<select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>School<select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><button className="primary">Assign School</button></form>
      <form className="panel form-grid" onSubmit={createPost}><h2>Post Company Update</h2><label>Title<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} required /></label><label>Priority<select value={postForm.priority} onChange={(e) => setPostForm({ ...postForm, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label>Message<textarea value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })} required /></label><button className="primary">Post Update</button></form>
      <form className="panel form-grid" onSubmit={createMeeting}><h2>Create Meeting</h2><label>Meeting Title<input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} required /></label><label>Room Name<input value={meetingForm.room_name} onChange={(e) => setMeetingForm({ ...meetingForm, room_name: e.target.value })} placeholder="leave blank to auto-generate" /></label><label>Scheduled At<input type="datetime-local" value={meetingForm.scheduled_at} onChange={(e) => setMeetingForm({ ...meetingForm, scheduled_at: e.target.value })} /></label><label>Description<textarea value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} /></label><button className="primary">Create Meeting</button></form>
      <form className="panel form-grid" onSubmit={createPayroll}><h2>Create Monthly Payslip Data</h2><label>Staff<select value={payrollForm.staff_id} onChange={(e) => setPayrollForm({ ...payrollForm, staff_id: e.target.value })}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Month<input type="date" value={payrollForm.month} onChange={(e) => setPayrollForm({ ...payrollForm, month: e.target.value })} required /></label><div className="grid two"><label>Basic Salary<input type="number" value={payrollForm.basic_salary} onChange={(e) => setPayrollForm({ ...payrollForm, basic_salary: e.target.value })} required /></label><label>Allowances<input type="number" value={payrollForm.allowances} onChange={(e) => setPayrollForm({ ...payrollForm, allowances: e.target.value })} /></label></div><label>Deductions<input type="number" value={payrollForm.deductions} onChange={(e) => setPayrollForm({ ...payrollForm, deductions: e.target.value })} /></label><label>Paid On<input type="date" value={payrollForm.paid_on} onChange={(e) => setPayrollForm({ ...payrollForm, paid_on: e.target.value })} /></label><button className="primary">Save Payslip Data</button></form>
      <form className="panel form-grid birthday-admin" onSubmit={createBirthdayPost}><h2>Generate Birthday E-Card</h2><label>Staff<select value={birthdayForm.staff_id} onChange={(e) => setBirthdayForm({ ...birthdayForm, staff_id: e.target.value })}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="grid two"><label>Name on Card<input value={birthdayForm.display_name} onChange={(e) => setBirthdayForm({ ...birthdayForm, display_name: e.target.value })} required /></label><label>Position / Role<input value={birthdayForm.position} onChange={(e) => setBirthdayForm({ ...birthdayForm, position: e.target.value })} /></label></div><label>Birthday Date<input type="date" value={birthdayForm.birthday_date} onChange={(e) => setBirthdayForm({ ...birthdayForm, birthday_date: e.target.value })} /></label>{!selectedBirthdayStaff?.photo_url && <p className="warning">This staff member has no profile photo yet. Ask the staff to upload one from My Details.</p>}<label>Birthday Message<textarea value={birthdayForm.message} onChange={(e) => setBirthdayForm({ ...birthdayForm, message: e.target.value })} required /></label><div className="button-row"><button className="primary" type="button" disabled={birthdayBusy} onClick={generateBirthdayPreview}>{birthdayBusy ? 'Working...' : 'Preview Card'}</button><button className="primary" disabled={birthdayBusy}>{birthdayBusy ? 'Posting...' : 'Post to Dashboard'}</button></div>{birthdayPreview && <div className="birthday-preview-card"><img src={birthdayPreview} alt="Generated birthday e-card preview" /><a className="download-link" href={birthdayPreview} download={`${safeName(birthdayForm.display_name)}-birthday-card.jpg`}>Download JPG</a></div>}</form>
    </div>
  </section>;
}
