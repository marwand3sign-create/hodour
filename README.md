# Hodour (حضور)

Arabic-first attendance system: face-recognition gate kiosk, phone clock-in with
GPS, offline-first PWA, leave & holiday tracking, and payroll reports (PDF / Excel).

Stack: React 18 + Vite + Tailwind, Supabase (Postgres + Auth + Storage + Edge
Functions), face-api / MediaPipe running in the browser.

## Run locally

```bash
npm install
cp .env.example .env   # fill in the Supabase values
npm run dev
npm test               # unit tests (payroll + store helpers)
npm run build
```

## Backend setup

See [supabase/README.md](supabase/README.md): apply every migration in
`supabase/migrations/` in order, deploy the Edge Functions (`team-admin`,
`pin-login`, `cleanup-old-photos`) and bootstrap the owner account.

## Layout

- `src/pages/manager/*` — manager screens (dashboard, today, attendance, review, staff, leaves, setup, reports)
- `src/pages/kiosk/Kiosk.jsx` — shared gate device (face identification)
- `src/pages/employee/*` — employee clock-in/out and history
- `src/lib/payroll.js` — pure payroll computation (tested in `payroll.test.js`)
- `src/lib/offlineQueue.js` — offline clock-in/out queue replayed on reconnect
- `src/store.js` — shift / wage / alert helpers
- `supabase/` — migrations and Edge Functions

## Notes

- Originally exported from Whacka; `src/lib/*` now talks to Supabase directly.
- Face data is biometric: a manager must confirm the worker's consent before
  enrolling a face (recorded in `employees.face_consent_at`), and the data is
  wiped when the employee is deleted.
