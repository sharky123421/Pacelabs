import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { colors, typography, spacing, theme } from '../theme';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { hapticLight } from '../lib/haptics';

export function PrimaryButton({ title, onPress, disabled, loading, style, textStyle }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    hapticLight();
    onPress?.();
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && !isDisabled && styles.buttonPressed,
        disabled && styles.disabled,
        style,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View style={styles.highlightLayer} pointerEvents="none" />
      <Animated.View style={[styles.inner, animatedStyle]}>
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={[styles.text, textStyle]}>{title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: theme.radius.button,
    paddingVertical: spacing.touchablePadding,
    paddingHorizontal: spacing.controlInset,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
    ...theme.cardShadow,
  },
  buttonPressed: {
    shadowOpacity: 0.2,
    elevation: 1,
  },
  highlightLayer: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: '45%',
    borderRadius: theme.radius.button,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.3,
  },
  text: {
    ...typography.headline,
    color: colors.background,
    letterSpacing: -0.2,
  },
});
