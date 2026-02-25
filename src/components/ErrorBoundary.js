import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, typography } from '../theme';

/**
 * Catches JS errors in child tree and shows a fallback UI with retry.
 */
export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (this.props.onError) this.props.onError(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>We've hit an unexpected error. Try again.</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { ...typography.title, color: colors.primaryText, marginBottom: 8 },
  subtitle: { ...typography.body, color: colors.secondaryText, textAlign: 'center', marginBottom: 24 },
  retry: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: colors.accent, borderRadius: 12 },
  retryText: { ...typography.body, color: '#FFFFFF', fontWeight: '600' },
});
