-- Recurring list items.
--
-- recurrence  : null / 'never' | 'weekly' | 'monthly' | 'yearly'
-- recur_anchor: the occurrence the next one is measured from, so checking an
--               item off late doesn't drift the series.
--
-- Checking off a recurring item doesn't complete it — the app unchecks it,
-- deactivates it and schedules the next occurrence. The existing
-- activate_due_scheduled() job then re-activates it on that date.
--
-- Run this whole file in the Supabase SQL editor.

alter table public.todos add column if not exists recurrence text;
alter table public.todos add column if not exists recur_anchor date;
