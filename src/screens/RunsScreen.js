import React, { useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Calendar } from 'react-native-calendars';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, typography, spacing, theme } from '../theme';
import { SecondaryButton, SkeletonRunList } from '../components';

const SESSION_COLORS = { easy: colors.success, tempo: colors.warning, intervals: colors.destructive, long: colors.accent, race: colors.warning };
const FILTERS = ['All', 'Easy', 'Tempo', 'Intervals', 'Long Run', 'Race', 'This week', 'This month', 'Strava', 'Garmin', 'Apple Watch'];

const RunCard = memo(function RunCard({ run, onPress, sessionColors }) {
  const sourceBadge = (run.source || 'manual').toUpperCase().replace('_', ' ');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.runCard,
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
      ]}
    >
      <View style={styles.runCardLeft}>
        <View style={[styles.runDot, { backgroundColor: sessionColors[run.type] || colors.divider }]} />
        <View>
          <Text style={styles.runDate}>{run.date}</Text>
          <Text style={styles.runTitle}>{run.title || 'Run'}</Text>
        </View>
      </View>
      <View style={styles.runCardCenter}>
        <Text style={styles.runDistance}>{run.distance}</Text>
        <Text style={styles.runMeta}>{run.pace} · HR {run.hr} · Cadence {run.cadence} spm</Text>
        <Text style={styles.runDuration}>{run.duration}</Text>
      </View>
      <View style={styles.mapThumb} />
      <Text style={styles.runAiLine}>"{run.aiLine}"</Text>
      <View style={styles.runSourceRow}>
        <View style={styles.sourceChip}>
          <Text style={styles.sourceChipText}>{sourceBadge}</Text>
        </View>
      </View>
    </Pressable>
  );
});


function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 1) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

function formatPace(distanceMeters, durationSeconds) {
  if (!distanceMeters || !durationSeconds || durationSeconds <= 0) return '—';
  const km = distanceMeters / 1000;
  const secPerKm = durationSeconds / km;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

/** Derive session type from title/distance when DB has no type column. */
function deriveRunType(run) {
  const title = (run.title || '').toLowerCase();
  const distKm = (Number(run.distance_meters) || 0) / 1000;
  if (title.includes('interval') || title.includes('fartlek') || title.includes('repetition')) return 'intervals';
  if (title.includes('tempo') || title.includes('threshold')) return 'tempo';
  if (title.includes('long') || distKm >= 20) return 'long';
  if (title.includes('race') || title.includes('5k') || title.includes('10k') || title.includes('marathon') || title.includes('half')) return 'race';
  return 'easy';
}

function groupRunsByMonth(runs) {
  const byMonth = {};
  (runs || []).forEach((run) => {
    const d = new Date(run.started_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { key, month: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), runs: [] };
    const distKm = (Number(run.distance_meters) || 0) / 1000;
    const dur = Number(run.duration_seconds) || 0;
    byMonth[key].runs.push({
      ...run,
      type: run.type || deriveRunType(run),
      date: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
      distance: distKm > 0 ? `${distKm.toFixed(1)} km` : '—',
      pace: formatPace(run.distance_meters, run.duration_seconds),
      hr: run.avg_hr ? `${run.avg_hr} bpm` : '—',
      cadence: run.avg_cadence ? Math.round(Number(run.avg_cadence)) : '—',
      duration: formatDuration(dur),
      aiLine: run.ai_summary || 'Run synced',
      source: (run.source || 'manual').toUpperCase().replace('_', ' '),
    });
  });
  return Object.values(byMonth).sort((a, b) => b.key.localeCompare(a.key));
}

export function RunsScreen({ navigation }) {
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);
  const [runStats, setRunStats] = useState({ totalRuns: 0, totalDistance: 0, totalTime: '0h', longest: 0 });
  const [loading, setLoading] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.auth.refreshSession();
      const { data, error } = await supabase.rpc('get_my_runs');
      let list = [];
      if (!error && data != null) {
        list = Array.isArray(data) ? data : [];
      }
      if (list.length === 0 && (error || !data)) {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id ?? user?.id;
        if (uid) {
          const { data: runs, error: qErr } = await supabase
            .from('runs')
            .select('id, started_at, distance_meters, duration_seconds, title, source, avg_hr, avg_cadence, ai_summary')
            .eq('user_id', uid)
            .is('deleted_at', null)
            .order('started_at', { ascending: false });
          if (!qErr && runs) list = runs;
        }
      }
      setRuns(list);
      const totalRuns = list.length;
      const totalDistance = list.reduce((s, r) => s + (Number(r.distance_meters) || 0) / 1000, 0);
      const totalDurationSeconds = list.reduce((s, r) => s + (Number(r.duration_seconds) || 0), 0);
      const longest = list.reduce((max, r) => Math.max(max, (Number(r.distance_meters) || 0) / 1000), 0);
      const h = Math.floor(totalDurationSeconds / 3600);
      const m = Math.floor((totalDurationSeconds % 3600) / 60);
      setRunStats({
        totalRuns,
        totalDistance,
        totalTime: h >= 1 ? `${h}h ${m}min` : `${m} min`,
        longest,
      });
    } catch (_) {
      setRuns([]);
      setRunStats({ totalRuns: 0, totalDistance: 0, totalTime: '0h', longest: 0 });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadRuns();
    }, [loadRuns])
  );

  const handleRunPress = (run) => {
    navigation.navigate('RunDetail', { runId: run.id, run });
  };

  const handleDeleteRun = (run) => {
    Alert.alert('Delete run', `Delete "${run.title || 'this run'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('runs').update({ deleted_at: new Date().toISOString() }).eq('id', run.id);
            await loadRuns();
          } catch (_) {
            Alert.alert('Error', 'Could not delete run. Please try again.');
          }
        },
      },
    ]);
  };

  const hasRuns = runs.length > 0;

  // Filter by search (date, distance, title) and by filter pill
  const filterRun = (run) => {
    const q = (searchQuery || '').toLowerCase().trim();
    if (q) {
      const dateStr = new Date(run.started_at).toLocaleDateString();
      const dist = ((Number(run.distance_meters) || 0) / 1000).toFixed(1);
      const title = (run.title || '').toLowerCase();
      if (!dateStr.toLowerCase().includes(q) && !dist.includes(q) && !title.includes(q)) return false;
    }
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Strava') return (run.source || '').toLowerCase() === 'strava';
    if (activeFilter === 'Garmin') return (run.source || '').toLowerCase() === 'garmin';
    if (activeFilter === 'Apple Watch') return (run.source || '').toLowerCase() === 'apple_watch';
    const typeMap = { Easy: 'easy', Tempo: 'tempo', Intervals: 'intervals', 'Long Run': 'long', Race: 'race' };
    const wantType = typeMap[activeFilter];
    if (wantType) return deriveRunType(run) === wantType;
    if (activeFilter === 'This week') {
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(run.started_at) >= weekAgo;
    }
    if (activeFilter === 'This month') {
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      return new Date(run.started_at) >= startOfMonth;
    }
    return true;
  };
  const filteredRuns = runs.filter(filterRun);
  const filteredRunsByMonth = groupRunsByMonth(filteredRuns);

  const markedDates = React.useMemo(() => {
    const marks = {};
    runs.forEach((r) => {
      if (!r.started_at) return;
      const d = new Date(r.started_at).toISOString().split('T')[0];
      const type = deriveRunType(r);
      marks[d] = { marked: true, dotColor: SESSION_COLORS[type] || colors.accent };
    });
    const today = new Date().toISOString().split('T')[0];
    if (!marks[today]) marks[today] = {};
    marks[today].selected = true;
    marks[today].selectedColor = colors.backgroundSecondary;
    return marks;
  }, [runs]);

  if (loading && runs.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Runs</Text>
        </View>
        <SkeletonRunList count={5} />
      </SafeAreaView>
    );
  }

  if (!hasRuns && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Runs</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn}><Text style={styles.iconText}>Search</Text></TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}><Text style={styles.iconText}>⋮</Text></TouchableOpacity>
          </View>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyLogo}>
            <Text style={styles.emptyLogoText}>P</Text>
          </View>
          <Text style={styles.emptyTitle}>No runs yet</Text>
          <Text style={styles.emptySubtitle}>Connect Strava or import your Garmin files to see your history. If you just synced, drag down here or open the Runs tab to refresh.</Text>
          <SecondaryButton title="Connect Strava" onPress={() => navigation.getParent()?.getParent()?.navigate('ProfileTab')} style={styles.emptyBtn} />
          <SecondaryButton title="Refresh runs" onPress={() => loadRuns()} style={styles.emptyBtn} />
          <SecondaryButton title="Import GPX" onPress={() => navigation.getParent()?.getParent()?.navigate('OnboardingGPXImport')} style={styles.emptyBtn} />
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
            <Text style={styles.iconText}>Search</Text>
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

      <View style={styles.viewToggleContainer}>
        <View style={styles.viewToggle}>
          <Pressable style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]} onPress={() => setViewMode('list')}>
            <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
          </Pressable>
          <Pressable style={[styles.toggleBtn, viewMode === 'calendar' && styles.toggleBtnActive]} onPress={() => setViewMode('calendar')}>
            <Text style={[styles.toggleText, viewMode === 'calendar' && styles.toggleTextActive]}>Calendar</Text>
          </Pressable>
        </View>
      </View>

      {viewMode === 'list' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              style={({ pressed }) => [
                styles.filterPill,
                activeFilter === f && styles.filterPillActive,
                { opacity: pressed ? 0.7 : 1 }
              ]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterPillText, activeFilter === f && styles.filterPillTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadRuns(); setRefreshing(false); }} />
        }
      >
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{runStats.totalRuns}</Text>
            <Text style={styles.statLabel}>Runs</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{runStats.totalDistance.toFixed(1)} km</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{runStats.totalTime}</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{runStats.longest.toFixed(1)} km</Text>
            <Text style={styles.statLabel}>Longest</Text>
          </View>
        </View>

        <View style={styles.importRow}>
          <TouchableOpacity style={styles.importBtn} onPress={() => navigation.getParent()?.getParent()?.navigate('OnboardingGPXImport')}><Text style={styles.importBtnText}>+ Import GPX</Text></TouchableOpacity>
          <TouchableOpacity style={styles.importBtn} onPress={() => navigation.getParent()?.navigate('ProfileTab')}><Text style={styles.importBtnText}>+ Log run manually</Text></TouchableOpacity>
        </View>

        {viewMode === 'calendar' ? (
          <View style={styles.calendarContainer}>
            <Calendar
              markedDates={markedDates}
              onDayPress={(day) => {
                const dayRuns = runs.filter(r => r.started_at && r.started_at.startsWith(day.dateString));
                if (dayRuns.length > 0) {
                  // Navigate to the first run of that day, or could show a modal with runs
                  handleRunPress(dayRuns[0]);
                } else {
                  Alert.alert('No Runs', `You didn't log any runs on ${day.dateString}.`);
                }
              }}
              theme={{
                backgroundColor: colors.background,
                calendarBackground: colors.card,
                textSectionTitleColor: colors.tertiaryText,
                selectedDayBackgroundColor: colors.backgroundSecondary,
                selectedDayTextColor: colors.primaryText,
                todayTextColor: colors.primaryText,
                dayTextColor: colors.primaryText,
                textDisabledColor: colors.divider,
                dotColor: colors.accent,
                selectedDotColor: colors.accent,
                arrowColor: colors.link,
                monthTextColor: colors.primaryText,
                indicatorColor: 'white',
                textDayFontFamily: typography.body.fontFamily,
                textMonthFontFamily: typography.title.fontFamily,
                textDayHeaderFontFamily: typography.caption.fontFamily,
                textDayFontSize: 16,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 12,
              }}
              style={styles.calendarTheme}
            />
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ALL RUNS</Text>
            </View>

            {/* Run list by month (filtered by search + filter pills) */}
            {filteredRunsByMonth.length === 0 && hasRuns ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptySubtitle}>No runs match your search or filter.</Text>
              </View>
            ) : (
              filteredRunsByMonth.map((section) => (
                <View key={section.month} style={styles.monthSection}>
                  <Text style={styles.monthHeader}>{section.month}</Text>
                  {section.runs.map((run) => (
                    <RunCard
                      key={run.id}
                      run={run}
                      onPress={() => handleRunPress(run)}
                      sessionColors={SESSION_COLORS}
                    />
                  ))}
                </View>
              ))
            )}
            {viewMode === 'list' && (<></>)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.screenPaddingHorizontal, paddingVertical: 12 },
  headerTitle: { ...typography.largeTitle, color: colors.primaryText, letterSpacing: -0.5 },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8 },
  iconText: { fontSize: 20, color: colors.primaryText },
  searchBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.screenPaddingHorizontal, paddingBottom: 12, gap: 12 },
  searchInput: { flex: 1, backgroundColor: colors.backgroundSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, ...typography.body, color: colors.primaryText, borderWidth: 1, borderColor: colors.glassBorder },
  cancelText: { ...typography.body, color: colors.link },
  filterScroll: { maxHeight: 44, marginBottom: 12 },
  filterContent: { paddingHorizontal: spacing.screenPaddingHorizontal, gap: 8, paddingRight: 24 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.glassBorder },
  filterPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterPillText: { ...typography.secondary, color: colors.secondaryText, fontWeight: '500' },
  filterPillTextActive: { ...typography.secondary, color: colors.background, fontWeight: '700' },
  scroll: { paddingHorizontal: spacing.screenPaddingHorizontal, paddingBottom: 100 },
  statsCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: colors.glassBorder, ...theme.cardShadow },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.title, color: colors.primaryText, marginBottom: 4, letterSpacing: -0.3 },
  statLabel: { ...typography.caption, color: colors.tertiaryText },
  importRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  importBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  importBtnText: { ...typography.secondary, color: colors.link },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { ...typography.caption, color: colors.tertiaryText, letterSpacing: 1, fontWeight: '600' },
  chevron: { ...typography.caption, color: colors.tertiaryText },
  pbScroll: { gap: 12, marginBottom: 24 },
  pbCard: { width: 100, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, borderWidth: 1, borderColor: colors.glassBorder, ...theme.cardShadow },
  pbLabel: { ...typography.caption, color: colors.tertiaryText, marginBottom: 4 },
  pbTime: { ...typography.title, color: colors.primaryText },
  pbDate: { ...typography.caption, color: colors.tertiaryText, marginTop: 4 },
  monthSection: { marginBottom: 24 },
  monthHeader: { ...typography.caption, color: colors.tertiaryText, letterSpacing: 1, marginBottom: 12, fontWeight: '600' },
  runCard: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: colors.glassBorder, ...theme.cardShadow },
  runCardLeft: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  runDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  runDate: { ...typography.secondary, fontWeight: '700', color: colors.primaryText },
  runTitle: { ...typography.caption, color: colors.tertiaryText },
  runCardCenter: { marginBottom: 8, marginRight: 80 },
  runDistance: { ...typography.title, fontSize: 22, color: colors.primaryText, letterSpacing: -0.3 },
  runMeta: { ...typography.caption, color: colors.secondaryText },
  runDuration: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  mapThumb: { position: 'absolute', right: 16, top: 16, width: 64, height: 64, borderRadius: 10, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.glassBorder },
  runAiLine: { ...typography.caption, fontStyle: 'italic', color: colors.tertiaryText, marginTop: 4 },
  runSourceRow: { marginTop: 8 },
  sourceChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.glassBorder },
  sourceChipText: { ...typography.caption, fontSize: 10, color: colors.tertiaryText, fontWeight: '600', letterSpacing: 0.5 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80 },
  emptyLogo: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 1, borderColor: colors.glassBorder },
  emptyLogoText: { fontSize: 36, fontWeight: '700', color: colors.primaryText },
  emptyTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  emptySubtitle: { ...typography.body, color: colors.secondaryText, textAlign: 'center', marginBottom: 24 },
  emptyBtn: { marginBottom: 12 },
  viewToggleContainer: { paddingHorizontal: spacing.screenPaddingHorizontal, marginBottom: 16 },
  viewToggle: { flexDirection: 'row', backgroundColor: colors.backgroundSecondary, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.glassBorder },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: colors.card, ...theme.cardShadow },
  toggleText: { ...typography.secondary, color: colors.tertiaryText, fontWeight: '500' },
  toggleTextActive: { color: colors.primaryText, fontWeight: '700' },
  calendarContainer: { borderRadius: theme.radius.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder, ...theme.cardShadow, marginBottom: 24 },
  calendarTheme: { borderRadius: theme.radius.card, paddingBottom: 10 },
});
