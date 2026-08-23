const CACHE_NAME = 'shangri-la-frontier-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/logo/icons/logo-192.png',
  './assets/logo/icons/logo-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Network-first for the CDN (three.js) so updates still arrive when online;
  // cache-first for our own local files so the app still opens offline.
  const isLocal = req.url.startsWith(self.location.origin);
  if (isLocal) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }))
    );
  } else {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
  }
});
