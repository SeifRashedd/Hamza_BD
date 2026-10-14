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

-- Uploaded photos. The random uuid is the photo's address (/api/images/<id>),
-- handed out only after the envelope's password is entered.
create table if not exists public.birthday_images (
  id         uuid primary key,
  message_id bigint not null references public.birthday_messages (id) on delete cascade,
  position   smallint not null,
  mime_type  text not null,
  data       bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists birthday_images_message_id_idx on public.birthday_images (message_id);

create table if not exists public.rate_limits (
  key      text primary key,
  count    int not null,
  reset_at timestamptz not null
);

-- Row Level Security with no policies = nobody can read these tables through
-- Supabase's public API. Our server connects directly and is unaffected.
alter table public.birthday_messages enable row level security;
alter table public.birthday_images enable row level security;
alter table public.rate_limits enable row level security;
