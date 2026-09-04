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
type YearRow = { year: string; schools: number; staff: number; income: number; expenses: number; salaries: number; net: number };

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
  if (value instanceof Date && !Number.isNaN(value.getTime())) return String(value.getFullYear());
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
  rows.slice(0, 15).forEach((row, index) => {
    const words = row.map(norm);
    const score = words.filter(Boolean).length + words.filter((cell) => /(school|staff|name|amount|date|year|income|expense|salary|payment|fees|paid|revenue|receipt)/.test(cell)).length * 3;
    if (score > bestScore) { best = index; bestScore = score; }
  });
  return best;
}
function classify(headers: string[], sheet: string, rowText = ''): RowType {
  const text = `${headers.join(' ')} ${norm(sheet)} ${norm(rowText)}`;
  if (/(salary|payroll|payslip|basic salary|allowance|ssnit|paye|staff salary|net pay|gross pay)/.test(text)) return 'salary';
  if (/(expense|expenditure|cost|debit|fuel|printing|rent|transport|paid from|utilities|stationery|wages)/.test(text)) return 'expense';
  if (/(income|revenue|payment|receipt|fees paid|amount paid|paid by|momo|cheque|school fees|received)/.test(text)) return 'income';
  if (/(school|client|institution|students|enrolment|enrollment|books bought|fee per student)/.test(text)) return 'school';
  if (/(staff|employee|tutor|teacher|worker|department|position|date employed|date joined)/.test(text)) return 'staff';
  return 'unknown';
}
function rowDescription(record: Record<string, unknown>) {
  return Object.entries(record).slice(0, 10).map(([key, value]) => `${key}: ${cleanText(value)}`).filter((part) => !part.endsWith(':')).join(' | ');
}
function percentChange(previous: number, current: number) {
  if (!previous) return current ? 'new increase from zero' : 'no change';
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}
function topAmount(rows: ParsedRow[], type: RowType) {
  return [...rows].filter((row) => row.type === type && row.amount > 0).sort((a, b) => b.amount - a.amount)[0];
}
function answerQuestion(question: string, analysis: ReturnType<typeof buildAnalysis>, visibleRows: ParsedRow[]) {
  const q = norm(question);
  if (!q) return '';
  const latestYear = analysis.yearRows.filter((row) => /^\d{4}$/.test(row.year)).at(-1);
  const firstYear = analysis.yearRows.find((row) => /^\d{4}$/.test(row.year));
  if (q.includes('longest') && q.includes('school')) return analysis.longestSchools.length ? `The longest school record found is ${analysis.longestSchools[0][0]}, first seen in ${analysis.longestSchools[0][1]}.` : 'I could not identify a longest school because the uploaded files do not show clear school names with years.';
  if (q.includes('longest') && (q.includes('staff') || q.includes('worker') || q.includes('employee'))) return analysis.longestStaff.length ? `The longest staff record found is ${analysis.longestStaff[0][0]}, first seen in ${analysis.longestStaff[0][1]}.` : 'I could not identify a longest staff member because the uploaded files do not show clear staff names with years.';
  if (q.includes('income') || q.includes('earned') || q.includes('revenue')) {
    const total = analysis.yearRows.reduce((sum, row) => sum + row.income, 0);
    const top = [...analysis.yearRows].sort((a, b) => b.income - a.income)[0];
    return top ? `Total income found is ${money(total)}. The highest income year is ${top.year} with ${money(top.income)}.` : 'No clear income records were found.';
  }
  if (q.includes('expense') || q.includes('expenditure') || q.includes('spent')) {
    const total = analysis.yearRows.reduce((sum, row) => sum + row.expenses, 0);
    const top = [...analysis.yearRows].sort((a, b) => b.expenses - a.expenses)[0];
    return top ? `Total expenditure found is ${money(total)}. The highest expenditure year is ${top.year} with ${money(top.expenses)}.` : 'No clear expenditure records were found.';
  }
  if (q.includes('salary') || q.includes('payroll')) {
    const total = analysis.yearRows.reduce((sum, row) => sum + row.salaries, 0);
    const top = [...analysis.yearRows].sort((a, b) => b.salaries - a.salaries)[0];
    return top ? `Total salary/payroll found is ${money(total)}. The highest salary/payroll year is ${top.year} with ${money(top.salaries)}.` : 'No clear salary/payroll records were found.';
  }
  if (q.includes('school') && (q.includes('how many') || q.includes('number'))) return latestYear ? `The latest clear year found is ${latestYear.year}, with ${latestYear.schools} school(s). Across all selected files, I found ${analysis.schoolCount} unique school name(s).` : `Across the selected files, I found ${analysis.schoolCount} unique school name(s).`;
  if ((q.includes('staff') || q.includes('worker')) && (q.includes('how many') || q.includes('number'))) return latestYear ? `The latest clear year found is ${latestYear.year}, with ${latestYear.staff} staff record(s). Across all selected files, I found ${analysis.staffCount} unique staff name(s).` : `Across the selected files, I found ${analysis.staffCount} unique staff name(s).`;
  if (q.includes('first year') || q.includes('started')) return firstYear ? `The earliest year I can see from the uploaded files is ${firstYear.year}.` : 'I could not detect a reliable first year from the uploaded files.';
  if (q.includes('problem') || q.includes('review') || q.includes('error')) return `${analysis.needsReview} row(s) need manual review. These are mostly rows where the year, heading, amount, school or staff name was unclear.`;
  const topIncome = topAmount(visibleRows, 'income');
  const topExpense = topAmount(visibleRows, 'expense');
  const latest = latestYear ? `The latest year found is ${latestYear.year}, with income ${money(latestYear.income)}, expenditure ${money(latestYear.expenses)}, salaries ${money(latestYear.salaries)}, and net position ${money(latestYear.net)}.` : 'No clear latest year was detected.';
  return `${latest} ${topIncome ? `The largest income row found is ${money(topIncome.amount)} in ${topIncome.year}.` : ''} ${topExpense ? `The largest expense row found is ${money(topExpense.amount)} in ${topExpense.year}.` : ''}`.trim();
}
function buildAnalysis(visibleRows: ParsedRow[]) {
  const byYear: Record<string, { schools: Set<string>; staff: Set<string>; income: number; expenses: number; salaries: number }> = {};
  const schoolsFirst: Record<string, string> = {};
  const staffFirst: Record<string, string> = {};
  const schoolAppearances: Record<string, Set<string>> = {};
  const staffAppearances: Record<string, Set<string>> = {};
  visibleRows.forEach((row) => {
    const year = row.year || 'Unknown';
    byYear[year] ||= { schools: new Set(), staff: new Set(), income: 0, expenses: 0, salaries: 0 };
    if (row.school) {
      byYear[year].schools.add(row.school);
      schoolAppearances[row.school] ||= new Set(); schoolAppearances[row.school].add(year);
      if (/^\d{4}$/.test(year) && (!schoolsFirst[row.school] || year < schoolsFirst[row.school])) schoolsFirst[row.school] = year;
    }
    if (row.staff) {
      byYear[year].staff.add(row.staff);
      staffAppearances[row.staff] ||= new Set(); staffAppearances[row.staff].add(year);
      if (/^\d{4}$/.test(year) && (!staffFirst[row.staff] || year < staffFirst[row.staff])) staffFirst[row.staff] = year;
    }
    if (row.type === 'income') byYear[year].income += row.amount;
    if (row.type === 'expense') byYear[year].expenses += row.amount;
    if (row.type === 'salary') byYear[year].salaries += row.amount;
  });
  const yearRows: YearRow[] = Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b)).map(([year, item]) => ({ year, schools: item.schools.size, staff: item.staff.size, income: item.income, expenses: item.expenses, salaries: item.salaries, net: item.income - item.expenses - item.salaries }));
  const longestSchools = Object.entries(schoolsFirst).sort((a, b) => a[1].localeCompare(b[1])).slice(0, 10);
  const longestStaff = Object.entries(staffFirst).sort((a, b) => a[1].localeCompare(b[1])).slice(0, 10);
  return { yearRows, longestSchools, longestStaff, schoolCount: Object.keys(schoolAppearances).length, staffCount: Object.keys(staffAppearances).length, needsReview: visibleRows.filter((row) => row.type === 'unknown' || row.year === 'Unknown').length };
}
function generateAiReport(analysis: ReturnType<typeof buildAnalysis>, visibleRows: ParsedRow[], files: FileSummary[]) {
  if (!analysis.yearRows.length) return ['Upload Excel or CSV files first. I will generate an executive report after reading them.'];
  const clearYears = analysis.yearRows.filter((row) => /^\d{4}$/.test(row.year));
  const first = clearYears[0];
  const latest = clearYears.at(-1);
  const bestIncome = [...analysis.yearRows].sort((a, b) => b.income - a.income)[0];
  const worstNet = [...analysis.yearRows].sort((a, b) => a.net - b.net)[0];
  const totalIncome = analysis.yearRows.reduce((sum, row) => sum + row.income, 0);
  const totalExpenses = analysis.yearRows.reduce((sum, row) => sum + row.expenses, 0);
  const totalSalaries = analysis.yearRows.reduce((sum, row) => sum + row.salaries, 0);
  const totalNet = totalIncome - totalExpenses - totalSalaries;
  const reviewRate = visibleRows.length ? (analysis.needsReview / visibleRows.length) * 100 : 0;
  const report = [
    `Executive view: I reviewed ${files.length} file(s) and ${visibleRows.length} useful row(s). The files show ${analysis.schoolCount} unique school record(s), ${analysis.staffCount} unique staff record(s), total income of ${money(totalIncome)}, expenditure of ${money(totalExpenses)}, salaries/payroll of ${money(totalSalaries)}, and estimated net position of ${money(totalNet)}.`,
    first && latest ? `Period detected: the earliest clear year found is ${first.year} and the latest clear year found is ${latest.year}. In the latest year, the files show ${latest.schools} school(s), ${latest.staff} staff record(s), income of ${money(latest.income)}, expenses of ${money(latest.expenses)}, salaries of ${money(latest.salaries)}, and net position of ${money(latest.net)}.` : 'Period detected: some records do not have clear years. Use files with Date, Year, Month, Paid Date or Employed Date columns for stronger analysis.',
    bestIncome ? `Income insight: the strongest income year found is ${bestIncome.year}, with ${money(bestIncome.income)}. ${latest && bestIncome.year !== latest.year ? `Compared with the latest year, the difference is ${percentChange(bestIncome.income, latest.income)}.` : ''}` : 'Income insight: I could not identify income confidently from the uploaded headings.',
    worstNet ? `Risk insight: the weakest net position found is ${worstNet.year}, at ${money(worstNet.net)}. Review high expenditure, salary totals, unpaid schools and missing income entries for that year.` : 'Risk insight: no net position could be calculated yet.',
    analysis.longestSchools.length ? `School longevity: the longest-running school record found is ${analysis.longestSchools[0][0]}, first appearing in ${analysis.longestSchools[0][1]}.` : 'School longevity: I need school names and years to identify the longest school on the program.',
    analysis.longestStaff.length ? `Staff longevity: the longest staff record found is ${analysis.longestStaff[0][0]}, first appearing in ${analysis.longestStaff[0][1]}.` : 'Staff longevity: I need staff names and years to identify the longest-serving staff member.',
    reviewRate > 20 ? `Data quality warning: ${analysis.needsReview} row(s), about ${reviewRate.toFixed(1)}%, need manual review. The old files may have merged headings, unclear dates, unnamed amount columns, or mixed income/expenditure sheets.` : `Data quality: ${analysis.needsReview} row(s) need manual review. The analyzer found enough structure to produce a useful report.`
  ];
  return report.filter(Boolean) as string[];
}

export function FileAnalyzer() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [message, setMessage] = useState('Upload old Excel or CSV files to begin AI analysis.');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  const [yearFilter, setYearFilter] = useState('all');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

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
          const fallbackYear = detectYear(file.name) || detectYear(sheetName);
          const yearCol = findColumn(headers, ['year', 'academic year', 'date', 'month', 'paid date', 'payment date', 'expense date', 'joined', 'employed']);
          const schoolCol = findColumn(headers, ['school', 'client', 'institution']);
          const staffCol = findColumn(headers, ['staff name', 'employee', 'teacher', 'tutor', 'worker', 'name']);
          const incomeCol = findColumn(headers, ['amount paid', 'payment', 'income', 'revenue', 'fees', 'received', 'paid']);
          const expenseCol = findColumn(headers, ['expense', 'expenditure', 'cost', 'unit price', 'debit', 'amount']);
          const salaryCol = findColumn(headers, ['net pay', 'gross', 'salary', 'basic', 'allowance', 'payroll']);
          sheetRows.slice(headerIndex + 1).forEach((line) => {
            const valuesText = line.map(cleanText).join(' ');
            if (!valuesText.trim()) return;
            totalRows += 1;
            const record: Record<string, unknown> = {};
            headers.forEach((head, i) => { if (head) record[head] = line[i]; });
            const typeGuess = classify(headers, sheetName, valuesText);
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
      setMessage(`AI Analyzer reviewed ${selected.length} file(s). Read the executive report, ask questions, and review unclear rows.`);
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
  const analysis = useMemo(() => buildAnalysis(visibleRows), [visibleRows]);
  const aiReport = useMemo(() => generateAiReport(analysis, visibleRows, files), [analysis, visibleRows, files]);
  const reviewRows = visibleRows.filter((row) => row.type === 'unknown' || row.year === 'Unknown').slice(0, 80);

  function askAi() { setAnswer(answerQuestion(question, analysis, visibleRows)); }
  function downloadCsv() {
    const headers = ['Year', 'Schools', 'Staff', 'Income', 'Expenses', 'Salaries', 'Net'];
    const csv = [headers, ...analysis.yearRows.map((row) => [row.year, row.schools, row.staff, row.income, row.expenses, row.salaries, row.net])].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `mezzo-ai-file-analysis-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function downloadAiReport() {
    const text = ['MEZZO AI FILE ANALYSIS REPORT', `Generated: ${new Date().toLocaleString()}`, '', ...aiReport, '', 'YEARLY SUMMARY', ...analysis.yearRows.map((row) => `${row.year}: Schools ${row.schools}, Staff ${row.staff}, Income ${money(row.income)}, Expenditure ${money(row.expenses)}, Salaries ${money(row.salaries)}, Net ${money(row.net)}`)].join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `mezzo-ai-analysis-report-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(url);
  }

  return <section>
    <div className="page-header"><div><h1>AI File Analyzer</h1><p>Upload many old Excel or CSV records. The analyzer reads income, expenditure, schools, staff and salaries, then writes an executive report.</p></div><div className="button-row"><button type="button" className="secondary" disabled={!analysis.yearRows.length} onClick={downloadAiReport}>Download AI Report</button><button type="button" className="primary" disabled={!analysis.yearRows.length} onClick={downloadCsv}>Download CSV</button></div></div>
    <StatusMessage message={message} type={type} />

    <div className="panel form-grid">
      <h2>Upload Multiple Files</h2>
      <label>Excel / CSV Files<input type="file" multiple accept=".xlsx,.xls,.csv" onChange={analyzeFiles} disabled={busy} /></label>
      <div className="button-row"><button type="button" className="danger" onClick={() => { setRows([]); setFiles([]); setYearFilter('all'); setAnswer(''); setQuestion(''); setType('info'); setMessage('AI Analyzer cleared. Upload files again when ready.'); }}>Clear Analyzer</button></div>
      <p className="hint">The AI report is based only on the files uploaded here. Clear headings such as School, Staff, Date, Year, Amount Paid, Income, Expense, Salary, Expenditure, Fees, Payment and Payroll give the most accurate results.</p>
    </div>

    <div className="panel">
      <h2>AI Executive Report</h2>
      <div className="approval-card approved">{aiReport.map((line, index) => <span key={index}>{line}</span>)}</div>
    </div>

    <div className="panel form-grid">
      <h2>Ask the AI Analyzer</h2>
      <label>Question<input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Example: Which school has been with us the longest? How much did we earn in 2025?" /></label>
      <div className="button-row"><button type="button" className="primary" onClick={askAi} disabled={!visibleRows.length || !question.trim()}>Ask Analyzer</button></div>
      {answer && <div className="approval-card"><span>{answer}</span></div>}
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

    <div className="panel"><h2>Rows to Review</h2><p className="hint">These rows may need clearer headings or dates before the analyzer can classify them accurately.</p><div className="table-card compact-table"><table><thead><tr><th>File</th><th>Sheet</th><th>Year</th><th>Type</th><th>Details</th></tr></thead><tbody>{reviewRows.map((row, index) => <tr key={`${row.file}-${row.sheet}-${index}`}><td>{row.file}</td><td>{row.sheet}</td><td>{row.year}</td><td>{typeLabels[row.type]}</td><td>{row.description}</td></tr>)}</tbody></table>{!reviewRows.length && <div className="empty">No unclear rows in the current filter.</div>}</div></div>
  </section>;
}
