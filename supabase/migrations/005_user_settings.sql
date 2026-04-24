-- Migration 005: user_settings table
-- Stores per-user configurable preferences as a JSONB document.

create table user_settings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users on delete cascade not null unique,
  settings   jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter table user_settings enable row level security;

create policy "users own settings"
  on user_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index user_settings_user_id_idx on user_settings (user_id);
