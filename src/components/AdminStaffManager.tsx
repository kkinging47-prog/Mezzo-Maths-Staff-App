import { FormEvent, useState } from 'react';
import { PasswordInput } from './PasswordInput';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const departments = ['Administration', 'Marketing', 'Supervision', 'Human Resource'];

const emptyStaffForm = {
  full_name: '',
  email: '',
  password: '',
  staff_no: '',
  role: 'staff' as 'staff' | 'admin',
  position: 'Mezzo Maths Tutor',
  department: 'Supervision',
  phone: '',
  date_employed: '',
  date_of_birth: '',
  location: '',
  digital_address: '',
  home_address: '',
  guardian_name: '',
  guardian_contact: '',
};

interface AdminStaffManagerProps {
  staff: Profile[];
  currentUserId?: string;
  onChanged: () => Promise<void> | void;
  onSuccess: (message: string) => void;
  onError: (error: any) => void;
}

export function AdminStaffManager({ staff, currentUserId, onChanged, onSuccess, onError }: AdminStaffManagerProps) {
  const [newStaffForm, setNewStaffForm] = useState(emptyStaffForm);
  const [busy, setBusy] = useState(false);

  async function callStaffApi(payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('Please sign in again before managing staff.');

    const response = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Staff action failed.');
    return result;
  }

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    if (newStaffForm.password.length < 6) { onError(new Error('Initial password must be at least 6 characters.')); return; }
    setBusy(true);
    try {
      await callStaffApi({ action: 'create', staff: newStaffForm });
      setNewStaffForm(emptyStaffForm);
      await onChanged();
      onSuccess('Staff account created successfully. Give the staff member the email and initial password.');
    } catch (error: any) { onError(error); } finally { setBusy(false); }
  }

  async function setStaffStatus(staffMember: Profile, status: 'active' | 'left') {
    if (staffMember.id === currentUserId) { onError(new Error('You cannot change your own admin account status while signed in.')); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', staffMember.id);
      if (error) throw error;
      await onChanged();
      onSuccess(status === 'left' ? 'Staff marked as left company.' : 'Staff restored as active.');
    } catch (error: any) { onError(error); } finally { setBusy(false); }
  }

  async function deleteStaff(staffMember: Profile) {
    if (staffMember.id === currentUserId) { onError(new Error('You cannot delete your own admin account while signed in.')); return; }
    const name = staffMember.full_name || staffMember.email || 'this staff member';
    if (!window.confirm(`Delete ${name}? This removes the login and connected staff profile.`)) return;
    setBusy(true);
    try {
      await callStaffApi({ action: 'delete', staff_id: staffMember.id });
      await onChanged();
      onSuccess('Staff account deleted successfully.');
    } catch (error: any) { onError(error); } finally { setBusy(false); }
  }

  return (
    <>
      <form className="panel form-grid staff-admin-panel" onSubmit={createStaff}>
        <h2>Add Staff Account</h2>
        <p className="hint">Create the staff login here. Set an initial password for them; they can change it later from My Details.</p>
        <div className="grid two">
          <label>Full Name<input value={newStaffForm.full_name} onChange={(e) => setNewStaffForm({ ...newStaffForm, full_name: e.target.value })} required /></label>
          <label>Email<input type="email" value={newStaffForm.email} onChange={(e) => setNewStaffForm({ ...newStaffForm, email: e.target.value })} required /></label>
          <label>Initial Password<PasswordInput value={newStaffForm.password} onChange={(e) => setNewStaffForm({ ...newStaffForm, password: e.target.value })} required minLength={6} autoComplete="new-password" /></label>
          <label>Role<select value={newStaffForm.role} onChange={(e) => setNewStaffForm({ ...newStaffForm, role: e.target.value as 'staff' | 'admin' })}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
          <label>Staff Number<input value={newStaffForm.staff_no} onChange={(e) => setNewStaffForm({ ...newStaffForm, staff_no: e.target.value })} /></label>
          <label>Position<input value={newStaffForm.position} onChange={(e) => setNewStaffForm({ ...newStaffForm, position: e.target.value })} /></label>
          <label>Department<select value={newStaffForm.department} onChange={(e) => setNewStaffForm({ ...newStaffForm, department: e.target.value })}>{departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select></label>
          <label>Contact Number<input value={newStaffForm.phone} onChange={(e) => setNewStaffForm({ ...newStaffForm, phone: e.target.value })} /></label>
          <label>Date Employed<input type="date" value={newStaffForm.date_employed} onChange={(e) => setNewStaffForm({ ...newStaffForm, date_employed: e.target.value })} /></label>
          <label>Date of Birth<input type="date" value={newStaffForm.date_of_birth} onChange={(e) => setNewStaffForm({ ...newStaffForm, date_of_birth: e.target.value })} /></label>
          <label>Location<input value={newStaffForm.location} onChange={(e) => setNewStaffForm({ ...newStaffForm, location: e.target.value })} /></label>
          <label>Digital Address<input value={newStaffForm.digital_address} onChange={(e) => setNewStaffForm({ ...newStaffForm, digital_address: e.target.value })} /></label>
          <label>Home Address<input value={newStaffForm.home_address} onChange={(e) => setNewStaffForm({ ...newStaffForm, home_address: e.target.value })} /></label>
          <label>Guardian Name<input value={newStaffForm.guardian_name} onChange={(e) => setNewStaffForm({ ...newStaffForm, guardian_name: e.target.value })} /></label>
          <label>Guardian Contact<input value={newStaffForm.guardian_contact} onChange={(e) => setNewStaffForm({ ...newStaffForm, guardian_contact: e.target.value })} /></label>
        </div>
        <button className="primary" disabled={busy}>{busy ? 'Saving staff...' : 'Create Staff Login'}</button>
      </form>

      <div className="panel staff-admin-panel">
        <h2>Staff List</h2>
        <p className="hint">Use Mark Left when a staff member has left the company. Delete should be used only when you want to permanently remove the login.</p>
        <div className="table-card compact-table"><table><thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{staff.map((row) => <tr key={row.id}><td>{row.full_name || '-'}</td><td>{row.email || '-'}</td><td>{row.department || '-'}</td><td><span className="pill">{row.role}</span></td><td><span className={`pill status-${row.status || 'active'}`}>{row.status || 'active'}</span></td><td><div className="button-row">{row.status === 'left' ? <button type="button" className="primary small-button" disabled={busy || row.id === currentUserId} onClick={() => setStaffStatus(row, 'active')}>Restore</button> : <button type="button" className="danger small-button" disabled={busy || row.id === currentUserId} onClick={() => setStaffStatus(row, 'left')}>Mark Left</button>}<button type="button" className="danger small-button" disabled={busy || row.id === currentUserId} onClick={() => deleteStaff(row)}>{row.id === currentUserId ? 'Current Admin' : 'Delete'}</button></div></td></tr>)}</tbody></table></div>
      </div>
    </>
  );
}
