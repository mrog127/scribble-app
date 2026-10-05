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
const CACHE = 'scribble-shell-v4'   // bumped whenever the app icons change (same filenames, so the old ones stay cached)

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

  // Page loads: network first so a deploy is picked up — but only for a moment.
  // On a slow or flaky connection, waiting on the network made every open sit on
  // a blank screen, so after 1.2s the cached page is served instead (the network
  // copy still lands in the cache for next time). Offline, the cache answers at once.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const network = fetch(request).then(async (fresh) => {
        if (fresh.ok) (await caches.open(CACHE)).put('/index.html', fresh.clone())
        return fresh
      })
      network.catch(() => {})          // a late failure after the cache answered is fine
      const cachedSoon = new Promise(resolve => setTimeout(async () => resolve(await caches.match('/index.html')), 1200))
      try {
        const first = await Promise.race([network, cachedSoon])
        if (first) return first
        return await network            // nothing cached yet: wait for the network
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

// ---- Morning summary push ----
// Sent by the morning-summary edge function. iOS requires every push to show a
// notification, so this always shows one.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'Easels', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'morning-summary',
    data: { url: data.url || '/' },
  }))
})

// Tapping the notification brings Scribble forward (or opens it) on the Gallery.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin)) return w.focus()
    }
    return self.clients.openWindow(url)
  })())
})
