# Expo Go – Pacelab

Pacelab kan köras i **Expo Go** för snabb utveckling utan att bygga en egen binary.

## Vad som fungerar i Expo Go

- Alla skärmar, navigation, Supabase (auth, databas, Edge Functions)
- Strava OAuth, coach chat, plan builder (Groq)
- Mockdata för Apple Health när HealthKit inte är tillgängligt (simulator / Expo Go)

## Begränsningar i Expo Go

- **Apple HealthKit** finns inte i Expo Go (native modul saknas). Appen kraschar inte; Health-relaterad kod använder då mockdata eller visar ett tydligt meddelande:
  - *"Apple Health stöds inte i Expo Go. Bygg en development build (expo run:ios) eller använd Importera data och exportera från Hälsa-appen."*

## Så här kör du i Expo Go

1. Ha `.env` med `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GROQ_API_KEY` (och ev. `EXPO_PUBLIC_STRAVA_CLIENT_ID`).
2. Starta med LAN-URL så att telefonen når Metro:
   ```bash
   npm run start:go:lan -- --clear
   ```
3. Skanna QR-koden med Expo Go (iOS/Android).

Konfigurationen från `app.config.js` (inkl. `extra`) inkluderas i bundlen så att `Constants.expoConfig.extra` har rätt värden i Expo Go.

## Development build (full HealthKit)

För Apple Health på riktig enhet:

```bash
npx expo run:ios
```

eller använd EAS Build. Då laddas `react-native-health` och HealthKit fungerar som vanligt.
