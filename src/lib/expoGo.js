/**
 * Detect if app is running inside Expo Go.
 * Apple Sign In does not work in Expo Go (audience mismatch), so we hide it there.
 */
import Constants from 'expo-constants';

export const isExpoGo = Constants.appOwnership === 'expo';
