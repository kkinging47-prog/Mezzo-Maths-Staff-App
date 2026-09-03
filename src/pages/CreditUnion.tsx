import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const SHARE_VALUE = 20;
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const monthNumbers: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

type UploadRow = {
  staff_id: string | null;
  member_type: 'staff' | 'external';
  external_name: string | null;
  display_name: string;
  contribution_month: string;
  number_of_shares: number;
  amount: number;
  dividend_per_share: number;
  dividend_amount: number;
  contribution_type: string;
  notes: string;
  matched: boolean;
};

function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toFixed(2)}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function clean(value: any) { return String(value ?? '').trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function numeric(value: any) { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function sharesFromRow(row: any) { if (row.number_of_shares !== null && row.number_of_shares !== undefined) return Number(row.number_of_shares || 0); return Number(row.amount || 0) / Number(row.share_value || SHARE_VALUE); }
function memberName(row: any) { return row.member_type === 'external' ? (row.external_name || 'External member') : (row.staff?.full_name || row.staff?.email || row.external_name || '-'); }
function findStaff(staff: Profile[], name: string) {
  const target = normalize(name);
  if (!target) return null;
  return staff.find((person) => normalize(person.full_name || '') === target || normalize(person.email || '') === target)
    || staff.find((person) => { const saved = normalize(person.full_name || person.email || ''); return saved && (saved.includes(target) || target.includes(saved)); })
    || null;
}

export function CreditUnion() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ member_type: 'staff', staff_id: '', external_name: '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
  const [templateYear, setTemplateYear] = useState(String(new Date().getFullYear()));
  const [uploadDividendPerShare, setUploadDividendPerShare] = useState('');
  const [uploadPreview, setUploadPreview] = useState<UploadRow[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const isAdmin = profile?.role === 'admin';

  const calculated = useMemo(() => {
    const shares = Number(form.number_of_shares || 0);
    const dividendPerShare = Number(form.dividend_per_share || 0);
    return { shares, amount: shares * SHARE_VALUE, dividendAmount: shares * dividendPerShare };
  }, [form.number_of_shares, form.dividend_per_share]);

  async function load() {
    if (!profile) return;
    const contributionSelect = '*, staff:profiles!credit_union_contributions_staff_id_fkey(full_name,email,position)';
    if (isAdmin) {
      const [{ data: staffRows }, { data: contributionRows, error }] = await Promise.all([
        supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
        supabase.from('credit_union_contributions').select(contributionSelect).order('contribution_month', { ascending: false }).order('created_at', { ascending: false }).limit(1500),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else setRecords(contributionRows || []);
    } else {
      const { data, error } = await supabase.from('credit_union_contributions').select(contributionSelect).eq('staff_id', profile.id).order('contribution_month', { ascending: false }).limit(500);
      if (error) setMessage(error.message); else setRecords(data || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    if (calculated.shares <= 0) { setMessage('Please enter a valid number of shares.'); return; }
    if (form.member_type === 'staff' && !form.staff_id) { setMessage('Please select a staff member.'); return; }
    if (form.member_type === 'external' && !form.external_name.trim()) { setMessage('Please enter the non-staff member name.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('credit_union_contributions').insert({
        staff_id: form.member_type === 'staff' ? form.staff_id : null,
        member_type: form.member_type,
        external_name: form.member_type === 'external' ? form.external_name.trim() : null,
        recorded_by: profile.id,
        contribution_month: form.contribution_month,
        share_value: SHARE_VALUE,
        number_of_shares: calculated.shares,
        amount: calculated.amount,
        dividend_per_share: form.dividend_per_share ? Number(form.dividend_per_share) : 0,
        dividend_amount: calculated.dividendAmount,
        contribution_type: form.contribution_type,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
      setMessage('Credit union contribution saved successfully.');
      setForm((prev) => ({ ...prev, external_name: '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' }));
      await load();
    } catch (error: any) { setMessage(error.message || 'Could not save contribution.'); } finally { setBusy(false); }
  }

  function downloadTemplate() {
    const rows: any[] = staff.map((person) => ({
      'Member Type': 'staff',
      'Staff Name': person.full_name || person.email,
      'External Member Name': '',
      'Year': templateYear,
      JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '',
      'Dividend Per Share': '',
      Notes: '',
    }));
    rows.push({ 'Member Type': 'external', 'Staff Name': '', 'External Member Name': 'Type non-staff member name here', Year: templateYear, JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '', 'Dividend Per Share': '', Notes: 'Non-staff credit union member' });
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Credit Union');
    XLSX.writeFile(workbook, `mezzo-credit-union-template-${templateYear}.xlsx`);
  }

  async function previewTemplateUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('Reading credit union template...');
    setUploadPreview([]); setUnmatched([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
      const preview: UploadRow[] = [];
      const missed: string[] = [];
      rows.forEach((row) => {
        const memberType = normalize(row['Member Type'] || row.member_type).includes('external') ? 'external' : 'staff';
        const staffName = clean(row['Staff Name'] || row.staff_name || row.Name || row.name);
        const externalName = clean(row['External Member Name'] || row.external_name || row['Non Staff Name'] || row['Non-staff Name']);
        const year = clean(row.Year || row.year || templateYear) || templateYear;
        const dividendPerShare = numeric(row['Dividend Per Share'] || row.dividend_per_share || uploadDividendPerShare);
        const notes = clean(row.Notes || row.notes);
        const staffPerson = memberType === 'staff' ? findStaff(staff, staffName) : null;
        if (memberType === 'staff' && staffName && !staffPerson && !missed.includes(staffName)) missed.push(staffName);
        MONTHS.forEach((month) => {
          const amount = numeric(row[month] ?? row[month.toLowerCase()]);
          if (amount <= 0) return;
          const shares = Number((amount / SHARE_VALUE).toFixed(2));
          const displayName = memberType === 'external' ? externalName : (staffPerson?.full_name || staffName);
          if (!displayName) return;
          preview.push({
            staff_id: staffPerson?.id || null,
            member_type: memberType,
            external_name: memberType === 'external' ? displayName : null,
            display_name: displayName,
            contribution_month: `${year}-${monthNumbers[month]}-01`,
            number_of_shares: shares,
            amount: Number((shares * SHARE_VALUE).toFixed(2)),
            dividend_per_share: dividendPerShare,
            dividend_amount: Number((shares * dividendPerShare).toFixed(2)),
            contribution_type: 'old_record',
            notes: notes || `Bulk template upload from ${file.name}`,
            matched: memberType === 'external' || Boolean(staffPerson),
          });
        });
      });
      setUploadPreview(preview);
      setUnmatched(missed);
      setMessage(`${preview.length} contribution row(s) found. Review the preview before importing.`);
    } catch (error: any) { setMessage(error.message || 'Could not read the template.'); }
  }

  async function importPreview() {
    if (!profile || !isAdmin) return;
    const rows = uploadPreview.filter((row) => row.matched);
    if (rows.length === 0) { setMessage('No matched records to import.'); return; }
    setBusy(true); setMessage('');
    try {
      const payload = rows.map((row) => ({
        staff_id: row.staff_id,
        member_type: row.member_type,
        external_name: row.external_name,
        recorded_by: profile.id,
        contribution_month: row.contribution_month,
        share_value: SHARE_VALUE,
        number_of_shares: row.number_of_shares,
        amount: row.amount,
        dividend_per_share: row.dividend_per_share,
        dividend_amount: row.dividend_amount,
        contribution_type: row.contribution_type,
        notes: row.notes,
      }));
      const { error } = await supabase.from('credit_union_contributions').insert(payload);
      if (error) throw error;
      setMessage(`${rows.length} credit union record(s) imported successfully.`);
      setUploadPreview([]); setUnmatched([]);
      await load();
    } catch (error: any) { setMessage(error.message || 'Could not import credit union records.'); } finally { setBusy(false); }
  }

  async function deleteContribution(id: string) {
    if (!isAdmin) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('credit_union_contributions').delete().eq('id', id);
    setBusy(false);
    if (error) setMessage(error.message); else { setMessage('Contribution removed.'); await load(); }
  }

  function exportCsv() {
    downloadCsv('credit-union-contributions.csv', records.map((row) => ({
      member: memberName(row), member_type: row.member_type || 'staff', position: row.staff?.position, month: row.contribution_month, number_of_shares: sharesFromRow(row), share_value: row.share_value || SHARE_VALUE, contribution_amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, type: row.contribution_type, notes: row.notes, created_at: row.created_at,
    })));
  }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalShares = records.reduce((sum, row) => sum + sharesFromRow(row), 0);
  const totalDividends = records.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0);
  const thisMonth = currentMonth();
  const monthTotal = records.filter((row) => row.contribution_month === thisMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const matchedPreview = uploadPreview.filter((row) => row.matched).length;

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Each credit union share is GHS 20. Record staff and non-staff credit union members.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four"><div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div><div className="metric-card"><span>Total Shares</span><strong>{totalShares.toFixed(2)}</strong></div><div className="metric-card"><span>Total Dividends</span><strong>{money(totalDividends)}</strong></div><div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div></div>

    {isAdmin && <div className="panel form-grid">
      <h2>Excel Template Upload</h2>
      <p className="hint">Download the app template. Staff names will already be included. You can also add non-staff credit union members by using Member Type = external and typing their name under External Member Name.</p>
      <div className="grid two"><label>Template Year<input value={templateYear} onChange={(e) => setTemplateYear(e.target.value)} /></label><label>Default Dividend Per Share<input type="number" min="0" step="0.01" value={uploadDividendPerShare} onChange={(e) => setUploadDividendPerShare(e.target.value)} placeholder="Optional" /></label></div>
      <div className="button-row"><button className="primary" type="button" onClick={downloadTemplate}>Download App Template</button><label className="small-button">Upload Filled Template<input type="file" accept=".xlsx,.xls,.csv" onChange={previewTemplateUpload} /></label></div>
      {unmatched.length > 0 && <div className="status error">Unmatched staff names: {unmatched.join(', ')}. These staff rows will not be imported unless corrected.</div>}
      {uploadPreview.length > 0 && <div><p className="hint">Preview: {matchedPreview} of {uploadPreview.length} row(s) ready to import.</p><button className="primary" type="button" disabled={busy} onClick={importPreview}>{busy ? 'Importing...' : 'Import Preview'}</button><div className="table-card compact-table"><table><thead><tr><th>Member</th><th>Type</th><th>Month</th><th>Amount</th><th>Shares</th><th>Dividend</th><th>Status</th></tr></thead><tbody>{uploadPreview.slice(0, 60).map((row, index) => <tr key={`${row.display_name}-${row.contribution_month}-${index}`}><td>{row.display_name}</td><td>{row.member_type}</td><td>{row.contribution_month}</td><td>{money(row.amount)}</td><td>{row.number_of_shares.toFixed(2)}</td><td>{money(row.dividend_amount)}</td><td>{row.matched ? 'Ready' : 'Unmatched'}</td></tr>)}</tbody></table></div></div>}
    </div>}

    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}>
      <h2>Add Contribution Manually</h2>
      <p className="hint">Use Staff Member for employees. Use Non-staff Member for people who belong to the credit union but are not workers in the staff app.</p>
      <div className="grid two">
        <label>Member Type<select value={form.member_type} onChange={(e) => setForm({ ...form, member_type: e.target.value })}><option value="staff">Staff Member</option><option value="external">Non-staff Member</option></select></label>
        {form.member_type === 'staff' ? <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label> : <label>Non-staff Member Name<input value={form.external_name} onChange={(e) => setForm({ ...form, external_name: e.target.value })} placeholder="Example: Nana Ama Mensah" /></label>}
        <label>Contribution Month / Date<input type="date" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label>
        <label>Number of Shares<input type="number" min="0" step="0.01" value={form.number_of_shares} onChange={(e) => setForm({ ...form, number_of_shares: e.target.value })} required /></label>
        <label>Share Value<input value="GHS 20.00" disabled /></label>
        <label>Contribution Amount<input value={money(calculated.amount)} disabled /></label>
        <label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={form.dividend_per_share} onChange={(e) => setForm({ ...form, dividend_per_share: e.target.value })} /></label>
        <label>Total Dividend<input value={money(calculated.dividendAmount)} disabled /></label>
        <label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="old_record">Old / Past Years Record</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label>
      </div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional note." /></label>
      <button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button>
    </form>}

    <div className="panel"><h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2><div className="table-card"><table><thead><tr><th>Month</th><th>Member</th><th>Type</th><th>Shares</th><th>Contribution</th><th>Dividend / Share</th><th>Total Dividend</th><th>Record Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{records.map((row) => <tr key={row.id}><td>{row.contribution_month}</td><td>{memberName(row)}</td><td>{row.member_type || 'staff'}</td><td>{sharesFromRow(row).toFixed(2)}</td><td>{money(row.amount)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>{records.length === 0 && <div className="empty">No credit union contribution records found.</div>}</div>
  </section>;
}
