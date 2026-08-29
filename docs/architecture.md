# Architecture

ReachTrack is a job-outreach tracker. Days 1–2 establish the shared foundation later capture sources (Gmail, Chrome extension, mobile share) will write into.

```
React dashboard (Vite + shadcn)
        │  Bearer JWT (Supabase Auth)
        ▼
     FastAPI  (:8080 /api/v1)
        │  user_id from JWT.sub
        ▼
  Supabase Postgres
  Supabase Auth (email/password)
```

The dashboard uses `@supabase/supabase-js` only for sign-up, sign-in, and session refresh. All entity reads and writes go through the FastAPI backend so Gmail, the extension, and the mobile app can reuse the same endpoints.

## Auth

1. User signs up or signs in with email and password (Supabase Auth).
2. The access token is sent as `Authorization: Bearer <jwt>`.
3. Python validates the token's signature against the project's published JWKS (`SUPABASE_URL` + `/auth/v1/.well-known/jwks.json`) and takes `sub` as the user id. Tokens whose `role` is anything other than `authenticated` are rejected.
4. `GET /api/v1/me` upserts `profiles` so a row exists even if the signup trigger did not run.

## Multi-tenant isolation

Every table has `user_id` (or `profiles.id`). The API filters every query by the JWT user. Row Level Security is also enabled as defense in depth for any future PostgREST access.

## Statuses

Shared pipeline values on jobs, conversations, and outreach events:

Sent, Waiting, Replied, Follow-up Due, Interview, Rejected, Closed

Stored as `sent`, `waiting`, `replied`, `follow_up_due`, `interview`, `rejected`, `closed`.

First-touch mail (`cold_email`, `referral_request`, `application`) with no company reply becomes `waiting` right away, then **`follow_up_due`** after `FOLLOW_UP_DUE_DAYS` (default **1** day) **only if you have not already sent a follow-up** in that Gmail thread. Dashboard counts and outreach filters compute this from `occurred_at` and linked `follow_up` rows (matched by `gmail_thread_id` or normalized subject).

## Gmail OAuth

Profile → **Connect Gmail** starts a Google OAuth flow handled by the Go API:

1. `GET /api/v1/integrations/gmail/authorize` returns a Google URL (signed `state` ties the callback to the Supabase user).
2. Google redirects to `GET /api/v1/integrations/gmail/callback`; the API exchanges the code, stores tokens in `gmail_connections`, and redirects to the web app.
3. Tokens never leave the server. Disconnect revokes the refresh token and marks the row revoked.

Gmail message import uses stored tokens to fetch sent mail, classify each message with **rules** (thread position, reply headers, keyword lists — no AI), upsert **companies**, **contacts**, and **conversations** from the recipient and subject, and upsert `outreach-events` with `source=gmail` and `externalId` set to the Gmail message id (deduped per user).

## Later days (not in this slice)

- Days 3–5: Gmail import posts `outreach-events` with `source=gmail`
- Days 6–8: Chrome extension posts with `source=chrome_extension`
- Days 9–10: Mobile share posts with `source=mobile_share`
