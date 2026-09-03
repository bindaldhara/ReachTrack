-- Manual application tracker (YC, Wellfound, LinkedIn, email outreach — independent of Gmail import).
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS.

create table if not exists public.tracker_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_name text not null,
  applied_platform text not null default '',
  applied_at timestamptz,
  job_url text,
  linkedin_connected boolean not null default false,
  linkedin_notes text not null default '',
  email_connected boolean not null default false,
  email_notes text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracker_entries_user_id_idx on public.tracker_entries (user_id);
create index if not exists tracker_entries_created_at_idx on public.tracker_entries (user_id, created_at desc);

drop trigger if exists tracker_entries_set_updated_at on public.tracker_entries;
create trigger tracker_entries_set_updated_at
before update on public.tracker_entries
for each row execute function public.set_updated_at();

alter table public.tracker_entries enable row level security;

drop policy if exists tracker_entries_own on public.tracker_entries;
create policy tracker_entries_own on public.tracker_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
