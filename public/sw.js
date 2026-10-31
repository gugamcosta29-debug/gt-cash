// Guarda só os arquivos do app, para abrir mais rápido. Dados financeiros nunca entram no cache.
const CACHE = 'gt-cash-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request)
      if (r.ok) (await caches.open(CACHE)).put(e.request, r.clone())
      return r
    } catch {
      return (await caches.match(e.request)) ?? (await caches.match('./')) ?? Response.error()
    }
  })())
})
