# AI Session Adaptation (Today Screen)

Every morning, Groq Llama 3.3 70B analyzes all available health and training data and returns the optimal session for today. No hardcoded rules — the AI makes every decision.

## Flow

1. **App open** (with wellness data): App calls `analyze-today-session` (max once per day unless force refresh).
2. **Edge function** collects: wellness (Apple Health or manual), baselines, recent runs, planned session, profile, weather.
3. **Groq** returns: recovery assessment, recommended session (proceed / modify / replace / rest), reasoning, coach message, warning UI.
4. **Today screen** shows: pattern card (if multi-day pattern), readiness widget (with AI recovery score and warning border), warning banner, session card with accept/override actions.
5. **User choice** is saved to `daily_recovery.user_choice` and optionally `session_modifications`.

## Supabase

### Migrations

Run after `training_plans`:

- `20250223160000_session_adaptation.sql` — creates `user_baselines`, `daily_recovery`, `session_modifications`, `ai_feedback`, adds `sessions.importance`.

### Edge Functions

Deploy (from project root):

```bash
npx supabase functions deploy analyze-today-session
npx supabase functions deploy calculate-user-baselines
```

### Secrets (Supabase Dashboard → Project Settings → Edge Functions → Secrets)

- **GROQ_API_KEY** — Groq API key for Llama 3.3 70B (session adaptation).
- **OPENWEATHER_API_KEY** — Optional; used for weather context in the prompt. If missing, weather is omitted.

`SUPABASE_SERVICE_ROLE_KEY` is already set for the project; the edge function uses it to read/write all user data.

## Baselines

`calculate-user-baselines` computes HRV, RHR, and sleep baselines from wellness history (needs ≥14 days). Run periodically (e.g. weekly) or after 14+ days of data. The app does not call it automatically; you can trigger it via a cron or manually after import.

## New users

If there is no baseline yet (<14 days), the Today screen can show: “Pacelab is learning your baseline — keep using the app for personal recovery benchmarks.” The AI still runs with conservative generic thresholds and `confidence: low`.

## No wearable

Manual input on the Today screen: sleep quality, energy, soreness. These are sent as `manual_wellness` to `analyze-today-session` and the AI uses them with “Data from manual input — lower confidence.”

## Learning (ai_feedback)

After each run, you can compare AI recommendation vs what the user did and next-day recovery, and store in `ai_feedback`. That data can be included in future Groq context for more personalized decisions. The current implementation does not yet write to `ai_feedback`; that can be added in a post-run job or when the user completes a run.
