import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { compressImage } from '../lib/images';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

function isTeacher(profile?: Profile | null) {
  const position = String(profile?.position || '').toLowerCase();
  const department = String(profile?.department || '').toLowerCase();
  return profile?.role === 'admin' || position.includes('tutor') || position.includes('teacher') || department.includes('teaching');
}

export function FloatingTeacherPost({ profile, onPosted }: { profile: Profile | null; onPosted: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const allowed = useMemo(() => isTeacher(profile), [profile]);
  if (!allowed) return null;

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 1200, 0.78);
    setImage(compressed);
    setPreview(URL.createObjectURL(compressed));
  }

  async function uploadImage() {
    if (!profile || !image) return { image_url: null, image_path: null };
    const path = `${profile.id}/${Date.now()}-${image.name.replace(/[^a-z0-9.]+/gi, '-')}`;
    const { error } = await supabase.storage.from('dashboard-posts').upload(path, image, { contentType: 'image/jpeg' });
    if (error) throw error;
    const { data } = supabase.storage.from('dashboard-posts').getPublicUrl(path);
    return { image_url: data.publicUrl, image_path: path };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    if (!title.trim() || !body.trim()) { setMessage('Please add a title and message.'); return; }
    setBusy(true); setMessage('');
    try {
      const imageData = await uploadImage();
      const { error } = await supabase.from('company_posts').insert({
        author_id: profile.id,
        title: title.trim(),
        body: body.trim(),
        priority: 'normal',
        post_type: 'teacher_post',
        image_url: imageData.image_url,
        image_path: imageData.image_path,
      });
      if (error) throw error;
      setTitle(''); setBody(''); setImage(null); setPreview(''); setOpen(false);
      await onPosted();
    } catch (error: any) {
      setMessage(error.message || 'Could not post to dashboard.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="floating-post-button" onClick={() => setOpen(true)}>+ Post</button>
      {open && (
        <div className="floating-post-backdrop" role="dialog" aria-modal="true">
          <form className="floating-post-card form-grid" onSubmit={submit}>
            <div className="post-modal-head"><h2>Post to Dashboard</h2><button type="button" onClick={() => setOpen(false)}>×</button></div>
            <p className="hint">Share class updates, reminders, photos or announcements for staff to see.</p>
            {message && <div className="status error">{message}</div>}
            <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Primary 6 workbook update" required /></label>
            <label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your update..." required /></label>
            <label>Optional image<input type="file" accept="image/*" onChange={selectImage} /></label>
            {preview && <img className="post-image-preview" src={preview} alt="Post preview" />}
            <div className="button-row"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Posting...' : 'Post Update'}</button></div>
          </form>
        </div>
      )}
    </>
  );
}
