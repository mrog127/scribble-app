-- Easel Gallery canvas: an Easel that is hidden from the Gallery shows its own
-- active items in a pinned "Gallery" canvas at the top of its Expanded state.
-- This column is the show/hide toggle for that card (three-dot menu →
-- "Display easel Gallery" / "Hide easel Gallery"). Defaults to shown.
--
-- Run this whole file in the Supabase SQL editor.

alter table public.categories add column if not exists show_gallery_canvas boolean not null default true;
