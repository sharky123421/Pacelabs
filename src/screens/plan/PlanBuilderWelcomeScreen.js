import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { colors, typography, spacing, theme } from '../../theme';
import { PrimaryButton } from '../../components';
import { fetchPlanBuilderUserData } from '../../services/planBuilder';

const PADDING = spacing.screenPaddingHorizontal;


export function PlanBuilderWelcomeScreen({ navigation }) {
  const { user } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      try {
        const data = await fetchPlanBuilderUserData(user.id);
        if (!cancelled) setUserData(data);
      } catch (_) {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleStart = () => {
    navigation.navigate('PlanBuilderChat', { userData });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const runCount = userData?.totalRuns ?? 0;
  const vo2 = userData?.vo2max ?? '—';
  const threshold = userData?.thresholdPace ?? '—';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
            <Text style={styles.iconText}>P</Text>
          </View>
        </View>
        <Text style={styles.title}>Let's build your plan</Text>
        <Text style={styles.subtitle}>
          Our AI will analyze your training history and ask you a few questions to create the perfect plan for you.
        </Text>

        <View style={styles.checklist}>
          <CheckItem done label={`Your full run history (${runCount} runs)`} />
          <CheckItem done label={`Your fitness level (VO2 ${vo2}, threshold ${threshold}/km)`} />
          <CheckItem done label="Your readiness and sleep data" />
          <CheckItem done label="Your injury history" />
        </View>

        <PrimaryButton
          title="Start"
          onPress={handleStart}
          style={styles.primaryBtn}
        />
        <Text style={styles.caption}>Takes about 2 minutes</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function CheckItem({ done, label }) {
  return (
    <View style={styles.checkRow}>
      <Text style={styles.checkMark}>{done ? '✓' : '○'}</Text>
      <Text style={styles.checkLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: PADDING,
    paddingTop: 48,
    paddingBottom: 60,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    ...typography.largeTitle,
    fontWeight: '700',
    color: colors.primaryText,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    ...typography.body,
    color: colors.secondaryText,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  checklist: {
    alignSelf: 'stretch',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.radius.card,
    padding: 20,
    marginBottom: 32,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkMark: {
    fontSize: 18,
    color: colors.success,
    marginRight: 10,
    fontWeight: '600',
  },
  checkLabel: {
    ...typography.body,
    color: colors.primaryText,
    flex: 1,
  },
  primaryBtn: {
    minWidth: 200,
    marginBottom: 8,
  },
  caption: {
    ...typography.caption,
    color: colors.secondaryText,
  },
});
