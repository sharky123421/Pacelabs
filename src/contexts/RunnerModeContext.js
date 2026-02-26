import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const RunnerModeContext = createContext(null);

export function RunnerModeProvider({ children }) {
  const { user, profileData } = useAuth();
  const [runnerMode, setRunnerModeLocal] = useState('advanced');
  const [loading, setLoading] = useState(true);
  const [beginnerStartedAt, setBeginnerStartedAt] = useState(null);

  useEffect(() => {
    if (!user?.id) {
      setRunnerModeLocal('advanced');
      setLoading(false);
      return;
    }
    // Use prefetched profile from AuthContext (already loaded in same getSession flow)
    if (profileData) {
      if (profileData.runner_mode) setRunnerModeLocal(profileData.runner_mode);
      if (profileData.beginner_started_at) setBeginnerStartedAt(profileData.beginner_started_at);
      setLoading(false);
      return;
    }
    // Fallback: fetch if profileData wasn't available
    supabase
      .from('profiles')
      .select('runner_mode, beginner_started_at')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.runner_mode) setRunnerModeLocal(data.runner_mode);
        if (data?.beginner_started_at) setBeginnerStartedAt(data.beginner_started_at);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id, profileData]);

  const setRunnerMode = useCallback(async (mode) => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    const updates = { runner_mode: mode };

    if (mode === 'beginner' && !beginnerStartedAt) {
      updates.beginner_started_at = now;
      setBeginnerStartedAt(now);
    }
    if (mode === 'advanced' && runnerMode === 'beginner') {
      updates.beginner_completed_at = now;
    }

    const { data: current } = await supabase
      .from('profiles')
      .select('mode_switch_history')
      .eq('id', user.id)
      .maybeSingle();

    const history = Array.isArray(current?.mode_switch_history) ? current.mode_switch_history : [];
    history.push({ from: runnerMode, to: mode, at: now });
    updates.mode_switch_history = history;

    await supabase.from('profiles').update(updates).eq('id', user.id);
    setRunnerModeLocal(mode);
  }, [user?.id, runnerMode, beginnerStartedAt]);

  const isBeginner = runnerMode === 'beginner';

  const weeksInBeginnerMode = beginnerStartedAt
    ? Math.floor((Date.now() - new Date(beginnerStartedAt).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 0;

  const shouldSuggestAdvanced = isBeginner && weeksInBeginnerMode >= 8;

  return (
    <RunnerModeContext.Provider value={{
      runnerMode,
      isBeginner,
      loading,
      setRunnerMode,
      beginnerStartedAt,
      weeksInBeginnerMode,
      shouldSuggestAdvanced,
    }}>
      {children}
    </RunnerModeContext.Provider>
  );
}

export function useRunnerMode() {
  const ctx = useContext(RunnerModeContext);
  if (!ctx) throw new Error('useRunnerMode must be used within RunnerModeProvider');
  return ctx;
}
