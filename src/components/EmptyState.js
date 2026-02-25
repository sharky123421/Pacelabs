import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../theme';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';

/**
 * Consistent empty state: emoji, title, subtitle, optional primary + secondary CTAs.
 */
export function EmptyState({
  emoji = '',
  title = 'Nothing here yet',
  subtitle,
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
  style,
}) {
  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {primaryLabel && onPrimaryPress ? (
        <PrimaryButton title={primaryLabel} onPress={onPrimaryPress} style={styles.primaryBtn} />
      ) : null}
      {secondaryLabel && onSecondaryPress ? (
        <SecondaryButton title={secondaryLabel} onPress={onSecondaryPress} style={styles.secondaryBtn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emoji: { fontSize: 56, marginBottom: 20 },
  title: { ...typography.title, color: colors.primaryText, marginBottom: 8, textAlign: 'center' },
  subtitle: {
    ...typography.body,
    color: colors.secondaryText,
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryBtn: { marginBottom: 12, minWidth: 200 },
  secondaryBtn: { marginBottom: 12 },
});
