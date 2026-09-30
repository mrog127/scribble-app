-- Morning summary push notifications.
--
-- Each phone that turns on "Morning summary" in Settings saves its push
-- subscription here, along with the time zone its clock is set to (kept up to
-- date every time the app is opened). Every 15 minutes pg_cron calls the
-- morning-summary edge function, which sends each phone a summary of the
-- Gallery's active list items at 9:30am in that phone's time zone — once a day,
-- and only if there are active list items.
--
-- Needs the pg_cron extension (already on for scheduled activation) and
-- pg_net, which this file turns on.
--
-- Run this whole file in the Supabase SQL editor.

-- 0. The scheduler (pg_cron) — newer projects don't have it on by default.
create extension if not exists pg_cron with schema pg_catalog;

-- 1. Where each phone's push subscription lives.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  time_zone    text not null default 'America/New_York',
  last_sent_on date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 2. Each user can only see and change their own phones.
alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2b. Newer Supabase projects don't grant table access automatically: the app
--     (signed-in users) and the edge function (service_role) both need it.
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;
-- The summary reads your lists to build the message
grant select on public.categories, public.projects, public.todos to service_role;

-- 3. pg_net lets the database call the edge function.
create extension if not exists pg_net;

-- 4. Every 15 minutes, ask the edge function to send any summaries that are due.
--    Re-running this file is safe: it replaces any previous job of the same name.
select cron.unschedule('morning-summary-push')
  where exists (select 1 from cron.job where jobname = 'morning-summary-push');

select cron.schedule(
  'morning-summary-push',
  '*/15 * * * *',
  $$
    select net.http_post(
      url     := 'https://exhvqqtlhblpebijtrbe.supabase.co/functions/v1/morning-summary',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
