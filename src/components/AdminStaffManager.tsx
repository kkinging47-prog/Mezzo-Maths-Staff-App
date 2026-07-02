import { FormEvent, useState } from 'react';
import { PasswordInput } from './PasswordInput';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const departments = ['Administration', 'Marketing', 'Supervision', 'Human Resource', 'Teaching'];
const positions = ['Office Staff', 'Tutor', 'Supervisor', 'Marketer', 'Administration'];

const emptyStaffForm = {
  full_name: '',
  email: '',
  password: '',
  temp_password: '',
  staff_no: '',
  role: 'staff' as 'staff' | 'admin',
  position: 'Tutor',
  department: 'Teaching',
  phone: '',
  date_employed: '',
  date_of_birth: '',
  location: '',
  digital_address: '',
  home_address: '',
  guardian_name: '',
  guardian_contact: '',
  status: 'active',
};

type StaffForm = typeof emptyStaffForm;

function toStaffForm(row: Profile): StaffForm {
  return {
    ...emptyStaffForm,
    full_name: row.full_name || '',
    email: row.email || '',
    staff_no: row.staff_no || '',
    role: row.role || 'staff',
    position: row.position || 'Tutor',
    department: row.department || 'Teaching',
    phone: row.phone || '',
    date_employed: row.date_employed || '',
    date_of_birth: row.date_of_birth || '',
    location: row.location || '',
    digital_address: row.digital_address || '',
    home_address: row.home_address || '',
    guardian_name: row.guardian_name || '',
    guardian_contact: row.guardian_contact || '',
    status: row.status || 'active',
  };
}

interface AdminStaffManagerProps {
  staff: Profile[];
  currentUserId?: string;
  onChanged: () => Promise<void> | void;
  onSuccess: (message: string) => void;
  onError: (error: any) => void;
}

export function AdminStaffManager({ staff, currentUserId, onChanged, onSuccess, onError }: AdminStaffManagerProps) {
  const [newStaffForm, setNewStaffForm] = useState(emptyStaffForm);
  const [editStaffId, setEditStaffId] = useState('');
  const [editStaffForm, setEditStaffForm] = useState<StaffForm>(emptyStaffForm);
  const [busy, setBusy] = useState(false);

  async function callStaffApi(payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('Please sign in again before managing staff.');
    const response = await fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
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

  function startEdit(row: Profile) {
    setEditStaffId(row.id);
    setEditStaffForm(toStaffForm(row));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditStaffId('');
    setEditStaffForm(emptyStaffForm);
  }

  async function saveEditedStaff(event: FormEvent) {
    event.preventDefault();
    if (!editStaffId) return;
    if (editStaffForm.temp_password && editStaffForm.temp_password.length < 6) { onError(new Error('Temporary password must be at least 6 characters.')); return; }
    setBusy(true);
    try {
      await callStaffApi({ action: 'update', staff_id: editStaffId, staff: editStaffForm });
      cancelEdit();
      await onChanged();
      onSuccess('Staff details updated successfully. If you set a temporary password, share it privately with the staff member.');
    } catch (error: any) { onError(error); } finally { setBusy(false); }
  }

  async function setStaffStatus(staffMember: Profile, status: 'active' | 'left') {
    if (staffMember.id === currentUserId) { onError(new Error('You cannot change your own admin account status while signed in.')); return; }
    setBusy(true);
    try {
      await callStaffApi({ action: 'update', staff_id: staffMember.id, staff: { ...toStaffForm(staffMember), status } });
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

  function staffFields(form: StaffForm, setForm: (form: StaffForm) => void, mode: 'create' | 'edit') {
    return <div className="grid two">
      <label>Full Name<input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
      <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
      {mode === 'create' ? <label>Initial Password<PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} autoComplete="new-password" /></label> : <label>Set Temporary Password<PasswordInput value={form.temp_password} onChange={(e) => setForm({ ...form, temp_password: e.target.value })} minLength={6} autoComplete="new-password" /><small className="hint">Leave blank if you do not want to change their password.</small></label>}
      <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'staff' | 'admin' })}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
      <label>Staff Number<input value={form.staff_no} onChange={(e) => setForm({ ...form, staff_no: e.target.value })} /></label>
      <label>Position<select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
      <label>Department<select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>{departments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select></label>
      <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="left">Left Company</option></select></label>
      <label>Contact Number<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
      <label>Date Employed<input type="date" value={form.date_employed} onChange={(e) => setForm({ ...form, date_employed: e.target.value })} /></label>
      <label>Date of Birth<input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></label>
      <label>Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
      <label>Digital Address<input value={form.digital_address} onChange={(e) => setForm({ ...form, digital_address: e.target.value })} /></label>
      <label>Home Address<input value={form.home_address} onChange={(e) => setForm({ ...form, home_address: e.target.value })} /></label>
      <label>Guardian Name<input value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></label>
      <label>Guardian Contact<input value={form.guardian_contact} onChange={(e) => setForm({ ...form, guardian_contact: e.target.value })} /></label>
    </div>;
  }

  return <>
    {editStaffId && <form className="panel form-grid staff-admin-panel" onSubmit={saveEditedStaff}>
      <h2>Edit Saved Staff Details</h2>
      <p className="hint">Update the staff record, login email, or set a new temporary password if the staff member forgets theirs.</p>
      {staffFields(editStaffForm, setEditStaffForm, 'edit')}
      <div className="button-row"><button className="primary" disabled={busy}>{busy ? 'Saving changes...' : 'Save Staff Changes'}</button><button type="button" className="secondary" onClick={cancelEdit}>Cancel</button></div>
    </form>}

    <form className="panel form-grid staff-admin-panel" onSubmit={createStaff}>
      <h2>Add Staff Account</h2>
      <p className="hint">Create the staff login here. Set an initial password for them; they can change their email and password later from My Details.</p>
      {staffFields(newStaffForm, setNewStaffForm, 'create')}
      <button className="primary" disabled={busy}>{busy ? 'Saving staff...' : 'Create Staff Login'}</button>
    </form>

    <div className="panel staff-admin-panel">
      <h2>Staff List</h2>
      <p className="hint">Use Edit to correct saved details, email, role, department, position, or to set a temporary password. Use Mark Left when a staff member has left the company.</p>
      <div className="table-card compact-table"><table><thead><tr><th>Name</th><th>Email</th><th>Position</th><th>Department</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{staff.map((row) => <tr key={row.id}><td>{row.full_name || '-'}</td><td>{row.email || '-'}</td><td>{row.position || '-'}</td><td>{row.department || '-'}</td><td><span className="pill">{row.role}</span></td><td><span className={`pill status-${row.status || 'active'}`}>{row.status || 'active'}</span></td><td><div className="button-row"><button type="button" className="primary small-button" disabled={busy} onClick={() => startEdit(row)}>Edit</button>{row.status === 'left' ? <button type="button" className="primary small-button" disabled={busy || row.id === currentUserId} onClick={() => setStaffStatus(row, 'active')}>Restore</button> : <button type="button" className="danger small-button" disabled={busy || row.id === currentUserId} onClick={() => setStaffStatus(row, 'left')}>Mark Left</button>}<button type="button" className="danger small-button" disabled={busy || row.id === currentUserId} onClick={() => deleteStaff(row)}>{row.id === currentUserId ? 'Current Admin' : 'Delete'}</button></div></td></tr>)}</tbody></table></div>
    </div>
  </>;
}
