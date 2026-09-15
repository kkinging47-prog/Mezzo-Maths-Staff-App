import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

function today() { return new Date().toISOString().slice(0, 10); }
function staffName(row: Partial<Profile>) { return row.full_name || row.email || row.id || 'Staff'; }
function formatTime(value?: string | null) { return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'; }

type LoginRow = {
  staff: Profile;
  log?: any;
  status: 'Logged in' | 'Not logged in';
};

export function ReportSummary() {
  const { profile } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [loginDate, setLoginDate] = useState(today());
  const [message, setMessage] = useState('');

  async function load() {
    const [{ data: reportData, error: reportError }, { data: staffData, error: staffError }, { data: loginData, error: loginError }] = await Promise.all([
      supabase.from('weekly_reports').select('*, schools(name), profiles(full_name,email)').order('submitted_at', { ascending: false }).limit(500),
      supabase.from('profiles').select('id, full_name, email, staff_no, position, department, role, status').neq('status', 'left').neq('role', 'admin').order('full_name'),
      supabase.from('staff_login_logs').select('*').eq('login_date', loginDate).order('login_at', { ascending: true }),
    ]);
    const error = reportError || staffError || loginError;
    if (error) setMessage(error.message);
    else {
      setMessage('');
      setReports(reportData || []);
      setStaff((staffData || []) as Profile[]);
      setLoginLogs(loginData || []);
    }
  }

  useEffect(() => { load(); }, [loginDate]);

  const bySchool = useMemo(() => groupReports(reports, (row) => row.schools?.name || 'Unknown school'), [reports]);
  const byTutor = useMemo(() => groupReports(reports, (row) => row.profiles?.full_name || row.profiles?.email || 'Unknown tutor'), [reports]);
  const loginRows = useMemo<LoginRow[]>(() => {
    const byStaff = Object.fromEntries(loginLogs.map((row) => [row.staff_id, row]));
    return staff.map((person) => {
      const log = byStaff[person.id];
      return { staff: person, log, status: log ? 'Logged in' : 'Not logged in' };
    }).sort((a, b) => Number(Boolean(b.log)) - Number(Boolean(a.log)) || staffName(a.staff).localeCompare(staffName(b.staff)));
  }, [staff, loginLogs]);
  const loggedInCount = loginRows.filter((row) => row.log).length;
  const absentLoginCount = loginRows.length - loggedInCount;

  function exportRows() { downloadCsv('weekly-report-summary.csv', reports.map((r) => ({ school: r.schools?.name, tutor: r.profiles?.full_name || r.profiles?.email, week_ending: r.week_ending, classes: (r.classes_taught || []).join('; '), topics: r.topics_covered, challenges: r.challenges_observed, observations: r.notable_observations, recommendations: r.recommendations, comments: r.comments }))); }
  function exportLoginRows() { downloadCsv(`daily-login-report-${loginDate}.csv`, loginRows.map((row) => ({ date: loginDate, staff: staffName(row.staff), staff_no: row.staff.staff_no || '', position: row.staff.position || '', department: row.staff.department || '', status: row.status, first_login: row.log?.login_at || '', last_seen: row.log?.last_seen_at || '' }))); }

  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;
  return <section>
    <div className="page-header"><div><h1>Report Summary</h1><p>Weekly report summary plus daily staff login monitoring.</p></div><button className="primary" onClick={exportRows}>Download Weekly Report CSV</button></div>
    {message && <div className="status error">{message}</div>}

    <div className="panel">
      <div className="section-title-row"><div><h2>Daily Login Report</h2><p className="hint">Select a date to see staff who logged in and those who did not log in.</p></div><button className="primary" onClick={exportLoginRows}>Download Login CSV</button></div>
      <div className="grid three"><label>Date<input type="date" value={loginDate} onChange={(e) => setLoginDate(e.target.value)} /></label><div className="metric-card"><span>Logged in</span><strong>{loggedInCount}</strong></div><div className="metric-card"><span>Not logged in</span><strong>{absentLoginCount}</strong></div></div>
      <div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>Position</th><th>Department</th><th>Status</th><th>First Login</th><th>Last Seen</th></tr></thead><tbody>{loginRows.map((row) => <tr key={row.staff.id}><td><strong>{staffName(row.staff)}</strong><br /><span className="muted">{row.staff.staff_no || row.staff.email || '-'}</span></td><td>{row.staff.position || '-'}</td><td>{row.staff.department || '-'}</td><td><span className={`pill ${row.log ? 'status-cleared' : 'status-pending'}`}>{row.status}</span></td><td>{formatTime(row.log?.login_at)}</td><td>{formatTime(row.log?.last_seen_at)}</td></tr>)}</tbody></table></div>
      {loginRows.length === 0 && <div className="empty">No active staff found.</div>}
    </div>

    <div className="grid two"><SummaryPanel title="Weekly Reports By School" groups={bySchool} /><SummaryPanel title="Weekly Reports By Tutor" groups={byTutor} /></div>
  </section>;
}

function groupReports(rows: any[], keyFn: (row: any) => string) {
  const groups: Record<string, any[]> = {};
  rows.forEach((row) => { const key = keyFn(row); groups[key] ||= []; groups[key].push(row); });
  return Object.entries(groups).map(([name, items]) => ({ name, items, summary: summarize(items) }));
}
function summarize(items: any[]) {
  const classes = new Set<string>();
  const topics: string[] = []; const challenges: string[] = []; const recommendations: string[] = [];
  items.forEach((item) => { (item.classes_taught || []).forEach((c: string) => classes.add(c)); if (item.topics_covered) topics.push(item.topics_covered); if (item.challenges_observed) challenges.push(item.challenges_observed); if (item.recommendations) recommendations.push(item.recommendations); });
  return { count: items.length, classes: Array.from(classes).join(', ') || '-', topics: compact(topics), challenges: compact(challenges), recommendations: compact(recommendations) };
}
function compact(values: string[]) { const text = values.join(' ').replace(/\s+/g, ' ').trim(); return text ? `${text.slice(0, 260)}${text.length > 260 ? '...' : ''}` : '-'; }
function SummaryPanel({ title, groups }: { title: string; groups: any[] }) { return <div className="panel"><h2>{title}</h2>{groups.length === 0 ? <div className="empty">No reports found.</div> : groups.map((group) => <div className="summary-card" key={group.name}><h3>{group.name}</h3><p><strong>Reports:</strong> {group.summary.count}</p><p><strong>Classes:</strong> {group.summary.classes}</p><p><strong>Topics:</strong> {group.summary.topics}</p><p><strong>Challenges:</strong> {group.summary.challenges}</p><p><strong>Recommendations:</strong> {group.summary.recommendations}</p></div>)}</div>; }
