import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { colors, typography, spacing, theme } from '../theme';
import { SecondaryButton } from '../components';

const SESSION_COLORS = { easy: colors.success, tempo: colors.warning, intervals: colors.destructive, long: colors.accent, race: colors.warning };
const FILTERS = ['All', 'Easy', 'Tempo', 'Intervals', 'Long Run', 'Race', 'This week', 'This month', 'Personal bests', 'Strava', 'Garmin', 'Apple Watch'];

// Mock data
const STATS = { totalRuns: 247, totalDistance: 1847, totalTime: '186h 23min', longest: 38.2 };
const PERSONAL_BESTS = [
  { label: '5K', time: '21:34', date: '12 Jan 2026' },
  { label: '10K', time: '44:12', date: '8 Feb 2026' },
  { label: 'Half', time: '1:38:22', date: '15 Dec 2025' },
  { label: 'Marathon', time: '3:24:08', date: '20 Oct 2025' },
];
const RUNS_BY_MONTH = [
  {
    month: 'February 2026',
    runs: [
      { id: '1', type: 'tempo', date: 'Sat 21', title: 'Tempo Tuesday', distance: '10.4 km', pace: '4:52 /km', hr: '158 bpm', cadence: '174 spm', duration: '50:14', aiLine: 'Solid tempo — threshold pace well maintained throughout', source: 'STRAVA' },
      { id: '2', type: 'easy', date: 'Thu 19', title: 'Morning Run', distance: '8.2 km', pace: '5:38 /km', hr: '142 bpm', cadence: '168 spm', duration: '46:12', aiLine: 'Easy effort, good recovery run.', source: 'GARMIN' },
    ],
  },
  {
    month: 'January 2026',
    runs: [
      { id: '3', type: 'long', date: 'Sun 14', title: 'Long Run', distance: '21.1 km', pace: '5:12 /km', hr: '148 bpm', cadence: '172 spm', duration: '1:49:30', aiLine: 'Strong half marathon distance at steady pace.', source: 'STRAVA' },
    ],
  },
];

const EMPTY_RUNS = false; // Set true to see empty state

export function RunsScreen({ navigation }) {
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [pbExpanded, setPbExpanded] = useState(true);

  const handleRunPress = (run) => {
    navigation.navigate('RunDetail', { runId: run.id, run });
  };

  const handleDeleteRun = (run) => {
    Alert.alert('Delete run', `Delete "${run.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {} },
    ]);
  };

  if (EMPTY_RUNS) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Runs</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn}><Text style={styles.iconText}>🔍</Text></TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}><Text style={styles.iconText}>⋮</Text></TouchableOpacity>
          </View>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🏃</Text>
          <Text style={styles.emptyTitle}>No runs yet</Text>
          <Text style={styles.emptySubtitle}>Connect Strava or import your Garmin files to see your history</Text>
          <SecondaryButton title="Connect Strava" onPress={() => {}} style={styles.emptyBtn} />
          <SecondaryButton title="Import GPX" onPress={() => {}} style={styles.emptyBtn} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Runs</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setSearchVisible((v) => !v)}>
            <Text style={styles.iconText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}><Text style={styles.iconText}>⋮</Text></TouchableOpacity>
        </View>
      </View>

      {searchVisible && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by date, distance, location..."
            placeholderTextColor={colors.secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          <TouchableOpacity onPress={() => setSearchVisible(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterPill, activeFilter === f && styles.filterPillActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterPillText, activeFilter === f && styles.filterPillTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{STATS.totalRuns}</Text>
            <Text style={styles.statLabel}>Runs</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{STATS.totalDistance} km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{STATS.totalTime}</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{STATS.longest} km</Text>
            <Text style={styles.statLabel}>Longest</Text>
          </View>
        </View>

        <View style={styles.importRow}>
          <TouchableOpacity style={styles.importBtn}><Text style={styles.importBtnText}>+ Import GPX</Text></TouchableOpacity>
          <TouchableOpacity style={styles.importBtn}><Text style={styles.importBtnText}>+ Log run manually</Text></TouchableOpacity>
        </View>

        {/* Personal Bests */}
        <TouchableOpacity style={styles.sectionHeader} onPress={() => setPbExpanded(!pbExpanded)}>
          <Text style={styles.sectionTitle}>PERSONAL BESTS</Text>
          <Text style={styles.chevron}>{pbExpanded ? '▼' : '▶'}</Text>
        </TouchableOpacity>
        {pbExpanded && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pbScroll}>
            {PERSONAL_BESTS.map((pb) => (
              <TouchableOpacity key={pb.label} style={styles.pbCard} onPress={() => handleRunPress({ id: pb.label })}>
                <Text style={styles.pbLabel}>{pb.label}</Text>
                <Text style={styles.pbTime}>{pb.time}</Text>
                <Text style={styles.pbDate}>{pb.date}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Run list by month */}
        {RUNS_BY_MONTH.map((section) => (
          <View key={section.month} style={styles.monthSection}>
            <Text style={styles.monthHeader}>{section.month}</Text>
            {section.runs.map((run) => (
              <TouchableOpacity
                key={run.id}
                style={styles.runCard}
                onPress={() => handleRunPress(run)}
                activeOpacity={0.8}
              >
                <View style={styles.runCardLeft}>
                  <View style={[styles.runDot, { backgroundColor: SESSION_COLORS[run.type] || colors.divider }]} />
                  <View>
                    <Text style={styles.runDate}>{run.date}</Text>
                    <Text style={styles.runTitle}>{run.title}</Text>
                  </View>
                </View>
                <View style={styles.runCardCenter}>
                  <Text style={styles.runDistance}>{run.distance}</Text>
                  <Text style={styles.runMeta}>{run.pace} · HR {run.hr} · Cadence {run.cadence} spm</Text>
                  <Text style={styles.runDuration}>{run.duration}</Text>
                </View>
                <View style={styles.mapThumb}>
                  <Text style={styles.mapThumbText}>🗺</Text>
                </View>
                <Text style={styles.runAiLine}>"{run.aiLine}"</Text>
                <View style={styles.runSourceRow}>
                  <View style={styles.sourceChip}><Text style={styles.sourceChipText}>{run.source}</Text></View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.screenPaddingHorizontal, paddingVertical: 12 },
  headerTitle: { ...typography.largeTitle, color: colors.primaryText },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8 },
  iconText: { fontSize: 20 },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPaddingHorizontal, paddingBottom: 12, gap: 12 },
  searchInput: { flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, ...typography.body, color: colors.primaryText },
  cancelText: { ...typography.body, color: colors.accent },
  filterScroll: { maxHeight: 44, marginBottom: 12 },
  filterContent: { paddingHorizontal: spacing.screenPaddingHorizontal, gap: 8, paddingRight: 24 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.backgroundSecondary },
  filterPillActive: { backgroundColor: colors.accent },
  filterPillText: { ...typography.secondary, color: colors.primaryText },
  filterPillTextActive: { ...typography.secondary, color: '#FFFFFF' },
  scroll: { paddingHorizontal: spacing.screenPaddingHorizontal, paddingBottom: 100 },
  statsCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, marginBottom: 12, ...theme.cardShadow },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.title, color: colors.primaryText, marginBottom: 4 },
  statLabel: { ...typography.caption, color: colors.secondaryText },
  importRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  importBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  importBtnText: { ...typography.secondary, color: colors.accent },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { ...typography.caption, color: colors.secondaryText, letterSpacing: 1 },
  chevron: { ...typography.caption, color: colors.secondaryText },
  pbScroll: { gap: 12, marginBottom: 24 },
  pbCard: { width: 100, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, ...theme.cardShadow },
  pbLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 4 },
  pbTime: { ...typography.title, color: colors.primaryText },
  pbDate: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  monthSection: { marginBottom: 24 },
  monthHeader: { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 12 },
  runCard: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 16, marginBottom: 12, ...theme.cardShadow },
  runCardLeft: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  runDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  runDate: { ...typography.secondary, fontWeight: '700', color: colors.primaryText },
  runTitle: { ...typography.caption, color: colors.secondaryText },
  runCardCenter: { marginBottom: 8, marginRight: 80 },
  runDistance: { ...typography.title, fontSize: 20, color: colors.primaryText },
  runMeta: { ...typography.caption, color: colors.secondaryText },
  runDuration: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  mapThumb: { position: 'absolute', right: 16, top: 16, width: 64, height: 64, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  mapThumbText: { fontSize: 24 },
  runAiLine: { ...typography.caption, fontStyle: 'italic', color: colors.secondaryText, marginTop: 4 },
  runSourceRow: { marginTop: 8 },
  sourceChip: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.backgroundSecondary },
  sourceChipText: { ...typography.caption, fontSize: 10, color: colors.secondaryText },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80 },
  emptyEmoji: { fontSize: 64, marginBottom: 24 },
  emptyTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  emptySubtitle: { ...typography.body, color: colors.secondaryText, textAlign: 'center', marginBottom: 24 },
  emptyBtn: { marginBottom: 12 },
});
