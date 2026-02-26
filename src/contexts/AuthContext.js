import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, getKeepLoggedInPreference, setKeepLoggedInPreference } from '../lib/supabase';
import { registerPushToken } from '../services/pushNotifications';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keepLoggedIn, setKeepLoggedInState] = useState(true);
  const [profileData, setProfileData] = useState(null);

  useEffect(() => {
    getKeepLoggedInPreference().then(setKeepLoggedInState);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      // Pipeline: fetch profile in the same async flow to avoid extra render cycle
      if (s?.user?.id) {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('runner_mode, beginner_started_at')
            .eq('id', s.user.id)
            .maybeSingle();
          if (data) setProfileData(data);
        } catch (_) {}
      }
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

  useEffect(() => {
    if (!user?.id) return;
    const timer = setTimeout(() => {
      registerPushToken(user.id).catch(() => {});
    }, 5000);
    return () => clearTimeout(timer);
  }, [user?.id]);

  const setKeepLoggedIn = async (value) => {
    setKeepLoggedInState(value);
    await setKeepLoggedInPreference(value);
  };

  const value = {
    user,
    session,
    loading,
    profileData,
    keepLoggedIn,
    setKeepLoggedIn,
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
