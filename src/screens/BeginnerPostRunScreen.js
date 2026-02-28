/**
 * Simplified post-run screen for beginner mode.
 * Celebrates completion and asks 3 simple questions.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { PrimaryButton } from '../components';
import { saveBeginnerCheckin, unlockMilestone } from '../services/beginnerCoaching';

const EFFORT_OPTIONS = [
  { key: 'really_hard', label: 'Really hard' },
  { key: 'hard', label: 'Hard' },
  { key: 'ok', label: 'OK' },
  { key: 'good', label: 'Good' },
  { key: 'easy', label: 'Easy' },
];

const COMPLETED_OPTIONS = [
  { key: 'all', label: 'Yes, all of it!' },
  { key: 'most', label: 'Most of it' },
  { key: 'some', label: 'Some of it' },
  { key: 'no', label: "No \u2014 that's OK too" },
];

const FEELING_OPTIONS = [
  { key: 'exhausted', label: 'Exhausted' },
  { key: 'tired_good', label: 'Tired but good' },
  { key: 'good', label: 'Good' },
  { key: 'energized', label: 'Energized' },
];

function getEncouragementMessage(effort, completed, feeling) {
  if (completed === 'all' && (feeling === 'good' || feeling === 'energized')) {
    return "Fantastic! Your body is already adapting \u2014 this will feel easier in 2 weeks. See you next session! \ud83c\udf89";
  }
  if (completed === 'all') {
    return "You did it! Every completed session builds your running foundation. Great work today. \ud83d\udcaa";
  }
  if (completed === 'no' || completed === 'some') {
    return "That's completely fine \u2014 every attempt counts. You showed up, and that's the hardest part. We'll adjust next session slightly. You're still on track. \u2764\ufe0f";
  }
  return "Nice work! You're building something amazing. Each run makes the next one a little easier. \ud83c\udf1f";
}

export function BeginnerPostRunScreen({ navigation, route }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [effort, setEffort] = useState(null);
  const [completed, setCompleted] = useState(null);
  const [feeling, setFeeling] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const encouragement = getEncouragementMessage(effort, completed, feeling);
  const userId = user?.id;
  const runNumber = route?.params?.runNumber || 0;

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    handleSave();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (userId) {
        await saveBeginnerCheckin(userId, {
          post_run_effort: effort,
          post_run_completed: completed,
          post_run_feeling: feeling,
          ai_encouragement: encouragement,
        });

        if (runNumber === 1) {
          await unlockMilestone(userId, 'first_run');
        }
      }
    } catch (_) {}
    setSaving(false);
    setDone(true);
  };

  const canContinue =
    (step === 0 && effort) ||
    (step === 1 && completed) ||
    (step === 2 && feeling);

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.doneScroll}>
          <Text style={styles.doneTitle}>Run complete! \ud83c\udf89</Text>
          <View style={styles.encouragementCard}>
            <Text style={styles.encouragementText}>"{encouragement}"</Text>
            <Text style={styles.encouragementAuthor}>\u2014 Coach BigBenjamin</Text>
          </View>
          <PrimaryButton title="Done" onPress={() => navigation.goBack()} style={styles.doneBtn} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Run complete! \ud83c\udf89</Text>

        {step === 0 && (
          <>
            <Text style={styles.question}>How did that feel?</Text>
            <View style={styles.optionsWrap}>
              {EFFORT_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.optionCard, effort === o.key && styles.optionCardSelected]}
                  onPress={() => setEffort(o.key)}
                >
                  <Text style={[styles.optionText, effort === o.key && styles.optionTextSelected]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.question}>Did you complete the full session?</Text>
            <View style={styles.optionsWrap}>
              {COMPLETED_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.optionCard, completed === o.key && styles.optionCardSelected]}
                  onPress={() => setCompleted(o.key)}
                >
                  <Text style={[styles.optionText, completed === o.key && styles.optionTextSelected]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.question}>How do you feel right now?</Text>
            <View style={styles.optionsWrap}>
              {FEELING_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.optionCard, feeling === o.key && styles.optionCardSelected]}
                  onPress={() => setFeeling(o.key)}
                >
                  <Text style={[styles.optionText, feeling === o.key && styles.optionTextSelected]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
          ))}
        </View>
        <PrimaryButton
          title={step < 2 ? 'Next' : 'Finish'}
          onPress={handleNext}
          disabled={!canContinue}
          loading={saving}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.screenPaddingHorizontal, paddingTop: 32, paddingBottom: 24 },
  doneScroll: { paddingHorizontal: spacing.screenPaddingHorizontal, paddingTop: 60, flex: 1, justifyContent: 'center' },

  title: { ...typography.largeTitle, color: colors.primaryText, marginBottom: 32, textAlign: 'center' },
  question: { ...typography.title, color: colors.primaryText, marginBottom: 20 },

  optionsWrap: { gap: 12 },
  optionCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 18, borderWidth: 2, borderColor: 'transparent', ...theme.cardShadow,
  },
  optionCardSelected: { borderColor: colors.beginnerGreen, backgroundColor: colors.beginnerGreenLight },
  optionText: { ...typography.body, fontSize: 18, color: colors.primaryText },
  optionTextSelected: { fontWeight: '600', color: colors.beginnerGreen },

  footer: {
    paddingHorizontal: spacing.screenPaddingHorizontal, paddingBottom: 32, paddingTop: 16,
    backgroundColor: colors.background,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.backgroundTertiary },
  dotActive: { backgroundColor: colors.beginnerGreen, width: 24 },

  doneTitle: { ...typography.largeTitle, fontSize: 32, color: colors.primaryText, textAlign: 'center', marginBottom: 32 },
  encouragementCard: {
    backgroundColor: colors.beginnerGreenLight, borderRadius: theme.radius.card,
    padding: 28, marginBottom: 32,
  },
  encouragementText: { ...typography.body, fontSize: 18, fontStyle: 'italic', color: colors.primaryText, lineHeight: 28, marginBottom: 12 },
  encouragementAuthor: { ...typography.secondary, color: colors.secondaryText },
  doneBtn: {},
});
