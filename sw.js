// nosirt service worker — v01.29
const CACHE_NAME = 'nosirt-v129';

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', () => { /* no custom caching — keep deploys instant */ });

// Periodic background sync — wakes the app to keep audio context alive
self.addEventListener('periodicsync', event => {
  if (event.tag === 'nosirt-keep-alive') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'background-wake', timestamp: Date.now() });
        });
      })
    );
  }
});
