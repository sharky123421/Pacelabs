import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, theme } from '../theme';
import { supabase } from '../lib/supabase';
import { useRunnerMode } from '../contexts/RunnerModeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 280;
const SECTION_TITLE = { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 12 };

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

export function RunDetailScreen({ route }) {
  const runFromParams = route?.params?.run;
  const runId = route?.params?.runId;
  const [run, setRun] = useState(runFromParams || null);
  const [loading, setLoading] = useState(!runFromParams);
  const [mapMode, setMapMode] = useState('Pace');
  const [fitnessModalVisible, setFitnessModalVisible] = useState(false);
  const { isBeginner } = useRunnerMode();

  useEffect(() => {
    if (run) return;
    if (!runId) { setLoading(false); return; }
    supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle()
      .then(({ data }) => { if (data) setRun(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!run) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <Text style={styles.emptyText}>Run not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const distKm = (Number(run.distance_meters) || 0) / 1000;
  const durationSec = Number(run.duration_seconds) || 0;
  const pace = formatPace(run.distance_meters, run.duration_seconds);
  const duration = formatDuration(durationSec);
  const avgHr = run.avg_hr ? `${Math.round(run.avg_hr)} bpm` : '\u2014';
  const elevation = run.elevation_gain ? `${Math.round(run.elevation_gain)} m` : '\u2014';
  const cadence = run.avg_cadence ? `${Math.round(run.avg_cadence)} spm` : null;
  const tss = run.tss != null ? String(Math.round(run.tss)) : null;
  const aiSummary = run.ai_summary || null;
  const source = (run.source || 'manual').replace('_', ' ');
  const runDate = run.started_at
    ? new Date(run.started_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* MAP PLACEHOLDER */}
        <View style={styles.mapWrap}>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>Route map</Text>
          </View>
          <View style={styles.mapToggle}>
            <TouchableOpacity style={[styles.togglePill, mapMode === 'Pace' && styles.togglePillActive]} onPress={() => setMapMode('Pace')}>
              <Text style={[styles.toggleText, mapMode === 'Pace' && styles.toggleTextActive]}>Pace</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.togglePill, mapMode === 'HR' && styles.togglePillActive]} onPress={() => setMapMode('HR')}>
              <Text style={[styles.toggleText, mapMode === 'HR' && styles.toggleTextActive]}>HR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* DATE + SOURCE */}
        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{runDate}</Text>
          <View style={styles.sourceChip}><Text style={styles.sourceChipText}>{source.toUpperCase()}</Text></View>
        </View>

        {/* KEY STATS */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{distKm > 0 ? `${distKm.toFixed(2)} km` : '\u2014'}</Text><Text style={styles.statChipLabel}>Distance</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{duration}</Text><Text style={styles.statChipLabel}>Time</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{pace}</Text><Text style={styles.statChipLabel}>Avg Pace</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{avgHr}</Text><Text style={styles.statChipLabel}>Avg HR</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{elevation}</Text><Text style={styles.statChipLabel}>Elevation</Text></View>
        </View>

        {/* EXTRA STATS */}
        {(cadence || tss) && !isBeginner && (
          <View style={styles.extraRow}>
            {cadence && <View style={styles.statChip}><Text style={styles.statChipValue}>{cadence}</Text><Text style={styles.statChipLabel}>Cadence</Text></View>}
            {tss && <View style={styles.statChip}><Text style={styles.statChipValue}>{tss}</Text><Text style={styles.statChipLabel}>TSS</Text></View>}
            {run.intensity_factor != null && <View style={styles.statChip}><Text style={styles.statChipValue}>{Number(run.intensity_factor).toFixed(2)}</Text><Text style={styles.statChipLabel}>IF</Text></View>}
            {run.decoupling_index != null && <View style={styles.statChip}><Text style={styles.statChipValue}>{Number(run.decoupling_index).toFixed(1)}%</Text><Text style={styles.statChipLabel}>Decoupling</Text></View>}
          </View>
        )}

        {/* AI SUMMARY */}
        {aiSummary && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>COACH ANALYSIS</Text>
            <View style={styles.aiCard}>
              <Text style={styles.aiText}>"{aiSummary}"</Text>
            </View>
          </View>
        )}

        {/* HR ZONES (if data exists) */}
        {run.hr_zone_seconds && !isBeginner && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>HEART RATE ZONES</Text>
            <Text style={styles.comingSoon}>Zone breakdown available after analysis</Text>
          </View>
        )}

        {/* FITNESS IMPACT (if available, advanced only) */}
        {!isBeginner && (run.tss != null || run.intensity_factor != null) && (
          <View style={styles.section}>
            <Text style={SECTION_TITLE}>FITNESS IMPACT</Text>
            {run.tss != null && (
              <View style={styles.fitnessRow}>
                <Text style={styles.fitnessLabel}>Training Stress</Text>
                <Text style={styles.fitnessNow}>{Math.round(run.tss)}</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setFitnessModalVisible(true)}>
              <Text style={styles.whatLink}>What does this mean?</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* BEGINNER: simple encouragement */}
        {isBeginner && (
          <View style={styles.section}>
            <View style={styles.encourageCard}>
              <Text style={styles.encourageText}>
                {distKm >= 5 ? 'Amazing distance! You crushed it today.' : 'Great work showing up! Every run counts.'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={fitnessModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setFitnessModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Fitness metrics</Text>
            <Text style={styles.modalBody}>
              TSS (Training Stress Score) measures how hard the session was relative to your threshold. Higher TSS = more training load on your body. It helps track when you need recovery.
            </Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setFitnessModalVisible(false)}>
              <Text style={styles.modalBtnText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 40 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...typography.body, color: colors.secondaryText },
  mapWrap: { marginBottom: 16 },
  mapPlaceholder: { height: MAP_HEIGHT, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderText: { ...typography.title, color: colors.secondaryText },
  mapToggle: { position: 'absolute', top: 12, right: spacing.screenPaddingHorizontal, flexDirection: 'row', gap: 4 },
  togglePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.card },
  togglePillActive: { backgroundColor: colors.accent },
  toggleText: { ...typography.caption, color: colors.primaryText },
  toggleTextActive: { ...typography.caption, color: '#FFFFFF' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.screenPaddingHorizontal, marginBottom: 16 },
  dateText: { ...typography.secondary, color: colors.secondaryText },
  sourceChip: { backgroundColor: colors.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sourceChipText: { ...typography.caption, fontSize: 10, color: colors.secondaryText, fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.screenPaddingHorizontal, gap: 8, marginBottom: 12 },
  extraRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.screenPaddingHorizontal, gap: 8, marginBottom: 24 },
  statChip: { minWidth: 64, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 10 },
  statChipValue: { ...typography.secondary, fontWeight: '600', color: colors.primaryText },
  statChipLabel: { ...typography.caption, color: colors.secondaryText },
  section: { paddingHorizontal: spacing.screenPaddingHorizontal, marginBottom: 28 },
  aiCard: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, borderLeftWidth: 4, borderLeftColor: colors.accent, ...theme.cardShadow },
  aiText: { ...typography.body, fontStyle: 'italic', color: colors.primaryText },
  comingSoon: { ...typography.body, color: colors.secondaryText },
  fitnessRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fitnessLabel: { ...typography.body, color: colors.primaryText },
  fitnessNow: { ...typography.title, color: colors.primaryText },
  whatLink: { ...typography.secondary, color: colors.linkNeon, marginTop: 8 },
  encourageCard: { backgroundColor: colors.beginnerGreenLight, borderRadius: theme.radius.card, padding: 20 },
  encourageText: { ...typography.body, fontSize: 18, color: colors.primaryText, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 24, ...theme.cardShadow },
  modalTitle: { ...typography.title, color: colors.primaryText, marginBottom: 12 },
  modalBody: { ...typography.body, color: colors.secondaryText, marginBottom: 20 },
  modalBtn: { backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalBtnText: { ...typography.body, color: '#FFFFFF' },
});
