import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Comment, CompanyPost, Profile } from '../types';
import { StatusMessage } from '../components/StatusMessage';
import { QuickAttendance } from '../components/QuickAttendance';
import { TopUsers } from '../components/TopUsers';

interface ScoreRow { staff_id: string; name: string; present: number; absent: number; score: number; }
function initials(name?: string | null, email?: string | null) { const source = name || email || 'Staff'; return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'; }

export function Dashboard() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<CompanyPost[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [scoreboard, setScoreboard] = useState<ScoreRow[]>([]);
  const [salaryDate, setSalaryDate] = useState('');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [term, setTerm] = useState('Term 1');
  const [message, setMessage] = useState('');
  async function loadPosts() { const { data, error } = await supabase.from('company_posts').select('*, profiles(full_name,email)').is('archived_at', null).order('created_at', { ascending: false }).limit(50); if (error) setMessage(error.message); else setPosts((data || []) as CompanyPost[]); }
  async function loadComments(postIds: string[]) { if (!postIds.length) return; const { data } = await supabase.from('post_comments').select('*, profiles(full_name,email)').in('post_id', postIds).order('created_at', { ascending: true }); const grouped: Record<string, Comment[]> = {}; (data || []).forEach((comment: any) => { grouped[comment.post_id] ||= []; grouped[comment.post_id].push(comment as Comment); }); setComments(grouped); }
  async function loadScoreboard() { const since = new Date(); since.setDate(since.getDate() - 6); const date = since.toISOString().slice(0, 10); const [{ data: profiles }, { data: attendance }] = await Promise.all([supabase.from('profiles').select('id, full_name, email, status').neq('status', 'left'), supabase.from('attendance').select('staff_id, work_date, status').gte('work_date', date)]); const rows = ((profiles || []) as Profile[]).map((person) => { const records = (attendance || []).filter((row: any) => row.staff_id === person.id); const present = new Set(records.filter((row: any) => row.status !== 'absent').map((row: any) => row.work_date)).size; const absent = records.filter((row: any) => row.status === 'absent').length; return { staff_id: person.id, name: person.full_name || person.email || 'Staff', present, absent, score: present * 10 - absent * 3 }; }).sort((a, b) => b.score - a.score); setScoreboard(rows); }
  async function loadSettings() { const { data } = await supabase.from('company_settings').select('key,value').in('key', ['salary_pay_date', 'current_academic_year', 'current_term']); const settings = Object.fromEntries((data || []).map((row: any) => [row.key, row.value])); setSalaryDate(settings.salary_pay_date || ''); setAcademicYear(settings.current_academic_year || '2026/2027'); setTerm(settings.current_term || 'Term 1'); }
  useEffect(() => { loadPosts(); loadScoreboard(); loadSettings(); }, []);
  useEffect(() => { loadComments(posts.map((post) => post.id)); }, [posts]);
  useEffect(() => { const channel = supabase.channel('company-posts-feed').on('postgres_changes', { event: '*', schema: 'public', table: 'company_posts' }, loadPosts).on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => loadComments(posts.map((post) => post.id))).subscribe(); return () => { supabase.removeChannel(channel); }; }, [posts]);
  async function submitComment(event: FormEvent, postId: string) { event.preventDefault(); const body = newComment[postId]?.trim(); if (!body || !profile) return; const { error } = await supabase.from('post_comments').insert({ post_id: postId, body, author_id: profile.id }); if (error) setMessage(error.message); else { setNewComment((prev) => ({ ...prev, [postId]: '' })); await loadComments(posts.map((post) => post.id)); } }
  return <section>
    <div className="page-header"><div><h1>Company Dashboard</h1><p>Updates, announcements, attendance and staff comments.</p></div></div>
    <StatusMessage message={message} type="error" />
    <div className="grid two"><QuickAttendance /><div className="panel dashboard-profile-card">{profile?.photo_url ? <img className="staff-avatar" src={profile.photo_url} alt="Staff profile" /> : <div className="staff-avatar placeholder">{initials(profile?.full_name, profile?.email)}</div>}<div><h2>Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h2><p className="muted">{profile?.position || 'Staff'} · {profile?.department || 'Department not set'}</p><p><strong>Academic Year:</strong> {academicYear} · {term}<br /><strong>Staff No:</strong> {profile?.staff_no || 'Not set'}<br /><strong>Salary Pay Date:</strong> {salaryDate ? new Date(salaryDate).toLocaleDateString() : 'Not announced'}</p></div></div></div>
    <TopUsers />
    <div className="panel"><h2>Weekly Attendance Scores</h2><p className="hint">Attendance and special activities help staff build points.</p><div className="table-card compact-table"><table><thead><tr><th>Rank</th><th>Staff</th><th>Present Days</th><th>Absent</th><th>Score</th></tr></thead><tbody>{scoreboard.map((row, index) => <tr key={row.staff_id}><td>{index + 1}</td><td>{row.name}</td><td>{row.present}</td><td>{row.absent}</td><td><strong>{row.score}</strong></td></tr>)}</tbody></table></div></div>
    <h2>Latest Updates</h2><div className="feed">{posts.length === 0 && <div className="empty">No company updates posted yet.</div>}{posts.map((post) => <article key={post.id} className={`post priority-${post.priority}`}><div className="post-head"><div><strong>{post.title}</strong><span>{new Date(post.created_at).toLocaleString()}</span></div><em>{post.priority}</em></div><p>{post.body}</p>{post.image_url && <div className="post-image-card"><img src={post.image_url} alt={post.title} /><a className="download-link" href={post.image_url} download={`${post.title.replace(/[^a-z0-9]+/gi, '-')}.jpg`}>Download JPG</a></div>}<div className="comments">{(comments[post.id] || []).map((comment) => <div key={comment.id} className="comment"><strong>{comment.profiles?.full_name || 'Staff'}:</strong> {comment.body}</div>)}<form className="comment-form" onSubmit={(event) => submitComment(event, post.id)}><input placeholder="Write a comment..." value={newComment[post.id] || ''} onChange={(e) => setNewComment((prev) => ({ ...prev, [post.id]: e.target.value }))} /><button>Comment</button></form></div></article>)}</div>
  </section>;
}
