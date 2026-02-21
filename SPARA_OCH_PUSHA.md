# Så sparar du och pushar till GitHub

## Spara lokalt (commit)

Kör i terminalen från projektmappen `RunApp`:

```bash
cd /Users/benny/Desktop/RunApp

# Lägg till alla ändringar (inkl. nya filer)
git add .

# Gör en commit med ett meddelande
git commit -m "Apple HealthKit integration: react-native-health, Supabase tables, Profile + Today UI, edge functions"
```

Då är allt sparat i din **lokala** Git-historik.

---

## Skicka till GitHub (push)

**Ja, det är bra att ha koden på GitHub** – backup, historik och enkelt att dela eller byta dator.

1. **Om du inte har ett repo på GitHub än:**
   - Gå till [github.com](https://github.com) → **New repository**.
   - Döp det t.ex. till `pacelab` eller `RunApp`.
   - Skapa **utan** att lägga till README (du har redan kod).

2. **Koppla ditt lokala projekt till GitHub** (gör bara en gång):

   ```bash
   cd /Users/benny/Desktop/RunApp
   git remote add origin https://github.com/DITT-ANVANDARNAMN/DITT-REPO-NAMN.git
   ```
   Byt ut `DITT-ANVANDARNAMN` och `DITT-REPO-NAMN` mot ditt GitHub-användarnamn och repots namn.

3. **Pusha upp ( första gången med main ):**

   ```bash
   git push -u origin main
   ```

   Om din lokala gren heter `master` i stället för `main`:

   ```bash
   git branch -M main
   git push -u origin main
   ```

Efter det räcker det med:

```bash
git add .
git commit -m "Beskrivning av ändringen"
git push
```

---

## Kort checklista imorgon

1. [ ] Gör det du ska i Xcode (HealthKit) och Supabase (migration) – se `docs/APPLE_HEALTH_MANUAL_STEPS.md`.
2. [ ] Spara till Git: `git add .` → `git commit -m "..."` → `git push` (om du redan kopplat till GitHub).

Då är både jobbet och koden sparade.
