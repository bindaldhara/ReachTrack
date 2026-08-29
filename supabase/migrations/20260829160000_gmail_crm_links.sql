alter table public.conversations
  add column if not exists gmail_thread_id text;

create unique index if not exists conversations_user_gmail_thread_uidx
  on public.conversations (user_id, gmail_thread_id)
  where gmail_thread_id is not null and gmail_thread_id <> '';

create unique index if not exists contacts_user_email_uidx
  on public.contacts (user_id, lower(email))
  where email is not null and email <> '';
