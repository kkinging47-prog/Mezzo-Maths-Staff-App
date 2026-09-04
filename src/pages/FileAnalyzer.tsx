import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { StatusMessage } from '../components/StatusMessage';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

type RowType = 'income' | 'expense' | 'salary' | 'school' | 'staff' | 'unknown';
type AccuracyStatus = 'unreviewed' | 'accurate' | 'needs_correction';
type ParsedRow = { file: string; sheet: string; year: string; type: RowType; school: string; staff: string; amount: number; description: string };
type FileSummary = { name: string; sheets: number; rows: number; usefulRows: number };
type YearRow = { year: string; schools: number; staff: number; income: number; expenses: number; salaries: number; net: number };
type SavedAnalysis = {
  id: string;
  title: string;
  report_text: string;
  accuracy_status: AccuracyStatus;
  accuracy_notes?: string | null;
  data: any;
  created_at: string;
  updated_at: string;
};

const currentYear = new Date().getFullYear();
const typeLabels: Record<RowType, string> = { income: 'Income', expense: 'Expenditure', salary: 'Salary/Payroll', school: 'School Record', staff: 'Staff Record', unknown: 'Needs Review' };
const accuracyLabels: Record<AccuracyStatus, string> = { unreviewed: 'Not reviewed yet', accurate: 'Reviewed and accurate', needs_correction: 'Needs correction' };

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
  return [
    `Executive view: I reviewed ${files.length} file(s) and ${visibleRows.length} useful row(s). The files show ${analysis.schoolCount} unique school record(s), ${analysis.staffCount} unique staff record(s), total income of ${money(totalIncome)}, expenditure of ${money(totalExpenses)}, salaries/payroll of ${money(totalSalaries)}, and estimated net position of ${money(totalNet)}.`,
    first && latest ? `Period detected: the earliest clear year found is ${first.year} and the latest clear year found is ${latest.year}. In the latest year, the files show ${latest.schools} school(s), ${latest.staff} staff record(s), income of ${money(latest.income)}, expenses of ${money(latest.expenses)}, salaries of ${money(latest.salaries)}, and net position of ${money(latest.net)}.` : 'Period detected: some records do not have clear years. Use files with Date, Year, Month, Paid Date or Employed Date columns for stronger analysis.',
    bestIncome ? `Income insight: the strongest income year found is ${bestIncome.year}, with ${money(bestIncome.income)}. ${latest && bestIncome.year !== latest.year ? `Compared with the latest year, the difference is ${percentChange(bestIncome.income, latest.income)}.` : ''}` : 'Income insight: I could not identify income confidently from the uploaded headings.',
    worstNet ? `Risk insight: the weakest net position found is ${worstNet.year}, at ${money(worstNet.net)}. Review high expenditure, salary totals, unpaid schools and missing income entries for that year.` : 'Risk insight: no net position could be calculated yet.',
    analysis.longestSchools.length ? `School longevity: the longest-running school record found is ${analysis.longestSchools[0][0]}, first appearing in ${analysis.longestSchools[0][1]}.` : 'School longevity: I need school names and years to identify the longest school on the program.',
    analysis.longestStaff.length ? `Staff longevity: the longest staff record found is ${analysis.longestStaff[0][0]}, first appearing in ${analysis.longestStaff[0][1]}.` : 'Staff longevity: I need staff names and years to identify the longest-serving staff member.',
    reviewRate > 20 ? `Data quality warning: ${analysis.needsReview} row(s), about ${reviewRate.toFixed(1)}%, need manual review. The old files may have merged headings, unclear dates, unnamed amount columns, or mixed income/expenditure sheets.` : `Data quality: ${analysis.needsReview} row(s) need manual review. The analyzer found enough structure to produce a useful report.`
  ].filter(Boolean) as string[];
}
function answerQuestion(question: string, analysis: ReturnType<typeof buildAnalysis>, visibleRows: ParsedRow[]) {
  const q = norm(question);
  if (!q) return '';
  const latestYear = analysis.yearRows.filter((row) => /^\d{4}$/.test(row.year)).at(-1);
  if (q.includes('longest') && q.includes('school')) return analysis.longestSchools.length ? `The longest school record found is ${analysis.longestSchools[0][0]}, first seen in ${analysis.longestSchools[0][1]}.` : 'I could not identify a longest school because the files do not show clear school names with years.';
  if (q.includes('longest') && /(staff|worker|employee)/.test(q)) return analysis.longestStaff.length ? `The longest staff record found is ${analysis.longestStaff[0][0]}, first seen in ${analysis.longestStaff[0][1]}.` : 'I could not identify a longest staff member because the files do not show clear staff names with years.';
  if (/(income|earned|revenue)/.test(q)) { const total = analysis.yearRows.reduce((sum, row) => sum + row.income, 0); const top = [...analysis.yearRows].sort((a, b) => b.income - a.income)[0]; return top ? `Total income found is ${money(total)}. The highest income year is ${top.year} with ${money(top.income)}.` : 'No clear income records were found.'; }
  if (/(expense|expenditure|spent)/.test(q)) { const total = analysis.yearRows.reduce((sum, row) => sum + row.expenses, 0); const top = [...analysis.yearRows].sort((a, b) => b.expenses - a.expenses)[0]; return top ? `Total expenditure found is ${money(total)}. The highest expenditure year is ${top.year} with ${money(top.expenses)}.` : 'No clear expenditure records were found.'; }
  if (/(salary|payroll)/.test(q)) { const total = analysis.yearRows.reduce((sum, row) => sum + row.salaries, 0); const top = [...analysis.yearRows].sort((a, b) => b.salaries - a.salaries)[0]; return top ? `Total salary/payroll found is ${money(total)}. The highest salary/payroll year is ${top.year} with ${money(top.salaries)}.` : 'No clear salary/payroll records were found.'; }
  if (q.includes('school') && /(how many|number)/.test(q)) return latestYear ? `The latest clear year is ${latestYear.year}, with ${latestYear.schools} school(s). Across all selected files, I found ${analysis.schoolCount} unique school name(s).` : `Across the selected files, I found ${analysis.schoolCount} unique school name(s).`;
  if (/(staff|worker)/.test(q) && /(how many|number)/.test(q)) return latestYear ? `The latest clear year is ${latestYear.year}, with ${latestYear.staff} staff record(s). Across all selected files, I found ${analysis.staffCount} unique staff name(s).` : `Across the selected files, I found ${analysis.staffCount} unique staff name(s).`;
  if (/(problem|review|error|accurate)/.test(q)) return `${analysis.needsReview} row(s) need manual review. Mark the analysis as accurate only after checking the unclear rows and totals.`;
  const topIncome = topAmount(visibleRows, 'income');
  const topExpense = topAmount(visibleRows, 'expense');
  const latest = latestYear ? `The latest year found is ${latestYear.year}, with income ${money(latestYear.income)}, expenditure ${money(latestYear.expenses)}, salaries ${money(latestYear.salaries)}, and net position ${money(latestYear.net)}.` : 'No clear latest year was detected.';
  return `${latest} ${topIncome ? `The largest income row found is ${money(topIncome.amount)} in ${topIncome.year}.` : ''} ${topExpense ? `The largest expense row found is ${money(topExpense.amount)} in ${topExpense.year}.` : ''}`.trim();
}
function compareAnalysis(beforeRows: YearRow[] = [], afterRows: YearRow[] = []) {
  const before = Object.fromEntries(beforeRows.map((row) => [row.year, row]));
  const after = Object.fromEntries(afterRows.map((row) => [row.year, row]));
  const years = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const changes = years.map((year) => {
    const oldRow = before[year] || { income: 0, expenses: 0, salaries: 0, schools: 0, staff: 0, net: 0 };
    const newRow = after[year] || { income: 0, expenses: 0, salaries: 0, schools: 0, staff: 0, net: 0 };
    const diffIncome = newRow.income - oldRow.income;
    const diffExpenses = newRow.expenses - oldRow.expenses;
    const diffSalaries = newRow.salaries - oldRow.salaries;
    const diffSchools = newRow.schools - oldRow.schools;
    const diffStaff = newRow.staff - oldRow.staff;
    if (!diffIncome && !diffExpenses && !diffSalaries && !diffSchools && !diffStaff) return '';
    return `${year}: income ${diffIncome >= 0 ? '+' : ''}${money(diffIncome)}, expenditure ${diffExpenses >= 0 ? '+' : ''}${money(diffExpenses)}, salaries ${diffSalaries >= 0 ? '+' : ''}${money(diffSalaries)}, schools ${diffSchools >= 0 ? '+' : ''}${diffSchools}, staff ${diffStaff >= 0 ? '+' : ''}${diffStaff}.`;
  }).filter(Boolean);
  return changes.length ? changes : ['No major yearly total change was detected compared with the saved analysis.'];
}

export function FileAnalyzer() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState('');
  const [title, setTitle] = useState(`Mezzo historical file analysis ${new Date().toISOString().slice(0, 10)}`);
  const [accuracyStatus, setAccuracyStatus] = useState<AccuracyStatus>('unreviewed');
  const [accuracyNotes, setAccuracyNotes] = useState('');
  const [editableReport, setEditableReport] = useState('');
  const [reportEdited, setReportEdited] = useState(false);
  const [comparisonNotes, setComparisonNotes] = useState<string[]>([]);
  const [message, setMessage] = useState('Upload old Excel or CSV files to begin AI analysis.');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);
  const [yearFilter, setYearFilter] = useState('all');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  async function loadSavedAnalyses() {
    const { data, error } = await supabase.from('file_analysis_reports').select('*').order('updated_at', { ascending: false });
    if (error) { setType('error'); setMessage(error.message); return; }
    setSavedAnalyses((data || []) as SavedAnalysis[]);
  }
  useEffect(() => { loadSavedAnalyses(); }, []);

  const years = useMemo(() => Array.from(new Set(rows.map((row) => row.year).filter(Boolean))).sort(), [rows]);
  const visibleRows = useMemo(() => rows.filter((row) => yearFilter === 'all' || row.year === yearFilter), [rows, yearFilter]);
  const analysis = useMemo(() => buildAnalysis(visibleRows), [visibleRows]);
  const aiReport = useMemo(() => generateAiReport(analysis, visibleRows, files), [analysis, visibleRows, files]);
  const reviewRows = visibleRows.filter((row) => row.type === 'unknown' || row.year === 'Unknown').slice(0, 80);

  useEffect(() => {
    if (!reportEdited) setEditableReport(aiReport.join('\n\n'));
  }, [aiReport, reportEdited]);

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
      const before = buildAnalysis(rows).yearRows;
      const combinedRows = [...rows, ...nextRows];
      const after = buildAnalysis(combinedRows).yearRows;
      setRows(combinedRows);
      setFiles((previous) => [...previous, ...nextFiles]);
      setComparisonNotes(compareAnalysis(before, after));
      setReportEdited(false);
      setAccuracyStatus('unreviewed');
      setType('success');
      setMessage(selectedSavedId ? `Added ${selected.length} file(s) and compared them with the saved analysis. Review the update notes, then save the updated analysis.` : `AI Analyzer reviewed ${selected.length} file(s). Review, mark accuracy, edit if needed, then save it for reference.`);
    } catch (error: any) {
      setType('error');
      setMessage(error.message || 'Could not analyze the selected files.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  function loadSaved(item: SavedAnalysis) {
    const data = item.data || {};
    setSelectedSavedId(item.id);
    setTitle(item.title || 'Saved analysis');
    setRows(data.rows || []);
    setFiles(data.files || []);
    setYearFilter(data.yearFilter || 'all');
    setEditableReport(item.report_text || '');
    setReportEdited(true);
    setAccuracyStatus(item.accuracy_status || 'unreviewed');
    setAccuracyNotes(item.accuracy_notes || '');
    setComparisonNotes([]);
    setAnswer(''); setQuestion('');
    setType('success'); setMessage('Saved analysis loaded. You can upload new files to compare and update it.');
  }
  function newAnalysis() {
    setSelectedSavedId(''); setRows([]); setFiles([]); setYearFilter('all'); setAccuracyStatus('unreviewed'); setAccuracyNotes(''); setReportEdited(false); setEditableReport(''); setComparisonNotes([]); setAnswer(''); setQuestion(''); setTitle(`Mezzo historical file analysis ${new Date().toISOString().slice(0, 10)}`); setType('info'); setMessage('Started a new analysis. Upload files when ready.');
  }
  async function saveAnalysis(asNew = false) {
    if (!analysis.yearRows.length) { setType('error'); setMessage('Upload and analyze files before saving.'); return; }
    setBusy(true);
    try {
      const payload = {
        title: title.trim() || `Mezzo analysis ${new Date().toISOString().slice(0, 10)}`,
        report_text: editableReport || aiReport.join('\n\n'),
        accuracy_status: accuracyStatus,
        accuracy_notes: accuracyNotes || null,
        data: { rows, files, yearFilter, analysis, comparisonNotes, saved_at: new Date().toISOString() },
        updated_by: profile?.id,
        updated_at: new Date().toISOString(),
      };
      if (selectedSavedId && !asNew) {
        const { error } = await supabase.from('file_analysis_reports').update(payload).eq('id', selectedSavedId);
        if (error) throw error;
        setMessage('Saved analysis updated successfully.');
      } else {
        const { data, error } = await supabase.from('file_analysis_reports').insert({ ...payload, created_by: profile?.id }).select('id').single();
        if (error) throw error;
        setSelectedSavedId(data?.id || '');
        setMessage('Analysis saved successfully for future reference.');
      }
      setType('success');
      await loadSavedAnalyses();
    } catch (error: any) {
      setType('error'); setMessage(error.message || 'Could not save the analysis.');
    } finally { setBusy(false); }
  }
  function askAi() { setAnswer(answerQuestion(question, analysis, visibleRows)); }
  function downloadCsv() {
    const headers = ['Year', 'Schools', 'Staff', 'Income', 'Expenses', 'Salaries', 'Net'];
    const csv = [headers, ...analysis.yearRows.map((row) => [row.year, row.schools, row.staff, row.income, row.expenses, row.salaries, row.net])].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `mezzo-ai-file-analysis-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function downloadAiReport() {
    const text = ['MEZZO AI FILE ANALYSIS REPORT', `Generated: ${new Date().toLocaleString()}`, `Accuracy status: ${accuracyLabels[accuracyStatus]}`, accuracyNotes ? `Review notes: ${accuracyNotes}` : '', '', editableReport || aiReport.join('\n\n'), '', 'YEARLY SUMMARY', ...analysis.yearRows.map((row) => `${row.year}: Schools ${row.schools}, Staff ${row.staff}, Income ${money(row.income)}, Expenditure ${money(row.expenses)}, Salaries ${money(row.salaries)}, Net ${money(row.net)}`)].filter(Boolean).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `mezzo-ai-analysis-report-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(url);
  }

  return <section>
    <div className="page-header"><div><h1>AI File Analyzer</h1><p>Upload old Excel or CSV files, verify the AI report, edit it, save it, then compare future files against the saved analysis.</p></div><div className="button-row"><button type="button" className="secondary" disabled={!analysis.yearRows.length} onClick={downloadAiReport}>Download AI Report</button><button type="button" className="primary" disabled={!analysis.yearRows.length} onClick={downloadCsv}>Download CSV</button></div></div>
    <StatusMessage message={message} type={type} />

    <div className="grid two">
      <div className="panel form-grid">
        <h2>Saved Analyses</h2>
        <label>Open saved analysis<select value={selectedSavedId} onChange={(e) => { const item = savedAnalyses.find((row) => row.id === e.target.value); if (item) loadSaved(item); else newAnalysis(); }}><option value="">Start new analysis</option>{savedAnalyses.map((item) => <option key={item.id} value={item.id}>{item.title} · {accuracyLabels[item.accuracy_status || 'unreviewed']}</option>)}</select></label>
        <div className="button-row"><button type="button" className="secondary" onClick={newAnalysis}>New Analysis</button><button type="button" className="primary" disabled={!analysis.yearRows.length || busy} onClick={() => saveAnalysis(false)}>{selectedSavedId ? 'Update Saved Analysis' : 'Save Analysis'}</button><button type="button" className="secondary" disabled={!analysis.yearRows.length || busy} onClick={() => saveAnalysis(true)}>Save as New Copy</button></div>
      </div>
      <div className="panel form-grid">
        <h2>Accuracy Review</h2>
        <label>Analysis Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Accuracy Status<select value={accuracyStatus} onChange={(e) => setAccuracyStatus(e.target.value as AccuracyStatus)}><option value="unreviewed">Not reviewed yet</option><option value="accurate">Reviewed and accurate</option><option value="needs_correction">Needs correction</option></select></label>
        <label>Review Notes<textarea value={accuracyNotes} onChange={(e) => setAccuracyNotes(e.target.value)} placeholder="Example: 2023 expense total checked against bank statement. Some 2021 school names need correction." /></label>
      </div>
    </div>

    <div className="panel form-grid">
      <h2>Upload Multiple Files</h2>
      <label>Excel / CSV Files<input type="file" multiple accept=".xlsx,.xls,.csv" onChange={analyzeFiles} disabled={busy} /></label>
      <div className="button-row"><button type="button" className="danger" onClick={newAnalysis}>Clear / Start Again</button></div>
      <p className="hint">When a saved analysis is open, newly uploaded files are added and compared against the saved data. Review the comparison notes before updating the saved analysis.</p>
    </div>

    {comparisonNotes.length > 0 && <div className="panel"><h2>AI Update Comparison</h2><div className="approval-card">{comparisonNotes.map((line, index) => <span key={index}>{line}</span>)}</div></div>}

    <div className="panel form-grid">
      <h2>Editable AI Executive Report</h2>
      <p className="hint">Read this report, correct any wording or figures you have verified manually, then mark the accuracy status and save it.</p>
      <textarea rows={10} value={editableReport} onChange={(e) => { setEditableReport(e.target.value); setReportEdited(true); }} />
    </div>

    <div className="panel form-grid"><h2>Ask the AI Analyzer</h2><label>Question<input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Example: Which school has been with us the longest? How much did we earn in 2025?" /></label><div className="button-row"><button type="button" className="primary" onClick={askAi} disabled={!visibleRows.length || !question.trim()}>Ask Analyzer</button></div>{answer && <div className="approval-card"><span>{answer}</span></div>}</div>

    <div className="grid four"><div className="metric-card"><span>Files Loaded</span><strong>{files.length}</strong></div><div className="metric-card"><span>Total Schools Found</span><strong>{analysis.schoolCount}</strong></div><div className="metric-card"><span>Total Staff Found</span><strong>{analysis.staffCount}</strong></div><div className="metric-card"><span>Rows Needing Review</span><strong>{analysis.needsReview}</strong></div></div>

    <div className="panel"><h2>Filter Report</h2><label>Year<select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}><option value="all">All years</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div>

    <div className="panel"><h2>Yearly Report</h2><div className="table-card compact-table"><table><thead><tr><th>Year</th><th>Schools</th><th>Staff</th><th>Income</th><th>Expenditure</th><th>Salaries</th><th>Net Position</th></tr></thead><tbody>{analysis.yearRows.map((row) => <tr key={row.year}><td>{row.year}</td><td>{row.schools}</td><td>{row.staff}</td><td>{money(row.income)}</td><td>{money(row.expenses)}</td><td>{money(row.salaries)}</td><td><strong>{money(row.net)}</strong></td></tr>)}</tbody></table>{!analysis.yearRows.length && <div className="empty">No report yet. Upload Excel or CSV files.</div>}</div></div>

    <div className="grid two"><div className="panel"><h2>Longest Schools on the Program</h2><div className="table-card compact-table"><table><thead><tr><th>School</th><th>First Year Found</th><th>Years Seen</th></tr></thead><tbody>{analysis.longestSchools.map(([school, year]) => <tr key={school}><td>{school}</td><td>{year}</td><td>{currentYear - Number(year) + 1}</td></tr>)}</tbody></table></div></div><div className="panel"><h2>Longest Staff Records</h2><div className="table-card compact-table"><table><thead><tr><th>Staff</th><th>First Year Found</th><th>Years Seen</th></tr></thead><tbody>{analysis.longestStaff.map(([staff, year]) => <tr key={staff}><td>{staff}</td><td>{year}</td><td>{currentYear - Number(year) + 1}</td></tr>)}</tbody></table></div></div></div>

    <div className="panel"><h2>Files Reviewed</h2><div className="table-card compact-table"><table><thead><tr><th>File</th><th>Sheets</th><th>Rows Read</th><th>Useful Rows</th></tr></thead><tbody>{files.map((file) => <tr key={`${file.name}-${file.rows}`}><td>{file.name}</td><td>{file.sheets}</td><td>{file.rows}</td><td>{file.usefulRows}</td></tr>)}</tbody></table></div></div>

    <div className="panel"><h2>Rows to Review</h2><p className="hint">These rows may need clearer headings or dates before the analyzer can classify them accurately.</p><div className="table-card compact-table"><table><thead><tr><th>File</th><th>Sheet</th><th>Year</th><th>Type</th><th>Details</th></tr></thead><tbody>{reviewRows.map((row, index) => <tr key={`${row.file}-${row.sheet}-${index}`}><td>{row.file}</td><td>{row.sheet}</td><td>{row.year}</td><td>{typeLabels[row.type]}</td><td>{row.description}</td></tr>)}</tbody></table>{!reviewRows.length && <div className="empty">No unclear rows in the current filter.</div>}</div></div>
  </section>;
}
