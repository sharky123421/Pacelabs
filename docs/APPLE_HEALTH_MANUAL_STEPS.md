# Apple Health – vad du ska göra manuellt

## ✅ Klart (gjort åt dig)
- **npm install** – kördes, alla paket inkl. `react-native-health` är installerade.
- **pod install** – kördes, `RNAppleHealthKit` är länkad. Podfile uppdaterad med `project 'Pacelab.xcodeproj'` så att CocoaPods hittar rätt projekt.

---

## 1. HealthKit i Xcode (valfritt)

**Behöver du inte om du:** bara testar i simulatorn eller inte har ett betalt Apple Developer-konto. Appen använder då mockdata och fungerar fint.

**Gör bara detta om du** har ett betalt Apple Developer-konto och ska köra på riktig iPhone med riktig HealthKit-data:

1. Öppna **Xcode** och **Pacelab.xcworkspace**.
2. Välj target **Pacelab** → **Signing & Capabilities** → **+ Capability** → **HealthKit**.
3. Spara.

---

## 2. Köra migrationen i Supabase (gör detta)

Du behöver skapa tabellerna `apple_health_connections`, `apple_wellness` och de nya kolumnerna på `runs`.

**Alternativ A – Supabase Dashboard**

1. Gå till [supabase.com](https://supabase.com) → ditt projekt → **SQL Editor**.
2. Öppna filen `supabase/migrations/20250221210000_apple_health.sql` i din editor.
3. Kopiera **hela** innehållet och klistra in i SQL Editor.
4. Klicka **Run**. Kontrollera att det inte blir några fel.

**Alternativ B – Supabase CLI (om du använder det)**

```bash
cd /Users/benny/Desktop/RunApp
supabase db push
```

*(Kräver att projektet är länkat med `supabase link`.)*

---

## 3. Simulator vs riktig enhet

- **iOS Simulator**: HealthKit finns inte. Appen använder **mockdata** så att du kan testa flödet (Today, Profile, Connect Apple Health).
- **Riktig iPhone**: HealthKit fungerar. Anslut Apple Watch eller använd Hälsa-appen på telefonen för att se riktiga data.

---

## 4. Bakgrundssync (valfritt, senare)

För synk när appen är stängd: lägg till `react-native-background-fetch` och registrera en task som anropar `fullSync(userId)` från `src/services/appleHealth.js`. Det kan vi sätta upp i ett senare steg om du vill.

---

## Snabbkontroll

- [ ] Supabase: migrationen `20250221210000_apple_health.sql` körd (Dashboard eller `supabase db push`) – behövs för att spara Apple Health-data i databasen.
- [ ] Bygg och kör: `npx expo run:ios` (välj Pacelab-schemat). I simulator = mockdata, inget Apple-konto behövs.
- [ ] (Valfritt) Xcode HealthKit-capability – bara om du har betalt Apple Developer-konto och ska använda riktig HealthKit på iPhone.
