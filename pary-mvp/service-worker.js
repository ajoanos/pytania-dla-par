const CACHE_NAME = 'pary-mvp-v3';
const ASSETS = [
  '/pary-mvp/',
  '/pary-mvp/index.html',
  '/pary-mvp/pytania-dla-par.html',
  '/pary-mvp/room.html',
  '/pary-mvp/room-waiting.html',
  '/pary-mvp/admin-import.html',
  '/pary-mvp/assets/css/style.css',
  '/pary-mvp/assets/js/app.js',
  '/pary-mvp/assets/js/room.js',
  '/pary-mvp/assets/js/waiting-room.js',
  '/pary-mvp/assets/js/import.js',
  '/pary-mvp/data/questions.json',
  '/pary-mvp/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          if (response.ok && request.url.startsWith(self.location.origin)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.destination === 'document') {
            return caches.match('/pary-mvp/index.html');
          }
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Brak połączenia. Synchronizacja odpowiedzi wymaga dostępu do internetu.',
            }),
            {
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            }
          );
        });
    })
  );
});
