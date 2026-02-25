# Strava Webhook & Sync

Real-time run sync from Strava: when a user saves a run on Strava, Pacelab receives it via webhook and processes it automatically.

## Environment variables

Set these in Supabase Dashboard → Project Settings → Edge Functions → Secrets (or `.env` for local):

| Variable | Description |
|----------|-------------|
| `STRAVA_CLIENT_ID` | Strava API application ID |
| `STRAVA_CLIENT_SECRET` | Strava API application secret |
| `STRAVA_VERIFY_TOKEN` | String you choose; Strava sends it in the GET verification request |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by Edge Functions to access DB (bypass RLS) |
| `EXPO_ACCESS_TOKEN` | Optional; for push notifications when a new run is synced |
| `STRAVA_WEBHOOK_SECRET` | Optional; if set, POST body is validated with `X-Hub-Signature-256` (HMAC-SHA256) |
| `PACELAB_APP_DEEP_LINK` | Optional; e.g. `pacelab://` for OAuth redirect after connect |
| `STRAVA_OAUTH_SUCCESS_PATH` | Optional; path after deep link on success (default `profile?strava=connected`) |
| `STRAVA_OAUTH_FAILURE_PATH` | Optional; path on OAuth error (default `profile?strava=error`) |

## Deploy OAuth callback (required for "Connect Strava")

**→ Steg-för-steg: se [STRAVA_SETUP_CHECKLIST.md](./STRAVA_SETUP_CHECKLIST.md)**

Kortversion:

Before users can connect Strava in the app, deploy the callback function and set its secrets:

1. **Deploy the function** (use `--no-verify-jwt` because Strava redirects the browser here with no auth header):
   ```bash
   npx supabase functions deploy strava-auth-callback --no-verify-jwt
   ```

2. **Set secrets** in Supabase Dashboard → Project Settings → Edge Functions → Secrets (or via CLI):
   - `STRAVA_CLIENT_ID` – same as in your app (e.g. from Strava API settings)
   - `STRAVA_CLIENT_SECRET` – from [Strava API](https://www.strava.com/settings/api)
   - `SUPABASE_URL` – your project URL, e.g. `https://YOUR_REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` – from Supabase Dashboard → Project Settings → API

   CLI example (replace values):
   ```bash
   npx supabase secrets set STRAVA_CLIENT_ID=204855
   npx supabase secrets set STRAVA_CLIENT_SECRET=your-secret
   npx supabase secrets set SUPABASE_URL=https://ykxsyvqrnrwxzpvyazwg.supabase.co
   npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. In [Strava API Application Settings](https://www.strava.com/settings/api), set **Authorization Callback Domain** to your Supabase host **without** `https://`, e.g. `ykxsyvqrnrwxzpvyazwg.supabase.co`.

If you see **"Requested function was not found"** after authorizing on Strava, the function is not deployed or the project/URL is wrong.

## Webhook registration (one-time)

Strava allows one push subscription per application. Register the webhook after deploying the Edge Function:

1. Deploy the `strava-webhook` function so the URL is live. **Use `--no-verify-jwt`** so Strava’s GET (and POST) requests, which send no auth header, get a 200 response. Otherwise Supabase returns 401 and Strava reports "GET to callback URL does not return 200":
   ```bash
   npx supabase functions deploy strava-webhook --no-verify-jwt
   ```

2. Create the subscription. Replace the four placeholders and run as a **single line** (no backslashes), or keep the quotes exact if you use multiple lines:
   ```bash
   curl -X POST "https://www.strava.com/api/v3/push_subscriptions" -F "client_id=YOUR_STRAVA_CLIENT_ID" -F "client_secret=YOUR_STRAVA_CLIENT_SECRET" -F "callback_url=https://YOUR_PROJECT_REF.supabase.co/functions/v1/strava-webhook" -F "verify_token=YOUR_STRAVA_VERIFY_TOKEN"
   ```
   Important: every `-F "key=value"` must have a **closing double quote** before the next `-F`. If you use line breaks with `\`, the quote still closes the value: `-F "verify_token=Glizzy"` (not `Glizzy` alone).

3. Strava will send a GET request to `callback_url` with `hub.mode=subscribe` and `hub.challenge=...`. The function responds with `{ "hub.challenge": "..." }` to complete validation.

4. Save the returned `id` (subscription_id) if you need it for debugging. You can view or delete the subscription:
   - View: `GET https://www.strava.com/api/v3/push_subscriptions?client_id=...&client_secret=...`
   - Delete: `DELETE https://www.strava.com/api/v3/push_subscriptions/{id}?client_id=...&client_secret=...`

## Endpoints

| Function | Method | Purpose |
|----------|--------|---------|
| `strava-webhook` | GET | Verification (echo `hub.challenge`) |
| `strava-webhook` | POST | Receive activity/athlete events |
| `strava-auth-callback` | GET | OAuth callback; exchange code, store tokens, trigger import |
| `strava-import-history` | POST | Full history import (paginated, rate-limited) |
| `strava-sync-manual` | POST | "Sync now" — activities since `last_synced_at` |
| `strava-refresh-token` | POST | Refresh Strava token (body: `connection_id` or `user_id`) |

## OAuth flow (app side)

1. In [Strava API Application Settings](https://www.strava.com/settings/api), set **Authorization Callback Domain** to your Supabase host, e.g. `YOUR_PROJECT_REF.supabase.co` (no scheme or path).
2. User taps "Connect with Strava" in onboarding or Profile.
3. App opens: `https://www.strava.com/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=activity:read_all,read&state=USER_ID`
   - `redirect_uri` must be exactly: `https://YOUR_REF.supabase.co/functions/v1/strava-auth-callback`
   - `state=USER_ID` so the callback knows which user to attach the connection to.
4. Strava redirects to the callback with `?code=...&state=USER_ID`.
5. Callback exchanges code for tokens, upserts `strava_connections`, then redirects to app deep link (e.g. `pacelab://profile?strava=connected`) and triggers `strava-import-history` with that `user_id`.

## Push notifications

When a new run is synced via webhook, the backend sends an Expo push notification if:

- `EXPO_ACCESS_TOKEN` is set
- The user's profile has `expo_push_token` set (the app should register this on launch; see `src/services/pushNotifications.js`).

Notification payload: title "Run synced ✓", body e.g. "10.4km · 4:52/km · Analyzed by Pacelab", and `data.runId` for deep link to run detail.

## Error handling

- **Strava API down**: Webhook returns 200 so Strava does not retry; consider persisting failed events and retrying later (e.g. queue table + cron).
- **Invalid or non-run activity**: Ignored; response 200.
- **Duplicate activity**: Skipped; response 200.
- **Token expired**: Webhook/import/sync refresh the token before calling the API; on refresh failure, appropriate error is returned.
- **Rate limit (100/15min)**: Import pauses and returns `paused: true`; client can show "Resuming in X seconds" and call again.
