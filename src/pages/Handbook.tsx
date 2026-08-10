import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export function Handbook() {
  const { profile } = useAuth();
  const [handbookUrl, setHandbookUrl] = useState('');
  const [handbookName, setHandbookName] = useState('Company Handbook');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = profile?.role === 'admin';

  async function load() {
    const { data } = await supabase.from('company_settings').select('key,value').in('key', ['company_handbook_url', 'company_handbook_name']);
    const settings = Object.fromEntries((data || []).map((row: any) => [row.key, row.value]));
    setHandbookUrl(settings.company_handbook_url || '');
    setHandbookName(settings.company_handbook_name || 'Company Handbook');
  }

  useEffect(() => { load(); }, []);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (selected) setFile(selected);
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!profile || !isAdmin || !file) { setMessage('Please select the handbook file first.'); return; }
    setBusy(true); setMessage('');
    try {
      const safeName = file.name.replace(/[^a-z0-9.]+/gi, '-');
      const path = `handbook/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('company-handbook').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('company-handbook').getPublicUrl(path);
      const now = new Date().toISOString();
      const { error } = await supabase.from('company_settings').upsert([
        { key: 'company_handbook_url', value: data.publicUrl, updated_by: profile.id, updated_at: now },
        { key: 'company_handbook_name', value: file.name, updated_by: profile.id, updated_at: now },
      ]);
      if (error) throw error;
      setMessage('Company handbook uploaded successfully.');
      setFile(null);
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Handbook upload failed.');
    } finally { setBusy(false); }
  }

  return <section>
    <div className="page-header"><div><h1>Company Handbook</h1><p>Access and download the official company handbook.</p></div></div>
    {message && <div className="status info">{message}</div>}
    <div className="panel">
      <h2>{handbookName}</h2>
      {handbookUrl ? <div className="form-grid"><p>The latest company handbook is available for staff.</p><div className="button-row"><a className="primary" href={handbookUrl} target="_blank" rel="noreferrer">Open Handbook</a><a className="secondary" href={handbookUrl} download={handbookName}>Download Handbook</a></div></div> : <div className="empty">No company handbook has been uploaded yet.</div>}
    </div>
    {isAdmin && <form className="panel form-grid" onSubmit={upload}>
      <h2>Upload / Replace Handbook</h2>
      <p className="hint">Upload the latest company handbook as PDF, Word document or another approved file. Staff will see the latest uploaded version here.</p>
      <label>Handbook File<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*" onChange={selectFile} /></label>
      {file && <p className="muted">Selected: {file.name}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Uploading...' : 'Save Handbook'}</button>
    </form>}
  </section>;
}
