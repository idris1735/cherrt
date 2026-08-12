-- Phase 2, Slice 1: Richer member profiles.
-- Add optional biographical fields to the people table.

alter table public.people
  add column if not exists gender text,
  add column if not exists birthdate date,
  add column if not exists address text,
  add column if not exists email text,
  add column if not exists marital_status text,
  add column if not exists joined_at date,
  add column if not exists notes text;
