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

type MemberType = 'staff' | 'external';
type UploadRow = { member_type: MemberType; staff_id: string | null; external_name: string | null; staff_name: string; contribution_month: string; number_of_shares: number; amount: number; dividend_per_share: number; dividend_amount: number; contribution_type: string; notes: string; matched: boolean; raw_member_name: string };
type RawUpload = { memberType: MemberType; staffName: string; externalName: string; month: any; year?: string; amount: number; shares: number; dividendPerShare?: number; notes?: string };

function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toFixed(2)}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function clean(value: any) { return String(value ?? '').trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function numeric(value: any) { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function sharesFromRow(row: any) { if (row.number_of_shares !== null && row.number_of_shares !== undefined) return Number(row.number_of_shares || 0); return Number(row.amount || 0) / Number(row.share_value || SHARE_VALUE); }
function rowMemberName(row: any) { return row.member_type === 'external' ? row.external_name : (row.staff?.full_name || row.staff?.email || '-'); }
function rowMemberKey(row: any) { return row.member_type === 'external' ? `external:${normalize(row.external_name || '')}` : `staff:${row.staff_id}`; }
function yearFromDate(value?: string | null) { return value && value.length >= 4 ? value.slice(0, 4) : ''; }
function detectYear(...values: any[]) { for (const value of values) { const found = clean(value).match(/20\d{2}/); if (found) return found[0]; } return ''; }
function monthFromText(value: any) { const key = clean(value).toLowerCase().replace(/[^a-z]/g, ''); return monthMap[key] || monthMap[key.slice(0, 3)] || ''; }
function monthDate(value: any, fallbackYear: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-01`;
  const raw = clean(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) {
    const [a, b, c] = raw.split('/');
    const yyyy = c.length === 2 ? `20${c}` : c;
    return `${yyyy}-${a.padStart(2, '0')}-01`;
  }
  const year = detectYear(raw) || fallbackYear;
  const month = monthFromText(raw);
  return month && year ? `${year}-${month}-01` : '';
}
function monthHeader(header: any, fallbackYear: string) { const raw = clean(header); const month = monthFromText(raw); const year = detectYear(raw) || fallbackYear; return month && year ? `${year}-${month}-01` : ''; }
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
  const [summaryKey, setSummaryKey] = useState('');
  const [summaryYear, setSummaryYear] = useState(String(new Date().getFullYear()));
  const [form, setForm] = useState({ member_type: 'staff' as MemberType, staff_id: '', external_name: '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
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
      if (error) setMessage(error.message); else {
        setRecords(contributionRows || []);
        if (!summaryKey && contributionRows?.[0]) setSummaryKey(rowMemberKey(contributionRows[0]));
      }
    } else {
      const { data, error } = await supabase.from('credit_union_contributions').select(contributionSelect).eq('staff_id', profile.id).order('contribution_month', { ascending: false }).limit(1000);
      if (error) setMessage(error.message); else setRecords(data || []);
    }
  }

  useEffect(() => { load(); }, [profile?.id, isAdmin]);

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!isAdmin || !profile) return;
    if (calculated.shares <= 0) { setMessage('Please enter a valid number of shares.'); return; }
    if (form.member_type === 'staff' && !form.staff_id) { setMessage('Please select a staff member.'); return; }
    if (form.member_type === 'external' && !form.external_name.trim()) { setMessage('Please enter the external member name.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('credit_union_contributions').insert({
        member_type: form.member_type,
        staff_id: form.member_type === 'staff' ? form.staff_id : null,
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
    const rows: any[] = staff.map((person) => ({ 'Member Type': 'staff', 'Staff Name': person.full_name || person.email || '', 'External Member Name': '', Year: uploadYear, JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '', 'Dividend Per Share': uploadDividendPerShare || '', Notes: '' }));
    rows.push({ 'Member Type': 'external', 'Staff Name': '', 'External Member Name': 'Type non-staff member name here', Year: uploadYear, JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '', 'Dividend Per Share': uploadDividendPerShare || '', Notes: 'Example external member row' });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 28 }, { wch: 10 }, ...MONTHS.map(() => ({ wch: 10 })), { wch: 18 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Credit Union Template');
    XLSX.writeFile(wb, `mezzo-credit-union-template-${uploadYear}.xlsx`);
  }

  function parseTemplateRows(rows: any[][]): RawUpload[] | null {
    const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(clean(cell)) === 'member type') && row.some((cell) => normalize(clean(cell)) === 'year'));
    if (headerIndex < 0) return null;
    const headers = rows[headerIndex].map((cell) => normalize(clean(cell)));
    const memberTypeIndex = headers.indexOf('member type');
    const staffIndex = headers.indexOf('staff name');
    const externalIndex = headers.indexOf('external member name');
    const yearIndex = headers.indexOf('year');
    const dividendIndex = headers.indexOf('dividend per share');
    const notesIndex = headers.indexOf('notes');
    const monthColumns = rows[headerIndex].map((cell, index) => ({ index, month: monthFromText(cell), headerYear: detectYear(cell) })).filter((item) => item.month);
    const parsed: RawUpload[] = [];
    rows.slice(headerIndex + 1).forEach((row) => {
      const memberType = normalize(row[memberTypeIndex]).includes('external') ? 'external' : 'staff';
      const staffName = clean(row[staffIndex]);
      const externalName = clean(row[externalIndex]);
      const rowYear = detectYear(row[yearIndex]) || uploadYear;
      const dividend = dividendIndex >= 0 ? numeric(row[dividendIndex]) : numeric(uploadDividendPerShare);
      const notes = notesIndex >= 0 ? clean(row[notesIndex]) : '';
      const name = memberType === 'external' ? externalName : staffName;
      if (!name) return;
      monthColumns.forEach(({ index, month, headerYear }) => {
        const amount = numeric(row[index]);
        const year = headerYear || rowYear;
        if (amount > 0 && year) parsed.push({ memberType, staffName, externalName, month: `${year}-${month}-01`, year, amount, shares: 0, dividendPerShare: dividend, notes });
      });
    });
    return parsed;
  }

  function parseStandardRows(rows: any[][]): RawUpload[] | null {
    const headers = (rows[0] || []).map((cell) => normalize(clean(cell)));
    const staffIndex = headers.findIndex((h) => ['staff', 'staff name', 'name', 'worker', 'worker name'].includes(h));
    const externalIndex = headers.findIndex((h) => ['external member name', 'external name', 'non staff name'].includes(h));
    const typeIndex = headers.findIndex((h) => ['member type', 'type'].includes(h));
    const yearIndex = headers.findIndex((h) => h === 'year');
    const monthIndex = headers.findIndex((h) => ['month', 'date', 'contribution month'].includes(h));
    const amountIndex = headers.findIndex((h) => ['amount', 'amnt', 'contribution', 'contribution amount'].includes(h));
    const sharesIndex = headers.findIndex((h) => ['shares', 'number of shares', 'no of shares', 'no shares'].includes(h));
    const dividendIndex = headers.findIndex((h) => ['dividend per share', 'dividend amount per share'].includes(h));
    if (monthIndex < 0 || (staffIndex < 0 && externalIndex < 0) || (amountIndex < 0 && sharesIndex < 0)) return null;
    return rows.slice(1).map((row) => {
      const memberType = normalize(row[typeIndex]).includes('external') || (externalIndex >= 0 && clean(row[externalIndex])) ? 'external' : 'staff';
      return { memberType, staffName: staffIndex >= 0 ? clean(row[staffIndex]) : '', externalName: externalIndex >= 0 ? clean(row[externalIndex]) : '', month: row[monthIndex], year: yearIndex >= 0 ? detectYear(row[yearIndex]) : '', amount: amountIndex >= 0 ? numeric(row[amountIndex]) : 0, shares: sharesIndex >= 0 ? numeric(row[sharesIndex]) : 0, dividendPerShare: dividendIndex >= 0 ? numeric(row[dividendIndex]) : undefined, notes: '' };
    }).filter((row) => (row.staffName || row.externalName) && monthDate(row.month, row.year || uploadYear) && (row.amount > 0 || row.shares > 0));
  }

  function parseOldWideRows(rows: any[][]): RawUpload[] {
    const parsed: RawUpload[] = [];
    const maxCols = Math.max(...rows.map((row) => row.length), 0);
    for (let col = 0; col < maxCols - 1; col += 1) {
      for (let headerRow = 0; headerRow < Math.min(rows.length, 20); headerRow += 1) {
        const name = clean(rows[headerRow]?.[col]);
        const next = normalize(clean(rows[headerRow + 1]?.[col]));
        const amountHead = normalize(clean(rows[headerRow + 1]?.[col + 1]));
        if (!name || name.toLowerCase().includes('month') || name.toLowerCase().includes('total')) continue;
        if (!next.startsWith('month') || !(amountHead.includes('amnt') || amountHead.includes('amount'))) continue;
        const localYear = detectYear(name, rows[headerRow]?.[col + 1], rows[headerRow - 1]?.[col], rows[headerRow - 1]?.[col + 1]) || uploadYear;
        for (let rowIndex = headerRow + 2; rowIndex < rows.length; rowIndex += 1) {
          const monthValue = rows[rowIndex]?.[col];
          const monthText = clean(monthValue);
          const amount = numeric(rows[rowIndex]?.[col + 1]);
          const normalizedMonth = normalize(monthText);
          if (!monthText) continue;
          if (normalizedMonth.startsWith('total') || normalizedMonth.startsWith('no of') || normalizedMonth.startsWith('no ')) break;
          if (monthDate(monthValue, localYear) && amount > 0) parsed.push({ memberType: 'staff', staffName: name.replace(/20\d{2}/g, '').trim(), externalName: '', month: monthValue, year: localYear, amount, shares: 0, dividendPerShare: undefined, notes: '' });
        }
        break;
      }
    }
    return parsed;
  }

  async function previewUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('Reading credit union file...');
    setUploadPreview([]); setUploadErrorRows([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const allRaw: RawUpload[] = [];
      workbook.SheetNames.forEach((sheetName) => {
        const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
        const parsed = parseTemplateRows(rows) || parseStandardRows(rows) || parseOldWideRows(rows);
        parsed.forEach((row) => allRaw.push({ ...row, notes: row.notes || `Bulk upload from ${file.name} - ${sheetName}` }));
      });
      const fallbackDividend = Number(uploadDividendPerShare || 0);
      const nextRows: UploadRow[] = [];
      const unmatched: string[] = [];
      allRaw.forEach((row) => {
        const contributionMonth = monthDate(row.month, row.year || uploadYear);
        const memberType = row.memberType;
        const rawName = memberType === 'external' ? row.externalName : row.staffName;
        const staffId = memberType === 'staff' ? findStaffId(staff, rawName) : '';
        const matched = memberType === 'external' ? Boolean(rawName) : Boolean(staffId);
        const shares = row.shares > 0 ? row.shares : row.amount / SHARE_VALUE;
        const dividendPerShare = row.dividendPerShare !== undefined && row.dividendPerShare > 0 ? row.dividendPerShare : fallbackDividend;
        if (!matched && rawName && !unmatched.includes(rawName)) unmatched.push(rawName);
        if (!contributionMonth || shares <= 0) return;
        nextRows.push({ member_type: memberType, staff_id: staffId || null, external_name: memberType === 'external' ? rawName : null, staff_name: memberType === 'external' ? rawName : staffLabel(staff, staffId, rawName), raw_member_name: rawName, contribution_month: contributionMonth, number_of_shares: Number(shares.toFixed(2)), amount: Number((shares * SHARE_VALUE).toFixed(2)), dividend_per_share: dividendPerShare, dividend_amount: Number((shares * dividendPerShare).toFixed(2)), contribution_type: 'old_record', notes: row.notes || `Bulk upload from ${file.name}`, matched });
      });
      setUploadPreview(nextRows);
      setUploadErrorRows(unmatched);
      setMessage(`${nextRows.length} contribution row(s) found across the file. Review the preview, then click Save Preview.`);
    } catch (error: any) { setMessage(error.message || 'Could not read the file. Save it as Excel .xlsx or CSV and try again.'); }
  }

  async function importPreview() {
    if (!profile || !isAdmin) return;
    const rows = uploadPreview.filter((row) => row.matched && (row.staff_id || row.external_name));
    if (rows.length === 0) { setMessage('No valid records to save. Check the preview and member names.'); return; }
    setBusy(true); setMessage('');
    try {
      for (const row of rows) {
        if (row.member_type === 'staff' && row.staff_id) {
          await supabase.from('credit_union_contributions').delete().eq('staff_id', row.staff_id).eq('contribution_month', row.contribution_month);
        }
        if (row.member_type === 'external' && row.external_name) {
          await supabase.from('credit_union_contributions').delete().eq('member_type', 'external').eq('external_name', row.external_name).eq('contribution_month', row.contribution_month);
        }
      }
      const payload = rows.map((row) => ({ member_type: row.member_type, staff_id: row.staff_id, external_name: row.external_name, recorded_by: profile.id, contribution_month: row.contribution_month, share_value: SHARE_VALUE, number_of_shares: row.number_of_shares, amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, contribution_type: row.contribution_type, notes: row.notes }));
      const { error } = await supabase.from('credit_union_contributions').insert(payload);
      if (error) throw error;
      setMessage(`${rows.length} credit union record(s) saved. Existing same member/month records were updated.`);
      setUploadPreview([]); setUploadErrorRows([]); setPage(1);
      await load();
    } catch (error: any) { setMessage(error.message || 'Could not save credit union records.'); } finally { setBusy(false); }
  }

  async function deleteContribution(id: string) {
    if (!isAdmin) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('credit_union_contributions').delete().eq('id', id);
    setBusy(false);
    if (error) setMessage(error.message); else { setMessage('Contribution removed.'); await load(); }
  }

  function exportCsv() {
    downloadCsv('credit-union-contributions.csv', records.map((row) => ({ member_type: row.member_type || 'staff', member: rowMemberName(row), position: row.staff?.position, month: row.contribution_month, number_of_shares: sharesFromRow(row), share_value: row.share_value || SHARE_VALUE, contribution_amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, type: row.contribution_type, notes: row.notes, created_at: row.created_at })));
  }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalShares = records.reduce((sum, row) => sum + sharesFromRow(row), 0);
  const totalDividends = records.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0);
  const thisMonth = currentMonth();
  const monthTotal = records.filter((row) => row.contribution_month === thisMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const pageRows = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((row) => { const key = rowMemberKey(row); if (key && !key.endsWith(':')) map.set(key, rowMemberName(row)); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [records]);
  const availableYears = useMemo(() => Array.from(new Set(records.map((row) => yearFromDate(row.contribution_month)).filter(Boolean))).sort((a, b) => b.localeCompare(a)), [records]);
  const selectedSummaryRows = records.filter((row) => rowMemberKey(row) === summaryKey && yearFromDate(row.contribution_month) === summaryYear);
  const summaryMonths = MONTHS.map((label, index) => {
    const mm = String(index + 1).padStart(2, '0');
    const rows = selectedSummaryRows.filter((row) => row.contribution_month?.slice(5, 7) === mm);
    return { label, amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), shares: rows.reduce((sum, row) => sum + sharesFromRow(row), 0), dividend: rows.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0) };
  });
  const previewMatched = uploadPreview.filter((row) => row.matched).length;
  const previewTotal = uploadPreview.reduce((sum, row) => sum + row.amount, 0);

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Each credit union share is GHS 20. Record staff and non-staff members, including 2025 and 2026 data in the same upload.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four"><div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div><div className="metric-card"><span>Total Shares</span><strong>{totalShares.toFixed(2)}</strong></div><div className="metric-card"><span>Total Dividends</span><strong>{money(totalDividends)}</strong></div><div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div></div>

    {isAdmin && <div className="panel form-grid">
      <h2>Excel Template Upload</h2>
      <p className="hint">Download the template, enter amounts under JAN–DEC, and use the Year column for 2025 or 2026. You may keep both years in one file by using separate rows for each year.</p>
      <div className="grid three"><label>Default Year<input value={uploadYear} onChange={(e) => setUploadYear(e.target.value)} placeholder="2026" /></label><label>Dividend Per Share<input type="number" min="0" step="0.01" value={uploadDividendPerShare} onChange={(e) => setUploadDividendPerShare(e.target.value)} placeholder="Optional" /></label><div className="button-row"><button type="button" className="primary" onClick={downloadTemplate}>Download App Template</button></div></div>
      <label>Upload Filled Template<input type="file" accept=".xlsx,.xls,.csv" onChange={previewUpload} /></label>
      {uploadErrorRows.length > 0 && <div className="status error"><strong>Unmatched staff names:</strong> {uploadErrorRows.join(', ')}. External members are allowed when Member Type is external.</div>}
      {uploadPreview.length > 0 && <div><div className="grid three"><div className="metric-card"><span>Preview Rows</span><strong>{uploadPreview.length}</strong></div><div className="metric-card"><span>Ready to Save</span><strong>{previewMatched}</strong></div><div className="metric-card"><span>Preview Total</span><strong>{money(previewTotal)}</strong></div></div><div className="button-row"><button className="primary" disabled={busy || previewMatched === 0} onClick={importPreview}>{busy ? 'Saving...' : 'Save Preview'}</button><button className="small-button" onClick={() => { setUploadPreview([]); setUploadErrorRows([]); }}>Clear Preview</button></div><div className="table-card compact-table"><table><thead><tr><th>Status</th><th>Member Type</th><th>Name</th><th>Year</th><th>Month</th><th>Amount</th><th>Shares</th><th>Dividend</th></tr></thead><tbody>{uploadPreview.slice(0, 80).map((row, index) => <tr key={`${row.raw_member_name}-${row.contribution_month}-${index}`}><td><span className={`pill ${row.matched ? 'status-approved' : 'status-rejected'}`}>{row.matched ? 'Ready' : 'Unmatched'}</span></td><td>{row.member_type}</td><td>{row.staff_name}</td><td>{yearFromDate(row.contribution_month)}</td><td>{row.contribution_month}</td><td>{money(row.amount)}</td><td>{row.number_of_shares.toFixed(2)}</td><td>{money(row.dividend_amount)}</td></tr>)}</tbody></table></div></div>}
    </div>}

    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}>
      <h2>Add Contribution Manually</h2>
      <div className="grid two"><label>Member Type<select value={form.member_type} onChange={(e) => setForm({ ...form, member_type: e.target.value as MemberType })}><option value="staff">Staff Member</option><option value="external">Non-staff Member</option></select></label>{form.member_type === 'staff' ? <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label> : <label>External Member Name<input value={form.external_name} onChange={(e) => setForm({ ...form, external_name: e.target.value })} placeholder="Type non-staff member name" /></label>}<label>Contribution Month / Date<input type="date" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label><label>Number of Shares<input type="number" min="0" step="0.01" value={form.number_of_shares} onChange={(e) => setForm({ ...form, number_of_shares: e.target.value })} required /></label><label>Share Value<input value="GHS 20.00" disabled /></label><label>Contribution Amount<input value={money(calculated.amount)} disabled /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={form.dividend_per_share} onChange={(e) => setForm({ ...form, dividend_per_share: e.target.value })} /></label><label>Total Dividend<input value={money(calculated.dividendAmount)} disabled /></label><label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="old_record">Old / Past Years Record</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label></div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button>
    </form>}

    {isAdmin && <div className="panel form-grid"><h2>Member Yearly Summary</h2><div className="grid two"><label>Select Member<select value={summaryKey} onChange={(e) => setSummaryKey(e.target.value)}>{memberOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Select Year<select value={summaryYear} onChange={(e) => setSummaryYear(e.target.value)}>{(availableYears.length ? availableYears : [summaryYear]).map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div><div className="grid three"><div className="metric-card"><span>Year Contribution</span><strong>{money(selectedSummaryRows.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</strong></div><div className="metric-card"><span>Year Shares</span><strong>{selectedSummaryRows.reduce((sum, row) => sum + sharesFromRow(row), 0).toFixed(2)}</strong></div><div className="metric-card"><span>Year Dividend</span><strong>{money(selectedSummaryRows.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0))}</strong></div></div><div className="table-card compact-table"><table><thead><tr><th>Month</th><th>Contribution</th><th>Shares</th><th>Dividend</th></tr></thead><tbody>{summaryMonths.map((row) => <tr key={row.label}><td>{row.label}</td><td>{money(row.amount)}</td><td>{row.shares.toFixed(2)}</td><td>{money(row.dividend)}</td></tr>)}</tbody></table></div></div>}

    <div className="panel"><h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2><p className="hint">Showing {pageRows.length} of {records.length} records. Page {page} of {pageCount}.</p><div className="button-row"><button className="small-button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><button className="small-button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</button></div><div className="table-card"><table><thead><tr><th>Month</th><th>Member</th><th>Type</th><th>Shares</th><th>Contribution</th><th>Dividend / Share</th><th>Total Dividend</th><th>Record Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{pageRows.map((row) => <tr key={row.id}><td>{row.contribution_month}</td><td>{rowMemberName(row)}</td><td>{row.member_type || 'staff'}</td><td>{sharesFromRow(row).toFixed(2)}</td><td>{money(row.amount)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>{records.length === 0 && <div className="empty">No credit union contribution records found.</div>}</div>
  </section>;
}
