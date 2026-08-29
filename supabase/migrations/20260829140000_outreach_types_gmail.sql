-- Add Gmail-specific outreach types for thread-aware import.

alter table public.outreach_events
  drop constraint if exists outreach_events_type_check;

alter table public.outreach_events
  add constraint outreach_events_type_check
  check (type in (
    'cold_email',
    'referral_request',
    'linkedin_dm',
    'linkedin_reply',
    'application',
    'follow_up',
    'email_reply'
  ));
