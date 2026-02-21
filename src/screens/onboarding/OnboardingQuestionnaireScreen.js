import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { colors, typography, spacing, theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOnboardingProgress, updateOnboardingPayload, setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';
import { PrimaryButton } from '../../components';
import { QUESTIONS, TOTAL_QUESTIONS } from './onboardingQuestions';

const QUESTIONNAIRE_PAYLOAD_KEY = 'questionnaire_answers';

function SliderQuestion({ min, max, unit, value, onValueChange }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    setV(value);
  }, [value]);
  useEffect(() => {
    onValueChange(v);
  }, [v]);
  const num = Math.min(max, Math.max(min, Number(v) || min));
  return (
    <View style={styles.sliderWrap}>
      <Text style={styles.sliderValue}>{Math.round(num)} {unit}</Text>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${((num - min) / (max - min)) * 100}%` }]} />
      </View>
      <TextInput
        style={styles.sliderInput}
        value={String(Math.round(num))}
        onChangeText={(t) => setV(Number(t) || min)}
        keyboardType="number-pad"
      />
    </View>
  );
}

function getQuestionByStep(step) {
  const i = Math.min(step - 1, QUESTIONS.length - 1);
  return { index: i, q: QUESTIONS[i] };
}

export function OnboardingQuestionnaireScreen({ route, navigation }) {
  const stepParam = route?.params?.step ?? 1;
  const { user } = useAuth();
  const [step, setStep] = useState(stepParam);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const { index, q } = getQuestionByStep(step);
  const progressCount = step;
  const totalVisible = TOTAL_QUESTIONS;
  const isSkippable = q?.skippable;
  const canContinue = (q?.type === 'cards' || q?.type === 'grid') ? !!selected : true;
  const isLast = step >= TOTAL_QUESTIONS;

  useEffect(() => {
    if (!user?.id) return;
    getOnboardingProgress(user.id).then((p) => {
      const payload = p?.payload ?? {};
      const loaded = payload[QUESTIONNAIRE_PAYLOAD_KEY] ?? {};
      setAnswers(loaded);
      const qForStep = QUESTIONS[stepParam - 1];
      if (qForStep) setSelected(loaded[qForStep.id] ?? null);
    }).catch(() => {});
  }, [user?.id]);

  const saveAndContinue = async (nextStep, overrideAnswer) => {
    if (!user?.id) return;
    const newAnswers = overrideAnswer ? { ...answers, ...overrideAnswer } : answers;
    setLoading(true);
    try {
      await updateOnboardingPayload(user.id, {
        [QUESTIONNAIRE_PAYLOAD_KEY]: newAnswers,
        questionnaire_step: Math.min(nextStep, TOTAL_QUESTIONS),
      });
      setAnswers(newAnswers);
      if (nextStep > TOTAL_QUESTIONS) {
        await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_GPX_IMPORT);
        navigation.replace('OnboardingGPXImport');
      } else {
        setStep(nextStep);
        setSelected(QUESTIONS[nextStep - 1] ? (newAnswers[QUESTIONS[nextStep - 1].id] ?? null) : null);
      }
    } catch (e) {}
    setLoading(false);
  };

  const handleContinue = () => {
    if (q?.type === 'cards' || q?.type === 'grid') {
      saveAndContinue(step + 1, { [q.id]: selected });
    } else if (q?.type === 'slider') {
      saveAndContinue(step + 1, { [q.id]: answers[q.id] ?? q.min });
    } else {
      saveAndContinue(step + 1);
    }
  };

  const handleSkip = () => {
    saveAndContinue(step + 1, { [q.id]: null });
  };

  const handleBack = () => {
    if (step <= 1) {
      navigation.goBack();
    } else {
      setStep(step - 1);
      setSelected(answers[QUESTIONS[step - 2]?.id] ?? null);
    }
  };

  if (!q) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const renderOptions = () => {
    if (q.type === 'cards' && q.options) {
      return (
        <View style={styles.cardsWrap}>
          {q.options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.card, selected === opt && styles.cardSelected]}
              onPress={() => setSelected(opt)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cardText, selected === opt && styles.cardTextSelected]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    if (q.type === 'grid' && q.options) {
      return (
        <View style={styles.grid}>
          {q.options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.gridCard, selected === opt && styles.cardSelected]}
              onPress={() => setSelected(opt)}
              activeOpacity={0.8}
            >
              <Text style={[styles.cardText, selected === opt && styles.cardTextSelected]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    if (q.type === 'slider') {
      const val = answers[q.id] ?? q.min ?? 0;
      return (
        <SliderQuestion
          min={q.min}
          max={q.max}
          unit={q.unit}
          value={val}
          onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
        />
      );
    }
    if (q.type === 'pace' || q.type === 'race_times' || q.type === 'date' || q.type === 'goal_time') {
      return (
        <View style={styles.placeholderBlock}>
          <Text style={styles.placeholderText}>Answer saved when you continue or skip.</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(progressCount / totalVisible) * 100}%` }]} />
      </View>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.chevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>{progressCount}/{totalVisible}</Text>
        {isSkippable ? (
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipBtn} />
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{q.question}</Text>
        {q.subtitle ? <Text style={styles.subtitle}>{q.subtitle}</Text> : null}
        {renderOptions()}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton
          title="Continue"
          onPress={handleContinue}
          disabled={!canContinue}
          loading={loading}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.backgroundSecondary,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  chevron: {
    fontSize: 28,
    color: colors.accent,
  },
  stepLabel: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  skipBtn: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
  skipText: {
    ...typography.body,
    color: colors.secondaryText,
  },
  scroll: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: 24,
    paddingBottom: 24,
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondaryText,
    marginBottom: 24,
  },
  cardsWrap: {
    gap: spacing.betweenCards,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    padding: CARD_PADDING,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.cardShadow,
  },
  cardSelected: {
    borderColor: colors.accent,
  },
  cardText: {
    ...typography.body,
    color: colors.primaryText,
  },
  cardTextSelected: {
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.cardShadow,
  },
  sliderWrap: {
    marginTop: 16,
  },
  sliderValue: {
    ...typography.title,
    color: colors.primaryText,
    marginBottom: 8,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 12,
  },
  sliderFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  sliderInput: {
    ...typography.body,
    color: colors.primaryText,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: theme.radius.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: 80,
  },
  placeholderBlock: {
    marginTop: 16,
  },
  placeholderText: {
    ...typography.secondary,
    color: colors.secondaryText,
  },
  footer: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingBottom: 32,
    paddingTop: 16,
  },
});

const CARD_PADDING = 20;
