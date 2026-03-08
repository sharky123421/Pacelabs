/**
 * Expo Push Notifications: register token and save to profile for run-synced notifications.
 * On web, push is not available; we skip loading native modules.
 */
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

/**
 * Request permissions and get Expo push token; save to profiles.expo_push_token for current user.
 * Call on app launch when user is logged in.
 * On web, returns null without loading native modules.
 * @param {string} userId - auth user id
 * @returns {Promise<string|null>} expo push token or null
 */
export async function registerPushToken(userId) {
  if (!userId) return null;
  if (Platform.OS === 'web') return null;
  try {
    const [NotificationsMod, DeviceMod] = await Promise.all([
      import('expo-notifications'),
      import('expo-device'),
    ]);
    const Notifications = NotificationsMod.default ?? NotificationsMod;
    const Device = DeviceMod.default ?? DeviceMod;
    if (!Device.isDevice) return null;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') return null;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);
    if (error) return null;
    return token;
  } catch (_) {
    return null;
  }
}
