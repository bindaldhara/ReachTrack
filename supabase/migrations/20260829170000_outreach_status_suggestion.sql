alter table public.outreach_events
  add column if not exists status_suggestion text
    check (status_suggestion is null or status_suggestion in ('rejected')),
  add column if not exists status_suggestion_reason text not null default '',
  add column if not exists status_suggestion_snippet text not null default '';
