-- Scheduled activation: an item (todo / note / link) can be scheduled to
-- automatically become "activated" on a chosen calendar date.
--
-- scheduled_date holds the target date. When that date arrives a daily job
-- flips the item to activated = true and clears scheduled_date.
--
-- Run this whole file in the Supabase SQL editor.

-- 1. Add the column to all three item tables.
alter table public.todos add column if not exists scheduled_date date;
alter table public.notes add column if not exists scheduled_date date;
alter table public.links add column if not exists scheduled_date date;

-- 2. Activation function: promote every item whose scheduled date is today
--    or earlier, then clear the schedule so it doesn't run again.
create or replace function public.activate_due_scheduled()
returns void
language sql
security definer
as $$
  update public.todos
     set activated = true, scheduled_date = null
   where scheduled_date is not null and scheduled_date <= current_date;

  update public.notes
     set activated = true, scheduled_date = null
   where scheduled_date is not null and scheduled_date <= current_date;

  update public.links
     set activated = true, scheduled_date = null
   where scheduled_date is not null and scheduled_date <= current_date;
$$;

-- 3. Schedule the function to run once a day.
--    Requires the pg_cron extension (Supabase: Database > Extensions > enable "pg_cron").
create extension if not exists pg_cron;

-- Run a moment after midnight UTC every day. Re-running this select is safe:
-- it unschedules any previous job of the same name first.
select cron.unschedule('activate-scheduled-items')
  where exists (select 1 from cron.job where jobname = 'activate-scheduled-items');

select cron.schedule(
  'activate-scheduled-items',
  '5 0 * * *',
  $$ select public.activate_due_scheduled(); $$
);

-- Note on timezone: current_date here is evaluated in the database timezone
-- (UTC on Supabase). Items therefore activate at the start of the target date
-- in UTC. The app also runs the same promotion client-side on load, so an item
-- never appears stuck "scheduled" past its date once the app is opened.
