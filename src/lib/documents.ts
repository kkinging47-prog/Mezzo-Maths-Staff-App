import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { AppointmentLetterRequest, Payroll, Profile } from '../types';
import { mezzoLogoDataUrl } from './branding';

const companyName = import.meta.env.VITE_COMPANY_NAME || 'Mezzo House Limited';

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return `GHS ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDate(value?: string | null) {
  if (!value) return null;
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLongDate(value?: string | null, fallback = 'the approved date') {
  const date = toDate(value);
  return date ? format(date, 'do MMMM, yyyy') : fallback;
}

function formatLetterDate(value?: string | null) {
  const date = toDate(value) || new Date();
  return format(date, 'dd - MM - yyyy');
}

function firstName(profile: Profile) {
  const name = profile.full_name || profile.email || 'Staff Member';
  return name.trim().split(/\s+/)[0] || 'Staff Member';
}

function fileSafeName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Staff_Member';
}

function drawAppointmentLetterhead(doc: jsPDF, pageNumber: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(244, 249, 229);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  doc.setDrawColor(139, 179, 42);
  doc.setLineWidth(7);
  doc.line(10, 8, 10, pageHeight - 8);
  doc.line(10, pageHeight - 8, pageWidth - 10, pageHeight - 8);
  doc.setDrawColor(188, 214, 122);
  doc.setLineWidth(0.7);
  for (let i = 0; i < 7; i += 1) {
    doc.line(8, 28 + i * 15, 34 + i * 9, 12 + i * 23);
    doc.line(pageWidth - 8, pageHeight - 35 - i * 13, pageWidth - 50 - i * 4, pageHeight - 5 - i * 8);
  }

  if (pageNumber === 1) {
    try {
      doc.addImage(mezzoLogoDataUrl, 'JPEG', 20, 16, 28, 28);
    } catch {
      doc.setFillColor(17, 24, 39);
      doc.rect(20, 16, 28, 28, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(18, 32, 51);
    doc.text('MEZZO HOUSE LTD.', 60, 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 82, 153);
    const contacts = [
      'Post Office Box 1302',
      'Kaneshie-North, Accra.',
      '+233 (0) 303 930 855',
      '+233 (0) 245 332 495',
      'mezzooffice@gmail.com',
      'mezzohouse@yahoo.com',
    ];
    let y = 20;
    contacts.forEach((line) => {
      const textWidth = doc.getTextWidth(line);
      doc.text(line, pageWidth - 18 - textWidth, y);
      y += 5;
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text('mezzooffice@gmail.com', pageWidth / 2, pageHeight - 6, { align: 'center' });
}

function writeWrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 7) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function generateAppointmentLetter(profile: Profile, request: AppointmentLetterRequest) {
  if (request.status !== 'approved') {
    throw new Error('This appointment letter must be approved by admin before it can be generated.');
  }

  const doc = new jsPDF();
  const name = profile.full_name || 'Staff Member';
  const salutation = firstName(profile);
  const position = request.position || profile.position || 'tutor';
  const appointmentDate = formatLongDate(request.appointment_date || profile.date_employed, 'the approved appointment date');
  const letterDate = formatLetterDate(request.decided_at || request.updated_at || request.requested_at);
  const salaryText = request.monthly_salary ? formatMoney(request.monthly_salary).replace('GHS', 'GH¢') : 'as per agreement with Management';

  drawAppointmentLetterhead(doc, 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(letterDate, 162, 54);
  doc.text(`Dear ${salutation},`, 20, 66);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('LETTER OF APPOINTMENT', 105, 84, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  let y = 99;
  const paragraphs = [
    `This letter is to offer you a full-time appointment as ${position} with Mezzo House Ltd. with effect from ${appointmentDate}.`,
    `You are offered the job of ${position} of Mezzo Maths. You will be assigned to a school/schools and you shall report to the Administrator. You will be on probation period for the first term, your full appointment into the company will be dependent on your output for the first term.`,
    'Your key responsibilities shall be and not limited to:',
  ];
  paragraphs.forEach((paragraph) => { y = writeWrapped(doc, paragraph, 20, y, 170); y += 3; });
  ['i. Teaching of Mezzo Maths', 'ii. Giving report when requested', 'iii. Participating in other Mezzo related activities'].forEach((item) => {
    doc.text(item, 28, y);
    y += 7;
  });
  y += 4;

  const pageOneMore = [
    `Your reporting time to work shall be based on the assigned school's Mezzo time table; failure to adhere to the time shall result in deduction from your salary at source.`,
    'Your acceptance of this appointment bonds you to the company for a minimum of two years, which implies you cannot leave the company until after two years.',
    'Your acceptance of this appointment bonds you to the restricted use of the knowledge acquired from the company anywhere. Violation of this will attract serious consequences. Check the binding agreement for more details on that.',
    `Your salary with Mezzo House Ltd. will be as per agreement with Management based on what the company can afford. Your Salary per month is ${salaryText}. Increments in your salary are contingent solely on your continuous satisfactory performance and increasing competence and commitment in the performance of your duties. In other words, increments in salary are not automatic and certainly not dictated by government budgeting or adjustments. This is so because we are a private company, the income we get to pay staff comes from our work output - quality and quantity.`,
  ];
  pageOneMore.forEach((paragraph) => { y = writeWrapped(doc, paragraph, 20, y, 170); y += 5; });

  doc.addPage();
  drawAppointmentLetterhead(doc, 2);
  y = 35;
  const pageTwo = [
    'Within two (2) weeks of accepting this appointment, you are required to provide the Administrator,',
    '(i) The exact location address of your place of residence including a sketch map to assist in looking for the place,',
    '(ii) Telephone numbers and names of persons to contact in case of emergency, and',
    '(iii) A recent passport photograph.',
    'You are also required to take someone assigned by the company to go with you to know your residence.',
    'We look forward to a harmonious, fruitful and mutually-beneficial working relationship with you.',
    'You are to indicate in writing, within one week, your acceptance or rejection of the appointment.',
  ];
  pageTwo.forEach((paragraph, index) => {
    const x = index >= 1 && index <= 3 ? 32 : 20;
    const width = index >= 1 && index <= 3 ? 155 : 170;
    y = writeWrapped(doc, paragraph, x, y, width);
    y += 5;
  });

  y += 8;
  doc.text('Yours faithfully,', 20, y);
  y += 22;
  doc.text('..........................................', 20, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text('Bishop Dr. Peter Osei Akoto', 20, y);
  y += 8;
  doc.text('CEO', 20, y);

  doc.save(`${fileSafeName(name)}_Appointment_Letter.pdf`);
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
