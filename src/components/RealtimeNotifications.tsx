import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

function isSupervisor(profile: any) {
  return String(profile?.position || '').toLowerCase().includes('supervisor');
}

async function notify(title: string, body: string, url = '/dashboard') {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: '/icon-192.svg', badge: '/icon-192.svg', data: { url } };
  const registration = await navigator.serviceWorker?.getRegistration?.();
  if (registration?.showNotification) await registration.showNotification(title, options);
  else new Notification(title, options);
}

export function RealtimeNotifications() {
  const { profile } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(() => ('Notification' in window ? Notification.permission : 'denied'));
  const isAdmin = profile?.role === 'admin';
  const supervisor = isSupervisor(profile);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`mezzo-notifications-${profile.id}`);

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_messages', filter: `recipient_id=eq.${profile.id}` }, (payload: any) => {
      notify('New staff message', payload.new?.subject || 'You have a new message.', '/messages');
    });

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_queries', filter: `staff_id=eq.${profile.id}` }, (payload: any) => {
      notify('New staff query', payload.new?.subject || 'A query has been issued to you.', '/queries');
    });

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_deductions', filter: `staff_id=eq.${profile.id}` }, () => {
      notify('Pending attendance deduction', 'A deduction is waiting for admin review.', '/deductions');
    });

    if (isAdmin || supervisor) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_deductions' }, (payload: any) => {
        notify('Defaulter notification', payload.new?.reason || 'A pending deduction has been created.', '/deductions');
      });
    }

    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'company_posts' }, (payload: any) => {
      notify('New dashboard update', payload.new?.title || 'A new update has been posted.', '/dashboard');
    });

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, isAdmin, supervisor]);

  if (!profile || !('Notification' in window) || permission === 'granted') return null;

  async function enable() {
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  if (permission === 'denied') return null;

  return <div className="install-prompt notification-prompt">
    <div><strong>Enable real-time notifications</strong><span>Get alerts for inbox messages, queries and deduction notices.</span></div>
    <button className="primary small-button" onClick={enable}>Allow Notifications</button>
  </div>;
}
