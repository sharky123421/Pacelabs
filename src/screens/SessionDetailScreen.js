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
} from 'react-native';
import { colors, typography, spacing, theme } from '../theme';
import { PrimaryButton, SecondaryButton } from '../components';

const SESSION_COLORS = {
  easy: colors.sessionEasy,
  tempo: colors.sessionTempo,
  intervals: colors.sessionIntervals,
  long: colors.sessionLong,
  race: colors.sessionRace,
  rest: colors.sessionRest,
};

const PHASES = [
  { phase: 'Warm-up', distance: '2 km', pace: 'Easy pace', zone: 'Zone 1–2' },
  { phase: 'Main set', distance: '6 km', pace: 'Threshold pace', zone: 'Zone 3–4' },
  { phase: 'Cool-down', distance: '2 km', pace: 'Easy pace', zone: 'Zone 1–2' },
];

const SIMILAR_RUNS = [
  { date: '12 Feb 2026', distance: '10.1 km', pace: '4:52 /km', hr: '159 bpm' },
  { date: '5 Feb 2026', distance: '10.0 km', pace: '4:55 /km', hr: '156 bpm' },
];

const SWAP_OPTIONS = [
  'Make easier (reduce distance by 20%, lower pace target)',
  'Make harder (increase distance by 10%, higher pace target)',
  'Swap to tomorrow',
  'Replace with easy run',
  'Mark as rest day',
];

export function SessionDetailScreen({ route, navigation }) {
  const session = route?.params?.session || {
    day: 'THU',
    date: 'Feb 19',
    type: 'tempo',
    label: 'TEMPO RUN',
    distance: '10 km',
    target: '4:48–4:55 /km · Zone 3–4',
  };
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const color = SESSION_COLORS[session.type] || colors.accent;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.badgeHeader, { backgroundColor: color + '20' }]}>
          <Text style={[styles.badgeHeaderText, { color }]}>{session.label}</Text>
          <Text style={styles.badgeHeaderDate}>{session.date}</Text>
        </View>

        {/* OVERVIEW CARD */}
        <View style={styles.card}>
          <Text style={styles.bigDistance}>{session.distance}</Text>
          <Text style={styles.targetPace}>{session.target}</Text>
          <Text style={styles.meta}>Target HR: Zone 3–4 · 148–165 bpm</Text>
          <Text style={styles.meta}>Estimated duration: ~49 min</Text>
          <Text style={styles.meta}>TSS estimate: 72</Text>
        </View>

        {/* COACH NOTES */}
        <View style={[styles.card, styles.coachCard]}>
          <Text style={styles.coachTitle}>Coach Notes</Text>
          <Text style={styles.coachText}>
            This is your key quality session this week. After a 2km warm-up at easy pace, build to threshold for the middle 6km, then 2km cool-down. Don't start too fast — let HR climb naturally into zone 3 before pushing to zone 4.
          </Text>
        </View>

        {/* SESSION STRUCTURE */}
        <Text style={styles.sectionTitle}>SESSION STRUCTURE</Text>
        {PHASES.map((p) => (
          <View key={p.phase} style={styles.phaseCard}>
            <Text style={styles.phaseName}>{p.phase}</Text>
            <Text style={styles.phaseDetail}>{p.distance} · {p.pace} · {p.zone}</Text>
          </View>
        ))}

        {/* PURPOSE */}
        <View style={styles.card}>
          <Text style={styles.purposeTitle}>Why this session?</Text>
          <Text style={styles.purposeText}>
            Tempo runs develop your lactate threshold — the key determinant of marathon performance. This is week 8 of 16 so intensity is ramping up.
          </Text>
        </View>

        {/* SIMILAR PAST SESSIONS */}
        <Text style={styles.sectionTitle}>HOW YOU'VE DONE THIS BEFORE</Text>
        {SIMILAR_RUNS.map((r, i) => (
          <TouchableOpacity key={i} style={styles.similarRow} onPress={() => navigation.navigate('RunsTab', { screen: 'RunDetail', params: { runId: i } })}>
            <Text style={styles.similarDate}>{r.date}</Text>
            <Text style={styles.similarDetail}>{r.distance} · {r.pace} · {r.hr}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}

        {/* ACTIONS */}
        <PrimaryButton title="Start this run" onPress={() => {}} style={styles.startBtn} />
        <SecondaryButton title="Swap session" onPress={() => setSwapModalVisible(true)} style={styles.secondaryBtn} />
        <SecondaryButton title="Mark as rest day" onPress={() => {}} style={styles.secondaryBtn} />
      </ScrollView>

      {/* SWAP MODAL */}
      <Modal visible={swapModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setSwapModalVisible(false)}>
          <Pressable style={styles.swapSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.swapTitle}>Swap session</Text>
            <View style={[styles.aiSuggestion, { backgroundColor: colors.accent + '15' }]}>
              <Text style={styles.aiSuggestionText}>Given your current fatigue, we suggest making this easier today.</Text>
            </View>
            {SWAP_OPTIONS.map((opt, i) => (
              <TouchableOpacity key={i} style={styles.swapOption} onPress={() => setSwapModalVisible(false)}>
                <Text style={styles.swapOptionText}>{opt}</Text>
              </TouchableOpacity>
            ))}
            <SecondaryButton title="Cancel" onPress={() => setSwapModalVisible(false)} style={styles.swapCancel} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.screenPaddingHorizontal, paddingBottom: 40 },
  badgeHeader: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginBottom: 20 },
  badgeHeaderText: { ...typography.title, fontSize: 18 },
  badgeHeaderDate: { ...typography.caption, color: colors.secondaryText, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: theme.radius.card, padding: 20, marginBottom: 16, ...theme.cardShadow },
  bigDistance: { ...typography.largeTitle, fontSize: 28, color: colors.primaryText },
  targetPace: { ...typography.body, color: colors.primaryText, marginTop: 4 },
  meta: { ...typography.secondary, color: colors.secondaryText, marginTop: 4 },
  coachCard: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  coachTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  coachText: { ...typography.body, color: colors.primaryText },
  sectionTitle: { ...typography.caption, color: colors.secondaryText, letterSpacing: 1, marginBottom: 12, marginTop: 8 },
  phaseCard: { backgroundColor: colors.backgroundSecondary, borderRadius: 10, padding: 14, marginBottom: 8 },
  phaseName: { ...typography.body, fontWeight: '600', color: colors.primaryText },
  phaseDetail: { ...typography.secondary, color: colors.secondaryText, marginTop: 4 },
  purposeTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  purposeText: { ...typography.body, color: colors.primaryText },
  similarRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  similarDate: { ...typography.secondary, color: colors.primaryText, width: 100 },
  similarDetail: { flex: 1, ...typography.caption, color: colors.secondaryText },
  chevron: { ...typography.body, color: colors.secondaryText },
  startBtn: { marginTop: 24, marginBottom: 12, minHeight: 56, borderRadius: 14 },
  secondaryBtn: { marginBottom: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  swapSheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  swapTitle: { ...typography.title, color: colors.primaryText, marginBottom: 16 },
  aiSuggestion: { padding: 14, borderRadius: 10, marginBottom: 16 },
  aiSuggestionText: { ...typography.body, color: colors.primaryText },
  swapOption: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  swapOptionText: { ...typography.body, color: colors.primaryText },
  swapCancel: { marginTop: 16 },
});
