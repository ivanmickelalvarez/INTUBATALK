// INTUBATALK service worker — offline-first app shell.
// API calls are network-only (data freshness matters); everything else is cached.
const CACHE = "intubatalk-v10";
const SHELL = [
  "/", "/choose", "/nurse", "/board", "/dual", "/privacy", "/guidelines", "/404.html", "/manifest.webmanifest",
  "/css/base.css", "/css/patient.css", "/css/nurse.css",
  "/js/patient.js", "/js/nurse.js", "/js/needs.js",
  "/js/lib/util.js", "/js/lib/audio.js", "/js/lib/tts.js", "/js/lib/sync.js", "/js/lib/icons.js",  "/js/lib/ambient.js", "/js/lib/tilt3d.js", "/js/lib/feedback.js",
  "/icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data, no cache

  // New pages added later must not be cached as irreversible app-shell pins.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fetched = fetch(e.request).then((res) => {
        // refresh cache in background for same-origin GETs
        if (res && res.ok && e.request.method === "GET") {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => hit);
      return hit || fetched;
    })
  );
});
