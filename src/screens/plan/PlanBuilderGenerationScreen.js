import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { colors, typography, spacing } from '../../theme';
import { savePlanToSupabase, savePlanConversation } from '../../services/planBuilder';
import { runFullCoachingPipeline, generateCoachingPlan } from '../../services/coachingEngine';

let ConfettiCannon = null;
try {
  ConfettiCannon = require('react-native-confetti-cannon').default;
} catch (_) {}

const STATUS_MESSAGES = [
  'Analyzing your fitness data...',
  'Calculating CTL, ATL and recovery metrics...',
  'Detecting bottlenecks in your training...',
  'Selecting optimal training philosophy...',
  'Building personalized plan with Groq AI...',
  'Structuring weekly sessions...',
  'Adding coaching notes and pace targets...',
  'Validating plan against your physiology...',
  'Your plan is ready.',
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function PlanBuilderGenerationScreen({ navigation, route }) {
  const { user } = useAuth();
  const userData = route.params?.userData;
  const userAnswers = route.params?.userAnswers || {};
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (!user?.id || !userData) {
      setError('Missing user data');
      return;
    }

    let cancelled = false;
    let messageInterval;

    const run = async () => {
      const advanceMessage = () => {
        setMessageIndex((i) => {
          if (i >= STATUS_MESSAGES.length - 1) return i;
          return i + 1;
        });
      };

      messageInterval = setInterval(() => {
        if (cancelled) return;
        setMessageIndex((i) => {
          if (i >= STATUS_MESSAGES.length - 1) {
            clearInterval(messageInterval);
            return i;
          }
          return i + 1;
        });
      }, 1400);

      try {
        await runFullCoachingPipeline(user.id).catch(() => {});
        if (cancelled) return;
        advanceMessage();

        const result = await generateCoachingPlan(user.id, {
          goal: userAnswers.goal,
          raceDate: userAnswers.raceDate,
          goalTime: userAnswers.goalTime,
          trainingDays: userAnswers.trainingDays,
          longRunDay: userAnswers.longRunDay,
          trackAccess: userAnswers.trackAccess,
          preferredSessions: userAnswers.sessionPreferences,
          daysPerWeek: userAnswers.daysPerWeek,
          injuries: userAnswers.injuries,
          volumePreference: userAnswers.volumePreference,
        });
        if (cancelled) return;

        setMessageIndex(STATUS_MESSAGES.length - 1);
        setDone(true);
        clearInterval(messageInterval);

        const planId = result?.plan_id;
        if (planId) {
          await savePlanConversation(user.id, planId, [], userAnswers).catch(() => {});
        }

        if (cancelled) return;
        setTimeout(() => {
          navigation.getParent()?.navigate('PlanTab');
          navigation.reset({
            index: 0,
            routes: [{ name: 'PlanList' }],
          });
        }, 2200);
      } catch (e) {
        clearInterval(messageInterval);
        setError(e.message || 'Failed to generate plan');
      }
    };

    run();
    return () => {
      cancelled = true;
      if (messageInterval) clearInterval(messageInterval);
    };
  }, [user?.id, userData, userAnswers, navigation]);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{error}</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Go back and try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>P</Text>
          </View>
        </Animated.View>
        <Text style={styles.statusMessage}>{STATUS_MESSAGES[messageIndex]}</Text>
        {done && ConfettiCannon ? (
          <ConfettiCannon
            count={200}
            origin={{ x: SCREEN_WIDTH / 2, y: -20 }}
            explosionSpeed={350}
            fallSpeed={3000}
            fadeOut
            autoStart
          />
        ) : done ? (
          <View style={styles.confettiWrap} pointerEvents="none">
            <Text style={styles.confettiEmoji}>Done</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.screenPaddingHorizontal,
  },
  iconWrap: {
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: colors.link,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
  },
  retryBtnText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statusMessage: {
    ...typography.body,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  confettiWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confettiEmoji: {
    fontSize: 80,
  },
});
