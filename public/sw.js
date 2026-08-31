const APP_SHELL_CACHE = "eduos-cbt-shell-v1";
self.addEventListener("install", () => {
  self.skipWaiting();
  console.log("[SW] installed — eduos-cbt-shell-v1");
});

self.addEventListener("activate", (_event) => {
  _event.waitUntil(self.clients.claim());
  console.log("[SW] activated — claiming clients");
  _event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith("eduos-cbt-") && n !== APP_SHELL_CACHE)
          .map((n) => {
            console.log("[SW] deleting old cache:", n);
            return caches.delete(n);
          })
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(APP_SHELL_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => {
              return cache.match(request);
            });
        })
      )
    );
    return;
  }
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/favicon") ||
    url.pathname === "/" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".ttf")
  ) {
    event.respondWith(
      caches.open(APP_SHELL_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached || new Response("", { status: 503 }));
        })
      )
    );
    return;
  }
});
