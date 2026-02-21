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
import { PrimaryButton, Input, DividerWithText, SocialButton } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { signInWithApple, signInWithGoogle } from '../lib/authHelpers';
import { isExpoGo } from '../lib/expoGo';
import { colors, typography, spacing } from '../theme';

export function LogInScreen({ navigation }) {
  const { signInWithPassword, signInWithIdToken, signInWithOAuth, setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogIn = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message ?? 'Log in failed');
        return;
      }
      if (data?.session) navigation.replace('Main');
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
    navigation.replace('Main');
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await signInWithGoogle(signInWithOAuth, setSession);
    setLoading(false);
    if (result.error) Alert.alert('Google Sign In', result.error);
    else navigation.replace('Main');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Welcome Back</Text>
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
          placeholder="Password"
          secureTextEntry
        />
        <TouchableOpacity
          style={styles.forgot}
          onPress={() => {}}
          disabled={loading}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton title="Log In" onPress={handleLogIn} loading={loading} />
        <DividerWithText />
        {Platform.OS === 'ios' && !isExpoGo && (
          <SocialButton provider="apple" onPress={handleApple} disabled={loading} />
        )}
        <SocialButton provider="google" onPress={handleGoogle} disabled={loading} />
        <TouchableOpacity
          style={styles.link}
          onPress={() => navigation.navigate('SignUp')}
          disabled={loading}
        >
          <Text style={styles.linkText}>Don't have an account? Sign Up</Text>
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
  forgot: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotText: {
    ...typography.secondary,
    color: colors.accent,
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
