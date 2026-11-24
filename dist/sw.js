'use strict';

const CACHE_NAME = 'mono-pwa-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './theme.js',
  './motion.js',
  './services.js',
  './trend.js',
  './panels.js',
  './import.js',
  './investments.js',
  './app.js',
  './backup-store.js',
  './backup.js',
  './style.css',
  './panels.css',
  './dock.css',
  './batch.css',
  './backup.css',
  './changes.css',
  './interactions.css',
  './import.css',
  './investments.css',
  './mono.svg',
  './apple-touch-icon.png',
  './terrain.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never intercept cross-origin API calls (quotes, kline, Vision AI, Worker)
  if (url.origin !== self.location.origin) return;

  // Network-first for same-origin app shell so deployments arrive promptly while staying offline-ready
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(cached => cached || caches.match('./index.html')))
  );
});
