import { ChangeEvent, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { StatusMessage } from '../components/StatusMessage';

type RowType = 'income' | 'expense' | 'salary' | 'school' | 'staff' | 'unknown';
type ParsedRow = {
  file: string;
  sheet: string;
  year: string;
  type: RowType;
  school: string;
  staff: string;
  amount: number;
  description: string;
};
type FileSummary = { name: string; sheets: number; rows: number; usefulRows: number };

const currentYear = new Date().getFullYear();
const typeLabels: Record<RowType, string> = { income: 'Income', expense: 'Expenditure', salary: 'Salary/Payroll', school: 'School Record', staff: 'Staff Record', unknown: 'Needs Review' };

function cleanText(value: unknown) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function norm(value: unknown) { return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function money(value: number) { return `GHS ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function numberValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = cleanText(value).replace(/ghs|g h s|₵|,/gi, '').replace(/\(([^)]+)\)/, '-$1');
  const num = Number(cleaned.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}
function detectYear(value: unknown, fallback = '') {
  if (typeof value === 'number' && value > 25000 && value < 80000) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d?.y) return String(d.y);
  }
  const text = cleanText(value);
  const match = text.match(/20\d{2}|19\d{2}/);
  return match?.[0] || fallback;
}
function findColumn(headers: string[], words: string[]) { return headers.findIndex((head) => words.some((word) => head.includes(word))); }
function likelyHeaderRow(rows: any[][]) {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 12).forEach((row, index) => {
    const words = row.map(norm);
    const score = words.filter(Boolean).length + words.filter((cell) => /(school|staff|name|amount|date|year|income|expense|salary|payment|fees|paid)/.test(cell)).length * 2;
    if (score > bestScore) { best = index; bestScore = score; }
  });
  return best;
}
function classify(headers: string[], sheet: string): RowType {
  const text = `${headers.join(' ')} ${norm(sheet)}`;
  if (/(salary|payroll|payslip|basic salary|allowance|ssnit|paye|staff salary)/.test(text)) return 'salary';
  if (/(expense|expenditure|cost|debit|fuel|printing|rent|transport|paid from)/.test(text)) return 'expense';
  if (/(income|revenue|payment|receipt|fees paid|amount paid|paid by|momo|cheque)/.test(text)) return 'income';
  if (/(school|client|institution|students|enrolment|enrollment|books bought|fee per student)/.test(text)) return 'school';
  if (/(staff|employee|tutor|teacher|worker|department|position)/.test(text)) return 'staff';
  return 'unknown';
}
function rowDescription(record: Record<string, unknown>) {
  return Object.entries(record).slice(0, 8).map(([key, value]) => `${key}: ${cleanText(value)}`).filter((part) => !part.endsWith(':')).join(' | ');
}

export function FileAnalyzer() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [message, setMessage] = useState('Upload old Excel or CSV files to begin analysis.');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  const [yearFilter, setYearFilter] = useState('all');

  async function analyzeFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    setBusy(true);
    const nextRows: ParsedRow[] = [];
    const nextFiles: FileSummary[] = [];
    try {
      for (const file of selected) {
        const buffer = await file.arrayBuffer();
        const book = XLSX.read(buffer, { type: 'array', cellDates: true });
        let usefulRows = 0;
        let totalRows = 0;
        for (const sheetName of book.SheetNames) {
          const sheet = book.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
          if (!sheetRows.length) continue;
          const headerIndex = likelyHeaderRow(sheetRows);
          const headers = sheetRows[headerIndex].map(norm);
          const typeGuess = classify(headers, sheetName);
          const yearCol = findColumn(headers, ['year', 'academic year', 'date', 'month', 'paid date', 'payment date', 'expense date', 'joined', 'employed']);
          const schoolCol = findColumn(headers, ['school', 'client', 'institution']);
          const staffCol = findColumn(headers, ['staff name', 'employee', 'teacher', 'tutor', 'worker', 'name']);
          const incomeCol = findColumn(headers, ['amount paid', 'payment', 'income', 'revenue', 'fees', 'received', 'paid']);
          const expenseCol = findColumn(headers, ['expense', 'expenditure', 'cost', 'unit price', 'debit', 'amount']);
          const salaryCol = findColumn(headers, ['net pay', 'gross', 'salary', 'basic', 'allowance', 'payroll']);
          const fallbackYear = detectYear(file.name) || detectYear(sheetName);
          sheetRows.slice(headerIndex + 1).forEach((line) => {
            const record: Record<string, unknown> = {};
            headers.forEach((head, i) => { if (head) record[head] = line[i]; });
            const valuesText = line.map(cleanText).join(' ');
            if (!valuesText.trim()) return;
            totalRows += 1;
            const rowYear = detectYear(yearCol >= 0 ? line[yearCol] : valuesText, fallbackYear);
            const school = schoolCol >= 0 ? cleanText(line[schoolCol]) : '';
            const staff = staffCol >= 0 ? cleanText(line[staffCol]) : '';
            let amount = 0;
            if (typeGuess === 'income') amount = numberValue(incomeCol >= 0 ? line[incomeCol] : line.find((cell) => numberValue(cell) > 0));
            else if (typeGuess === 'expense') amount = numberValue(expenseCol >= 0 ? line[expenseCol] : line.find((cell) => numberValue(cell) > 0));
            else if (typeGuess === 'salary') amount = numberValue(salaryCol >= 0 ? line[salaryCol] : line.find((cell) => numberValue(cell) > 0));
            const parsed: ParsedRow = { file: file.name, sheet: sheetName, year: rowYear || 'Unknown', type: typeGuess, school, staff, amount, description: rowDescription(record) };
            if (parsed.year !== 'Unknown' || parsed.school || parsed.staff || parsed.amount > 0 || parsed.type !== 'unknown') usefulRows += 1;
            nextRows.push(parsed);
          });
        }
        nextFiles.push({ name: file.name, sheets: book.SheetNames.length, rows: totalRows, usefulRows });
      }
      setRows((previous) => [...previous, ...nextRows]);
      setFiles((previous) => [...previous, ...nextFiles]);
      setType('success');
      setMessage(`Analyzed ${selected.length} file(s). Review the summary below and check rows marked Needs Review.`);
    } catch (error: any) {
      setType('error');
      setMessage(error.message || 'Could not analyze the selected files.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  const years = useMemo(() => Array.from(new Set(rows.map((row) => row.year).filter(Boolean))).sort(), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => yearFilter === 'all' || row.year === yearFilter), [rows, yearFilter]);
  const analysis = useMemo(() => {
    const byYear: Record<string, { schools: Set<string>; staff: Set<string>; income: number; expenses: number; salaries: number }> = {};
    const schoolsFirst: Record<string, string> = {};
    const staffFirst: Record<string, string> = {};
    visibleRows.forEach((row) => {
      const year = row.year || 'Unknown';
      byYear[year] ||= { schools: new Set(), staff: new Set(), income: 0, expenses: 0, salaries: 0 };
      if (row.school) { byYear[year].schools.add(row.school); if (!schoolsFirst[row.school] || year < schoolsFirst[row.school]) schoolsFirst[row.school] = year; }
      if (row.staff) { byYear[year].staff.add(row.staff); if (!staffFirst[row.staff] || year < staffFirst[row.staff]) staffFirst[row.staff] = year; }
      if (row.type === 'income') byYear[year].income += row.amount;
      if (row.type === 'expense') byYear[year].expenses += row.amount;
      if (row.type === 'salary') byYear[year].salaries += row.amount;
    });
    const yearRows = Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b)).map(([year, item]) => ({ year, schools: item.schools.size, staff: item.staff.size, income: item.income, expenses: item.expenses, salaries: item.salaries, net: item.income - item.expenses - item.salaries }));
    const longestSchools = Object.entries(schoolsFirst).filter(([, year]) => /^\d{4}$/.test(year)).sort((a, b) => a[1].localeCompare(b[1])).slice(0, 10);
    const longestStaff = Object.entries(staffFirst).filter(([, year]) => /^\d{4}$/.test(year)).sort((a, b) => a[1].localeCompare(b[1])).slice(0, 10);
    return { yearRows, longestSchools, longestStaff, schoolCount: Object.keys(schoolsFirst).length, staffCount: Object.keys(staffFirst).length, needsReview: visibleRows.filter((row) => row.type === 'unknown' || row.year === 'Unknown').length };
  }, [visibleRows]);

  function downloadCsv() {
    const headers = ['Year', 'Schools', 'Staff', 'Income', 'Expenses', 'Salaries', 'Net'];
    const csv = [headers, ...analysis.yearRows.map((row) => [row.year, row.schools, row.staff, row.income, row.expenses, row.salaries, row.net])].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `mezzo-file-analysis-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <section>
    <div className="page-header"><div><h1>File Analyzer</h1><p>Upload old Excel or CSV records for income, expenditure, schools, staff and salaries. The analysis stays in this browser until you clear it.</p></div><button type="button" className="primary" disabled={!analysis.yearRows.length} onClick={downloadCsv}>Download Report CSV</button></div>
    <StatusMessage message={message} type={type} />

    <div className="panel form-grid">
      <h2>Upload Multiple Files</h2>
      <label>Excel / CSV Files<input type="file" multiple accept=".xlsx,.xls,.csv" onChange={analyzeFiles} disabled={busy} /></label>
      <div className="button-row"><button type="button" className="danger" onClick={() => { setRows([]); setFiles([]); setYearFilter('all'); setType('info'); setMessage('Analyzer cleared. Upload files again when ready.'); }}>Clear Analyzer</button></div>
      <p className="hint">Use files that contain clear headings such as School, Staff, Year, Date, Amount Paid, Expense, Salary, Expenditure, Fees, Payment or Payroll. Rows without clear headings will be marked for review.</p>
    </div>

    <div className="grid four">
      <div className="metric-card"><span>Files Loaded</span><strong>{files.length}</strong></div>
      <div className="metric-card"><span>Total Schools Found</span><strong>{analysis.schoolCount}</strong></div>
      <div className="metric-card"><span>Total Staff Found</span><strong>{analysis.staffCount}</strong></div>
      <div className="metric-card"><span>Rows Needing Review</span><strong>{analysis.needsReview}</strong></div>
    </div>

    <div className="panel"><h2>Filter Report</h2><label>Year<select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}><option value="all">All years</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div>

    <div className="panel"><h2>Yearly Report</h2><div className="table-card compact-table"><table><thead><tr><th>Year</th><th>Schools</th><th>Staff</th><th>Income</th><th>Expenditure</th><th>Salaries</th><th>Net Position</th></tr></thead><tbody>{analysis.yearRows.map((row) => <tr key={row.year}><td>{row.year}</td><td>{row.schools}</td><td>{row.staff}</td><td>{money(row.income)}</td><td>{money(row.expenses)}</td><td>{money(row.salaries)}</td><td><strong>{money(row.net)}</strong></td></tr>)}</tbody></table>{!analysis.yearRows.length && <div className="empty">No report yet. Upload Excel or CSV files.</div>}</div></div>

    <div className="grid two">
      <div className="panel"><h2>Longest Schools on the Program</h2><div className="table-card compact-table"><table><thead><tr><th>School</th><th>First Year Found</th><th>Years Seen</th></tr></thead><tbody>{analysis.longestSchools.map(([school, year]) => <tr key={school}><td>{school}</td><td>{year}</td><td>{currentYear - Number(year) + 1}</td></tr>)}</tbody></table></div></div>
      <div className="panel"><h2>Longest Staff Records</h2><div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>First Year Found</th><th>Years Seen</th></tr></thead><tbody>{analysis.longestStaff.map(([staff, year]) => <tr key={staff}><td>{staff}</td><td>{year}</td><td>{currentYear - Number(year) + 1}</td></tr>)}</tbody></table></div></div>
    </div>

    <div className="panel"><h2>Files Reviewed</h2><div className="table-card compact-table"><table><thead><tr><th>File</th><th>Sheets</th><th>Rows Read</th><th>Useful Rows</th></tr></thead><tbody>{files.map((file) => <tr key={`${file.name}-${file.rows}`}><td>{file.name}</td><td>{file.sheets}</td><td>{file.rows}</td><td>{file.usefulRows}</td></tr>)}</tbody></table></div></div>

    <div className="panel"><h2>Rows to Review</h2><p className="hint">These rows may need clearer headings or dates before the analyzer can classify them accurately.</p><div className="table-card compact-table"><table><thead><tr><th>File</th><th>Sheet</th><th>Year</th><th>Detected Type</th><th>Details</th></tr></thead><tbody>{visibleRows.filter((row) => row.type === 'unknown' || row.year === 'Unknown').slice(0, 80).map((row, index) => <tr key={`${row.file}-${row.sheet}-${index}`}><td>{row.file}</td><td>{row.sheet}</td><td>{row.year}</td><td>{typeLabels[row.type]}</td><td>{row.description}</td></tr>)}</tbody></table></div></div>
  </section>;
}
