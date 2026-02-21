# Supabase – Pacelab

## Database schema

Migrations are in `migrations/`. Apply them in one of these ways:

1. **Supabase Dashboard**  
   Open your project → SQL Editor → paste the contents of `migrations/20250221000001_initial_schema.sql` → Run.

2. **Supabase CLI**  
   From project root:
   ```bash
   npx supabase link --project-ref YOUR_REF
   npx supabase db push
   ```

## Tables

- **profiles** – User profiles (synced from `auth.users` via trigger).
- **runs** – Run sessions (user_id, started_at, ended_at, distance_meters, duration_seconds, title, notes).
- **run_points** – Optional GPS points per run (run_id, sequence, lat, lng, elevation_meters, recorded_at).

RLS is enabled: users can only access their own runs and run_points; profiles are readable by all, editable only by owner. Storage bucket `avatars` is set up for profile images.

Replace or extend this schema with your full app specification when ready.
