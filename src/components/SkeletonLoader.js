import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, theme } from '../theme';

/**
 * Shimmer skeleton for loading states. Use SkeletonCard for card-shaped placeholders.
 */
export function SkeletonBox({ width, height, style, borderRadius = 8 }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width: width ?? '100%', height: height ?? 20, borderRadius, opacity },
        style,
      ]}
    />
  );
}

/**
 * Card-shaped skeleton (16px radius, shadow) for run cards or section cards.
 */
export function SkeletonCard({ style }) {
  return (
    <View style={[styles.card, style]}>
      <SkeletonBox height={14} width="40%" style={styles.mb8} />
      <SkeletonBox height={18} width="70%" style={styles.mb4} />
      <SkeletonBox height={12} width="90%" style={styles.mb8} />
      <SkeletonBox height={12} width="60%" />
    </View>
  );
}

/**
 * Full-screen skeleton for Runs list (multiple cards).
 */
export function SkeletonRunList({ count = 5 }) {
  return (
    <View style={styles.list}>
      <View style={styles.statsRow}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBox key={i} width={60} height={36} borderRadius={theme.radius.card} style={styles.statBox} />
        ))}
      </View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} style={styles.runCard} />
      ))}
    </View>
  );
}

/**
 * Today screen skeleton (readiness + session cards).
 */
export function SkeletonToday() {
  return (
    <View style={styles.today}>
      <SkeletonBox height={28} width="60%" style={styles.mb4} />
      <SkeletonBox height={16} width="40%" style={styles.mb24} />
      <SkeletonCard style={styles.mb16} />
      <SkeletonCard style={styles.mb16} />
      <SkeletonBox height={44} width="100%" borderRadius={14} style={styles.mb12} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.backgroundSecondary,
  },
  mb4: { marginBottom: 4 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb24: { marginBottom: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.card,
    padding: 16,
    ...theme.cardShadow,
  },
  runCard: { marginBottom: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  statBox: { flex: 1 },
  today: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
});
