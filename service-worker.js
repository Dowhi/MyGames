// ═══════════════════════════════════════════════════════════════
//  MyGames — service-worker.js
//  Cache-first strategy with versioned cache busting
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME = 'mygames-v1.7.1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './mygames.js',
  './mahjong.js',
  './solitaire.js',
  './manifest.json',
];

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(err => console.warn('Pre-cache error:', err)))
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
        }).catch(err => {
          // If navigation fails, use cached index.html
          if (event.request.mode === 'navigate') {
             return caches.match('./index.html');
          }
          // For other requests, just throw so browser shows error (or we could return a placeholder)
          throw err;
        });
      })
  );
});
