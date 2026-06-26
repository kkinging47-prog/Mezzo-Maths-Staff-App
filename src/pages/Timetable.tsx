import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { makeTimetablePdf } from '../lib/timetablePdf';
import { AttendanceRecord, Profile, School } from '../types';

const classOptions = ['KG 1','KG 2','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JHS 1','JHS 2','JHS 3'];
const dayOptions = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const termOptions = ['Term 1','Term 2','Term 3'];
const durationOptions = [30, 40, 45, 50, 60];
function isSupervisor(profile?: Profile | null) { const position = (profile?.position || '').toLowerCase(); return profile?.role === 'admin' || position.includes('supervisor'); }

export function Timetable() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [tutors, setTutors] = useState<Profile[]>([]);
  const [selectedTutor, setSelectedTutor] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ school_id: '', school_name: '', location: '', class_name: 'Primary 1', day_of_week: 'Monday', start_time: '08:00', duration_minutes: '40', academic_year: '2026/2027', term: 'Term 1' });
  const supervisor = useMemo(() => isSupervisor(profile), [profile]);

  async function loadBase() {
    if (!profile) return;
    const { data: settings } = await supabase.from('company_settings').select('key,value').in('key', ['current_academic_year','current_term']);
    const cfg = Object.fromEntries((settings || []).map((row: any) => [row.key, row.value]));
    setForm((prev) => ({ ...prev, academic_year: cfg.current_academic_year || prev.academic_year, term: cfg.current_term || prev.term }));
    const schoolQuery = supervisor ? supabase.from('schools').select('*').order('name') : supabase.from('staff_school_assignments').select('schools(*)').eq('staff_id', profile.id);
    const { data: schoolData } = await schoolQuery;
    const schoolList = supervisor ? (schoolData || []) as School[] : (schoolData || []).map((row: any) => row.schools).filter(Boolean) as School[];
    setSchools(schoolList);
    if (!form.school_id && schoolList[0]) setForm((prev) => ({ ...prev, school_id: schoolList[0].id, school_name: schoolList[0].name, location: schoolList[0].address || '' }));
    if (supervisor) {
      const { data } = await supabase.from('profiles').select('id, full_name, email, position, department, status, role').neq('status', 'left').order('full_name');
      const list = (data || []) as Profile[];
      setTutors(list.filter((person) => !String(person.position || '').toLowerCase().includes('supervisor')));
      if (!selectedTutor && list[0]) setSelectedTutor(list[0].id);
    }
  }

  async function loadTutorData(tutorId = supervisor ? selectedTutor : profile?.id) {
    if (!tutorId) return;
    const [{ data: tableData }, { data: attData }, { data: activityData }] = await Promise.all([
      supabase.from('staff_timetables').select('*, schools(name,address)').eq('staff_id', tutorId).eq('academic_year', form.academic_year).eq('term', form.term).order('day_order').order('start_time'),
      supabase.from('attendance').select('*, schools(*)').eq('staff_id', tutorId).order('work_date', { ascending: false }).limit(20),
      supabase.from('special_class_activities').select('*, schools(name)').eq('staff_id', tutorId).order('created_at', { ascending: false }).limit(20),
    ]);
    setEntries(tableData || []);
    setAttendance((attData || []) as AttendanceRecord[]);
    setActivities(activityData || []);
  }

  useEffect(() => { loadBase(); }, [profile?.id, supervisor]);
  useEffect(() => { loadTutorData(); }, [profile?.id, selectedTutor, supervisor, form.academic_year, form.term]);
  function selectSchool(id: string) { const school = schools.find((row) => row.id === id); setForm((prev) => ({ ...prev, school_id: id, school_name: school?.name || prev.school_name, location: school?.address || prev.location })); }
  function dayOrder(day: string) { return dayOptions.indexOf(day) + 1; }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!profile || supervisor) return; setMessage('');
    const { error } = await supabase.from('staff_timetables').insert({ staff_id: profile.id, school_id: form.school_id || null, school_name: form.school_name, location: form.location, class_name: form.class_name, day_of_week: form.day_of_week, day_order: dayOrder(form.day_of_week), start_time: form.start_time, duration_minutes: Number(form.duration_minutes), academic_year: form.academic_year, term: form.term });
    if (error) setMessage(error.message); else { setMessage('Timetable entry saved.'); await loadTutorData(profile.id); }
  }
  async function removeEntry(id: string) { const { error } = await supabase.from('staff_timetables').delete().eq('id', id); if (error) setMessage(error.message); else loadTutorData(); }
  const selectedTutorName = tutors.find((item) => item.id === selectedTutor)?.full_name || profile?.full_name || 'Staff';

  return <section>
    <div className="page-header"><div><h1>School Timetable</h1><p>Term-based tutor class schedules for the academic year.</p></div><button className="primary" onClick={() => makeTimetablePdf(entries, selectedTutorName, form.academic_year, form.term)}>Download PDF</button></div>
    {message && <div className="status info">{message}</div>}
    <div className="grid two">
      {!supervisor && <form className="panel form-grid" onSubmit={submit}><h2>Enter My Timetable</h2><div className="grid two"><label>Academic Year<input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></label><label>Term<select value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>{termOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><label>School<select value={form.school_id} onChange={(e) => selectSchool(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><label>School Name<input value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} required /></label><label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required /></label><div className="grid two"><label>Class<select value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })}>{classOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Day<select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>{dayOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><div className="grid two"><label>Start Time<input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required /></label><label>Duration<select value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}>{durationOptions.map((item) => <option key={item} value={item}>{item} mins</option>)}</select></label></div><button className="primary">Save Timetable Entry</button></form>}
      {supervisor && <div className="panel form-grid"><h2>Supervisor Timetable View</h2><div className="grid two"><label>Academic Year<input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} /></label><label>Term<select value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>{termOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><label>Select Tutor<select value={selectedTutor} onChange={(e) => setSelectedTutor(e.target.value)}>{tutors.map((tutor) => <option key={tutor.id} value={tutor.id}>{tutor.full_name || tutor.email}</option>)}</select></label><p className="hint">Shows selected tutor timetable, school location, attendance and activities. Supervisors are not required to enter their own timetable.</p></div>}
    </div>
    <h2>{supervisor ? 'Selected Tutor Timetable' : 'My Timetable'}</h2><div className="timetable-grid">{entries.length === 0 && <div className="empty">No timetable entries found.</div>}{entries.map((row) => <div className="timetable-card" key={row.id}><strong>{row.day_of_week} · {row.start_time?.slice(0,5)} · {row.duration_minutes} mins</strong><p>{row.class_name} at {row.school_name || row.schools?.name}</p><p className="muted">{row.academic_year || form.academic_year} · {row.term || form.term} · Location: {row.location || row.schools?.address || '-'}</p>{row.staff_id === profile?.id && !supervisor && <button className="danger small-button" onClick={() => removeEntry(row.id)}>Delete</button>}</div>)}</div>
    {supervisor && <div className="grid two"><div className="panel"><h2>Attendance Data</h2><div className="table-card compact-table"><table><thead><tr><th>Date</th><th>School</th><th>Check In</th><th>Status</th></tr></thead><tbody>{attendance.map((row) => <tr key={row.id}><td>{row.work_date}</td><td>{row.schools?.name || '-'}</td><td>{row.check_in_at ? new Date(row.check_in_at).toLocaleTimeString() : '-'}</td><td><span className="pill">{row.status}</span></td></tr>)}</tbody></table></div></div><div className="panel"><h2>Special Activities</h2>{activities.length === 0 ? <div className="empty">No special activities found.</div> : activities.map((activity) => <div className="summary-card" key={activity.id}><h3>{activity.title}</h3><p>{activity.details}</p><p className="muted">{activity.schools?.name} · Week ending {activity.week_ending}</p>{(activity.photo_urls || []).map((url: string) => <img className="selfie-preview" key={url} src={url} alt={activity.title} />)}</div>)}</div></div>}
  </section>;
}
