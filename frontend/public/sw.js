const CACHE_NAME = "dyna-learn-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/dyna-learn-doc-icon.png",
  "/dyna-learn-logo-blue.png",
  "/manifest.webmanifest"
];

// Install: Cache static app shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Never cache API calls, cache static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip API calls & non-GET requests
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Network-first for navigation requests (HTML)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Stale-while-revalidate for local static assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
  }
});
