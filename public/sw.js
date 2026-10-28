/* Fox and Fiddle service worker: app shell cached for offline play.
   Hashed build assets are cache-first; navigations and API calls are network-first. */
const VERSION = 'ff-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache outcomes

  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put('/index.html', copy));
      return r;
    }).catch(() => caches.match('/index.html')));
    return;
  }

  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
      const copy = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
    }
    return r;
  })));
});
