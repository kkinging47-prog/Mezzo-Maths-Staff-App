import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const SHARE_VALUE = 20;
const PAGE_SIZE = 20;
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const monthMap: Record<string, string> = { jan:'01', january:'01', feb:'02', february:'02', mar:'03', march:'03', apr:'04', april:'04', may:'05', jun:'06', june:'06', jul:'07', july:'07', aug:'08', august:'08', sep:'09', sept:'09', september:'09', oct:'10', october:'10', nov:'11', november:'11', dec:'12', december:'12' };

type MemberType = 'staff' | 'external';
type UploadRow = { member_type: MemberType; staff_id: string | null; external_name: string | null; name: string; contribution_month: string; number_of_shares: number; amount: number; dividend_per_share: number; dividend_amount: number; notes: string; matched: boolean };

function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toFixed(2)}`; }
function currentMonthOnly() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthDate(value: string) { return value && value.length === 7 ? `${value}-01` : value; }
function monthOnly(value?: string | null) { return value ? value.slice(0, 7) : ''; }
function clean(value: any) { return String(value ?? '').trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function numeric(value: any) { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
function rowMemberName(row: any) { return row.member_type === 'external' ? row.external_name : (row.staff?.full_name || row.staff?.email || '-'); }
function rowMemberKey(row: any) { return row.member_type === 'external' ? `external:${normalize(row.external_name || '')}` : `staff:${row.staff_id}`; }
function sharesFromRow(row: any) { return row.number_of_shares !== null && row.number_of_shares !== undefined ? Number(row.number_of_shares || 0) : Number(row.amount || 0) / Number(row.share_value || SHARE_VALUE); }
function yearFromDate(value?: string | null) { return value ? value.slice(0, 4) : ''; }
function monthLabel(value?: string | null) { if (!value) return '-'; const [year, month] = value.slice(0, 7).split('-').map(Number); return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1))); }
function monthFromText(value: any) { const key = clean(value).toLowerCase().replace(/[^a-z]/g, ''); return monthMap[key] || monthMap[key.slice(0, 3)] || ''; }
function findStaffId(staff: Profile[], rawName: string) { const target = normalize(rawName); if (!target) return ''; const exact = staff.find((person) => normalize(person.full_name || '') === target || normalize(person.email || '') === target); if (exact) return exact.id; const fuzzy = staff.find((person) => { const name = normalize(person.full_name || person.email || ''); return name && (name.includes(target) || target.includes(name)); }); return fuzzy?.id || ''; }

export function CreditUnion() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [summaryKey, setSummaryKey] = useState('');
  const [summaryYear, setSummaryYear] = useState(String(new Date().getFullYear()));
  const [form, setForm] = useState({ member_type: 'staff' as MemberType, staff_id: '', external_name: '', contribution_month: currentMonthOnly(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
  const [uploadYear, setUploadYear] = useState(String(new Date().getFullYear()));
  const [uploadDividendPerShare, setUploadDividendPerShare] = useState('');
  const [uploadPreview, setUploadPreview] = useState<UploadRow[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const isAdmin = profile?.role === 'admin';

  const calculated = useMemo(() => { const shares = Number(form.number_of_shares || 0); const dividendPerShare = Number(form.dividend_per_share || 0); return { shares, amount: shares * SHARE_VALUE, dividendAmount: shares * dividendPerShare }; }, [form.number_of_shares, form.dividend_per_share]);

  async function load() {
    if (!profile) return;
    const select = '*, staff:profiles!credit_union_contributions_staff_id_fkey(full_name,email,position)';
    if (isAdmin) {
      const [{ data: staffRows }, { data, error }] = await Promise.all([
        supabase.from('profiles').select('*').neq('status', 'left').order('full_name'),
        supabase.from('credit_union_contributions').select(select).order('contribution_month', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
      ]);
      const staffList = (staffRows || []) as Profile[];
      setStaff(staffList);
      if (!form.staff_id && staffList[0]) setForm((prev) => ({ ...prev, staff_id: staffList[0].id }));
      if (error) setMessage(error.message); else { setRecords(data || []); if (!summaryKey && data?.[0]) setSummaryKey(rowMemberKey(data[0])); }
    } else {
      const { data, error } = await supabase.from('credit_union_contributions').select(select).eq('staff_id', profile.id).order('contribution_month', { ascending: false }).limit(1000);
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
      const contributionMonth = monthDate(form.contribution_month);
      const payload = { member_type: form.member_type, staff_id: form.member_type === 'staff' ? form.staff_id : null, external_name: form.member_type === 'external' ? form.external_name.trim() : null, recorded_by: profile.id, contribution_month: contributionMonth, share_value: SHARE_VALUE, number_of_shares: calculated.shares, amount: calculated.amount, dividend_per_share: Number(form.dividend_per_share || 0), dividend_amount: calculated.dividendAmount, contribution_type: form.contribution_type, notes: form.notes.trim() || null };
      if (form.member_type === 'staff') await supabase.from('credit_union_contributions').delete().eq('staff_id', form.staff_id).eq('contribution_month', contributionMonth);
      if (form.member_type === 'external') await supabase.from('credit_union_contributions').delete().eq('member_type', 'external').eq('external_name', form.external_name.trim()).eq('contribution_month', contributionMonth);
      const { error } = await supabase.from('credit_union_contributions').insert(payload);
      if (error) throw error;
      setMessage(`Credit union contribution saved for ${monthLabel(contributionMonth)}.`);
      setForm((prev) => ({ ...prev, contribution_month: currentMonthOnly(), number_of_shares: '', dividend_per_share: '', notes: '' }));
      await load();
    } catch (error: any) { setMessage(error.message || 'Could not save contribution.'); } finally { setBusy(false); }
  }

  function downloadTemplate() {
    const rows: any[] = staff.map((person) => ({ 'Member Type': 'staff', 'Staff Name': person.full_name || person.email || '', 'External Member Name': '', Year: uploadYear, JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '', 'Dividend Per Share': uploadDividendPerShare || '', Notes: '' }));
    rows.push({ 'Member Type': 'external', 'Staff Name': '', 'External Member Name': 'Type non-staff member name here', Year: uploadYear, JAN: '', FEB: '', MAR: '', APR: '', MAY: '', JUN: '', JUL: '', AUG: '', SEP: '', OCT: '', NOV: '', DEC: '', 'Dividend Per Share': uploadDividendPerShare || '', Notes: 'Example external member row' });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 28 }, { wch: 10 }, ...MONTHS.map(() => ({ wch: 10 })), { wch: 18 }, { wch: 28 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Credit Union Template'); XLSX.writeFile(wb, `mezzo-credit-union-template-${uploadYear}.xlsx`);
  }

  function previewUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setMessage('Reading credit union file...'); setUploadPreview([]); setUploadErrors([]);
    file.arrayBuffer().then((buffer) => {
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const rowsOut: UploadRow[] = []; const unmatched: string[] = [];
      workbook.SheetNames.forEach((sheetName) => {
        const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
        const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(clean(cell)) === 'member type') && row.some((cell) => normalize(clean(cell)) === 'year'));
        if (headerIndex < 0) return;
        const headers = rows[headerIndex].map((cell) => normalize(clean(cell)));
        const typeIndex = headers.indexOf('member type'); const staffIndex = headers.indexOf('staff name'); const externalIndex = headers.indexOf('external member name'); const yearIndex = headers.indexOf('year'); const dividendIndex = headers.indexOf('dividend per share'); const notesIndex = headers.indexOf('notes');
        const monthColumns = rows[headerIndex].map((cell, index) => ({ index, month: monthFromText(cell) })).filter((item) => item.month);
        rows.slice(headerIndex + 1).forEach((row) => {
          const memberType: MemberType = normalize(row[typeIndex]).includes('external') ? 'external' : 'staff';
          const name = memberType === 'external' ? clean(row[externalIndex]) : clean(row[staffIndex]);
          if (!name) return;
          const staffId = memberType === 'staff' ? findStaffId(staff, name) : '';
          const matched = memberType === 'external' ? true : Boolean(staffId);
          if (!matched && !unmatched.includes(name)) unmatched.push(name);
          const year = clean(row[yearIndex]) || uploadYear;
          const dividendPerShare = numeric(row[dividendIndex]) || numeric(uploadDividendPerShare);
          monthColumns.forEach(({ index, month }) => {
            const amount = numeric(row[index]); if (amount <= 0 || !year) return;
            const shares = amount / SHARE_VALUE; const contributionMonth = `${year}-${month}-01`;
            rowsOut.push({ member_type: memberType, staff_id: staffId || null, external_name: memberType === 'external' ? name : null, name: memberType === 'external' ? name : (staff.find((item) => item.id === staffId)?.full_name || name), contribution_month: contributionMonth, number_of_shares: Number(shares.toFixed(2)), amount: Number((shares * SHARE_VALUE).toFixed(2)), dividend_per_share: dividendPerShare, dividend_amount: Number((shares * dividendPerShare).toFixed(2)), notes: clean(row[notesIndex]) || `Bulk upload from ${file.name} - ${sheetName}`, matched });
          });
        });
      });
      setUploadPreview(rowsOut); setUploadErrors(unmatched); setMessage(`${rowsOut.length} contribution row(s) found. Review preview, then click Save Preview.`);
    }).catch((error) => setMessage(error?.message || 'Could not read the file.'));
  }

  async function importPreview() {
    if (!profile || !isAdmin) return;
    const rows = uploadPreview.filter((row) => row.matched && (row.staff_id || row.external_name));
    if (!rows.length) { setMessage('No valid records to save.'); return; }
    setBusy(true); setMessage('');
    try {
      for (const row of rows) { if (row.member_type === 'staff' && row.staff_id) await supabase.from('credit_union_contributions').delete().eq('staff_id', row.staff_id).eq('contribution_month', row.contribution_month); if (row.member_type === 'external' && row.external_name) await supabase.from('credit_union_contributions').delete().eq('member_type', 'external').eq('external_name', row.external_name).eq('contribution_month', row.contribution_month); }
      const payload = rows.map((row) => ({ member_type: row.member_type, staff_id: row.staff_id, external_name: row.external_name, recorded_by: profile.id, contribution_month: row.contribution_month, share_value: SHARE_VALUE, number_of_shares: row.number_of_shares, amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, contribution_type: 'old_record', notes: row.notes }));
      const { error } = await supabase.from('credit_union_contributions').insert(payload); if (error) throw error;
      setMessage(`${rows.length} credit union record(s) saved. Existing same member/month records were updated.`); setUploadPreview([]); setUploadErrors([]); setPage(1); await load();
    } catch (error: any) { setMessage(error.message || 'Could not save records.'); } finally { setBusy(false); }
  }

  async function deleteContribution(id: string) { if (!isAdmin) return; setBusy(true); setMessage(''); const { error } = await supabase.from('credit_union_contributions').delete().eq('id', id); setBusy(false); if (error) setMessage(error.message); else { setMessage('Contribution removed.'); await load(); } }
  function exportCsv() { downloadCsv('credit-union-contributions.csv', records.map((row) => ({ member_type: row.member_type || 'staff', member: rowMemberName(row), position: row.staff?.position, month: row.contribution_month, number_of_shares: sharesFromRow(row), share_value: row.share_value || SHARE_VALUE, contribution_amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, type: row.contribution_type, notes: row.notes, created_at: row.created_at }))); }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalShares = records.reduce((sum, row) => sum + sharesFromRow(row), 0);
  const totalDividends = records.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0);
  const monthTotal = records.filter((row) => monthOnly(row.contribution_month) === currentMonthOnly()).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE)); const pageRows = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const memberOptions = useMemo(() => { const map = new Map<string, string>(); records.forEach((row) => { const key = rowMemberKey(row); if (key && !key.endsWith(':')) map.set(key, rowMemberName(row)); }); return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1])); }, [records]);
  const availableYears = useMemo(() => Array.from(new Set(records.map((row) => yearFromDate(row.contribution_month)).filter(Boolean))).sort((a, b) => b.localeCompare(a)), [records]);
  const selectedSummaryRows = records.filter((row) => rowMemberKey(row) === summaryKey && yearFromDate(row.contribution_month) === summaryYear);
  const summaryMonths = MONTHS.map((label, index) => { const mm = String(index + 1).padStart(2, '0'); const rows = selectedSummaryRows.filter((row) => row.contribution_month?.slice(5, 7) === mm); return { label, amount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), shares: rows.reduce((sum, row) => sum + sharesFromRow(row), 0), dividend: rows.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0) }; });
  const previewMatched = uploadPreview.filter((row) => row.matched).length; const previewTotal = uploadPreview.reduce((sum, row) => sum + row.amount, 0);

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Manual entries now use month only. Each share is GHS 20.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four"><div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div><div className="metric-card"><span>Total Shares</span><strong>{totalShares.toFixed(2)}</strong></div><div className="metric-card"><span>Total Dividends</span><strong>{money(totalDividends)}</strong></div><div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div></div>
    {isAdmin && <div className="panel form-grid"><h2>Excel Template Upload</h2><p className="hint">Download the template, enter amounts under JAN–DEC, and use the Year column for 2025 or 2026.</p><div className="grid three"><label>Default Year<input value={uploadYear} onChange={(e) => setUploadYear(e.target.value)} /></label><label>Dividend Per Share<input type="number" min="0" step="0.01" value={uploadDividendPerShare} onChange={(e) => setUploadDividendPerShare(e.target.value)} /></label><div className="button-row"><button type="button" className="primary" onClick={downloadTemplate}>Download App Template</button></div></div><label>Upload Filled Template<input type="file" accept=".xlsx,.xls,.csv" onChange={previewUpload} /></label>{uploadErrors.length > 0 && <div className="status error"><strong>Unmatched staff names:</strong> {uploadErrors.join(', ')}</div>}{uploadPreview.length > 0 && <div><div className="grid three"><div className="metric-card"><span>Preview Rows</span><strong>{uploadPreview.length}</strong></div><div className="metric-card"><span>Ready to Save</span><strong>{previewMatched}</strong></div><div className="metric-card"><span>Preview Total</span><strong>{money(previewTotal)}</strong></div></div><div className="button-row"><button className="primary" disabled={busy || previewMatched === 0} onClick={importPreview}>{busy ? 'Saving...' : 'Save Preview'}</button><button className="small-button" onClick={() => { setUploadPreview([]); setUploadErrors([]); }}>Clear Preview</button></div></div>}</div>}
    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}><h2>Add Contribution Manually</h2><div className="grid two"><label>Member Type<select value={form.member_type} onChange={(e) => setForm({ ...form, member_type: e.target.value as MemberType })}><option value="staff">Staff Member</option><option value="external">Non-staff Member</option></select></label>{form.member_type === 'staff' ? <label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label> : <label>External Member Name<input value={form.external_name} onChange={(e) => setForm({ ...form, external_name: e.target.value })} /></label>}<label>Contribution Month<input type="month" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label><label>Number of Shares<input type="number" min="0" step="0.01" value={form.number_of_shares} onChange={(e) => setForm({ ...form, number_of_shares: e.target.value })} required /></label><label>Share Value<input value="GHS 20.00" disabled /></label><label>Contribution Amount<input value={money(calculated.amount)} disabled /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={form.dividend_per_share} onChange={(e) => setForm({ ...form, dividend_per_share: e.target.value })} /></label><label>Total Dividend<input value={money(calculated.dividendAmount)} disabled /></label><label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="old_record">Old / Past Years Record</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label></div><label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button></form>}
    {isAdmin && <div className="panel form-grid"><h2>Member Yearly Summary</h2><div className="grid two"><label>Select Member<select value={summaryKey} onChange={(e) => setSummaryKey(e.target.value)}>{memberOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label>Select Year<select value={summaryYear} onChange={(e) => setSummaryYear(e.target.value)}>{(availableYears.length ? availableYears : [summaryYear]).map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div><div className="grid three"><div className="metric-card"><span>Year Contribution</span><strong>{money(selectedSummaryRows.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</strong></div><div className="metric-card"><span>Year Shares</span><strong>{selectedSummaryRows.reduce((sum, row) => sum + sharesFromRow(row), 0).toFixed(2)}</strong></div><div className="metric-card"><span>Year Dividend</span><strong>{money(selectedSummaryRows.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0))}</strong></div></div><div className="table-card compact-table"><table><thead><tr><th>Month</th><th>Contribution</th><th>Shares</th><th>Dividend</th></tr></thead><tbody>{summaryMonths.map((row) => <tr key={row.label}><td>{row.label}</td><td>{money(row.amount)}</td><td>{row.shares.toFixed(2)}</td><td>{money(row.dividend)}</td></tr>)}</tbody></table></div></div>}
    <div className="panel"><h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2><p className="hint">Showing {pageRows.length} of {records.length} records. Page {page} of {pageCount}.</p><div className="button-row"><button className="small-button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><button className="small-button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</button></div><div className="table-card"><table><thead><tr><th>Month</th><th>Member</th><th>Type</th><th>Shares</th><th>Contribution</th><th>Dividend / Share</th><th>Total Dividend</th><th>Record Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{pageRows.map((row) => <tr key={row.id}><td>{monthLabel(row.contribution_month)}</td><td>{rowMemberName(row)}</td><td>{row.member_type || 'staff'}</td><td>{sharesFromRow(row).toFixed(2)}</td><td>{money(row.amount)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>{records.length === 0 && <div className="empty">No credit union contribution records found.</div>}</div>
  </section>;
}
