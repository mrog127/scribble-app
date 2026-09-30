// Morning summary push notifications.
//
// The phone subscribes once (from Settings); the subscription is saved to
// public.push_subscriptions along with the phone's current time zone. A
// Supabase edge function (supabase/functions/morning-summary) runs every 15
// minutes and sends each phone its summary at 9:30am in that time zone.
//
// iOS only allows push for a web app opened from its Home Screen icon.

import { supabase, functionsUrl, functionsKey } from './supabaseClient'

// Public half of the VAPID key pair. The private half lives only in Supabase
// secrets (and the git-ignored .env.push).
const VAPID_PUBLIC_KEY = 'BA390uL8APy46nVLoyB9sF1c7hn7_tp1aZO1ecRnbtRMKSB_1ybFFpbxpIIYhXtOM5W_n1Xd0Ca7ZhfO55qXtA4'

const currentTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' }
  catch { return 'America/New_York' }
}

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, ch => ch.charCodeAt(0))
}

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) || null
}

// 'on' | 'off' | 'denied' | 'needs-install' | 'unsupported'
export async function getMorningSummaryState() {
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  const sub = await currentSubscription()
  if (!sub) return 'off'
  // Only 'on' if the server knows about this phone too
  const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle()
  return data ? 'on' : 'off'
}

// Must be called straight from a tap — iOS only shows the prompt in a gesture.
export async function enableMorningSummary() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'off'
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: session.user.id,
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    time_zone: currentTimeZone(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) { console.warn('[push] save failed', error); return 'off' }
  return 'on'
}

export async function disableMorningSummary() {
  const sub = await currentSubscription()
  if (!sub) return 'off'
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  try { await sub.unsubscribe() } catch { /* already gone */ }
  return 'off'
}

// Sends this account's summary right now, to check everything is wired up.
export async function sendTestSummary() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const res = await fetch(`${functionsUrl}/morning-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: functionsKey,
      'x-user-token': session.access_token,
    },
    body: JSON.stringify({ test: true }),
  })
  return res.ok
}

// Keep the saved time zone matching the phone's clock, so 9:30 follows you
// when you travel. Runs on open and whenever the app comes back to the front.
async function syncTimeZone() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const sub = await currentSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions')
      .update({ time_zone: currentTimeZone(), updated_at: new Date().toISOString() })
      .eq('endpoint', sub.endpoint)
      .neq('time_zone', currentTimeZone())
  } catch { /* offline — try again next open */ }
}

export function installPushSync() {
  window.addEventListener('load', () => { setTimeout(syncTimeZone, 2000) })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncTimeZone()
  })
}
