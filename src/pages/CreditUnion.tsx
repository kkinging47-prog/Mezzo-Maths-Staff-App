import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const SHARE_VALUE = 20;
const PAGE_SIZE = 20;
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const monthMap: Record<string, string> = { jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12' };

type UploadRow = { staff_id: string | null; member_type: 'staff' | 'external'; external_name: string | null; member_name: string; contribution_month: string; number_of_shares: number; amount: number; dividend_per_share: number; dividend_amount: number; contribution_type: string; notes: string; matched: boolean; issue?: string };
type RawUpload = { memberType: 'staff' | 'external'; staffName: string; externalName: string; month: any; year: string; amount: number; shares: number; dividendPerShare?: number; notes?: string };
type MemberOption = { key: string; label: string; member_type: 'staff' | 'external' };

function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toFixed(2)}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function clean(value: any) { return String(value ?? '').trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function numeric(value: any) { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function sharesFromRow(row: any) { if (row.number_of_shares !== null && row.number_of_shares !== undefined) return Number(row.number_of_shares || 0); return Number(row.amount || 0) / Number(row.share_value || SHARE_VALUE); }
function memberName(row: any) { return row.member_type === 'external' ? (row.external_name || 'External Member') : (row.staff?.full_name || row.staff?.email || row.profiles?.full_name || row.profiles?.email || 'Staff Member'); }
function memberKey(row: any) { return row.member_type === 'external' ? `external:${normalize(row.external_name || '')}` : `staff:${row.staff_id}`; }
function monthDate(value: any, year: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-01`;
  const raw = clean(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) { const [a, b, c] = raw.split('/'); const yyyy = c.length === 2 ? `20${c}` : c; return `${yyyy}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`; }
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  const month = monthMap[key.slice(0, 3)] || monthMap[key];
  return month ? `${year}-${month}-01` : '';
}
function findStaffId(staff: Profile[], rawName: string) {
  const target = normalize(rawName);
  if (!target) return '';
  const exact = staff.find((person) => normalize(person.full_name || '') === target || normalize(person.email || '') === target);
  if (exact) return exact.id;
  const fuzzy = staff.find((person) => { const name = normalize(person.full_name || person.email || ''); return name && (name.includes(target) || target.includes(name)); });
  return fuzzy?.id || '';
}
function staffLabel(staff: Profile[], id: string | null, fallback: string) { const person = staff.find((row) => row.id === id); return person?.full_name || person?.email || fallback; }

export function CreditUnion() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ member_type: 'staff', staff_id: '', external_name: '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
  const [uploadYear, setUploadYear] = useState(String(new Date().getFullYear()));
  const [uploadDividendPerShare, setUploadDividendPerShare] = useState('');
  const [uploadPreview, setUploadPreview] = useState<UploadRow[]>([]);
  const [uploadErrorRows, setUploadErrorRows] = useState<string[]>([]);
  const [summaryKey, setSummaryKey] = useState('');
  const [summaryYear, setSummaryYear] = useState(String(new Date().getFullYear()));
  const isAdmin = profile?.role === 'admin';

  const calculated = useMemo(() => {
    const shares = Number(form.number_of_shares || 0);
    const dividendPerShare = Number(form.dividend_per_share || 0);
    return { shares, amount: shares * SHARE_VALUE, dividendAmount: shares * dividendPerShare };
  }, [form.number_of_shares, form.dividend_per_share]);

  const memberOptions = useMemo<MemberOption[]>(() => {
    const options: MemberOption[] = staff.map((person) => ({ key: `staff:${person.id}`, label: person.full_name || person.email || person.id, member_type: 'staff' }));
    records.forEach((row) => { if (row.member_type === 'external' && row.external_name) { const key = `external:${normalize(row.external_name)}`; if (!options.some((item) => item.key === key)) options.push({ key, label: row.external_name, member_type: 'external' }); } });
    uploadPreview.forEach((row) => { if (row.member_type === 'external' && row.external_name) { const key = `external:${normalize(row.external_name)}`; if (!options.some((item) => item.key === key)) options.push({ key, label: row.external_name, member_type: 'external' }); } });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [staff, records, uploadPreview]);

  const filteredForSummary = useMemo(() => records.filter((row) => summaryKey && memberKey(row) === summaryKey && String(row.contribution_month || '').slice(0, 4) === summaryYear), [records, summaryKey, summaryYear]);
  const summaryTotal = filteredForSummary.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const summaryShares = filteredForSummary.reduce((sum, row) => sum + sharesFromRow(row), 0);
  const summaryDividend = filteredForSummary.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0);
  const summaryByMonth = MONTHS.map((month, index) => { const mm = String(index + 1).padStart(2, '0'); const rows = filteredForSummary.filter((row) => String(row.contribution_month || '').slice(5, 7) === mm); return { month, amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), shares: rows.reduce((sum, row) => sum + sharesFromRow(row), 0), dividend: rows.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0) }; });

  async function load() {
    if (!profile) return;
    const contributionSelect = '*, staff:profiles!credit_union_contributions_staff_id_fkey(full_name,email,position)';
    if (isAdmin) {
      const [{ data: staffRows }, { data: contributionRows, error }] = await Promise.all([
        supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
        supabase.from('credit_union_contributions').select(contributionSelect).order('contribution_month', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else { setRecords(contributionRows || []); setPage(1); }
    } else {
      const { data, error } = await supabase.from('credit_union_contributions').select(contributionSelect).eq('staff_id', profile.id).order('contribution_month', { ascending: false }).limit(1000);
      if (error) setMessage(error.message); else setRecords(data || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);
  useEffect(() => { if (!summaryKey && memberOptions[0]) setSummaryKey(memberOptions[0].key); }, [memberOptions, summaryKey]);

  function makePayload(row: UploadRow) {
    return { staff_id: row.member_type === 'staff' ? row.staff_id : null, member_type: row.member_type, external_name: row.member_type === 'external' ? row.external_name : null, recorded_by: profile?.id, contribution_month: row.contribution_month, share_value: SHARE_VALUE, number_of_shares: row.number_of_shares, amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, contribution_type: row.contribution_type, notes: row.notes, updated_at: new Date().toISOString() };
  }

  async function replaceContribution(row: UploadRow) {
    if (row.member_type === 'staff' && row.staff_id) await supabase.from('credit_union_contributions').delete().eq('member_type', 'staff').eq('staff_id', row.staff_id).eq('contribution_month', row.contribution_month);
    if (row.member_type === 'external' && row.external_name) await supabase.from('credit_union_contributions').delete().eq('member_type', 'external').ilike('external_name', row.external_name).eq('contribution_month', row.contribution_month);
    const { error } = await supabase.from('credit_union_contributions').insert(makePayload(row));
    if (error) throw error;
  }

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    const memberType = form.member_type as 'staff' | 'external';
    const externalName = form.external_name.trim();
    if (memberType === 'staff' && !form.staff_id) { setMessage('Please select a staff member.'); return; }
    if (memberType === 'external' && !externalName) { setMessage('Please enter the external member name.'); return; }
    if (calculated.shares <= 0) { setMessage('Please enter a valid number of shares.'); return; }
    setBusy(true); setMessage('');
    try {
      const row: UploadRow = { staff_id: memberType === 'staff' ? form.staff_id : null, member_type: memberType, external_name: memberType === 'external' ? externalName : null, member_name: memberType === 'external' ? externalName : staffLabel(staff, form.staff_id, 'Staff Member'), contribution_month: form.contribution_month, number_of_shares: calculated.shares, amount: calculated.amount, dividend_per_share: form.dividend_per_share ? Number(form.dividend_per_share) : 0, dividend_amount: calculated.dividendAmount, contribution_type: form.contribution_type, notes: form.notes.trim() || 'Manual entry', matched: true };
      await replaceContribution(row);
      setMessage('Credit union contribution saved. If the same member and month already existed, it has been updated.');
      setForm({ member_type: memberType, staff_id: form.staff_id, external_name: memberType === 'external' ? externalName : '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
      await load();
    } catch (error: any) { setMessage(error.message || 'Could not save contribution.'); } finally { setBusy(false); }
  }

  function downloadTemplate() {
    const rows: any[] = staff.map((person) => ({ 'Member Type': 'staff', 'Staff Name': person.full_name || person.email, 'External Member Name': '', Year: uploadYear, 'Dividend Per Share': uploadDividendPerShare || 0, JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '', Notes: '' }));
    for (let i = 1; i <= 20; i += 1) rows.push({ 'Member Type': 'external', 'Staff Name': '', 'External Member Name': i === 1 ? 'Type non-staff member name here' : '', Year: uploadYear, 'Dividend Per Share': uploadDividendPerShare || 0, JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '', Notes: '' });
    const sheet = XLSX.utils.json_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Credit Union Upload'); XLSX.writeFile(workbook, `mezzo-credit-union-template-${uploadYear}.xlsx`);
  }

  function parseTemplateRows(rows: any[][]): RawUpload[] | null {
    const headers = (rows[0] || []).map((cell) => normalize(clean(cell)));
    const typeIndex = headers.findIndex((h) => h === 'member type' || h === 'type');
    const staffIndex = headers.findIndex((h) => h === 'staff name' || h === 'staff' || h === 'name');
    const externalIndex = headers.findIndex((h) => h === 'external member name' || h === 'external name' || h === 'non staff name');
    const yearIndex = headers.findIndex((h) => h === 'year');
    const dividendIndex = headers.findIndex((h) => h === 'dividend per share' || h === 'dividend amount per share');
    const notesIndex = headers.findIndex((h) => h === 'notes' || h === 'note');
    const monthIndexes = MONTHS.map((m) => ({ month: m, index: headers.findIndex((h) => h === m.toLowerCase()) })).filter((m) => m.index >= 0);
    if ((staffIndex < 0 && externalIndex < 0) || monthIndexes.length === 0) return null;
    const parsed: RawUpload[] = [];
    rows.slice(1).forEach((row) => {
      const rawType = normalize(clean(typeIndex >= 0 ? row[typeIndex] : 'staff'));
      const memberType: 'staff' | 'external' = rawType.includes('external') || rawType.includes('non staff') || rawType.includes('nonstaff') ? 'external' : 'staff';
      const staffName = clean(staffIndex >= 0 ? row[staffIndex] : '');
      const externalName = clean(externalIndex >= 0 ? row[externalIndex] : '');
      const year = clean(yearIndex >= 0 ? row[yearIndex] : uploadYear) || uploadYear;
      const dividend = dividendIndex >= 0 ? numeric(row[dividendIndex]) : numeric(uploadDividendPerShare);
      const notes = clean(notesIndex >= 0 ? row[notesIndex] : '');
      monthIndexes.forEach(({ month, index }) => { const amount = numeric(row[index]); if (amount > 0) parsed.push({ memberType, staffName, externalName, month, year, amount, shares: 0, dividendPerShare: dividend, notes: notes || `Bulk upload for ${year}` }); });
    });
    return parsed;
  }

  function parseOldWideRows(rows: any[][]): RawUpload[] {
    const parsed: RawUpload[] = []; const maxCols = Math.max(...rows.map((row) => row.length), 0);
    for (let col = 0; col < maxCols - 1; col += 1) {
      for (let headerRow = 0; headerRow < Math.min(rows.length, 6); headerRow += 1) {
        const name = clean(rows[headerRow]?.[col]); const next = normalize(clean(rows[headerRow + 1]?.[col])); const amountHead = normalize(clean(rows[headerRow + 1]?.[col + 1]));
        if (!name || normalize(name).includes('month') || normalize(name).includes('total')) continue;
        if (!next.startsWith('month') || !(amountHead.includes('amnt') || amountHead.includes('amount'))) continue;
        for (let rowIndex = headerRow + 2; rowIndex < rows.length; rowIndex += 1) {
          const monthValue = rows[rowIndex]?.[col]; const monthText = clean(monthValue); const amount = numeric(rows[rowIndex]?.[col + 1]); const normalizedMonth = normalize(monthText);
          if (!monthText) continue; if (normalizedMonth.startsWith('total') || normalizedMonth.startsWith('no of') || normalizedMonth.startsWith('no ')) break;
          if (monthDate(monthValue, uploadYear) && amount > 0) parsed.push({ memberType: 'staff', staffName: name, externalName: name, month: monthValue, year: uploadYear, amount, shares: 0, dividendPerShare: numeric(uploadDividendPerShare), notes: 'Bulk upload from old format' });
        }
        break;
      }
    }
    return parsed;
  }

  async function previewUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setMessage('Reading credit union file...'); setUploadPreview([]); setUploadErrorRows([]);
    try {
      const buffer = await file.arrayBuffer(); const workbook = XLSX.read(buffer, { type: 'array', cellDates: true }); const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
      const rawRows = parseTemplateRows(rows) || parseOldWideRows(rows); const unmatched: string[] = [];
      const nextRows: UploadRow[] = rawRows.map((row) => {
        const contributionMonth = monthDate(row.month, row.year || uploadYear); const externalName = row.externalName || row.staffName; const staffId = row.memberType === 'staff' ? findStaffId(staff, row.staffName) : ''; const shares = row.shares > 0 ? row.shares : row.amount / SHARE_VALUE; const dividendPerShare = row.dividendPerShare ?? numeric(uploadDividendPerShare); const matched = row.memberType === 'external' ? Boolean(externalName) : Boolean(staffId); const issue = !matched ? (row.memberType === 'external' ? 'External name missing' : 'Staff name not found') : undefined;
        if (!matched && !unmatched.includes(row.memberType === 'external' ? externalName || 'External name missing' : row.staffName)) unmatched.push(row.memberType === 'external' ? externalName || 'External name missing' : row.staffName);
        return { staff_id: row.memberType === 'staff' ? staffId || null : null, member_type: row.memberType, external_name: row.memberType === 'external' ? externalName : null, member_name: row.memberType === 'external' ? externalName : staffLabel(staff, staffId, row.staffName), contribution_month: contributionMonth, number_of_shares: Number(shares.toFixed(2)), amount: Number((shares * SHARE_VALUE).toFixed(2)), dividend_per_share: dividendPerShare, dividend_amount: Number((shares * dividendPerShare).toFixed(2)), contribution_type: 'old_record', notes: row.notes || `Bulk upload from ${file.name}`, matched, issue };
      }).filter((row) => row.contribution_month && row.number_of_shares > 0);
      setUploadPreview(nextRows); setUploadErrorRows(unmatched); setMessage(`${nextRows.length} contribution row(s) found. Check the preview first, then click Save Preview.`);
    } catch (error: any) { setMessage(error.message || 'Could not read the file. Use the app template or save as Excel .xlsx and try again.'); }
  }

  async function importPreview() {
    if (!profile || !isAdmin) return; const rows = uploadPreview.filter((row) => row.matched);
    if (rows.length === 0) { setMessage('No valid records to save. Check the preview and fix unmatched names.'); return; }
    setBusy(true); setMessage('');
    try { for (const row of rows) await replaceContribution(row); setMessage(`${rows.length} contribution record(s) saved. Existing records for the same member and month were updated, not duplicated.`); setUploadPreview([]); setUploadErrorRows([]); await load(); } catch (error: any) { setMessage(error.message || 'Could not save credit union records.'); } finally { setBusy(false); }
  }

  async function deleteContribution(id: string) { if (!isAdmin) return; setBusy(true); setMessage(''); const { error } = await supabase.from('credit_union_contributions').delete().eq('id', id); setBusy(false); if (error) setMessage(error.message); else { setMessage('Contribution removed.'); await load(); } }
  function exportCsv() { downloadCsv('credit-union-contributions.csv', records.map((row) => ({ member_type: row.member_type || 'staff', member: memberName(row), position: row.staff?.position, month: row.contribution_month, number_of_shares: sharesFromRow(row), share_value: row.share_value || SHARE_VALUE, contribution_amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, type: row.contribution_type, notes: row.notes, created_at: row.created_at }))); }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0); const totalShares = records.reduce((sum, row) => sum + sharesFromRow(row), 0); const totalDividends = records.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0); const thisMonth = currentMonth(); const monthTotal = records.filter((row) => row.contribution_month === thisMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0); const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE)); const visibleRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE); const previewMatched = uploadPreview.filter((row) => row.matched).length; const previewTotal = uploadPreview.reduce((sum, row) => sum + row.amount, 0);

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Each credit union share is GHS 20. Record staff and non-staff credit union members.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four"><div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div><div className="metric-card"><span>Total Shares</span><strong>{totalShares.toFixed(2)}</strong></div><div className="metric-card"><span>Total Dividends</span><strong>{money(totalDividends)}</strong></div><div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div></div>

    {isAdmin && <div className="panel form-grid"><h2>Excel Template Upload</h2><p className="hint">Download the app template, fill monthly amounts, preview the upload, then save. Use member type <strong>external</strong> for non-staff credit union members.</p><div className="grid three"><label>Template / Upload Year<input value={uploadYear} onChange={(e) => setUploadYear(e.target.value)} /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={uploadDividendPerShare} onChange={(e) => setUploadDividendPerShare(e.target.value)} placeholder="Optional" /></label><button type="button" className="primary" onClick={downloadTemplate}>Download App Template</button></div><label>Upload Filled Template<input type="file" accept=".xlsx,.xls,.csv" onChange={previewUpload} /></label>{uploadErrorRows.length > 0 && <div className="status error"><strong>Check these rows:</strong> {uploadErrorRows.join(', ')}. They will not save until fixed or marked as external with a name.</div>}{uploadPreview.length > 0 && <div><div className="grid three"><div className="metric-card"><span>Rows Found</span><strong>{uploadPreview.length}</strong></div><div className="metric-card"><span>Ready to Save</span><strong>{previewMatched}</strong></div><div className="metric-card"><span>Preview Total</span><strong>{money(previewTotal)}</strong></div></div><div className="table-card"><table><thead><tr><th>Status</th><th>Member Type</th><th>Member</th><th>Month</th><th>Amount</th><th>Shares</th><th>Dividend / Share</th><th>Total Dividend</th><th>Issue</th></tr></thead><tbody>{uploadPreview.slice(0, 80).map((row, index) => <tr key={`${row.member_name}-${row.contribution_month}-${index}`}><td><span className={`pill ${row.matched ? 'status-approved' : 'status-rejected'}`}>{row.matched ? 'Ready' : 'Not saved'}</span></td><td>{row.member_type === 'external' ? 'Non-staff' : 'Staff'}</td><td>{row.member_name}</td><td>{row.contribution_month}</td><td>{money(row.amount)}</td><td>{row.number_of_shares.toFixed(2)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td>{row.issue || '-'}</td></tr>)}</tbody></table></div><button className="primary" disabled={busy} onClick={importPreview}>{busy ? 'Saving...' : 'Save Preview'}</button><p className="hint">Saving updates existing records for the same member and month instead of creating duplicates.</p></div>}</div>}

    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}><h2>Add Single Contribution</h2><div className="grid two"><label>Member Type<select value={form.member_type} onChange={(e) => setForm({ ...form, member_type: e.target.value })}><option value="staff">Staff Member</option><option value="external">Non-staff Member</option></select></label>{form.member_type === 'staff' ? <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label> : <label>External Member Name<input value={form.external_name} onChange={(e) => setForm({ ...form, external_name: e.target.value })} placeholder="Name of non-staff member" /></label>}<label>Contribution Month / Date<input type="date" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label><label>Number of Shares<input type="number" min="0" step="0.01" value={form.number_of_shares} onChange={(e) => setForm({ ...form, number_of_shares: e.target.value })} required /></label><label>Share Value<input value="GHS 20.00" disabled /></label><label>Contribution Amount<input value={money(calculated.amount)} disabled /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={form.dividend_per_share} onChange={(e) => setForm({ ...form, dividend_per_share: e.target.value })} /></label><label>Total Dividend<input value={money(calculated.dividendAmount)} disabled /></label><label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="old_record">Old / Past Years Record</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label></div><label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button></form>}

    {isAdmin && <div className="panel form-grid"><h2>Member Yearly Summary</h2><div className="grid two"><label>Select Member<select value={summaryKey} onChange={(e) => setSummaryKey(e.target.value)}>{memberOptions.map((item) => <option key={item.key} value={item.key}>{item.label} ({item.member_type === 'external' ? 'Non-staff' : 'Staff'})</option>)}</select></label><label>Year<input value={summaryYear} onChange={(e) => setSummaryYear(e.target.value)} /></label></div><div className="grid three"><div className="metric-card"><span>Year Contribution</span><strong>{money(summaryTotal)}</strong></div><div className="metric-card"><span>Year Shares</span><strong>{summaryShares.toFixed(2)}</strong></div><div className="metric-card"><span>Year Dividend</span><strong>{money(summaryDividend)}</strong></div></div><div className="table-card"><table><thead><tr><th>Month</th><th>Contribution</th><th>Shares</th><th>Dividend</th></tr></thead><tbody>{summaryByMonth.map((row) => <tr key={row.month}><td>{row.month}</td><td>{money(row.amount)}</td><td>{row.shares.toFixed(2)}</td><td>{money(row.dividend)}</td></tr>)}</tbody></table></div></div>}

    <div className="panel"><h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2><p className="hint">Showing 20 records per page. External members appear by their typed names.</p><div className="table-card"><table><thead><tr><th>Month</th><th>Member Type</th><th>Member</th><th>Shares</th><th>Contribution</th><th>Dividend / Share</th><th>Total Dividend</th><th>Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{visibleRecords.map((row) => <tr key={row.id}><td>{row.contribution_month}</td><td>{row.member_type === 'external' ? 'Non-staff' : 'Staff'}</td><td>{memberName(row)}</td><td>{sharesFromRow(row).toFixed(2)}</td><td>{money(row.amount)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div><div className="button-row"><button className="small-button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><span className="hint">Page {page} of {totalPages}</span><button className="small-button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button></div>{records.length === 0 && <div className="empty">No credit union contribution records found.</div>}</div>
  </section>;
}
