import { useRef, useMemo } from 'react';
import { Animated } from 'react-native';
import { theme } from '../theme';

export function usePressAnimation(options = {}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const {
    scaleMin: tokenScaleMin,
    opacityMin: tokenOpacityMin,
    pressInDuration: tokenPressInDuration,
    pressOutDuration: tokenPressOutDuration,
  } = theme.animation.press;
  const { stiffness: tokenStiffness, damping: tokenDamping, mass: tokenMass } = theme.animation.spring;
  const scaleMin = options.scaleMin ?? tokenScaleMin;
  const opacityMin = options.opacityMin ?? tokenOpacityMin;
  const pressInDuration = options.pressInDuration ?? tokenPressInDuration;
  const pressOutDuration = options.pressOutDuration ?? tokenPressOutDuration;
  const stiffness = options.stiffness ?? tokenStiffness;
  const damping = options.damping ?? tokenDamping;
  const mass = options.mass ?? tokenMass;

  const animatedStyle = useMemo(
    () => ({
      transform: [{ scale }],
      opacity,
    }),
    [scale, opacity],
  );

  const run = (toScale, toOpacity, isPressIn) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: toScale,
        stiffness: isPressIn ? stiffness + 50 : stiffness,
        damping: isPressIn ? damping + 4 : damping,
        mass,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: toOpacity,
        duration: isPressIn ? pressInDuration : pressOutDuration,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const onPressIn = () => {
    run(scaleMin, opacityMin, true);
  };

  const onPressOut = () => {
    run(1, 1, false);
  };

  return { animatedStyle, onPressIn, onPressOut };
}

