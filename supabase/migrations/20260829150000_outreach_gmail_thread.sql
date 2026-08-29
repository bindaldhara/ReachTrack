-- Gmail thread id links first-touch mail to follow-ups in the same conversation.
alter table public.outreach_events
  add column if not exists gmail_thread_id text;

create index if not exists outreach_events_gmail_thread_idx
  on public.outreach_events (user_id, gmail_thread_id)
  where gmail_thread_id is not null and gmail_thread_id <> '';
