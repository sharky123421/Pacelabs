import React, { useState } from 'react';
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
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';
import { PrimaryButton } from '../../components';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GOALS = ['5K', '10K', 'Half Marathon', 'Marathon', 'Ultra', 'General fitness'];

export function OnboardingGoalSettingScreen({ navigation }) {
  const { user } = useAuth();
  const [goal, setGoal] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const [longRunDay, setLongRunDay] = useState(null);

  const toggleDay = (d) => {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
    if (longRunDay === d) setLongRunDay(null);
  };

  const handleGenerate = async () => {
    if (!user?.id) return;
    await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_PLAN_GENERATION);
    navigation.replace('OnboardingPlanGeneration');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Set your goal</Text>

        <Text style={styles.sectionLabel}>Goal type</Text>
        <View style={styles.goalRow}>
          {GOALS.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.goalChip, goal === g && styles.goalChipSelected]}
              onPress={() => setGoal(g)}
            >
              <Text style={[styles.goalChipText, goal === g && styles.goalChipTextSelected]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>How many days can you train per week?</Text>
        <View style={styles.dayRow}>
          {DAYS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.dayPill, selectedDays.includes(d) && styles.dayPillSelected]}
              onPress={() => toggleDay(d)}
            >
              <Text style={[styles.dayPillText, selectedDays.includes(d) && styles.dayPillTextSelected]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedDays.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Which day do you prefer for long runs?</Text>
            <View style={styles.dayRow}>
              {selectedDays.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayPill, longRunDay === d && styles.longRunSelected]}
                  onPress={() => setLongRunDay(d)}
                >
                  <Text style={[styles.dayPillText, longRunDay === d && styles.dayPillTextSelected]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <PrimaryButton
          title="Generate my plan →"
          onPress={handleGenerate}
          disabled={!goal || selectedDays.length === 0}
          style={styles.cta}
        />
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
    marginBottom: 24,
  },
  sectionLabel: {
    ...typography.secondary,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  goalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  goalChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
  },
  goalChipSelected: {
    backgroundColor: colors.accent,
  },
  goalChipText: {
    ...typography.body,
    color: colors.primaryText,
  },
  goalChipTextSelected: {
    color: '#FFFFFF',
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
  },
  dayPillSelected: {
    backgroundColor: colors.accent,
  },
  longRunSelected: {
    backgroundColor: colors.success,
  },
  dayPillText: {
    ...typography.body,
    color: colors.primaryText,
  },
  dayPillTextSelected: {
    color: '#FFFFFF',
  },
  cta: {
    marginTop: 16,
    minHeight: 56,
    borderRadius: 14,
  },
});
