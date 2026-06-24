import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Comment, CompanyPost } from '../types';
import { StatusMessage } from '../components/StatusMessage';

export function Dashboard() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<CompanyPost[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  async function loadPosts() {
    const { data, error } = await supabase
      .from('company_posts')
      .select('*, profiles(full_name,email)')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) setMessage(error.message);
    else setPosts((data || []) as CompanyPost[]);
  }

  async function loadComments(postIds: string[]) {
    if (!postIds.length) return;
    const { data } = await supabase
      .from('post_comments')
      .select('*, profiles(full_name,email)')
      .in('post_id', postIds)
      .order('created_at', { ascending: true });

    const grouped: Record<string, Comment[]> = {};
    (data || []).forEach((comment: any) => {
      grouped[comment.post_id] ||= [];
      grouped[comment.post_id].push(comment as Comment);
    });
    setComments(grouped);
  }

  useEffect(() => { loadPosts(); }, []);
  useEffect(() => { loadComments(posts.map((post) => post.id)); }, [posts]);

  useEffect(() => {
    const channel = supabase
      .channel('company-posts-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'company_posts' }, loadPosts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, () => loadComments(posts.map((post) => post.id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [posts]);

  async function submitComment(event: FormEvent, postId: string) {
    event.preventDefault();
    const body = newComment[postId]?.trim();
    if (!body || !profile) return;
    const { error } = await supabase.from('post_comments').insert({ post_id: postId, body, author_id: profile.id });
    if (error) setMessage(error.message);
    else {
      setNewComment((prev) => ({ ...prev, [postId]: '' }));
      await loadComments(posts.map((post) => post.id));
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Company Dashboard</h1>
          <p>Updates, announcements and staff comments.</p>
        </div>
      </div>
      <StatusMessage message={message} type="error" />
      <div className="grid two">
        <div className="panel">
          <h2>Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}</h2>
          <p className="muted">Use this portal to check in only when you are within your assigned school location, submit weekly work reports, update your details, generate documents, and join meetings.</p>
        </div>
        <div className="panel stat-panel">
          <span>Role</span>
          <strong>{profile?.role || 'staff'}</strong>
          <span>Staff No.</span>
          <strong>{profile?.staff_no || 'Not set'}</strong>
        </div>
      </div>

      <h2>Latest Updates</h2>
      <div className="feed">
        {posts.length === 0 && <div className="empty">No company updates posted yet.</div>}
        {posts.map((post) => (
          <article key={post.id} className={`post priority-${post.priority}`}>
            <div className="post-head">
              <div>
                <strong>{post.title}</strong>
                <span>{new Date(post.created_at).toLocaleString()}</span>
              </div>
              <em>{post.priority}</em>
            </div>
            <p>{post.body}</p>
            {post.image_url && (
              <div className="post-image-card">
                <img src={post.image_url} alt={post.title} />
                <a className="download-link" href={post.image_url} download={`${post.title.replace(/[^a-z0-9]+/gi, '-')}.jpg`}>Download JPG</a>
              </div>
            )}
            <div className="comments">
              {(comments[post.id] || []).map((comment) => (
                <div key={comment.id} className="comment"><strong>{comment.profiles?.full_name || 'Staff'}:</strong> {comment.body}</div>
              ))}
              <form className="comment-form" onSubmit={(event) => submitComment(event, post.id)}>
                <input placeholder="Write a comment..." value={newComment[post.id] || ''} onChange={(e) => setNewComment((prev) => ({ ...prev, [post.id]: e.target.value }))} />
                <button>Comment</button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
