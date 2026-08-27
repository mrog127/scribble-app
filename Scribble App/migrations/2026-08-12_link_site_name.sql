-- The site's own name for a link (og:site_name), e.g. "Buck Mason" for
-- buckmason.com — shown on the link card instead of the user's link title.
-- Run this in the Supabase SQL editor.

alter table public.links
  add column if not exists site_name text;
