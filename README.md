# ReachTrack

Track every job outreach — Gmail, LinkedIn, or a careers page — without a spreadsheet.

Days 1–2 foundation: React dashboard, FastAPI backend, Supabase Postgres, auth, user profiles, and core CRM entities.

## Stack

- **Web:** Vite, React, TypeScript, Tailwind CSS, shadcn/ui
- **API:** Python (FastAPI + asyncpg)
- **Data + auth:** Supabase (Postgres + Auth)

## Quick start

See [docs/setup.md](docs/setup.md) for credentials and the database migration.

```bash
# API
cd api && cp .env.example .env   # fill in DATABASE_URL and SUPABASE_URL
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
# or from repo root: make api

# Web (another terminal)
cd web && cp .env.example .env   # fill in VITE_SUPABASE_* and VITE_API_URL
npm run dev
```

Open http://localhost:5173, create an account, then add companies, contacts, jobs, outreach events, and reminders.

Optional: connect Gmail from **Profile** after setting `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `api/.env` (see [docs/setup.md](docs/setup.md)).

## Docs

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [HTTP API](docs/api.md)
- [Setup](docs/setup.md)
