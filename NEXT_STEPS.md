# Pacelab — Nästa steg

Tech stack är sparad i `.cursor/rules/pacelab-tech-stack.mdc` så att Cursor alltid använder rätt paket och verktyg.

## Bundle ID
- I denna fil står **com.benny.pacelab** (enligt spec).
- I `app.json` är det just nu **com.benny.runapp** (för Supabase). Ändra tillbaka till `com.benny.pacelab` i `app.json` om du vill att det ska matcha specen, och uppdatera Supabase (Auth URL, redirects) till det nya bundle ID om det behövs.

---

## Förslag på nästa prompt (klistra in i Cursor)

**Alternativ A — Grunden först (rekommenderat)**  
> Set up the Pacelab app according to our tech stack: migrate the app to TypeScript strict mode, add Zustand for global state, and wire auth to navigation so that logged-in users go to the main app (e.g. Today) and logged-out users see Welcome. Use our existing theme and Supabase auth.

**Alternativ B — Tabs + struktur**  
> Add a bottom tab navigator to Pacelab for the main app (e.g. Today, Runs, Coach, Profile). Keep stack navigation for auth and modals. Use the tech stack in .cursor/rules. Logged-in users should land on the tab navigator.

**Alternativ C — Ett konkret flöde**  
> Implement the “Today” screen in Pacelab: show a simple daily view with placeholder for today’s run and weather. Use our theme, TypeScript, and Zustand. Prepare for expo-location and OpenWeather later.

Välj ett alternativ och bygg vidare steg för steg.
