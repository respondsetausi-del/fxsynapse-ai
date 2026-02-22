const CACHE_NAME = "fxsynapse-v13";
const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// Install — cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and API/auth requests
  if (request.method !== "GET") return;
  if (request.url.includes("/api/")) return;
  if (request.url.includes("/auth/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(request).then((cached) => {
          return cached || caches.match("/dashboard");
        });
      })
  );
});
