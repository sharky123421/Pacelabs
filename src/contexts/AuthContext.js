import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    session,
    loading,
    signUp: supabase.auth.signUp.bind(supabase.auth),
    signInWithPassword: supabase.auth.signInWithPassword.bind(supabase.auth),
    signOut: supabase.auth.signOut.bind(supabase.auth),
    signInWithOAuth: supabase.auth.signInWithOAuth.bind(supabase.auth),
    signInWithIdToken: supabase.auth.signInWithIdToken.bind(supabase.auth),
    setSession: supabase.auth.setSession.bind(supabase.auth),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
