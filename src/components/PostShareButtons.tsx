import { CompanyPost } from '../types';

type NavigatorWithShare = Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };

function postUrl(postId: string) {
  const base = window.location.origin + window.location.pathname;
  return `${base}#post-${postId}`;
}

function shareText(post: CompanyPost) {
  return `${post.title}\n\n${post.body}`.slice(0, 1200);
}

function openShare(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer,width=720,height=640');
}

export function PostShareButtons({ post }: { post: CompanyPost }) {
  const url = postUrl(post.id);
  const text = shareText(post);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  async function nativeShare(platform?: string) {
    const nav = navigator as NavigatorWithShare;
    if (nav.share) {
      try {
        await nav.share({ title: post.title, text, url });
        return;
      } catch {
        return;
      }
    }
    await navigator.clipboard?.writeText(`${text}\n${url}`);
    alert(platform ? `${platform} sharing is not directly supported in this browser. The post link has been copied.` : 'Post link copied.');
  }

  return (
    <div className="share-row">
      <span>Share:</span>
      <button type="button" onClick={() => openShare(`https://wa.me/?text=${encodedText}%20${encodedUrl}`)}>WhatsApp</button>
      <button type="button" onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}>Facebook</button>
      <button type="button" onClick={() => openShare(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`)}>X</button>
      <button type="button" onClick={() => nativeShare('Instagram')}>Instagram</button>
      <button type="button" onClick={() => nativeShare('Snapchat')}>Snapchat</button>
      <button type="button" onClick={() => nativeShare('TikTok')}>TikTok</button>
    </div>
  );
}
