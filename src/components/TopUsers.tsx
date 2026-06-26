import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Row = { id: string; name: string; total: number };
function since(days: number) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }
async function loadRows(days: number): Promise<Row[]> {
  const start = since(days);
  const [{ data: users }, { data: daily }, { data: activities }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').neq('status', 'left'),
    supabase.from('attendance').select('staff_id, work_date, status').gte('work_date', start),
    supabase.from('special_class_activities').select('staff_id, created_at').gte('created_at', `${start}T00:00:00`),
  ]);
  return (users || []).map((user: any) => {
    const d = (daily || []).filter((row: any) => row.staff_id === user.id);
    const a = (activities || []).filter((row: any) => row.staff_id === user.id).length;
    const present = new Set(d.filter((row: any) => row.status !== 'absent').map((row: any) => row.work_date)).size;
    const absent = d.filter((row: any) => row.status === 'absent').length;
    return { id: user.id, name: user.full_name || user.email || 'User', total: present * 10 + a * 5 - absent * 3 };
  }).sort((x: Row, y: Row) => y.total - x.total);
}
export function TopUsers() {
  const [week, setWeek] = useState<Row[]>([]);
  const [month, setMonth] = useState<Row[]>([]);
  const [term, setTerm] = useState<Row[]>([]);
  useEffect(() => { loadRows(7).then(setWeek); loadRows(31).then(setMonth); loadRows(93).then(setTerm); }, []);
  return <div className="grid three"><Box title="Weekly Top 3" rows={week.slice(0, 3)} /><Box title="Monthly Top 3" rows={month.slice(0, 3)} /><Box title="Term Top 3" rows={term.slice(0, 3)} /></div>;
}
function Box({ title, rows }: { title: string; rows: Row[] }) { return <div className="panel"><h2>{title}</h2>{rows.length === 0 ? <p className="muted">No records yet.</p> : rows.map((row, index) => <div className="star-line" key={row.id}><strong>{index + 1}. {row.name}</strong><span>{row.total} pts</span></div>)}</div>; }
