import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { School } from '../types';

const classes = ['KG 1','KG 2','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6','JHS 1','JHS 2','JHS 3'];
const terms = ['Term 1','Term 2','Term 3'];

export function WorkbookOrders() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [supplies, setSupplies] = useState<any[]>([]);
  const [counts, setCounts] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [year, setYear] = useState('2026/2027');
  const [term, setTerm] = useState('Term 1');
  const [order, setOrder] = useState({ school_id: '', class_name: 'Primary 1', quantity: '' });
  const [countForm, setCountForm] = useState({ school_id: '', class_name: 'Primary 1', student_count: '' });
  const [supply, setSupply] = useState({ school_id: '', class_name: 'Primary 1', quantity: '', supplied_on: '' });

  async function load() {
    if (!profile) return;
    const { data: settings } = await supabase.from('company_settings').select('key,value').in('key', ['current_academic_year','current_term']);
    const cfg = Object.fromEntries((settings || []).map((row: any) => [row.key, row.value]));
    const currentYear = cfg.current_academic_year || year;
    const currentTerm = cfg.current_term || term;
    setYear(currentYear); setTerm(currentTerm);
    const schoolQuery = profile.role === 'admin' ? supabase.from('schools').select('*').order('name') : supabase.from('staff_school_assignments').select('schools(*)').eq('staff_id', profile.id);
    const { data: schoolData } = await schoolQuery;
    const list = profile.role === 'admin' ? (schoolData || []) as School[] : (schoolData || []).map((row: any) => row.schools).filter(Boolean) as School[];
    setSchools(list);
    if (!order.school_id && list[0]) { setOrder((p) => ({ ...p, school_id: list[0].id })); setCountForm((p) => ({ ...p, school_id: list[0].id })); setSupply((p) => ({ ...p, school_id: list[0].id })); }
    const [{ data: orderData }, { data: supplyData }, { data: countData }] = await Promise.all([
      supabase.from('workbook_orders').select('*, schools(name), profiles(full_name,email)').eq('academic_year', currentYear).eq('term', currentTerm).order('created_at', { ascending: false }),
      supabase.from('workbook_supplies').select('*, schools(name), profiles(full_name,email)').eq('academic_year', currentYear).eq('term', currentTerm).order('supplied_on', { ascending: false }),
      supabase.from('class_student_counts').select('*, schools(name), profiles(full_name,email)').eq('academic_year', currentYear).eq('term', currentTerm).order('updated_at', { ascending: false }),
    ]);
    setOrders(orderData || []); setSupplies(supplyData || []); setCounts(countData || []);
  }
  useEffect(() => { load(); }, [profile?.id]);
  async function submitOrder(event: FormEvent) { event.preventDefault(); if (!profile) return; const { error } = await supabase.from('workbook_orders').insert({ staff_id: profile.id, school_id: order.school_id, class_name: order.class_name, quantity: Number(order.quantity), academic_year: year, term }); if (error) setMessage(error.message); else { setMessage('Workbook order submitted.'); setOrder((p) => ({ ...p, quantity: '' })); load(); } }
  async function submitCount(event: FormEvent) { event.preventDefault(); if (!profile) return; const { error } = await supabase.from('class_student_counts').upsert({ staff_id: profile.id, school_id: countForm.school_id, class_name: countForm.class_name, student_count: Number(countForm.student_count), academic_year: year, term, updated_at: new Date().toISOString() }, { onConflict: 'staff_id,school_id,class_name,academic_year,term' }); if (error) setMessage(error.message); else { setMessage('Student count updated.'); setCountForm((p) => ({ ...p, student_count: '' })); load(); } }
  async function submitSupply(event: FormEvent) { event.preventDefault(); if (!profile) return; const { error } = await supabase.from('workbook_supplies').insert({ posted_by: profile.id, school_id: supply.school_id, class_name: supply.class_name, quantity: Number(supply.quantity), supplied_on: supply.supplied_on || new Date().toISOString().slice(0, 10), academic_year: year, term }); if (error) setMessage(error.message); else { setMessage('Supply record posted.'); setSupply((p) => ({ ...p, quantity: '', supplied_on: '' })); load(); } }
  function exportAll() { downloadCsv(`workbooks-${year}-${term}.csv`, [...orders.map((r) => ({ academic_year: r.academic_year, term: r.term, type: 'order', school: r.schools?.name, tutor: r.profiles?.full_name || r.profiles?.email, class_name: r.class_name, quantity: r.quantity, date: r.created_at })), ...supplies.map((r) => ({ academic_year: r.academic_year, term: r.term, type: 'supply', school: r.schools?.name, tutor: r.profiles?.full_name || r.profiles?.email, class_name: r.class_name, quantity: r.quantity, date: r.supplied_on })), ...counts.map((r) => ({ academic_year: r.academic_year, term: r.term, type: 'student_count', school: r.schools?.name, tutor: r.profiles?.full_name || r.profiles?.email, class_name: r.class_name, quantity: r.student_count, date: r.updated_at }))]); }
  return <section><div className="page-header"><div><h1>Workbook Orders</h1><p>Term-based workbook requests, supplies and school enrollment for {year}.</p></div>{profile?.role === 'admin' && <button className="primary" onClick={exportAll}>Download CSV</button>}</div>{message && <div className="status info">{message}</div>}<div className="panel grid two"><label>Academic Year<input value={year} onChange={(e) => setYear(e.target.value)} /></label><label>Term<select value={term} onChange={(e) => setTerm(e.target.value)}>{terms.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="primary" onClick={load}>Load Term Data</button></div><div className="grid two"><form className="panel form-grid" onSubmit={submitOrder}><h2>Request Workbooks</h2><label>School<select value={order.school_id} onChange={(e) => setOrder({ ...order, school_id: e.target.value })}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Class<select value={order.class_name} onChange={(e) => setOrder({ ...order, class_name: e.target.value })}>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label><label>Quantity<input type="number" value={order.quantity} onChange={(e) => setOrder({ ...order, quantity: e.target.value })} required /></label><button className="primary">Submit Order</button></form><form className="panel form-grid" onSubmit={submitCount}><h2>Update Student Numbers</h2><label>School<select value={countForm.school_id} onChange={(e) => setCountForm({ ...countForm, school_id: e.target.value })}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Class<select value={countForm.class_name} onChange={(e) => setCountForm({ ...countForm, class_name: e.target.value })}>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label><label>Number of Students<input type="number" value={countForm.student_count} onChange={(e) => setCountForm({ ...countForm, student_count: e.target.value })} required /></label><button className="primary">Save Student Count</button></form>{profile?.role === 'admin' && <form className="panel form-grid" onSubmit={submitSupply}><h2>Post Supplied Books</h2><label>School<select value={supply.school_id} onChange={(e) => setSupply({ ...supply, school_id: e.target.value })}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Class<select value={supply.class_name} onChange={(e) => setSupply({ ...supply, class_name: e.target.value })}>{classes.map((c) => <option key={c} value={c}>{c}</option>)}</select></label><label>Quantity Supplied<input type="number" value={supply.quantity} onChange={(e) => setSupply({ ...supply, quantity: e.target.value })} required /></label><label>Date Supplied<input type="date" value={supply.supplied_on} onChange={(e) => setSupply({ ...supply, supplied_on: e.target.value })} /></label><button className="primary">Post Supply</button></form>}</div><h2>Orders, Supplies and Student Counts</h2><div className="table-card"><table><thead><tr><th>Type</th><th>Year/Term</th><th>School</th><th>Tutor/Admin</th><th>Class</th><th>Quantity</th><th>Date</th></tr></thead><tbody>{orders.map((r) => <tr key={`o-${r.id}`}><td>Order</td><td>{r.academic_year} {r.term}</td><td>{r.schools?.name}</td><td>{r.profiles?.full_name || r.profiles?.email}</td><td>{r.class_name}</td><td>{r.quantity}</td><td>{new Date(r.created_at).toLocaleDateString()}</td></tr>)}{supplies.map((r) => <tr key={`s-${r.id}`}><td>Supply</td><td>{r.academic_year} {r.term}</td><td>{r.schools?.name}</td><td>{r.profiles?.full_name || r.profiles?.email}</td><td>{r.class_name}</td><td>{r.quantity}</td><td>{r.supplied_on}</td></tr>)}{counts.map((r) => <tr key={`c-${r.id}`}><td>Students</td><td>{r.academic_year} {r.term}</td><td>{r.schools?.name}</td><td>{r.profiles?.full_name || r.profiles?.email}</td><td>{r.class_name}</td><td>{r.student_count}</td><td>{new Date(r.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>;
}
