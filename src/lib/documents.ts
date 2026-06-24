import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { Payroll, Profile } from '../types';

const companyName = import.meta.env.VITE_COMPANY_NAME || 'Mezzo House Limited';

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return `GHS ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateEmploymentLetter(profile: Profile) {
  const doc = new jsPDF();
  const today = format(new Date(), 'dd MMMM yyyy');
  const name = profile.full_name || 'Staff Member';
  const position = profile.position || 'Teacher';
  const dateEmployed = profile.date_employed ? format(new Date(profile.date_employed), 'dd MMMM yyyy') : 'the stated employment date';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName.toUpperCase(), 20, 20);
  doc.setFontSize(12);
  doc.text('EMPLOYMENT CONFIRMATION LETTER', 20, 35);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Date: ${today}`, 20, 48);
  doc.text(`To: ${name}`, 20, 60);

  const body = [
    `This letter confirms that ${name} is employed by ${companyName} as ${position}.`,
    `The employment date on record is ${dateEmployed}.`,
    '',
    `During the period of employment, ${name} is expected to perform assigned duties professionally, comply with company policies, submit weekly work reports, and represent ${companyName} well at assigned schools.`,
    '',
    'This letter is generated from the official staff portal and may be verified by the administration office.',
    '',
    'Yours faithfully,',
    '',
    'Administrative Manager',
    companyName,
  ];

  let y = 75;
  body.forEach((line) => {
    const split = doc.splitTextToSize(line, 170);
    doc.text(split, 20, y);
    y += split.length * 7;
  });

  doc.save(`${name.replace(/\s+/g, '_')}_Employment_Letter.pdf`);
}

export function generatePayslip(profile: Profile, payroll: Payroll) {
  const doc = new jsPDF();
  const name = profile.full_name || 'Staff Member';
  const month = payroll.month ? format(new Date(payroll.month), 'MMMM yyyy') : 'Selected Month';
  const netPay = Number(payroll.basic_salary || 0) + Number(payroll.allowances || 0) - Number(payroll.deductions || 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName.toUpperCase(), 20, 20);
  doc.setFontSize(13);
  doc.text(`PAYSLIP - ${month.toUpperCase()}`, 20, 35);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Name: ${name}`, 20, 52);
  doc.text(`Staff No.: ${profile.staff_no || '-'}`, 20, 62);
  doc.text(`Position: ${profile.position || '-'}`, 20, 72);
  doc.text(`Paid On: ${payroll.paid_on || '-'}`, 20, 82);

  doc.setFont('helvetica', 'bold');
  doc.text('Earnings', 20, 102);
  doc.text('Amount', 150, 102);
  doc.setFont('helvetica', 'normal');
  doc.text('Basic Salary', 20, 115);
  doc.text(formatMoney(payroll.basic_salary), 150, 115);
  doc.text('Allowances', 20, 128);
  doc.text(formatMoney(payroll.allowances), 150, 128);

  doc.setFont('helvetica', 'bold');
  doc.text('Deductions', 20, 150);
  doc.setFont('helvetica', 'normal');
  doc.text('Total Deductions', 20, 163);
  doc.text(formatMoney(payroll.deductions), 150, 163);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('NET PAY', 20, 190);
  doc.text(formatMoney(netPay), 150, 190);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('This payslip was generated electronically from the staff portal.', 20, 215);

  doc.save(`${name.replace(/\s+/g, '_')}_${month.replace(/\s+/g, '_')}_Payslip.pdf`);
}
