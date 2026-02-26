import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
// DocumentPicker, FileSystem, and JSZip are dynamically imported in handlers below
import { colors, typography, spacing, theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';
import { PrimaryButton } from '../../components';
import { importGpxFiles, importGpxFromXmlStrings } from '../../services/gpxImport';

const STEPS = [
  'Open Garmin Connect app or connect.garmin.com',
  'Go to Activities → select your runs → Export GPX',
  'Or bulk export all data at garmin.com/account/datamanagement',
  'Import your files below',
];

export function OnboardingGPXImportScreen({ navigation }) {
  const { user } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');

  const handleSelectFiles = async () => {
    if (!user?.id) return;
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/gpx+xml',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      const uris = (result.assets || []).map((a) => a.uri);
      if (uris.length === 0) return;
      setProcessing(true);
      setProgressLabel('Importing...');
      const { runsInserted, runsSkipped, errors } = await importGpxFiles(uris, user.id, setProgressLabel);
      setProcessing(false);
      if (errors.length > 0) {
        Alert.alert('Import finished with issues', `${runsInserted} runs imported, ${runsSkipped} skipped. ${errors.join(' ')}`);
      }
      goToAIAnalysis();
    } catch (e) {
      setProcessing(false);
      Alert.alert('Import failed', e?.message || 'Could not import GPX files.');
    }
  };

  const handleSelectZip = async () => {
    if (!user?.id) return;
    try {
      const [DocumentPicker, FileSystem, { default: JSZip }] = await Promise.all([
        import('expo-document-picker'),
        import('expo-file-system/legacy'),
        import('jszip'),
      ]);
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/zip',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      setProcessing(true);
      setProgressLabel('Reading ZIP...');
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const zip = await JSZip.loadAsync(base64, { base64: true });
      const gpxNames = Object.keys(zip.files).filter((n) => n.toLowerCase().endsWith('.gpx'));
      const xmlEntries = [];
      for (let i = 0; i < gpxNames.length; i++) {
        setProgressLabel(`Extracting ${i + 1}/${gpxNames.length}...`);
        const file = zip.files[gpxNames[i]];
        if (file.dir) continue;
        const xml = await file.async('string');
        xmlEntries.push({ xml, fileIndex: i });
      }
      if (xmlEntries.length === 0) {
        setProcessing(false);
        Alert.alert('No GPX in ZIP', 'The ZIP file does not contain any .gpx files.');
        return;
      }
      setProgressLabel('Importing runs...');
      const { runsInserted, runsSkipped, errors } = await importGpxFromXmlStrings(xmlEntries, user.id, setProgressLabel);
      setProcessing(false);
      if (errors.length > 0) {
        Alert.alert('Import finished with issues', `${runsInserted} runs imported, ${runsSkipped} skipped. ${errors.join(' ')}`);
      }
      goToAIAnalysis();
    } catch (e) {
      setProcessing(false);
      Alert.alert('Import failed', e?.message || 'Could not import ZIP.');
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
              <View style={[styles.progressFill, { width: '100%' }]} />
            </View>
            <Text style={styles.progressLabel}>
              {progressLabel || 'Processing...'}
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
