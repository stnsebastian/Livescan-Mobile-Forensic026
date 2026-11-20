/**
 * LiveScan Mobile Forensic - PWA Service Worker (100% Autónomo / Offline-First)
 * Compatible con Samsung Galaxy A06 / One UI / Android 14+ y navegadores modernos.
 */

const CACHE_NAME = 'livescan-mobile-v3.4';

// Recursos críticos indispensables para arranque offline
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon.png',
  './icons/icon-192.png',
  './css/app.css',
  './js/app.js',
  './js/modules/db.js',
  './js/modules/forensic_processor.js',
  './js/modules/afis_matcher.js',
  './js/modules/otg_usb.js',
  './js/modules/wifi_bridge.js',
  './js/modules/touchless_camera.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of CORE_ASSETS) {
        try {
          const res = await fetch(asset);
          if (res && res.status === 200) {
            await cache.put(asset, res);
          }
        } catch (e) {
          console.warn('[SW Install] Fallo al precachear:', asset);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Estrategia Network-First con fallback seguro a Cache
  if (event.request.mode === 'navigate' || event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      }).catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const fallback = (await caches.match('./index.html')) || (await caches.match('./'));
          if (fallback) return fallback;
        }
        return new Response('Modo Autónomo Offline', { status: 200, headers: { 'Content-Type': 'text/html' } });
      })
    );
    return;
  }

  // Para imágenes y recursos estáticos: Cache-First
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return new Response('', { status: 408 });
      });
    })
  );
});
