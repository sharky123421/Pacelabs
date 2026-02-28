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
  Alert,
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

const SWAP_OPTIONS = [
  'Make easier (reduce distance, lower pace)',
  'Make harder (increase distance, higher pace)',
  'Swap to tomorrow',
  'Replace with easy run',
  'Mark as rest day',
];

export function SessionDetailScreen({ route, navigation }) {
  const session = route?.params?.session;
  const [swapModalVisible, setSwapModalVisible] = useState(false);

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No session data</Text>
          <SecondaryButton title="Go back" onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  const color = SESSION_COLORS[session.type] || colors.accent;

  const handleStartRun = () => {
    Alert.alert('Start Run', 'GPS run tracking will be available in the next update. Log your run manually from the Runs tab after you finish.');
  };

  const handleRestDay = () => {
    Alert.alert(
      'Mark as rest day?',
      'This session will be skipped. You can always add it back from your plan.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as rest', onPress: () => navigation.goBack() },
      ]
    );
  };

  const handleSwapOption = (opt) => {
    setSwapModalVisible(false);
    if (opt.includes('rest day')) {
      handleRestDay();
    } else {
      Alert.alert('Session adjusted', 'Coach BigBenjamin will apply this change to your plan.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.badgeHeader, { backgroundColor: color + '20' }]}>
          <Text style={[styles.badgeHeaderText, { color }]}>{session.label || session.type?.toUpperCase() || 'SESSION'}</Text>
          <Text style={styles.badgeHeaderDate}>{session.date || ''}</Text>
        </View>

        {/* OVERVIEW CARD */}
        <View style={styles.card}>
          <Text style={styles.bigDistance}>{session.distance || session.distance_km ? `${session.distance_km} km` : '\u2014'}</Text>
          {session.target && <Text style={styles.targetPace}>{session.target}</Text>}
          {session.target_pace_min && session.target_pace_max && (
            <Text style={styles.targetPace}>Target: {session.target_pace_min}\u2013{session.target_pace_max} /km</Text>
          )}
          {session.hr_zone && <Text style={styles.meta}>Target HR: {session.hr_zone}</Text>}
          {session.duration_min && <Text style={styles.meta}>Estimated duration: ~{session.duration_min} min</Text>}
        </View>

        {/* COACH NOTES */}
        {(session.briefing || session.coach_notes) && (
          <View style={[styles.card, styles.coachCard]}>
            <Text style={styles.coachTitle}>Coach BigBenjamin</Text>
            <Text style={styles.coachText}>{session.briefing || session.coach_notes}</Text>
          </View>
        )}

        {/* PURPOSE */}
        {session.purpose && (
          <View style={styles.card}>
            <Text style={styles.purposeTitle}>Why this session?</Text>
            <Text style={styles.purposeText}>{session.purpose}</Text>
          </View>
        )}

        {/* ACTIONS */}
        <PrimaryButton title="Start this run" onPress={handleStartRun} style={styles.startBtn} />
        <SecondaryButton title="Swap session" onPress={() => setSwapModalVisible(true)} style={styles.secondaryBtn} />
        <SecondaryButton title="Mark as rest day" onPress={handleRestDay} style={styles.secondaryBtn} />
      </ScrollView>

      {/* SWAP MODAL */}
      <Modal visible={swapModalVisible} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setSwapModalVisible(false)}>
          <Pressable style={styles.swapSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.swapTitle}>Swap session</Text>
            {SWAP_OPTIONS.map((opt, i) => (
              <TouchableOpacity key={i} style={styles.swapOption} onPress={() => handleSwapOption(opt)}>
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
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...typography.body, color: colors.secondaryText },
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
  purposeTitle: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  purposeText: { ...typography.body, color: colors.primaryText },
  startBtn: { marginTop: 24, marginBottom: 12, minHeight: 56, borderRadius: 14 },
  secondaryBtn: { marginBottom: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  swapSheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  swapTitle: { ...typography.title, color: colors.primaryText, marginBottom: 16 },
  swapOption: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  swapOptionText: { ...typography.body, color: colors.primaryText },
  swapCancel: { marginTop: 16 },
});
