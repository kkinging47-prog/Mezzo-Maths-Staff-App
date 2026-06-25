import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';

export function AdminSettings() {
  const { profile } = useAuth();
  const [salaryDate, setSalaryDate] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  async function load() {
    const [{ data: setting }, { data: postData }, { data: activityData }] = await Promise.all([
      supabase.from('company_settings').select('value').eq('key', 'salary_pay_date').maybeSingle(),
      supabase.from('company_posts').select('*').is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('special_class_activities').select('*, schools(name), profiles(full_name,email)').order('created_at', { ascending: false }),
    ]);
    setSalaryDate(setting?.value || ''); setPosts(postData || []); setActivities(activityData || []);
  }
  useEffect(() => { load(); }, []);
  async function saveSalaryDate(event: FormEvent) { event.preventDefault(); if (!profile) return; const { error } = await supabase.from('company_settings').upsert({ key: 'salary_pay_date', value: salaryDate, updated_by: profile.id, updated_at: new Date().toISOString() }); if (error) setMessage(error.message); else { await supabase.from('company_posts').insert({ author_id: profile.id, title: 'Salary Payment Date', body: `Salaries are scheduled to be paid on ${new Date(salaryDate).toLocaleDateString()}.`, priority: 'important', post_type: 'update' }); setMessage('Salary pay date saved and posted to dashboard.'); load(); } }
  async function archivePost(id: string) { const { error } = await supabase.from('company_posts').update({ archived_at: new Date().toISOString() }).eq('id', id); if (error) setMessage(error.message); else { setMessage('Dashboard update archived.'); load(); } }
  function exportImages() { const rows: any[] = []; posts.forEach((p) => { if (p.image_url) rows.push({ source: 'dashboard_post', title: p.title, image_url: p.image_url, created_at: p.created_at }); }); activities.forEach((a) => (a.photo_urls || []).forEach((url: string, i: number) => rows.push({ source: 'special_activity', title: a.title, school: a.schools?.name, staff: a.profiles?.full_name || a.profiles?.email, image_url: url, photo_number: i + 1, created_at: a.created_at }))); downloadCsv('staff-portal-image-manifest.csv', rows); }
  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;
  return <section><div className="page-header"><div><h1>Admin Settings</h1><p>Salary date, dashboard archives and image export manifest.</p></div><button className="primary" onClick={exportImages}>Export Image Manifest CSV</button></div>{message && <div className="status info">{message}</div>}<form className="panel form-grid" onSubmit={saveSalaryDate}><h2>Salary Payment Date</h2><label>Payment Date<input type="date" value={salaryDate} onChange={(e) => setSalaryDate(e.target.value)} required /></label><button className="primary">Save and Notify Staff</button></form><div className="panel"><h2>Archive Dashboard Updates</h2><p className="hint">Dashboard posts remain visible until archived here.</p><div className="table-card compact-table"><table><thead><tr><th>Title</th><th>Priority</th><th>Posted</th><th>Action</th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td>{post.title}</td><td>{post.priority}</td><td>{new Date(post.created_at).toLocaleString()}</td><td><button className="danger small-button" onClick={() => archivePost(post.id)}>Archive</button></td></tr>)}</tbody></table></div></div></section>;
}
