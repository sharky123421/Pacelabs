import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRunnerMode } from '../contexts/RunnerModeContext';
import { colors, typography, spacing, theme } from '../theme';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PADDING = spacing.screenPaddingHorizontal;

const MILESTONES_ALL = [
  { key: 'first_run', label: 'First run' },
  { key: 'five_min_continuous', label: 'First 5 minutes continuous' },
  { key: 'ten_min_continuous', label: 'First 10 minutes continuous' },
  { key: 'twenty_min_continuous', label: 'First 20 minutes continuous' },
  { key: 'first_5k', label: 'First 5K' },
];

export function BeginnerAnalyticsScreen() {
  const { user } = useAuth();
  const { weeksInBeginnerMode } = useRunnerMode();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ totalRuns: 0, totalDistanceKm: 0, totalDurationSeconds: 0, longestRunKm: 0 });
  const [weeklyRuns, setWeeklyRuns] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [milestones, setMilestones] = useState([]);

  const userId = user?.id;

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [statsRes, milestonesRes, runsRes] = await Promise.all([
        supabase.rpc('get_my_run_stats').catch(() => ({ data: null })),
        supabase.from('beginner_milestones').select('milestone_key').eq('user_id', userId),
        supabase.from('runs').select('distance_meters, started_at').eq('user_id', userId).is('deleted_at', null).order('started_at', { ascending: false }).limit(200),
      ]);

      if (statsRes.data) {
        const raw = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
        setStats({
          totalRuns: Number(raw?.total_runs) || 0,
          totalDistanceKm: Number(raw?.total_distance_km) || 0,
          totalDurationSeconds: Number(raw?.total_duration_seconds) || 0,
          longestRunKm: 0,
        });
      }

      if (milestonesRes.data) {
        setMilestones(milestonesRes.data.map((m) => m.milestone_key));
      }

      if (runsRes.data) {
        const runs = runsRes.data;
        let longestKm = 0;
        runs.forEach((r) => {
          const km = (Number(r.distance_meters) || 0) / 1000;
          if (km > longestKm) longestKm = km;
        });
        setStats((prev) => ({ ...prev, longestRunKm: longestKm }));

        const weekly = new Array(8).fill(0);
        const now = new Date();
        runs.forEach((r) => {
          const weeksAgo = Math.floor((now - new Date(r.started_at)) / (7 * 24 * 60 * 60 * 1000));
          if (weeksAgo < 8) weekly[7 - weeksAgo]++;
        });
        setWeeklyRuns(weekly);
      }
    } catch (_) {}
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const formatTime = (seconds) => {
    if (!seconds) return '0 minutes';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} hours ${m} minutes`;
    return `${m} minutes`;
  };

  const maxWeeklyRuns = Math.max(4, ...weeklyRuns);
  const barWidth = (SCREEN_WIDTH - PADDING * 2 - 80) / 8;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>How you're doing</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* BIG STATS */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalRuns} \ud83d\udd25</Text>
            <Text style={styles.statLabel}>Runs this month</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatTime(stats.totalDurationSeconds)}</Text>
            <Text style={styles.statLabel}>Total time running</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalDistanceKm.toFixed(1)} km</Text>
            <Text style={styles.statLabel}>Total distance</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.longestRunKm.toFixed(1)} km</Text>
            <Text style={styles.statLabel}>Longest run</Text>
          </View>
        </View>

        {/* CONSISTENCY CHART */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your consistency</Text>
          <Text style={styles.cardSubtitle}>3 runs per week is the target</Text>
          <View style={styles.chartArea}>
            <View style={styles.targetLine}>
              <Text style={styles.targetLineText}>Target: 3</Text>
            </View>
            <View style={styles.barsRow}>
              {weeklyRuns.map((count, i) => {
                const heightPct = Math.max(5, (count / maxWeeklyRuns) * 100);
                const barColor = count >= 3 ? colors.beginnerGreen : count >= 2 ? colors.warning : colors.backgroundTertiary;
                return (
                  <View key={i} style={styles.barWrapper}>
                    <View style={[styles.bar, { height: `${heightPct}%`, backgroundColor: barColor, width: barWidth }]} />
                    <Text style={styles.barLabel}>W{i + 1}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* MILESTONE TIMELINE */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Milestone timeline</Text>
          <View style={styles.timelineContainer}>
            {MILESTONES_ALL.map((m, i) => {
              const unlocked = milestones.includes(m.key);
              return (
                <View key={m.key} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, unlocked && styles.timelineDotDone]} />
                    {i < MILESTONES_ALL.length - 1 && (
                      <View style={[styles.timelineLine, unlocked && styles.timelineLineDone]} />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineIcon}>{unlocked ? '\u2705' : '\u2b1c'}</Text>
                    <Text style={[styles.timelineLabel, unlocked && styles.timelineLabelDone]}>{m.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ENCOURAGEMENT */}
        <View style={styles.encouragementCard}>
          <Text style={styles.encouragementText}>
            "Every run you complete makes the next one easier. You're doing amazing." \ud83c\udf1f
          </Text>
          <Text style={styles.encouragementAuthor}>\u2014 Your AI Coach</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: PADDING, paddingVertical: 12 },
  headerTitle: { ...typography.largeTitle, color: colors.primaryText },
  scroll: { paddingHorizontal: PADDING, paddingBottom: 100 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard: {
    width: (SCREEN_WIDTH - PADDING * 2 - 12) / 2,
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 20, ...theme.cardShadow,
  },
  statValue: { ...typography.title, fontSize: 22, color: colors.primaryText, marginBottom: 4 },
  statLabel: { ...typography.caption, color: colors.secondaryText },

  card: {
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 20, marginBottom: 20, ...theme.cardShadow,
  },
  cardTitle: { ...typography.title, fontSize: 18, color: colors.primaryText, marginBottom: 4 },
  cardSubtitle: { ...typography.caption, color: colors.secondaryText, marginBottom: 16 },

  chartArea: { height: 160, justifyContent: 'flex-end' },
  targetLine: {
    position: 'absolute', top: '25%', left: 0, right: 0,
    borderBottomWidth: 1, borderBottomColor: colors.beginnerGreenMedium, borderStyle: 'dashed',
  },
  targetLineText: {
    ...typography.caption, fontSize: 10, color: colors.beginnerGreen,
    position: 'absolute', right: 0, top: -14,
  },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%' },
  barWrapper: { alignItems: 'center', flex: 1 },
  bar: { borderRadius: 4, minHeight: 4 },
  barLabel: { ...typography.caption, fontSize: 10, color: colors.secondaryText, marginTop: 4 },

  timelineContainer: { marginTop: 8 },
  timelineItem: { flexDirection: 'row', minHeight: 48 },
  timelineLeft: { width: 24, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.backgroundTertiary, borderWidth: 2, borderColor: colors.divider },
  timelineDotDone: { backgroundColor: colors.beginnerGreen, borderColor: colors.beginnerGreen },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.divider },
  timelineLineDone: { backgroundColor: colors.beginnerGreen },
  timelineContent: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, gap: 8, paddingBottom: 12 },
  timelineIcon: { fontSize: 16 },
  timelineLabel: { ...typography.body, color: colors.primaryText },
  timelineLabelDone: { color: colors.secondaryText },

  encouragementCard: {
    backgroundColor: colors.beginnerGreenLight, borderRadius: theme.radius.card,
    padding: 24, marginBottom: 20,
  },
  encouragementText: { ...typography.body, fontSize: 18, fontStyle: 'italic', color: colors.primaryText, lineHeight: 26, marginBottom: 8 },
  encouragementAuthor: { ...typography.caption, color: colors.secondaryText },
});
