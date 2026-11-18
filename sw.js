/**
 * LiveScan Mobile Forensic - PWA Service Worker (100% Autónomo / Offline-First)
 * Garantiza funcionamiento pericial completo en terreno sin señal celular ni internet.
 */

const CACHE_NAME = 'livescan-mobile-v2.5';

// Recursos críticos indispensables para arranque offline
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './css/app.css',
  './js/app.js',
  './js/modules/db.js',
  './js/modules/forensic_processor.js',
  './js/modules/afis_matcher.js',
  './js/modules/otg_usb.js',
  './js/modules/wifi_bridge.js',
  './js/modules/touchless_camera.js'
];

// Recursos opcionales que se cachean si existen
const OPTIONAL_ASSETS = [
  './icons/icon.png',
  './icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Cachear obligatoriamente todos los archivos nucleares del sistema
      await cache.addAll(CORE_ASSETS);

      // 2. Intentar cachear recursos secundarios sin bloquear si alguno falta
      for (const asset of OPTIONAL_ASSETS) {
        try {
          const res = await fetch(asset);
          if (res && res.status === 200) {
            await cache.put(asset, res);
          }
        } catch (e) {
          // Si no existe icon.png, no interrumpe la instalación offline
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
  // Estrategia Network-First para navegación y scripts (actualización inmediata de código)
  if (event.request.mode === 'navigate' || event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
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
      });
    })
  );
});
