-- Cached preview image for links, so the grid can show the site's own hero
-- image (og:image) instead of a third-party screenshot.
--   image_url         the resolved og:image / twitter:image, null if none
--   image_fetched_at  set once we've looked, so pages without an image aren't
--                     re-fetched on every load
-- Run this in the Supabase SQL editor.

alter table public.links
  add column if not exists image_url text,
  add column if not exists image_fetched_at timestamptz;
