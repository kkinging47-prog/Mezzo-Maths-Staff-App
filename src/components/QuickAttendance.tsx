import { useEffect, useMemo, useState } from 'react';
import { CameraCapture } from './CameraCapture';
import { StatusMessage } from './StatusMessage';
import { useAuth } from '../lib/auth';
import { distanceInMeters, getCurrentPosition, todayGhanaDate } from '../lib/location';
import { supabase } from '../lib/supabase';
import { AttendanceRecord, School } from '../types';

function isSupervisor(position?: string | null) { return String(position || '').toLowerCase().includes('supervisor'); }

export function QuickAttendance() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [selfie, setSelfie] = useState<File | null>(null);
  const [openRecord, setOpenRecord] = useState<AttendanceRecord | null>(null);
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
    const { data } = await query;
    const schoolList = supervisor || profile.role === 'admin' ? (data || []) as School[] : (data || []).map((row: any) => row.schools).filter(Boolean) as School[];
    setSchools(schoolList);
    if (!schoolId && schoolList[0]) setSchoolId(schoolList[0].id);
    const { data: attendance } = await supabase.from('attendance').select('*, schools(*)').eq('staff_id', profile.id).eq('work_date', todayGhanaDate()).order('check_in_at', { ascending: false });
    setOpenRecord(((attendance || []) as AttendanceRecord[]).find((row) => !row.check_out_at) || null);
  }
  useEffect(() => { loadData(); }, [profile?.id, profile?.position]);

  async function uploadSelfie(file: File, staffId: string) {
    const path = `${staffId}/${todayGhanaDate()}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('attendance-selfies').upload(path, file, { upsert: false, contentType: 'image/jpeg' });
    if (error) throw error;
    return path;
  }

  async function checkIn() {
    if (!profile || !selectedSchool) return;
    if (!selfie) { setType('error'); setMessage('Please take your photo before checking in.'); return; }
    setBusy(true); setMessage('');
    try {
      const position = await getCurrentPosition();
      const distance = distanceInMeters(position.latitude, position.longitude, selectedSchool.latitude, selectedSchool.longitude);
      const radius = selectedSchool.radius_m || Number(import.meta.env.VITE_ATTENDANCE_RADIUS_M || 100);
      if (distance > radius) { setType('error'); setMessage(`You are about ${distance}m from ${selectedSchool.name}. You must be within ${radius}m to check in.`); return; }
      const selfieUrl = await uploadSelfie(selfie, profile.id);
      const { error } = await supabase.from('attendance').insert({ staff_id: profile.id, school_id: selectedSchool.id, work_date: todayGhanaDate(), check_in_lat: position.latitude, check_in_lng: position.longitude, check_in_distance_m: distance, selfie_url: selfieUrl, status: 'checked_in' });
      if (error) throw error;
      setType('success'); setMessage(`Checked in successfully at ${selectedSchool.name}.`); await loadData();
    } catch (error: any) { setType('error'); setMessage(error.message || 'Check-in failed.'); }
    finally { setBusy(false); }
  }

  async function checkOut() {
    if (!profile || !openRecord) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('attendance').update({ check_out_at: new Date().toISOString(), status: 'checked_out' }).eq('id', openRecord.id).eq('staff_id', profile.id);
    setBusy(false);
    if (error) { setType('error'); setMessage(error.message); } else { setType('success'); setMessage('Checked out successfully.'); await loadData(); }
  }

  return <div className="panel form-grid quick-attendance"><h2>Quick Attendance</h2><StatusMessage message={message} type={type} />{openRecord ? <><p>You are checked in at <strong>{openRecord.schools?.name || 'school'}</strong>.</p><button className="danger" disabled={busy} onClick={checkOut}>{busy ? 'Working...' : 'Check out now'}</button></> : <><label>School<select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>{schools.length === 0 && <p className="warning">No school has been assigned to your account yet.</p>}<CameraCapture onCapture={(file) => setSelfie(file)} /><button className="primary" disabled={busy || schools.length === 0} onClick={checkIn}>{busy ? 'Checking...' : 'Check in now'}</button></>}</div>;
}
