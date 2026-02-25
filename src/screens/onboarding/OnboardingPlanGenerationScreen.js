import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';

const MESSAGES_ADVANCED = [
  'Analyzing your fitness level...',
  'Calculating weekly load progression...',
  'Building Base phase (weeks 1\u20136)...',
  'Building Build phase (weeks 7\u201312)...',
  'Adding peak and taper phases...',
  'Your plan is ready.',
];

const MESSAGES_BEGINNER = [
  'Setting up your 8-week journey...',
  'Building run/walk intervals for week 1...',
  'Planning your gradual progression...',
  'Adding encouraging coach notes...',
  'Almost there...',
  "Your plan is ready \u2014 let's go! \ud83c\udfc3",
];

export function OnboardingPlanGenerationScreen({ route, navigation }) {
  const { user } = useAuth();
  const isBeginner = route?.params?.beginner === true;
  const MESSAGES = isBeginner ? MESSAGES_BEGINNER : MESSAGES_ADVANCED;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setMessageIndex((i) => {
        if (i >= MESSAGES.length - 1) {
          clearInterval(t);
          const uid = user?.id;
          if (uid) {
            setOnboardingStep(uid, ONBOARDING_STEPS.STEP_COMPLETED).then(() => {
              navigation.replace('Main');
            }).catch(() => navigation.replace('Main'));
          } else {
            navigation.replace('Main');
          }
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
        <Text style={styles.title}>
          {isBeginner ? 'Building your running journey' : 'Creating your training plan'}
        </Text>
        <Text style={styles.message}>{MESSAGES[messageIndex]}</Text>
        {isBeginner && (
          <Text style={styles.hint}>This will only take a moment</Text>
        )}
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
  hint: {
    ...typography.caption,
    color: colors.tertiaryText,
    marginTop: 16,
  },
});
