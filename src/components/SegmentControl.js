import React from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { colors, typography, theme } from '../theme';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { hapticSelection } from '../lib/haptics';

export function SegmentControl({ segments, value, onChange }) {
  const handleSegmentPress = (segValue) => {
    if (segValue === value) return;
    hapticSelection();
    onChange?.(segValue);
  };

  return (
    <View style={styles.container}>
      <View style={styles.containerHighlight} pointerEvents="none" />
      {segments.map((seg) => {
        const selected = seg.value === value;
        const { animatedStyle, onPressIn, onPressOut } = usePressAnimation();

        return (
          <Pressable
            key={seg.value}
            style={[
              styles.item,
              selected && styles.itemSelected,
            ]}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            onPress={() => handleSegmentPress(seg.value)}
          >
            <Animated.View style={animatedStyle}>
              <View style={[styles.dot, selected && styles.dotSelected]} />
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {seg.label}
              </Text>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.glassFillSoft,
    borderWidth: 1,
    borderColor: colors.glassStroke,
    overflow: 'hidden',
  },
  containerHighlight: {
    position: 'absolute',
    left: 1,
    right: 1,
    top: 1,
    height: '45%',
    borderRadius: theme.radius.pill,
    backgroundColor: colors.glassHighlight,
  },
  item: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemSelected: {
    backgroundColor: colors.glassFillStrong,
    ...theme.glassShadowSoft,
  },
  dot: {
    alignSelf: 'center',
    width: 4,
    height: 4,
    borderRadius: 2,
    marginBottom: 3,
    backgroundColor: 'transparent',
  },
  dotSelected: {
    backgroundColor: colors.primaryText,
  },
  label: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  labelSelected: {
    color: colors.primaryText,
    fontWeight: '600',
  },
});

