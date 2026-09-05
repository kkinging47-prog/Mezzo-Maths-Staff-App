import { FormEvent, useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

type SchoolForm = {
  id: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radius_m: string;
  reopening_date: string;
  reopening_note: string;
  active: boolean;
};

const emptyForm: SchoolForm = {
  id: '',
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  radius_m: '100',
  reopening_date: '',
  reopening_note: '',
  active: true,
};

function dateOnly(value?: string | null) {
  return value && value.length >= 10 ? value.slice(0, 10) : '';
}

function toForm(school: any): SchoolForm {
  return {
    id: school.id,
    name: school.name || '',
    address: school.address || '',
    latitude: school.latitude !== null && school.latitude !== undefined ? String(school.latitude) : '',
    longitude: school.longitude !== null && school.longitude !== undefined ? String(school.longitude) : '',
    radius_m: school.radius_m !== null && school.radius_m !== undefined ? String(school.radius_m) : '100',
    reopening_date: dateOnly(school.reopening_date),
    reopening_note: school.reopening_note || '',
    active: school.active !== false,
  };
}

function isReady(school: any) {
  if (!school.reopening_date) return true;
  return new Date(`${school.reopening_date}T00:00:00`).getTime() <= new Date().getTime();
}

function hasGps(school: any) {
  return school.latitude !== null && school.latitude !== undefined && school.longitude !== null && school.longitude !== undefined;
}

export function SchoolSettings() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<SchoolForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedSchool = useMemo(() => schools.find((school) => school.id === selectedId), [schools, selectedId]);

  async function loadSchools(nextId = selectedId) {
    const { data, error } = await supabase.from('schools').select('*').order('name');
    if (error) { setMessage(error.message); return; }
    const list = data || [];
    setSchools(list);
    const target = list.find((row: any) => row.id === nextId) || list[0];
    if (target) {
      setSelectedId(target.id);
      setForm(toForm(target));
    } else {
      setSelectedId('');
      setForm(emptyForm);
    }
  }

  useEffect(() => { loadSchools(); }, []);

  function chooseSchool(id: string) {
    setSelectedId(id);
    const found = schools.find((school) => school.id === id);
    if (found) setForm(toForm(found));
  }

  function newSchool() {
    setSelectedId('');
    setForm(emptyForm);
    setMessage('');
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setMessage('This device does not support GPS location.'); return; }
    setMessage('Getting current GPS location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({ ...prev, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) }));
        setMessage('GPS location added. You can now save the school.');
      },
      (error) => setMessage(error.message || 'Could not get GPS location.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function saveSchool(event: FormEvent) {
    event.preventDefault();
    if (!profile || profile.role !== 'admin') return;
    if (!form.name.trim()) { setMessage('School name is required.'); return; }
    setBusy(true); setMessage('');
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      latitude: form.latitude.trim() ? Number(form.latitude) : null,
      longitude: form.longitude.trim() ? Number(form.longitude) : null,
      radius_m: Number(form.radius_m || 100),
      reopening_date: form.reopening_date || null,
      reopening_note: form.reopening_note.trim() || null,
      active: form.active,
      updated_at: new Date().toISOString(),
    };
    try {
      if (form.id) {
        const { error } = await supabase.from('schools').update(payload).eq('id', form.id);
        if (error) throw error;
        setMessage('School updated successfully. GPS coordinates can be added now or captured during first staff attendance check-in.');
        await loadSchools(form.id);
      } else {
        const { data, error } = await supabase.from('schools').insert(payload).select('id').single();
        if (error) throw error;
        setMessage('New school created successfully. GPS coordinates can be added now or captured during first staff attendance check-in.');
        await loadSchools(data?.id);
      }
    } catch (error: any) {
      setMessage(error.message || 'Could not save school.');
    } finally { setBusy(false); }
  }

  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;

  return <section>
    <div className="page-header"><div><h1>School Locations & Reopening Dates</h1><p>Edit school details, GPS locations, attendance radius, and each school's reopening date.</p></div><button className="primary" onClick={newSchool}>Add New School</button></div>
    {message && <div className="status info">{message}</div>}

    <div className="grid two">
      <div className="panel">
        <h2>School List</h2>
        <p className="hint">Select a school here before editing its location or reopening date.</p>
        <div className="school-list-box">
          {schools.map((school) => <button key={school.id} type="button" className={`school-row ${selectedId === school.id ? 'active' : ''}`} onClick={() => chooseSchool(school.id)}>
            <strong>{school.name}</strong>
            <span>{school.address || 'No address'} · Radius {school.radius_m || 100}m</span>
            <em>{school.reopening_date ? `Reopens: ${school.reopening_date}` : 'No reopening date set'} · {hasGps(school) ? 'GPS saved' : 'GPS not set'} · {isReady(school) ? 'Active for attendance' : 'Not reopened yet'}</em>
          </button>)}
          {schools.length === 0 && <div className="empty">No schools have been added yet.</div>}
        </div>
      </div>

      <form className="panel form-grid" onSubmit={saveSchool}>
        <h2>{form.id ? 'Edit Selected School' : 'Add New School'}</h2>
        {selectedSchool && <p className="hint">Editing: <strong>{selectedSchool.name}</strong></p>}
        <label>School Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Address / Location Description<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Example: Madina, Accra" /></label>
        <div className="grid two">
          <label>Latitude <small className="muted">optional</small><input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="Can be captured during staff check-in" /></label>
          <label>Longitude <small className="muted">optional</small><input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="Can be captured during staff check-in" /></label>
        </div>
        <button type="button" className="small-button" onClick={useMyLocation}><MapPin size={16}/> Use My Current GPS</button>
        <label>Allowed Attendance Radius in Meters<input type="number" min="20" value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} /></label>
        <label>School Reopening Date<input type="date" value={form.reopening_date} onChange={(e) => setForm({ ...form, reopening_date: e.target.value })} /></label>
        <label>Reopening Note<textarea value={form.reopening_note} onChange={(e) => setForm({ ...form, reopening_note: e.target.value })} placeholder="Example: Reopened one week later because of repairs." /></label>
        <label className="checkbox-row"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> School is active</label>
        <button className="primary" disabled={busy}>{busy ? 'Saving...' : form.id ? 'Update School' : 'Save School'}</button>
      </form>
    </div>

    <div className="panel">
      <h2>How Missing GPS Coordinates Work</h2>
      <p>You can save a school without latitude and longitude. When the first assigned staff member checks in at that school, the app will use the staff member's live GPS position as the school's saved GPS location.</p>
      <p className="hint">For accuracy, the first staff member should check in while physically standing at the school.</p>
    </div>
  </section>;
}
