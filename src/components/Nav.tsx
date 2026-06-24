import { NavLink } from 'react-router-dom';
import { Bell, CalendarCheck, FileText, Home, LogOut, MessageSquare, UserCog, Users, Video } from 'lucide-react';
import { useAuth } from '../lib/auth';

const itemClass = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`;

export function Nav() {
  const { profile, signOut } = useAuth();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>
          <strong>Mezzo Staff</strong>
          <span>{profile?.full_name || profile?.email || 'Staff Portal'}</span>
        </div>
      </div>
      <nav>
        <NavLink to="/dashboard" className={itemClass}><Home size={18}/> Dashboard</NavLink>
        <NavLink to="/attendance" className={itemClass}><CalendarCheck size={18}/> Attendance</NavLink>
        <NavLink to="/profile" className={itemClass}><UserCog size={18}/> My Details</NavLink>
        <NavLink to="/reports" className={itemClass}><FileText size={18}/> Weekly Report</NavLink>
        <NavLink to="/documents" className={itemClass}><MessageSquare size={18}/> Letters & Payslip</NavLink>
        <NavLink to="/meetings" className={itemClass}><Video size={18}/> Meetings</NavLink>
        {profile?.role === 'admin' && <NavLink to="/admin" className={itemClass}><Users size={18}/> Admin</NavLink>}
      </nav>
      <button className="nav-link signout" onClick={signOut}><LogOut size={18}/> Sign out</button>
      <div className="sidebar-note"><Bell size={16}/> Updates appear in real time when staff are online.</div>
    </aside>
  );
}
