-- Link tile badge contrast: the badge sits over the top-left of the thumbnail,
-- so whether its icon should be dark or light depends on the photo underneath.
-- The link-preview function samples that patch and stores the answer.
--
-- true  = the patch is dark, so the badge draws a light icon
-- false = the patch is light (also the default), so it draws the dark icon
--
-- Run this whole file in the Supabase SQL editor.

alter table public.links add column if not exists image_corner_dark boolean not null default false;
