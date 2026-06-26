import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile, School } from '../types';

const yesNo = ['Yes', 'No'];
const satOptions = ['Satisfactory', 'Needs Improvement'];
const visitTypes = ['Scheduled', 'Unscheduled'];
const complianceOptions = ['Fully', 'Partially', 'Not At All'];
const overallOptions = ['Excellent', 'Very Good', 'Good', 'Fair', 'Needs Significant Improvement'];
const ratingOptions = [1, 2, 3, 4, 5];
const classOptions = ['KG 1','KG 2','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JHS 1','JHS 2','JHS 3'];

function isSupervisor(profile?: Profile | null) {
  return profile?.role === 'admin' || String(profile?.position || '').toLowerCase().includes('supervisor');
}

const defaultChecklist = {
  curriculum_followed: false,
  concepts_clear: false,
  objectives_communicated: false,
  methodology_applied: false,
  teaching_aids_used: false,
  correct_terminologies: false,
  students_engaged: false,
  questioning_encouraged: false,
  discipline_maintained: false,
  smooth_transitions: false,
  time_managed: false,
  clear_instructions: false,
  good_pacing: false,
  voice_projection: false,
  patience_confidence: false,
  practical_examples: false,
  checked_understanding: false,
  corrected_errors: false,
  assigned_exercises: false,
  prompt_feedback: false,
};

export function SupervisorReport() {
  const { profile } = useAuth();
  const allowed = useMemo(() => isSupervisor(profile), [profile]);
  const [schools, setSchools] = useState<School[]>([]);
  const [tutors, setTutors] = useState<Profile[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<any[]>([]);
  const [supervisorReports, setSupervisorReports] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>(defaultChecklist);
  const [form, setForm] = useState({
    school_id: '',
    location: '',
    staff_id: '',
    class_observed: 'Primary 1',
    lesson_topic: '',
    visit_date: new Date().toISOString().slice(0, 10),
    visit_type: 'Scheduled',
    arrival_time: '',
    class_start_time: '',
    lesson_plan_available: 'Yes',
    teaching_materials_ready: 'Yes',
    teacher_conduct: 'Satisfactory',
    classroom_prepared: 'Yes',
    student_understanding: '3',
    student_engagement: '3',
    solving_accuracy: '3',
    confidence_answers: '3',
    participation_level: '3',
    strengths: '',
    improvement_areas: '',
    feedback_given: '',
    teacher_response: '',
    action_points: '',
    improvement_timeline: '',
    textbooks_available: false,
    lesson_notes_available: false,
    workbooks_available: false,
    teaching_aids_available: false,
    attendance_checked: 'Yes',
    exercise_books_checked: 'Yes',
    register_updated: 'Yes',
    policy_compliance: 'Fully',
    overall_rating: 'Good',
    recommendations: '',
  });

  async function load() {
    if (!profile || !allowed) return;
    const [{ data: schoolData }, { data: tutorData }, { data: weeklyData }, { data: supervisorData }] = await Promise.all([
      supabase.from('schools').select('*').order('name'),
      supabase.from('profiles').select('id, full_name, email, position, department, status').neq('status', 'left').order('full_name'),
      supabase.from('weekly_reports').select('*, schools(name), profiles(full_name,email)').order('submitted_at', { ascending: false }).limit(150),
      supabase.from('supervisor_reports').select('*, schools(name), profiles:staff_id(full_name,email)').order('created_at', { ascending: false }).limit(100),
    ]);
    const schoolRows = (schoolData || []) as School[];
    const tutorRows = ((tutorData || []) as Profile[]).filter((person) => !String(person.position || '').toLowerCase().includes('supervisor'));
    setSchools(schoolRows);
    setTutors(tutorRows);
    setWeeklyReports(weeklyData || []);
    setSupervisorReports(supervisorData || []);
    if (!form.school_id && schoolRows[0]) setForm((prev) => ({ ...prev, school_id: schoolRows[0].id, location: schoolRows[0].address || '' }));
    if (!form.staff_id && tutorRows[0]) setForm((prev) => ({ ...prev, staff_id: tutorRows[0].id }));
  }

  useEffect(() => { load(); }, [profile?.id, allowed]);
  function selectSchool(id: string) { const school = schools.find((row) => row.id === id); setForm((prev) => ({ ...prev, school_id: id, location: school?.address || prev.location })); }
  function toggle(key: string) { setChecklist((prev) => ({ ...prev, [key]: !prev[key] })); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile || !allowed) return;
    const { error } = await supabase.from('supervisor_reports').insert({
      supervisor_id: profile.id,
      school_id: form.school_id,
      staff_id: form.staff_id,
      visit_date: form.visit_date,
      location: form.location,
      class_observed: form.class_observed,
      lesson_topic: form.lesson_topic,
      visit_type: form.visit_type,
      arrival_time: form.arrival_time || null,
      class_start_time: form.class_start_time || null,
      lesson_plan_available: form.lesson_plan_available === 'Yes',
      teaching_materials_ready: form.teaching_materials_ready === 'Yes',
      teacher_conduct: form.teacher_conduct,
      classroom_prepared: form.classroom_prepared === 'Yes',
      checklist,
      student_understanding: Number(form.student_understanding),
      student_engagement: Number(form.student_engagement),
      solving_accuracy: Number(form.solving_accuracy),
      confidence_answers: Number(form.confidence_answers),
      participation_level: Number(form.participation_level),
      strengths: form.strengths,
      improvement_areas: form.improvement_areas,
      feedback_given: form.feedback_given,
      teacher_response: form.teacher_response,
      action_points: form.action_points,
      improvement_timeline: form.improvement_timeline,
      logistics: {
        textbooks_available: form.textbooks_available,
        lesson_notes_available: form.lesson_notes_available,
        workbooks_available: form.workbooks_available,
        teaching_aids_available: form.teaching_aids_available,
        attendance_checked: form.attendance_checked,
        exercise_books_checked: form.exercise_books_checked,
        register_updated: form.register_updated,
      },
      policy_compliance: form.policy_compliance,
      overall_rating: form.overall_rating,
      recommendations: form.recommendations,
    });
    if (error) setMessage(error.message); else { setMessage('Supervisor checklist report saved.'); load(); }
  }

  function exportWeeklyReports() {
    downloadCsv('tutor-weekly-reports.csv', weeklyReports.map((r) => ({ school: r.schools?.name, tutor: r.profiles?.full_name || r.profiles?.email, week_ending: r.week_ending, classes: (r.classes_taught || []).join('; '), topics: r.topics_covered, challenges: r.challenges_observed, observations: r.notable_observations, recommendations: r.recommendations, comments: r.comments })));
  }

  if (!allowed) return <section><div className="page-header"><div><h1>Supervisor Report</h1><p>This page is for supervisors and admins only.</p></div></div><div className="empty">You do not have supervisor access.</div></section>;

  return <section><div className="page-header"><div><h1>Supervisor Report</h1><p>Complete the Mezzo Maths supervisory checklist and review tutor reports.</p></div><button className="primary" onClick={exportWeeklyReports}>Download Tutor Reports CSV</button></div>{message && <div className="status info">{message}</div>}<form className="panel form-grid" onSubmit={submit}><h2>Visit Details</h2><div className="grid two"><label>School<select value={form.school_id} onChange={(e) => selectSchool(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label><label>Staff Being Supervised<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{tutors.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label><label>Date of Visit<input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></label><label>Class Observed<select value={form.class_observed} onChange={(e) => setForm({ ...form, class_observed: e.target.value })}>{classOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Lesson Topic<input value={form.lesson_topic} onChange={(e) => setForm({ ...form, lesson_topic: e.target.value })} /></label></div><h2>Pre-Observation Details</h2><div className="grid two"><label>Visit Type<select value={form.visit_type} onChange={(e) => setForm({ ...form, visit_type: e.target.value })}>{visitTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Time of Arrival<input type="time" value={form.arrival_time} onChange={(e) => setForm({ ...form, arrival_time: e.target.value })} /></label><label>Class Start Time<input type="time" value={form.class_start_time} onChange={(e) => setForm({ ...form, class_start_time: e.target.value })} /></label><label>Lesson Plan Available<select value={form.lesson_plan_available} onChange={(e) => setForm({ ...form, lesson_plan_available: e.target.value })}>{yesNo.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Teaching Materials Ready<select value={form.teaching_materials_ready} onChange={(e) => setForm({ ...form, teaching_materials_ready: e.target.value })}>{yesNo.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Teacher Appearance & Conduct<select value={form.teacher_conduct} onChange={(e) => setForm({ ...form, teacher_conduct: e.target.value })}>{satOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Classroom Prepared<select value={form.classroom_prepared} onChange={(e) => setForm({ ...form, classroom_prepared: e.target.value })}>{yesNo.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><h2>Classroom Observation Checklist</h2><div className="chips">{Object.keys(checklist).map((key) => <button key={key} type="button" className={checklist[key] ? 'chip selected' : 'chip'} onClick={() => toggle(key)}>{key.replace(/_/g, ' ')}</button>)}</div><h2>Student Performance Indicators</h2><div className="grid two">{['student_understanding','student_engagement','solving_accuracy','confidence_answers','participation_level'].map((key) => <label key={key}>{key.replace(/_/g, ' ')}<select value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value } as any)}>{ratingOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>)}</div><h2>Teacher Performance Summary</h2><label>Strengths Observed<textarea value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} /></label><label>Areas Needing Improvement<textarea value={form.improvement_areas} onChange={(e) => setForm({ ...form, improvement_areas: e.target.value })} /></label><h2>Post-Observation Discussion</h2><label>Feedback Given to Teacher<textarea value={form.feedback_given} onChange={(e) => setForm({ ...form, feedback_given: e.target.value })} /></label><label>Teacher Response<textarea value={form.teacher_response} onChange={(e) => setForm({ ...form, teacher_response: e.target.value })} /></label><label>Agreed Action Points<textarea value={form.action_points} onChange={(e) => setForm({ ...form, action_points: e.target.value })} /></label><label>Timeline for Improvement<input value={form.improvement_timeline} onChange={(e) => setForm({ ...form, improvement_timeline: e.target.value })} /></label><h2>Logistics & Compliance</h2><div className="chips">{['textbooks_available','lesson_notes_available','workbooks_available','teaching_aids_available'].map((key) => <button type="button" className={(form as any)[key] ? 'chip selected' : 'chip'} key={key} onClick={() => setForm({ ...form, [key]: !(form as any)[key] } as any)}>{key.replace(/_/g, ' ')}</button>)}</div><div className="grid two"><label>Attendance Record Checked<select value={form.attendance_checked} onChange={(e) => setForm({ ...form, attendance_checked: e.target.value })}>{yesNo.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Exercise Books Checked<select value={form.exercise_books_checked} onChange={(e) => setForm({ ...form, exercise_books_checked: e.target.value })}>{yesNo.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Class Register Updated<select value={form.register_updated} onChange={(e) => setForm({ ...form, register_updated: e.target.value })}>{yesNo.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Compliance with Mezzo Policies<select value={form.policy_compliance} onChange={(e) => setForm({ ...form, policy_compliance: e.target.value })}>{complianceOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Overall Rating<select value={form.overall_rating} onChange={(e) => setForm({ ...form, overall_rating: e.target.value })}>{overallOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div><label>Supervisor Comments & Recommendations<textarea value={form.recommendations} onChange={(e) => setForm({ ...form, recommendations: e.target.value })} /></label><button className="primary">Submit Supervisor Checklist</button></form><h2>All Tutor Weekly Reports</h2><div className="table-card"><table><thead><tr><th>Week Ending</th><th>School</th><th>Tutor</th><th>Classes</th><th>Topics</th></tr></thead><tbody>{weeklyReports.map((report) => <tr key={report.id}><td>{report.week_ending}</td><td>{report.schools?.name}</td><td>{report.profiles?.full_name || report.profiles?.email}</td><td>{(report.classes_taught || []).join(', ')}</td><td>{report.topics_covered}</td></tr>)}</tbody></table></div><h2>Recent Supervisor Checklist Reports</h2><div className="table-card"><table><thead><tr><th>Date</th><th>School</th><th>Tutor</th><th>Class</th><th>Rating</th></tr></thead><tbody>{supervisorReports.map((report) => <tr key={report.id}><td>{report.visit_date}</td><td>{report.schools?.name}</td><td>{report.profiles?.full_name || report.profiles?.email}</td><td>{report.class_observed}</td><td>{report.overall_rating}</td></tr>)}</tbody></table></div></section>;
}
