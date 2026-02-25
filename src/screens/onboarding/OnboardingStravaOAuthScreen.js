import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { setOnboardingStep, ONBOARDING_STEPS } from '../../lib/onboarding';
import { openStravaOAuth } from '../../services/stravaAuth';

const STRAVA_ORANGE = colors.stravaOrange;
const BULLET = '✓';

export function OnboardingStravaOAuthScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleConnect = async () => {
    if (!user?.id) {
      setError('You must be signed in to connect Strava.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await openStravaOAuth(user.id);
      await setOnboardingStep(user.id, ONBOARDING_STEPS.STEP_IMPORT_PROGRESS, {
        payload: { strava_connected: true },
      });
      navigation.replace('OnboardingImportProgress');
    } catch (e) {
      setError(e?.message || 'Could not open Strava. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoWrap}>
          <View style={styles.stravaLogo}>
            <Text style={styles.stravaLogoText}>Strava</Text>
          </View>
        </View>
        <Text style={styles.title}>Connect your Strava account</Text>
        <Text style={styles.subtitle}>
          We'll import your full running history and build your profile automatically
        </Text>

        <View style={styles.list}>
          <Text style={styles.bulletRow}><Text style={styles.check}>{BULLET}</Text> All your runs and routes</Text>
          <Text style={styles.bulletRow}><Text style={styles.check}>{BULLET}</Text> Pace, heart rate, and performance data</Text>
          <Text style={styles.bulletRow}><Text style={styles.check}>{BULLET}</Text> Personal records and segments</Text>
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.button, styles.stravaButton]}
          onPress={handleConnect}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Connect with Strava</Text>
          )}
        </TouchableOpacity>
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
    paddingTop: 40,
    paddingBottom: 40,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stravaLogo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: STRAVA_ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stravaLogoText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondaryText,
    marginBottom: 28,
  },
  list: {
    marginBottom: 36,
  },
  bulletRow: {
    ...typography.body,
    color: colors.primaryText,
    marginBottom: 12,
  },
  check: {
    color: colors.success,
    marginRight: 8,
  },
  button: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stravaButton: {
    backgroundColor: STRAVA_ORANGE,
  },
  buttonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorText: {
    ...typography.caption,
    color: colors.destructive,
    marginBottom: 16,
    textAlign: 'center',
  },
});
