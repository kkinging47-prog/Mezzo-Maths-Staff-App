import { NavLink } from 'react-router-dom';
import { BarChart3, Bell, BookOpen, CalendarCheck, Clock3, FileSignature, FileText, Home, LogOut, MessageSquare, Settings, UserCog, Users, Video } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { mezzoLogoDataUrl } from '../lib/branding';

const itemClass = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`;
function initials(name?: string | null, email?: string | null) { const source = name || email || 'Staff'; return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'; }

export function Nav() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';
  return (
    <aside className="sidebar">
      <div className="brand"><img className="brand-logo" src={mezzoLogoDataUrl} alt="Mezzo Maths logo" /><div><strong>Mezzo Staff</strong><span>Staff Portal</span></div></div>
      <div className="brand-profile">
        {profile?.photo_url ? <img className="staff-avatar" src={profile.photo_url} alt="Staff profile" /> : <div className="staff-avatar placeholder">{initials(profile?.full_name, profile?.email)}</div>}
        <div><strong>{profile?.full_name || 'Staff Member'}</strong><span>{profile?.position || profile?.email || 'Welcome'}</span></div>
      </div>
      <nav>
        <NavLink to="/dashboard" className={itemClass}><Home size={18}/> Dashboard</NavLink>
        <NavLink to="/attendance" className={itemClass}><CalendarCheck size={18}/> Attendance</NavLink>
        <NavLink to="/profile" className={itemClass}><UserCog size={18}/> My Details</NavLink>
        <NavLink to="/reports" className={itemClass}><FileText size={18}/> Weekly Report</NavLink>
        <NavLink to="/timetable" className={itemClass}><Clock3 size={18}/> Timetable</NavLink>
        <NavLink to="/workbooks" className={itemClass}><BookOpen size={18}/> Workbooks</NavLink>
        <NavLink to="/documents" className={itemClass}><MessageSquare size={18}/> Letters & Payslip</NavLink>
        <NavLink to="/meetings" className={itemClass}><Video size={18}/> Meetings</NavLink>
        {isAdmin && <NavLink to="/report-summary" className={itemClass}><BarChart3 size={18}/> Report Summary</NavLink>}
        {isAdmin && <NavLink to="/admin-documents" className={itemClass}><FileSignature size={18}/> Admin Documents</NavLink>}
        {isAdmin && <NavLink to="/admin-settings" className={itemClass}><Settings size={18}/> Admin Settings</NavLink>}
        {isAdmin && <NavLink to="/admin" className={itemClass}><Users size={18}/> Admin</NavLink>}
      </nav>
      <button className="nav-link signout" onClick={signOut}><LogOut size={18}/> Sign out</button>
      <div className="sidebar-note"><Bell size={16}/> Updates appear in real time when staff are online.</div>
    </aside>
  );
}
