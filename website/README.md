# Pacelab — Coming Soon

Statisk landningssida + Privacy Policy. Eget git-repo – deploya till Vercel direkt från denna mapp.

## Deploy till Vercel

1. Skapa ett nytt repo på GitHub (t.ex. `pacelab-website`) och koppla detta repo:
   ```bash
   git remote add origin https://github.com/DITT-ANVANDARNAMN/pacelab-website.git
   git push -u origin main
   ```
2. Gå till [vercel.com](https://vercel.com) → **Add New** → **Project** → importera **pacelab-website** (eller detta repo).
3. Lämna **Root Directory** tom (hela repot är webbplatsen).
4. **Framework Preset**: **Other**. Klicka **Deploy**.

Efter deploy: `https://xxx.vercel.app`. Integritetssidan: `https://xxx.vercel.app/privacy`. Koppla egen domän under **Settings → Domains**.

## Lokalt

```bash
npx serve .
```
Sedan: http://localhost:3000
