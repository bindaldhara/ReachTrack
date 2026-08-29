# Setup

## 1. Create a Supabase project

In [Supabase](https://supabase.com/dashboard):

1. Create a project.
2. Open **SQL Editor** and run `supabase/migrations/20260829120000_init.sql`.
3. Copy the project URL (`https://<ref>.supabase.co`) into both `VITE_SUPABASE_URL` (web) and `SUPABASE_URL` (api).
4. From **Settings → API Keys**, copy the publishable key (`sb_publishable_…`) into `VITE_SUPABASE_ANON_KEY`. The legacy `anon` key also works, but Supabase retires legacy keys at the end of 2026. Never put a secret or `service_role` key in `web/.env` — it ships to the browser.
5. Click **Connect** at the top of the dashboard, copy the **Session pooler** connection string into `DATABASE_URL`, and replace `[YOUR-PASSWORD]` with your database password (resettable under **Settings → Database**). Avoid the transaction pooler on port 6543: it does not support the prepared statements `pgx` uses.

The API needs no JWT secret. It verifies access tokens against the public keys at `SUPABASE_URL/auth/v1/.well-known/jwks.json`.

Auth: **Authentication → Providers → Email** should be enabled. For local development you can disable “Confirm email” so sign-up returns a session immediately.

## 2. API

```bash
cd api
cp .env.example .env
# set DATABASE_URL, SUPABASE_URL, PORT, CORS_ORIGIN
go run ./cmd/server
```

The API fetches the signing keys at startup and exits if `SUPABASE_URL` is wrong or unreachable.

`CORS_ORIGIN` defaults to `http://localhost:5173`. If Vite picks another port (e.g. `5174` when `5173` is busy), add it as a comma-separated value: `http://localhost:5173,http://localhost:5174`.

The module targets Go 1.25 (a requirement of the JWKS library). On an older local Go, the `go` command downloads the matching toolchain automatically on first build.

## 3. Web

```bash
cd web
cp .env.example .env
# set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL=http://localhost:8080
npm run dev
```

Open http://localhost:5173, sign up, and use **Companies → Contacts → Jobs → Conversations → Outreach → Reminders**.

This machine’s Node 21 works with the pinned Vite 6. Vite 8 needs Node 20.19+ or 22.12+.

## 4. Tests

```bash
cd api && go test ./...
cd web && npm run build
```
