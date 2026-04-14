-- Allow multiple workouts per day per user
-- Run in Supabase Dashboard → SQL Editor → New query
alter table workouts drop constraint if exists workouts_user_id_date_key;
