/* ============================================================
   LingReader — service worker
   ------------------------------------------------------------
   Trzyma aplikacje w pamieci telefonu (dziala offline) i pilnuje
   aktualizacji. Przy kazdej nowej wersji aplikacji zmien WERSJA —
   to wystarczy, zeby telefon pobral nowe pliki.
   ============================================================ */

const WERSJA = 'lr-v7';
const CACHE = 'lingreader-' + WERSJA;

// Pliki, bez ktorych aplikacja nie ruszy — pobierane z gory.
const RDZEN = [
  './',
  './index.html',
  './slownik.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // pojedynczy brakujacy plik nie moze wywalic calej instalacji
      await Promise.all(RDZEN.map(u => c.add(u).catch(err => console.warn('SW: pominieto', u, err))));
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const klucze = await caches.keys();
    await Promise.all(klucze.filter(k => k !== CACHE && k.startsWith('lingreader-')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Aplikacja prosi o natychmiastowe przelaczenie na nowa wersje
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'WERSJA') {
    e.source && e.source.postMessage({ typ: 'WERSJA', wersja: WERSJA });
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Google, Firebase itd. — nie ruszamy

  // HTML: najpierw siec, zeby aktualizacja pojawiala sie od razu;
  // gdy sieci brak — wersja z pamieci.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith((async () => {
      try {
        const swieze = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, swieze.clone());
        return swieze;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(req)) || (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Reszta (slownik, ikony): najpierw pamiec — szybko i offline,
  // a w tle odswiezamy na nastepny raz.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const zpamieci = await c.match(req);
    const zsieci = fetch(req).then(r => {
      if (r && r.status === 200) c.put(req, r.clone());
      return r;
    }).catch(() => null);
    return zpamieci || (await zsieci) || Response.error();
  })());
});
