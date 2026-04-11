-- GymGoli – Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ── Tables ────────────────────────────────────────────────────────────────────

create table exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  category    text not null check (category in ('push', 'pull', 'legs')),
  subcategory text,
  notes       text,
  created_at  timestamptz default now()
);

create table workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  date        date not null,
  entries     jsonb not null default '[]',
  categories  text[] not null default '{}',
  category    text,
  notes       text,
  created_at  timestamptz default now(),
  unique (user_id, date)   -- one workout per user per day (enforced by DB)
);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table exercises enable row level security;
alter table workouts  enable row level security;

create policy "users own exercises"
  on exercises for all
  using (user_id = auth.uid());

create policy "users own workouts"
  on workouts for all
  using (user_id = auth.uid());

-- ── Indexes (optional, for performance) ──────────────────────────────────────

create index exercises_user_id_idx on exercises (user_id);
create index workouts_user_id_date_idx on workouts (user_id, date desc);

-- ── Sport sessions ────────────────────────────────────────────────────────────

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

-- ── Realtime (enable for workouts table) ──────────────────────────────────────
-- Run this or enable via Dashboard → Database → Replication → supabase_realtime publication

alter publication supabase_realtime add table workouts;
