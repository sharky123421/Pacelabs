import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
} from 'react-native';
import { colors, typography, spacing, theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS, updateOnboardingPayload } from '../../lib/onboarding';
import { supabase } from '../../lib/supabase';
import { PrimaryButton } from '../../components';

const ADVANCED_METRICS = [
  { label: 'Estimated VO2 Max', value: '52.4' },
  { label: 'Threshold Pace', value: '4:52 /km' },
  { label: 'Easy Pace Zone', value: '5:45\u20136:20 /km' },
  { label: 'Weekly Volume', value: '~54 km/week' },
];
const STRENGTHS = ['Strong aerobic base', 'High consistency'];
const WEAKNESSES = ['Speed work underrepresented'];
const AI_QUOTE = "You're a high-mileage aerobic runner with an undertrained lactate threshold. Classic marathon build profile.";

const BEGINNER_ITEMS = [
  { label: 'Goal', value: 'Complete your first 5K' },
  { label: 'Training days', value: '3 days per week' },
  { label: 'Plan length', value: '8 weeks to your first 5K' },
  { label: 'First session', value: 'Run/walk 20 minutes' },
];
const BEGINNER_QUOTE = "Everyone starts somewhere. Your only job right now is to show up 3 times this week. We\u2019ll handle the rest.";

export function OnboardingProfileRevealScreen({ route, navigation }) {
  const { user } = useAuth();
  const isBeginner = route?.params?.beginner === true;
  const [showButton, setShowButton] = useState(false);

  const items = isBeginner ? BEGINNER_ITEMS : ADVANCED_METRICS;
  const anims = useRef(items.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const delay = 300;
    anims.forEach((a, i) => {
      Animated.timing(a, {
        toValue: 1,
        useNativeDriver: true,
        duration: 280,
        delay: 400 + i * delay,
      }).start();
    });
    const t = setTimeout(() => setShowButton(true), 400 + items.length * delay + 400);
    return () => clearTimeout(t);
  }, []);

  const handleContinue = async () => {
    if (!user?.id) return;

    if (isBeginner) {
      await supabase
        .from('profiles')
        .update({
          runner_mode: 'beginner',
          beginner_started_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .then(() => {})
        .catch(() => {});

      await updateOnboardingPayload(user.id, { runner_mode: 'beginner' });
      await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_PLAN_GENERATION);
      navigation.replace('OnboardingPlanGeneration', { beginner: true });
    } else {
      await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_GOAL_SETTING);
      navigation.replace('OnboardingGoalSetting');
    }
  };

  if (isBeginner) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.beginnerTitle}>You're ready to start \ud83c\udfc3</Text>
          <Text style={styles.beginnerSubtitle}>Here's your beginner runner profile</Text>

          <View style={styles.beginnerGrid}>
            {BEGINNER_ITEMS.map((m, i) => (
              <Animated.View
                key={m.label}
                style={[
                  styles.beginnerCard,
                  {
                    opacity: anims[i],
                    transform: [{
                      translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
                    }],
                  },
                ]}
              >
                <Text style={styles.beginnerCardLabel}>{m.label}</Text>
                <Text style={styles.beginnerCardValue}>{m.value}</Text>
              </Animated.View>
            ))}
          </View>

          <View style={styles.beginnerQuoteCard}>
            <Text style={styles.beginnerQuoteText}>"{BEGINNER_QUOTE}"</Text>
            <Text style={styles.beginnerQuoteAuthor}>\u2014 Coach BigBenjamin</Text>
          </View>

          {showButton && (
            <PrimaryButton
              title="Start my journey \u2192"
              onPress={handleContinue}
              style={styles.cta}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your Runner Profile</Text>
        <Text style={styles.subtitle}>Based on your answers</Text>

        <View style={styles.levelCard}>
          <Text style={styles.levelBadge}>INTERMEDIATE RUNNER</Text>
        </View>

        <View style={styles.grid}>
          {ADVANCED_METRICS.map((m, i) => (
            <Animated.View
              key={m.label}
              style={[
                styles.metricCard,
                {
                  opacity: anims[i],
                  transform: [{
                    translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
                  }],
                },
              ]}
            >
              <Text style={styles.metricLabel}>{m.label}</Text>
              <Text style={styles.metricValue}>{m.value}</Text>
            </Animated.View>
          ))}
        </View>

        <View style={styles.pillsSection}>
          <Text style={styles.pillsTitle}>Strengths</Text>
          <View style={styles.pillRow}>
            {STRENGTHS.map((s) => (
              <View key={s} style={[styles.pill, styles.pillSuccess]}>
                <Text style={styles.pillText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.pillsSection}>
          <Text style={styles.pillsTitle}>Areas to improve</Text>
          <View style={styles.pillRow}>
            {WEAKNESSES.map((s) => (
              <View key={s} style={[styles.pill, styles.pillWarning]}>
                <Text style={styles.pillText}>{s}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.quote}>"{AI_QUOTE}"</Text>

        {showButton && (
          <PrimaryButton
            title="Build my training plan \u2192"
            onPress={handleContinue}
            style={styles.cta}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.screenPaddingHorizontal, paddingTop: 24, paddingBottom: 40 },

  title: { ...typography.largeTitle, color: colors.primaryText, marginBottom: 8 },
  subtitle: { ...typography.body, color: colors.secondaryText, marginBottom: 24 },
  levelCard: {
    backgroundColor: colors.backgroundSecondary, borderRadius: theme.radius.card,
    padding: 20, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: colors.accent,
  },
  levelBadge: { ...typography.title, color: colors.accent, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  metricCard: {
    width: '48%', backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 16, ...theme.cardShadow,
  },
  metricLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 4 },
  metricValue: { ...typography.title, color: colors.primaryText },
  pillsSection: { marginBottom: 16 },
  pillsTitle: { ...typography.secondary, color: colors.secondaryText, marginBottom: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pillSuccess: { backgroundColor: colors.success + '25' },
  pillWarning: { backgroundColor: colors.warning + '25' },
  pillText: { ...typography.caption, color: colors.primaryText },
  quote: { ...typography.body, fontStyle: 'italic', color: colors.primaryText, textAlign: 'center', marginBottom: 32 },
  cta: { minHeight: 56, borderRadius: 14 },

  beginnerTitle: { ...typography.largeTitle, color: colors.primaryText, marginBottom: 8 },
  beginnerSubtitle: { ...typography.body, color: colors.secondaryText, marginBottom: 28 },
  beginnerGrid: { gap: 12, marginBottom: 28 },
  beginnerCard: {
    backgroundColor: colors.card, borderRadius: theme.radius.card,
    padding: 20, borderLeftWidth: 4, borderLeftColor: colors.beginnerGreen, ...theme.cardShadow,
  },
  beginnerCardLabel: { ...typography.caption, color: colors.secondaryText, marginBottom: 4 },
  beginnerCardValue: { ...typography.title, color: colors.primaryText },
  beginnerQuoteCard: {
    backgroundColor: colors.beginnerGreenLight, borderRadius: theme.radius.card,
    padding: 24, marginBottom: 32,
  },
  beginnerQuoteText: { ...typography.body, fontStyle: 'italic', color: colors.primaryText, lineHeight: 24, marginBottom: 8 },
  beginnerQuoteAuthor: { ...typography.caption, color: colors.secondaryText },
});
