# HTTP API

Base URL: `http://localhost:8080`

Unauthenticated:

- `GET /health` → `{ "status": "ok" }`

All `/api/v1/*` routes require `Authorization: Bearer <supabase access token>`.

Errors: `{ "error": "message" }` with 400, 401, 404, or 500.

JSON uses camelCase. Timestamps are RFC3339.

## Profile

- `GET /api/v1/me`
- `PATCH /api/v1/me` body: `{ "fullName", "timezone" }`
- `GET /api/v1/stats` dashboard counts by status

## Entities

Each of companies, contacts, jobs, conversations, outreach-events, reminders:

- `GET /api/v1/{collection}` list (`q`, `limit`; `status` / `type` / `open` where noted)
- `POST /api/v1/{collection}` create
- `GET /api/v1/{collection}/{id}`
- `PUT /api/v1/{collection}/{id}` replace writable fields
- `DELETE /api/v1/{collection}/{id}` 204

Collections:

| Path               | List filters        |
|--------------------|---------------------|
| `/companies`       | `q`                 |
| `/contacts`        | `q`                 |
| `/jobs`            | `q`, `status`       |
| `/conversations`   | `q`, `status`       |
| `/outreach-events` | `q`, `status`, `type` |
| `/reminders`       | `open=true\|false` (default true) |

Create/update bodies match the dashboard forms. Empty strings for optional UUIDs and URLs are stored as null.

Outreach `occurredAt` and reminder `dueAt` are RFC3339. Reminder `completed: true` sets `completedAt` to now; `false` clears it.
