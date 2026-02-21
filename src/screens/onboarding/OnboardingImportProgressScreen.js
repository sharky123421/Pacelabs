import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';

const TOTAL = 203;
const FUN_FACTS = [
  "That's 1,247km of running data",
  "Your longest run was 32.4km",
  "You've been running since March 2022",
  "Calculating your fitness zones...",
  "Building your runner profile...",
];

export function OnboardingImportProgressScreen({ navigation }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = 4000;
    const interval = 80;
    const steps = Math.ceil(duration / interval);
    let step = 0;

    const t = setInterval(() => {
      step += 1;
      const value = Math.min((step / steps) * TOTAL, TOTAL);
      setCurrent(Math.floor(value));
      progressAnim.setValue(value / TOTAL);

      if (step >= steps) {
        clearInterval(t);
        setOnboardingStep(user?.id, ONBOARDING_STEPS.STEP_PROFILE_REVEAL).then(() => {
          navigation.replace('OnboardingProfileReveal');
        }).catch(() => {
          navigation.replace('OnboardingProfileReveal');
        });
      }
    }, interval);
    return () => clearInterval(t);
  }, [user?.id]);

  useEffect(() => {
    const t = setInterval(() => {
      setFactIndex((i) => (i + 1) % FUN_FACTS.length);
    }, 2200);
    return () => clearInterval(t);
  }, []);

  const widthInterpolate = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Analyzing your runs</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: widthInterpolate }]} />
        </View>
        <Text style={styles.counter}>
          Importing run {current} of {TOTAL}...
        </Text>
        <Text style={styles.funFact}>{FUN_FACTS[factIndex]}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPaddingHorizontal,
  },
  content: {
    paddingTop: 48,
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 24,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  counter: {
    ...typography.body,
    color: colors.secondaryText,
    marginBottom: 32,
  },
  funFact: {
    ...typography.secondary,
    color: colors.primaryText,
    fontStyle: 'italic',
  },
});
