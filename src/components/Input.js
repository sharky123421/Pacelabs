import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { colors, typography, theme } from '../theme';

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'none',
  autoCorrect = false,
  keyboardType,
  error,
  ...rest
}) {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.secondaryText}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        {...rest}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    ...typography.secondary,
    color: colors.secondaryText,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.radius.input,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...typography.body,
    color: colors.primaryText,
  },
  inputError: {
    borderWidth: 1,
    borderColor: colors.destructive,
  },
  errorText: {
    ...typography.caption,
    color: colors.destructive,
    marginTop: 4,
  },
});
