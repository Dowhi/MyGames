// ═══════════════════════════════════════════════════════════════
//  MyGames — service-worker.js
//  Cache-first strategy with versioned cache busting
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'mygames-v1.2.0';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './mygames.js',
  './mahjong.js',
  './onet.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Rajdhani:wght@400;500;600;700&display=swap',
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first, network fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Return offline fallback for navigation
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        });
      })
  );
});
