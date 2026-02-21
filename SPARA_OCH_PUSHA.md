# Så sparar du och pushar till GitHub

## 1. Sätt Git-identitet (gör en gång per dator)

Git behöver veta vem som gör commit. Kör i terminalen (byt till ditt namn och din e-post):

```bash
git config --global user.email "din-epost@example.com"
git config --global user.name "Ditt Namn"
```

## 2. Spara lokalt (commit)

**Allt är redan staged** (`git add .` är kört). Du behöver bara committa:

```bash
cd /Users/benny/Desktop/RunApp
git commit -m "Pacelab: Apple HealthKit, Supabase tables, Profile + Today UI, edge functions"
```

Då är allt sparat i din **lokala** Git-historik.

---

## 3. Skicka till GitHub (push)

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

## Kort checklista

1. [ ] **Git-identitet** (en gång): `git config --global user.email "..."` och `user.name "..."`
2. [ ] **Commit**: `git commit -m "Pacelab: Apple HealthKit, Supabase, Profile + Today UI"`
3. [ ] **GitHub**: Skapa repo → `git remote add origin ...` → `git push -u origin main`
4. [ ] **Xcode**: HealthKit-capability (se `docs/APPLE_HEALTH_MANUAL_STEPS.md`)
5. [ ] **Supabase**: Kör migrationen `20250221210000_apple_health.sql` i SQL Editor
