// Morning summary: at 9:30am in each phone's own time zone, push a summary of
// the Gallery's active list items (not notes or links), in Gallery order.
//
//   Title: "Easels • 5 active items"
//   Body:  "Reach out to Sergio…, Charge outdoor cameras, …"
//
// Called every 15 minutes by pg_cron (migrations/2026-09-18_morning_summary_push.sql).
// Each call only sends to phones where it's currently 9:30–9:59 and that haven't
// had today's summary yet, so calling it extra times is harmless.
//
// Test: POST { "test": true } with header x-user-token = a signed-in user's
// access token sends that user's summary immediately (Settings → Send a test).
//
// Deploy with JWT verification OFF.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'https://scribble.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

type Sub = {
  id: string; user_id: string; endpoint: string; p256dh: string; auth: string;
  time_zone: string; last_sent_on: string | null;
};

// Local date (YYYY-MM-DD), hour and minute in a time zone.
function localNow(tz: string) {
  let zone = tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'America/New_York'; }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(p => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour, minute: +parts.minute };
}

// The Gallery's Lists card, same rules as ActivePage.jsx: Easels that aren't
// archived and send to the Gallery, canvases that aren't archived, activated
// and unchecked list items; Easel order → canvas order → item order, then a
// stable sort by the Gallery's own drag order (unset sorts last).
async function galleryListItems(userId: string): Promise<string[]> {
  const [{ data: cats }, { data: projs }, { data: todos }] = await Promise.all([
    sb.from('categories').select('id, sort_order, send_to_homescreen, archived')
      .eq('user_id', userId).order('sort_order'),
    sb.from('projects').select('id, category_id, sort_order, archived')
      .eq('user_id', userId).order('sort_order'),
    sb.from('todos').select('text, project_id, sort_order, home_sort_order, checked, activated')
      .eq('user_id', userId).eq('activated', true).not('project_id', 'is', null).order('sort_order'),
  ]);

  const items: { text: string; home: number }[] = [];
  for (const cat of cats || []) {
    if (cat.archived === true || cat.send_to_homescreen === false) continue;
    for (const proj of (projs || []).filter(p => p.category_id === cat.id)) {
      if (proj.archived === true) continue;
      for (const t of (todos || []).filter(t => t.project_id === proj.id)) {
        if (t.checked) continue;
        items.push({ text: (t.text || '').trim(), home: t.home_sort_order ?? Infinity });
      }
    }
  }
  items.sort((a, b) => a.home - b.home);
  return items.map(i => i.text).filter(Boolean);
}

function summaryPayload(texts: string[]) {
  const n = texts.length;
  let body = texts.join(', ');
  if (body.length > 1500) body = body.slice(0, 1497) + '…';
  return JSON.stringify({
    title: `Easels • ${n} active item${n === 1 ? '' : 's'}`,
    body,
    url: '/',
    tag: 'morning-summary',
  });
}

// Returns false if the subscription is dead (phone unsubscribed / app removed).
async function send(sub: Sub, payload: string): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { TTL: 60 * 60 * 4, urgency: 'normal' },
    );
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      await sb.from('push_subscriptions').delete().eq('id', sub.id);
      return false;
    }
    console.error('[morning-summary] send failed', code, (e as Error).message);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let body: { test?: boolean } = {};
  try { body = await req.json(); } catch { /* cron sends {} */ }

  // ---- Test: this user's summary, right now ----
  if (body.test) {
    const token = req.headers.get('x-user-token') || '';
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: 'not signed in' }, 401);
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', user.id);
    const texts = await galleryListItems(user.id);
    const payload = texts.length
      ? summaryPayload(texts)
      : JSON.stringify({ title: 'Easels • 0 active items', body: 'Test — nothing in your Gallery Lists right now, so no summary would be sent.', url: '/', tag: 'morning-summary' });
    let sent = 0;
    for (const s of (subs || []) as Sub[]) if (await send(s, payload)) sent++;
    return json({ sent, items: texts.length });
  }

  // ---- Scheduled run ----
  const { data: subs, error } = await sb.from('push_subscriptions').select('*');
  if (error) return json({ error: error.message }, 500);

  const cache = new Map<string, string[]>();
  let sent = 0;
  for (const s of (subs || []) as Sub[]) {
    const now = localNow(s.time_zone);
    if (now.hour !== 9 || now.minute < 30) continue;   // 9:30–9:59 local
    if (s.last_sent_on === now.date) continue;          // already sent today

    if (!cache.has(s.user_id)) cache.set(s.user_id, await galleryListItems(s.user_id));
    const texts = cache.get(s.user_id)!;
    if (texts.length === 0) continue;                   // nothing active: no notification

    if (await send(s, summaryPayload(texts))) {
      sent++;
      await sb.from('push_subscriptions').update({ last_sent_on: now.date }).eq('id', s.id);
    }
  }
  return json({ sent });
});
