import React, { useState, useCallback, useEffect, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRunnerMode } from '../contexts/RunnerModeContext';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, GlassCard } from '../components';
const CoachChatScreen = React.lazy(() => import('./CoachChatScreen').then(m => ({ default: m.CoachChatScreen })));
import { supabase } from '../lib/supabase';

const FEELINGS = [
  { key: 'tired', label: '\ud83d\ude34 Tired' },
  { key: 'ok', label: '\ud83d\ude10 OK' },
  { key: 'good', label: '\ud83d\ude42 Good' },
  { key: 'great', label: '\ud83d\udcaa Great' },
];

const BEGINNER_SESSION_DEFAULTS = {
  name: 'Run/Walk #1',
  duration: '20 minutes',
  instruction: 'Run 1 minute, walk 2 minutes, repeat 6 times.\nGo at a pace where you can still talk.',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function BeginnerTodayScreen() {
  const { user } = useAuth();
  const { weeksInBeginnerMode, shouldSuggestAdvanced, beginnerStartedAt } = useRunnerMode();
  const firstName = user?.user_metadata?.display_name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0];

  const [feeling, setFeeling] = useState(null);
  const [coachChatVisible, setCoachChatVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [runStats, setRunStats] = useState({ totalRuns: 0, streakDays: 0, thisMonth: 0 });
  const [todaySession, setTodaySession] = useState(BEGINNER_SESSION_DEFAULTS);
  const [milestones, setMilestones] = useState([]);

  const userId = user?.id;

  const dayNumber = beginnerStartedAt
    ? Math.max(1, Math.floor((Date.now() - new Date(beginnerStartedAt).getTime()) / (24 * 60 * 60 * 1000)) + 1)
    : 1;
  const weekNumber = Math.min(8, Math.ceil(dayNumber / 7));
  const progressPercent = Math.min(100, Math.round((weekNumber / 8) * 100));

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [statsRes, milestonesRes, planRes] = await Promise.all([
        supabase.rpc('get_my_run_stats').catch(() => ({ data: null })),
        supabase.from('beginner_milestones').select('milestone_key, unlocked_at').eq('user_id', userId).order('unlocked_at'),
        supabase.from('training_plans').select('id').eq('user_id', userId).eq('plan_type', 'beginner').eq('is_active', true).maybeSingle(),
      ]);

      if (statsRes.data) {
        const raw = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
        setRunStats({
          totalRuns: Number(raw?.total_runs) || 0,
          streakDays: 0,
          thisMonth: Number(raw?.total_runs) || 0,
        });
      }
      if (milestonesRes.data) setMilestones(milestonesRes.data.map((m) => m.milestone_key));

      if (planRes.data?.id) {
        const { data: sessions } = await supabase
          .from('sessions')
          .select('*')
          .eq('plan_id', planRes.data.id)
          .eq('week_number', weekNumber)
          .order('day_of_week');
        if (sessions?.length > 0) {
          const today = new Date().getDay();
          const nextSession = sessions.find((s) => s.day_of_week >= today && s.status !== 'completed') || sessions[0];
          if (nextSession) {
            setTodaySession({
              name: nextSession.title || `Run/Walk #${runStats.totalRuns + 1}`,
              duration: nextSession.duration_target_min ? `${nextSession.duration_target_min} minutes` : '20 minutes',
              instruction: nextSession.description || BEGINNER_SESSION_DEFAULTS.instruction,
            });
          }
        }
      }
    } catch (_) {}
  }, [userId, weekNumber]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleFeelingSelect = async (key) => {
    setFeeling(key);
    if (!userId) return;
    await supabase
      .from('beginner_checkins')
      .upsert({ user_id: userId, date: new Date().toISOString().slice(0, 10), feeling: key }, { onConflict: 'user_id,date' })
      .catch(() => {});
  };

  const MILESTONE_ITEMS = [
    { key: 'first_run', label: 'First run', done: milestones.includes('first_run') },
    { key: 'five_min_continuous', label: '5 minutes continuous', done: milestones.includes('five_min_continuous') },
    { key: 'ten_min_continuous', label: '10 minutes continuous', done: milestones.includes('ten_min_continuous') },
    { key: 'twenty_min_continuous', label: '20 minutes continuous', done: milestones.includes('twenty_min_continuous') },
    { key: 'first_5k', label: 'First 5K', done: milestones.includes('first_5k') },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}{firstName ? `, ${firstName}` : ''}</Text>
            <Text style={styles.dayCounter}>Day {dayNumber} of your journey \ud83c\udfc3</Text>
          </View>
          <TouchableOpacity style={styles.askCoachBtn} onPress={() => setCoachChatVisible(true)}>
            <Text style={styles.askCoachText}>Ask coach</Text>
          </TouchableOpacity>
        </View>

        {/* Streak */}
        {runStats.totalRuns > 0 && (
          <View style={styles.streakBanner}>
            <Text style={styles.streakText}>{runStats.totalRuns} runs completed \u2014 keep it up! \ud83d\udd25</Text>
          </View>
        )}

        {/* Suggest upgrade */}
        {shouldSuggestAdvanced && (
          <View style={styles.upgradeCard}>
            <Text style={styles.upgradeTitle}>You've been running for {weeksInBeginnerMode} weeks! \ud83c\udf89</Text>
            <Text style={styles.upgradeSubtitle}>Ready to unlock advanced training features?</Text>
            <PrimaryButton title="Unlock Advanced Mode" onPress={() => { setRunnerMode('advanced'); }} style={styles.upgradeBtn} />
          </View>
        )}

        {/* FEELING CHECK-IN */}
        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>How are you feeling today?</Text>
          <View style={styles.feelingRow}>
            {FEELINGS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.feelingBtn, feeling === f.key && styles.feelingBtnSelected]}
                onPress={() => handleFeelingSelect(f.key)}
              >
                <Text style={[styles.feelingText, feeling === f.key && styles.feelingTextSelected]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </GlassCard>

        {/* TODAY'S SESSION */}
        <GlassCard style={styles.sessionCard}>
          <View style={styles.sessionBadge}>
            <Text style={styles.sessionBadgeText}>TODAY'S SESSION</Text>
          </View>
          <Text style={styles.sessionName}>{todaySession.name}</Text>
          <Text style={styles.sessionDuration}>{todaySession.duration}</Text>
          <Text style={styles.sessionInstruction}>{todaySession.instruction}</Text>
          <PrimaryButton title="Let's go! \u2192" onPress={() => Alert.alert('Time to run!', 'GPS tracking coming soon. Go run your session and log it when you get back!')} style={styles.sessionBtn} />
        </GlassCard>

        {/* PROGRESS BAR */}
        <GlassCard style={styles.progressCard}>
          <Text style={styles.progressTitle}>Week {weekNumber} of 8 \u2014 you're {progressPercent}% there!</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </GlassCard>

        {/* MILESTONE CARD */}
        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>Your milestones</Text>
          {MILESTONE_ITEMS.map((m) => (
            <View key={m.key} style={styles.milestoneRow}>
              <Text style={styles.milestoneIcon}>{m.done ? '\u2705' : '\u2b1c'}</Text>
              <Text style={[styles.milestoneLabel, m.done && styles.milestoneDone]}>{m.label}</Text>
            </View>
          ))}
        </GlassCard>

        {/* ACTIVITY SUMMARY */}
        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>Your activity</Text>
          <View style={styles.activityRow}>
            <View style={styles.activityBlock}>
              <Text style={styles.activityValue}>{runStats.totalRuns}</Text>
              <Text style={styles.activityLabel}>Runs total</Text>
            </View>
            <View style={styles.activityBlock}>
              <Text style={styles.activityValue}>{runStats.thisMonth}</Text>
              <Text style={styles.activityLabel}>This month</Text>
            </View>
          </View>
        </GlassCard>
      </ScrollView>

      {/* Coach FAB */}
      <TouchableOpacity style={styles.coachFab} onPress={() => setCoachChatVisible(true)} activeOpacity={0.85}>
        <Text style={styles.coachFabText}>AI</Text>
      </TouchableOpacity>

      {coachChatVisible && (
        <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
          <CoachChatScreen visible={coachChatVisible} onClose={() => setCoachChatVisible(false)} />
        </Suspense>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.screenPaddingHorizontal, paddingTop: 8, paddingBottom: 40 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerLeft: { flex: 1 },
  greeting: { ...typography.largeTitle, color: colors.primaryText, marginBottom: 4 },
  dayCounter: { ...typography.secondary, color: colors.beginnerGreen, fontWeight: '600' },
  askCoachBtn: { backgroundColor: colors.accentLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill },
  askCoachText: { ...typography.caption, fontWeight: '600', color: colors.accent },

  streakBanner: {
    backgroundColor: colors.beginnerGreenLight, borderRadius: theme.radius.card,
    padding: 14, marginBottom: spacing.betweenCards, alignItems: 'center',
  },
  streakText: { ...typography.secondary, fontWeight: '600', color: colors.beginnerGreen },

  upgradeCard: {
    backgroundColor: '#007AFF12', borderRadius: theme.radius.card,
    padding: 20, marginBottom: spacing.betweenCards,
  },
  upgradeTitle: { ...typography.title, color: colors.primaryText, marginBottom: 4 },
  upgradeSubtitle: { ...typography.secondary, color: colors.secondaryText, marginBottom: 16 },
  upgradeBtn: {},

  card: {
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 20, marginBottom: spacing.betweenCards, ...theme.cardShadow,
  },
  cardTitle: { ...typography.title, fontSize: 18, color: colors.primaryText, marginBottom: 16 },

  feelingRow: { flexDirection: 'row', gap: 8 },
  feelingBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 12, backgroundColor: colors.backgroundSecondary,
  },
  feelingBtnSelected: { backgroundColor: colors.beginnerGreen },
  feelingText: { ...typography.caption, color: colors.primaryText },
  feelingTextSelected: { color: '#FFFFFF', fontWeight: '600' },

  sessionCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 24, marginBottom: spacing.betweenCards,
    borderLeftWidth: 4, borderLeftColor: colors.beginnerGreen, ...theme.cardShadow,
  },
  sessionBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.beginnerGreenMedium,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 12,
  },
  sessionBadgeText: { ...typography.overline, color: colors.beginnerGreen },
  sessionName: { ...typography.largeTitle, fontSize: 24, color: colors.primaryText, marginBottom: 4 },
  sessionDuration: { ...typography.title, color: colors.secondaryText, marginBottom: 16 },
  sessionInstruction: { ...typography.body, fontSize: 18, color: colors.primaryText, lineHeight: 26, marginBottom: 20 },
  sessionBtn: {},

  progressCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 20, marginBottom: spacing.betweenCards, ...theme.cardShadow,
  },
  progressTitle: { ...typography.secondary, fontWeight: '600', color: colors.primaryText, marginBottom: 12 },
  progressTrack: { height: 8, backgroundColor: colors.backgroundSecondary, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.beginnerGreen, borderRadius: 4 },

  milestoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  milestoneIcon: { fontSize: 18 },
  milestoneLabel: { ...typography.body, color: colors.primaryText },
  milestoneDone: { color: colors.secondaryText, textDecorationLine: 'line-through' },

  activityRow: { flexDirection: 'row', gap: 16 },
  activityBlock: { flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: 12, padding: 16, alignItems: 'center' },
  activityValue: { ...typography.largeTitle, color: colors.primaryText },
  activityLabel: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },

  coachFab: {
    position: 'absolute', right: spacing.screenPaddingHorizontal, bottom: 100,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    ...theme.cardShadowElevated,
  },
  coachFabText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
});
