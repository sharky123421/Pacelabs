import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView as RNScrollView,
  RefreshControl,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, SecondaryButton } from '../components';
import { getAppleHealthConnection, fullSync } from '../services/appleHealth';
import { supabase } from '../lib/supabase';

// Session type left bar colors
const SESSION_COLORS = {
  easy: colors.success,
  tempo: colors.warning,
  intervals: colors.destructive,
  long: colors.accent,
  rest: colors.secondaryText,
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getTodayDateString() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// Readiness state: 'none' | 'garmin' | 'apple' (from connections + wellness data)
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

// Mock: today's session
const TODAY_SESSION = {
  type: 'tempo',
  badge: 'TEMPO RUN',
  distance: '10 km',
  pace: '4:48 – 4:55 /km',
  hrZone: 'Zone 3–4 · 148–165 bpm',
  briefing:
    'Start conservative for the first 2km then build into threshold. Your HRV is slightly low — don\'t chase the pace, chase the effort.',
  weather: '3°C · Light wind · Good conditions',
};

// Mock: week (0 = rest, 1 = done, -1 = missed, or session type)
const WEEK_DAYS = [
  { label: 'Mon', done: true, distance: '8 km' },
  { label: 'Tue', done: true, distance: '12 km' },
  { label: 'Wed', done: false, missed: true },
  { label: 'Thu', done: true, distance: '5 km' },
  { label: 'Fri', done: false, session: 'easy', distance: '6 km' },
  { label: 'Sat', today: true, session: 'tempo', distance: '10 km' },
  { label: 'Sun', session: 'long', distance: '21 km' },
];

export function TodayScreen() {
  const { user } = useAuth();
  const firstName = user?.user_metadata?.display_name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0];
  const greeting = getGreeting();
  const dateStr = getTodayDateString();

  const [readinessModalVisible, setReadinessModalVisible] = useState(false);
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [feeling, setFeeling] = useState(null);
  const [appleWellness, setAppleWellness] = useState(null);
  const [readinessState, setReadinessState] = useState('none');
  const [refreshing, setRefreshing] = useState(false);
  const [lastAppleSyncAt, setLastAppleSyncAt] = useState(null);

  const userId = user?.id;

  const loadWellness = useCallback(async () => {
    if (!userId) return;
    try {
      const conn = await getAppleHealthConnection(userId);
      if (!conn) {
        setReadinessState('none');
        setAppleWellness(null);
        setLastAppleSyncAt(null);
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
    }
  }, [userId]);

  useEffect(() => {
    loadWellness();
  }, [loadWellness]);

  useEffect(() => {
    if (!userId || !lastAppleSyncAt) return;
    const last = new Date(lastAppleSyncAt).getTime();
    if (Date.now() - last < 30 * 60 * 1000) return;
    fullSync(userId).then(() => loadWellness()).catch(() => {});
  }, [userId, lastAppleSyncAt]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await fullSync(userId);
      await loadWellness();
    } finally {
      setRefreshing(false);
    }
  }, [userId, loadWellness]);

  const verdictKey = appleWellness?.readiness_verdict
    ? READINESS_VERDICT_TO_KEY[appleWellness.readiness_verdict] || 'ready'
    : 'ready';
  const verdictCfg = VERDICT_CONFIG[verdictKey];
  const sessionColor = SESSION_COLORS[TODAY_SESSION.type] || colors.accent;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
            <Text style={styles.date}>{dateStr}</Text>
          </View>
          <TouchableOpacity style={styles.bell} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION 1 — READINESS */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => setReadinessModalVisible(true)}
          activeOpacity={0.9}
        >
          {readinessState === 'none' && (
            <>
              <Text style={styles.readinessTitle}>How do you feel today?</Text>
              <View style={styles.emojiRow}>
                {['😴', '😕', '😐', '🙂', '💪'].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.emojiBtn, feeling === emoji && styles.emojiBtnSelected]}
                    onPress={() => setFeeling(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.readinessHint}>
                Connect Garmin or Apple Watch for automatic readiness
              </Text>
            </>
          )}
          {readinessState === 'garmin' && (
            <>
              <Text style={styles.readinessTitle}>Body Battery · HRV · Sleep · Stress</Text>
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
              <Text style={styles.readinessTitle}>HRV · Resting HR · Sleep</Text>
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
                {(appleWellness.move_calories != null || appleWellness.move_goal) && (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      Rings {appleWellness.move_goal ? `${Math.round((appleWellness.move_calories || 0) / appleWellness.move_goal * 100)}%` : '—'}
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
          <View style={[styles.verdictBadge, { backgroundColor: verdictCfg.color + '20' }]}>
            <View style={[styles.verdictDot, { backgroundColor: verdictCfg.color }]} />
            <Text style={[styles.verdictText, { color: verdictCfg.color }]}>{verdictCfg.label}</Text>
          </View>
        </TouchableOpacity>

        {/* SECTION 2 — TODAY'S SESSION */}
        <View style={[styles.sessionCard, { borderLeftColor: sessionColor }]}>
          <View style={styles.sessionContent}>
            <View style={styles.sessionBadge}>
              <Text style={styles.sessionBadgeText}>{TODAY_SESSION.badge}</Text>
            </View>
            <Text style={styles.sessionDistance}>{TODAY_SESSION.distance}</Text>
            <Text style={styles.sessionPace}>{TODAY_SESSION.pace}</Text>
            <Text style={styles.sessionHR}>{TODAY_SESSION.hrZone}</Text>
            <Text style={styles.sessionBriefing}>"{TODAY_SESSION.briefing}"</Text>
            <View style={styles.weatherStrip}>
              <Text style={styles.weatherText}>☁️ {TODAY_SESSION.weather}</Text>
            </View>
          </View>
        </View>
        <PrimaryButton title="Start Run" onPress={() => {}} style={styles.startBtn} />
        <SecondaryButton title="Adjust session" onPress={() => setAdjustModalVisible(true)} style={styles.adjustBtn} />

        {/* SECTION 3 — WEEKLY OVERVIEW */}
        <Text style={styles.weekTitle}>This week</Text>
        <RNScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekScroll}
        >
          {WEEK_DAYS.map((day) => (
            <View
              key={day.label}
              style={[styles.dayPill, day.today && styles.dayPillToday]}
            >
              <Text style={[styles.dayLabel, day.today && styles.dayLabelToday]}>{day.label}</Text>
              {day.done && <Text style={styles.dayMeta}>✓ {day.distance}</Text>}
              {day.missed && <Text style={styles.dayMetaMiss}>✗</Text>}
              {!day.done && !day.missed && day.session && (
                <Text style={styles.dayMeta}>{day.distance}</Text>
              )}
            </View>
          ))}
        </RNScrollView>
      </ScrollView>

      {/* Readiness detail modal */}
      <Modal
        visible={readinessModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReadinessModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setReadinessModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Readiness</Text>
            <Text style={styles.modalBody}>
              Your HRV is slightly suppressed compared to your 7-day average. We've adjusted today's session intensity accordingly.
            </Text>
            <PrimaryButton title="Got it" onPress={() => setReadinessModalVisible(false)} />
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
            <TouchableOpacity style={styles.modalOption} onPress={() => setAdjustModalVisible(false)}>
              <Text style={styles.modalOptionText}>Make easier</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => setAdjustModalVisible(false)}>
              <Text style={styles.modalOptionText}>Make harder</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => setAdjustModalVisible(false)}>
              <Text style={styles.modalOptionText}>Swap to different session</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => setAdjustModalVisible(false)}>
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: 8,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    ...typography.largeTitle,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 4,
  },
  date: {
    ...typography.body,
    color: colors.secondaryText,
  },
  bell: {
    padding: 8,
  },
  bellIcon: {
    fontSize: 22,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    padding: 20,
    marginBottom: spacing.betweenCards,
    ...theme.cardShadow,
  },
  readinessTitle: {
    ...typography.title,
    color: colors.primaryText,
    marginBottom: 12,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtnSelected: {
    backgroundColor: colors.accent + '25',
    borderWidth: 2,
    borderColor: colors.accent,
  },
  emojiText: {
    fontSize: 22,
  },
  readinessHint: {
    ...typography.caption,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  metricChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipText: {
    ...typography.caption,
    color: colors.primaryText,
  },
  verdictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  verdictDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  verdictText: {
    ...typography.secondary,
    fontWeight: '600',
  },
  sessionCard: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    marginBottom: spacing.betweenCards,
    overflow: 'hidden',
    borderLeftWidth: 4,
    ...theme.cardShadow,
  },
  sessionContent: {
    padding: 20,
  },
  sessionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  sessionBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primaryText,
    letterSpacing: 0.5,
  },
  sessionDistance: {
    ...typography.largeTitle,
    fontSize: 28,
    color: colors.primaryText,
    marginBottom: 4,
  },
  sessionPace: {
    ...typography.body,
    color: colors.primaryText,
    marginBottom: 2,
  },
  sessionHR: {
    ...typography.secondary,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  sessionBriefing: {
    ...typography.body,
    fontStyle: 'italic',
    color: colors.primaryText,
    marginBottom: 12,
  },
  weatherStrip: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  weatherText: {
    ...typography.secondary,
    color: colors.secondaryText,
  },
  startBtn: {
    minHeight: 56,
    borderRadius: 14,
    marginBottom: 12,
  },
  adjustBtn: {
    minHeight: 48,
    marginBottom: 28,
  },
  weekTitle: {
    ...typography.title,
    color: colors.primaryText,
    marginBottom: 12,
  },
  weekScroll: {
    paddingRight: spacing.screenPaddingHorizontal,
  },
  dayPill: {
    minWidth: 72,
    marginRight: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.radius.card,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
  },
  dayPillToday: {
    backgroundColor: colors.accent,
  },
  dayLabel: {
    ...typography.secondary,
    fontWeight: '600',
    color: colors.primaryText,
    marginBottom: 4,
  },
  dayLabelToday: {
    color: '#FFFFFF',
  },
  dayMeta: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  dayMetaMiss: {
    ...typography.caption,
    color: colors.destructive,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    padding: 24,
    ...theme.cardShadow,
  },
  modalTitle: {
    ...typography.title,
    color: colors.primaryText,
    marginBottom: 16,
  },
  modalBody: {
    ...typography.body,
    color: colors.secondaryText,
    marginBottom: 24,
  },
  modalOption: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  modalOptionText: {
    ...typography.body,
    color: colors.primaryText,
  },
  modalCancelBtn: {
    marginTop: 16,
  },
});
