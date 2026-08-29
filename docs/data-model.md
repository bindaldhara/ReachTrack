# Data model

Applied by `supabase/migrations/20260829120000_init.sql`.

## profiles

1:1 with `auth.users`. Created by trigger `on_auth_user_created` and also upserted by `GET /api/v1/me`.

| Column     | Notes                          |
|------------|--------------------------------|
| id         | PK, `auth.users.id`            |
| email      | from Auth                      |
| full_name  | from signup metadata           |
| timezone   | default `UTC`                  |

## companies

Employers. Unique `(user_id, domain)` when domain is set.

## contacts

People. Optional `company_id`.

## jobs

Roles. Optional `company_id`. `status` uses the shared pipeline.

## conversations

A thread with a contact on a channel (`gmail`, `linkedin`, `careers_page`, `other`). `status` is the current thread status. `last_event_at` updates when a linked outreach event is written.

## outreach_events

One captured action.

| Column           | Allowed values |
|------------------|----------------|
| type             | `cold_email`, `referral_request`, `linkedin_dm`, `linkedin_reply`, `application`, `follow_up`, `email_reply` |
| channel          | `gmail`, `linkedin`, `careers_page`, `other` |
| source           | `manual`, `gmail`, `chrome_extension`, `mobile_share` |
| status           | shared pipeline |
| external_id      | Gmail message id / LinkedIn thread id; unique per `(user_id, source)` when set |

## reminders

`kind`: `follow_up`, `reply_needed`, `interview`. Optional links to an outreach event and/or conversation. `completed_at` null means open.

## gmail_connections

Added by `supabase/migrations/20260829130000_gmail_connections.sql`. One active row per user (`revoked_at` null).

| Column            | Notes |
|-------------------|-------|
| google_email      | Connected Gmail address |
| access_token      | Server-only; not exposed via API |
| refresh_token     | Server-only; used for revoke/refresh |
| token_expires_at  | Access token expiry |
| scopes            | Granted OAuth scopes |
| connected_at      | When the connection was established |
| revoked_at        | Set on disconnect |

## Deletes

User delete cascades from `auth.users` → `profiles` → owned rows. Company/contact/job/conversation/event deletes set dependent FKs to null where the child should survive.
