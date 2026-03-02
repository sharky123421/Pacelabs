# Pacelab — Coming Soon

Statisk landningssida. Deploya till Vercel så att den går att nå på nätet.

## Deploy till Vercel

1. Gå till [vercel.com](https://vercel.com) och logga in (GitHub).
2. **Add New** → **Project** och importera repo `RunApp` (eller ditt repo).
3. **Root Directory**: klicka **Edit** och sätt till `website` (välj mappen `website`).
4. **Framework Preset**: lämna som **Other** (ingen build behövs).
5. Klicka **Deploy**.

Efter deploy får du en URL typ `pacelab-xxx.vercel.app`. Du kan koppla egen domän under **Settings → Domains**.

## Lokalt

Öppna `index.html` i webbläsare, eller kör:

```bash
npx serve website
```

Därefter: http://localhost:3000
