alter table public.tracker_entries
  add column if not exists referral text not null default '';
