// Keeps the app shell available offline. Same-origin files are fetched from the
// network first so a new deployment is used immediately; the cache is only a fallback.
// Firebase and other cross-origin requests are never intercepted.
const CACHE = 'maison-v1';
const SHELL = ['./', './index.html', './styles.css', './main.js', './config.js', './manifest.webmanifest', './assets/favicon.svg', './assets/icon-192.png', './data/catalog.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then(cached => cached ?? (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
