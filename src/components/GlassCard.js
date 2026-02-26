import React from 'react';
import { View, StyleSheet, Pressable, Platform, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, spacing, theme } from '../theme';
import { usePressAnimation } from '../hooks/usePressAnimation';

export function GlassCard({ children, onPress, style, variant = 'elevated' }) {
  const isPressable = typeof onPress === 'function';
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();
  const blurIntensity = variant === 'soft' ? 56 : variant === 'default' ? 72 : 86;

  const content = (
    <View style={[styles.glassInner, styles[variant] || styles.elevated]}>
      {children}
    </View>
  );

  const Wrapper = isPressable ? Pressable : View;
  const wrapperProps = isPressable
    ? {
        onPress,
        onPressIn,
        onPressOut,
      }
    : {};

  return (
    <Wrapper style={[styles.container, style]} {...wrapperProps}>
      <View style={styles.borderLayer}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={blurIntensity} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallback]} />
        )}
        <View style={styles.topHighlight} pointerEvents="none" />
        <View style={styles.innerGlow} pointerEvents="none" />
      </View>
      <Animated.View style={[styles.animatedLayer, animatedStyle]}>{content}</Animated.View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    marginBottom: spacing.betweenCards,
  },
  borderLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: colors.glassStroke,
  },
  topHighlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    backgroundColor: colors.glassHighlightTop,
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: colors.glassGlow,
  },
  animatedLayer: {
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
  glassInner: {
    backgroundColor: colors.glassSurface,
    padding: 20,
  },
  soft: {
    ...theme.glassShadowSoft,
  },
  default: {
    ...theme.glassShadow,
  },
  elevated: {
    ...theme.glassShadowDeep,
  },
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
});

