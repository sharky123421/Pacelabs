import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, SecondaryButton } from '../components';
import { getActivePlan, getPlanSessions, fetchPlanBuilderUserData } from '../services/planBuilder';
import { useAuth } from '../contexts/AuthContext';
import { useRunnerMode } from '../contexts/RunnerModeContext';
import {
  getLatestAdaptation,
  getCoachingSummary,
  runFullCoachingPipeline,
  getAthleteState,
  getLatestBottleneck,
  getActivePhilosophy,
} from '../services/coachingEngine';

const PADDING = spacing.screenPaddingHorizontal;

const SESSION_COLORS = {
  easy: colors.sessionEasy ?? '#34C759',
  tempo: colors.sessionTempo ?? '#FF9500',
  intervals: colors.sessionIntervals ?? '#FF3B30',
  long: colors.sessionLong ?? '#007AFF',
  race: colors.sessionRace ?? '#AF52DE',
  rest: colors.sessionRest ?? '#8E8E93',
  recovery: colors.sessionEasy ?? '#34C759',
  progression: colors.sessionTempo ?? '#FF9500',
  hills: colors.sessionIntervals ?? '#FF3B30',
};

const ANALYSIS_STEPS = [
  { key: 'metrics', label: 'Calculating fitness metrics...' },
  { key: 'ingest', label: 'Analyzing athlete data...' },
  { key: 'bottleneck', label: 'Detecting training bottlenecks...' },
  { key: 'philosophy', label: 'Selecting training philosophy...' },
  { key: 'done', label: 'Analysis complete — opening coach chat...' },
];

function formatSessionLabel(type) {
  if (!type) return 'RUN';
  const t = type.toLowerCase();
  if (t === 'rest') return 'REST DAY';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── ANALYSIS PROGRESS VIEW ─────────────────────────────────────────────────

function AnalysisView({ stepIndex, error, onRetry, onCancel }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  if (error) {
    return (
      <View style={genStyles.container}>
        <Text style={genStyles.errorTitle}>Something went wrong</Text>
        <Text style={genStyles.errorMsg}>{error}</Text>
        <PrimaryButton title="Try again" onPress={onRetry} style={genStyles.btn} />
        <SecondaryButton title="Cancel" onPress={onCancel} style={genStyles.btn} />
      </View>
    );
  }

  return (
    <View style={genStyles.container}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <View style={genStyles.iconCircle}>
          <Text style={genStyles.iconText}>P</Text>
        </View>
      </Animated.View>

      <Text style={genStyles.title}>Analyzing your data</Text>
      <Text style={genStyles.subtitle}>
        Finding your strengths and weaknesses...
      </Text>

      <View style={genStyles.steps}>
        {ANALYSIS_STEPS.map((step, i) => {
          const isDone = i < stepIndex;
          const isActive = i === stepIndex;
          return (
            <View key={step.key} style={genStyles.stepRow}>
              <View style={[
                genStyles.stepDot,
                isDone && genStyles.stepDotDone,
                isActive && genStyles.stepDotActive,
              ]}>
                {isDone && <Text style={genStyles.stepCheck}>✓</Text>}
                {isActive && <ActivityIndicator size="small" color="#fff" />}
              </View>
              <Text style={[
                genStyles.stepLabel,
                isDone && genStyles.stepLabelDone,
                isActive && genStyles.stepLabelActive,
              ]}>
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const genStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  iconText: { fontSize: 36, fontWeight: '700', color: '#fff' },
  title: { ...typography.largeTitle, color: colors.primaryText, marginBottom: 8 },
  subtitle: { ...typography.body, color: colors.secondaryText, marginBottom: 32, textAlign: 'center' },
  steps: { width: '100%', gap: 16 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: colors.success },
  stepDotActive: { backgroundColor: colors.accent },
  stepCheck: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepLabel: { ...typography.body, color: colors.secondaryText },
  stepLabelDone: { color: colors.success },
  stepLabelActive: { color: colors.primaryText, fontWeight: '600' },
  errorTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  errorMsg: { ...typography.body, color: colors.secondaryText, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  btn: { width: '100%', marginBottom: 12 },
});

// ─── MAIN PLAN SCREEN ───────────────────────────────────────────────────────

export function PlanScreen({ navigation }) {
  const { user } = useAuth();
  const { isBeginner } = useRunnerMode();
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adaptation, setAdaptation] = useState(null);
  const [coachingSummary, setCoachingSummary] = useState(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisError, setAnalysisError] = useState(null);

  const loadPlan = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const active = await getActivePlan(user.id);
      setPlan(active);
      if (active?.id) {
        const generatedAt = active.generated_at ? new Date(active.generated_at).getTime() : Date.now();
        const weeksElapsed = Math.floor((Date.now() - generatedAt) / (7 * 24 * 60 * 60 * 1000));
        const currentWeek = Math.min(active.total_weeks || 12, 1 + Math.max(0, weeksElapsed));
        const list = await getPlanSessions(active.id, currentWeek);
        setSessions(list);
      } else {
        setSessions([]);
      }
    } catch (_) {
      setPlan(null);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!isAnalyzing) {
        loadPlan();
        getLatestAdaptation().then(setAdaptation).catch(() => setAdaptation(null));
        getCoachingSummary().then(setCoachingSummary).catch(() => setCoachingSummary(null));
      }
    }, [loadPlan, isAnalyzing]),
  );

  const startAnalysisAndChat = useCallback(async () => {
    if (!user?.id) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisStep(0);

    try {
      await new Promise((r) => setTimeout(r, 200));

      const stepTimer = setInterval(() => {
        setAnalysisStep((s) => Math.min(s + 1, 3));
      }, 2200);

      let pipelineResult;
      try {
        pipelineResult = await runFullCoachingPipeline(user.id);
      } catch (e) {
        console.warn('Pipeline partial error:', e.message);
        pipelineResult = { errors: [e.message] };
      }
      clearInterval(stepTimer);

      setAnalysisStep(4);

      const [athleteState, bottleneck, philosophy, userData] = await Promise.all([
        getAthleteState().catch(() => null),
        getLatestBottleneck().catch(() => null),
        getActivePhilosophy().catch(() => null),
        fetchPlanBuilderUserData(user.id).catch(() => null),
      ]);

      await new Promise((r) => setTimeout(r, 800));

      setIsAnalyzing(false);

      navigation.navigate('PlanBuilderChat', {
        userData,
        coachingAnalysis: {
          athleteState,
          bottleneck,
          philosophy,
          pipelineErrors: pipelineResult?.errors || [],
        },
      });
    } catch (e) {
      setAnalysisError(e.message || 'Unknown error');
    }
  }, [user?.id, navigation]);

  const handleCancelAnalysis = () => {
    setIsAnalyzing(false);
    setAnalysisError(null);
    loadPlan();
  };

  // ── Computed values ────────────────────────────────────────────────────────
  const currentWeek =
    plan?.generated_at && plan?.total_weeks
      ? Math.min(
          plan.total_weeks,
          1 + Math.max(0, Math.floor((Date.now() - new Date(plan.generated_at).getTime()) / (7 * 24 * 60 * 60 * 1000))),
        )
      : 1;
  const weekProgress = plan ? currentWeek / (plan.total_weeks || 12) : 0;
  const daysUntilRace =
    plan?.race_date ? Math.max(0, Math.ceil((new Date(plan.race_date) - new Date()) / 86400000)) : null;

  const thisWeekSessions = sessions.map((s) => ({
    id: s.id,
    day: s.day_of_week ? s.day_of_week.slice(0, 3).toUpperCase() : '—',
    date: s.date ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—',
    type: s.type || 'easy',
    label: formatSessionLabel(s.type),
    distance: s.type === 'rest' ? '—' : `${s.distance_km ?? '—'} km`,
    target: s.type === 'rest' ? '—' : [s.target_pace_min, s.target_pace_max].filter(Boolean).join('–') + ' /km',
    status: s.status || 'planned',
    coach_notes: s.coach_notes,
    structure: s.structure,
  }));

  // ── ANALYZING VIEW ─────────────────────────────────────────────────────────
  if (isAnalyzing) {
    return (
      <SafeAreaView style={styles.container}>
        <AnalysisView
          stepIndex={analysisStep}
          error={analysisError}
          onRetry={startAnalysisAndChat}
          onCancel={handleCancelAnalysis}
        />
      </SafeAreaView>
    );
  }

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Training Plan</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ── NO PLAN ────────────────────────────────────────────────────────────────
  if (!plan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Training Plan</Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>P</Text>
          </View>
          <Text style={styles.emptyTitle}>No training plan yet</Text>
          <Text style={styles.emptySubtitle}>
            We'll analyze your health data, find your strengths and weaknesses, then build a plan together with AI coaching
          </Text>
          <PrimaryButton title="Get started" onPress={startAnalysisAndChat} style={styles.emptyBtn} />
        </View>
      </SafeAreaView>
    );
  }

  // ── PLAN VIEW ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Training Plan</Text>
        <TouchableOpacity onPress={startAnalysisAndChat} style={styles.rebuildBtn}>
          <Text style={styles.rebuildText}>Rebuild</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* PLAN OVERVIEW */}
        <View style={styles.overviewCard}>
          <Text style={styles.planName}>{plan.plan_name || 'AI Training Plan'}</Text>
          {plan.coach_summary ? (
            <Text style={styles.coachQuote} numberOfLines={3}>"{plan.coach_summary}"</Text>
          ) : null}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>W{currentWeek}</Text>
              <Text style={styles.statLabel}>of {plan.total_weeks || 12}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Math.round(weekProgress * 100)}%</Text>
              <Text style={styles.statLabel}>complete</Text>
            </View>
            {daysUntilRace != null && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{daysUntilRace}d</Text>
                <Text style={styles.statLabel}>to race</Text>
              </View>
            )}
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.accent }]}>
                {(plan.phase || 'Base').toUpperCase()}
              </Text>
              <Text style={styles.statLabel}>phase</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(100, weekProgress * 100)}%` }]} />
          </View>
        </View>

        {/* COACHING FOCUS */}
        {coachingSummary?.bottleneck && (
          <View style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <Text style={styles.focusTitle}>Coaching Focus</Text>
            </View>
            <Text style={styles.focusLabel}>{coachingSummary.bottleneck.label}</Text>
            <Text style={styles.focusEvidence}>{coachingSummary.bottleneck.evidence}</Text>
            {coachingSummary.philosophy && (
              <View style={styles.focusPhilosophyBadge}>
                <Text style={styles.focusPhilosophyText}>
                  {coachingSummary.philosophy.mode?.replace(/_/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase())}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* THIS WEEK'S SESSIONS */}
        <Text style={styles.sectionTitle}>THIS WEEK</Text>
        {thisWeekSessions.length === 0 ? (
          <View style={styles.noSessionsCard}>
            <Text style={styles.noSessionsText}>No sessions planned for this week</Text>
          </View>
        ) : (
          thisWeekSessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.sessionCard, { borderLeftColor: SESSION_COLORS[s.type] || colors.divider }]}
              onPress={() => navigation.navigate('SessionDetail', { session: s })}
              activeOpacity={0.8}
            >
              <View style={styles.sessionLeft}>
                <View style={styles.sessionDayRow}>
                  <Text style={styles.sessionDay}>{s.day}</Text>
                  <Text style={styles.sessionDate}>{s.date}</Text>
                </View>
                <Text style={styles.sessionLabel}>{s.label}</Text>
                {s.type !== 'rest' && <Text style={styles.sessionMeta}>{s.distance} · {s.target}</Text>}
                {s.coach_notes && <Text style={styles.sessionNotes} numberOfLines={1}>{s.coach_notes}</Text>}
              </View>
              <View style={styles.sessionRight}>
                {s.status === 'completed' && <Text style={styles.doneIcon}>✓</Text>}
                {s.status === 'missed' && <Text style={styles.missedIcon}>✗</Text>}
                {s.status === 'planned' && <Text style={styles.chevron}>›</Text>}
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* ADAPTATION */}
        {adaptation?.ai_explanation && (
          <>
            <Text style={styles.sectionTitle}>WEEKLY ADAPTATION</Text>
            <View style={styles.adaptCard}>
              <View style={styles.adaptTop}>
                <Text style={styles.adaptOutcome}>
                  {adaptation.adaptation_outcome?.replace(/_/g, ' ')}
                </Text>
                {adaptation.volume_adjustment_percent != null && adaptation.volume_adjustment_percent !== 0 && (
                  <View style={[styles.adaptBadge, {
                    backgroundColor: adaptation.volume_adjustment_percent > 0 ? colors.success + '20' : colors.warning + '20',
                  }]}>
                    <Text style={[styles.adaptBadgeText, {
                      color: adaptation.volume_adjustment_percent > 0 ? colors.success : colors.warning,
                    }]}>
                      {adaptation.volume_adjustment_percent > 0 ? '+' : ''}{adaptation.volume_adjustment_percent}% vol
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.adaptExplanation}>{adaptation.ai_explanation}</Text>
              <View style={styles.adaptStats}>
                <Text style={styles.adaptStatText}>
                  {adaptation.completed_sessions}/{adaptation.planned_sessions} sessions
                </Text>
                <Text style={styles.adaptStatText}>·</Text>
                <Text style={styles.adaptStatText}>
                  {Number(adaptation.actual_km || 0).toFixed(0)}/{Number(adaptation.planned_km || 0).toFixed(0)} km
                </Text>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: PADDING, paddingVertical: 14,
  },
  headerTitle: { ...typography.largeTitle, fontWeight: '700', color: colors.primaryText },
  rebuildBtn: {
    backgroundColor: colors.accent + '15', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
  },
  rebuildText: { ...typography.secondary, color: colors.link, fontWeight: '600' },
  scroll: { paddingHorizontal: PADDING, paddingBottom: 100 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyIconText: { fontSize: 36, fontWeight: '700', color: '#fff' },
  emptyTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  emptySubtitle: {
    ...typography.body, color: colors.secondaryText, textAlign: 'center', marginBottom: 28, lineHeight: 22,
  },
  emptyBtn: { width: '100%', marginBottom: 16 },
  overviewCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20,
    marginBottom: 16, ...theme.cardShadow,
  },
  planName: { ...typography.title, color: colors.primaryText, marginBottom: 6 },
  coachQuote: { ...typography.body, fontStyle: 'italic', color: colors.secondaryText, marginBottom: 16, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stat: {
    flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  statValue: { ...typography.title, fontSize: 18, color: colors.primaryText },
  statLabel: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  progressTrack: { height: 4, backgroundColor: colors.backgroundSecondary, borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  focusCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 16,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: colors.coachPurple, ...theme.cardShadow,
  },
  focusHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  focusTitle: { ...typography.secondary, fontWeight: '600', color: colors.primaryText },
  focusLabel: { ...typography.title, color: colors.primaryText, marginBottom: 4, fontSize: 16 },
  focusEvidence: { ...typography.caption, color: colors.secondaryText, lineHeight: 18, marginBottom: 10 },
  focusPhilosophyBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.coachPurpleLight,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  focusPhilosophyText: { ...typography.caption, fontWeight: '600', color: colors.coachPurple },
  sectionTitle: {
    ...typography.caption, color: colors.secondaryText, letterSpacing: 1,
    marginBottom: 10, marginTop: 8,
  },
  noSessionsCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20,
    alignItems: 'center', marginBottom: 16, ...theme.cardShadow,
  },
  noSessionsText: { ...typography.body, color: colors.secondaryText },
  sessionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 16, marginBottom: 10, borderLeftWidth: 4, ...theme.cardShadow,
  },
  sessionLeft: { flex: 1 },
  sessionDayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sessionDay: { ...typography.caption, fontWeight: '700', color: colors.primaryText },
  sessionDate: { ...typography.caption, color: colors.secondaryText },
  sessionLabel: { ...typography.body, fontWeight: '600', color: colors.primaryText, marginBottom: 2 },
  sessionMeta: { ...typography.caption, color: colors.secondaryText },
  sessionNotes: { ...typography.caption, color: colors.secondaryText, fontStyle: 'italic', marginTop: 4 },
  sessionRight: { marginLeft: 12 },
  doneIcon: { fontSize: 20, color: colors.success },
  missedIcon: { fontSize: 20, color: colors.destructive },
  chevron: { fontSize: 24, color: colors.secondaryText },
  adaptCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 16,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: colors.accent, ...theme.cardShadow,
  },
  adaptTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  adaptOutcome: { ...typography.secondary, fontWeight: '600', color: colors.primaryText, textTransform: 'capitalize' },
  adaptBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  adaptBadgeText: { ...typography.caption, fontWeight: '600' },
  adaptExplanation: { ...typography.body, color: colors.primaryText, lineHeight: 20, marginBottom: 10 },
  adaptStats: { flexDirection: 'row', gap: 6 },
  adaptStatText: { ...typography.caption, color: colors.secondaryText },
});
