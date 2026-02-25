import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { colors, typography, spacing, theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOnboardingProgress, setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';

const CARD_PADDING = 20;
const STRAVA_ORANGE = colors.stravaOrange;

export function OnboardingPathScreen({ navigation }) {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    getOnboardingProgress(user.id).then((progress) => {
      if (progress?.current_step === ONBOARDING_STEPS.STEP_COMPLETED) {
        navigation.replace('Main');
        return;
      }
      const step = progress?.current_step;
      if (step === ONBOARDING_STEPS.STEP_STRAVA_OAUTH) {
        navigation.replace('OnboardingStravaOAuth');
      } else if (step === ONBOARDING_STEPS.STEP_IMPORT_PROGRESS) {
        navigation.replace('OnboardingImportProgress');
      } else if (step === ONBOARDING_STEPS.STEP_QUESTIONNAIRE) {
        const qIndex = progress?.payload?.questionnaire_step ?? 1;
        navigation.replace('OnboardingQuestionnaire', { step: Number(qIndex) || 1 });
      } else if (step === ONBOARDING_STEPS.STEP_GPX_IMPORT) {
        navigation.replace('OnboardingGPXImport');
      } else if (step === ONBOARDING_STEPS.STEP_AI_ANALYSIS) {
        navigation.replace('OnboardingAIAnalysis');
      } else if (step === ONBOARDING_STEPS.STEP_PROFILE_REVEAL) {
        const isBeginner = progress?.payload?.runner_mode === 'beginner' || progress?.payload?.questionnaire_answers?._beginner_flow;
        navigation.replace('OnboardingProfileReveal', { beginner: !!isBeginner });
      } else if (step === ONBOARDING_STEPS.STEP_GOAL_SETTING) {
        navigation.replace('OnboardingGoalSetting');
      } else if (step === ONBOARDING_STEPS.STEP_PLAN_GENERATION) {
        const isBeginner2 = progress?.payload?.runner_mode === 'beginner' || progress?.payload?.questionnaire_answers?._beginner_flow;
        navigation.replace('OnboardingPlanGeneration', { beginner: !!isBeginner2 });
      }
    }).catch(() => {});
  }, [user?.id]);

  const handlePath = async (path) => {
    if (!user?.id) return;
    await setOnboardingStep(user.id, path === 'strava' ? ONBOARDING_STEPS.STEP_STRAVA_OAUTH : ONBOARDING_STEPS.STEP_QUESTIONNAIRE, { path });
    if (path === 'strava') {
      navigation.replace('OnboardingStravaOAuth');
    } else {
      navigation.replace('OnboardingQuestionnaire', { step: 1 });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Welcome to Pacelab</Text>
        <Text style={styles.subtitle}>How do you want to get started?</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => handlePath('strava')}
          activeOpacity={0.8}
        >
          <View style={styles.cardRow}>
            <View style={[styles.iconCircle, { backgroundColor: STRAVA_ORANGE + '20' }]}>
              <Text style={styles.stravaIcon}>S</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Connect Strava</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Recommended</Text>
                </View>
              </View>
              <Text style={styles.cardSubtitle}>
                Import all your runs instantly. No questionnaire needed.
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => handlePath('manual')}
          activeOpacity={0.8}
        >
          <View style={styles.cardRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={styles.manualIcon}>P</Text>
            </View>
            <View style={styles.cardTextBlock}>
              <Text style={styles.cardTitle}>Set up manually</Text>
              <Text style={styles.cardSubtitle}>
                Answer a few questions and optionally import Garmin files
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.footer}>
          You can always connect Strava later in settings
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondaryText,
    marginBottom: 32,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    padding: CARD_PADDING,
    marginBottom: spacing.betweenCards,
    ...theme.cardShadow,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stravaIcon: {
    fontSize: 22,
    fontWeight: '700',
    color: STRAVA_ORANGE,
  },
  manualIcon: {
    fontSize: 24,
  },
  cardTextBlock: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    ...typography.title,
    color: colors.primaryText,
  },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cardSubtitle: {
    ...typography.secondary,
    color: colors.secondaryText,
  },
  chevron: {
    fontSize: 24,
    color: colors.secondaryText,
    marginLeft: 8,
  },
  footer: {
    ...typography.caption,
    color: colors.secondaryText,
    marginTop: 24,
    textAlign: 'center',
  },
});
