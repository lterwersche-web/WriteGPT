// ─────────────────────────────────────────────────────────────
// sw.js – Service Worker: macht die App offline-fähig
// ─────────────────────────────────────────────────────────────
// Strategie "Netz zuerst": Mit Internet gibt's immer die neueste
// Version, ohne Internet die gespeicherte Kopie aus dem Cache.

const CACHE = 'writegpt-v3';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/state.js',
  './js/charsets.js',
  './js/glyphs.js',
  './js/random.js',
  './js/markdown.js',
  './js/edits.js',
  './js/layout.js',
  './js/render.js',
  './js/pdf.js',
  './js/export.js',
  './js/editor.js',
  './js/icons.js',
  './js/ui.js',
  './js/views/write.js',
  './js/views/font.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) ?? (await caches.match('./index.html'))),
  );
});
