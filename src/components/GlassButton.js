import React from 'react';
import { Text, StyleSheet, Pressable, Animated } from 'react-native';
import { colors, typography, spacing, theme } from '../theme';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { hapticLight } from '../lib/haptics';

export function GlassButton({ title, onPress, disabled, loading, style, textStyle, variant = 'primary' }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    hapticLight();
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' ? styles.secondary : styles.primary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      <Animated.View style={styles.highlightLayer} pointerEvents="none" />
      <Animated.View style={animatedStyle}>
        <Text style={[styles.text, variant === 'secondary' && styles.textSecondary, textStyle]}>
          {loading ? '…' : title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.button,
    paddingVertical: spacing.touchablePadding,
    paddingHorizontal: spacing.controlInset,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.glassShadowSoft,
  },
  highlightLayer: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: '48%',
    borderRadius: theme.radius.button,
    backgroundColor: colors.glassHighlight,
  },
  primary: {
    backgroundColor: colors.glassFillStrong,
    borderColor: colors.glassStroke,
  },
  secondary: {
    backgroundColor: colors.glassFillSoft,
    borderColor: colors.glassStroke,
  },
  pressed: {
    backgroundColor: colors.glassSurfaceLight,
    borderColor: colors.accentLight,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    ...typography.headline,
    color: colors.primaryText,
    letterSpacing: -0.1,
  },
  textSecondary: {
    color: colors.secondaryText,
  },
});

