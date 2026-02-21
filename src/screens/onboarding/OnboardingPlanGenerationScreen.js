import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';

const MESSAGES = [
  'Analyzing your fitness level...',
  'Calculating weekly load progression...',
  'Building Base phase (weeks 1–6)...',
  'Building Build phase (weeks 7–12)...',
  'Adding peak and taper phases...',
  'Your plan is ready.',
];

export function OnboardingPlanGenerationScreen({ navigation }) {
  const { user } = useAuth();
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setMessageIndex((i) => {
        if (i >= MESSAGES.length - 1) {
          clearInterval(t);
          setOnboardingStep(user?.id, ONBOARDING_STEPS.STEP_COMPLETED).then(() => {
            navigation.replace('Main');
          }).catch(() => navigation.replace('Main'));
          return i;
        }
        return i + 1;
      });
    }, 1200);
    return () => clearInterval(t);
  }, [user?.id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Creating your training plan</Text>
        <Text style={styles.message}>{MESSAGES[messageIndex]}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPaddingHorizontal,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 32,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.secondaryText,
    textAlign: 'center',
  },
});
