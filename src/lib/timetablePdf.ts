import jsPDF from 'jspdf';

export function makeTimetablePdf(rows: any[], name: string, year = '2026/2027', term = 'Term 1') {
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('MEZZO HOUSE LIMITED', 20, 20);
  doc.setFontSize(13);
  doc.text('SCHOOL TIMETABLE', 20, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Name: ${name}`, 20, 45);
  doc.text(`Academic Year: ${year}`, 20, 52);
  doc.text(`Term: ${term}`, 20, 59);
  let y = 75;
  doc.setFont('helvetica', 'bold');
  doc.text('Day', 20, y); doc.text('Time', 48, y); doc.text('Mins', 75, y); doc.text('Class', 100, y); doc.text('School', 128, y); doc.text('Location', 162, y);
  doc.setFont('helvetica', 'normal');
  y += 8;
  rows.forEach((row) => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(String(row.day_of_week || ''), 20, y);
    doc.text(String(row.start_time || '').slice(0, 5), 48, y);
    doc.text(String(row.duration_minutes || ''), 75, y);
    doc.text(String(row.class_name || '').slice(0, 12), 100, y);
    doc.text(String(row.school_name || row.schools?.name || '').slice(0, 18), 128, y);
    doc.text(String(row.location || row.schools?.address || '').slice(0, 18), 162, y);
    y += 8;
  });
  doc.save('school_timetable.pdf');
}
