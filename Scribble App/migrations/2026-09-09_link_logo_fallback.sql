-- Logo fallback for link tiles: when a site publishes no og:image, fall back to
-- its own icon (apple-touch-icon / largest declared icon).
--
-- image_is_icon : the stored image_url is a logo, not a page photo — the tile
--                 centres it (contain) instead of cropping it (cover)
-- image_bg      : the colour behind that logo, sampled from the icon's corners
--                 or taken from the site's theme-color; null means fall back to
--                 the tile's usual neutral fill
--
-- Run this whole file in the Supabase SQL editor.

alter table public.links add column if not exists image_is_icon boolean not null default false;
alter table public.links add column if not exists image_bg text;
