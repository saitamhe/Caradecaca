const CACHE = 'caradecaca-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/lobby.html',
  '/game.html',
  '/manifest.json',
  '/css/style.css',
  '/js/index.js',
  '/js/lobby.js',
  '/js/game.js',
  '/js/share.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Don't cache socket.io or API calls
  if (url.pathname.startsWith('/socket.io')) return;
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && ASSETS.some(a => url.pathname === a || url.pathname === a + '/')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
