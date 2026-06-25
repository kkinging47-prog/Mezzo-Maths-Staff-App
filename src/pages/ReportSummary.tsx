import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';

export function ReportSummary() {
  const { profile } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  async function load() {
    const { data, error } = await supabase.from('weekly_reports').select('*, schools(name), profiles(full_name,email)').order('submitted_at', { ascending: false }).limit(500);
    if (error) setMessage(error.message); else setReports(data || []);
  }
  useEffect(() => { load(); }, []);
  const bySchool = useMemo(() => groupReports(reports, (row) => row.schools?.name || 'Unknown school'), [reports]);
  const byTutor = useMemo(() => groupReports(reports, (row) => row.profiles?.full_name || row.profiles?.email || 'Unknown tutor'), [reports]);
  function exportRows() { downloadCsv('weekly-report-summary.csv', reports.map((r) => ({ school: r.schools?.name, tutor: r.profiles?.full_name || r.profiles?.email, week_ending: r.week_ending, classes: (r.classes_taught || []).join('; '), topics: r.topics_covered, challenges: r.challenges_observed, observations: r.notable_observations, recommendations: r.recommendations, comments: r.comments }))); }
  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;
  return <section><div className="page-header"><div><h1>AI Report Summary</h1><p>Auto-generated summary of teacher reports by school and tutor.</p></div><button className="primary" onClick={exportRows}>Download CSV</button></div>{message && <div className="status error">{message}</div>}<div className="grid two"><SummaryPanel title="By School" groups={bySchool} /><SummaryPanel title="By Tutor" groups={byTutor} /></div></section>;
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
