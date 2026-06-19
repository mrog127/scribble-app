-- Cross-project home-screen ordering.
--
-- The Active (home) page aggregates every activated todo / note / link from all
-- categories and projects into the Lists / Notes / Links cards. Previously each
-- item only carried a per-project sort_order, so items could never be intermixed
-- across projects on the home screen — they always re-grouped by project on load.
--
-- home_sort_order records each item's absolute position within its home-screen
-- card, independent of its project. It is set when the user drag-reorders items
-- on the home page. Items with a null value (e.g. freshly activated, not yet
-- manually ordered) sort to the end, preserving the old category→project order.
--
-- Run this whole file in the Supabase SQL editor.

alter table public.todos add column if not exists home_sort_order int;
alter table public.notes add column if not exists home_sort_order int;
alter table public.links add column if not exists home_sort_order int;
