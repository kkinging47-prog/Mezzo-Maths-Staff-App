import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { StatusMessage } from '../components/StatusMessage';
import { PasswordInput } from '../components/PasswordInput';
import { CompanyLogo } from '../components/CompanyLogo';

export function Login() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'info' | 'success' | 'error'>('info');
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setType('error');
      setMessage(error.message);
    }
    setBusy(false);
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <CompanyLogo className="login-logo" />
        <h1>Mezzo Staff Portal</h1>
        <p>Attendance, reports, staff records, updates and meetings.</p>
        <StatusMessage message={message} type={type} />
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
        <button className="primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        <small>Admin login uses this same page. After signing in with an admin account, open the Admin page from the sidebar or go to /admin.</small>
      </form>
    </div>
  );
}
