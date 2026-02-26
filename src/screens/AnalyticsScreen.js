import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { colors, typography, spacing, theme } from '../theme';
import { GlassCard } from '../components';
import { supabase } from '../lib/supabase';
import { getCoachingSummary, getBottleneckHistory } from '../services/coachingEngine';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PADDING = spacing.screenPaddingHorizontal;
const SECTION_TITLE = { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 8 };
const SECTION_SUBTITLE = { ...typography.caption, color: colors.secondaryText, marginBottom: 12 };

const TIME_RANGES = ['1M', '3M', '6M', '1Y', 'All'];

function formatPace(distanceMeters, durationSeconds) {
  if (!distanceMeters || !durationSeconds || durationSeconds <= 0) return '\u2014';
  const km = distanceMeters / 1000;
  const secPerKm = durationSeconds / km;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '\u2014';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h >= 1) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getTimeRangeDays(range) {
  const map = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'All': 3650 };
  return map[range] || 90;
}

export function AnalyticsScreen() {
  const { user } = useAuth();
  const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || 'Runner';
  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
  const [timeRange, setTimeRange] = useState('3M');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [injuryExpanded, setInjuryExpanded] = useState(false);
  const [coachingSummary, setCoachingSummary] = useState(null);
  const [bottleneckHistory, setBottleneckHistory] = useState([]);

  const [stats, setStats] = useState({ totalRuns: 0, totalDistance: 0, totalDuration: 0, longest: 0 });
  const [recentRuns, setRecentRuns] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);

  const loadData = useCallback(async () => {
    const userId = user?.id;
    if (!userId) { setLoading(false); return; }
    try {
      const days = getTimeRangeDays(timeRange);
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString();

      const { data: runs } = await supabase
        .from('runs')
        .select('id, started_at, distance_meters, duration_seconds, avg_hr, avg_cadence, source, title')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .gte('started_at', sinceStr)
        .order('started_at', { ascending: false });

      const list = runs || [];
      const totalRuns = list.length;
      const totalDistance = list.reduce((s, r) => s + (Number(r.distance_meters) || 0), 0) / 1000;
      const totalDuration = list.reduce((s, r) => s + (Number(r.duration_seconds) || 0), 0);
      const longest = list.reduce((max, r) => Math.max(max, (Number(r.distance_meters) || 0) / 1000), 0);
      setStats({ totalRuns, totalDistance, totalDuration, longest });
      setRecentRuns(list.slice(0, 10));

      const weeks = {};
      list.forEach((r) => {
        const d = new Date(r.started_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        if (!weeks[key]) weeks[key] = { key, runs: 0, distance: 0 };
        weeks[key].runs++;
        weeks[key].distance += (Number(r.distance_meters) || 0) / 1000;
      });
      setWeeklyData(Object.values(weeks).sort((a, b) => a.key.localeCompare(b.key)).slice(-12));
    } catch (_) { }
    try {
      const summary = await getCoachingSummary();
      setCoachingSummary(summary);
    } catch (_) { setCoachingSummary(null); }
    try {
      const history = await getBottleneckHistory(3);
      setBottleneckHistory(history);
    } catch (_) { setBottleneckHistory([]); }
    setLoading(false);
  }, [user?.id, timeRange]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const hasData = stats.totalRuns > 0;
  const avgPace = hasData ? formatPace(stats.totalDistance * 1000, stats.totalDuration) : '\u2014';
  const totalHours = Math.floor(stats.totalDuration / 3600);
  const totalMin = Math.floor((stats.totalDuration % 3600) / 60);
  const totalTimeStr = totalHours >= 1 ? `${totalHours}h ${totalMin}m` : `${totalMin} min`;
  const maxWeekDist = weeklyData.reduce((max, w) => Math.max(max, w.distance), 0) || 1;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
        </View>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={colors.accent} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangePills}>
          {TIME_RANGES.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.rangePill, timeRange === r && styles.rangePillActive]}
              onPress={() => setTimeRange(r)}
            >
              <Text style={[styles.rangePillText, timeRange === r && styles.rangePillTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.linkNeon} />
        }
      >
        {/* RUNNER PROFILE */}
        <View style={styles.section}>
          <GlassCard variant="elevated" style={styles.profileCard}>
            <View style={styles.profileLeft}>
              <Text style={styles.profileName}>{name}</Text>
              {memberSince ? <Text style={styles.profileSince}>Running with Pacelab since {memberSince}</Text> : null}
            </View>
            {hasData ? (
              <View style={styles.profileGrid}>
                <View style={styles.profileStat}><Text style={styles.profileStatValue}>{stats.totalRuns}</Text><Text style={styles.profileStatLabel}>Runs</Text></View>
                <View style={styles.profileStat}><Text style={styles.profileStatValue}>{stats.totalDistance.toFixed(1)} km</Text><Text style={styles.profileStatLabel}>Distance</Text></View>
                <View style={styles.profileStat}><Text style={styles.profileStatValue}>{totalTimeStr}</Text><Text style={styles.profileStatLabel}>Time</Text></View>
                <View style={styles.profileStat}><Text style={styles.profileStatValue}>{avgPace}</Text><Text style={styles.profileStatLabel}>Avg Pace</Text></View>
              </View>
            ) : (
              <Text style={styles.emptyHint}>Complete a few runs to build your profile</Text>
            )}
          </GlassCard>
        </View>

        {/* AI COACHING INSIGHTS */}
        {coachingSummary?.bottleneck && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>AI COACHING INSIGHTS</Text>
            <GlassCard variant="elevated" style={styles.coachingCard}>
              <View style={styles.coachingHeader}>
                <View style={styles.coachingHeaderText}>
                  <Text style={styles.coachingDiagnosis}>
                    {coachingSummary.bottleneck.label}
                  </Text>
                  <View style={[styles.coachingConfBadge, {
                    backgroundColor: coachingSummary.bottleneck.confidence === 'high'
                      ? colors.neonGreen + '25'
                      : coachingSummary.bottleneck.confidence === 'medium'
                        ? colors.neonOrange + '25'
                        : colors.secondaryText + '20',
                  }]}>
                    <Text style={[styles.coachingConfText, {
                      color: coachingSummary.bottleneck.confidence === 'high'
                        ? colors.neonGreen
                        : coachingSummary.bottleneck.confidence === 'medium'
                          ? colors.neonOrange
                          : colors.secondaryText,
                    }]}>
                      {coachingSummary.bottleneck.confidence} confidence
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={styles.coachingEvidence}>{coachingSummary.bottleneck.evidence}</Text>
              {coachingSummary.philosophy && (
                <View style={styles.coachingPhilosophy}>
                  <Text style={styles.coachingPhLabel}>What AI is targeting</Text>
                  <Text style={styles.coachingPhValue}>
                    {coachingSummary.philosophy.mode?.replace(/_/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Text>
                  <Text style={styles.coachingPhMetric}>{coachingSummary.philosophy.successMetric}</Text>
                  {coachingSummary.philosophy.durationWeeks && (
                    <Text style={styles.coachingPhDuration}>
                      Est. {coachingSummary.philosophy.durationWeeks} weeks to resolve
                    </Text>
                  )}
                </View>
              )}
              {coachingSummary.adaptation?.explanation && (
                <View style={styles.coachingAdaptation}>
                  <Text style={styles.coachingAdaptLabel}>Latest adaptation</Text>
                  <Text style={styles.coachingAdaptText}>{coachingSummary.adaptation.explanation}</Text>
                </View>
              )}
              {bottleneckHistory.length > 1 && (
                <View style={styles.coachingHistory}>
                  <Text style={styles.coachingHistLabel}>Recent analyses</Text>
                  {bottleneckHistory.map((b, i) => (
                    <View key={i} style={styles.coachingHistRow}>
                      <Text style={styles.coachingHistDate}>
                        {new Date(b.analyzed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </Text>
                      <Text style={styles.coachingHistType}>
                        {b.primary_bottleneck?.replace(/_/g, ' ')}
                      </Text>
                      {b.bottleneck_changed && <Text style={styles.coachingHistChanged}>changed</Text>}
                    </View>
                  ))}
                </View>
              )}
            </GlassCard>
          </View>
        )}

        {/* OVERVIEW STATS */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>OVERVIEW</Text>
          {hasData ? (
            <View style={styles.overviewGrid}>
              <View style={styles.overviewCard}><Text style={styles.overviewValue}>{stats.totalRuns}</Text><Text style={styles.overviewLabel}>Runs</Text></View>
              <View style={styles.overviewCard}><Text style={styles.overviewValue}>{stats.totalDistance.toFixed(1)} km</Text><Text style={styles.overviewLabel}>Distance</Text></View>
              <View style={styles.overviewCard}><Text style={styles.overviewValue}>{totalTimeStr}</Text><Text style={styles.overviewLabel}>Time</Text></View>
              <View style={styles.overviewCard}><Text style={styles.overviewValue}>{stats.longest.toFixed(1)} km</Text><Text style={styles.overviewLabel}>Longest Run</Text></View>
            </View>
          ) : (
            <GlassCard variant="soft" style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>Complete your first run to see analytics</Text>
            </GlassCard>
          )}
        </View>

        {/* WEEKLY DISTANCE */}
        {weeklyData.length > 0 && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>WEEKLY DISTANCE</Text>
            <GlassCard variant="default" style={styles.chartCard}>
              <View style={styles.barChartWrap}>
                {weeklyData.map((w) => (
                  <View key={w.key} style={styles.barCol}>
                    <Text style={styles.barValue}>{w.distance.toFixed(0)}</Text>
                    <View style={[styles.bar, { height: Math.max(4, (w.distance / maxWeekDist) * 100) }]} />
                    <Text style={styles.barLabel}>{w.runs}r</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          </View>
        )}

        {/* RECENT RUNS */}
        {recentRuns.length > 0 && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>RECENT RUNS</Text>
            <GlassCard variant="default" style={styles.tableCard}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>Date</Text>
                <Text style={styles.tableHeaderText}>Distance</Text>
                <Text style={styles.tableHeaderText}>Pace</Text>
                <Text style={styles.tableHeaderText}>Time</Text>
              </View>
              {recentRuns.map((r, i) => {
                const d = new Date(r.started_at);
                const distKm = (Number(r.distance_meters) || 0) / 1000;
                return (
                  <View key={r.id || i} style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}>
                    <Text style={[styles.tableCell, { flex: 2 }]}>{d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                    <Text style={styles.tableCell}>{distKm > 0 ? `${distKm.toFixed(1)} km` : '\u2014'}</Text>
                    <Text style={styles.tableCell}>{formatPace(r.distance_meters, r.duration_seconds)}</Text>
                    <Text style={styles.tableCell}>{formatDuration(r.duration_seconds)}</Text>
                  </View>
                );
              })}
            </GlassCard>
          </View>
        )}

        {/* SLEEP */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>SLEEP VS PERFORMANCE</Text>
          <GlassCard variant="soft">
            <Text style={styles.unlockText}>Connect Apple Health or Garmin to unlock sleep analysis</Text>
          </GlassCard>
        </View>

        {/* INJURY RISK (shown only with data) */}
        {hasData && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>INJURY PREVENTION</Text>
            <GlassCard
              variant="default"
              onPress={() => setInjuryExpanded((e) => !e)}
            >
              <Text style={styles.gaugeLabel}>Keep weekly distance increases under 10-15%</Text>
              {injuryExpanded && (
                <View style={styles.injuryExpand}>
                  <Text style={styles.injuryExpandText}>
                    Gradual increases reduce injury risk. Spread volume across the week and ensure one rest day between hard sessions.
                  </Text>
                </View>
              )}
              <Text style={styles.tapToExpand}>{injuryExpanded ? 'Tap to collapse' : 'Tap for tips'}</Text>
            </GlassCard>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceBase },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: PADDING, paddingVertical: 14, marginBottom: 10 },
  headerTitle: { ...typography.largeTitle, fontWeight: '700', color: colors.primaryText, letterSpacing: -0.5 },
  rangePills: { gap: 8, paddingVertical: 2 },
  rangePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.glassFillSoft, borderWidth: 1, borderColor: colors.glassStroke },
  rangePillActive: { backgroundColor: colors.glassFillStrong, borderColor: colors.accentLight },
  rangePillText: { ...typography.secondary, color: colors.secondaryText, fontWeight: '500' },
  rangePillTextActive: { ...typography.secondary, color: colors.primaryText, fontWeight: '700' },
  scroll: { paddingHorizontal: PADDING, paddingBottom: 100 },
  section: { marginBottom: 28 },
  card: { backgroundColor: colors.glassFillSoft, borderRadius: theme.radius.card, padding: 20, borderWidth: 1, borderColor: colors.glassStroke, ...theme.glassShadowSoft },
  profileCard: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  chartCard: {},
  tableCard: { overflow: 'hidden' },
  profileLeft: { marginBottom: 16 },
  profileName: { ...typography.title, color: colors.primaryText, marginBottom: 4, letterSpacing: -0.3 },
  profileSince: { ...typography.caption, color: colors.tertiaryText },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  profileStat: { width: (SCREEN_WIDTH - PADDING * 2 - 52) / 2, backgroundColor: colors.surfaceMuted, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.glassStroke },
  profileStatValue: { ...typography.title, color: colors.primaryText },
  profileStatLabel: { ...typography.caption, color: colors.tertiaryText, marginTop: 2 },
  emptyHint: { ...typography.body, color: colors.secondaryText },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  overviewCard: { width: (SCREEN_WIDTH - PADDING * 2 - 12) / 2, backgroundColor: colors.glassFillSoft, borderRadius: theme.radius.card, padding: 18, borderWidth: 1, borderColor: colors.glassStroke, ...theme.glassShadowSoft },
  overviewValue: { ...typography.title, fontSize: 24, color: colors.primaryText, letterSpacing: -0.5 },
  overviewLabel: { ...typography.caption, color: colors.tertiaryText, marginTop: 4 },
  emptyCard: { alignItems: 'center', paddingVertical: 40 },
  emptyCardText: { ...typography.body, color: colors.secondaryText, textAlign: 'center' },
  barChartWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 140 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { ...typography.caption, fontSize: 10, color: colors.tertiaryText, marginBottom: 4 },
  bar: { width: 16, backgroundColor: colors.neonCyan, borderRadius: 4, minHeight: 4, opacity: 0.95 },
  barLabel: { ...typography.caption, fontSize: 10, color: colors.tertiaryText, marginTop: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  tableHeader: { backgroundColor: colors.surfaceMuted },
  tableHeaderText: { ...typography.caption, fontWeight: '700', color: colors.tertiaryText, flex: 1, letterSpacing: 0.5 },
  tableRowAlt: { backgroundColor: 'rgba(255,255,255,0.06)' },
  tableCell: { ...typography.secondary, color: colors.primaryText, flex: 1 },
  unlockText: { ...typography.body, color: colors.secondaryText, textAlign: 'center', paddingVertical: 24 },
  gaugeLabel: { ...typography.body, color: colors.primaryText },
  injuryExpand: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  injuryExpandText: { ...typography.caption, color: colors.secondaryText, lineHeight: 20 },
  tapToExpand: { ...typography.caption, color: colors.linkNeon, marginTop: 12 },
  coachingCard: { borderLeftWidth: 4, borderLeftColor: colors.coachPurple },
  coachingHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  coachingHeaderText: { flex: 1 },
  coachingDiagnosis: { ...typography.title, color: colors.primaryText, marginBottom: 6, letterSpacing: -0.3 },
  coachingConfBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  coachingConfText: { ...typography.caption, fontWeight: '700' },
  coachingEvidence: { ...typography.body, color: colors.secondaryText, marginBottom: 16, lineHeight: 22 },
  coachingPhilosophy: { backgroundColor: colors.surfaceMuted, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.glassStroke },
  coachingPhLabel: { ...typography.caption, color: colors.tertiaryText, marginBottom: 4, fontWeight: '600', letterSpacing: 0.5 },
  coachingPhValue: { ...typography.secondary, fontWeight: '700', color: colors.primaryText, marginBottom: 4 },
  coachingPhMetric: { ...typography.caption, color: colors.coachPurple },
  coachingPhDuration: { ...typography.caption, color: colors.tertiaryText, marginTop: 4 },
  coachingAdaptation: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 12, marginBottom: 12 },
  coachingAdaptLabel: { ...typography.caption, color: colors.tertiaryText, marginBottom: 4, fontWeight: '600', letterSpacing: 0.5 },
  coachingAdaptText: { ...typography.body, color: colors.primaryText, fontStyle: 'italic', lineHeight: 22 },
  coachingHistory: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 12 },
  coachingHistLabel: { ...typography.caption, color: colors.tertiaryText, marginBottom: 8, fontWeight: '600', letterSpacing: 0.5 },
  coachingHistRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  coachingHistDate: { ...typography.caption, color: colors.tertiaryText, width: 50 },
  coachingHistType: { ...typography.caption, color: colors.primaryText, flex: 1 },
  coachingHistChanged: { ...typography.caption, color: colors.warning, fontSize: 11, fontWeight: '600' },
});

