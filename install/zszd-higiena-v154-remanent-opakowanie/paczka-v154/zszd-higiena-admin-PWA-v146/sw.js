// sw.js — Service Worker dla ZSZD Higieny
//
// NAPRAWA (Aug 2026): poprzednia wersja używała cache-first dla plików JS
// (magazyn.js, app.js itd.) ze STAŁĄ nazwą cache — to oznaczało, że raz
// zapisana wersja kodu JS zostawała "zamrożona" na zawsze, nawet gdy na
// serwerze pojawiały się nowe wersje. Strona HTML się odświeżała (miała
// lepszą strategię), ale kod JS pod spodem — nie, więc nowe przyciski/funkcje
// były niewidoczne/nieaktywne mimo aktualizacji. Teraz WSZYSTKIE zasoby tego
// originu (nie tylko nawigacja) najpierw próbują sieci — offline nadal
// działa (fallback do cache), ale online zawsze dostajesz najświeższy kod.
const CACHE_NAME = 'zszd-higieny-admin-cache-v65';
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
  './harmonogram-codzienny.js',
  './harmonogram-cykliczny.js',
  './firebase-sync.js',
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

  // Nie przechwytuj żądań cross-origin (np. CDN dla Firebase/xlsx)
  if (url.origin !== location.origin) return;

  // Sieć ZAWSZE pierwsza — dla WSZYSTKICH zasobów tego originu (nawigacja
  // ORAZ pliki JS/CSS/ikony), nie tylko dla samej strony HTML. Cache służy
  // wyłącznie jako zapasowa kopia, gdy nie ma internetu — dzięki temu
  // aktualizacje kodu JS działają natychmiast, tak samo jak aktualizacje
  // samej strony, bez potrzeby ręcznego czyszczenia pamięci podręcznej.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
