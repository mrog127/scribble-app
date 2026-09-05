// Offline write queue.
//
// Every mutation in AppContext updates local state first and sends the request
// fire-and-forget. Online that's fine; offline the request dies and the edit is
// lost the next time the server's version loads. This keeps those requests.
//
// A Supabase query builder doesn't run until it's awaited, and it exposes the
// request it would make (url / method / headers / body) — so a failed one can be
// replayed later as a plain fetch, with a fresh access token swapped in.

import { supabase } from './supabaseClient'

const KEY = 'scribble_outbox'
const MAX = 500

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
const write = (queue) => {
  try { localStorage.setItem(KEY, JSON.stringify(queue.slice(-MAX))) } catch { /* full */ }
}

const listeners = new Set()
export function subscribePending(fn) {
  listeners.add(fn)
  fn(read().length)
  return () => listeners.delete(fn)
}
const announce = () => { const n = read().length; listeners.forEach(fn => fn(n)) }

// Pull the request out of a postgrest builder so it can be re-sent later.
// Only valid AFTER the builder has been awaited: it fills in the content and
// profile headers as it executes.
function serialize(builder) {
  try {
    const url = String(builder.url || '')
    if (!url) return null
    const h = builder.headers
    const headers = h instanceof Headers ? Object.fromEntries(h.entries()) : { ...(h || {}) }
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      method: builder.method || 'POST',
      headers,
      body: builder.body === undefined ? undefined : JSON.stringify(builder.body),
      at: Date.now(),
    }
  } catch { return null }
}

function enqueue(entry) {
  if (!entry) return
  const queue = read()
  queue.push(entry)
  write(queue)
  announce()
}

// postgrest-js turns a failed fetch into a RESOLVED { error } rather than a
// rejection, so a dropped connection looks much like a rejected write. Tell them
// apart by the shape: a real PostgREST error carries a code, a network one
// doesn't — and it reads like a fetch failure.
const NETWORKY = /fetch|network|load failed|connection|offline|timed? ?out|dns/i

const isOfflineError = (err) => {
  if (!err) return false
  if (!navigator.onLine) return true
  if (err instanceof TypeError) return true
  if (err.code) return false   // PostgREST / Postgres said no — retrying won't help
  return NETWORKY.test(err.message || '')
}

// Send a builder, queueing it if the network is what failed.
// Resolves to the builder's own { data, error }, so an insert can still read
// back the row it created. A queued write resolves with no data — the caller's
// optimistic id stands until the next load.
export async function send(builder, label = 'write') {
  try {
    const { data, error } = await builder
    if (error) {
      if (isOfflineError(error)) {
        enqueue(serialize(builder))
        return { data: null, error: null, queued: true }
      }
      console.error(`Supabase write failed [${label}]:`, error.message || error)
    }
    return { data, error }
  } catch (err) {
    if (isOfflineError(err)) {
      enqueue(serialize(builder))
      return { data: null, error: null, queued: true }
    }
    console.error(`Supabase write failed [${label}]:`, err?.message || err)
    return { data: null, error: err }
  }
}

let flushing = false

// Replay whatever is waiting, oldest first, stopping at the first network
// failure so ordering is preserved.
export async function flush() {
  if (flushing || !navigator.onLine) return 0
  const queue = read()
  if (!queue.length) return 0
  flushing = true
  let sent = 0
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    while (queue.length) {
      const entry = queue[0]
      const headers = { ...entry.headers }
      // The token the request was built with is likely stale by now
      if (token) headers.Authorization = `Bearer ${token}`
      try {
        const res = await fetch(entry.url, { method: entry.method, headers, body: entry.body })
        // Not signed in (yet): the session may just need refreshing, so hold the
        // whole queue rather than throwing the writes away.
        if (res.status === 401 || res.status === 403) break
        // Any other 4xx/5xx means the server saw it and said no. Dropping it is
        // the only way forward — holding it would block every later write.
        if (!res.ok) console.error('Queued write rejected:', entry.method, res.status)
      } catch {
        break   // still offline — leave this one and everything after it
      }
      queue.shift()
      write(queue)
      announce()
      sent++
    }
  } finally {
    flushing = false
  }
  // Local state was built from optimistic ids; the rows now on the server have
  // real ones. Ask whoever's listening to reload so the two line up.
  if (sent) window.dispatchEvent(new CustomEvent('scribble:outbox-flushed', { detail: { sent } }))
  return sent
}

export function installOutbox() {
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush() })
  flush()
}

export const pendingCount = () => read().length
