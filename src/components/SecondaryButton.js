import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, theme } from '../theme';

export function SecondaryButton({ title, onPress, disabled, style, textStyle }) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.radius.button,
    paddingVertical: spacing.touchablePadding,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    ...typography.body,
    color: colors.primaryText,
  },
});
