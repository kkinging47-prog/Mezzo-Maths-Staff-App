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

type UploadRow = { staff_id: string | null; staff_name: string; member_type: 'staff' | 'external'; external_name: string | null; contribution_month: string; number_of_shares: number; amount: number; dividend_per_share: number; dividend_amount: number; contribution_type: string; notes: string; matched: boolean; raw_name: string };
type RawUpload = { memberType: 'staff' | 'external'; staffName: string; externalName: string; month: any; amount: number; dividendPerShare?: number; notes?: string };

function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toFixed(2)}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function clean(value: any) { return String(value ?? '').trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function numeric(value: any) { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function memberName(row: any) { return row.member_type === 'external' ? row.external_name || 'External Member' : row.staff?.full_name || row.staff?.email || 'Staff Member'; }
function memberKey(row: any) { return row.member_type === 'external' ? `external:${normalize(row.external_name || '')}` : `staff:${row.staff_id || ''}`; }
function sharesFromRow(row: any) { if (row.number_of_shares !== null && row.number_of_shares !== undefined) return Number(row.number_of_shares || 0); return Number(row.amount || 0) / Number(row.share_value || SHARE_VALUE); }
function monthDate(value: any, year: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-01`;
  const raw = clean(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) {
    const [a, b, c] = raw.split('/');
    const yyyy = c.length === 2 ? `20${c}` : c;
    return `${yyyy}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  const month = monthMap[key.slice(0, 3)] || monthMap[key];
  return month ? `${year}-${month}-01` : '';
}
function findStaffId(staff: Profile[], rawName: string) {
  const target = normalize(rawName);
  if (!target) return '';
  const exact = staff.find((person) => normalize(person.full_name || '') === target || normalize(person.email || '') === target);
  if (exact) return exact.id;
  const fuzzy = staff.find((person) => {
    const name = normalize(person.full_name || person.email || '');
    return name && (name.includes(target) || target.includes(name));
  });
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
  const [summaryMemberKey, setSummaryMemberKey] = useState('');
  const [summaryYear, setSummaryYear] = useState(String(new Date().getFullYear()));
  const [form, setForm] = useState({ member_type: 'staff', staff_id: '', external_name: '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
  const [uploadYear, setUploadYear] = useState(String(new Date().getFullYear()));
  const [uploadDividendPerShare, setUploadDividendPerShare] = useState('');
  const [uploadPreview, setUploadPreview] = useState<UploadRow[]>([]);
  const [uploadErrorRows, setUploadErrorRows] = useState<string[]>([]);
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
        supabase.from('credit_union_contributions').select(contributionSelect).order('contribution_month', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else setRecords(contributionRows || []);
    } else {
      const { data, error } = await supabase.from('credit_union_contributions').select(contributionSelect).eq('staff_id', profile.id).order('contribution_month', { ascending: false }).limit(1000);
      if (error) setMessage(error.message); else setRecords(data || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);
  useEffect(() => { setPage(1); }, [records.length]);

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    if (form.member_type === 'staff' && !form.staff_id) { setMessage('Please select a staff member.'); return; }
    if (form.member_type === 'external' && !form.external_name.trim()) { setMessage('Please enter the non-staff member name.'); return; }
    if (calculated.shares <= 0) { setMessage('Please enter a valid number of shares.'); return; }
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
      setForm((prev) => ({ ...prev, contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', notes: '' }));
      await load();
    } catch (error: any) { setMessage(error.message || 'Could not save contribution.'); } finally { setBusy(false); }
  }

  function downloadTemplate() {
    const templateRows = staff.map((person) => ({ 'Member Type': 'staff', 'Staff Name': person.full_name || person.email || '', 'External Member Name': '', Year: uploadYear, ...Object.fromEntries(MONTHS.map((m) => [m, ''])), 'Dividend Per Share': uploadDividendPerShare || '', Notes: '' }));
    for (let i = 1; i <= 10; i += 1) templateRows.push({ 'Member Type': 'external', 'Staff Name': '', 'External Member Name': `External Member ${i}`, Year: uploadYear, ...Object.fromEntries(MONTHS.map((m) => [m, ''])), 'Dividend Per Share': uploadDividendPerShare || '', Notes: '' });
    const sheet = XLSX.utils.json_to_sheet(templateRows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Credit Union Template');
    XLSX.writeFile(book, `credit-union-template-${uploadYear}.xlsx`);
  }

  function parseTemplateRows(rows: any[][]) {
    const headers = (rows[0] || []).map((cell) => normalize(clean(cell)));
    const memberTypeIndex = headers.findIndex((h) => h === 'member type');
    const staffIndex = headers.findIndex((h) => ['staff name', 'staff', 'name'].includes(h));
    const externalIndex = headers.findIndex((h) => ['external member name', 'external name', 'non staff name'].includes(h));
    const yearIndex = headers.findIndex((h) => h === 'year');
    const dividendIndex = headers.findIndex((h) => ['dividend per share', 'dividend amount per share', 'dividend'].includes(h));
    const notesIndex = headers.findIndex((h) => h === 'notes');
    const monthIndexes = MONTHS.map((month) => ({ month, index: headers.findIndex((h) => h === month.toLowerCase() || h === monthMap[month.toLowerCase()]) })).filter((item) => item.index >= 0);
    if (staffIndex < 0 && externalIndex < 0) return null;
    const parsed: RawUpload[] = [];
    rows.slice(1).forEach((row) => {
      const typeRaw = normalize(clean(row[memberTypeIndex] || 'staff'));
      const memberType: 'staff' | 'external' = typeRaw.includes('external') || typeRaw.includes('non') ? 'external' : 'staff';
      const staffName = clean(row[staffIndex]);
      const externalName = clean(row[externalIndex]);
      const rowYear = clean(row[yearIndex]) || uploadYear;
      const dividend = dividendIndex >= 0 ? numeric(row[dividendIndex]) : numeric(uploadDividendPerShare);
      const notes = notesIndex >= 0 ? clean(row[notesIndex]) : '';
      monthIndexes.forEach(({ month, index }) => {
        const amount = numeric(row[index]);
        if (amount > 0) parsed.push({ memberType, staffName, externalName, month, amount, dividendPerShare: dividend, notes: notes || `Template upload for ${rowYear}` });
      });
    });
    return parsed;
  }

  function parseScreenshotStyleRows(rows: any[][]) {
    const parsed: RawUpload[] = [];
    const maxCols = Math.max(...rows.map((row) => row.length), 0);
    for (let col = 0; col < maxCols - 1; col += 1) {
      for (let headerRow = 0; headerRow < Math.min(rows.length, 5); headerRow += 1) {
        const name = clean(rows[headerRow]?.[col]);
        const next = normalize(clean(rows[headerRow + 1]?.[col]));
        const amountHead = normalize(clean(rows[headerRow + 1]?.[col + 1]));
        if (!name || normalize(name).includes('month') || normalize(name).includes('total')) continue;
        if (!next.startsWith('month') || !(amountHead.includes('amnt') || amountHead.includes('amount'))) continue;
        for (let rowIndex = headerRow + 2; rowIndex < rows.length; rowIndex += 1) {
          const monthValue = rows[rowIndex]?.[col];
          const monthText = clean(monthValue);
          const amount = numeric(rows[rowIndex]?.[col + 1]);
          const normalizedMonth = normalize(monthText);
          if (!monthText) continue;
          if (normalizedMonth.startsWith('total') || normalizedMonth.startsWith('no of') || normalizedMonth.startsWith('no ')) break;
          if (monthDate(monthValue, uploadYear) && amount > 0) parsed.push({ memberType: 'staff', staffName: name, externalName: '', month: monthValue, amount, dividendPerShare: numeric(uploadDividendPerShare), notes: `Bulk upload for ${uploadYear}` });
        }
        break;
      }
    }
    return parsed;
  }

  async function previewUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('Reading credit union file...'); setUploadPreview([]); setUploadErrorRows([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
      const rawRows = parseTemplateRows(rows) || parseScreenshotStyleRows(rows);
      const nextRows: UploadRow[] = [];
      const unmatched: string[] = [];
      rawRows.forEach((row) => {
        const contributionMonth = monthDate(row.month, uploadYear);
        const externalName = row.memberType === 'external' ? row.externalName || row.staffName : '';
        const staffId = row.memberType === 'staff' ? findStaffId(staff, row.staffName) : '';
        const rawName = row.memberType === 'external' ? externalName : row.staffName;
        const shares = row.amount / SHARE_VALUE;
        const dividendPerShare = row.dividendPerShare !== undefined ? row.dividendPerShare : numeric(uploadDividendPerShare);
        const matched = row.memberType === 'external' ? Boolean(externalName) : Boolean(staffId);
        if (!matched && rawName && !unmatched.includes(rawName)) unmatched.push(rawName);
        if (!contributionMonth || shares <= 0) return;
        nextRows.push({ staff_id: staffId || null, member_type: row.memberType, external_name: row.memberType === 'external' ? externalName : null, staff_name: row.memberType === 'external' ? externalName : staffLabel(staff, staffId, row.staffName), raw_name: rawName, contribution_month: contributionMonth, number_of_shares: Number(shares.toFixed(2)), amount: Number(row.amount.toFixed(2)), dividend_per_share: dividendPerShare, dividend_amount: Number((shares * dividendPerShare).toFixed(2)), contribution_type: 'old_record', notes: row.notes || `Bulk upload from ${file.name}`, matched });
      });
      setUploadPreview(nextRows); setUploadErrorRows(unmatched);
      setMessage(`${nextRows.length} contribution row(s) found. Review the preview, then click Import Preview.`);
    } catch (error: any) { setMessage(error.message || 'Could not read the file. Save it as Excel .xlsx or CSV and try again.'); }
  }

  async function importPreview() {
    if (!profile || !isAdmin) return;
    const rows = uploadPreview.filter((row) => row.matched);
    if (rows.length === 0) { setMessage('No matched records to import. Check the names in the template.'); return; }
    setBusy(true); setMessage('');
    try {
      const payload = rows.map((row) => ({ staff_id: row.member_type === 'staff' ? row.staff_id : null, member_type: row.member_type, external_name: row.member_type === 'external' ? row.external_name : null, recorded_by: profile.id, contribution_month: row.contribution_month, share_value: SHARE_VALUE, number_of_shares: row.number_of_shares, amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, contribution_type: row.contribution_type, notes: row.notes }));
      const { error } = await supabase.from('credit_union_contributions').insert(payload);
      if (error) throw error;
      setMessage(`${rows.length} credit union contribution record(s) imported successfully.`);
      setUploadPreview([]); setUploadErrorRows([]); await load();
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
    downloadCsv('credit-union-contributions.csv', records.map((row) => ({ member_type: row.member_type || 'staff', member: memberName(row), position: row.staff?.position, month: row.contribution_month, number_of_shares: sharesFromRow(row), share_value: row.share_value || SHARE_VALUE, contribution_amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, type: row.contribution_type, notes: row.notes, created_at: row.created_at })));
  }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalShares = records.reduce((sum, row) => sum + sharesFromRow(row), 0);
  const totalDividends = records.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0);
  const thisMonth = currentMonth();
  const monthTotal = records.filter((row) => row.contribution_month === thisMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const visibleRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const members = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((row) => { const key = memberKey(row); if (key && !map.has(key)) map.set(key, memberName(row)); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [records]);
  const years = useMemo(() => Array.from(new Set(records.map((row) => String(row.contribution_month || '').slice(0, 4)).filter(Boolean))).sort().reverse(), [records]);
  const summaryRows = MONTHS.map((month, index) => {
    const monthNo = String(index + 1).padStart(2, '0');
    const rows = records.filter((row) => (!summaryMemberKey || memberKey(row) === summaryMemberKey) && String(row.contribution_month || '').slice(0, 4) === summaryYear && String(row.contribution_month || '').slice(5, 7) === monthNo);
    return { month, contribution: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), shares: rows.reduce((sum, row) => sum + sharesFromRow(row), 0), dividend: rows.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0) };
  });
  const summaryTotal = summaryRows.reduce((sum, row) => sum + row.contribution, 0);
  const summaryShares = summaryRows.reduce((sum, row) => sum + row.shares, 0);
  const summaryDividend = summaryRows.reduce((sum, row) => sum + row.dividend, 0);
  const previewMatched = uploadPreview.filter((row) => row.matched).length;
  const previewTotal = uploadPreview.reduce((sum, row) => sum + row.amount, 0);

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Each credit union share is GHS 20. Record staff and non-staff credit union members.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four"><div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div><div className="metric-card"><span>Total Shares</span><strong>{totalShares.toFixed(2)}</strong></div><div className="metric-card"><span>Total Dividends</span><strong>{money(totalDividends)}</strong></div><div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div></div>

    {isAdmin && <div className="panel form-grid">
      <h2>Excel Template Upload</h2>
      <p className="hint">Download the app template, enter JAN to DEC amounts, then upload it here. Use Member Type = staff for saved staff, or external for non-staff members.</p>
      <div className="grid three"><label>Template Year<input value={uploadYear} onChange={(e) => setUploadYear(e.target.value)} /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={uploadDividendPerShare} onChange={(e) => setUploadDividendPerShare(e.target.value)} /></label><button type="button" className="primary" onClick={downloadTemplate}>Download App Template</button></div>
      <label>Upload Filled Template / Excel File<input type="file" accept=".xlsx,.xls,.csv" onChange={previewUpload} /></label>
      {uploadPreview.length > 0 && <div><div className="button-row"><button className="primary" disabled={busy || previewMatched === 0} onClick={importPreview}>Import Preview ({previewMatched})</button><span className="pill">Preview Total: {money(previewTotal)}</span></div>{uploadErrorRows.length > 0 && <p className="warning">Unmatched names: {uploadErrorRows.join(', ')}</p>}<div className="table-card compact-table"><table><thead><tr><th>Member</th><th>Type</th><th>Month</th><th>Amount</th><th>Shares</th><th>Dividend</th><th>Status</th></tr></thead><tbody>{uploadPreview.slice(0, 20).map((row, index) => <tr key={`${row.raw_name}-${row.contribution_month}-${index}`}><td>{row.staff_name}</td><td>{row.member_type}</td><td>{row.contribution_month}</td><td>{money(row.amount)}</td><td>{row.number_of_shares.toFixed(2)}</td><td>{money(row.dividend_amount)}</td><td>{row.matched ? 'Ready' : 'Unmatched'}</td></tr>)}</tbody></table></div><p className="hint">Only the first 20 preview rows are shown here. All matched preview rows will import.</p></div>}
    </div>}

    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}>
      <h2>Add Single Contribution</h2>
      <div className="grid two"><label>Member Type<select value={form.member_type} onChange={(e) => setForm({ ...form, member_type: e.target.value })}><option value="staff">Staff Member</option><option value="external">Non-staff Member</option></select></label>{form.member_type === 'staff' ? <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label> : <label>Non-staff Member Name<input value={form.external_name} onChange={(e) => setForm({ ...form, external_name: e.target.value })} placeholder="Enter member name" /></label>}<label>Contribution Month / Date<input type="date" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label><label>Number of Shares<input type="number" min="0" step="0.01" value={form.number_of_shares} onChange={(e) => setForm({ ...form, number_of_shares: e.target.value })} required /></label><label>Share Value<input value="GHS 20.00" disabled /></label><label>Contribution Amount<input value={money(calculated.amount)} disabled /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={form.dividend_per_share} onChange={(e) => setForm({ ...form, dividend_per_share: e.target.value })} /></label><label>Total Dividend<input value={money(calculated.dividendAmount)} disabled /></label><label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="old_record">Old / Past Years Record</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label></div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button>
    </form>}

    <div className="panel form-grid">
      <h2>Member Yearly Summary</h2>
      <p className="hint">Select a name and year to see the person's total contributions, shares and dividend for that year.</p>
      <div className="grid two"><label>Member<select value={summaryMemberKey} onChange={(e) => setSummaryMemberKey(e.target.value)}><option value="">Select member</option>{members.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Year<select value={summaryYear} onChange={(e) => setSummaryYear(e.target.value)}>{(years.length ? years : [summaryYear]).map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div>
      <div className="grid three"><div className="metric-card"><span>Year Total</span><strong>{money(summaryTotal)}</strong></div><div className="metric-card"><span>Year Shares</span><strong>{summaryShares.toFixed(2)}</strong></div><div className="metric-card"><span>Year Dividend</span><strong>{money(summaryDividend)}</strong></div></div>
      <div className="table-card compact-table"><table><thead><tr><th>Month</th><th>Contribution</th><th>Shares</th><th>Dividend</th></tr></thead><tbody>{summaryRows.map((row) => <tr key={row.month}><td>{row.month}</td><td>{money(row.contribution)}</td><td>{row.shares.toFixed(2)}</td><td>{money(row.dividend)}</td></tr>)}</tbody><tfoot><tr><th>Total</th><th>{money(summaryTotal)}</th><th>{summaryShares.toFixed(2)}</th><th>{money(summaryDividend)}</th></tr></tfoot></table></div>
    </div>

    <div className="panel"><h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2><p className="hint">Showing 20 records per page.</p><div className="button-row"><button className="small-button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><span className="pill">Page {page} of {totalPages}</span><button className="small-button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button></div><div className="table-card"><table><thead><tr><th>Month</th><th>Member</th><th>Type</th><th>Shares</th><th>Contribution</th><th>Dividend / Share</th><th>Total Dividend</th><th>Record Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{visibleRecords.map((row) => <tr key={row.id}><td>{row.contribution_month}</td><td>{memberName(row)}</td><td>{row.member_type || 'staff'}</td><td>{sharesFromRow(row).toFixed(2)}</td><td>{money(row.amount)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>{records.length === 0 && <div className="empty">No credit union contribution records found.</div>}</div>
  </section>;
}
