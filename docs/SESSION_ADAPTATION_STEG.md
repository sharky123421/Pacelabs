# Session adaptation – exakt vad du ska göra

Följ stegen i ordning. När du är klar ska AI-baserad dagens pass på Today-skärmen fungera.

---

## 1. Kör migrationen i Supabase

Du måste skapa tabellerna `user_baselines`, `daily_recovery`, `session_modifications`, `ai_feedback` och kolumnen `sessions.importance`.

**Alternativ A – Supabase Dashboard**

1. Gå till [Supabase Dashboard](https://supabase.com/dashboard) → ditt projekt.
2. Öppna **SQL Editor**.
3. Öppna filen `supabase/migrations/20250223160000_session_adaptation.sql` i din editor, kopiera **hela** innehållet.
4. Klistra in i SQL Editor och klicka **Run**.

**Alternativ B – Supabase CLI**

```bash
cd /Users/benny/Desktop/RunApp
npx supabase link --project-ref DITT_PROJECT_REF
npx supabase db push
```

(Ersätt `DITT_PROJECT_REF` med ditt projekt-ID från Dashboard → Project Settings → General.)

---

## 2. Sätt secrets för Edge Functions

Edge-funktionen `analyze-today-session` använder Groq (och valfritt OpenWeather). Nycklarna ska ligga som **Supabase Secrets**, inte i `.env`.

1. Gå till **Supabase Dashboard** → ditt projekt.
2. **Project Settings** (kugghjulet) → **Edge Functions**.
3. Under **Secrets** (eller **Function Secrets**), lägg till:

| Name               | Value                    |
|--------------------|--------------------------|
| `GROQ_API_KEY`     | Din Groq API-nyckel      |
| `OPENWEATHER_API_KEY` | Din OpenWeather API-nyckel (valfritt) |

**Groq-nyckel:** Gå till [console.groq.com](https://console.groq.com), skapa eller kopiera en API key. Samma nyckel som du använder för Coach chat fungerar.

**OpenWeather (valfritt):** [openweathermap.org/api](https://openweathermap.org/api) – utan nyckel hoppar funktionen över väder i prompten.

---

## 3. Deploya Edge Functions

Kör i terminalen från projektets rot:

```bash
cd /Users/benny/Desktop/RunApp

# Viktigt: --no-verify-jwt så att plattformen inte returnerar 401. Vi validerar JWT själva i funktionen.
npm run deploy:session-adaptation
```

Eller manuellt:

```bash
npx supabase functions deploy analyze-today-session --no-verify-jwt
npx supabase functions deploy calculate-user-baselines --no-verify-jwt
```

Om du inte är inloggad:

```bash
npx supabase login
```

Sedan kör du deploy-kommandona ovan igen.

---

## 4. Kontrollera att appen har Supabase-URL och anon key

Appen anropar `https://DITT_PROJECT.supabase.co/functions/v1/analyze-today-session`. Den använder redan `EXPO_PUBLIC_SUPABASE_URL` och `EXPO_PUBLIC_SUPABASE_ANON_KEY` från `.env`.

Kolla din `.env` (den ska **inte** committas till git):

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Om dessa finns och är rätt behöver du **inte** lägga till några nya variabler i `.env` för session adaptation. Groq-nyckeln används bara på servern (Supabase secrets).

---

## 5. Starta om appen

Efter deploy, starta om Expo så att allt laddas:

```bash
npm run start:go:lan -- --clear
```

Öppna Today-fliken. Om du har Apple Health synkad och wellness-data för idag ska appen automatiskt anropa `analyze-today-session` och visa AI:s beslut. Om du inte har wearables visas det manuella flödet (sömn, energi, smärta) och knappen **Get my session**.

---

## 6. (Valfritt) Baselines för bättre AI-bedömning

För personliga HRV/RHR/sömn-baseline behöver du köra `calculate-user-baselines` när användaren har **minst 14 dagars** wellness-data (t.ex. Apple Health).

**Manuellt anrop (t.ex. från Postman eller curl):**

```bash
# Hämta din access_token (JWT) från appen eller Supabase Auth
curl -X POST 'https://DITT_PROJECT_REF.supabase.co/functions/v1/calculate-user-baselines' \
  -H 'Authorization: Bearer DIN_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Du kan även sätta upp en **Supabase Cron** (eller extern cron) som anropar denna funktion periodiskt (t.ex. varje vecka). Då fylls `user_baselines` i och AI:n får bättre underlag.

---

## Snabbkontroll – att allt fungerar

| Steg | Vad du gör | Hur du ser att det fungerar |
|------|------------|-----------------------------|
| 1 | Migration körd | I Supabase → Table Editor: tabellerna `user_baselines`, `daily_recovery`, `session_modifications`, `ai_feedback` finns. |
| 2 | Secrets satta | I Dashboard → Project Settings → Edge Functions → Secrets: `GROQ_API_KEY` finns. |
| 3 | Functions deployade | I Dashboard → Edge Functions: `analyze-today-session` och `calculate-user-baselines` listas och körs utan fel. |
| 4 | .env har Supabase-URL och anon key | Appen loggar in och anropar Supabase utan att krascha. |
| 5 | App omstartad | Today-skärmen laddar; antingen “Analyzing…” eller ett AI-beslut (proceed/modify/replace/rest) visas. |

Om du får fel: kolla Supabase → Edge Functions → Logs för `analyze-today-session`. Vanliga fel: saknad `GROQ_API_KEY` (501/500), eller att migrationen inte körts (tabell saknas).

---

## Felsökning: HTTP 401

**401 Unauthorized** betyder att Supabase avvisar anropet pga inloggning.

Appen använder nu **supabase.functions.invoke()** (istället för raw fetch) så att samma headers (apikey + användarens JWT) skickas som övriga Supabase-anrop. Det löser de flesta 401-problem.

**Teknisk orsak:** Edge-funktionen måste skapa en klient med **anon key** (inte service role) när den ska läsa användaren från JWT. Med service role sätts inte användarkontexten, så `getUser()` blir null och funktionen svarar 401. Det är nu åtgärdat i `analyze-today-session` och `calculate-user-baselines`.

Om 401 ändå kvarstår: kontrollera att URL och anon key i `.env` matchar projektet där funktionen är deployad, och starta om appen med `--clear`.
