const CACHE_NAME = 'taftish-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './offline.html',
  './assets/styles.css',
  './assets/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin.includes('supabase.co') || url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match('./offline.html')));
    return;
  }
  event.respondWith(fetch(event.request).then(response => {
    const clone = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
    return response;
  }).catch(async () => (await caches.match(event.request)) || caches.match('./offline.html')));
});