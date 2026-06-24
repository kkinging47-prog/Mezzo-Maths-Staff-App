import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Meeting } from '../types';

interface JitsiOptions {
  roomName: string;
  width: string | number;
  height: string | number;
  parentNode: HTMLElement;
  userInfo?: { displayName?: string; email?: string };
}

declare global {
  interface Window { JitsiMeetExternalAPI?: new (domain: string, options: JitsiOptions) => { dispose: () => void }; }
}

export function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const meetRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ dispose: () => void } | null>(null);

  async function loadMeetings() {
    const { data } = await supabase.from('meetings').select('*').eq('active', true).order('scheduled_at', { ascending: true, nullsFirst: false });
    setMeetings((data || []) as Meeting[]);
  }

  useEffect(() => { loadMeetings(); }, []);

  useEffect(() => {
    const channel = supabase.channel('meetings').on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, loadMeetings).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  function startMeeting(meeting: Meeting) {
    setActiveMeeting(meeting);
    setTimeout(() => {
      if (!meetRef.current) return;
      apiRef.current?.dispose();
      const create = () => {
        if (!window.JitsiMeetExternalAPI || !meetRef.current) return;
        apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
          roomName: meeting.room_name,
          width: '100%',
          height: 620,
          parentNode: meetRef.current,
        });
      };
      if (window.JitsiMeetExternalAPI) create();
      else {
        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.onload = create;
        document.body.appendChild(script);
      }
    }, 50);
  }

  useEffect(() => () => apiRef.current?.dispose(), []);

  return (
    <section>
      <div className="page-header"><div><h1>Voice & Video Meetings</h1><p>Join company meetings directly from the portal.</p></div></div>
      <div className="grid two">
        <div className="panel">
          <h2>Available Meetings</h2>
          {meetings.length === 0 && <p className="muted">No active meetings available.</p>}
          <div className="meeting-list">
            {meetings.map((meeting) => (
              <button key={meeting.id} className="meeting-item" onClick={() => startMeeting(meeting)}>
                <strong>{meeting.title}</strong>
                <span>{meeting.scheduled_at ? new Date(meeting.scheduled_at).toLocaleString() : 'Open meeting'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>{activeMeeting ? activeMeeting.title : 'Meeting Room'}</h2>
          <p className="muted">When you join, your browser will ask for microphone and camera permission.</p>
        </div>
      </div>
      <div className="meeting-frame" ref={meetRef}></div>
    </section>
  );
}
