# Strava – vad du måste göra

Appen och koden är klara. För att **Connect Strava** ska fungera måste du göra dessa tre saker (en gång per projekt).

---

## 1. Länka Supabase (om du inte redan gjort det)

I projektroten:

```bash
npx supabase link --project-ref ykxsyvqrnrwxzpvyazwg
```

Ange databaslösenord när du blir tillfrågad.

---

## 2. Deploya callback-funktionen

```bash
npm run deploy:strava-callback
```

(Säger kommandot att något inte är länkat, gör steg 1 först.)

---

## 3. Sätt secrets i Supabase

Edge-funktionen behöver dessa värden. Sätt dem i **Supabase Dashboard** → ditt projekt → **Project Settings** → **Edge Functions** → **Secrets** (eller via CLI nedan).

| Secret | Var hittar du det? |
|--------|---------------------|
| `STRAVA_CLIENT_ID` | Samma som i appen: **204855** (eller din Strava-app) |
| `STRAVA_CLIENT_SECRET` | [Strava API Settings](https://www.strava.com/settings/api) → "Client Secret" |
| `SUPABASE_URL` | **https://ykxsyvqrnrwxzpvyazwg.supabase.co** |
| `SUPABASE_ANON_KEY` | Samma som `EXPO_PUBLIC_SUPABASE_ANON_KEY` i appen – "anon" "public" (JWT som börjar med `eyJ...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → **Project Settings** → **API** → "service_role" (lång hemlig nyckel) |

**Viktigt för appen (.env):** `EXPO_PUBLIC_SUPABASE_ANON_KEY` ska vara **samma projekts** "anon" "public"-nyckel från **Project Settings → API** (en lång JWT som börjar med `eyJ...`). Annars får du **invalidJWT** när du använder Sync/Edge Functions. **Samma nyckel** ska vara satt som `SUPABASE_ANON_KEY` i Edge Function-secrets (för att `strava-sync-manual` ska kunna läsa användaren från JWT).

**Via CLI** (ersätt `DIN_CLIENT_SECRET`, `DIN_ANON_KEY` och `DIN_SERVICE_ROLE_KEY`):

```bash
npx supabase secrets set STRAVA_CLIENT_ID=204855
npx supabase secrets set STRAVA_CLIENT_SECRET=DIN_CLIENT_SECRET
npx supabase secrets set SUPABASE_URL=https://ykxsyvqrnrwxzpvyazwg.supabase.co
npx supabase secrets set SUPABASE_ANON_KEY=DIN_ANON_KEY
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=DIN_SERVICE_ROLE_KEY
```

---

## 4. Strava: Authorization Callback Domain

Gå till [Strava API – My API Application](https://www.strava.com/settings/api).

I fältet **Authorization Callback Domain** skriv **endast** domänen (ingen `https://`, ingen path, inget av `/functions/...`):

```
ykxsyvqrnrwxzpvyazwg.supabase.co
```

Spara.

**Får du "adressen är ogiltig" eller "The redirect URI does not match"?**  
Då matchar inte vad du skrev i Strava mot vad appen skickar. Kontrollera att det står **exakt** `ykxsyvqrnrwxzpvyazwg.supabase.co` – inga mellanslag, ingen `https://`, ingen `/functions/v1/strava-auth-callback`.

---

## 5. (Valfritt) "Sync now" och automatisk synk

Knappen **Sync now** och automatisk synk när du öppnar Profil kräver att funktionen `strava-sync-manual` är deployad **med** `--no-verify-jwt` (annars kan du få invalidJWT från gatewayen). Deploya med:

```bash
npm run deploy:strava-sync
```

Samma secrets som i steg 3 används. Efter det synkas nya Strava-aktiviteter automatiskt när du öppnar Profil-fliken (högst var 2:a minut) och när du trycker på **Sync now**. Vid **Sync now** hämtas nu alltid senaste aktiviteterna från Strava (full sync) så att runs verkligen importeras.

---

## 6. Om statistik och runs inte syns – kör RPC-migrationen

Profil- och Runs-flikarna hämtar nu siffror och listan via databasfunktioner som använder **auth.uid()** (samma inloggade användare). Du måste skapa dessa funktioner en gång:

1. Öppna **Supabase Dashboard** → ditt projekt → **SQL Editor**.
2. Öppna filen `supabase/migrations/20250223100000_get_my_runs_rpc.sql` i projektet, kopiera hela innehållet och klistra in i SQL Editor.
3. Klicka **Run**.

Efter det ska statistik och run-listan visas korrekt (dra ner för att uppdatera).

**Felsökning (0 runs trots Strava Connected):** Kör även denna SQL i SQL Editor så att appen kan visa en diagnostikrad:

```sql
create or replace function public.get_my_run_diagnostic()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('auth_uid', auth.uid(), 'run_count', (select count(*)::int from runs where user_id = auth.uid() and deleted_at is null));
$$;
grant execute on function public.get_my_run_diagnostic() to authenticated;
grant execute on function public.get_my_run_diagnostic() to anon;
```

Dra sedan ner på Profil – under "Dra ner för att uppdatera…" visas då t.ex. "servern ser användar-ID = … Runs i DB: 0". Om **auth_uid = null** → byt i `.env` till rätt anon-nyckel (eyJ…). Om **Runs i DB: 0** → inga runs har synkats än; tryck Sync now eller vänta på import.

---

## Klart

Starta appen, tryck **Connect Strava** i Profil, godkänn på Strava – då ska du skickas tillbaka till appen och Strava vara kopplad.

- **"Requested function was not found"** → steg 2 (deploy) eller steg 1 (link) är inte gjort.  
- **"Sync failed"** eller annat sync-fel → kör steg 5 (deploy `strava-sync-manual`) och kontrollera att samma secrets är satta.
- **Statistik/runs syns inte** → kör steg 6 (RPC-migrationen) och dra ner för att uppdatera.
- Anslutningen misslyckas med fel från servern → kolla steg 3 (secrets).
