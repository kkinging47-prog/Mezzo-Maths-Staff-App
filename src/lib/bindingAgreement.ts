import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { Profile } from '../types';
import { mezzoLogoDataUrl } from './branding';
import { getAdminSignatureAsset } from './adminSignature';

const companyName = 'MEZZO HOUSE LIMITED GHANA';

function fileSafeName(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Client_Staff';
}

function writeWrapped(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 5.6) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawFrame(doc: jsPDF, pageTitle = 'Binding Agreement') {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, width, height, 'F');
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, width, 23, 'F');
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.2);
  doc.line(14, 30, width - 14, 30);
  try { doc.addImage(mezzoLogoDataUrl, 'JPEG', 15, 5, 15, 15); } catch {}
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(companyName, 35, 14);
  doc.setFontSize(9);
  doc.text(pageTitle.toUpperCase(), width - 15, 14, { align: 'right' });
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Generated from the official Mezzo Staff Portal', width / 2, height - 10, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

function sectionHeading(doc: jsPDF, label: string, title: string, x: number, y: number) {
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(x, y - 5, 170, 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 64, 175);
  doc.text(`${label}. ${title}`, x + 4, y + 1.5);
  doc.setTextColor(0, 0, 0);
  return y + 13;
}

function addParagraphs(doc: jsPDF, paragraphs: string[], startY: number) {
  let y = startY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(31, 41, 55);
  paragraphs.forEach((paragraph) => {
    y = writeWrapped(doc, paragraph, 20, y, 170, 5.7);
    y += 4;
  });
  return y;
}

function signatureLine(doc: jsPDF, x: number, y: number, title: string, name: string, subtitle: string) {
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(x, y, x + 72, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(name, x, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(title, x, y + 13);
  doc.text(subtitle, x, y + 18);
  doc.setTextColor(0, 0, 0);
}

export async function generateBindingAgreement(profile: Profile, signerName?: string) {
  const doc = new jsPDF();
  const name = signerName || profile.full_name || 'Client Staff';
  const today = new Date();
  const signature = await getAdminSignatureAsset();

  drawFrame(doc, 'Binding Agreement');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(17);
  doc.text('EXPLOITATION OF KNOWLEDGE ACQUIRED', 105, 46, { align: 'center' });
  doc.setFontSize(14);
  doc.text('BINDING AGREEMENT', 105, 57, { align: 'center' });

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(18, 69, 174, 37, 3, 3, 'FD');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('EMPLOYER', 25, 80);
  doc.text('CLIENT STAFF', 25, 91);
  doc.text('AGREEMENT DATE', 25, 102);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text('MEZZO HOUSE LIMITED', 70, 80);
  doc.text(name, 70, 91);
  doc.text(format(today, 'do MMMM yyyy'), 70, 102);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 120;
  y = writeWrapped(doc, `This Agreement is made between MEZZO HOUSE LIMITED, herein called the Employer, and ${name}, herein referred to as Client Staff, on the use of knowledge acquired through training by Mezzo House Ltd.`, 20, y, 170, 5.7);
  y += 5;
  y = writeWrapped(doc, 'This Agreement is binding on teachers and client staff who receive or use Mezzo House Ltd. training, methods, materials, systems, intellectual property, confidential information, or business knowledge.', 20, y, 170, 5.7);

  y += 8;
  y = sectionHeading(doc, 'ARTICLE I', 'INTELLECTUAL PROPERTY RIGHTS', 20, y);
  y = addParagraphs(doc, [
    'Section 1.01 The Client Staff acknowledges that Mezzo House Ltd. is the owner of the trade marks together with the goodwill associated therewith. Apart from any right granted by Mezzo House Ltd. to use such trade marks, the Client Staff shall acquire no right, title, or interest of any kind in the trade marks or the goodwill associated therewith.',
    'Section 1.02 The Client Staff further acknowledges the exclusive rights of Mezzo House Ltd. to own the System, the intellectual property rights, and all matters comprised therein; to use, amend, modify, renew, substitute, upgrade, and grant approved persons the right to use the System and intellectual property rights.',
  ], y);

  doc.addPage();
  drawFrame(doc, 'Terms and Restrictions');
  y = 42;
  y = sectionHeading(doc, 'ARTICLE II', 'PROHIBITION AGAINST SIMILAR BUSINESS', 20, y);
  y = addParagraphs(doc, [
    'The Client Staff covenants that during the period of employment contract, and after the expiration or termination of employment for any reason whatsoever, except as authorized in writing by Mezzo House Ltd., the Client Staff shall not directly or indirectly use the acquired knowledge in a competing or unauthorized manner.',
    'Section 2.01 The Client Staff shall not operate any similar course centre under any name or style using methods, mental calculation techniques, materials, systems, or business approaches belonging to or associated with Mezzo House Ltd.',
    'Section 2.02 The Client Staff shall not provide Mezzo House Ltd. training courses, methods, systems, or related services at any unauthorized school, centre, business, or location.',
  ], y);

  y += 6;
  y = sectionHeading(doc, 'ARTICLE III', 'CONFIDENTIAL INFORMATION', 20, y);
  y = addParagraphs(doc, [
    'Section 3.01 The Client Staff acknowledges that all information and knowledge relating to the System and Business is strictly confidential. The Client Staff shall not, without the written consent of Mezzo House Ltd., whether before or after termination of this Agreement, divulge or use such information directly or indirectly for personal benefit or for the benefit of any person, firm, school, or company.',
    'Section 3.02 The Employee acknowledges that all new information, research work, findings, programme developments, ideas, and business-related outputs made inside or outside the organization premises in connection with Mezzo House Ltd. automatically become the property of Mezzo House Ltd.',
  ], y);

  doc.addPage();
  drawFrame(doc, 'Execution');
  y = 42;
  y = sectionHeading(doc, 'ARTICLE IV', 'GOVERNING LAW & DISPUTE RESOLUTION', 20, y);
  y = addParagraphs(doc, [
    'This Agreement and all rights and obligations of the parties shall be governed by and construed in accordance with the laws of Ghana.',
    'In witness whereof, the parties hereto have set their hands and seals on the day and year stated in this Agreement.',
  ], y);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(18, 105, 174, 105, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('SIGNATURES', 25, 119);

  const employerY = 150;
  if (signature.dataUrl) {
    try { doc.addImage(signature.dataUrl, signature.format, 25, 127, 55, 20, undefined, 'FAST'); } catch {}
  }
  signatureLine(doc, 25, employerY, 'For and on behalf of MEZZO HOUSE LTD.', signature.name, 'Authorized Signatory');

  const staffY = 150;
  signatureLine(doc, 108, staffY, 'Client Staff', `Mr./Ms./Mrs. ${name}`, `Typed acceptance: ${name}`);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Date: ${format(today, 'dd MMMM yyyy')}`, 108, staffY + 25);
  doc.text('Solemnization: Digitally recorded through the Mezzo Staff Portal', 25, 197);

  doc.save(`${fileSafeName(name)}_Binding_Agreement.pdf`);
}
