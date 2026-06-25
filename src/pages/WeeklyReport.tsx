import { FormEvent, useEffect, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { useAuth } from '../lib/auth';
import { compressImage } from '../lib/images';
import { supabase } from '../lib/supabase';
import { School } from '../types';

const classOptions = ['KG 1','KG 2','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JHS 1','JHS 2','JHS 3'];

export function WeeklyReport() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const [weekEnding, setWeekEnding] = useState('');
  const [topicsCovered, setTopicsCovered] = useState('');
  const [challengesObserved, setChallengesObserved] = useState('');
  const [notableObservations, setNotableObservations] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [comments, setComments] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [activity, setActivity] = useState({ school_id: '', week_ending: '', title: '', details: '' });
  const [activityFiles, setActivityFiles] = useState<File[]>([]);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);

  async function loadData() {
    if (!profile) return;
    const { data: assigned } = await supabase.from('staff_school_assignments').select('schools(*)').eq('staff_id', profile.id);
    const schoolList = (assigned || []).map((row: any) => row.schools).filter(Boolean) as School[];
    setSchools(schoolList);
    if (!schoolId && schoolList[0]) setSchoolId(schoolList[0].id);
    if (!activity.school_id && schoolList[0]) setActivity((prev) => ({ ...prev, school_id: schoolList[0].id }));
    const { data } = await supabase.from('weekly_reports').select('*, schools(name)').eq('staff_id', profile.id).order('submitted_at', { ascending: false }).limit(10);
    setReports(data || []);
  }
  useEffect(() => { loadData(); }, [profile?.id]);
  function toggleClass(className: string) { setClasses((prev) => prev.includes(className) ? prev.filter((item) => item !== className) : [...prev, className]); }

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!profile) return; setBusy(true); setMessage('');
    const { error } = await supabase.from('weekly_reports').insert({ staff_id: profile.id, school_id: schoolId, week_ending: weekEnding, classes_taught: classes, topics_covered: topicsCovered, challenges_observed: challengesObserved, notable_observations: notableObservations, recommendations, comments });
    setBusy(false);
    if (error) { setType('error'); setMessage(error.message); return; }
    setType('success'); setMessage('Weekly report submitted successfully.');
    setClasses([]); setWeekEnding(''); setTopicsCovered(''); setChallengesObserved(''); setNotableObservations(''); setRecommendations(''); setComments('');
    await loadData();
  }

  async function submitActivity(event: FormEvent) {
    event.preventDefault(); if (!profile) return; setActivityBusy(true); setMessage('');
    try {
      const photoUrls: string[] = [];
      const files = activityFiles.slice(0, 2);
      for (const file of files) {
        const compressed = await compressImage(file, 1200, 0.78);
        const path = `${profile.id}/${Date.now()}-${compressed.name.replace(/[^a-z0-9.]+/gi, '-')}`;
        const { error } = await supabase.storage.from('activity-photos').upload(path, compressed, { contentType: 'image/jpeg' });
        if (error) throw error;
        const { data } = supabase.storage.from('activity-photos').getPublicUrl(path);
        photoUrls.push(data.publicUrl);
      }
      const { error } = await supabase.from('special_class_activities').insert({ staff_id: profile.id, school_id: activity.school_id, week_ending: activity.week_ending, title: activity.title, details: activity.details, photo_urls: photoUrls });
      if (error) throw error;
      await supabase.from('company_posts').insert({ author_id: profile.id, title: `Special Class Activity: ${activity.title}`, body: activity.details, priority: 'important', post_type: 'update', image_url: photoUrls[0] || null, image_path: null });
      setType('success'); setMessage('Special class activity submitted and posted to the dashboard.'); setActivity({ school_id: schoolId, week_ending: '', title: '', details: '' }); setActivityFiles([]);
    } catch (error: any) { setType('error'); setMessage(error.message || 'Special activity could not be submitted.'); }
    finally { setActivityBusy(false); }
  }

  return (
    <section>
      <div className="page-header"><div><h1>Weekly Work Report</h1><p>Submit school-specific teaching activity for the week.</p></div></div>
      <StatusMessage message={message} type={type} />
      <form className="panel form-grid" onSubmit={submit}>
        <div className="grid two"><label>School<select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><label>Week Ending<input type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} required /></label></div>
        <label>Classes taught this week</label><div className="chips">{classOptions.map((item) => <button type="button" key={item} className={classes.includes(item) ? 'chip selected' : 'chip'} onClick={() => toggleClass(item)}>{item}</button>)}</div>
        <label>Topics covered<textarea value={topicsCovered} onChange={(e) => setTopicsCovered(e.target.value)} required /></label><label>Challenges observed<textarea value={challengesObserved} onChange={(e) => setChallengesObserved(e.target.value)} /></label><label>Notable observations<textarea value={notableObservations} onChange={(e) => setNotableObservations(e.target.value)} /></label><label>Recommendations<textarea value={recommendations} onChange={(e) => setRecommendations(e.target.value)} /></label><label>Comments<textarea value={comments} onChange={(e) => setComments(e.target.value)} /></label>
        <button className="primary" disabled={busy || schools.length === 0}>{busy ? 'Submitting...' : 'Submit weekly report'}</button>
      </form>
      <form className="panel form-grid" onSubmit={submitActivity}>
        <h2>Special Class Activity</h2><p className="hint">Use this when you organise a special class activity for the week. You can upload one or two pictures; they are reduced before upload.</p>
        <div className="grid two"><label>School<select value={activity.school_id} onChange={(e) => setActivity({ ...activity, school_id: e.target.value })} required>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><label>Week Ending<input type="date" value={activity.week_ending} onChange={(e) => setActivity({ ...activity, week_ending: e.target.value })} required /></label></div>
        <label>Activity Title<input value={activity.title} onChange={(e) => setActivity({ ...activity, title: e.target.value })} required /></label><label>Activity Details<textarea value={activity.details} onChange={(e) => setActivity({ ...activity, details: e.target.value })} required /></label><label>Upload one or two pictures<input type="file" accept="image/*" multiple onChange={(e) => setActivityFiles(Array.from(e.target.files || []).slice(0, 2))} /></label>
        <button className="primary" disabled={activityBusy || schools.length === 0}>{activityBusy ? 'Submitting activity...' : 'Post Special Activity'}</button>
      </form>
      <h2>Recent Reports</h2><div className="table-card"><table><thead><tr><th>Week Ending</th><th>School</th><th>Classes</th><th>Submitted</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.week_ending}</td><td>{report.schools?.name}</td><td>{(report.classes_taught || []).join(', ')}</td><td>{new Date(report.submitted_at).toLocaleString()}</td></tr>)}</tbody></table></div>
    </section>
  );
}
