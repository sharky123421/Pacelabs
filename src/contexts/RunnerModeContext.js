import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const RunnerModeContext = createContext(null);

export function RunnerModeProvider({ children }) {
  const { user } = useAuth();
  const [runnerMode, setRunnerModeLocal] = useState('advanced');
  const [loading, setLoading] = useState(true);
  const [beginnerStartedAt, setBeginnerStartedAt] = useState(null);

  useEffect(() => {
    if (!user?.id) {
      setRunnerModeLocal('advanced');
      setLoading(false);
      return;
    }
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
  }, [user?.id]);

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
