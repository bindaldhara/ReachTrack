# Deployment

ReachTrack has two parts:

| Part | Stack | Host |
|------|-------|------|
| **Web** (`web/`) | Vite + React | **Vercel** (free) |
| **API** (`api/`) | FastAPI + uvicorn | **Render** (free plan) |

Database + auth stay on **Supabase** (free tier is fine — do **not** use Render’s free Postgres; it expires after 30 days).

---

## Free backend: recommended stack ($0)

| Service | Free tier | Good for ReachTrack? |
|---------|-----------|----------------------|
| **Render** web service | Yes — permanent free plan | **Best choice** — Python, long requests (Gmail sync), easy deploy |
| **Vercel** | Yes — frontend only | Use for `web/` |
| **Supabase** | Yes — DB + auth | Already required |
| Fly.io | Trial only for new accounts | Not free long-term |
| Netlify | No Python API | Cannot host this backend |
| Railway | ~$5/mo minimum | Not free |
| Oracle Cloud Always Free | Yes — 2 VMs forever | Free but manual Linux setup (advanced) |

### Render free — what to expect

- **$0** if you stay within limits (750 instance-hours/month per workspace).
- Service **sleeps after 15 minutes** with no traffic; next request takes **~30–60 seconds** to wake up.
- **Gmail import** can run on the free plan (Render allows long HTTP requests; sync timeout is up to 10 minutes in app config).
- Use **Supabase** for `DATABASE_URL`, not Render Postgres.

### Optional: reduce cold starts

Use a free uptime monitor (e.g. [UptimeRobot](https://uptimerobot.com)) to `GET https://your-api.onrender.com/health` every **14 minutes**. This keeps the service warm but uses more of your 750 free hours (~720/month if always pinged).

---

## Can the API run on Netlify?

**No.** Netlify Functions do not run Python/FastAPI. Use Render for the API and Vercel for the frontend.

---

## Prerequisites

1. Supabase project with all migrations applied ([setup.md](./setup.md)).
2. Git repo on GitHub, GitLab, or Bitbucket.
3. Vercel account ([vercel.com](https://vercel.com)).
4. Render or Railway account for the API.

---

## 1. Deploy the API on Render (free)

### Option A — Blueprint (fastest)

1. Push the repo to GitHub (includes root `render.yaml`).
2. [render.com](https://render.com) → **New → Blueprint** → select the repo.
3. Create the `reachtrack-api` service on the **Free** plan.
4. In the Render dashboard, open the service → **Environment** and add:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Supabase **session pooler** URL (port **5432**) |
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `CORS_ORIGIN` | Your Vercel URL (add after step 2) |
| `WEB_APP_URL` | Same Vercel URL |
| `GMAIL_REDIRECT_URI` | `https://reachtrack-api.onrender.com/api/v1/integrations/gmail/callback` (use your real Render URL) |
| `GOOGLE_CLIENT_ID` | Optional — Gmail |
| `GOOGLE_CLIENT_SECRET` | Optional |
| `OAUTH_STATE_SECRET` | Random long string |
| `GEMINI_API_KEY` | Optional |

5. Deploy → copy the public URL (e.g. `https://reachtrack-api.onrender.com`).

### Option B — Manual

1. [render.com](https://render.com) → **New → Web Service** → connect repo.
2. **Root directory:** leave **blank** (repo root — same as Blueprint `render.yaml`).
3. **Runtime:** Python 3
4. **Build command:** `pip install -r api/requirements.txt`
5. **Start command:** `cd api && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **Instance type:** **Free**
7. Same environment variables as above.

**Alternative:** set **Root directory** to `api` and use `pip install -r requirements.txt` plus `uvicorn app.main:app ...` (paths relative to `api/`). Do **not** use `web` as the root directory for the API service.

### Google OAuth

Add your production `GMAIL_REDIRECT_URI` to [Google Cloud Console](https://console.cloud.google.com/) → OAuth client → **Authorized redirect URIs**.

### Railway (paid alternative)

If Render free cold starts bother you, Railway’s Hobby plan (~$5/mo) stays always-on. Same `api/` folder and start command as above.

---

## 2. Deploy the frontend on Vercel

### Dashboard

1. [vercel.com/new](https://vercel.com/new) → import your Git repository.
2. **Framework preset:** Vite
3. **Root directory:** `web`
4. **Build command:** `npm run build`
5. **Output directory:** `dist`
6. **Environment variables** (Production):

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable / anon key |
| `VITE_API_URL` | Render/Railway API URL (**no** trailing slash) |

7. **Deploy**

`web/vercel.json` rewrites all routes to `index.html` for React Router.

### CLI

```bash
cd web
npx vercel login
npx vercel link
npx vercel env add VITE_SUPABASE_URL
npx vercel env add VITE_SUPABASE_ANON_KEY
npx vercel env add VITE_API_URL
npx vercel --prod
```

---

## 3. Connect production URLs

After Vercel gives you `https://your-app.vercel.app`:

1. **API** — update `CORS_ORIGIN` and `WEB_APP_URL` to that URL; redeploy/restart the API service.
2. **Supabase** → **Authentication → URL configuration**:
   - **Site URL:** `https://your-app.vercel.app`
   - **Redirect URLs:** `https://your-app.vercel.app/**`
3. Confirm **Google OAuth** redirect URI matches the API host.
4. If you changed any `VITE_*` variable, **redeploy Vercel** (Vite bakes them at build time).

---

## 4. Verify

1. Open the Vercel URL → sign up / log in.
2. **Overview** shows stats (API + database OK).
3. **Profile → Connect Gmail** redirects back to the Vercel app after OAuth.

---

## Custom domains (optional)

| Service | Example |
|---------|---------|
| Vercel | `app.yourdomain.com` |
| Render/Railway | `api.yourdomain.com` |

Update `VITE_API_URL`, `CORS_ORIGIN`, `WEB_APP_URL`, Supabase URLs, and Google redirect URIs to match.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| API calls fail (CORS) | Add exact Vercel origin to API `CORS_ORIGIN` |
| 404 on `/outreach` refresh | Ensure `web/vercel.json` is deployed |
| Wrong API URL in browser | Fix `VITE_API_URL` and **redeploy Vercel** |
| Gmail callback error | `GMAIL_REDIRECT_URI` must match Google Console exactly |
| API won’t start | Check `DATABASE_URL` and `SUPABASE_URL` |
| Gmail sync times out | API may be cold — retry after ~1 min; or ping `/health` every 14 min |
| Render suspended my service | Used all **750 free hours** this month; wait for reset or upgrade |
| `Root directory "api" does not exist` | **Settings → Build & Deploy → Root Directory** must be **blank** (repo root) with current `render.yaml`, or exactly `api` if build commands omit the `api/` prefix. Clear `web` or any other value, save, then **Manual Deploy** |

---

## Security

- Only `VITE_*` public keys belong on Vercel.
- Never put `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, or Supabase `service_role` in the frontend.
- Rotate any secrets that were ever committed to git.
