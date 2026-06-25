import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { Profile } from '../types';
import { mezzoLogoDataUrl } from './branding';

function write(doc: jsPDF, text: string, x: number, y: number, width = 170, lineHeight = 6) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function generateBindingAgreement(profile: Profile, signerName?: string) {
  const doc = new jsPDF();
  const name = signerName || profile.full_name || 'Client Staff';
  const today = new Date();
  doc.addImage(mezzoLogoDataUrl, 'JPEG', 18, 12, 24, 24);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('MEZZO HOUSE LIMITED GHANA', 48, 24);
  doc.setFontSize(13); doc.text('EXPLOITATION OF KNOWLEDGE ACQUIRED', 20, 48); doc.text('BINDING AGREEMENT', 20, 58);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  let y = 75;
  y = write(doc, `THIS AGREEMENT is made between MEZZO HOUSE LIMITED herein called EMPLOYER and ${name} herein referred to as CLIENT STAFF on this day ${format(today, 'do')} of ${format(today, 'MMMM')} in the year ${format(today, 'yyyy')} on the use of the knowledge acquired through training of staff by Mezzo House Ltd.`, 20, y);
  y = write(doc, 'This agreement is binding on all teachers of clients and is specified as follows:', 20, y + 4);
  doc.setFont('helvetica', 'bold'); y += 5; doc.text('ARTICLE I. INTELLECTUAL PROPERTY RIGHTS', 20, y); y += 8; doc.setFont('helvetica', 'normal');
  y = write(doc, 'Section 1.01 The Client Staff acknowledges that the Franchisor is the owner of the Trade Marks together with the goodwill associated therewith. Apart from the right of MEZZO HOUSE LTD. to use the Trade Marks pursuant to this Agreement, The Staff Shall acquire no right, title or interest of any kind or nature whatsoever in the Trade Marks or the goodwill associated therewith.', 20, y);
  y = write(doc, 'Section 1.02 The client staff further acknowledges the exclusive rights of MEZZO HOUSE LTD. to own the System and use the Intellectual Property Rights and all matters comprised therein and to utilize and to grant to any other person a franchise to use the System and Intellectual Property Rights and to amend and modify the same by variation, addition, renewal, substitution or howsoever otherwise and to upgrade the System accordingly.', 20, y + 3);
  doc.addPage(); y = 25; doc.setFont('helvetica', 'bold'); doc.text('ARTICLE II. PROHIBITION AGAINST SIMILAR BUSINESS', 20, y); y += 8; doc.setFont('helvetica', 'normal');
  y = write(doc, 'The Client Staff covenants during the Term of this Agreement for the period of employment contract and after the expiration or termination of employment for any reason whatsoever save as authorized hereunder directly or indirectly;', 20, y);
  y = write(doc, 'Section 2.01 Not to operate any other similar course center under any other name and style which uses methods and mental calculation techniques as MEZZO HOUSE LTD;', 20, y + 3);
  y = write(doc, 'Section 2.02 Not to provide in any manner whatsoever during the Term of this Agreement any other form of MEZZO HOUSE LTD. Training courses at any unauthorized school or anywhere else.', 20, y + 3);
  doc.setFont('helvetica', 'bold'); y += 8; doc.text('ARTICLE III. CONFIDENTIAL INFORMATION', 20, y); y += 8; doc.setFont('helvetica', 'normal');
  y = write(doc, 'Section 3.01 The Client Staff hereby acknowledges that all information and knowledge relating to the System and Business is of a strictly confidential nature and accordingly, the client staff covenants that it shall not without written consent of MEZZO HOUSE LTD, whether before or after termination of this Agreement, divulge or use whether directly or indirectly for his or her own benefit or that of any other person, firm or company, any of such information or knowledge relating to the System, the Business, MEZZO HOUSE LTD.', 20, y);
  y = write(doc, 'Section 3.02 The Employee hereby acknowledges that all new information, research work and findings relating to programme and Business inside or outside the organisation premise automatically becomes property of MEZZO HOUSE LTD.', 20, y + 3);
  doc.addPage(); y = 25; doc.setFont('helvetica', 'bold'); doc.text('ARTICLE IV. GOVERNING LAW & DISPUTE RESOLUTION', 20, y); y += 8; doc.setFont('helvetica', 'normal');
  y = write(doc, 'This agreement and all rights and obligations of the parties hereto shall be governed and construed in accordance with the laws of Ghana.', 20, y);
  y = write(doc, 'IN WITNESS WHEREOF the parties (MEZZO HOUSE LTD. and Client Staff) hereto have hereunto set their hands and seals the day and year stated above of the Schedule hereto.', 20, y + 5);
  y += 18; doc.text('SIGNED by:', 20, y); y += 12; doc.text('Mr. .................................................................', 20, y); y += 8; doc.text('on behalf of MEZZO HOUSE LTD.', 20, y);
  y += 22; doc.text('SIGNED by Client Staff:', 20, y); y += 12; doc.text(`Mr./Ms./Mrs. ${name}`, 20, y); y += 10; doc.text('Signature / Typed acceptance: ' + name, 20, y); y += 10; doc.text('Date: ' + format(today, 'dd MMMM yyyy'), 20, y); y += 14; doc.text('Solemnization', 20, y);
  doc.save(`${name.replace(/[^a-z0-9]+/gi, '_')}_Binding_Agreement.pdf`);
}
