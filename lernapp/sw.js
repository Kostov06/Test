// Offline auf dem Haus: App-Gerüst und Stapel liegen im Cache.
// Bei jeder Änderung an Code oder Stapeln FASSUNG hochzählen.
const FASSUNG = "aeltestenrat-v1";
const GERUEST = [
  "./", "./index.html", "./manifest.webmanifest", "./assets/styles.css",
  "./src/main.js", "./src/dom.js", "./src/schema.js", "./src/store.js",
  "./src/leitner.js", "./src/decks.js", "./src/sitzung.js", "./src/stats.js",
  "./src/redaktion.js", "./src/karten/index.js", "./src/karten/couleur.js",
  "./src/karten/frage.js", "./src/karten/begriff.js", "./src/karten/lueckentext.js",
  "./src/karten/reihenfolge.js", "./decks/index.json",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(FASSUNG);
    await cache.addAll(GERUEST);
    // Die Stapel stehen im Manifest — so muss diese Liste nicht mitwachsen.
    try {
      const manifest = await (await fetch("./decks/index.json", { cache: "no-cache" })).json();
      await cache.addAll(manifest.stapel.map((id) => `./decks/${id}.json`));
    } catch { /* ohne Netz beim ersten Aufruf bleibt es beim Gerüst */ }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== FASSUNG) await caches.delete(name);
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (ev) => {
  if (ev.request.method !== "GET") return;
  ev.respondWith((async () => {
    const treffer = await caches.match(ev.request, { ignoreSearch: true });
    if (treffer) return treffer;
    try {
      const antwort = await fetch(ev.request);
      if (antwort.ok && new URL(ev.request.url).origin === location.origin) {
        (await caches.open(FASSUNG)).put(ev.request, antwort.clone());
      }
      return antwort;
    } catch (fehler) {
      const start = await caches.match("./index.html");
      if (start && ev.request.mode === "navigate") return start;
      throw fehler;
    }
  })());
});
