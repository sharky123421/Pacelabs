import React from 'react';
import { View, Text, Image, StyleSheet, SafeAreaView } from 'react-native';
import { PrimaryButton, SecondaryButton } from '../components';
import { colors, typography, spacing } from '../theme';
import { APP_NAME } from '../constants';

export function WelcomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../../assets/pacelab-brand.png')}
          style={styles.logo}
          resizeMode="contain"
        />
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
  logo: {
    width: 140,
    height: 140,
    marginBottom: 24,
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
