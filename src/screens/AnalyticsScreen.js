import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors, typography, spacing, theme } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PADDING = spacing.screenPaddingHorizontal;
const SECTION_TITLE = { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 8 };
const SECTION_SUBTITLE = { ...typography.caption, color: colors.secondaryText, marginBottom: 12 };

const TIME_RANGES = ['1M', '3M', '6M', '1Y', 'All'];
const DISTANCES = ['5K', '10K', '15K', '21K', '42K'];

const PRS = [
  { label: '5K', time: '23:14', date: 'Dec 3, 2025', trend: '↑ 42 sec improvement this year', empty: false },
  { label: '10K', time: '44:12', date: 'Feb 8, 2026', trend: '↑ 1:02 this year', empty: false },
  { label: 'Half', time: '1:38:22', date: 'Dec 15, 2025', trend: '↑ 2:10 this year', empty: false },
  { label: 'Marathon', time: null, date: null, trend: null, empty: true },
];

const PREDICTIONS = [
  { label: '5K', time: '21:34', vsPr: 'PR pace', confidence: 'High confidence', updated: 'Feb 18 run' },
  { label: '10K', time: '44:12', vsPr: 'PR pace', confidence: 'High confidence', updated: 'Feb 18 run' },
  { label: 'Half', time: '1:38:22', vsPr: '+0:45 from PR', confidence: 'Medium confidence', updated: 'Feb 15 run' },
  { label: 'Marathon', time: '3:24:08', vsPr: 'PR pace', confidence: 'Low confidence', updated: 'Oct 2025' },
];

const TOP_RUNS_5K = [
  { rank: 1, date: '3 Dec 2025', time: '21:34', pace: '4:19 /km', hr: '168', conditions: 'Cool, dry' },
  { rank: 2, date: '12 Nov 2025', time: '21:58', pace: '4:24 /km', hr: '165', conditions: 'Mild' },
  { rank: 3, date: '8 Oct 2025', time: '22:12', pace: '4:26 /km', hr: '164', conditions: 'Windy' },
];

const HAS_SLEEP_DATA = false;

export function AnalyticsScreen({ navigation }) {
  const { user } = useAuth();
  const name = user?.user_metadata?.display_name || user?.user_metadata?.full_name || 'Runner';
  const [timeRange, setTimeRange] = useState('3M');
  const [selectedDistance, setSelectedDistance] = useState('5K');

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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* SECTION 1 — RUNNER PROFILE */}
        <View style={styles.section}>
          <View style={[styles.card, styles.profileCard]}>
            <View style={styles.profileLeft}>
              <View style={styles.levelBadge}><Text style={styles.levelBadgeText}>INTERMEDIATE</Text></View>
              <Text style={styles.profileName}>{name}</Text>
              <Text style={styles.profileSince}>Running with Pacelab since Jan 2026</Text>
            </View>
            <View style={styles.profileGrid}>
              <View style={styles.profileStat}><Text style={styles.profileStatValue}>52.4</Text><Text style={styles.profileStatLabel}>VO2 Max</Text></View>
              <View style={styles.profileStat}><Text style={styles.profileStatValue}>4:52</Text><Text style={styles.profileStatLabel}>Threshold</Text></View>
              <View style={styles.profileStat}><Text style={styles.profileStatValue}>5:45–6:20</Text><Text style={styles.profileStatLabel}>Easy Zone</Text></View>
              <View style={styles.profileStat}><Text style={styles.profileStatValue}>54 km</Text><Text style={styles.profileStatLabel}>Weekly Base</Text></View>
            </View>
            <View style={styles.pillsRow}>
              <View style={[styles.pill, styles.pillGreen]}><Text style={styles.pillText}>Aerobic base</Text></View>
              <View style={[styles.pill, styles.pillGreen]}><Text style={styles.pillText}>Consistency</Text></View>
              <View style={[styles.pill, styles.pillAmber]}><Text style={styles.pillText}>Speed work</Text></View>
              <View style={[styles.pill, styles.pillAmber]}><Text style={styles.pillText}>Cadence on long runs</Text></View>
            </View>
            <TouchableOpacity style={styles.profileLink}><Text style={styles.profileLinkText}>View full profile</Text><Text style={styles.chevron}>›</Text></TouchableOpacity>
          </View>
        </View>

        {/* SECTION 2 — FITNESS & FATIGUE */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>FITNESS & FATIGUE</Text>
          <Text style={SECTION_SUBTITLE}>Chronic Training Load · Acute Training Load · Form</Text>
          <View style={[styles.card, styles.chartCard]}>
            <View style={styles.chartPlaceholder}><Text style={styles.chartPlaceholderText}>CTL / ATL / TSB line chart</Text></View>
            <View style={styles.chipRow}>
              <View style={[styles.miniChip, { backgroundColor: colors.accent + '20' }]}><Text style={styles.miniChipText}>Fitness 52.4</Text></View>
              <View style={[styles.miniChip, { backgroundColor: colors.destructive + '20' }]}><Text style={styles.miniChipText}>Fatigue 61.1</Text></View>
              <View style={[styles.miniChip, { backgroundColor: colors.success + '20' }]}><Text style={styles.miniChipText}>Form -8.7</Text></View>
            </View>
            <Text style={styles.explainer}>Positive form = fresh and ready. Negative = fatigued but fit.</Text>
          </View>
        </View>

        {/* SECTION 3 — VO2 MAX */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>VO2 MAX</Text>
          <Text style={SECTION_SUBTITLE}>Estimated from pace and heart rate data</Text>
          <View style={[styles.card, styles.chartCard]}>
            <Text style={styles.bigValue}>52.4</Text>
            <Text style={styles.trendGreen}>↑ +1.8 last 3 months</Text>
            <View style={[styles.chartPlaceholder, styles.chartShort]}><Text style={styles.chartPlaceholderText}>VO2 max trend</Text></View>
          </View>
        </View>

        {/* SECTION 4 — THRESHOLD PACE */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>LACTATE THRESHOLD PACE</Text>
          <View style={[styles.card, styles.chartCard]}>
            <Text style={styles.bigValue}>4:52 /km</Text>
            <Text style={styles.trendGreen}>↑ 8 sec/km faster last 3 months</Text>
            <View style={[styles.chartPlaceholder, styles.chartShort]}><Text style={styles.chartPlaceholderText}>Pace over time (inverted Y)</Text></View>
          </View>
        </View>

        {/* SECTION 5 — WEEKLY MILEAGE */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>WEEKLY DISTANCE</Text>
          <View style={[styles.card, styles.chartCard]}>
            <View style={[styles.chartPlaceholder, styles.chartShort]}><Text style={styles.chartPlaceholderText}>Bar chart · target band</Text></View>
            <Text style={styles.avgLine}>4-week avg: 52km · 8-week avg: 48km · 12-week avg: 44km</Text>
          </View>
        </View>

        {/* SECTION 6 — TRAINING ZONES */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>TRAINING ZONES</Text>
          <Text style={SECTION_SUBTITLE}>Last 4 weeks</Text>
          <View style={[styles.card, styles.chartCard]}>
            <View style={styles.donutWrap}>
              <View style={styles.donutPlaceholder}><Text style={styles.donutCenter}>38h 22min</Text></View>
            </View>
            <View style={styles.zoneRow}><View style={[styles.zoneBar, { flex: 0.78, backgroundColor: colors.success }]} /><Text style={styles.zoneLabel}>Easy · 30h · 78%</Text></View>
            <View style={styles.zoneRow}><View style={[styles.zoneBar, { flex: 0.12, backgroundColor: colors.warning }]} /><Text style={styles.zoneLabel}>Moderate · 4.5h · 12%</Text></View>
            <View style={styles.zoneRow}><View style={[styles.zoneBar, { flex: 0.1, backgroundColor: colors.destructive }]} /><Text style={styles.zoneLabel}>Hard · 3.8h · 10%</Text></View>
            <Text style={styles.aiInsight}>Your easy/hard ratio is 78/22 — close to the optimal 80/20 polarized model.</Text>
          </View>
        </View>

        {/* SECTION 7 — AEROBIC EFFICIENCY */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>AEROBIC EFFICIENCY</Text>
          <Text style={SECTION_SUBTITLE}>Heart rate at your standard easy pace over time</Text>
          <View style={[styles.card, styles.chartCard]}>
            <Text style={styles.bigValue}>148 bpm at 6:00/km</Text>
            <Text style={styles.trendGreen}>↓ 4 bpm improvement last 3 months</Text>
            <View style={[styles.chartPlaceholder, styles.chartShort]}><Text style={styles.chartPlaceholderText}>HR at easy pace</Text></View>
          </View>
        </View>

        {/* SECTION 8 — PERSONAL BESTS */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>PERSONAL BESTS</Text>
          <View style={styles.prGrid}>
            {PRS.map((pr) => (
              <View key={pr.label} style={styles.prCard}>
                <Text style={styles.prLabel}>{pr.label}</Text>
                {pr.empty ? (
                  <Text style={styles.prEmpty}>No race recorded yet</Text>
                ) : (
                  <>
                    <Text style={styles.prTime}>{pr.time}</Text>
                    <Text style={styles.prDate}>{pr.date}</Text>
                    <Text style={styles.prTrend}>{pr.trend}</Text>
                  </>
                )}
              </View>
            ))}
          </View>
          <TouchableOpacity><Text style={styles.linkText}>View PR timeline →</Text></TouchableOpacity>
        </View>

        {/* SECTION 9 — RACE PREDICTIONS */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>CURRENT PREDICTED TIMES</Text>
          <Text style={SECTION_SUBTITLE}>Based on your recent training and fitness</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.predScroll}>
            {PREDICTIONS.map((p) => (
              <View key={p.label} style={styles.predCard}>
                <Text style={styles.predLabel}>{p.label}</Text>
                <Text style={styles.predTime}>{p.time}</Text>
                <Text style={styles.predVs}>{p.vsPr}</Text>
                <Text style={styles.predConf}>{p.confidence}</Text>
                <Text style={styles.predUpdated}>Last updated after {p.updated}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* SECTION 10 — CONSISTENCY */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>CONSISTENCY</Text>
          <View style={styles.consistencyRow}>
            <View style={styles.consCard}><Text style={styles.consValue}>6</Text><Text style={styles.consLabel}>Current streak</Text><Text style={styles.consEmoji}>🔥</Text></View>
            <View style={styles.consCard}><Text style={styles.consValue}>23</Text><Text style={styles.consLabel}>Longest streak</Text></View>
            <View style={styles.consCard}><Text style={styles.consValue}>84%</Text><Text style={styles.consLabel}>Consistency score</Text></View>
          </View>
          <View style={[styles.card, styles.chartCard]}><View style={styles.heatmapPlaceholder}><Text style={styles.chartPlaceholderText}>12-week heatmap</Text></View></View>
        </View>

        {/* SECTION 11 — INJURY RISK */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>INJURY RISK</Text>
          <View style={[styles.card, styles.chartCard]}>
            <View style={styles.gaugeWrap}><View style={styles.gaugePlaceholder}><Text style={styles.gaugeLabel}>LOW</Text></View></View>
            <Text style={styles.factorItem}>✓ Training load increase: within safe range (+12% this week)</Text>
            <Text style={styles.factorItem}>✓ Left/right balance: normal (51/49)</Text>
            <Text style={[styles.factorItem, styles.factorWarn]}>⚠ Long run ratio: slightly high (41% of weekly volume)</Text>
          </View>
        </View>

        {/* SECTION 12 — SLEEP */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>SLEEP VS PERFORMANCE</Text>
          <Text style={SECTION_SUBTITLE}>Does your sleep affect your running?</Text>
          {HAS_SLEEP_DATA ? (
            <View style={[styles.card, styles.chartCard]}><View style={styles.chartPlaceholder}><Text style={styles.chartPlaceholderText}>Scatter plot · trend line</Text></View></View>
          ) : (
            <View style={[styles.card, styles.chartCard]}><Text style={styles.unlockText}>Connect Garmin or Apple Watch to unlock sleep analysis</Text></View>
          )}
        </View>

        {/* SECTION 13 — TOP PERFORMANCES */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>TOP PERFORMANCES</Text>
          <Text style={SECTION_SUBTITLE}>Your best runs by distance</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentedScroll}>
            {DISTANCES.map((d) => (
              <TouchableOpacity key={d} style={[styles.segmentedPill, selectedDistance === d && styles.segmentedPillActive]} onPress={() => setSelectedDistance(d)}>
                <Text style={[styles.segmentedPillText, selectedDistance === d && styles.segmentedPillTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={[styles.card, styles.tableCard]}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.tableHeaderText}>Rank</Text>
              <Text style={styles.tableHeaderText}>Date</Text>
              <Text style={styles.tableHeaderText}>Time</Text>
              <Text style={styles.tableHeaderText}>Pace</Text>
              <Text style={styles.tableHeaderText}>HR</Text>
              <Text style={styles.tableHeaderText}>Conditions</Text>
            </View>
            {TOP_RUNS_5K.map((r) => (
              <TouchableOpacity key={r.rank} style={[styles.tableRow, r.rank === 1 && styles.tableRowHighlight]} onPress={() => navigation.navigate('RunsTab', { screen: 'RunDetail', params: { runId: String(r.rank) } })}>
                <Text style={styles.tableCell}>{r.rank}</Text>
                <Text style={styles.tableCell}>{r.date}</Text>
                <Text style={styles.tableCell}>{r.time}</Text>
                <Text style={styles.tableCell}>{r.pace}</Text>
                <Text style={styles.tableCell}>{r.hr}</Text>
                <Text style={styles.tableCell}>{r.conditions}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: PADDING, paddingVertical: 12, marginBottom: 8 },
  headerTitle: { ...typography.largeTitle, fontWeight: '700', color: colors.primaryText },
  rangePills: { gap: 8 },
  rangePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.backgroundSecondary },
  rangePillActive: { backgroundColor: colors.accent },
  rangePillText: { ...typography.secondary, color: colors.primaryText },
  rangePillTextActive: { ...typography.secondary, color: '#FFFFFF' },
  scroll: { paddingHorizontal: PADDING, paddingBottom: 100 },
  section: { marginBottom: 28 },
  card: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, ...theme.cardShadow },
  profileCard: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  profileLeft: { marginBottom: 16 },
  levelBadge: { alignSelf: 'flex-start', backgroundColor: colors.accent + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  levelBadgeText: { ...typography.caption, fontWeight: '700', color: colors.accent, letterSpacing: 0.5 },
  profileName: { ...typography.title, color: colors.primaryText, marginBottom: 4 },
  profileSince: { ...typography.caption, color: colors.secondaryText },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  profileStat: { width: (SCREEN_WIDTH - PADDING * 2 - 52) / 2, backgroundColor: colors.backgroundSecondary, padding: 12, borderRadius: 10 },
  profileStatValue: { ...typography.title, color: colors.primaryText },
  profileStatLabel: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  pillGreen: { backgroundColor: colors.success + '25' },
  pillAmber: { backgroundColor: colors.warning + '25' },
  pillText: { ...typography.caption, color: colors.primaryText },
  profileLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end' },
  profileLinkText: { ...typography.secondary, color: colors.accent },
  chevron: { ...typography.body, color: colors.accent, marginLeft: 2 },
  chartCard: {},
  chartPlaceholder: { height: 160, backgroundColor: colors.backgroundSecondary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  chartShort: { height: 100 },
  chartPlaceholderText: { ...typography.caption, color: colors.secondaryText },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  miniChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  miniChipText: { ...typography.caption, color: colors.primaryText },
  explainer: { ...typography.caption, color: colors.secondaryText, marginTop: 8 },
  bigValue: { ...typography.title, fontSize: 24, color: colors.primaryText },
  trendGreen: { ...typography.caption, color: colors.success, marginTop: 4 },
  avgLine: { ...typography.caption, color: colors.secondaryText, marginTop: 12 },
  donutWrap: { alignItems: 'center', marginBottom: 16 },
  donutPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { ...typography.secondary, fontWeight: '600', color: colors.primaryText },
  zoneRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  zoneBar: { height: 8, borderRadius: 4, marginRight: 8 },
  zoneLabel: { ...typography.caption, color: colors.primaryText },
  aiInsight: { ...typography.caption, fontStyle: 'italic', color: colors.secondaryText, marginTop: 12 },
  prGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  prCard: { width: (SCREEN_WIDTH - PADDING * 2 - 12) / 2, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, ...theme.cardShadow },
  prLabel: { ...typography.caption, color: colors.secondaryText },
  prTime: { ...typography.title, fontSize: 20, color: colors.primaryText, marginTop: 4 },
  prDate: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  prTrend: { ...typography.caption, color: colors.success, marginTop: 4 },
  prEmpty: { ...typography.secondary, color: colors.secondaryText, marginTop: 8 },
  linkText: { ...typography.secondary, color: colors.accent },
  predScroll: { gap: 12, paddingRight: PADDING },
  predCard: { width: 140, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, ...theme.cardShadow },
  predLabel: { ...typography.caption, color: colors.secondaryText },
  predTime: { ...typography.title, color: colors.primaryText, marginTop: 4 },
  predVs: { ...typography.caption, color: colors.primaryText, marginTop: 2 },
  predConf: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  predUpdated: { ...typography.caption, fontSize: 11, color: colors.secondaryText, marginTop: 4 },
  consistencyRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  consCard: { flex: 1, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, ...theme.cardShadow },
  consValue: { ...typography.title, fontSize: 22, color: colors.primaryText },
  consLabel: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  consEmoji: { fontSize: 18, marginTop: 2 },
  heatmapPlaceholder: { height: 80, backgroundColor: colors.backgroundSecondary, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  gaugeWrap: { alignItems: 'center', marginBottom: 16 },
  gaugePlaceholder: { width: 160, height: 80, backgroundColor: colors.backgroundSecondary, borderRadius: 80, borderTopLeftRadius: 80, borderTopRightRadius: 80, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 },
  gaugeLabel: { ...typography.title, color: colors.success },
  factorItem: { ...typography.caption, color: colors.primaryText, marginBottom: 6 },
  factorWarn: { color: colors.warning },
  unlockText: { ...typography.body, color: colors.secondaryText, textAlign: 'center', paddingVertical: 24 },
  segmentedScroll: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segmentedPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.backgroundSecondary },
  segmentedPillActive: { backgroundColor: colors.accent },
  segmentedPillText: { ...typography.secondary, color: colors.primaryText },
  segmentedPillTextActive: { ...typography.secondary, color: '#FFFFFF' },
  tableCard: { padding: 0, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  tableHeader: { backgroundColor: colors.backgroundSecondary },
  tableHeaderText: { ...typography.caption, fontWeight: '600', color: colors.secondaryText, flex: 1 },
  tableRowHighlight: { backgroundColor: '#FFF9E6' },
  tableCell: { ...typography.secondary, color: colors.primaryText, flex: 1 },
});
