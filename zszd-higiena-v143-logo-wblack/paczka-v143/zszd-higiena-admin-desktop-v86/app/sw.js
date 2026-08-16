// sw.js — Service Worker dla Serwisu Nadziewarek v1
const CACHE_NAME = 'zszd-higieny-admin-cache-v64';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './satelity.js',
  './obecnosc.js',
  './magazyn.js',
  './szkolenia.js',
  './zuzycie.js',
  './manifest.json',
  './assets/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nie przechwytuj żądań cross-origin (np. CDN dla xlsx/jsPDF/QR/Tesseract)
  if (url.origin !== location.origin) return;

  // Nawigacja (otwarcie/odświeżenie strony) — ZAWSZE najpierw próbuj sieci, żeby
  // złapać nową wersję natychmiast. Cache tylko jako fallback offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Pozostałe zasoby statyczne (JS, CSS, ikony) — cache-first dla szybkości offline
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
