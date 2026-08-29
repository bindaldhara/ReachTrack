-- Gmail OAuth connections (tokens accessed only by the Go API via DATABASE_URL)

create table public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  google_email text not null,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scopes text not null default '',
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index gmail_connections_active_user_uidx
  on public.gmail_connections (user_id)
  where revoked_at is null;

create trigger gmail_connections_set_updated_at
before update on public.gmail_connections
for each row execute function public.set_updated_at();

alter table public.gmail_connections enable row level security;

create policy gmail_connections_own on public.gmail_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
