import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Switch,
  KeyboardAvoidingView,
  Modal,
  Pressable,
} from 'react-native';
import { PrimaryButton, Input, DividerWithText, SocialButton } from '../components';
import { useAuth } from '../contexts/AuthContext';
import { isExpoGo } from '../lib/expoGo';
import { colors, typography, spacing, theme } from '../theme';
import { supabase } from '../lib/supabase';

export function LogInScreen({ navigation }) {
  const { signInWithPassword, signInWithIdToken, signInWithOAuth, setSession, keepLoggedIn, setKeepLoggedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keepLoggedInLocal, setKeepLoggedInLocal] = useState(true);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    setKeepLoggedInLocal(keepLoggedIn);
  }, [keepLoggedIn]);

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

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      Alert.alert('Email required', 'Enter your email address to receive a reset link.');
      return;
    }
    setForgotLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim());
      if (err) {
        Alert.alert('Error', err.message);
      } else {
        Alert.alert('Check your email', 'A password reset link has been sent to your email address.');
        setForgotVisible(false);
        setForgotEmail('');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Something went wrong');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleApple = async () => {
    const { signInWithApple } = await import('../lib/authHelpers');
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
    const { signInWithGoogle } = await import('../lib/authHelpers');
    const result = await signInWithGoogle(signInWithOAuth, setSession);
    setLoading(false);
    if (result.error) Alert.alert('Google Sign In', result.error);
    else navigation.replace('Main');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
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
            onPress={() => {
              setForgotEmail(email);
              setForgotVisible(true);
            }}
            disabled={loading}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
          <View style={styles.keepLoggedInRow}>
            <Text style={styles.keepLoggedInLabel}>Keep me logged in</Text>
            <Switch
              value={keepLoggedInLocal}
              onValueChange={(v) => {
                setKeepLoggedInLocal(v);
                setKeepLoggedIn(v);
              }}
              trackColor={{ false: colors.divider, true: colors.accent }}
            />
          </View>
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
      </KeyboardAvoidingView>

      <Modal visible={forgotVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setForgotVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalBody}>
              Enter your email and we'll send you a link to reset your password.
            </Text>
            <Input
              label="Email"
              value={forgotEmail}
              onChangeText={setForgotEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
            />
            <PrimaryButton
              title="Send Reset Link"
              onPress={handleForgotPassword}
              loading={forgotLoading}
              style={styles.modalBtn}
            />
            <TouchableOpacity onPress={() => setForgotVisible(false)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingTop: 48,
    paddingBottom: 40,
  },
  title: {
    ...typography.largeTitle,
    color: colors.primaryText,
    marginBottom: 32,
    letterSpacing: -1,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  keepLoggedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingVertical: 4,
  },
  keepLoggedInLabel: {
    ...typography.body,
    color: colors.secondaryText,
  },
  forgotText: {
    ...typography.secondary,
    color: colors.link,
    fontWeight: '500',
  },
  errorText: {
    ...typography.caption,
    color: colors.destructive,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  link: {
    marginTop: 28,
    alignSelf: 'center',
  },
  linkText: {
    ...typography.secondary,
    color: colors.link,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.cardElevated,
    borderRadius: theme.radius.modal,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...theme.cardShadowElevated,
  },
  modalTitle: {
    ...typography.title,
    color: colors.primaryText,
    marginBottom: 8,
  },
  modalBody: {
    ...typography.secondary,
    color: colors.secondaryText,
    marginBottom: 20,
    lineHeight: 22,
  },
  modalBtn: {
    marginBottom: 12,
  },
  modalCancel: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  modalCancelText: {
    ...typography.secondary,
    color: colors.tertiaryText,
  },
});
