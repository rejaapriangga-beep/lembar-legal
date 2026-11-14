// Service worker: aplikasi tetap bisa dibuka tanpa internet. Naikkan VERSION setiap kali
// berkas aplikasi berubah supaya pengguna mendapat versi terbaru.
const VERSION = 'lembar-web-2';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'assets/app.css',
  'assets/js/app.js', 'assets/js/ui.js', 'assets/js/model.js', 'assets/js/db.js', 'assets/js/crypto.js',
  'assets/js/ink.js', 'assets/js/ads.js',
  'assets/fonts/jakarta.woff2', 'assets/fonts/bricolage.woff2', 'assets/fonts/caveat.woff2',
  'assets/icons/icon-32.png', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Berkas sendiri: ambil dari jaringan dulu (supaya selalu terbaru), jatuh ke cache saat offline.
// Permintaan ke domain lain (iklan) tidak disentuh.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))),
  );
});
