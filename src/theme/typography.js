/**
 * Pacelab design system — typography
 * Refined letter-spacing for premium feel.
 */
import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

export const typography = {
  largeTitle: {
    fontFamily,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  title: {
    fontFamily,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headline: {
    fontFamily,
    fontSize: 17,
    fontWeight: '600',
  },
  body: {
    fontFamily,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  secondary: {
    fontFamily,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  caption: {
    fontFamily,
    fontSize: 13,
    fontWeight: '400',
  },
  overline: {
    fontFamily,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
};
