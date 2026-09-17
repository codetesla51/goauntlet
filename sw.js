/* GOAUNTLET service worker: offline shell, live everything-else.
   Strategy: network-first for the app shell (fresh code always wins; cache
   is only the offline fallback), /data/*.json and /api/* always hit network
   so content edits and compilation stay live. Bump CACHE to force-refresh. */
const CACHE = 'goauntlet-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let path = '';
  try { path = new URL(req.url).pathname; } catch (_) { return; }
  if (path.indexOf('/data/') === 0 || path.indexOf('/api/') === 0) return; // live
  e.respondWith(
    fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
  );
});
