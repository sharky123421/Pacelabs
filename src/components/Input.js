import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputOuter}>
        <View style={styles.inputHighlight} pointerEvents="none" />
        <View style={[
          styles.inputContainer,
          focused && styles.inputFocused,
          error && styles.inputError,
        ]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.tertiaryText}
          secureTextEntry={secureTextEntry && !showPassword}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          keyboardType={keyboardType}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.toggleBtn}
          >
            <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
        </View>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.tertiaryText,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inputOuter: {
    borderRadius: theme.radius.input,
    overflow: 'hidden',
  },
  inputHighlight: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: '48%',
    borderRadius: theme.radius.input,
    backgroundColor: colors.glassHighlight,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glassFillSoft,
    borderRadius: theme.radius.input,
    borderWidth: 1,
    borderColor: colors.glassStroke,
    ...theme.glassShadowSoft,
  },
  inputFocused: {
    borderColor: colors.accentLight,
    backgroundColor: colors.glassFillStrong,
  },
  inputError: {
    borderColor: colors.destructive,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...typography.body,
    color: colors.primaryText,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  toggleText: {
    ...typography.caption,
    color: colors.link,
    fontWeight: '600',
  },
  errorText: {
    ...typography.caption,
    color: colors.destructive,
    marginTop: 4,
  },
});
