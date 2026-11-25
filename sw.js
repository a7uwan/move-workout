// MOVE Service Worker v9 — network-first for app shell, cache-first for images.
// Network-first means opening the GitHub Pages URL always fetches the latest code.
// If offline, falls back to the cache.
const CACHE = 'move-pwa-v13-fixes';
const IMG_CACHE = 'move-images-v1';
const IMG_MAX = 80;
const SHELL = [
  './', './index.html', './manifest.json',
  './css/style.css', './css/features.css', './css/theme-glass.css',
  './js/config.js', './js/api.js', './js/database.js',
  './js/workout-engine.js', './js/stats.js', './js/routines.js',
  './js/builder.js', './js/theme.js', './js/history.js', './js/app.js'
];

// Install: pre-cache shell files.
self.addEventListener('install', event => {
  // skipWaiting activates the new SW immediately without waiting for tabs to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  );
});

// Activate: take control of all clients immediately, then remove old caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k)))
      )
    ])
  );
});

// Allow clients to trigger skipWaiting (e.g. pull-to-refresh).
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});

// Trim image cache to IMG_MAX entries.
async function trimImages(cache) {
  const keys = await cache.keys();
  if (keys.length <= IMG_MAX) return;
  await Promise.all(keys.slice(0, keys.length - IMG_MAX).map(k => cache.delete(k)));
}

// Cross-origin images: cache-first (they don't change often).
async function imageFromCache(request) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') {
      await cache.put(request, res.clone());
      trimImages(cache);
    }
    return res;
  } catch (_) {
    return Response.error();
  }
}

// Same-origin app shell: network-first with cache fallback.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(request);
    return cached || cache.match('./index.html');
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Cross-origin images → cache-first.
  if (event.request.destination === 'image' && url.origin !== self.location.origin) {
    event.respondWith(imageFromCache(event.request));
    return;
  }

  // Apps Script and other cross-origin requests → straight to network.
  if (url.origin !== self.location.origin) return;

  // Same-origin → network-first.
  event.respondWith(networkFirst(event.request));
});
