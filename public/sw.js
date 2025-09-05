const CACHE = "smashboard-v1";

// Precache core shell (add more files if you want)
const PRECACHE = ["/", "/index.html", "/manifest.json"];

// Install: cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for others
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isHTML = req.headers.get("accept")?.includes("text/html");
  if (isHTML) {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req))
  );
});
