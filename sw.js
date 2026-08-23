// nosirt service worker — v01.28
// Minimal: registers the PWA for home-screen install.
// No aggressive caching so Netlify deploys take effect immediately.
const CACHE_NAME = 'nosirt-v128';

self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', () => {
  // Intentionally no custom caching — keeps updates instant.
});
