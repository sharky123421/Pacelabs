import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { PrimaryButton, SecondaryButton } from '../components';
import { colors, typography, spacing } from '../theme';
import { APP_NAME } from '../constants';

const TAGLINE = 'Run smarter. Stay consistent.';

export function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.appName}>{APP_NAME}</Text>
        <Text style={styles.tagline}>{TAGLINE}</Text>
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>🏃</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <PrimaryButton
          title="Create Account"
          onPress={() => navigation.navigate('SignUp')}
        />
        <View style={styles.spacer} />
        <SecondaryButton
          title="Log In"
          onPress={() => navigation.navigate('LogIn')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenPaddingHorizontal,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    paddingTop: 48,
    alignItems: 'center',
  },
  appName: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 8,
  },
  tagline: {
    ...typography.body,
    color: colors.secondaryText,
    marginBottom: 40,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  heroIcon: {
    fontSize: 80,
  },
  actions: {
    paddingBottom: 32,
  },
  spacer: {
    height: spacing.betweenRelated,
  },
});
