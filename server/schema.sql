-- Supabase / Postgres schema. Run once in Supabase → SQL Editor.
-- (Locally the site uses SQLite and creates its own table automatically.)

create table if not exists public.birthday_messages (
  id            bigint generated always as identity primary key,
  sender_name   text not null,
  hint          text not null,
  password_hash text not null,
  message       text not null,
  image_urls    jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.rate_limits (
  key      text primary key,
  count    int not null,
  reset_at timestamptz not null
);

-- Row Level Security with no policies = nobody can read these tables through
-- Supabase's public API. Our server connects directly and is unaffected.
alter table public.birthday_messages enable row level security;
alter table public.rate_limits enable row level security;
