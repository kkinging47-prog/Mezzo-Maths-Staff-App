import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../lib/auth';
import { downloadCsv } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const SHARE_VALUE = 20;
const monthMap: Record<string, string> = { jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12' };

type UploadRow = { staff_id: string; staff_name: string; contribution_month: string; number_of_shares: number; amount: number; dividend_per_share: number; dividend_amount: number; contribution_type: string; notes: string; matched: boolean; raw_staff_name: string };

function money(value: number | string | null | undefined) { return `GHS ${Number(value || 0).toFixed(2)}`; }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
function sharesFromRow(row: any) { if (row.number_of_shares !== null && row.number_of_shares !== undefined) return Number(row.number_of_shares || 0); return Number(row.amount || 0) / Number(row.share_value || SHARE_VALUE); }
function clean(value: any) { return String(value ?? '').trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function numeric(value: any) { const n = Number(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; }
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
function staffLabel(staff: Profile[], id: string, fallback: string) { const person = staff.find((row) => row.id === id); return person?.full_name || person?.email || fallback; }

export function CreditUnion() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ staff_id: '', contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
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
        supabase.from('credit_union_contributions').select(contributionSelect).order('contribution_month', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
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
    if (!form.staff_id || calculated.shares <= 0) { setMessage('Please select staff and enter a valid number of shares.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.from('credit_union_contributions').insert({
        staff_id: form.staff_id,
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
      setForm({ staff_id: form.staff_id, contribution_month: currentMonth(), number_of_shares: '', dividend_per_share: '', contribution_type: 'monthly', notes: '' });
      await load();
    } catch (error: any) { setMessage(error.message || 'Could not save contribution.'); } finally { setBusy(false); }
  }

  function parseStandardRows(rows: any[][]) {
    const headers = (rows[0] || []).map((cell) => normalize(clean(cell)));
    const staffIndex = headers.findIndex((h) => ['staff', 'staff name', 'name', 'worker', 'worker name'].includes(h));
    const monthIndex = headers.findIndex((h) => ['month', 'date', 'contribution month'].includes(h));
    const amountIndex = headers.findIndex((h) => ['amount', 'amnt', 'contribution', 'contribution amount'].includes(h));
    const sharesIndex = headers.findIndex((h) => ['shares', 'number of shares', 'no of shares', 'no shares'].includes(h));
    if (staffIndex < 0 || monthIndex < 0 || (amountIndex < 0 && sharesIndex < 0)) return null;
    return rows.slice(1).map((row) => ({ staffName: clean(row[staffIndex]), month: row[monthIndex], amount: amountIndex >= 0 ? numeric(row[amountIndex]) : 0, shares: sharesIndex >= 0 ? numeric(row[sharesIndex]) : 0 })).filter((row) => row.staffName && monthDate(row.month, uploadYear) && (row.amount > 0 || row.shares > 0));
  }

  function parseWideRows(rows: any[][]) {
    const parsed: { staffName: string; month: any; amount: number; shares: number }[] = [];
    const maxCols = Math.max(...rows.map((row) => row.length), 0);
    for (let col = 0; col < maxCols - 1; col += 1) {
      for (let headerRow = 0; headerRow < Math.min(rows.length, 5); headerRow += 1) {
        const name = clean(rows[headerRow]?.[col]);
        const next = normalize(clean(rows[headerRow + 1]?.[col]));
        const amountHead = normalize(clean(rows[headerRow + 1]?.[col + 1]));
        if (!name || name.toLowerCase().includes('month') || name.toLowerCase().includes('total')) continue;
        if (!next.startsWith('month') || !(amountHead.includes('amnt') || amountHead.includes('amount'))) continue;
        for (let rowIndex = headerRow + 2; rowIndex < rows.length; rowIndex += 1) {
          const monthValue = rows[rowIndex]?.[col];
          const monthText = clean(monthValue);
          const amount = numeric(rows[rowIndex]?.[col + 1]);
          const normalizedMonth = normalize(monthText);
          if (!monthText) continue;
          if (normalizedMonth.startsWith('total') || normalizedMonth.startsWith('no of') || normalizedMonth.startsWith('no ')) break;
          if (monthDate(monthValue, uploadYear) && amount > 0) parsed.push({ staffName: name, month: monthValue, amount, shares: 0 });
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
      const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
      const rawRows = parseStandardRows(rows) || parseWideRows(rows);
      const dividendPerShare = Number(uploadDividendPerShare || 0);
      const nextRows: UploadRow[] = [];
      const unmatched: string[] = [];
      rawRows.forEach((row) => {
        const contributionMonth = monthDate(row.month, uploadYear);
        const staffId = findStaffId(staff, row.staffName);
        const shares = row.shares > 0 ? row.shares : row.amount / SHARE_VALUE;
        if (!staffId && row.staffName && !unmatched.includes(row.staffName)) unmatched.push(row.staffName);
        if (!contributionMonth || shares <= 0) return;
        nextRows.push({
          staff_id: staffId,
          staff_name: staffLabel(staff, staffId, row.staffName),
          raw_staff_name: row.staffName,
          contribution_month: contributionMonth,
          number_of_shares: Number(shares.toFixed(2)),
          amount: Number((shares * SHARE_VALUE).toFixed(2)),
          dividend_per_share: dividendPerShare,
          dividend_amount: Number((shares * dividendPerShare).toFixed(2)),
          contribution_type: 'old_record',
          notes: `Bulk upload from ${file.name}`,
          matched: Boolean(staffId),
        });
      });
      setUploadPreview(nextRows);
      setUploadErrorRows(unmatched);
      setMessage(`${nextRows.length} contribution row(s) found. Review the preview, then click Import Preview.`);
    } catch (error: any) { setMessage(error.message || 'Could not read the file. Save it as Excel .xlsx or CSV and try again.'); }
  }

  async function importPreview() {
    if (!profile || !isAdmin) return;
    const rows = uploadPreview.filter((row) => row.matched && row.staff_id);
    if (rows.length === 0) { setMessage('No matched staff records to import. Check that the Excel names match staff names in the app.'); return; }
    setBusy(true); setMessage('');
    try {
      const payload = rows.map((row) => ({ staff_id: row.staff_id, recorded_by: profile.id, contribution_month: row.contribution_month, share_value: SHARE_VALUE, number_of_shares: row.number_of_shares, amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, contribution_type: row.contribution_type, notes: row.notes }));
      const { error } = await supabase.from('credit_union_contributions').insert(payload);
      if (error) throw error;
      setMessage(`${rows.length} credit union contribution record(s) imported successfully.`);
      setUploadPreview([]); setUploadErrorRows([]);
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
    downloadCsv('credit-union-contributions.csv', records.map((row) => ({ staff: row.staff?.full_name || row.staff?.email, position: row.staff?.position, month: row.contribution_month, number_of_shares: sharesFromRow(row), share_value: row.share_value || SHARE_VALUE, contribution_amount: row.amount, dividend_per_share: row.dividend_per_share, dividend_amount: row.dividend_amount, type: row.contribution_type, notes: row.notes, created_at: row.created_at })));
  }

  const total = records.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalShares = records.reduce((sum, row) => sum + sharesFromRow(row), 0);
  const totalDividends = records.reduce((sum, row) => sum + Number(row.dividend_amount || 0), 0);
  const thisMonth = currentMonth();
  const monthTotal = records.filter((row) => row.contribution_month === thisMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const previewMatched = uploadPreview.filter((row) => row.matched).length;
  const previewTotal = uploadPreview.reduce((sum, row) => sum + row.amount, 0);

  return <section>
    <div className="page-header"><div><h1>Credit Union Contributions</h1><p>Each credit union share is GHS 20. Record old contributions and current monthly contributions.</p></div>{isAdmin && <button className="primary" onClick={exportCsv}>Download CSV</button>}</div>
    {message && <div className="status info">{message}</div>}
    <div className="grid four"><div className="metric-card"><span>{isAdmin ? 'Total Contributions' : 'My Total Contributions'}</span><strong>{money(total)}</strong></div><div className="metric-card"><span>Total Shares</span><strong>{totalShares.toFixed(2)}</strong></div><div className="metric-card"><span>Total Dividends</span><strong>{money(totalDividends)}</strong></div><div className="metric-card"><span>This Month</span><strong>{money(monthTotal)}</strong></div></div>

    {isAdmin && <div className="panel form-grid">
      <h2>Bulk Upload from Excel</h2>
      <p className="hint">You can upload the same format shown in your screenshot: staff name at the top, then Month and Amnt under it. The app will divide each amount by GHS 20 to get the number of shares.</p>
      <div className="grid three"><label>Year for JAN-DEC rows<input value={uploadYear} onChange={(e) => setUploadYear(e.target.value)} placeholder="2026" /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={uploadDividendPerShare} onChange={(e) => setUploadDividendPerShare(e.target.value)} placeholder="Optional" /></label><label>Upload Excel or CSV<input type="file" accept=".xlsx,.xls,.csv" onChange={previewUpload} /></label></div>
      <p className="hint">If the sheet has only JAN, FEB, MAR etc., the year above will be used. Rows with amount 0, TOTAL, or No. of shares are ignored.</p>
      {uploadErrorRows.length > 0 && <div className="status error"><strong>Names not matched:</strong> {uploadErrorRows.join(', ')}. Make sure those staff names exist under Admin staff details.</div>}
      {uploadPreview.length > 0 && <div><div className="grid three"><div className="metric-card"><span>Rows Found</span><strong>{uploadPreview.length}</strong></div><div className="metric-card"><span>Matched Staff Rows</span><strong>{previewMatched}</strong></div><div className="metric-card"><span>Preview Total</span><strong>{money(previewTotal)}</strong></div></div><div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>Month</th><th>Amount</th><th>Shares</th><th>Dividend / Share</th><th>Total Dividend</th><th>Status</th></tr></thead><tbody>{uploadPreview.slice(0, 80).map((row, index) => <tr key={`${row.raw_staff_name}-${row.contribution_month}-${index}`}><td>{row.staff_name}</td><td>{row.contribution_month}</td><td>{money(row.amount)}</td><td>{row.number_of_shares.toFixed(2)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className={`pill ${row.matched ? 'status-approved' : 'status-rejected'}`}>{row.matched ? 'Matched' : 'No staff match'}</span></td></tr>)}</tbody></table></div><button className="primary" disabled={busy || previewMatched === 0} onClick={importPreview}>{busy ? 'Importing...' : `Import ${previewMatched} Matched Records`}</button></div>}
    </div>}

    {isAdmin && <form className="panel form-grid" onSubmit={addContribution}><h2>Add One Contribution</h2><p className="hint">For single entries, the system multiplies shares by GHS 20 for the contribution amount, and multiplies dividend amount by number of shares.</p><div className="grid two"><label>Staff<select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>{staff.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select></label><label>Contribution Month / Date<input type="date" value={form.contribution_month} onChange={(e) => setForm({ ...form, contribution_month: e.target.value })} required /></label><label>Number of Shares<input type="number" min="0" step="0.01" value={form.number_of_shares} onChange={(e) => setForm({ ...form, number_of_shares: e.target.value })} placeholder="Example: 5" required /></label><label>Share Value<input value="GHS 20.00" disabled /></label><label>Contribution Amount<input value={money(calculated.amount)} disabled /></label><label>Dividend Amount Per Share<input type="number" min="0" step="0.01" value={form.dividend_per_share} onChange={(e) => setForm({ ...form, dividend_per_share: e.target.value })} placeholder="Example: 2" /></label><label>Total Dividend<input value={money(calculated.dividendAmount)} disabled /></label><label>Type<select value={form.contribution_type} onChange={(e) => setForm({ ...form, contribution_type: e.target.value })}><option value="monthly">Monthly Contribution</option><option value="old_record">Old / Past Years Record</option><option value="top_up">Top Up</option><option value="adjustment">Adjustment</option></select></label></div><label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Example: Contributions from 2022, arrears, or current month." /></label><button className="primary" disabled={busy}>{busy ? 'Saving...' : 'Save Contribution'}</button></form>}

    <div className="panel"><h2>{isAdmin ? 'All Contributions' : 'My Contributions'}</h2><div className="table-card"><table><thead><tr><th>Month</th><th>Staff</th><th>Shares</th><th>Contribution</th><th>Dividend / Share</th><th>Total Dividend</th><th>Type</th><th>Notes</th>{isAdmin && <th>Action</th>}</tr></thead><tbody>{records.map((row) => <tr key={row.id}><td>{row.contribution_month}</td><td>{row.staff?.full_name || row.staff?.email || '-'}</td><td>{sharesFromRow(row).toFixed(2)}</td><td>{money(row.amount)}</td><td>{money(row.dividend_per_share)}</td><td>{money(row.dividend_amount)}</td><td><span className="pill">{row.contribution_type}</span></td><td>{row.notes || '-'}</td>{isAdmin && <td><button className="danger small-button" disabled={busy} onClick={() => deleteContribution(row.id)}>Delete</button></td>}</tr>)}</tbody></table></div>{records.length === 0 && <div className="empty">No credit union contribution records found.</div>}</div>
  </section>;
}
