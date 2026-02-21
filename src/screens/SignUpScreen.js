import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { PrimaryButton, SecondaryButton, Input, DividerWithText, SocialButton } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { signInWithApple, signInWithGoogle } from '../lib/authHelpers';
import { isExpoGo } from '../lib/expoGo';
import { colors, typography, spacing } from '../theme';

export function SignUpScreen({ navigation }) {
  const { signUp, signInWithIdToken, signInWithOAuth, setSession } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || undefined,
          },
        },
      });
      if (err) {
        setError(err.message ?? 'Sign up failed');
        return;
      }
      if (data?.user && !data.session) {
        setError('Check your email to confirm your account.');
        return;
      }
      navigation.replace('OnboardingPath');
    } catch (e) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    const result = await signInWithApple(signInWithIdToken);
    if (result.available === false) return;
    if (result.cancelled) return;
    if (result.error) {
      Alert.alert('Apple Sign In', result.error);
      return;
    }
    navigation.replace('OnboardingPath');
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await signInWithGoogle(signInWithOAuth, setSession);
    setLoading(false);
    if (result.error) Alert.alert('Google Sign In', result.error);
    else navigation.replace('OnboardingPath');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create Account</Text>
        <Input
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          autoCapitalize="words"
        />
        <Input
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          autoCapitalize="words"
        />
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          keyboardType="email-address"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password (min 6 characters)"
          secureTextEntry
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton title="Continue" onPress={handleSignUp} loading={loading} />
        <DividerWithText />
        {Platform.OS === 'ios' && !isExpoGo && (
          <SocialButton provider="apple" onPress={handleApple} disabled={loading} />
        )}
        <SocialButton provider="google" onPress={handleGoogle} disabled={loading} />
        <TouchableOpacity
          style={styles.link}
          onPress={() => navigation.navigate('LogIn')}
          disabled={loading}
        >
          <Text style={styles.linkText}>Already have an account? Log In</Text>
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
  scrollContent: {
    paddingHorizontal: spacing.screenPaddingHorizontal,
    paddingTop: 24,
    paddingBottom: 40,
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 24,
  },
  errorText: {
    ...typography.caption,
    color: colors.destructive,
    marginBottom: 12,
  },
  link: {
    marginTop: 24,
    alignSelf: 'center',
  },
  linkText: {
    ...typography.secondary,
    color: colors.accent,
  },
});
