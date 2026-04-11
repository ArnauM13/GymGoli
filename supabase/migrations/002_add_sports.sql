-- Migration: add sports + sport_sessions tables
-- Run this in Supabase Dashboard → SQL Editor → New query

-- ── Sports catalogue (user-configurable list) ─────────────────────────────────

create table sports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null,
  name       text not null,
  icon       text not null default 'sports',
  color      text not null default '#006874',
  created_at timestamptz default now(),
  unique (user_id, name)
);

alter table sports enable row level security;

create policy "users own sports"
  on sports for all
  using (user_id = auth.uid());

create index sports_user_id_idx on sports (user_id);

-- ── Sport sessions ────────────────────────────────────────────────────────────

create table sport_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  date             date not null,
  sport_id         uuid references sports not null,
  duration_minutes integer,
  notes            text,
  created_at       timestamptz default now(),
  unique (user_id, date, sport_id)  -- one session per sport per day
);

alter table sport_sessions enable row level security;

create policy "users own sport_sessions"
  on sport_sessions for all
  using (user_id = auth.uid());

create index sport_sessions_user_id_date_idx on sport_sessions (user_id, date desc);
