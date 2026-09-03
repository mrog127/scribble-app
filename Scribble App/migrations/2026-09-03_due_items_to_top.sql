-- Scheduled items that come due now slot in at the TOP of their homescreen card.
--
-- Home order is ascending and manual reordering writes 0…n, so a negative
-- home_sort_order sorts above every hand-placed item. Using -epoch means each
-- day's batch also lands above the batches that came due before it.
--
-- Run this whole file in the Supabase SQL editor. It only replaces the
-- activation function; the daily pg_cron job from
-- 2026-06-13_scheduled_activation.sql keeps calling it.

create or replace function public.activate_due_scheduled()
returns void
language sql
security definer
as $$
  update public.todos
     set activated = true,
         scheduled_date = null,
         home_sort_order = -extract(epoch from now())::bigint
   where scheduled_date is not null and scheduled_date <= current_date;

  update public.notes
     set activated = true,
         scheduled_date = null,
         home_sort_order = -extract(epoch from now())::bigint
   where scheduled_date is not null and scheduled_date <= current_date;

  update public.links
     set activated = true,
         scheduled_date = null,
         home_sort_order = -extract(epoch from now())::bigint
   where scheduled_date is not null and scheduled_date <= current_date;
$$;
