# Setup

## 1. Create a Supabase project

In [Supabase](https://supabase.com/dashboard):

1. Create a project.
2. Open **SQL Editor** and run, in order:
   - `supabase/migrations/20260829120000_init.sql`
   - `supabase/migrations/20260829130000_gmail_connections.sql`
   - `supabase/migrations/20260829140000_outreach_types_gmail.sql`
   - `supabase/migrations/20260829150000_outreach_gmail_thread.sql`
   - `supabase/migrations/20260829160000_gmail_crm_links.sql`
   - `supabase/migrations/20260829170000_outreach_status_suggestion.sql`
   - `supabase/migrations/20260830120000_todo_items.sql`
3. Copy the project URL (`https://<ref>.supabase.co`) into both `VITE_SUPABASE_URL` (web) and `SUPABASE_URL` (api).
4. From **Settings → API Keys**, copy the publishable key (`sb_publishable_…`) into `VITE_SUPABASE_ANON_KEY`. The legacy `anon` key also works, but Supabase retires legacy keys at the end of 2026. Never put a secret or `service_role` key in `web/.env` — it ships to the browser.
5. Click **Connect** at the top of the dashboard, copy the **Session pooler** connection string into `DATABASE_URL`, and replace `[YOUR-PASSWORD]` with your database password (resettable under **Settings → Database**). Prefer the session pooler on port **5432** (not the transaction pooler on 6543).

The API needs no JWT secret. It verifies access tokens against the public keys at `SUPABASE_URL/auth/v1/.well-known/jwks.json`.

Auth: **Authentication → Providers → Email** should be enabled. For local development you can disable “Confirm email” so sign-up returns a session immediately.

## 2. API

```bash
cd api
cp .env.example .env
# set DATABASE_URL, SUPABASE_URL, PORT, CORS_ORIGIN, optional FOLLOW_UP_DUE_DAYS=1
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

The API loads Supabase JWKS at startup and exits if `SUPABASE_URL` is wrong or unreachable.

`CORS_ORIGIN` defaults to `http://localhost:5173`. If Vite picks another port (e.g. `5174` when `5173` is busy), add it as a comma-separated value: `http://localhost:5173,http://localhost:5174`.

Requires **Python 3.11+**.

## 3. Web

```bash
cd web
cp .env.example .env
# set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL=http://localhost:8080
npm run dev
```

Open http://localhost:5173, sign up, and use **Outreach**, **Successfully applied**, **Jobs**, **Reminders**, and **Todo**.

- **Successfully applied** — application confirmations from career sites and LinkedIn (imported from inbox Gmail, or added manually).
- **Todo → Emails to send** — draft emails; **Done** removes the item.
- **Todo → Companies to reach out** — target companies for outreach; **Done** removes the item.

This machine’s Node 21 works with the pinned Vite 6. Vite 8 needs Node 20.19+ or 22.12+.

## 4. Gmail OAuth (optional)

Profile → **Connect Gmail** needs Google OAuth credentials on the API.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Gmail API**.
2. Configure the OAuth consent screen (External is fine for local dev; add your Google account as a test user).
3. Create **OAuth client ID → Web application** credentials.
4. Add authorized redirect URI: `http://localhost:8080/api/v1/integrations/gmail/callback`
5. Copy the client ID and secret into `api/.env`:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=http://localhost:8080/api/v1/integrations/gmail/callback
WEB_APP_URL=http://localhost:5173
```

If Vite runs on another port (e.g. `5174`), set `WEB_APP_URL` to match so the OAuth callback redirects back to the right UI. Also add that origin to `CORS_ORIGIN`.

Restart the API after changing env vars. Tokens are stored in `gmail_connections` and never returned to the browser.

## 5. AI rejection detection (optional)

After Gmail sync, ReachTrack scans thread replies for **possible rejections**. Provider order:

1. **OpenRouter** — if `OPENROUTER_API_KEY` is set (recommended; use `:free` models)
2. **Gemini** — if `GEMINI_API_KEY` is set
3. **OpenAI** — if `OPENAI_API_KEY` is set
4. **Keyword rules** — always available as fallback

The same Gmail import also reads **inbox** application confirmations from ATS/careers platforms (Greenhouse, Lever, Workday, Ashby, etc.) and from **LinkedIn Easy Apply** (`jobs-noreply@linkedin.com`). Matching emails create **Jobs** rows and appear under **Successfully applied**.

### OpenRouter (free models)

1. Sign up at [openrouter.ai](https://openrouter.ai) and create an API key (`sk-or-v1-...`).
2. Pick a free model slug from [openrouter.ai/models?q=free](https://openrouter.ai/models?q=free), e.g. `openrouter/free` or `google/gemini-2.0-flash-exp:free`.
3. Add to `api/.env`:

```bash
OPENROUTER_API_KEY=sk-or-v1-your_key
OPENROUTER_MODEL=openrouter/free
```

Restart the API after changing env vars. Suggestions appear on the Outreach page until you confirm or dismiss them.

### Direct Gemini (alternative)

```bash
GEMINI_API_KEY=your_key_from_ai_studio
GEMINI_MODEL=gemini-2.0-flash
```

## 6. Tests

```bash
cd api && .venv/bin/python -m compileall app
cd web && npm run build
```
