import { FormEvent, useEffect, useMemo, useState } from 'react';
import { differenceInYears } from 'date-fns';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { StatusMessage } from '../components/StatusMessage';

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState<Partial<Profile>>({});
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (profile) setForm(profile); }, [profile]);

  const age = useMemo(() => {
    if (!form.date_of_birth) return '';
    return differenceInYears(new Date(), new Date(form.date_of_birth));
  }, [form.date_of_birth]);

  function setField(key: keyof Profile, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setMessage('');
    const payload = {
      full_name: form.full_name,
      date_of_birth: form.date_of_birth || null,
      date_employed: form.date_employed || null,
      phone: form.phone,
      location: form.location,
      digital_address: form.digital_address,
      home_address: form.home_address,
      guardian_name: form.guardian_name,
      guardian_contact: form.guardian_contact,
      position: form.position,
      department: form.department,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', profile.id);
    setBusy(false);
    if (error) {
      setType('error');
      setMessage(error.message);
    } else {
      setType('success');
      setMessage('Your information has been updated successfully.');
      await refreshProfile();
    }
  }

  return (
    <section>
      <div className="page-header"><div><h1>My Staff Details</h1><p>Keep your employment and emergency details accurate.</p></div></div>
      <StatusMessage message={message} type={type} />
      <form className="panel form-grid" onSubmit={submit}>
        <div className="grid two">
          <label>Full Name<input value={form.full_name || ''} onChange={(e) => setField('full_name', e.target.value)} required /></label>
          <label>Email<input value={form.email || ''} disabled /></label>
          <label>Staff Number<input value={form.staff_no || ''} disabled /></label>
          <label>Position<input value={form.position || ''} onChange={(e) => setField('position', e.target.value)} /></label>
          <label>Department<input value={form.department || ''} onChange={(e) => setField('department', e.target.value)} /></label>
          <label>Date Employed<input type="date" value={form.date_employed || ''} onChange={(e) => setField('date_employed', e.target.value)} /></label>
          <label>Date of Birth<input type="date" value={form.date_of_birth || ''} onChange={(e) => setField('date_of_birth', e.target.value)} /></label>
          <label>Age<input value={age} disabled /></label>
          <label>Contact Number<input value={form.phone || ''} onChange={(e) => setField('phone', e.target.value)} /></label>
          <label>Current Location<input value={form.location || ''} onChange={(e) => setField('location', e.target.value)} /></label>
          <label>Digital Address<input value={form.digital_address || ''} onChange={(e) => setField('digital_address', e.target.value)} /></label>
          <label>Home Address<input value={form.home_address || ''} onChange={(e) => setField('home_address', e.target.value)} /></label>
          <label>Guardian / Emergency Contact Name<input value={form.guardian_name || ''} onChange={(e) => setField('guardian_name', e.target.value)} /></label>
          <label>Guardian / Emergency Contact Number<input value={form.guardian_contact || ''} onChange={(e) => setField('guardian_contact', e.target.value)} /></label>
        </div>
        <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save staff details'}</button>
      </form>
    </section>
  );
}
