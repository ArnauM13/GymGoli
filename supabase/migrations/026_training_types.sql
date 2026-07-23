-- Migration: user-configurable training types (the "Gym" workout categories)
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- Until now the three gym categories (push / pull / legs) were hard-coded. This
-- table lets every user manage their own list on top of those three defaults.
--
-- The id is TEXT (not uuid) so the built-in defaults can keep the stable ids
-- 'push' / 'pull' / 'legs' — the same values already stored in
-- exercises.category and workouts.category — with no data migration needed.
-- The primary key is composite so each user has their own 'push' row.

create table training_types (
  user_id    uuid references auth.users not null,
  id         text not null,
  name       text not null,
  icon       text not null default 'fitness_center',
  color      text not null default '#006874',
  muscles    text,
  sort_order integer not null default 0,
  created_at timestamptz default now(),
  primary key (user_id, id),
  unique (user_id, name)
);

alter table training_types enable row level security;

create policy "users own training_types"
  on training_types for all
  using (user_id = auth.uid());

create index training_types_user_id_idx on training_types (user_id);
