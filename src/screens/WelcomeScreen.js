import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { PrimaryButton, SecondaryButton } from '../components';
import { colors, typography, spacing } from '../theme';
import { APP_NAME } from '../constants';

export function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>P</Text>
        </View>
        <Text style={styles.appName}>{APP_NAME}</Text>
        <Text style={styles.tagline}>Run smarter. Stay consistent.</Text>
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
    paddingTop: 80,
    alignItems: 'center',
  },
  brandMark: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  brandLetter: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  appName: {
    ...typography.largeTitle,
    fontSize: 40,
    color: colors.primaryText,
    marginBottom: 8,
  },
  tagline: {
    ...typography.body,
    color: colors.secondaryText,
  },
  actions: {
    paddingBottom: 32,
  },
  spacer: {
    height: spacing.betweenRelated,
  },
});
