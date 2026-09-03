import { ReactElement, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export function FinanceProtected({ children }: { children: ReactElement }) {
  const { user, profile, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkAccess() {
      if (loading) return;
      if (!user || !profile) { if (mounted) setChecking(false); return; }
      if (profile.role === 'admin') { if (mounted) { setAllowed(true); setChecking(false); } return; }
      const { data } = await supabase
        .from('finance_user_access')
        .select('id, active')
        .eq('profile_id', profile.id)
        .eq('active', true)
        .maybeSingle();
      if (mounted) { setAllowed(Boolean(data)); setChecking(false); }
    }
    checkAccess();
    return () => { mounted = false; };
  }, [user, profile, loading]);

  if (loading || checking) return <div className="center-screen">Checking finance access...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return children;
}
