import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { colors, typography, spacing, theme } from '../theme';

const APPLE = 'apple';
const GOOGLE = 'google';

export function SocialButton({ provider, onPress, disabled }) {
  const isApple = provider === APPLE;
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isApple ? styles.apple : styles.google,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {isApple ? (
        <Text style={styles.appleLogo}></Text>
      ) : (
        <View style={styles.googleLogo}>
          <Text style={styles.googleG}>G</Text>
        </View>
      )}
      <Text style={[styles.text, isApple && styles.appleText]}>
        Continue with {isApple ? 'Apple' : 'Google'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.button,
    paddingVertical: spacing.touchablePadding,
    minHeight: 50,
    marginBottom: 12,
  },
  apple: {
    backgroundColor: colors.primaryText,
  },
  google: {
    backgroundColor: colors.backgroundSecondary,
  },
  disabled: {
    opacity: 0.6,
  },
  appleLogo: {
    fontSize: 20,
    color: '#FFFFFF',
    marginRight: 10,
  },
  googleLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  googleG: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4285F4',
  },
  text: {
    ...typography.body,
    color: colors.primaryText,
  },
  appleText: {
    color: '#FFFFFF',
  },
});
