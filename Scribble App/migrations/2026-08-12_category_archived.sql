-- Archiving for easels (categories). Archived easels are hidden from the tab
-- bar, search, Save to / Move to pickers and every easel list; they appear only
-- in the Archived section of the Tabs card on the Settings page.
-- Defaults to false so existing easels stay active.
-- Run this in the Supabase SQL editor.

alter table public.categories
  add column if not exists archived boolean not null default false;
