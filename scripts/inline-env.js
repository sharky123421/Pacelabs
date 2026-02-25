/**
 * Optional: reads .env and writes config.env.js (gitignored) so the app could read EXPO_PUBLIC_* at runtime.
 * The app currently uses app.config.js extra + Constants.expoConfig.extra; this script is not run by default.
 * To use: run "node scripts/inline-env.js" then import the generated config.env.js where needed.
 */
const path = require('path');
const fs = require('fs');

// Load .env from project root (cwd when you run "npm run start:go:lan")
require('dotenv').config({ path: path.join(process.cwd(), '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const keys = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_STRAVA_CLIENT_ID',
];

const values = {};
keys.forEach((k) => {
  const v = (process.env[k] ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  values[k] = v;
});
const lines = [
  '// Auto-generated from .env – do not edit',
  '// Run "npm run start:go:lan" or similar to regenerate.',
  '',
  'module.exports = ' + JSON.stringify(values) + ';',
  '',
];

const outPath = path.resolve(process.cwd(), 'config.env.js');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log('Wrote', outPath);
