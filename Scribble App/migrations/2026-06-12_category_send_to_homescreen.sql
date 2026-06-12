-- Per-category toggle for whether its activated items aggregate to the homescreen.
-- Defaults to true so existing categories keep current behavior.
-- Run this in the Supabase SQL editor.

alter table public.categories
  add column if not exists send_to_homescreen boolean not null default true;
