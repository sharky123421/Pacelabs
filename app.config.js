/**
 * Expo app config. Loads .env so EXPO_PUBLIC_* are available and passed to the app via extra.
 * The app reads from Constants.expoConfig?.extra when process.env is missing (e.g. in Expo Go).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const appJson = require('./app.json');

module.exports = {
  ...appJson.expo,
  extra: {
    ...(appJson.expo?.extra || {}),
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_STRAVA_CLIENT_ID: process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID,
    EXPO_PUBLIC_GROQ_API_KEY: process.env.EXPO_PUBLIC_GROQ_API_KEY,
  },
};
