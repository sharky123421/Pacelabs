/**
 * RunApp design system — typography
 * All text sharp and readable.
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
  },
  title: {
    fontFamily,
    fontSize: 22,
    fontWeight: '600',
  },
  body: {
    fontFamily,
    fontSize: 17,
    fontWeight: '400',
  },
  secondary: {
    fontFamily,
    fontSize: 15,
    fontWeight: '400',
  },
  caption: {
    fontFamily,
    fontSize: 13,
    fontWeight: '400',
  },
};
