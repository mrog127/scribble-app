/* Scribble service worker.
 *
 * Two jobs:
 *  1. Serve the app shell from cache, so opening the app offline works and a
 *     normal open doesn't re-download the bundle.
 *  2. Nothing else — data lives in IndexedDB (see src/localCache.js) and
 *     failed writes are queued by the page (see src/outbox.js). Supabase
 *     requests are never cached.
 *
 * Bump CACHE when the caching strategy itself changes; the build's own hashed
 * filenames handle ordinary deploys.
 */
const CACHE = 'scribble-shell-v1'

self.addEventListener('install', () => {
  // Take over as soon as the new worker is ready
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

const isShellAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/assets/') ||
   /\.(js|css|png|svg|webmanifest|woff2?)$/.test(url.pathname))

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return               // writes always go to the network

  const url = new URL(request.url)

  // Page loads: network first so a deploy is picked up, cache as the fallback
  // that makes an offline open work at all.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        const cache = await caches.open(CACHE)
        cache.put('/index.html', fresh.clone())
        return fresh
      } catch {
        const cached = await caches.match('/index.html')
        return cached || Response.error()
      }
    })())
    return
  }

  // Build output is content-hashed, so a cache hit is always the right file.
  if (isShellAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const fresh = await fetch(request)
      if (fresh.ok) (await caches.open(CACHE)).put(request, fresh.clone())
      return fresh
    })())
    return
  }

  // Google Fonts: cache once so the app doesn't look unstyled offline.
  if (url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      try {
        const fresh = await fetch(request)
        if (fresh.ok) (await caches.open(CACHE)).put(request, fresh.clone())
        return fresh
      } catch {
        return cached || Response.error()
      }
    })())
  }

  // Everything else (Supabase) falls through to the network untouched.
})
