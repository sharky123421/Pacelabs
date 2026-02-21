import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';

const MESSAGES = [
  'Calculating your aerobic threshold...',
  'Estimating VO2 max...',
  'Identifying your training patterns...',
  'Analyzing injury risk indicators...',
  'Calibrating your pace zones...',
  'Generating your runner profile...',
];

export function OnboardingAIAnalysisScreen({ navigation }) {
  const { user } = useAuth();
  const [messageIndex, setMessageIndex] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => {
      setMessageIndex((i) => {
        if (i >= MESSAGES.length - 1) {
          clearInterval(t);
          setOnboardingStep(user?.id, ONBOARDING_STEPS.STEP_PROFILE_REVEAL).then(() => {
            navigation.replace('OnboardingProfileReveal');
          }).catch(() => navigation.replace('OnboardingProfileReveal'));
          return i;
        }
        return i + 1;
      });
    }, 1400);
    return () => clearInterval(t);
  }, [user?.id]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, useNativeDriver: true, duration: 800 }),
        Animated.timing(pulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoWrap, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>P</Text>
          </View>
        </Animated.View>
        <Text style={styles.title}>Building your runner profile</Text>
        <Text style={styles.subtitle}>Our AI is analyzing your data</Text>
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
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoWrap: {
    marginBottom: 32,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.secondaryText,
    marginBottom: 32,
    textAlign: 'center',
  },
  message: {
    ...typography.secondary,
    color: colors.primaryText,
    textAlign: 'center',
  },
});
