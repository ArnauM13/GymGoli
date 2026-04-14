-- Migration: add sport subtypes (stored as JSONB) and subtype_id to sessions
-- Run this in Supabase Dashboard → SQL Editor → New query

-- Add optional subtypes array to each sport definition
alter table sports
  add column if not exists subtypes jsonb not null default '[]'::jsonb;

-- Add optional subtype selection to each session
alter table sport_sessions
  add column if not exists subtype_id text;
