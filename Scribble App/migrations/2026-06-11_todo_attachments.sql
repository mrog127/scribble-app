-- Todo attachments: notes and links remain owned by their project/category,
-- but can be optionally attached to an individual list item (todo).
-- Run this in the Supabase SQL editor.

alter table public.todos
  add column if not exists linked_note_ids text[] not null default '{}',
  add column if not exists linked_link_ids text[] not null default '{}';
