import React, { useState } from 'react';
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
} from 'react-native';
import { colors, typography, spacing, theme } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 280;
const SECTION_TITLE = { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 12 };

// Mock data
const RUN = {
  distance: '10.4 km',
  time: '50:14',
  avgPace: '4:52 /km',
  avgHr: '158 bpm',
  elevation: '124 m',
  aiSummary: "Strong tempo effort today. Your average HR of 161bpm at 4:52/km pace suggests your threshold is improving — this pace was zone 4 two months ago, now sitting comfortably in zone 3. Decoupling was just 3.1%, excellent aerobic efficiency. Ready for harder work next week.",
  splits: [
    { km: 1, pace: '4:58', hr: 152, cadence: 172, elev: 12 },
    { km: 2, pace: '4:52', hr: 156, cadence: 174, elev: 8 },
    { km: 3, pace: '4:48', hr: 160, cadence: 176, elev: 15 },
    { km: 4, pace: '4:55', hr: 158, cadence: 173, elev: -5 },
    { km: 5, pace: '4:50', hr: 159, cadence: 175, elev: 3 },
    { km: 6, pace: '4:49', hr: 161, cadence: 176, elev: 7 },
    { km: 7, pace: '4:51', hr: 160, cadence: 174, elev: 4 },
    { km: 8, pace: '4:47', hr: 162, cadence: 177, elev: 10 },
    { km: 9, pace: '4:53', hr: 157, cadence: 173, elev: -2 },
    { km: 10, pace: '4:50', hr: 159, cadence: 175, elev: 6 },
  ],
  hrZones: [
    { zone: 'Z1', label: '50–60%', min: 0, max: 20, time: '0:00', color: '#E5E5EA' },
    { zone: 'Z2', label: '60–70%', min: 20, max: 45, time: '2:30', color: colors.accent },
    { zone: 'Z3', label: '70–80%', min: 45, max: 75, time: '15:00', color: colors.success },
    { zone: 'Z4', label: '80–90%', min: 75, max: 95, time: '28:00', color: colors.warning },
    { zone: 'Z5', label: '90–100%', min: 95, max: 100, time: '4:44', color: colors.destructive },
  ],
  performance: [
    { label: 'Training Stress Score (TSS)', value: '78' },
    { label: 'Intensity Factor (IF)', value: '0.89' },
    { label: 'TRIMP Score', value: '112' },
    { label: 'Efficiency Factor (EF)', value: '1.24' },
    { label: 'Decoupling Index', value: '3.1%' },
    { label: 'Normalized Graded Pace', value: '4:48 /km' },
  ],
  form: [
    { label: 'Avg Cadence', value: '174 spm' },
    { label: 'Avg Stride Length', value: '1.24 m' },
    { label: 'Vertical Oscillation', value: '8.2 cm' },
    { label: 'Ground Contact', value: '224 ms' },
  ],
  compareRuns: [
    { date: 'Today', distance: '10.4 km', pace: '4:52', hr: '158', tss: '78', current: true },
    { date: '12 Feb', distance: '10.0 km', pace: '4:55', hr: '155', tss: '72', current: false },
    { date: '5 Feb', distance: '10.2 km', pace: '4:58', hr: '152', tss: '68', current: false },
    { date: '28 Jan', distance: '10.1 km', pace: '5:02', hr: '148', tss: '64', current: false },
  ],
  predictions: [
    { label: '5K', time: '21:34', trend: '↑' },
    { label: '10K', time: '44:12', trend: '↑' },
    { label: 'Half', time: '1:38:22', trend: '→' },
    { label: 'Marathon', time: '3:24:08', trend: '↑' },
  ],
  fitness: [
    { label: 'Fitness (CTL)', change: '+0.8', now: '52.4' },
    { label: 'Fatigue (ATL)', change: '+3.2', now: '61.1' },
    { label: 'Form (TSB)', change: '-2.4', now: '-8.7' },
  ],
};

export function RunDetailScreen({ route, navigation }) {
  const [mapMode, setMapMode] = useState('Pace'); // Pace | HR
  const [fitnessModalVisible, setFitnessModalVisible] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* SECTION 1 — HERO MAP */}
        <View style={styles.mapWrap}>
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>Map</Text>
            <Text style={styles.mapPlaceholderSubtext}>Route · Pace/HR overlay</Text>
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

        {/* SECTION 2 — KEY STATS */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{RUN.distance}</Text><Text style={styles.statChipLabel}>Distance</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{RUN.time}</Text><Text style={styles.statChipLabel}>Time</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{RUN.avgPace}</Text><Text style={styles.statChipLabel}>Avg Pace</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{RUN.avgHr}</Text><Text style={styles.statChipLabel}>Avg HR</Text></View>
          <View style={styles.statChip}><Text style={styles.statChipValue}>{RUN.elevation}</Text><Text style={styles.statChipLabel}>Elevation</Text></View>
        </View>

        {/* SECTION 3 — AI SUMMARY */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>COACH ANALYSIS</Text>
          <View style={styles.aiCard}>
            <Text style={styles.aiText}>"{RUN.aiSummary}"</Text>
          </View>
        </View>

        {/* SECTION 4 — ELEVATION PROFILE */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>ELEVATION PROFILE</Text>
          <View style={styles.chartPlaceholder}>
            <Text style={styles.chartPlaceholderText}>Elevation (m) vs distance (km)</Text>
            <View style={styles.elevationBar} />
          </View>
        </View>

        {/* SECTION 5 — SPLITS */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>SPLITS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.splitsRow, styles.splitsHeader]}>
                <Text style={styles.splitsHeaderText}>KM</Text>
                <Text style={styles.splitsHeaderText}>PACE</Text>
                <Text style={styles.splitsHeaderText}>HR</Text>
                <Text style={styles.splitsHeaderText}>CAD</Text>
                <Text style={styles.splitsHeaderText}>ELEV</Text>
              </View>
              {RUN.splits.map((s, i) => (
                <View key={i} style={[styles.splitsRow, i % 2 === 1 && styles.splitsRowAlt]}>
                  <Text style={styles.splitsCell}>{s.km}</Text>
                  <Text style={styles.splitsCell}>{s.pace}</Text>
                  <Text style={styles.splitsCell}>{s.hr}</Text>
                  <Text style={styles.splitsCell}>{s.cadence}</Text>
                  <Text style={styles.splitsCell}>{s.elev}</Text>
                </View>
              ))}
              <View style={[styles.splitsRow, styles.splitsRowAvg]}>
                <Text style={styles.splitsCellAvg}>Avg</Text>
                <Text style={styles.splitsCellAvg}>4:52</Text>
                <Text style={styles.splitsCellAvg}>159</Text>
                <Text style={styles.splitsCellAvg}>175</Text>
                <Text style={styles.splitsCellAvg}>—</Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* SECTION 6 — HR ZONES */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>HEART RATE ZONES</Text>
          <View style={styles.hrBar}>
            {RUN.hrZones.map((z) => (
              <View key={z.zone} style={[styles.hrSegment, { width: `${z.max - z.min}%`, backgroundColor: z.color }]}>
                <Text style={styles.hrSegmentTime}>{z.time}</Text>
              </View>
            ))}
          </View>
          <View style={styles.hrLegend}>
            {RUN.hrZones.map((z) => (
              <View key={z.zone} style={styles.hrLegendItem}>
                <View style={[styles.hrLegendDot, { backgroundColor: z.color }]} />
                <Text style={styles.hrLegendText}>{z.zone} {z.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* SECTION 7 — PERFORMANCE GRID */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>PERFORMANCE</Text>
          <View style={styles.perfGrid}>
            {RUN.performance.map((p) => (
              <View key={p.label} style={styles.perfCard}>
                <Text style={styles.perfLabel}>{p.label}</Text>
                <Text style={styles.perfValue}>{p.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* SECTION 8 — FORM */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>RUNNING FORM</Text>
          <View style={styles.formGrid}>
            {RUN.form.map((f) => (
              <View key={f.label} style={styles.formCard}>
                <Text style={styles.formLabel}>{f.label}</Text>
                <Text style={styles.formValue}>{f.value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.balanceBar}>
            <Text style={styles.balanceLabel}>L/R balance</Text>
            <View style={styles.balanceTrack}>
              <View style={[styles.balanceFill, { width: '51%' }]} />
            </View>
            <Text style={styles.balanceText}>51% L · 49% R</Text>
          </View>
        </View>

        {/* SECTION 9 — COMPARE */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>HOW THIS COMPARES</Text>
          <Text style={styles.subtitle}>vs your last 3 similar runs</Text>
          <View style={styles.compareTable}>
            <View style={[styles.compareRow, styles.compareHeader]}>
              <Text style={styles.compareHeaderText}>Date</Text>
              <Text style={styles.compareHeaderText}>Distance</Text>
              <Text style={styles.compareHeaderText}>Pace</Text>
              <Text style={styles.compareHeaderText}>HR</Text>
              <Text style={styles.compareHeaderText}>TSS</Text>
            </View>
            {RUN.compareRuns.map((r) => (
              <View key={r.date} style={[styles.compareRow, r.current && styles.compareRowCurrent]}>
                <Text style={styles.compareCell}>{r.date}</Text>
                <Text style={styles.compareCell}>{r.distance}</Text>
                <Text style={styles.compareCell}>{r.pace}</Text>
                <Text style={styles.compareCell}>{r.hr}</Text>
                <Text style={styles.compareCell}>{r.tss}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* SECTION 10 — RACE PREDICTIONS */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>UPDATED RACE PREDICTIONS</Text>
          <Text style={styles.subtitle}>Based on this run + your full history</Text>
          <View style={styles.predGrid}>
            {RUN.predictions.map((p) => (
              <View key={p.label} style={styles.predCard}>
                <Text style={styles.predLabel}>{p.label}</Text>
                <Text style={styles.predValue}>{p.time}</Text>
                <Text style={styles.predTrend}>{p.trend}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* SECTION 11 — FITNESS IMPACT */}
        <View style={styles.section}>
          <Text style={SECTION_TITLE}>FITNESS IMPACT</Text>
          {RUN.fitness.map((f) => (
            <View key={f.label} style={styles.fitnessRow}>
              <Text style={styles.fitnessLabel}>{f.label}</Text>
              <Text style={styles.fitnessChange}>{f.change}</Text>
              <Text style={styles.fitnessArrow}>→</Text>
              <Text style={styles.fitnessNow}>{f.now}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={() => setFitnessModalVisible(true)}>
            <Text style={styles.whatLink}>What does this mean?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={fitnessModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setFitnessModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Fitness metrics</Text>
            <Text style={styles.modalBody}>
              CTL (Chronic Training Load) reflects your long-term fitness. ATL (Acute Training Load) is short-term fatigue. TSB (Training Stress Balance) = CTL − ATL; negative means you're fatigued, positive means fresh. Optimal form for racing is often slightly negative to zero.
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
  mapWrap: { marginBottom: 16 },
  mapPlaceholder: { height: MAP_HEIGHT, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderText: { ...typography.title, color: colors.secondaryText },
  mapPlaceholderSubtext: { ...typography.caption, color: colors.secondaryText, marginTop: 4 },
  mapToggle: { position: 'absolute', top: 12, right: spacing.screenPaddingHorizontal, flexDirection: 'row', gap: 4 },
  togglePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)' },
  togglePillActive: { backgroundColor: colors.accent },
  toggleText: { ...typography.caption, color: colors.primaryText },
  toggleTextActive: { ...typography.caption, color: '#FFFFFF' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.screenPaddingHorizontal, gap: 8, marginBottom: 24 },
  statChip: { minWidth: 64, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 10 },
  statChipValue: { ...typography.secondary, fontWeight: '600', color: colors.primaryText },
  statChipLabel: { ...typography.caption, color: colors.secondaryText },
  section: { paddingHorizontal: spacing.screenPaddingHorizontal, marginBottom: 28 },
  aiCard: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, borderLeftWidth: 4, borderLeftColor: colors.accent, ...theme.cardShadow },
  aiText: { ...typography.body, fontStyle: 'italic', color: colors.primaryText },
  chartPlaceholder: { height: 120, backgroundColor: colors.backgroundSecondary, borderRadius: theme.radius.card, alignItems: 'center', justifyContent: 'center' },
  chartPlaceholderText: { ...typography.caption, color: colors.secondaryText },
  elevationBar: { width: '80%', height: 4, backgroundColor: colors.divider, borderRadius: 2, marginTop: 8 },
  splitsRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  splitsHeader: { backgroundColor: colors.backgroundSecondary },
  splitsHeaderText: { ...typography.caption, fontWeight: '600', color: colors.secondaryText, width: 56 },
  splitsRowAlt: { backgroundColor: '#F9F9F9' },
  splitsRowAvg: { backgroundColor: colors.backgroundSecondary },
  splitsCell: { ...typography.secondary, color: colors.primaryText, width: 56 },
  splitsCellAvg: { ...typography.secondary, fontWeight: '600', color: colors.primaryText, width: 56 },
  hrBar: { flexDirection: 'row', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 12 },
  hrSegment: { justifyContent: 'center', alignItems: 'center' },
  hrSegmentTime: { ...typography.caption, fontSize: 9, color: '#000', fontWeight: '600' },
  hrLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  hrLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hrLegendDot: { width: 8, height: 8, borderRadius: 4 },
  hrLegendText: { ...typography.caption, color: colors.secondaryText },
  perfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  perfCard: { width: (SCREEN_WIDTH - spacing.screenPaddingHorizontal * 2 - 24) / 2, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, ...theme.cardShadow },
  perfLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 4 },
  perfValue: { ...typography.title, color: colors.primaryText },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  formCard: { width: (SCREEN_WIDTH - spacing.screenPaddingHorizontal * 2 - 24) / 2, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, ...theme.cardShadow },
  formLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 4 },
  formValue: { ...typography.title, color: colors.primaryText },
  balanceBar: { marginTop: 8 },
  balanceLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 4 },
  balanceTrack: { height: 8, backgroundColor: colors.backgroundSecondary, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  balanceFill: { height: '100%', backgroundColor: colors.accent },
  balanceText: { ...typography.caption, color: colors.secondaryText },
  subtitle: { ...typography.secondary, color: colors.secondaryText, marginBottom: 12 },
  compareTable: { backgroundColor: colors.card, borderRadius: theme.radius.card, overflow: 'hidden', ...theme.cardShadow },
  compareRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  compareHeader: { backgroundColor: colors.backgroundSecondary },
  compareHeaderText: { ...typography.caption, fontWeight: '600', color: colors.secondaryText, flex: 1 },
  compareRowCurrent: { backgroundColor: colors.accent + '15' },
  compareCell: { ...typography.secondary, color: colors.primaryText, flex: 1 },
  predGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  predCard: { width: (SCREEN_WIDTH - spacing.screenPaddingHorizontal * 2 - 24) / 2, backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 14, ...theme.cardShadow },
  predLabel: { ...typography.caption, color: colors.secondaryText },
  predValue: { ...typography.title, color: colors.primaryText },
  predTrend: { ...typography.caption, color: colors.success },
  fitnessRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fitnessLabel: { ...typography.body, color: colors.primaryText, flex: 1 },
  fitnessChange: { ...typography.secondary, color: colors.primaryText, marginRight: 4 },
  fitnessArrow: { ...typography.caption, color: colors.secondaryText, marginRight: 4 },
  fitnessNow: { ...typography.title, color: colors.primaryText },
  whatLink: { ...typography.secondary, color: colors.accent, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 24, ...theme.cardShadow },
  modalTitle: { ...typography.title, color: colors.primaryText, marginBottom: 12 },
  modalBody: { ...typography.body, color: colors.secondaryText, marginBottom: 20 },
  modalBtn: { backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  modalBtnText: { ...typography.body, color: '#FFFFFF' },
});
