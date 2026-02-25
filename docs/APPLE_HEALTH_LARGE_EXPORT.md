# Apple Health – stora exportfiler (upp till alla data)

När exporten från Hälsa-appen är för stor (flera hundra MB) kan appen krascha om du väljer filen direkt på enheten. Använd då **uppladdning via webbläsare** och **Process from cloud** så att filen hanteras på servern.

## Steg 1: Exportera från Hälsa

1. Öppna **Hälsa** → **Profil** (höger uppe) → **Exportera all hälsodata**.
2. Spara zip-filen (t.ex. i Filer eller skicka till datorn via AirDrop/e-post).

## Steg 2: Ladda upp via webbläsare

1. I Pacelab: **Profil** → **IMPORT DATA** → **Öppna uppladdningssida (stora filer)**.  
   Eller öppna i webbläsare (helst på dator):  
   `https://<ditt-projekt>.supabase.co/functions/v1/upload-health-page`
2. Logga in med **samma e-post** som i Pacelab (magic link skickas till din e-post).
3. Välj din exportfil (zip eller xml) och klicka **Ladda upp**.
4. Vänta tills "Klar!" visas.

## Steg 3: Bearbeta i appen

1. Öppna Pacelab → **Profil** → **IMPORT DATA**.
2. Tryck på **Process from cloud**.
3. Appen använder den senast uppladdade filen och bearbetar den på servern (ingen filstorleksgräns i appen).
4. När det är klart uppdateras hälsodata och löppass; dra ner för att uppdatera statistik.

## Magic link kommer inte fram?

### Redirect URL godkänns inte i Dashboard

Om Supabase säger att URL:en "is not a valid URL" när du lägger till den under **Redirect URLs**, testa i denna ordning:

1. **Wildcard** (fungerar ofta): lägg till exakt
   ```
   https://ykxsyvqrnrwxzpvyazwg.supabase.co/**
   ```
   (byt ut `ykxsyvqrnrwxzpvyazwg` mot din projekt-ref om du inte använder det projektet.)

2. **Endast origin**: prova
   ```
   https://ykxsyvqrnrwxzpvyazwg.supabase.co/
   ```
   (med avslutande snedstreck).

3. **Site URL istället:** Gå till **Authentication** → **URL Configuration** och sätt **Site URL** till:
   ```
   https://ykxsyvqrnrwxzpvyazwg.supabase.co/functions/v1/upload-health-page
   ```
   Spara. Då används den som standard efter inloggning. Lämna **Redirect URLs** tomt eller med samma URL om fältet accepterar den där.

Om ingen av dessa accepteras kan det bero på att Supabase inte tillåter redirect till `*.supabase.co`. Då kan du:
- använda **Import från enhet** för mindre exportfiler (under ca 250 MB), eller
- öppna uppladdningssidan på en **dator** i Chrome och logga in med samma e-post; ibland godkänns andra webbadresser som redirect-URL för lokala/utvecklar-URL:er.

### Övrig kontroll

- **Kolla skräppost** – mailet med magic link kan hamna där.
- **E-postprovider:** Under **Authentication** → **Providers** → **Email** ska "Enable Email provider" vara på.
- **Deploya om funktionen** efter ändringar:
  ```bash
  npx supabase functions deploy upload-health-page --no-verify-jwt
  ```

## Krävande deployment

- **Storage-bucket:** Om `supabase db push` redan har fel (t.ex. att tabeller redan finns), kör bara bucket-SQL i Supabase Dashboard → **SQL Editor** (kopiera från `supabase/migrations/20250223170000_health_exports_bucket.sql`). Eller skapa bucket manuellt: Storage → New bucket → id: `health-exports`, private, file size limit 500MB, MIME: zip, xml – och lägg sedan till policies enligt migrationen.
- **Edge Functions:**  
  `npm run deploy:apple-health-cloud`

## Alternativ: mindre filer i appen

Om exporten är under ca 250 MB kan du fortfarande använda **Import från enhet** och välja zip/xml direkt i appen. För större filer använd alltid uppladdningssidan + Process from cloud.
