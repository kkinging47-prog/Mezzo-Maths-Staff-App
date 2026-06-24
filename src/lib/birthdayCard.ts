import { format } from 'date-fns';

interface BirthdayCardInput {
  staffName: string;
  position?: string | null;
  birthdayDate?: string;
  message: string;
  photoUrl?: string | null;
  companyName?: string;
}

const defaultCompanyName = import.meta.env.VITE_COMPANY_NAME || 'Mezzo House Limited';

async function urlToImage(url?: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    URL.revokeObjectURL(objectUrl);
    return image;
  } catch {
    return null;
  }
}

function drawCoverImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.max(w / image.width, h / image.height);
  const sw = w / ratio;
  const sh = h / ratio;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 14) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let lines = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      line = word;
      if (lines >= maxLines) return y;
    } else {
      line = testLine;
    }
  }

  if (line && lines < maxLines) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawRibbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, cut = 40) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - cut, y + h / 2);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawBalloon(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x - radius / 2, y - radius / 2, 6, x, y, radius);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.18, color);
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.8, radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c46b16';
  ctx.beginPath();
  ctx.moveTo(x - 8, y + radius - 3);
  ctx.lineTo(x + 8, y + radius - 3);
  ctx.lineTo(x, y + radius + 12);
  ctx.closePath();
  ctx.fill();
}

function getDateParts(date?: string) {
  if (!date) return { day: format(new Date(), 'do'), month: format(new Date(), 'MMMM') };
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return { day: format(new Date(), 'do'), month: format(new Date(), 'MMMM') };
  return { day: format(parsed, 'do'), month: format(parsed, 'MMMM') };
}

export async function generateBirthdayCardImage(input: BirthdayCardInput): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the birthday card canvas.');

  const staffName = input.staffName || 'Staff Member';
  const position = input.position || 'Mezzo Maths Tutor';
  const companyName = input.companyName || defaultCompanyName;
  const { day, month } = getDateParts(input.birthdayDate);
  const photo = await urlToImage(input.photoUrl);

  ctx.fillStyle = '#f9ecef';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = '#90b7ee';
  ctx.fillRect(0, 0, 560, 540);
  ctx.fillRect(540, 540, 540, 540);

  ctx.fillStyle = '#eeeeee';
  drawRoundedRect(ctx, 72, 50, 936, 980, 22);

  ctx.fillStyle = '#0c1a67';
  ctx.beginPath();
  ctx.arc(150, 120, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('Mezzo', 112, 116);
  ctx.font = 'bold 21px Georgia, serif';
  ctx.fillText('MATHS', 116, 143);

  ctx.fillStyle = '#f28c18';
  ctx.fillRect(910, 0, 80, 84);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.font = '31px Georgia, serif';
  ctx.fillText(day.replace('th', 'ᵗʰ').replace('st', 'ˢᵗ').replace('nd', 'ⁿᵈ').replace('rd', 'ʳᵈ'), 950, 34);
  ctx.font = '19px Arial, sans-serif';
  ctx.fillText(month, 950, 62);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#f28c18';
  ctx.beginPath();
  ctx.moveTo(225, 170);
  ctx.lineTo(625, 170);
  ctx.lineTo(595, 232);
  ctx.lineTo(195, 232);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#36a9e1';
  ctx.beginPath();
  ctx.moveTo(235, 180);
  ctx.lineTo(635, 180);
  ctx.lineTo(595, 242);
  ctx.lineTo(195, 242);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(staffName, 420, 220);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#36a9e1';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(535, 242);
  ctx.lineTo(510, 285);
  ctx.lineTo(308, 285);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(304, 285, 7, 0, Math.PI * 2);
  ctx.fill();

  const balloonColors = ['#2fb2ea', '#f28c18', '#2fb2ea', '#f28c18', '#2fb2ea', '#f28c18', '#2fb2ea', '#2fb2ea', '#f28c18'];
  const balloonPositions = [[700, 230], [756, 190], [812, 230], [670, 300], [730, 294], [795, 300], [850, 286], [755, 350], [830, 355]];
  balloonPositions.forEach(([x, y], index) => drawBalloon(ctx, x, y, 45, balloonColors[index]));

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(110, 305, 500, 500);
  ctx.fillStyle = '#f6fff8';
  ctx.fillRect(140, 340, 440, 430);
  if (photo) {
    drawCoverImage(ctx, photo, 140, 340, 440, 430);
  } else {
    ctx.fillStyle = '#dfe7f3';
    ctx.fillRect(140, 340, 440, 430);
    ctx.fillStyle = '#718096';
    ctx.font = 'bold 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Staff Photo', 360, 555);
    ctx.textAlign = 'left';
  }

  ctx.strokeStyle = '#f28c18';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(230, 830);
  ctx.lineTo(200, 895);
  ctx.stroke();
  ctx.strokeStyle = '#36a9e1';
  ctx.beginPath();
  ctx.moveTo(200, 895);
  ctx.lineTo(460, 895);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(420, 830, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#36a9e1';
  ctx.beginPath();
  ctx.moveTo(140, 895);
  ctx.lineTo(490, 895);
  ctx.lineTo(450, 960);
  ctx.lineTo(100, 960);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f28c18';
  ctx.beginPath();
  ctx.moveTo(122, 915);
  ctx.lineTo(495, 915);
  ctx.lineTo(455, 982);
  ctx.lineTo(82, 982);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.font = '27px Arial, sans-serif';
  ctx.fillText(position, 145, 950);

  drawRibbon(ctx, 610, 380, 365, 65, '#f28c18', 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 33px Arial, sans-serif';
  ctx.fillText('We wish you a', 628, 424);

  ctx.fillStyle = '#2b170e';
  ctx.font = '92px Georgia, serif';
  ctx.fillText('HAPPY', 625, 535);
  ctx.fillText('BIRTHDAY', 625, 620);

  ctx.fillStyle = '#111111';
  ctx.font = '30px Arial, sans-serif';
  const message = input.message || 'Today marks a very special day in your life. We join you to celebrate this day and pray that the Lord will bless you and keep you in health, strength and prosperity. God bless you.';
  wrapText(ctx, `“${message}”`, 625, 680, 330, 38, 8);

  ctx.font = '25px Arial, sans-serif';
  ctx.textAlign = 'center';
  wrapText(ctx, `... by management of ${companyName}.`, 790, 980, 360, 31, 2);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/jpeg', 0.92);
}

export function dataUrlToFile(dataUrl: string, filename: string) {
  const [meta, base64] = dataUrl.split(',');
  const mimeMatch = meta.match(/data:(.*?);/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}
