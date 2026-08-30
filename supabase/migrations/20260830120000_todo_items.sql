-- Todo lists: emails to send and companies to reach out (removed when marked done).

create table public.todo_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null default '',
  recipient text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index todo_emails_user_id_idx on public.todo_emails (user_id);
create index todo_emails_created_at_idx on public.todo_emails (user_id, created_at desc);

create trigger todo_emails_set_updated_at
before update on public.todo_emails
for each row execute function public.set_updated_at();

create table public.todo_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  name text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index todo_companies_user_id_idx on public.todo_companies (user_id);
create index todo_companies_created_at_idx on public.todo_companies (user_id, created_at desc);

create trigger todo_companies_set_updated_at
before update on public.todo_companies
for each row execute function public.set_updated_at();

alter table public.todo_emails enable row level security;
alter table public.todo_companies enable row level security;

create policy todo_emails_own on public.todo_emails
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy todo_companies_own on public.todo_companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
