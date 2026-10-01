import { FormEvent, useEffect, useMemo, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

type StaffForm = {
  bank_name: string;
  bank_branch: string;
  bank_account_name: string;
  bank_account_number: string;
  momo_network: string;
  momo_name: string;
  momo_number: string;
};

const emptyForm: StaffForm = { bank_name: '', bank_branch: '', bank_account_name: '', bank_account_number: '', momo_network: '', momo_name: '', momo_number: '' };
function hasBank(row: any) { return Boolean(row.bank_name && row.bank_account_name && row.bank_account_number); }
function hasMomo(row: any) { return Boolean(row.momo_network && row.momo_name && row.momo_number); }
function staffLabel(row: any) { return row.full_name || row.email || row.staff_no || 'Staff'; }
function toForm(row: any): StaffForm { return { bank_name: row.bank_name || '', bank_branch: row.bank_branch || '', bank_account_name: row.bank_account_name || '', bank_account_number: row.bank_account_number || '', momo_network: row.momo_network || '', momo_name: row.momo_name || '', momo_number: row.momo_number || '' }; }

export function StaffDetails() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  const isAdmin = profile?.role === 'admin';

  async function loadData() {
    if (!isAdmin) return;
    const [{ data: profileData, error: profileError }, { data: assignmentData, error: assignmentError }] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'admin').order('full_name'),
      supabase.from('staff_school_assignments').select('staff_id, schools(name)').order('staff_id'),
    ]);
    const error = profileError || assignmentError;
    if (error) { setType('error'); setMessage(error.message); return; }
    const rows = profileData || [];
    setStaff(rows);
    setAssignments(assignmentData || []);
    const firstId = selectedId || rows[0]?.id || '';
    setSelectedId(firstId);
    const selected = rows.find((row: any) => row.id === firstId);
    if (selected) setForm(toForm(selected));
  }

  useEffect(() => { loadData(); }, [isAdmin]);

  const schoolMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    assignments.forEach((row) => {
      const name = Array.isArray(row.schools) ? row.schools[0]?.name : row.schools?.name;
      if (!name) return;
      map[row.staff_id] ||= [];
      map[row.staff_id].push(name);
    });
    return map;
  }, [assignments]);

  const filteredStaff = staff.filter((row) => `${row.full_name || ''} ${row.email || ''} ${row.staff_no || ''} ${row.position || ''} ${row.department || ''}`.toLowerCase().includes(search.toLowerCase()));
  const selectedStaff = staff.find((row) => row.id === selectedId);
  const missingBank = staff.filter((row) => !hasBank(row)).length;
  const missingMomo = staff.filter((row) => !hasMomo(row)).length;

  function selectStaff(id: string) {
    setSelectedId(id);
    const row = staff.find((item) => item.id === id);
    setForm(row ? toForm(row) : emptyForm);
  }

  async function savePaymentDetails(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ ...form, updated_at: new Date().toISOString() }).eq('id', selectedStaff.id);
    setBusy(false);
    if (error) { setType('error'); setMessage(error.message); return; }
    setType('success');
    setMessage(`${staffLabel(selectedStaff)} payment details saved.`);
    await loadData();
  }

  function exportStaffDetails() {
    downloadCsv('staff-payment-details.csv', staff.map((row) => ({
      staff_no: row.staff_no || '',
      name: row.full_name || '',
      email: row.email || '',
      phone: row.phone || '',
      position: row.position || '',
      department: row.department || '',
      status: row.status || '',
      assigned_schools: (schoolMap[row.id] || []).join('; '),
      bank_collected: hasBank(row) ? 'Yes' : 'No',
      bank_name: row.bank_name || '',
      bank_branch: row.bank_branch || '',
      bank_account_name: row.bank_account_name || '',
      bank_account_number: row.bank_account_number || '',
      momo_collected: hasMomo(row) ? 'Yes' : 'No',
      momo_network: row.momo_network || '',
      momo_name: row.momo_name || '',
      momo_number: row.momo_number || '',
    })));
  }

  if (!isAdmin) return <section><div className="empty">This page is for admin only.</div></section>;

  return <section>
    <div className="page-header"><div><h1>Staff Details</h1><p>View individual staff records, assigned schools, and whether bank or MoMo details have been collected.</p></div><button className="primary" onClick={exportStaffDetails}>Download CSV</button></div>
    <StatusMessage message={message} type={type} />

    <div className="grid four">
      <div className="metric-card"><span>Total Staff</span><strong>{staff.length}</strong></div>
      <div className="metric-card"><span>Bank Details Missing</span><strong>{missingBank}</strong></div>
      <div className="metric-card"><span>MoMo Details Missing</span><strong>{missingMomo}</strong></div>
      <div className="metric-card"><span>Fully Completed</span><strong>{staff.filter((row) => hasBank(row) && hasMomo(row)).length}</strong></div>
    </div>

    <div className="grid two">
      <div className="panel form-grid">
        <h2>Find Staff</h2>
        <label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, staff no, position" /></label>
        <label>Select Staff<select value={selectedId} onChange={(e) => selectStaff(e.target.value)}>{filteredStaff.map((row) => <option key={row.id} value={row.id}>{staffLabel(row)} {row.staff_no ? `(${row.staff_no})` : ''}</option>)}</select></label>
        {selectedStaff && <div className="approval-card">
          <span><strong>Name:</strong> {selectedStaff.full_name || '-'}</span>
          <span><strong>Email:</strong> {selectedStaff.email || '-'}</span>
          <span><strong>Phone:</strong> {selectedStaff.phone || '-'}</span>
          <span><strong>Position:</strong> {selectedStaff.position || '-'}</span>
          <span><strong>Department:</strong> {selectedStaff.department || '-'}</span>
          <span><strong>Assigned Schools:</strong> {(schoolMap[selectedStaff.id] || []).join(', ') || 'No school assigned'}</span>
          <span><strong>Bank Details:</strong> {hasBank(selectedStaff) ? 'Collected' : 'Missing'}</span>
          <span><strong>MoMo Details:</strong> {hasMomo(selectedStaff) ? 'Collected' : 'Missing'}</span>
        </div>}
      </div>

      <form className="panel form-grid" onSubmit={savePaymentDetails}>
        <h2>Bank & MoMo Details</h2>
        <h3>Bank Account</h3>
        <label>Bank Name<input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></label>
        <label>Bank Branch<input value={form.bank_branch} onChange={(e) => setForm({ ...form, bank_branch: e.target.value })} /></label>
        <label>Account Name<input value={form.bank_account_name} onChange={(e) => setForm({ ...form, bank_account_name: e.target.value })} /></label>
        <label>Account Number<input value={form.bank_account_number} onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} /></label>
        <h3>Mobile Money</h3>
        <label>MoMo Network<select value={form.momo_network} onChange={(e) => setForm({ ...form, momo_network: e.target.value })}><option value="">Select network</option><option>MTN</option><option>Telecel</option><option>AirtelTigo</option><option>Other</option></select></label>
        <label>MoMo Name<input value={form.momo_name} onChange={(e) => setForm({ ...form, momo_name: e.target.value })} /></label>
        <label>MoMo Number<input value={form.momo_number} onChange={(e) => setForm({ ...form, momo_number: e.target.value })} /></label>
        <button className="primary" disabled={busy || !selectedStaff}>{busy ? 'Saving...' : 'Save Staff Payment Details'}</button>
      </form>
    </div>

    <div className="panel">
      <h2>All Staff Summary</h2>
      <div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>Position</th><th>Assigned Schools</th><th>Bank</th><th>MoMo</th><th>Action</th></tr></thead><tbody>{filteredStaff.map((row) => <tr key={row.id}><td><strong>{staffLabel(row)}</strong><br /><span className="muted">{row.staff_no || row.email || '-'}</span></td><td>{row.position || '-'}<br /><span className="muted">{row.department || '-'}</span></td><td>{(schoolMap[row.id] || []).join(', ') || 'No school assigned'}</td><td><span className={`pill ${hasBank(row) ? 'approved' : ''}`}>{hasBank(row) ? 'Collected' : 'Missing'}</span></td><td><span className={`pill ${hasMomo(row) ? 'approved' : ''}`}>{hasMomo(row) ? 'Collected' : 'Missing'}</span></td><td><button type="button" className="secondary" onClick={() => selectStaff(row.id)}>Open</button></td></tr>)}</tbody></table></div>
    </div>
  </section>;
}
