import { FormEvent, useEffect, useMemo, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Profile, School } from '../types';

export function Admin() {
  const { profile } = useAuth();
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [staff, setStaff] = useState<Profile[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

  const [schoolForm, setSchoolForm] = useState({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' });
  const [postForm, setPostForm] = useState({ title: '', body: '', priority: 'normal' });
  const [meetingForm, setMeetingForm] = useState({ title: '', room_name: '', scheduled_at: '', description: '' });
  const [payrollForm, setPayrollForm] = useState({ staff_id: '', month: '', basic_salary: '', allowances: '0', deductions: '0', paid_on: '' });

  const staffOptions = useMemo(() => staff.map((row) => ({ value: row.id, label: row.full_name || row.email || row.id })), [staff]);

  async function loadData() {
    const [{ data: profileData }, { data: schoolData }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('schools').select('*').order('name'),
    ]);
    setStaff((profileData || []) as Profile[]);
    setSchools((schoolData || []) as School[]);
    if (!selectedStaffId && profileData?.[0]) setSelectedStaffId(profileData[0].id);
    if (!selectedSchoolId && schoolData?.[0]) setSelectedSchoolId(schoolData[0].id);
    if (!payrollForm.staff_id && profileData?.[0]) setPayrollForm((prev) => ({ ...prev, staff_id: profileData[0].id }));
  }

  useEffect(() => { loadData(); }, []);

  function ok(text: string) { setType('success'); setMessage(text); }
  function fail(error: any) { setType('error'); setMessage(error.message || 'Action failed.'); }

  async function createSchool(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from('schools').insert({
      name: schoolForm.name,
      address: schoolForm.address,
      latitude: Number(schoolForm.latitude),
      longitude: Number(schoolForm.longitude),
      radius_m: Number(schoolForm.radius_m || 100),
    });
    if (error) fail(error); else { ok('School created successfully.'); setSchoolForm({ name: '', address: '', latitude: '', longitude: '', radius_m: '100' }); loadData(); }
  }

  async function assignSchool(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const { error } = await supabase.from('staff_school_assignments').upsert({ staff_id: selectedStaffId, school_id: selectedSchoolId, assigned_by: profile.id });
    if (error) fail(error); else ok('School assigned to staff successfully.');
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const { error } = await supabase.from('company_posts').insert({ ...postForm, author_id: profile.id });
    if (error) fail(error); else { ok('Company update posted successfully.'); setPostForm({ title: '', body: '', priority: 'normal' }); }
  }

  async function createMeeting(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const cleanRoom = meetingForm.room_name || `mezzo-${Date.now()}`;
    const { error } = await supabase.from('meetings').insert({ ...meetingForm, room_name: cleanRoom.replace(/\s+/g, '-'), created_by: profile.id, scheduled_at: meetingForm.scheduled_at || null });
    if (error) fail(error); else { ok('Meeting created successfully.'); setMeetingForm({ title: '', room_name: '', scheduled_at: '', description: '' }); }
  }

  async function createPayroll(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from('payrolls').insert({
      staff_id: payrollForm.staff_id,
      month: payrollForm.month,
      basic_salary: Number(payrollForm.basic_salary || 0),
      allowances: Number(payrollForm.allowances || 0),
      deductions: Number(payrollForm.deductions || 0),
      paid_on: payrollForm.paid_on || null,
    });
    if (error) fail(error); else { ok('Payslip record created.'); setPayrollForm((prev) => ({ ...prev, month: '', basic_salary: '', allowances: '0', deductions: '0', paid_on: '' })); }
  }

  return (
    <section>
      <div className="page-header"><div><h1>Admin Control</h1><p>Manage schools, assignments, updates, meetings and payslips.</p></div></div>
      <StatusMessage message={message} type={type} />
      <div className="grid two">
        <form className="panel form-grid" onSubmit={createSchool}>
          <h2>Add School Location</h2>
          <label>School Name<input value={schoolForm.name} onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })} required /></label>
          <label>Address<input value={schoolForm.address} onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })} /></label>
          <div className="grid two"><label>Latitude<input value={schoolForm.latitude} onChange={(e) => setSchoolForm({ ...schoolForm, latitude: e.target.value })} required /></label><label>Longitude<input value={schoolForm.longitude} onChange={(e) => setSchoolForm({ ...schoolForm, longitude: e.target.value })} required /></label></div>
          <label>Allowed radius in meters<input type="number" value={schoolForm.radius_m} onChange={(e) => setSchoolForm({ ...schoolForm, radius_m: e.target.value })} /></label>
          <button className="primary">Save School</button>
        </form>
        <form className="panel form-grid" onSubmit={assignSchool}>
          <h2>Assign Staff to School</h2>
          <label>Staff<select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>School<select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
          <button className="primary">Assign School</button>
        </form>
        <form className="panel form-grid" onSubmit={createPost}>
          <h2>Post Company Update</h2>
          <label>Title<input value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} required /></label>
          <label>Priority<select value={postForm.priority} onChange={(e) => setPostForm({ ...postForm, priority: e.target.value })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label>
          <label>Message<textarea value={postForm.body} onChange={(e) => setPostForm({ ...postForm, body: e.target.value })} required /></label>
          <button className="primary">Post Update</button>
        </form>
        <form className="panel form-grid" onSubmit={createMeeting}>
          <h2>Create Meeting</h2>
          <label>Meeting Title<input value={meetingForm.title} onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })} required /></label>
          <label>Room Name<input value={meetingForm.room_name} onChange={(e) => setMeetingForm({ ...meetingForm, room_name: e.target.value })} placeholder="leave blank to auto-generate" /></label>
          <label>Scheduled At<input type="datetime-local" value={meetingForm.scheduled_at} onChange={(e) => setMeetingForm({ ...meetingForm, scheduled_at: e.target.value })} /></label>
          <label>Description<textarea value={meetingForm.description} onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })} /></label>
          <button className="primary">Create Meeting</button>
        </form>
        <form className="panel form-grid" onSubmit={createPayroll}>
          <h2>Create Monthly Payslip Data</h2>
          <label>Staff<select value={payrollForm.staff_id} onChange={(e) => setPayrollForm({ ...payrollForm, staff_id: e.target.value })}>{staffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Month<input type="date" value={payrollForm.month} onChange={(e) => setPayrollForm({ ...payrollForm, month: e.target.value })} required /></label>
          <div className="grid two"><label>Basic Salary<input type="number" value={payrollForm.basic_salary} onChange={(e) => setPayrollForm({ ...payrollForm, basic_salary: e.target.value })} required /></label><label>Allowances<input type="number" value={payrollForm.allowances} onChange={(e) => setPayrollForm({ ...payrollForm, allowances: e.target.value })} /></label></div>
          <label>Deductions<input type="number" value={payrollForm.deductions} onChange={(e) => setPayrollForm({ ...payrollForm, deductions: e.target.value })} /></label>
          <label>Paid On<input type="date" value={payrollForm.paid_on} onChange={(e) => setPayrollForm({ ...payrollForm, paid_on: e.target.value })} /></label>
          <button className="primary">Save Payslip Data</button>
        </form>
      </div>
    </section>
  );
}
