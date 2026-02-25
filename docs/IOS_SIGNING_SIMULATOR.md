# Bygga till iOS-simulator (code signing)

Felet **"No code signing certificates are available"** löses genom att sätta ett Team i Xcode. Du behöver **inte** betalt Apple Developer-konto.

## Steg

1. Öppna **Xcode**.
2. Öppna **`ios/Pacelab.xcworkspace`** (File → Open).
3. I vänsterpanelen: klicka på **Pacelab** (projektet, blå ikon).
4. Under **TARGETS** väljer du **Pacelab**.
5. Öppna fliken **Signing & Capabilities**.
6. Bocka i **Automatically manage signing** (om den inte redan är ikryssad).
7. Under **Team**: klicka på listrutan och välj:
   - **Add an Account…** om du inte ser något team, logga in med ditt **Apple ID** (samma som i App Store). Det skapar ett gratis "Personal Team".
   - Välj sedan ditt **Personal Team** (visas som ditt namn eller "Your Name (Personal Team)").
8. Om Xcode klagar på Bundle ID: byt till ett unikt ID, t.ex. `com.benny.pacelab` (det står redan i specen).
9. Spara (Cmd+S).

## Bygg igen

I terminalen:

```bash
cd /Users/benny/Desktop/RunApp
npx expo run:ios
```

Starta gärna **Simulator** först (Xcode → Open Developer Tool → Simulator) och välj en iPhone. Då väljer Expo rätt mål.
