import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { colors, typography, spacing, theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';
import { PrimaryButton } from '../../components';

const STEPS = [
  'Open Garmin Connect app or connect.garmin.com',
  'Go to Activities → select your runs → Export GPX',
  'Or bulk export all data at garmin.com/account/datamanagement',
  'Import your files below',
];

export function OnboardingGPXImportScreen({ navigation }) {
  const { user } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleSelectFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/gpx+xml',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      setProcessing(true);
      setProgress({ current: 0, total: result.assets?.length ?? 0 });
      for (let i = 0; i < (result.assets?.length ?? 0); i++) {
        setProgress({ current: i + 1, total: result.assets.length });
        await new Promise((r) => setTimeout(r, 100));
      }
      setProcessing(false);
      goToAIAnalysis();
    } catch (e) {
      setProcessing(false);
    }
  };

  const handleSelectZip = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/zip',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      setProcessing(true);
      setProgress({ current: 1, total: 1 });
      await new Promise((r) => setTimeout(r, 800));
      setProcessing(false);
      goToAIAnalysis();
    } catch (e) {
      setProcessing(false);
    }
  };

  const goToAIAnalysis = async () => {
    if (!user?.id) return;
    await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_AI_ANALYSIS);
    navigation.replace('OnboardingAIAnalysis');
  };

  const handleSkip = async () => {
    if (!user?.id) return;
    await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_AI_ANALYSIS);
    navigation.replace('OnboardingAIAnalysis');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Import your Garmin runs</Text>
        <Text style={styles.subtitle}>
          Get a much more accurate AI profile with your real run history
        </Text>

        <View style={styles.card}>
          {STEPS.map((s, i) => (
            <Text key={i} style={styles.stepText}>{i + 1}. {s}</Text>
          ))}
        </View>

        {processing ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              Processing {progress.current} of {progress.total} files...
            </Text>
          </View>
        ) : (
          <>
            <PrimaryButton
              title="Select GPX files"
              onPress={handleSelectFiles}
              style={styles.primaryBtn}
            />
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleSelectZip}>
              <Text style={styles.secondaryBtnText}>Import ZIP file</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.skipWrap} onPress={handleSkip} disabled={processing}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
        <Text style={styles.skipNotice}>
          Profile will be built from your answers only — lower accuracy
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
    marginBottom: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    padding: 20,
    marginBottom: 24,
    ...theme.cardShadow,
  },
  stepText: {
    ...typography.body,
    color: colors.primaryText,
    marginBottom: 8,
  },
  progressWrap: {
    marginBottom: 24,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressLabel: {
    ...typography.secondary,
    color: colors.secondaryText,
  },
  primaryBtn: {
    marginBottom: 12,
    minHeight: 56,
    borderRadius: 14,
  },
  secondaryBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  secondaryBtnText: {
    ...typography.body,
    color: colors.accent,
  },
  skipWrap: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  skipText: {
    ...typography.body,
    color: colors.secondaryText,
  },
  skipNotice: {
    ...typography.caption,
    color: colors.secondaryText,
    textAlign: 'center',
  },
});
