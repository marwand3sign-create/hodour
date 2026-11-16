# Hodour × Supabase — setup

## 1. Create the project & apply the schema

1. Create (or reuse) a Supabase project.
2. Apply **all** migrations in `supabase/migrations/` in order (0001 → latest) — with the
   Supabase CLI linked to your project:
   ```
   npx supabase db push
   ```
   or paste each file into the SQL editor in order. Migration 0010 uses `pg_cron`
   (auto clock-out); 0011 adds leaves, holidays, biometric-consent and PIN-lockout tables.

## 2. Deploy the Edge Functions

```
npx supabase functions deploy pin-login        # PIN sign-in with lockout (5 wrong PINs → 15 min)
npx supabase functions deploy cleanup-old-photos
```
`pin-login` only protects clients that sign in through it. Also set sensible Auth rate
limits in Dashboard → Authentication → Rate Limits. Until it is deployed the app falls
back to direct sign-in (lockout inactive) and logs a console warning.

Schedule `cleanup-old-photos` monthly (Dashboard → Edge Functions → cleanup-old-photos → Cron) —
it deletes attendance snapshots older than 60 days, never the enrolment reference photo.

### `team-admin`

Employee account creation/listing/reset/enable/disable need the service-role key, so they
run server-side:
```
npx supabase functions deploy team-admin
```
No extra secrets need to be set — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
provided automatically to every Edge Function by the platform.

## 3. Create the storage bucket

The migration already inserts the `hodour-files` bucket row (private) and its access
policies — nothing else to do here.

## 4. Bootstrap the owner account (one-time, manual)

This app has exactly one non-PIN account: the owner/manager. Create it once per deployment:

1. Supabase Dashboard → Authentication → Users → **Add user** → set a real email + password,
   "Auto Confirm User" on.
2. Copy the new user's UUID.
3. In the SQL editor, insert their `employees` row:
   ```sql
   insert into employees (user_id, role, full_name)
   values ('<paste-uuid-here>', 'owner', 'Owner Name');
   ```
4. Also set that same user's `raw_user_meta_data.role` to `"owner"` (used by `auth.isAppOwner()`
   on the client) — Dashboard → the user → Edit → User Metadata:
   ```json
   { "role": "owner" }
   ```

## 5. App env vars

Copy `.env.example` to `.env` and fill in:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Project Settings → API.
- `VITE_APP_OWNER_ID` — the UUID from step 4 (gates the one-time notification-rule setup in
  Dashboard.jsx; harmless if left blank, notifications just won't be created).

Then sign in via the app's "تسجيل الدخول كمالك" (owner) button with the email/password from
step 4 — everything else (employee creation, attendance, reports) works from inside the app.
