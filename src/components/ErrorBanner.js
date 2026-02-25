import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography } from '../theme';

/**
 * Inline error banner with optional retry. Use for Supabase, sync, or network errors.
 */
export function ErrorBanner({ message, onRetry, style }) {
  return (
    <View style={[styles.banner, style]}>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * Top-of-screen banner for no internet (shown when offline).
 */
export function NoInternetBanner() {
  return (
    <View style={styles.noInternet}>
      <Text style={styles.noInternetText}>No internet connection — showing cached data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.destructive + '18',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 20,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.destructive,
  },
  text: { ...typography.body, color: colors.primaryText },
  retry: { marginTop: 8 },
  retryText: { ...typography.secondary, color: colors.accent, fontWeight: '600' },
  noInternet: {
    backgroundColor: colors.warning + '25',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  noInternetText: { ...typography.caption, color: colors.primaryText, textAlign: 'center' },
});
