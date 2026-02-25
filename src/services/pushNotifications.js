/**
 * Expo Push Notifications: register token and save to profile for run-synced notifications.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request permissions and get Expo push token; save to profiles.expo_push_token for current user.
 * Call on app launch when user is logged in.
 * @param {string} userId - auth user id
 * @returns {Promise<string|null>} expo push token or null
 */
export async function registerPushToken(userId) {
  if (!userId) return null;
  if (!Device.isDevice) return null;
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
}
