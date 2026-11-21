/* Only same-origin app files are cached. No external API call is made by this worker. */
const VERSION = "6ad6bde83d130f8a";
const SHELL = [
  "./assets/favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/vendor/adhan-4.4.6.min.js",
  "./assets/vendor/adhan-LICENSE.txt",
  "./config.js",
  "./css/backgrounds.css",
  "./css/cards.css",
  "./css/settings.css",
  "./css/style.css",
  "./data/duas.json",
  "./data/exchange-rates.json",
  "./fonts/Cairo-OFL.txt",
  "./fonts/Cairo.woff2",
  "./fonts/LICENSE.txt",
  "./fonts/arabic-bold.woff2",
  "./fonts/arabic-regular.woff2",
  "./index.html",
  "./js/app-core.js",
  "./js/calendar-core.js",
  "./js/calendar.js",
  "./js/currency.js",
  "./js/duas.js",
  "./js/footer.js",
  "./js/location.js",
  "./js/prayer-core.js",
  "./js/prayers.js",
  "./js/preferences.js",
  "./js/pwa.js",
  "./js/weather.js",
  "./manifest.webmanifest",
  "./script.js"
];
const PREFIX = `dailyDashboard:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const path = url.href.slice(self.registration.scope.length).split("?")[0];
  if (request.mode === "navigate" && path && path !== "index.html") return;
  if (request.mode !== "navigate" && !SHELL.includes(`./${path}`)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (!response.ok) throw new Error("unavailable");
      if (request.mode !== "navigate" || !path || path === "index.html") await cache.put(request, response.clone());
      return response;
    } catch {
      const saved = await cache.match(request, { ignoreSearch: true }) || (request.mode === "navigate" ? await cache.match("./index.html") : null);
      if (!saved) return Response.error();
      const headers = new Headers(saved.headers); headers.set("X-DailyDashboard-Cache", "offline");
      return new Response(saved.body, { status: saved.status, statusText: saved.statusText, headers });
    }
  })());
});
