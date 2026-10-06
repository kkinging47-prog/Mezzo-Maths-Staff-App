import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { StatusMessage } from '../components/StatusMessage';
import { useCompanyLogo } from '../components/CompanyLogo';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

function staffLabel(row: Profile) {
  return [row.full_name, row.staff_no, row.email, row.position].filter(Boolean).join(' · ') || row.id;
}
function escapeXml(value: string) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function dataUrlFromSvg(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function birthdayThisYear(dateOfBirth?: string | null) {
  if (!dateOfBirth) return '';
  const [month, day] = dateOfBirth.slice(5, 10).split('-');
  const year = new Date().getFullYear();
  return `${year}-${month}-${day}`;
}
function defaultMessage(name: string) {
  return `Happy Birthday, ${name}!\n\nFrom all of us at Mezzo House Limited, we celebrate you today. Thank you for your dedication, teamwork and contribution to improving mathematics education. May your new year be filled with joy, strength, favour and greater achievements.`;
}
function splitLines(text: string, max = 46) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) { lines.push(current); current = word; } else current = next;
  });
  if (current) lines.push(current);
  return lines.slice(0, 7);
}

export function BirthdayCards() {
  const { profile } = useAuth();
  const logoUrl = useCompanyLogo();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [title, setTitle] = useState('Happy Birthday');
  const [message, setMessage] = useState('');
  const [birthdayDate, setBirthdayDate] = useState('');
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  const selectedStaff = useMemo(() => staff.find((row) => row.id === selectedStaffId), [staff, selectedStaffId]);
  const staffName = selectedStaff?.full_name || selectedStaff?.email || 'Staff Member';
  const cardMessage = message || defaultMessage(staffName);

  async function loadStaff() {
    const { data, error } = await supabase.from('profiles').select('*').neq('role', 'admin').neq('status', 'left').order('full_name');
    if (error) { setStatusType('error'); setStatus(error.message); return; }
    const rows = (data || []) as Profile[];
    setStaff(rows);
    const first = rows[0];
    if (!selectedStaffId && first) {
      setSelectedStaffId(first.id);
      setBirthdayDate(birthdayThisYear(first.date_of_birth));
      setMessage(defaultMessage(first.full_name || first.email || 'Staff Member'));
    }
  }
  useEffect(() => { loadStaff(); }, []);

  function changeStaff(id: string) {
    const person = staff.find((row) => row.id === id);
    setSelectedStaffId(id);
    setBirthdayDate(birthdayThisYear(person?.date_of_birth));
    setMessage(defaultMessage(person?.full_name || person?.email || 'Staff Member'));
  }

  function buildSvg() {
    const lines = splitLines(cardMessage, 52);
    const messageSvg = lines.map((line, index) => `<text x="540" y="430" dy="${index * 36}" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" fill="#23314d">${escapeXml(line)}</text>`).join('');
    const dateText = birthdayDate ? new Date(`${birthdayDate}T00:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'Today';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f7fbff"/><stop offset="0.55" stop-color="#e8f3ff"/><stop offset="1" stop-color="#fff6de"/></linearGradient>
        <linearGradient id="blue" x1="0" x2="1"><stop offset="0" stop-color="#0a4c9a"/><stop offset="1" stop-color="#0d8f83"/></linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#11324d" flood-opacity="0.18"/></filter>
      </defs>
      <rect width="1080" height="1080" fill="url(#bg)"/>
      <circle cx="120" cy="145" r="90" fill="#0a4c9a" opacity="0.12"/>
      <circle cx="960" cy="925" r="150" fill="#0d8f83" opacity="0.12"/>
      <path d="M0 825 C210 720 360 835 540 760 C720 685 855 720 1080 610 L1080 1080 L0 1080 Z" fill="#0a4c9a" opacity="0.08"/>
      <rect x="88" y="92" width="904" height="896" rx="42" fill="#ffffff" filter="url(#shadow)"/>
      <rect x="88" y="92" width="904" height="130" rx="42" fill="url(#blue)"/>
      <text x="540" y="172" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="800" fill="#ffffff">MEZZO MATHS</text>
      <text x="540" y="278" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#0a4c9a">${escapeXml(title || 'Happy Birthday')}</text>
      <text x="540" y="354" text-anchor="middle" font-family="Arial, sans-serif" font-size="62" font-weight="900" fill="#0f172a">${escapeXml(staffName)}</text>
      ${messageSvg}
      <rect x="350" y="710" width="380" height="78" rx="39" fill="url(#blue)"/>
      <text x="540" y="760" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="800" fill="#ffffff">${escapeXml(dateText)}</text>
      <text x="540" y="895" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="#0a4c9a">From Management and Staff</text>
      <text x="540" y="934" text-anchor="middle" font-family="Arial, sans-serif" font-size="23" fill="#64748b">Mezzo House Limited</text>
      <g opacity="0.9"><circle cx="245" cy="292" r="11" fill="#f59e0b"/><circle cx="824" cy="305" r="11" fill="#0d8f83"/><circle cx="820" cy="676" r="9" fill="#0a4c9a"/><circle cx="248" cy="672" r="9" fill="#f59e0b"/></g>
    </svg>`;
  }

  const generatedImageUrl = useMemo(() => dataUrlFromSvg(buildSvg()), [staffName, title, cardMessage, birthdayDate]);
  const previewImageUrl = customImageUrl || generatedImageUrl;

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomImageUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  function downloadCard() {
    const link = document.createElement('a');
    link.href = previewImageUrl;
    link.download = `birthday-card-${staffName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'staff'}.svg`;
    link.click();
  }

  async function postToDashboard(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true); setStatus('');
    const body = cardMessage;
    const { error } = await supabase.from('company_posts').insert({
      author_id: profile.id,
      title: `${title || 'Happy Birthday'}: ${staffName}`,
      body,
      priority: 'normal',
      post_type: 'birthday',
      image_url: previewImageUrl,
    });
    setBusy(false);
    if (error) { setStatusType('error'); setStatus(error.message); }
    else { setStatusType('success'); setStatus('Birthday e-card posted to the dashboard successfully.'); }
  }

  if (profile?.role !== 'admin') return <div className="empty">This page is for admin only.</div>;

  return <section>
    <div className="page-header"><div><h1>Birthday E-Cards</h1><p>Create, preview, download and post staff birthday e-cards without loading the main Admin page.</p></div></div>
    <StatusMessage message={status} type={statusType} />
    <div className="grid two">
      <form className="panel form-grid" onSubmit={postToDashboard}>
        <h2>Create Birthday Card</h2>
        <label>Staff Member<select value={selectedStaffId} onChange={(e) => changeStaff(e.target.value)}>{staff.map((row) => <option key={row.id} value={row.id}>{staffLabel(row)}</option>)}</select></label>
        <div className="grid two"><label>Card Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Birthday Date<input type="date" value={birthdayDate} onChange={(e) => setBirthdayDate(e.target.value)} /></label></div>
        <label>Birthday Message<textarea rows={8} value={cardMessage} onChange={(e) => setMessage(e.target.value)} /></label>
        <label>Upload Custom E-card Image<input type="file" accept="image/*" onChange={handleUpload} /></label>
        {customImageUrl && <button type="button" className="secondary" onClick={() => setCustomImageUrl('')}>Use Generated Card Instead</button>}
        <div className="button-row"><button className="primary" disabled={busy || !selectedStaffId}>{busy ? 'Posting...' : 'Post Birthday E-card'}</button><button type="button" className="secondary" onClick={downloadCard}>Download Preview</button></div>
        <p className="hint">The card will appear on the company dashboard as a birthday announcement.</p>
      </form>
      <div className="panel">
        <h2>Live Preview</h2>
        <div className="post-image-card"><img src={previewImageUrl} alt="Birthday card preview" /></div>
        <div className="approval-card approved"><span>Selected staff: <strong>{staffName}</strong></span><span>Date of birth on file: <strong>{selectedStaff?.date_of_birth || 'Not set'}</strong></span><span>Preview type: <strong>{customImageUrl ? 'Uploaded image' : 'Generated card'}</strong></span></div>
      </div>
    </div>
  </section>;
}
