export { colors } from './colors';
export { typography } from './typography';
export { spacing } from './spacing';

import { colors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';

export const theme = {
  colors,
  typography,
  spacing,
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 3,
  },
  cardShadowElevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 8,
  },
  glassShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 5,
  },
  glassShadowSoft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 3,
  },
  glassShadowDeep: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 36,
    elevation: 14,
  },
  radius: {
    button: 20,
    input: 18,
    card: 26,
    sheet: 30,
    pill: 100,
    modal: 30,
  },
  animation: {
    press: {
      pressInDuration: 70,
      pressOutDuration: 170,
      scaleMin: 0.958,
      opacityMin: 0.9,
    },
    spring: {
      stiffness: 430,
      damping: 25,
      mass: 0.58,
    },
  },
};
