import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, BarChart3, Bell, BookOpen, CalendarCheck, ClipboardCheck, Clock3, CreditCard, FileSearch, FileSignature, FileText, Home, Landmark, LogOut, Mail, MapPin, Megaphone, MessageSquare, Settings, ShieldCheck, UserCog, Users, Video, Wallet } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { CompanyLogo } from './CompanyLogo';

const itemClass = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`;
function initials(name?: string | null, email?: string | null) { const source = name || email || 'Staff'; return source.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'; }
function isSupervisor(position?: string | null) { return String(position || '').toLowerCase().includes('supervisor'); }

export function Nav() {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const supervisor = isSupervisor(profile?.position);
  const [hasFinanceAccess, setHasFinanceAccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadFinanceAccess() {
      if (!profile?.id || isAdmin) { if (mounted) setHasFinanceAccess(false); return; }
      const { data } = await supabase.from('finance_user_access').select('id').eq('profile_id', profile.id).eq('active', true).maybeSingle();
      if (mounted) setHasFinanceAccess(Boolean(data));
    }
    loadFinanceAccess();
    return () => { mounted = false; };
  }, [profile?.id, isAdmin]);

  const canOpenFinance = isAdmin || hasFinanceAccess;

  return (
    <aside className="sidebar">
      <div className="brand"><CompanyLogo className="brand-logo" /><div><strong>Mezzo Staff</strong><span>Staff Portal</span></div></div>
      <div className="brand-profile">
        {profile?.photo_url ? <img className="staff-avatar" src={profile.photo_url} alt="Staff profile" /> : <div className="staff-avatar placeholder">{initials(profile?.full_name, profile?.email)}</div>}
        <div><strong>{profile?.full_name || 'Staff Member'}</strong><span>{profile?.position || profile?.email || 'Welcome'}</span></div>
      </div>
      <nav>
        <NavLink to="/dashboard" className={itemClass}><Home size={18}/> Dashboard</NavLink>
        <NavLink to="/messages" className={itemClass}><Mail size={18}/> Inbox</NavLink>
        <NavLink to="/queries" className={itemClass}><AlertTriangle size={18}/> Queries</NavLink>
        <NavLink to="/handbook" className={itemClass}><BookOpen size={18}/> Handbook</NavLink>
        {!isAdmin && <NavLink to="/attendance" className={itemClass}><CalendarCheck size={18}/> Attendance</NavLink>}
        <NavLink to="/deductions" className={itemClass}><AlertTriangle size={18}/> Deductions</NavLink>
        <NavLink to="/loans" className={itemClass}><Wallet size={18}/> Loans</NavLink>
        <NavLink to="/credit-union" className={itemClass}><CreditCard size={18}/> Credit Union</NavLink>
        <NavLink to="/profile" className={itemClass}><UserCog size={18}/> My Details</NavLink>
        <NavLink to="/reports" className={itemClass}><FileText size={18}/> Weekly Report</NavLink>
        <NavLink to="/timetable" className={itemClass}><Clock3 size={18}/> Timetable</NavLink>
        <NavLink to="/marketing" className={itemClass}><Megaphone size={18}/> Marketing</NavLink>
        {(supervisor || isAdmin) && <NavLink to="/supervisor-report" className={itemClass}><ClipboardCheck size={18}/> Supervisor Report</NavLink>}
        {!supervisor && <NavLink to="/workbooks" className={itemClass}><BookOpen size={18}/> Workbooks</NavLink>}
        <NavLink to="/documents" className={itemClass}><MessageSquare size={18}/> Letters & Payslip</NavLink>
        <NavLink to="/meetings" className={itemClass}><Video size={18}/> Meetings</NavLink>
        {canOpenFinance && <NavLink to="/finance-admin" className={itemClass}><Landmark size={18}/> Finance Admin</NavLink>}
        {isAdmin && <NavLink to="/file-analyzer" className={itemClass}><FileSearch size={18}/> File Analyzer</NavLink>}
        {isAdmin && <NavLink to="/finance-access" className={itemClass}><ShieldCheck size={18}/> Finance Users</NavLink>}
        {isAdmin && <NavLink to="/payroll" className={itemClass}><CreditCard size={18}/> Payroll</NavLink>}
        {isAdmin && <NavLink to="/report-summary" className={itemClass}><BarChart3 size={18}/> Report Summary</NavLink>}
        {isAdmin && <NavLink to="/admin-documents" className={itemClass}><FileSignature size={18}/> Admin Documents</NavLink>}
        {isAdmin && <NavLink to="/school-settings" className={itemClass}><MapPin size={18}/> School Settings</NavLink>}
        {isAdmin && <NavLink to="/admin-settings" className={itemClass}><Settings size={18}/> Admin Settings</NavLink>}
        {isAdmin && <NavLink to="/admin" className={itemClass}><Users size={18}/> Admin</NavLink>}
      </nav>
      <button className="nav-link signout" onClick={signOut}><LogOut size={18}/> Sign out</button>
      <div className="sidebar-note"><Bell size={16}/> Updates appear in real time when staff are online.</div>
    </aside>
  );
}
