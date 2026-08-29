-- ReachTrack foundation schema
-- Run in the Supabase SQL editor (or via supabase db push).
-- Depends on auth.users provided by Supabase Auth.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Shared check constraints
-- ---------------------------------------------------------------------------
-- outreach_status: sent | waiting | replied | follow_up_due | interview | rejected | closed
-- outreach_type:   cold_email | referral_request | linkedin_dm | linkedin_reply | application
-- channel:         gmail | linkedin | careers_page | other
-- source:          manual | gmail | chrome_extension | mobile_share

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  domain text,
  website text,
  linkedin_url text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index companies_user_id_idx on public.companies (user_id);
create unique index companies_user_domain_uidx
  on public.companies (user_id, domain)
  where domain is not null and domain <> '';

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  linkedin_url text,
  title text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_id_idx on public.contacts (user_id);
create index contacts_company_id_idx on public.contacts (company_id);

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  title text not null,
  url text,
  location text not null default '',
  status text not null default 'sent'
    check (status in ('sent', 'waiting', 'replied', 'follow_up_due', 'interview', 'rejected', 'closed')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_user_id_idx on public.jobs (user_id);
create index jobs_company_id_idx on public.jobs (company_id);
create index jobs_status_idx on public.jobs (user_id, status);

create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Conversations (a thread with a contact on a channel)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  channel text not null default 'other'
    check (channel in ('gmail', 'linkedin', 'careers_page', 'other')),
  subject text not null default '',
  status text not null default 'sent'
    check (status in ('sent', 'waiting', 'replied', 'follow_up_due', 'interview', 'rejected', 'closed')),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations (user_id);
create index conversations_status_idx on public.conversations (user_id, status);
create index conversations_contact_id_idx on public.conversations (contact_id);

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Outreach events (one captured action)
-- ---------------------------------------------------------------------------
create table public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  type text not null default 'cold_email'
    check (type in ('cold_email', 'referral_request', 'linkedin_dm', 'linkedin_reply', 'application')),
  channel text not null default 'other'
    check (channel in ('gmail', 'linkedin', 'careers_page', 'other')),
  source text not null default 'manual'
    check (source in ('manual', 'gmail', 'chrome_extension', 'mobile_share')),
  status text not null default 'sent'
    check (status in ('sent', 'waiting', 'replied', 'follow_up_due', 'interview', 'rejected', 'closed')),
  subject text not null default '',
  body text not null default '',
  external_id text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outreach_events_user_id_idx on public.outreach_events (user_id);
create index outreach_events_status_idx on public.outreach_events (user_id, status);
create index outreach_events_conversation_id_idx on public.outreach_events (conversation_id);
create index outreach_events_occurred_at_idx on public.outreach_events (user_id, occurred_at desc);
create unique index outreach_events_user_external_uidx
  on public.outreach_events (user_id, source, external_id)
  where external_id is not null and external_id <> '';

create trigger outreach_events_set_updated_at
before update on public.outreach_events
for each row execute function public.set_updated_at();

-- Keep conversation status / last_event_at in sync with the latest event.
create or replace function public.sync_conversation_from_event()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_id is not null then
    update public.conversations
    set
      status = new.status,
      last_event_at = new.occurred_at,
      contact_id = coalesce(new.contact_id, contact_id),
      company_id = coalesce(new.company_id, company_id),
      job_id = coalesce(new.job_id, job_id)
    where id = new.conversation_id
      and user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists outreach_events_sync_conversation on public.outreach_events;
create trigger outreach_events_sync_conversation
after insert or update of status, occurred_at, conversation_id, contact_id, company_id, job_id
on public.outreach_events
for each row execute function public.sync_conversation_from_event();

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  outreach_event_id uuid references public.outreach_events (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind text not null default 'follow_up'
    check (kind in ('follow_up', 'reply_needed', 'interview')),
  due_at timestamptz not null,
  notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminders_user_id_idx on public.reminders (user_id);
create index reminders_due_at_idx on public.reminders (user_id, due_at)
  where completed_at is null;

create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security (defense in depth; Go uses the DB role and still filters by user_id)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.jobs enable row level security;
alter table public.conversations enable row level security;
alter table public.outreach_events enable row level security;
alter table public.reminders enable row level security;

create policy profiles_own on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy companies_own on public.companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy contacts_own on public.contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy jobs_own on public.jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy conversations_own on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy outreach_events_own on public.outreach_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy reminders_own on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
