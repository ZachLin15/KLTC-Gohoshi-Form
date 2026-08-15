// Minimal hand-rolled service worker (no build-plugin dependency).
// Two strategies:
//  - App shell (JS/CSS/fonts/icons): cache-first. These are content-hashed
//    by Vite, so a cached copy is always correct until a new deploy changes
//    the filename — no staleness risk.
//  - API GET requests (/api/events...): stale-while-revalidate. Show the
//    cached response instantly (if any), then fetch a fresh one in the
//    background and update the cache for next time. This is what makes a
//    repeat visit feel instant even before the network reply arrives, while
//    still keeping data reasonably fresh.
const CACHE_VERSION = "kltc-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("kltc-") && k !== APP_SHELL_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache writes (signup, admin edits, etc.)

  const url = new URL(request.url);

  // Only handle same-origin app assets and same-origin /api/* GETs — leave
  // everything else (fonts.googleapis.com, admin session calls, etc.) alone.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/admin")) return; // never cache admin data

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  if (
    url.pathname.startsWith("/assets/") ||
    /\.(png|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, APP_SHELL_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    // update the cache in the background, but don't let a failed
    // revalidation surface as an unhandled rejection
    networkPromise.catch(() => {});
    return cached;
  }
  // no cached copy yet — this MUST reflect a real failure if the network
  // fails, rather than fabricating a fake "successful" empty response.
  // Silently returning [] here previously made real outages (e.g. hitting
  // the server mid cold-start) look identical to a genuinely empty
  // calendar, with no way for the page to know to retry.
  return networkPromise;
}
