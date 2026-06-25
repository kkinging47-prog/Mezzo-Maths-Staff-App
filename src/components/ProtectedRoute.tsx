import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function ProtectedRoute({ children, adminOnly = false }: { children: ReactElement; adminOnly?: boolean }) {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) return <div className="center-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.status === 'left') return <div className="center-screen"><div className="panel"><h1>Account notice</h1><p>Please contact administration about your staff portal access.</p><button className="primary" onClick={signOut}>Sign out</button></div></div>;
  if (adminOnly && profile?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}
