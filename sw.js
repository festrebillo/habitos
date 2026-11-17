/* Service worker de Hábitos: guarda solo la cáscara de la app para abrir sin señal. Los datos viven en tu hoja de Google. */
const CACHE = "habitos-v0.5.0";
const FILES = ["./", "index.html", "habitos.css", "habitos.js", "core.js", "acceso.js", "config.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok && FILES.some((f) => u.pathname.endsWith(f.replace("./", "")) || u.pathname.endsWith("/"))) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
