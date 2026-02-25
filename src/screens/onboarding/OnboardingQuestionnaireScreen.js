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
import { QUESTIONS, TOTAL_QUESTIONS, BEGINNER_TRIGGERS } from './onboardingQuestions';
import { BEGINNER_QUESTIONS, TOTAL_BEGINNER_QUESTIONS } from './beginnerQuestions';

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

export function OnboardingQuestionnaireScreen({ route, navigation }) {
  const stepParam = route?.params?.step ?? 1;
  const { user } = useAuth();
  const [step, setStep] = useState(stepParam);
  const [answers, setAnswers] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isBeginnerFlow, setIsBeginnerFlow] = useState(false);

  const questions = isBeginnerFlow ? BEGINNER_QUESTIONS : QUESTIONS;
  const totalQ = isBeginnerFlow ? TOTAL_BEGINNER_QUESTIONS : TOTAL_QUESTIONS;

  const index = Math.min(step - 1, questions.length - 1);
  const q = questions[index];
  const progressCount = step;
  const isSkippable = q?.skippable;
  const canContinue = (q?.type === 'cards' || q?.type === 'grid') ? !!selected : true;
  const isLast = step >= totalQ;

  useEffect(() => {
    if (!user?.id) return;
    getOnboardingProgress(user.id).then((p) => {
      const payload = p?.payload ?? {};
      const loaded = payload[QUESTIONNAIRE_PAYLOAD_KEY] ?? {};
      setAnswers(loaded);
      if (loaded._beginner_flow) setIsBeginnerFlow(true);
      const qForStep = questions[stepParam - 1];
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
        questionnaire_step: Math.min(nextStep, totalQ),
      });
      setAnswers(newAnswers);
      if (nextStep > totalQ) {
        if (isBeginnerFlow) {
          await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_PROFILE_REVEAL);
          navigation.replace('OnboardingProfileReveal', { beginner: true });
        } else {
          await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_GPX_IMPORT);
          navigation.replace('OnboardingGPXImport');
        }
      } else {
        setStep(nextStep);
        const nextQ = questions[nextStep - 1];
        setSelected(nextQ ? (newAnswers[nextQ.id] ?? null) : null);
      }
    } catch (e) {}
    setLoading(false);
  };

  const handleContinue = () => {
    if (!isBeginnerFlow && step === 1 && (q?.type === 'cards' || q?.type === 'grid')) {
      const answer = selected;
      if (answer && BEGINNER_TRIGGERS.includes(answer)) {
        const newAnswers = { ...answers, [q.id]: answer, _beginner_flow: true };
        setAnswers(newAnswers);
        setIsBeginnerFlow(true);
        setStep(1);
        setSelected(null);
        updateOnboardingPayload(user.id, {
          [QUESTIONNAIRE_PAYLOAD_KEY]: newAnswers,
          questionnaire_step: 1,
        }).catch(() => {});
        return;
      }
    }

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
      if (isBeginnerFlow) {
        setIsBeginnerFlow(false);
        setStep(1);
        setSelected(answers['running_experience'] ?? null);
      } else {
        navigation.goBack();
      }
    } else {
      setStep(step - 1);
      setSelected(answers[questions[step - 2]?.id] ?? null);
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
    if (q.type === 'pace') {
      return (
        <View style={styles.paceInputWrap}>
          <TextInput
            style={styles.paceInput}
            placeholder="e.g. 6:00"
            placeholderTextColor={colors.secondaryText}
            value={answers[q.id] || ''}
            onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.paceUnit}>min/km</Text>
        </View>
      );
    }
    if (q.type === 'race_times') {
      const rows = q.rows || [];
      const raceData = answers[q.id] || {};
      return (
        <View>
          {rows.map((race) => (
            <View key={race} style={styles.raceTimeRow}>
              <Text style={styles.raceTimeLabel}>{race}</Text>
              <TextInput
                style={styles.raceTimeInput}
                placeholder="e.g. 25:00"
                placeholderTextColor={colors.secondaryText}
                value={raceData[race] || ''}
                onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: { ...(a[q.id] || {}), [race]: v } }))}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          ))}
        </View>
      );
    }
    if (q.type === 'date') {
      return (
        <View>
          <TextInput
            style={styles.dateInput}
            placeholder="e.g. June 2026"
            placeholderTextColor={colors.secondaryText}
            value={answers[q.id] || ''}
            onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          />
          {q.noDateOption && (
            <TouchableOpacity style={styles.noDateBtn} onPress={() => setAnswers((a) => ({ ...a, [q.id]: 'No specific date' }))}>
              <Text style={styles.noDateText}>No specific date yet</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    if (q.type === 'goal_time') {
      return (
        <View>
          <TextInput
            style={styles.dateInput}
            placeholder="e.g. 1:45:00"
            placeholderTextColor={colors.secondaryText}
            value={answers[q.id] || ''}
            onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            keyboardType="numbers-and-punctuation"
          />
          {q.justFinish && (
            <TouchableOpacity style={styles.noDateBtn} onPress={() => setAnswers((a) => ({ ...a, [q.id]: 'Just finish' }))}>
              <Text style={styles.noDateText}>Just finish</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(progressCount / totalQ) * 100}%` }]} />
      </View>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.chevron}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={styles.stepLabel}>{progressCount}/{totalQ}</Text>
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

const CARD_PADDING = 20;

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
  paceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  paceInput: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...typography.title,
    color: colors.primaryText,
    textAlign: 'center',
  },
  paceUnit: {
    ...typography.secondary,
    color: colors.secondaryText,
  },
  raceTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  raceTimeLabel: {
    width: 110,
    ...typography.body,
    color: colors.primaryText,
  },
  raceTimeInput: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.body,
    color: colors.primaryText,
    textAlign: 'center',
  },
  dateInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...typography.body,
    color: colors.primaryText,
    marginBottom: 12,
  },
  noDateBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  noDateText: {
    ...typography.secondary,
    color: colors.link,
  },
  footer: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingBottom: 32,
    paddingTop: 16,
  },
});
