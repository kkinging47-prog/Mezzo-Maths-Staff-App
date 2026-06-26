import { useEffect, useMemo, useState } from 'react';
import { CameraCapture } from '../components/CameraCapture';
import { StatusMessage } from '../components/StatusMessage';
import { useAuth } from '../lib/auth';
import { distanceInMeters, getCurrentPosition, nextFourPmGhana, todayGhanaDate } from '../lib/location';
import { supabase } from '../lib/supabase';
import { AttendanceRecord, School } from '../types';

function isSupervisor(position?: string | null) { return String(position || '').toLowerCase().includes('supervisor'); }

export function Attendance() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [selfie, setSelfie] = useState<File | null>(null);
  const [openRecord, setOpenRecord] = useState<AttendanceRecord | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  const selectedSchool = useMemo(() => schools.find((school) => school.id === schoolId), [schools, schoolId]);

  async function loadData() {
    if (!profile) return;
    const supervisor = isSupervisor(profile.position);
    const query = supervisor || profile.role === 'admin'
      ? supabase.from('schools').select('*').order('name')
      : supabase.from('staff_school_assignments').select('schools(*)').eq('staff_id', profile.id);
    const { data, error } = await query;
    if (error) { setType('error'); setMessage(error.message); return; }
    const schoolList = supervisor || profile.role === 'admin' ? (data || []) as School[] : (data || []).map((row: any) => row.schools).filter(Boolean) as School[];
    setSchools(schoolList);
    if (!schoolId && schoolList[0]) setSchoolId(schoolList[0].id);
    const { data: attendance } = await supabase.from('attendance').select('*, schools(*)').eq('staff_id', profile.id).order('check_in_at', { ascending: false }).limit(15);
    const rows = (attendance || []) as AttendanceRecord[];
    setRecords(rows);
    setOpenRecord(rows.find((row) => !row.check_out_at) || null);
  }

  useEffect(() => { loadData(); }, [profile?.id, profile?.position]);
  useEffect(() => { const target = nextFourPmGhana(); if (!target || !openRecord) return; const timer = window.setTimeout(() => handleCheckOut(true), target.getTime() - Date.now()); return () => window.clearTimeout(timer); }, [openRecord?.id]);

  async function uploadSelfie(file: File, staffId: string) { const path = `${staffId}/${todayGhanaDate()}-${Date.now()}.jpg`; const { error } = await supabase.storage.from('attendance-selfies').upload(path, file, { upsert: false, contentType: 'image/jpeg' }); if (error) throw error; return path; }
  async function handleCheckIn() { if (!profile || !selectedSchool) return; if (!selfie) { setType('error'); setMessage('Please take your photo before checking in.'); return; } setBusy(true); setMessage(''); try { const position = await getCurrentPosition(); const distance = distanceInMeters(position.latitude, position.longitude, selectedSchool.latitude, selectedSchool.longitude); const radius = selectedSchool.radius_m || Number(import.meta.env.VITE_ATTENDANCE_RADIUS_M || 100); if (distance > radius) { setType('error'); setMessage(`You are about ${distance}m from ${selectedSchool.name}. You must be within ${radius}m to check in.`); return; } const selfieUrl = await uploadSelfie(selfie, profile.id); const { error } = await supabase.from('attendance').insert({ staff_id: profile.id, school_id: selectedSchool.id, work_date: todayGhanaDate(), check_in_lat: position.latitude, check_in_lng: position.longitude, check_in_distance_m: distance, selfie_url: selfieUrl, status: 'checked_in' }); if (error) throw error; setType('success'); setMessage(`Checked in successfully at ${selectedSchool.name}.`); await loadData(); } catch (error: any) { setType('error'); setMessage(error.message || 'Check-in failed.'); } finally { setBusy(false); } }
  async function handleCheckOut(auto = false) { if (!profile || !openRecord) return; setBusy(true); setMessage(''); try { const update: Record<string, any> = { check_out_at: new Date().toISOString(), status: auto ? 'auto_checked_out' : 'checked_out' }; if (!auto && openRecord.schools) { const position = await getCurrentPosition(); update.check_out_lat = position.latitude; update.check_out_lng = position.longitude; update.check_out_distance_m = distanceInMeters(position.latitude, position.longitude, openRecord.schools.latitude, openRecord.schools.longitude); } const { error } = await supabase.from('attendance').update(update).eq('id', openRecord.id).eq('staff_id', profile.id); if (error) throw error; setType('success'); setMessage(auto ? 'You have been automatically checked out.' : 'Checked out successfully.'); await loadData(); } catch (error: any) { setType('error'); setMessage(error.message || 'Check-out failed.'); } finally { setBusy(false); } }

  return <section><div className="page-header"><div><h1>Attendance</h1><p>Check in only within the approved school radius.</p></div></div><StatusMessage message={message} type={type} /><div className="grid two"><div className="panel"><h2>Today</h2>{openRecord ? <div><p>You are currently checked in at <strong>{openRecord.schools?.name || 'selected school'}</strong>.</p><p className="muted">Check-in time: {new Date(openRecord.check_in_at).toLocaleString()}</p><button className="danger" disabled={busy} onClick={() => handleCheckOut(false)}>{busy ? 'Working...' : 'Check out now'}</button></div> : <div className="form-grid"><label>School<select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>{schools.length === 0 && <p className="warning">No school has been assigned to your account yet. Contact admin.</p>}<CameraCapture onCapture={(file) => setSelfie(file)} /><button className="primary" disabled={busy || schools.length === 0} onClick={handleCheckIn}>{busy ? 'Checking...' : 'Check in with location + photo'}</button></div>}</div><div className="panel"><h2>Geofence Rule</h2><p>Default radius is <strong>{selectedSchool?.radius_m || 100} meters</strong>. The app compares your live GPS position with the selected school’s saved coordinates.</p><p className="muted">Attendance closes automatically at the approved end-of-day time.</p></div></div><h2>Recent Attendance</h2><div className="table-card"><table><thead><tr><th>Date</th><th>School</th><th>Check in</th><th>Check out</th><th>Status</th></tr></thead><tbody>{records.map((row) => <tr key={row.id}><td>{row.work_date}</td><td>{row.schools?.name || '-'}</td><td>{row.check_in_at ? new Date(row.check_in_at).toLocaleTimeString() : '-'}</td><td>{row.check_out_at ? new Date(row.check_out_at).toLocaleTimeString() : '-'}</td><td><span className="pill">{row.status}</span></td></tr>)}</tbody></table></div></section>;
}
