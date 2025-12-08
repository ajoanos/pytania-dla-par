const CACHE_NAME = 'pary-mvp-v24';

const BASE_PATH = new URL('./', self.location).href;

const RELATIVE_ASSETS = [
  './',
  './index.html',
  './trio-challenge.html',
  './trio-challenge-room.html',
  './trio-challenge-waiting.html',
  './trio-challenge-board.html',
  './zdrapka-pozycji.html',
  './zdrapka-pozycji-play.html',
  './pozycje-na-czas.html',
  './pozycje-na-czas-play.html',
  './niegrzeczne-kolo.html',
  './niegrzeczne-kolo-play.html',
  './5-7-10.html',
  './5-7-10-room.html',
  './pytania-dla-par.html',
  './jak-dobrze-mnie-znasz.html',
  './plan-wieczoru.html',
  './plan-wieczoru-room.html',
  './plan-wieczoru-play.html',
  './room.html',
  './room-waiting.html',
  './room-invite.html',
  './nigdy-przenigdy.html',
  './nigdy-przenigdy-room.html',
  './nigdy-przenigdy-waiting.html',
  './jak-dobrze-mnie-znasz-room.html',
  './jak-dobrze-mnie-znasz-waiting.html',
  './admin-import.html',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/plan-wieczoru.js',
  './assets/js/room.js',
  './assets/js/invite.js',
  './assets/js/waiting-room.js',
  './assets/js/trio-challenge.js',
  './assets/js/import.js',
  './assets/js/zdrapka-pozycji.js',
  './assets/js/pozycje-na-czas.js',
  './assets/js/niegrzeczne-kolo.js',
  './assets/js/sekundy.js',
  './data/questions.json',
  './data/nigdy-przenigdy.json',
  './data/jak-dobrze-mnie-znasz.json',
  './assets/data/plan-wieczoru.json',
  './manifest.webmanifest',
];

const ASSETS = RELATIVE_ASSETS.map((path) => new URL(path, BASE_PATH).pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(
        ASSETS.map((url) =>
          cache.add(url).catch((error) => {
            console.warn(`Failed to cache ${url}:`, error);
            // Return null to indicate failure but don't throw
            return null;
          })
        )
      );
      // Optional: Check if core assets (like index.html, app.js) failed and throw if so.
      // For now, we proceed to allow the app to work online even if offline cache is partial.
    })
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
  if (request.url.includes('/api/')) {
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
            return caches.match(new URL('./index.html', BASE_PATH).pathname);
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
