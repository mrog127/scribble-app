-- Scheduled (and daily recurring) items come back at LOCAL midnight.
--
-- The activation job used current_date, which is UTC on Supabase — so items
-- came due at 8pm Eastern the day before (7pm in winter). This compares against
-- the date in America/New_York instead, and runs the job a few minutes past
-- every hour so local midnight is always caught, whatever the DST offset.
--
-- Run this whole file in the Supabase SQL editor.

create or replace function public.activate_due_scheduled()
returns void
language sql
security definer
as $$
  update public.todos
     set activated = true,
         scheduled_date = null,
         home_sort_order = -extract(epoch from now())::bigint
   where scheduled_date is not null
     and scheduled_date <= (now() at time zone 'America/New_York')::date;

  update public.notes
     set activated = true,
         scheduled_date = null,
         home_sort_order = -extract(epoch from now())::bigint
   where scheduled_date is not null
     and scheduled_date <= (now() at time zone 'America/New_York')::date;

  update public.links
     set activated = true,
         scheduled_date = null,
         home_sort_order = -extract(epoch from now())::bigint
   where scheduled_date is not null
     and scheduled_date <= (now() at time zone 'America/New_York')::date;
$$;

select cron.unschedule('activate-scheduled-items')
  where exists (select 1 from cron.job where jobname = 'activate-scheduled-items');

select cron.schedule(
  'activate-scheduled-items',
  '5 * * * *',
  $$ select public.activate_due_scheduled(); $$
);
