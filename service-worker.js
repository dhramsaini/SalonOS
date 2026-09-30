const CACHE_NAME = 'salonos-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let Supabase/API calls pass straight through
  if (/\.(mp4|webm)$/i.test(url.pathname)) return; // guide videos: streamed by the browser (range requests), never cached here

  // Network-first for the app shell so users always get the latest version when online,
  // falling back to cache when offline. The page itself and version.json skip the browser's
  // HTTP cache (GitHub Pages lets it keep them 10 minutes), so a release reaches people at once;
  // the js/ files carry ?v= so they are always the matching release anyway.
  const fresh = req.mode === 'navigate' || /(\/|index\.html|version\.json)$/.test(url.pathname);
  event.respondWith(
    (fresh ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req))
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
