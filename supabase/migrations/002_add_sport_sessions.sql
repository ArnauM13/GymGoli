-- Migration: add sport_sessions table
-- Run this in Supabase Dashboard → SQL Editor → New query

create table sport_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users not null,
  date             date not null,
  sport            text not null check (sport in ('football', 'padel', 'running')),
  duration_minutes integer,
  notes            text,
  created_at       timestamptz default now(),
  unique (user_id, date, sport)  -- one session per sport per day
);

alter table sport_sessions enable row level security;

create policy "users own sport_sessions"
  on sport_sessions for all
  using (user_id = auth.uid());

create index sport_sessions_user_id_date_idx on sport_sessions (user_id, date desc);
