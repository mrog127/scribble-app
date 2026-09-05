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

// A dropped connection throws; a 4xx/5xx comes back as an error object. Only the
// first is worth retrying — a rejected write won't start working on a retry.
const isOffline = (err) =>
  !navigator.onLine ||
  err instanceof TypeError ||
  /fetch|network|load failed/i.test(err?.message || '')

// Send a builder, queueing it if the network is what failed.
export async function send(builder, label = 'write') {
  try {
    const { error } = await builder
    if (error) console.error(`Supabase write failed [${label}]:`, error.message || error)
    return { error }
  } catch (err) {
    if (isOffline(err)) {
      enqueue(serialize(builder))
      return { error: null, queued: true }
    }
    console.error(`Supabase write failed [${label}]:`, err?.message || err)
    return { error: err }
  }
}

let flushing = false

// Replay whatever is waiting, oldest first, stopping at the first network
// failure so ordering is preserved.
export async function flush() {
  if (flushing || !navigator.onLine) return
  const queue = read()
  if (!queue.length) return
  flushing = true
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
        // 4xx/5xx means the server saw it and said no — dropping it is the only
        // way forward, and holding the queue would block every later write.
        if (!res.ok) console.error('Queued write rejected:', entry.method, res.status)
      } catch {
        break   // still offline — leave this one and everything after it
      }
      queue.shift()
      write(queue)
      announce()
    }
  } finally {
    flushing = false
  }
}

export function installOutbox() {
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush() })
  flush()
}

export const pendingCount = () => read().length
