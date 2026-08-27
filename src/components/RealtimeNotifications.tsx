import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

interface Notice { id: number; title: string; body: string; url: string; }

function isSupervisor(profile: any) {
  return String(profile?.position || '').toLowerCase().includes('supervisor');
}

async function browserNotify(title: string, body: string, url = '/dashboard') {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: '/icon-192.svg', badge: '/icon-192.svg', data: { url }, tag: `${title}-${url}`, renotify: true };
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    try { new Notification(title, options); } catch { /* browser notification failed, in-app notice still shows */ }
  }
}

function meetingBody(row: any) {
  const when = row?.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : 'Open meeting';
  return `${row?.title || 'A company meeting has been posted.'} · ${when}`;
}

export function RealtimeNotifications() {
  const { profile } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(() => ('Notification' in window ? Notification.permission : 'denied'));
  const [notices, setNotices] = useState<Notice[]>([]);
  const [connectionIssue, setConnectionIssue] = useState('');
  const isAdmin = profile?.role === 'admin';
  const supervisor = isSupervisor(profile);

  function pushNotice(title: string, body: string, url = '/dashboard') {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((prev) => [{ id, title, body, url }, ...prev].slice(0, 4));
    window.setTimeout(() => setNotices((prev) => prev.filter((notice) => notice.id !== id)), 9000);
    browserNotify(title, body, url);
  }

  useEffect(() => {
    if (!profile) return;
    let mounted = true;
    let subscribed = false;
    setConnectionIssue('');
    const channel = supabase.channel(`mezzo-notifications-${profile.id}`);

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_messages', filter: `recipient_id=eq.${profile.id}` }, (payload: any) => {
      pushNotice('New staff message', payload.new?.subject || 'You have a new message.', '/messages');
    });

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_queries', filter: `staff_id=eq.${profile.id}` }, (payload: any) => {
      pushNotice('New staff query', payload.new?.subject || 'A query has been issued to you.', '/queries');
    });

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_deductions', filter: `staff_id=eq.${profile.id}` }, () => {
      pushNotice('Pending attendance deduction', 'A deduction is waiting for admin review.', '/deductions');
    });

    if (isAdmin || supervisor) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_deductions' }, (payload: any) => {
        pushNotice('Defaulter notification', payload.new?.reason || 'A pending deduction has been created.', '/deductions');
      });
    }

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'company_posts' }, (payload: any) => {
      pushNotice('New dashboard update', payload.new?.title || 'A new update has been posted.', '/dashboard');
    });

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetings' }, (payload: any) => {
      if (payload.new?.active === false) return;
      pushNotice('New meeting update', meetingBody(payload.new), '/meetings');
    });

    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meetings' }, (payload: any) => {
      if (payload.new?.active === false) return;
      pushNotice('Meeting updated', meetingBody(payload.new), '/meetings');
    });

    channel.subscribe((status) => {
      if (!mounted) return;
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        setConnectionIssue('');
      }
      if (!subscribed && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
        setConnectionIssue('Realtime notifications are not connected. Ask admin to run the realtime SQL fix, then refresh.');
      }
    });
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [profile?.id, isAdmin, supervisor]);

  async function enable() {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') pushNotice('Notifications enabled', 'You will receive staff portal alerts while the app is open or installed.', '/dashboard');
  }

  if (!profile) return null;

  const showPrompt = 'Notification' in window && permission !== 'granted' && permission !== 'denied';

  return <>
    {showPrompt && <div className="install-prompt notification-prompt">
      <div><strong>Enable real-time notifications</strong><span>Get alerts for inbox messages, queries, deductions, meetings and dashboard updates.</span></div>
      <button className="primary small-button" onClick={enable}>Allow Notifications</button>
    </div>}
    {connectionIssue && <div className="notification-status-warning">{connectionIssue}</div>}
    {notices.length > 0 && <div className="notification-stack">
      {notices.map((notice) => <button key={notice.id} className="notification-toast" onClick={() => { window.location.href = notice.url; }}>
        <strong>{notice.title}</strong><span>{notice.body}</span>
      </button>)}
    </div>}
  </>;
}
