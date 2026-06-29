import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Profile } from '../types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function clearSupabaseAuthStorage() {
  try {
    Object.keys(localStorage).forEach((key) => { if (key.startsWith('sb-') && key.includes('auth-token')) localStorage.removeItem(key); });
    Object.keys(sessionStorage).forEach((key) => { if (key.startsWith('sb-') && key.includes('auth-token')) sessionStorage.removeItem(key); });
  } catch {}
}

async function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Request timed out. Please refresh and try again.')), ms)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await withTimeout(supabase.from('profiles').select('*').eq('id', userId).single());
      if (error && error.code !== 'PGRST116') throw error;
      setProfile(data as Profile | null);
    } catch (error) {
      console.error('Profile load failed:', error);
      setProfile(null);
    }
  }

  async function refreshProfile() {
    if (user?.id) await loadProfile(user.id);
  }

  useEffect(() => {
    let active = true;
    async function startAuth() {
      setLoading(true);
      try {
        const { data } = await withTimeout(supabase.auth.getSession());
        if (!active) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) await loadProfile(data.session.user.id);
      } catch (error) {
        console.error('Session load failed:', error);
        clearSupabaseAuthStorage();
        if (active) { setSession(null); setUser(null); setProfile(null); }
      } finally {
        if (active) setLoading(false);
      }
    }
    startAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) { setProfile(null); setLoading(false); return; }
      window.setTimeout(async () => {
        await loadProfile(nextSession.user.id);
        setLoading(false);
      }, 0);
    });

    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    profile,
    loading,
    refreshProfile,
    signOut: async () => {
      setLoading(true);
      setSession(null);
      setUser(null);
      setProfile(null);
      try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
      finally {
        clearSupabaseAuthStorage();
        setLoading(false);
        window.location.replace('/login');
      }
    },
  }), [user, session, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
