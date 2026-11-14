/* Fangbuch Service Worker: App offline verfügbar, Kartenkacheln zwischenspeichern, Daten- und Wetterabrufe immer live */
const VERSION = "fb-v5";
const SHELL = ["./", "index.html", "style.css", "core.js", "app.js", "predict.js", "config.js", "manifest.webmanifest", "icons/icon-192.png"];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => Promise.all(CDN.map(u => c.add(new Request(u, { mode: "cors" })).catch(() => {}))))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== "fb-tiles").map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.hostname.endsWith("supabase.co") || u.hostname.includes("open-meteo.com")) return; // immer live
  if (u.hostname === "tile.openstreetmap.org") {
    e.respondWith(caches.open("fb-tiles").then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // App-Dateien: zuerst Netz (damit Updates ankommen), sonst Zwischenspeicher
  e.respondWith(fetch(e.request).then(r => { if (r.ok && (u.origin === location.origin || CDN.includes(u.href))) caches.open(VERSION).then(c => c.put(e.request, r.clone())); return r; })
    .catch(() => caches.match(e.request).then(h => h || caches.match("index.html"))));
});
