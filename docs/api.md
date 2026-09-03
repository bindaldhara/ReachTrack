# HTTP API

Base URL: `http://localhost:8080`

Unauthenticated:

- `GET /health` → `{ "status": "ok" }`
- `GET /api/v1/integrations/gmail/callback` — Google OAuth redirect target (browser only)

All other `/api/v1/*` routes require `Authorization: Bearer <supabase access token>`.

Errors: `{ "error": "message" }` with 400, 401, 404, or 500.

JSON uses camelCase. Timestamps are RFC3339.

## Profile

- `GET /api/v1/me`
- `PATCH /api/v1/me` body: `{ "fullName", "timezone" }`
- `GET /api/v1/stats` dashboard counts — `outreachDashboard` has `firstMailSent`, `careersPageApplications`, `followUpsTaken`, `replies`, `possibleRejections` (AI suggestions to review), `rejections` (confirmed), `followUpDue`
- `GET /api/v1/tracker` manual application log — paginated `{ items, total, limit, offset }`. Query: `q`, `limit`, `offset`
- `POST /api/v1/tracker` create entry
- `PUT /api/v1/tracker/{id}` update entry
- `DELETE /api/v1/tracker/{id}` delete entry

Tracker body: `{ companyName, appliedPlatform, appliedAt, jobUrl, linkedinConnected, linkedinNotes, emailConnected, emailNotes, notes }` (`companyName` required).

## Gmail integration

Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the API. Returns `503` when not configured.

- `GET /api/v1/integrations/gmail` → `{ "connected": false }` or `{ "connected": true, "email", "connectedAt", "scopes" }`
- `GET /api/v1/integrations/gmail/authorize` → `{ "authorizationUrl" }` (redirect the browser here)
- `DELETE /api/v1/integrations/gmail` → `204` (revokes stored tokens)
- `POST /api/v1/integrations/gmail/sync-sent` body: `{ "date": "yesterday" }` or `{ "date": "2026-08-28" }` → `{ "date", "fetched", "imported", "updated", "byType", "rejectionsScanned", "rejectionsSuggested", "applicationsFetched", "applicationsImported" }` (classifies sent mail; scans inbox for application confirmations from ATS/careers platforms and LinkedIn; upserts companies, contacts, conversations, jobs, and outreach events; scans linked Gmail threads for possible rejections)
- `POST /api/v1/integrations/gmail/scan-rejections` → `{ "scanned", "suggested" }` (re-scan all first-touch outreach threads without re-importing sent mail)
- `POST /api/v1/outreach-events/{id}/confirm-suggestion` apply pending rejection suggestion
- `POST /api/v1/outreach-events/{id}/dismiss-suggestion` clear pending rejection suggestion

OAuth callback (`GET /api/v1/integrations/gmail/callback`) exchanges the code, stores tokens server-side, and redirects to `WEB_APP_URL/profile?gmail=connected` (or `?gmail=error` / `?gmail=denied`).

## Entities

Each of companies, contacts, jobs, conversations, outreach-events, reminders:

- `GET /api/v1/{collection}` list — returns `{ "items", "total", "limit", "offset" }` (not a bare array)
- Query: `limit` (default 50, max 200), `offset` (default 0), plus collection-specific filters below
- `POST /api/v1/{collection}` create
- `GET /api/v1/{collection}/{id}`
- `PUT /api/v1/{collection}/{id}` replace writable fields
- `DELETE /api/v1/{collection}/{id}` 204

Collections:

| Path               | List filters        |
|--------------------|---------------------|
| `/companies`       | `q`                 |
| `/contacts`        | `q`, `companyId`    |
| `/jobs`            | `q`, `status`       |
| `/conversations`   | `q`, `status`       |
| `/outreach-events` | `q`, `status`, `statusSuggestion`, `channel`, `channels` (comma-separated), `type`, `types` (comma-separated) |
| `/reminders`       | `open=true\|false` (default true), `kind`, `q` |

## Todo

Personal task lists under the sidebar **Todo** section. Marking an item **done** deletes it.

- `GET /api/v1/todo/summary` → `{ "emailCount", "companyCount" }` (sidebar badges)

| Path | List filters | Done |
|------|--------------|------|
| `/todo/emails` | `q`, `limit`, `offset` | `POST /api/v1/todo/emails/{id}/complete` → 204 (UI supports multi-select bulk complete) |
| `/todo/companies` | `q`, `limit`, `offset` | `POST /api/v1/todo/companies/{id}/complete` → 204 (UI supports multi-select bulk complete) |

Each also supports `GET` list (paginated `{ items, total, limit, offset }`), `POST` create, `PUT` update, and `DELETE`.

Todo email body: `{ "subject", "recipient", "notes" }` (at least one of `subject` or `recipient`).

Todo company body: `{ "name", "companyId", "notes" }` (`name` required).

Create/update bodies match the dashboard forms. Empty strings for optional UUIDs and URLs are stored as null.

Outreach `occurredAt` and reminder `dueAt` are RFC3339. Reminder `completed: true` sets `completedAt` to now; `false` clears it.
