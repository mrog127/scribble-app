// A list item, note or link page opened on its own, in a separate window
// (computers: the "open in new window" button beside Done). The window's URL
// carries ?solo=<type>:<id>; the app then shows just that page, full window,
// and its Done button reads Close and closes the window.
//
// The windows keep each other informed over a BroadcastChannel, so the main
// window knows which pages are out in their own windows (their rows show the
// open-in-window mark and a tap brings that window forward), and reloads its
// data the moment one of them closes.

import { inFlight } from './outbox.js'

const raw = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('solo') : null
export const soloItem = raw && raw.includes(':')
  ? { type: raw.slice(0, raw.indexOf(':')), id: raw.slice(raw.indexOf(':') + 1) }
  : null
if (soloItem) document.documentElement.classList.add('solo-window')

export const DONE_LABEL = soloItem ? 'Close' : 'Done'

export const soloKey = (type, id) => `${type}:${id}`
const soloUrl = (key) => `${location.origin}/?solo=${encodeURIComponent(key)}`
const winName = (key) => `easels-${key.replace(':', '-')}`

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('easels-solo') : null
const openKeys = new Set()
const listeners = new Set()
const closedListeners = new Set()
const winRefs = new Map()
const notify = () => listeners.forEach(fn => fn(new Set(openKeys)))

export function subscribeSolo(fn) { listeners.add(fn); fn(new Set(openKeys)); return () => listeners.delete(fn) }
export function onSoloClosed(fn) { closedListeners.add(fn); return () => closedListeners.delete(fn) }
export const isSoloOpen = (type, id) => openKeys.has(soloKey(type, id))

function markClosed(key) {
  if (!openKeys.delete(key)) return
  winRefs.delete(key)
  notify()
  closedListeners.forEach(fn => fn(key))
}

if (channel) {
  channel.addEventListener('message', (e) => {
    const m = e.data || {}
    if (soloItem) {
      // A main window asking which pages are out: answer for this one
      if (m.t === 'who') channel.postMessage({ t: 'open', key: soloKey(soloItem.type, soloItem.id) })
      return
    }
    if (m.t === 'open' && m.key && !openKeys.has(m.key)) { openKeys.add(m.key); notify() }
    if (m.t === 'closed' && m.key) markClosed(m.key)
  })
  if (soloItem) {
    const key = soloKey(soloItem.type, soloItem.id)
    channel.postMessage({ t: 'open', key })
    // (Only the real one — Close fires a stand-in first to flush unsaved edits,
    // and the main window must not reload before those have landed)
    window.addEventListener('pagehide', (e) => { if (!e.isTrusted) return; try { channel.postMessage({ t: 'closed', key }) } catch {} })
  } else {
    // Just opened (or reloaded): find out which pages are already out
    channel.postMessage({ t: 'who' })
  }
}

// Backstop for a window shut without saying so (a crash, a force quit)
if (!soloItem) {
  setInterval(() => winRefs.forEach((w, key) => { if (w.closed) markClosed(key) }), 1000)
}

// Browser: a 720-wide popup window. Installed web app: a second app window.
// The window opens at once (it has to, inside the click), blank in the app's
// colour, and is pointed at the page once anything just saved here has
// reached the server — so it never opens on an older copy of the page.
export function openSoloWindow(type, id) {
  const key = soloKey(type, id)
  const h = Math.round((window.screen?.availHeight || 900) * 0.85)
  const left = Math.max(0, (window.screen?.availWidth || 1440) - 720 - 48)
  const w = window.open('', winName(key), `popup=yes,width=720,height=${h},left=${left},top=48`)
  if (!w) { window.open(soloUrl(key), '_blank'); return }
  try {
    const bg = getComputedStyle(document.querySelector('.phone') || document.body).backgroundColor
    w.document.body.style.background = bg
  } catch { /* cross-origin already: it's the page itself */ }
  winRefs.set(key, w)
  openKeys.add(key)
  notify()
  const started = Date.now()
  const go = () => {
    if (w.closed) { markClosed(key); return }
    if (inFlight() > 0 || Date.now() - started < 650) { setTimeout(go, 40); return }
    w.location.replace(soloUrl(key))
  }
  setTimeout(go, 0)
}

// Bring a page's own window to the front (reopening it if it's been lost)
export function focusSoloWindow(type, id) {
  const key = soloKey(type, id)
  const w = winRefs.get(key)
  if (w && !w.closed) { w.focus(); return }
  const again = window.open(soloUrl(key), winName(key))
  if (again) { winRefs.set(key, again); again.focus() }
}
