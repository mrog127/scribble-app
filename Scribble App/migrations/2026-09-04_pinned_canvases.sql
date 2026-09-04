-- Pinned canvases: a canvas can be mirrored at the top of the Gallery page.
--
-- pinned   : whether it shows in the Gallery's pinned section
-- pin_order: position within that section (ascending; a freshly pinned canvas
--            gets a value below the current minimum so it lands on top)
--
-- Run this whole file in the Supabase SQL editor.

alter table public.projects add column if not exists pinned boolean not null default false;
alter table public.projects add column if not exists pin_order integer;
