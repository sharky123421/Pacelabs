import React, { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, SecondaryButton, SkeletonToday, GlassCard } from '../components';
import { hapticLight } from '../lib/haptics';
const CoachChatScreen = React.lazy(() => import('./CoachChatScreen').then(m => ({ default: m.CoachChatScreen })));
import { getAppleHealthConnection, fullSync } from '../services/appleHealth';
import { supabase } from '../lib/supabase';
import {
  fetchTodaySessionDecision,
  saveUserChoice,
  saveSessionModification,
  getBaselines,
} from '../services/todaySessionAdapter';
import {
  getOptimizedSession,
  getCoachingSummary,
  saveDailyChoice,
} from '../services/coachingEngine';
import { getActivePlan, getPlanSessions } from '../services/planBuilder';

const SESSION_COLORS = {
  easy: colors.neonGreen,
  tempo: colors.neonOrange,
  intervals: colors.neonRed,
  long: colors.neonCyan,
  rest: colors.secondaryText,
  recovery: colors.neonGreen,
  progression: colors.neonOrange,
};
const WARNING_BORDER = { none: null, amber: '#FF9F0A', orange: '#FF6B00', red: '#FF453A' };
const WARNING_BG = { amber: '#FFF8EE', orange: '#FFF3E0', red: '#FFF0EF' };

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTodayDateString() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

const VERDICT_CONFIG = {
  ready: { label: 'Ready to train hard', color: colors.success },
  easy: { label: 'Take it easy today', color: colors.warning },
  rest: { label: 'Rest day recommended', color: colors.destructive },
};
const READINESS_VERDICT_TO_KEY = {
  GREEN: 'ready',
  YELLOW: 'easy',
  RED: 'rest',
};

const DEFAULT_SESSION = {
  type: 'easy',
  badge: 'EASY RUN',
  distance: '--',
  pace: '--',
  hrZone: '--',
  briefing: 'Add a training plan or sync wellness for a personalized session.',
  weather: null,
  completedToday: false,
  completedDistance: null,
};

function getWeatherAdvice(weatherStr) {
  if (!weatherStr) return null;
  const lower = weatherStr.toLowerCase();
  if (lower.includes('\u00b0c')) {
    const match = weatherStr.match(/(-?\d+)/);
    const temp = match ? parseInt(match[1], 10) : null;
    if (temp != null && temp < 0) return 'Layer up \u2014 dress for 10\u00b0C warmer';
    if (temp != null && temp > 25) return 'Heat advisory \u2014 slow down 15\u201320 sec/km';
  }
  if (lower.includes('rain') || lower.includes('wet')) return 'Wet roads \u2014 watch your footing';
  if (lower.includes('wind')) return 'Headwind on return \u2014 start into the wind';
  return null;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLEEP_LABELS = ['Very poor', 'Poor', 'Average', 'Good', 'Great'];

function buildWeekDays(sessions) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = DAY_LABELS[d.getDay()];
    const isToday = dateStr === todayStr;
    const s = sessions.find((sess) => sess.date === dateStr);
    days.push({
      label,
      today: isToday,
      done: s?.status === 'completed',
      missed: s?.status === 'missed',
      session: s?.type || null,
      distance: s && s.type !== 'rest' ? `${s.distance_km ?? '--'} km` : null,
    });
  }
  return days;
}

export function TodayScreen() {
  const { user } = useAuth();
  const firstName = user?.user_metadata?.display_name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0];
  const greeting = getGreeting();
  const dateStr = getTodayDateString();

  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [coachChatVisible, setCoachChatVisible] = useState(false);
  const [recoveryDetailVisible, setRecoveryDetailVisible] = useState(false);
  const [feeling, setFeeling] = useState(null);
  const [appleWellness, setAppleWellness] = useState(null);
  const [readinessState, setReadinessState] = useState('none');
  const [refreshing, setRefreshing] = useState(false);
  const [lastAppleSyncAt, setLastAppleSyncAt] = useState(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const [aiDecision, setAiDecision] = useState(null);
  const [plannedSession, setPlannedSession] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [userChoice, setUserChoice] = useState(null);
  const [patternDismissed, setPatternDismissed] = useState(false);
  const [manualWellness, setManualWellness] = useState({ sleep_quality: null, energy: null, soreness: null });
  const [manualStep, setManualStep] = useState(0);
  const [baselines, setBaselines] = useState(null);
  const [whyExpanded, setWhyExpanded] = useState(false);
  const [coachingSummary, setCoachingSummary] = useState(null);
  const [weekSessions, setWeekSessions] = useState([]);
  const aiFetchedToday = useRef(false);

  const userId = user?.id;

  const loadWellness = useCallback(async () => {
    if (!userId) return;
    try {
      const conn = await getAppleHealthConnection(userId);
      if (!conn) {
        setReadinessState('none');
        setAppleWellness(null);
        setLastAppleSyncAt(null);
        setInitialLoadDone(true);
        return;
      }
      setReadinessState('apple');
      setLastAppleSyncAt(conn.last_synced_at || null);
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('apple_wellness')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      setAppleWellness(data || null);
    } catch (e) {
      setReadinessState('none');
      setAppleWellness(null);
      setLastAppleSyncAt(null);
    } finally {
      setInitialLoadDone(true);
    }
  }, [userId]);

  useEffect(() => {
    loadWellness();
  }, [loadWellness]);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      getBaselines().catch(() => null),
      getCoachingSummary().catch(() => null),
      getActivePlan(userId).then(async (plan) => {
        if (!plan?.id) return [];
        const generatedAt = plan.generated_at ? new Date(plan.generated_at).getTime() : Date.now();
        const weeksElapsed = Math.floor((Date.now() - generatedAt) / (7 * 24 * 60 * 60 * 1000));
        const currentWeek = Math.min(plan.total_weeks || 12, 1 + Math.max(0, weeksElapsed));
        return getPlanSessions(plan.id, currentWeek);
      }).catch(() => []),
    ]).then(([b, cs, sessions]) => {
      setBaselines(b);
      setCoachingSummary(cs);
      setWeekSessions(sessions);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || !initialLoadDone) return;
    const hasWellness = readinessState === 'apple' && appleWellness;
    if (!hasWellness) return;
    if (aiFetchedToday.current) return;

    aiFetchedToday.current = true;
    setAiLoading(true);
    setAiError(null);
    fetchTodaySessionDecision({})
      .then((res) => {
        setAiDecision(res.decision);
        setPlannedSession(res.planned_session ?? null);
        setAiError(null);
      })
      .catch((err) => {
        setAiError(err.message);
        setAiDecision(null);
        setPlannedSession(null);
      })
      .finally(() => setAiLoading(false));
  }, [userId, initialLoadDone, readinessState, appleWellness]);

  useEffect(() => {
    if (!userId || !lastAppleSyncAt) return;
    const last = new Date(lastAppleSyncAt).getTime();
    if (Date.now() - last < 30 * 60 * 1000) return;
    fullSync(userId).then(() => loadWellness()).catch(() => { });
  }, [userId, lastAppleSyncAt]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    aiFetchedToday.current = false;
    try {
      await fullSync(userId);
      await loadWellness();
      setAiLoading(true);
      fetchTodaySessionDecision({ force_refresh: true })
        .then((res) => { setAiDecision(res.decision); setPlannedSession(res.planned_session ?? null); setAiError(null); })
        .catch((err) => { setAiError(err.message); setAiDecision(null); setPlannedSession(null); })
        .finally(() => setAiLoading(false));
    } finally {
      setRefreshing(false);
    }
  }, [userId, loadWellness]);

  const submitManualWellness = useCallback(() => {
    if (manualStep < 2) {
      setManualStep((s) => s + 1);
      return;
    }
    aiFetchedToday.current = false;
    setAiLoading(true);
    setAiError(null);
    const manual = {
      sleep_quality: (manualWellness.sleep_quality ?? 2) + 1,
      energy: (manualWellness.energy ?? 2) + 1,
      soreness: (manualWellness.soreness ?? 1) + 1,
    };
    fetchTodaySessionDecision({ manual_wellness: manual })
      .then((res) => { setAiDecision(res.decision); setPlannedSession(res.planned_session ?? null); setAiError(null); })
      .catch((err) => { setAiError(err.message); setAiDecision(null); setPlannedSession(null); })
      .finally(() => setAiLoading(false));
  }, [manualStep, manualWellness]);

  const decision = aiDecision || {};
  const action = decision?.decision?.action ?? 'proceed';
  const recommended = decision?.decision?.recommended_session;
  const vsOriginal = decision?.decision?.vs_original;
  const coachMessage = decision?.coach_message;
  const warningUi = decision?.warning_ui ?? {};
  const reasoning = decision?.reasoning;
  const patternDetected = !!(decision?.recovery_assessment?.pattern_detected && !patternDismissed);
  const patternDescription = decision?.recovery_assessment?.pattern_description;

  const recoveryScore = decision?.recovery_assessment?.overall_score ?? null;
  const recoveryStatus = decision?.recovery_assessment?.status ?? null;
  const verdictKey = recoveryStatus === 'OPTIMAL' ? 'ready' : recoveryStatus === 'SUBOPTIMAL' ? 'easy' : recoveryStatus === 'POOR' || recoveryStatus === 'VERY_POOR' ? 'rest' : (appleWellness?.readiness_verdict ? READINESS_VERDICT_TO_KEY[appleWellness.readiness_verdict] : 'ready');
  const verdictCfg = VERDICT_CONFIG[verdictKey];
  const warningLevel = warningUi.warning_level || 'none';
  const showWarningBanner = !!warningUi.show_warning;

  const todaySession = recommended
    ? {
      type: recommended.type || 'easy',
      badge: (recommended.type || 'EASY').toUpperCase().replace(' ', ' RUN'),
      distance: recommended.distance_km != null ? `${recommended.distance_km} km` : '--',
      pace: [recommended.target_pace_min, recommended.target_pace_max].filter(Boolean).join(' \u2013 ') || '--',
      hrZone: recommended.target_hr_zone || (recommended.target_hr_max_bpm ? `Max ${recommended.target_hr_max_bpm} bpm` : '--'),
      briefing: coachMessage?.body ?? reasoning?.summary ?? '',
      weather: null,
      completedToday: false,
      completedDistance: null,
    }
    : DEFAULT_SESSION;
  const sessionColor = SESSION_COLORS[todaySession.type] || colors.linkNeon;
  const isRestDay = todaySession.type === 'rest';
  const isCompletedToday = todaySession.completedToday === true;
  const weatherStr = decision?.weather ? `${decision.weather.temp ?? '--'}\u00b0C \u00b7 ${decision.weather.description ?? ''}` : null;
  const weatherAdvice = getWeatherAdvice(weatherStr);

  if (userId && !initialLoadDone) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <SkeletonToday />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.linkNeon} />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
          <TouchableOpacity
            style={styles.askCoachBtn}
            onPress={() => setCoachChatVisible(true)}
          >
            <Text style={styles.askCoachText}>Ask coach</Text>
          </TouchableOpacity>
        </View>

        {/* Pattern warning card */}
        {patternDetected && patternDescription && (
          <GlassCard style={styles.patternCard} variant="soft">
            <View style={styles.patternCardHeader}>
              <Text style={styles.patternCardTitle}>Multi-day pattern detected</Text>
              <TouchableOpacity hitSlop={12} onPress={() => { setPatternDismissed(true); hapticLight(); }}>
                <Text style={styles.patternCardDismiss}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.patternCardBody}>{patternDescription}</Text>
          </GlassCard>
        )}

        {/* READINESS */}
        <GlassCard
          variant="default"
          onPress={() => setRecoveryDetailVisible(true)}
          style={WARNING_BORDER[warningLevel] && { borderWidth: 1.5, borderColor: WARNING_BORDER[warningLevel] }}
        >
          {readinessState === 'none' && (
            <>
              {manualStep === 0 && (
                <>
                  <Text style={styles.readinessSubtitle}>How was your sleep last night?</Text>
                  <View style={styles.scaleRow}>
                    {SLEEP_LABELS.map((label, i) => (
                      <TouchableOpacity
                        key={label}
                        style={[styles.scaleBtn, manualWellness.sleep_quality === i && styles.scaleBtnSelected]}
                        onPress={() => setManualWellness((m) => ({ ...m, sleep_quality: i }))}
                      >
                        <Text style={[styles.scaleNumber, manualWellness.sleep_quality === i && styles.scaleNumberSelected]}>{i + 1}</Text>
                        <Text style={[styles.scaleLabel, manualWellness.sleep_quality === i && styles.scaleLabelSelected]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {manualStep === 1 && (
                <>
                  <Text style={styles.readinessSubtitle}>How's your energy right now?</Text>
                  <View style={styles.chipRow}>
                    {['Very low', 'Low', 'Normal', 'High', 'Very high'].map((label, i) => (
                      <TouchableOpacity
                        key={label}
                        style={[styles.chip, manualWellness.energy === i && styles.chipSelected]}
                        onPress={() => setManualWellness((m) => ({ ...m, energy: i }))}
                      >
                        <Text style={[styles.chipText, manualWellness.energy === i && styles.chipTextSelected]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {manualStep === 2 && (
                <>
                  <Text style={styles.readinessSubtitle}>Any muscle soreness or heaviness?</Text>
                  <View style={styles.chipRow}>
                    {['Significant', 'Moderate', 'Slight', 'None'].map((label, i) => (
                      <TouchableOpacity
                        key={label}
                        style={[styles.chip, manualWellness.soreness === i && styles.chipSelected]}
                        onPress={() => setManualWellness((m) => ({ ...m, soreness: i }))}
                      >
                        <Text style={[styles.chipText, manualWellness.soreness === i && styles.chipTextSelected]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              {manualStep < 2 ? (
                <PrimaryButton title="Next" onPress={() => setManualStep((s) => s + 1)} style={styles.startBtn} />
              ) : (
                <PrimaryButton title="Get my session" onPress={submitManualWellness} style={styles.startBtn} />
              )}
            </>
          )}
          {readinessState === 'garmin' && (
            <>
              <Text style={styles.readinessTitle}>Body Battery / HRV / Sleep / Stress</Text>
              <View style={styles.metricChips}>
                <View style={styles.chip}><Text style={styles.chipText}>HRV 42ms</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>Sleep 7h</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>Stress 35</Text></View>
                <View style={styles.chip}><Text style={styles.chipText}>Battery 72</Text></View>
              </View>
            </>
          )}
          {readinessState === 'apple' && appleWellness && (
            <>
              <Text style={styles.readinessTitle}>HRV / Resting HR / Sleep</Text>
              <View style={styles.metricChips}>
                {appleWellness.hrv_last_night != null && (
                  <View style={[styles.chip, appleWellness.hrv_status === 'POOR' && { borderColor: colors.destructive, borderWidth: 1 }]}>
                    <Text style={styles.chipText}>HRV {Math.round(appleWellness.hrv_last_night)}ms</Text>
                  </View>
                )}
                {appleWellness.resting_heart_rate != null && (
                  <View style={styles.chip}><Text style={styles.chipText}>RHR {appleWellness.resting_heart_rate}</Text></View>
                )}
                {appleWellness.sleep_duration_seconds != null && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>Sleep {Math.round(appleWellness.sleep_duration_seconds / 3600)}h</Text>
                  </View>
                )}
                {recoveryScore != null && (
                  <View style={styles.chip}><Text style={styles.chipText}>Recovery {recoveryScore}</Text></View>
                )}
                {(appleWellness.move_calories != null || appleWellness.move_goal) && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      Rings {appleWellness.move_goal ? `${Math.round((appleWellness.move_calories || 0) / appleWellness.move_goal * 100)}%` : '--'}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
          {readinessState === 'apple' && !appleWellness && (
            <>
              <Text style={styles.readinessTitle}>Apple Health</Text>
              <Text style={styles.readinessHint}>Pull down to sync today's wellness data</Text>
            </>
          )}
          {!baselines && readinessState !== 'none' && (
            <Text style={styles.baselineHint}>Pacelab is learning your baseline -- keep using the app for personal recovery benchmarks.</Text>
          )}
          <View style={[styles.verdictBadge, { backgroundColor: verdictCfg.color + '15' }]}>
            <View style={[styles.verdictDot, { backgroundColor: verdictCfg.color }]} />
            <Text style={[styles.verdictText, { color: verdictCfg.color }]}>
              {aiLoading ? 'Analyzing...' : verdictCfg.label}
            </Text>
          </View>
        </GlassCard>

        {/* Warning banner */}
        {showWarningBanner && (warningUi.warning_headline || warningUi.warning_subline) && (
          <Pressable
            style={({ pressed }) => [
              styles.warningBanner,
              { backgroundColor: WARNING_BG[warningLevel] || WARNING_BG.amber },
              { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
            onPress={() => { setRecoveryDetailVisible(true); hapticLight(); }}
          >
            <View style={[styles.warningDot, { backgroundColor: WARNING_BORDER[warningLevel] || colors.warning }]} />
            <View style={styles.warningBannerText}>
              <Text style={styles.warningBannerHeadline}>{warningUi.warning_headline}</Text>
              {warningUi.warning_subline ? <Text style={styles.warningBannerSubline}>{warningUi.warning_subline}</Text> : null}
            </View>
          </Pressable>
        )}

        {/* TODAY'S SESSION */}
        {aiError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorCardText}>{aiError}</Text>
            <SecondaryButton title="Retry" onPress={() => { aiFetchedToday.current = false; onRefresh(); }} />
          </View>
        )}
        <GlassCard
          variant="elevated"
          style={[
            styles.sessionCard,
            { borderLeftColor: action === 'rest' ? colors.destructive : sessionColor },
            action === 'replace' && { borderLeftColor: colors.warning },
          ]}
        >
          <View style={styles.sessionContent}>
            {aiDecision && action === 'proceed' && userChoice !== 'declined' && (
              <View style={[styles.sessionPill, { backgroundColor: colors.success + '15' }]}>
                <Text style={[styles.sessionPillText, { color: colors.success }]}>Good to go</Text>
              </View>
            )}
            {action === 'modify' && (
              <View style={[styles.sessionPill, { backgroundColor: colors.warning + '15' }]}>
                <Text style={[styles.sessionPillText, { color: colors.warning }]}>{vsOriginal?.reason_short ?? 'Intensity reduced'}</Text>
              </View>
            )}
            {action === 'replace' && (
              <View style={[styles.sessionPill, { backgroundColor: colors.warning + '15' }]}>
                <Text style={[styles.sessionPillText, { color: colors.warning }]}>Session adapted to recovery</Text>
              </View>
            )}
            {isRestDay ? (
              <>
                <View style={styles.sessionBadge}>
                  <Text style={styles.sessionBadgeText}>REST DAY</Text>
                </View>
                <Text style={styles.sessionDistance}>Rest day recommended</Text>
                <Text style={styles.sessionBriefing}>{coachMessage?.body ?? 'Recovery is where fitness is built. Take it easy today.'}</Text>
                {reasoning?.key_factors?.length > 0 && (
                  <View style={styles.factorRow}>
                    {reasoning.key_factors.slice(0, 3).map((f, i) => (
                      <View key={i} style={styles.chip}><Text style={styles.chipText} numberOfLines={1}>{f}</Text></View>
                    ))}
                  </View>
                )}
                {userChoice === null && (
                  <>
                    <PrimaryButton title="Take a rest day" onPress={async () => { setUserChoice('accepted'); await saveUserChoice('accepted'); }} style={styles.startBtn} />
                    <TouchableOpacity onPress={() => Alert.alert('Run anyway?', 'Maximum recommended: 25 min easy jog, keep HR low.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Run anyway', onPress: () => setUserChoice('modified') }])}>
                      <Text style={styles.runAnywayLink}>Run anyway</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : isCompletedToday ? (
              <>
                <View style={[styles.sessionBadge, { backgroundColor: colors.success + '15' }]}>
                  <Text style={[styles.sessionBadgeText, { color: colors.success }]}>DONE</Text>
                </View>
                <Text style={styles.sessionDistance}>Great work! {todaySession.completedDistance}km completed</Text>
                <PrimaryButton title="View run" onPress={() => Alert.alert('View Run', 'Run tracking and logging will be available in the next update.')} style={styles.startBtn} />
              </>
            ) : (
              <>
                <View style={styles.sessionBadge}>
                  <Text style={styles.sessionBadgeText}>{todaySession.badge}</Text>
                </View>
                <Text style={styles.sessionDistance}>{todaySession.distance}</Text>
                <Text style={styles.sessionPace}>{todaySession.pace}</Text>
                <Text style={styles.sessionHR}>{todaySession.hrZone}</Text>
                {(action === 'modify' || action === 'replace') && vsOriginal?.changed && (
                  <Text style={styles.originalStrikethrough}>
                    Original: {decision?.decision?.vs_original ? 'see plan' : ''}
                  </Text>
                )}
                <Text style={styles.sessionBriefing}>"{todaySession.briefing}"</Text>
                {coachMessage?.title && (
                  <View style={styles.coachMessageCard}>
                    <Text style={styles.coachMessageTitle}>{coachMessage.title}</Text>
                    <Text style={styles.coachMessageBody}>{coachMessage.body}</Text>
                  </View>
                )}
                {(weatherStr || weatherAdvice) && (
                  <View style={styles.weatherStrip}>
                    {weatherStr && <Text style={styles.weatherText}>{weatherStr}</Text>}
                    {weatherAdvice ? <Text style={[styles.weatherAdvice, { marginTop: 6 }]}>{weatherAdvice}</Text> : null}
                  </View>
                )}
                {userChoice === null && !isRestDay && (
                  <>
                    {action === 'proceed' && (
                      <>
                        <PrimaryButton title="Start Run" onPress={() => Alert.alert('Start Run', 'GPS run tracking will be available in the next update. Log your run manually from the Runs tab after you finish.')} style={styles.startBtn} />
                        <SecondaryButton title="Adjust session" onPress={() => setAdjustModalVisible(true)} style={styles.adjustBtn} />
                      </>
                    )}
                    {action === 'modify' && (
                      <>
                        <PrimaryButton
                          title="Train with adjusted session"
                          onPress={async () => {
                            setUserChoice('accepted');
                            await saveUserChoice('accepted');
                            if (recommended && (plannedSession || vsOriginal?.changed)) {
                              await saveSessionModification({
                                original_type: plannedSession?.type,
                                original_distance: plannedSession?.distance_km,
                                original_pace_target: plannedSession?.target_pace_min && plannedSession?.target_pace_max ? `${plannedSession.target_pace_min}\u2013${plannedSession.target_pace_max}` : null,
                                modified_type: recommended.type,
                                modified_distance: recommended.distance_km,
                                modified_pace_target: recommended.target_pace_min && recommended.target_pace_max ? `${recommended.target_pace_min}\u2013${recommended.target_pace_max}` : null,
                                modification_reason: vsOriginal?.reason_short ?? 'AI adaptation',
                                recovery_score_at_modification: recoveryScore,
                                ai_reasoning: reasoning?.summary,
                              }).catch(() => { });
                            }
                          }}
                          style={styles.startBtn}
                        />
                        <SecondaryButton title="Keep original plan" onPress={async () => { setUserChoice('declined'); await saveUserChoice('declined'); }} style={styles.adjustBtn} />
                      </>
                    )}
                    {action === 'replace' && (
                      <>
                        <PrimaryButton
                          title="Use recovery session"
                          onPress={async () => {
                            setUserChoice('accepted');
                            await saveUserChoice('accepted');
                            if (recommended && (plannedSession || vsOriginal?.changed)) {
                              await saveSessionModification({
                                original_type: plannedSession?.type,
                                original_distance: plannedSession?.distance_km,
                                original_pace_target: plannedSession?.target_pace_min && plannedSession?.target_pace_max ? `${plannedSession.target_pace_min}\u2013${plannedSession.target_pace_max}` : null,
                                modified_type: recommended.type,
                                modified_distance: recommended.distance_km,
                                modified_pace_target: recommended.target_pace_min && recommended.target_pace_max ? `${recommended.target_pace_min}\u2013${recommended.target_pace_max}` : null,
                                modification_reason: vsOriginal?.reason_short ?? 'Replaced with recovery',
                                recovery_score_at_modification: recoveryScore,
                                ai_reasoning: reasoning?.summary,
                              }).catch(() => { });
                            }
                          }}
                          style={styles.startBtn}
                        />
                        <TouchableOpacity onPress={() => Alert.alert('Keep original anyway?', "Your AI coach recommends against this based on your recovery data.", [{ text: 'Take it easy', style: 'cancel' }, { text: 'Train hard anyway', onPress: async () => { setUserChoice('declined'); await saveUserChoice('declined'); } }])}>
                          <Text style={styles.runAnywayLink}>Keep original anyway</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}
                {userChoice !== null && (
                  <PrimaryButton title="Start Run" onPress={() => Alert.alert('Start Run', 'GPS run tracking will be available in the next update. Log your run manually from the Runs tab after you finish.')} style={styles.startBtn} />
                )}
              </>
            )}
          </View>
        </GlassCard>

        {/* WHY THIS SESSION */}
        {(decision?.why_this_session || coachingSummary?.bottleneck) && !isRestDay && (
          <GlassCard
            variant="soft"
            onPress={() => { setWhyExpanded((e) => !e); hapticLight(); }}
            style={styles.whyCard}
          >
            <View style={styles.whyHeader}>
              <Text style={styles.whyHeaderTitle}>Why this session</Text>
              <Text style={styles.whyChevron}>{whyExpanded ? '\u25be' : '\u203a'}</Text>
            </View>
            {!whyExpanded && (
              <Text style={styles.whyPreview} numberOfLines={1}>
                {decision?.why_this_session?.bottleneck_label
                  || coachingSummary?.bottleneck?.label
                  || 'Tap to see coaching reasoning'}
              </Text>
            )}
            {whyExpanded && (
              <View style={styles.whyBody}>
                <View style={styles.whyRow}>
                  <Text style={styles.whyLabel}>Current focus</Text>
                  <View style={styles.whyBadge}>
                    <Text style={styles.whyBadgeText}>
                      {decision?.why_this_session?.bottleneck_label
                        || coachingSummary?.bottleneck?.label
                        || '--'}
                    </Text>
                  </View>
                </View>
                {(decision?.why_this_session?.today_focus || coachingSummary?.bottleneck?.coachingNote) && (
                  <View style={styles.whyRow}>
                    <Text style={styles.whyLabel}>Today's target</Text>
                    <Text style={styles.whyValue}>
                      {decision?.why_this_session?.today_focus
                        || coachingSummary?.bottleneck?.coachingNote}
                    </Text>
                  </View>
                )}
                {decision?.why_this_session?.why_it_matters && (
                  <View style={styles.whyRow}>
                    <Text style={styles.whyLabel}>Why it matters</Text>
                    <Text style={styles.whyValue}>{decision.why_this_session.why_it_matters}</Text>
                  </View>
                )}
                {coachingSummary?.philosophy && (
                  <View style={styles.whyRow}>
                    <Text style={styles.whyLabel}>Training mode</Text>
                    <Text style={styles.whyValue}>
                      {coachingSummary.philosophy.mode?.replace(/_/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase())}
                      {coachingSummary.philosophy.successMetric
                        ? ` \u2014 targeting: ${coachingSummary.philosophy.successMetric}`
                        : ''}
                    </Text>
                  </View>
                )}
                {coachingSummary?.adaptation && (
                  <View style={[styles.whyRow, styles.whyRowLast]}>
                    <Text style={styles.whyLabel}>Last week</Text>
                    <Text style={styles.whyValue}>
                      {coachingSummary.adaptation.explanation || `${coachingSummary.adaptation.outcome} \u2014 ${coachingSummary.adaptation.action}`}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </GlassCard>
        )}

        {/* WEEKLY OVERVIEW */}
        <Text style={styles.weekTitle}>This week</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekScroll}
        >
          {buildWeekDays(weekSessions).map((day) => (
            <View
              key={day.label}
              style={[styles.dayPill, day.today && styles.dayPillToday]}
            >
              <Text style={[styles.dayLabel, day.today && styles.dayLabelToday]}>{day.label}</Text>
              {day.done && <Text style={styles.dayMeta}>{'\u2713'} {day.distance}</Text>}
              {day.missed && <Text style={styles.dayMetaMiss}>{'\u2717'}</Text>}
              {!day.done && !day.missed && day.session && (
                <Text style={styles.dayMeta}>{day.distance}</Text>
              )}
            </View>
          ))}
        </ScrollView>
      </ScrollView>

      {/* Floating coach button */}
      <TouchableOpacity
        style={styles.coachFab}
        onPress={() => setCoachChatVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.coachFabText}>AI</Text>
      </TouchableOpacity>

      {/* Coach chat modal */}
      {coachChatVisible && (
        <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
          <CoachChatScreen
            visible={coachChatVisible}
            onClose={() => setCoachChatVisible(false)}
          />
        </Suspense>
      )}

      {/* Recovery detail modal */}
      <Modal
        visible={recoveryDetailVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRecoveryDetailVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRecoveryDetailVisible(false)}>
          <Pressable style={styles.recoveryModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.recoveryModalHandle} />
            <Text style={styles.modalTitle}>Recovery analysis</Text>
            <Text style={styles.recoveryModalSubtitle}>AI assessment {'\u00b7'} {dateStr}</Text>
            {appleWellness && (
              <>
                <View style={styles.recoveryMetricRow}>
                  <Text style={styles.recoveryMetricLabel}>Heart Rate Variability</Text>
                  <Text style={styles.recoveryMetricValue}>Today: {appleWellness.hrv_last_night != null ? `${Math.round(appleWellness.hrv_last_night)}ms` : '--'}</Text>
                  <Text style={styles.recoveryMetricBaseline}>Baseline: avg --</Text>
                  <View style={styles.recoveryPill}><Text style={styles.recoveryPillText}>{recoveryStatus ?? '--'}</Text></View>
                </View>
                <View style={styles.recoveryMetricRow}>
                  <Text style={styles.recoveryMetricLabel}>Resting Heart Rate</Text>
                  <Text style={styles.recoveryMetricValue}>Today: {appleWellness.resting_heart_rate ?? '--'} bpm</Text>
                  <Text style={styles.recoveryMetricBaseline}>Baseline: avg --</Text>
                  <View style={styles.recoveryPill}><Text style={styles.recoveryPillText}>{recoveryStatus ?? '--'}</Text></View>
                </View>
                <View style={styles.recoveryMetricRow}>
                  <Text style={styles.recoveryMetricLabel}>Sleep Quality</Text>
                  <Text style={styles.recoveryMetricValue}>Score {appleWellness.sleep_score ?? '--'} {'\u00b7'} {appleWellness.sleep_duration_seconds != null ? `${(appleWellness.sleep_duration_seconds / 3600).toFixed(1)}h` : '--'}</Text>
                  <Text style={styles.recoveryMetricBaseline}>Baseline: avg --</Text>
                  <View style={styles.recoveryPill}><Text style={styles.recoveryPillText}>{recoveryStatus ?? '--'}</Text></View>
                </View>
              </>
            )}
            <View style={styles.recoveryDivider} />
            <View style={styles.recoveryGaugeWrap}>
              <Text style={styles.recoveryGaugeValue}>{recoveryScore ?? '--'}</Text>
              <Text style={styles.recoveryGaugeLabel}>Recovery Score</Text>
              <View style={[styles.recoveryGaugeBar, { width: `${Math.min(100, Math.max(0, recoveryScore ?? 0))}%` }]} />
            </View>
            <Text style={styles.recoveryGaugeStatus}>{recoveryStatus ?? ''}</Text>
            {reasoning?.summary && <Text style={styles.recoverySummary}>{reasoning.summary}</Text>}
            {reasoning?.health_analysis && <Text style={styles.recoveryAnalysis}>{reasoning.health_analysis}</Text>}
            {reasoning?.load_analysis && <Text style={styles.recoveryAnalysis}>{reasoning.load_analysis}</Text>}
            {reasoning?.key_factors?.length > 0 && (
              <View style={styles.recoveryFactors}>
                <Text style={styles.recoveryFactorsTitle}>Key factors</Text>
                {reasoning.key_factors.map((f, i) => (
                  <Text key={i} style={styles.recoveryFactorItem}>{'\u2022'} {f}</Text>
                ))}
              </View>
            )}
            {reasoning?.tomorrow_consideration && (
              <View style={styles.tomorrowCard}>
                <Text style={styles.tomorrowCardText}>Tomorrow: {reasoning.tomorrow_consideration}</Text>
              </View>
            )}
            <PrimaryButton title="Close" onPress={() => setRecoveryDetailVisible(false)} style={styles.startBtn} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Adjust session modal */}
      <Modal
        visible={adjustModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAdjustModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAdjustModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Adjust session</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setAdjustModalVisible(false); Alert.alert('Session adjusted', 'Session made easier. Reduced intensity targets.'); }}>
              <Text style={styles.modalOptionText}>Make easier</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setAdjustModalVisible(false); Alert.alert('Session adjusted', 'Session made harder. Increased intensity targets.'); }}>
              <Text style={styles.modalOptionText}>Make harder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setAdjustModalVisible(false); Alert.alert('Swap session', 'Session swap will be available in the next update.'); }}>
              <Text style={styles.modalOptionText}>Swap to different session</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setAdjustModalVisible(false); setUserChoice('rest'); saveDailyChoice({ action: 'rest', reason: 'User requested rest day' }).catch(() => { }); }}>
              <Text style={styles.modalOptionText}>Rest day</Text>
            </TouchableOpacity>
            <SecondaryButton title="Cancel" onPress={() => setAdjustModalVisible(false)} style={styles.modalCancelBtn} />
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceBase },
  scroll: { paddingHorizontal: spacing.screenPaddingHorizontal, paddingTop: 8, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerLeft: { flex: 1 },
  askCoachBtn: {
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassStroke,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  askCoachText: { ...typography.caption, fontWeight: '600', color: colors.accent },
  coachFab: {
    position: 'absolute', right: spacing.screenPaddingHorizontal, bottom: 100,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    ...theme.cardShadowElevated,
  },
  coachFabText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  greeting: { ...typography.largeTitle, color: colors.primaryText, marginBottom: 4 },
  date: { ...typography.secondary, color: colors.secondaryText },
  card: {
    backgroundColor: colors.glassFillSoft, borderRadius: theme.radius.card,
    borderWidth: 1, borderColor: colors.glassStroke,
    padding: 20, marginBottom: spacing.betweenCards, ...theme.glassShadowSoft,
  },
  readinessTitle: { ...typography.title, color: colors.primaryText, marginBottom: 12 },
  scaleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  scaleBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 10, backgroundColor: colors.surfaceMuted,
  },
  scaleBtnSelected: { backgroundColor: colors.accent },
  scaleNumber: { ...typography.headline, color: colors.primaryText, marginBottom: 2 },
  scaleNumberSelected: { color: '#FFFFFF' },
  scaleLabel: { ...typography.caption, fontSize: 10, color: colors.secondaryText },
  scaleLabelSelected: { color: '#FFFFFF' },
  readinessHint: { ...typography.caption, color: colors.secondaryText, marginBottom: 12 },
  metricChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { backgroundColor: colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipSelected: { backgroundColor: colors.accent },
  chipText: { ...typography.caption, color: colors.primaryText },
  chipTextSelected: { color: '#FFFFFF' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  verdictBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill, gap: 8,
  },
  verdictDot: { width: 8, height: 8, borderRadius: 4 },
  verdictText: { ...typography.secondary, fontWeight: '600' },
  sessionCard: {
    backgroundColor: colors.glassFillSoft, borderRadius: theme.radius.card,
    borderWidth: 1, borderColor: colors.glassStroke,
    marginBottom: spacing.betweenCards, overflow: 'hidden', borderLeftWidth: 4,
    ...theme.glassShadowSoft,
  },
  sessionContent: { padding: 20 },
  sessionBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8,
  },
  sessionBadgeText: { ...typography.overline, color: colors.primaryText },
  sessionDistance: { ...typography.largeTitle, fontSize: 28, color: colors.primaryText, marginBottom: 4 },
  sessionPace: { ...typography.body, color: colors.primaryText, marginBottom: 2 },
  sessionHR: { ...typography.secondary, color: colors.secondaryText, marginBottom: 12 },
  sessionBriefing: { ...typography.body, fontStyle: 'italic', color: colors.secondaryText, marginBottom: 12 },
  weatherStrip: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  weatherText: { ...typography.secondary, color: colors.secondaryText },
  weatherAdvice: { ...typography.caption, color: colors.primaryText, fontStyle: 'italic' },
  startBtn: { marginBottom: 12 },
  adjustBtn: { marginBottom: 28 },
  weekTitle: { ...typography.title, color: colors.primaryText, marginBottom: 12 },
  weekScroll: { paddingRight: spacing.screenPaddingHorizontal },
  dayPill: {
    minWidth: 72, marginRight: 10, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: theme.radius.card, backgroundColor: colors.surfaceMuted, alignItems: 'center',
  },
  dayPillToday: { backgroundColor: colors.accent },
  dayLabel: { ...typography.secondary, fontWeight: '600', color: colors.primaryText, marginBottom: 4 },
  dayLabelToday: { color: '#FFFFFF' },
  dayMeta: { ...typography.caption, color: colors.secondaryText },
  dayMetaMiss: { ...typography.caption, color: colors.destructive },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: {
    width: '100%', maxWidth: 340, backgroundColor: colors.surfaceElevated,
    borderRadius: theme.radius.modal, padding: 24, ...theme.cardShadowElevated,
  },
  modalTitle: { ...typography.title, color: colors.primaryText, marginBottom: 16 },
  modalOption: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  modalOptionText: { ...typography.body, color: colors.primaryText },
  modalCancelBtn: { marginTop: 16 },
  patternCard: {
    backgroundColor: colors.glassFillSoft, borderRadius: theme.radius.card,
    borderWidth: 1, borderColor: colors.glassStroke,
    padding: 16, marginBottom: spacing.betweenCards, ...theme.glassShadowSoft,
  },
  patternCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  patternCardTitle: { ...typography.headline, color: colors.coachPurple },
  patternCardDismiss: { fontSize: 18, color: colors.coachPurple, padding: 4 },
  patternCardBody: { ...typography.body, color: colors.coachPurple },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderWidth: 1, borderColor: colors.glassStroke,
    borderRadius: theme.radius.card, marginBottom: spacing.betweenCards,
    ...theme.glassShadowSoft,
  },
  warningDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  warningBannerText: { flex: 1 },
  warningBannerHeadline: { ...typography.headline, color: colors.primaryText, marginBottom: 2 },
  warningBannerSubline: { ...typography.caption, color: colors.secondaryText },
  baselineHint: { ...typography.caption, color: colors.secondaryText, marginBottom: 12 },
  readinessSubtitle: { ...typography.secondary, color: colors.primaryText, marginBottom: 10, fontWeight: '500' },
  coachMessageCard: {
    borderLeftWidth: 3, borderLeftColor: colors.accent,
    backgroundColor: colors.surfaceMuted, padding: 12, borderRadius: 8,
    marginTop: 12, marginBottom: 12,
  },
  coachMessageTitle: { ...typography.secondary, fontWeight: '600', color: colors.primaryText, marginBottom: 4 },
  coachMessageBody: { ...typography.body, color: colors.primaryText },
  sessionPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 8 },
  sessionPillText: { ...typography.caption, fontWeight: '600' },
  originalStrikethrough: { ...typography.caption, color: colors.secondaryText, textDecorationLine: 'line-through', marginBottom: 8 },
  factorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  errorCard: { backgroundColor: '#FFF0EF', padding: 16, borderRadius: theme.radius.card, marginBottom: spacing.betweenCards },
  errorCardText: { ...typography.body, color: colors.destructive, marginBottom: 12 },
  runAnywayLink: { ...typography.caption, color: colors.secondaryText, textAlign: 'center', marginTop: 8 },
  recoveryModalBox: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surfaceElevated, borderTopLeftRadius: theme.radius.modal,
    borderTopRightRadius: theme.radius.modal, padding: 24, paddingBottom: 40, maxHeight: '90%',
  },
  recoveryModalHandle: { width: 36, height: 4, backgroundColor: colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  recoveryModalSubtitle: { ...typography.caption, color: colors.secondaryText, marginBottom: 20 },
  recoveryMetricRow: { marginBottom: 16 },
  recoveryMetricLabel: { ...typography.secondary, color: colors.secondaryText, marginBottom: 4 },
  recoveryMetricValue: { ...typography.body, color: colors.primaryText },
  recoveryMetricBaseline: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  recoveryPill: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 4 },
  recoveryPillText: { ...typography.caption, fontWeight: '600', color: colors.primaryText },
  recoveryDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: 20 },
  recoveryGaugeWrap: { alignItems: 'center', marginBottom: 8 },
  recoveryGaugeValue: { ...typography.largeTitle, fontSize: 48, color: colors.primaryText },
  recoveryGaugeLabel: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  recoveryGaugeBar: { height: 6, backgroundColor: colors.accent, borderRadius: 3, marginTop: 8 },
  recoveryGaugeStatus: { ...typography.secondary, textAlign: 'center', marginBottom: 16 },
  recoverySummary: { ...typography.body, color: colors.primaryText, marginBottom: 12 },
  recoveryAnalysis: { ...typography.caption, color: colors.secondaryText, marginBottom: 8 },
  recoveryFactors: { marginTop: 12, marginBottom: 12 },
  recoveryFactorsTitle: { ...typography.secondary, fontWeight: '600', marginBottom: 8, color: colors.primaryText },
  recoveryFactorItem: { ...typography.body, color: colors.primaryText, marginBottom: 4 },
  tomorrowCard: { backgroundColor: colors.surfaceMuted, padding: 12, borderRadius: 8, marginBottom: 20 },
  tomorrowCardText: { ...typography.caption, color: colors.secondaryText },
  whyCard: {
    backgroundColor: colors.glassFillSoft, borderRadius: theme.radius.card, padding: 16,
    borderWidth: 1, borderColor: colors.glassStroke,
    marginBottom: spacing.betweenCards, borderLeftWidth: 3, borderLeftColor: colors.coachPurple,
    ...theme.glassShadowSoft,
  },
  whyHeader: { flexDirection: 'row', alignItems: 'center' },
  whyHeaderTitle: { ...typography.secondary, fontWeight: '600', color: colors.primaryText, flex: 1 },
  whyChevron: { ...typography.body, color: colors.secondaryText },
  whyPreview: { ...typography.caption, color: colors.secondaryText, marginTop: 6 },
  whyBody: { marginTop: 14 },
  whyRow: {
    marginBottom: 14, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
  },
  whyRowLast: { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
  whyLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 4, letterSpacing: 0.3 },
  whyValue: { ...typography.body, color: colors.primaryText, lineHeight: 22 },
  whyBadge: {
    alignSelf: 'flex-start', backgroundColor: colors.coachPurpleLight,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  whyBadgeText: { ...typography.caption, fontWeight: '600', color: colors.coachPurple },
});
