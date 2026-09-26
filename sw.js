/* 深大寺MAP：圏外でも開けるようにするための Service Worker
   ・ページ本体は「ネット優先（3秒で待ちきれなければ保存分）」
   ・写真・フォント・地図タイルなどは「保存分を先に出し、裏で更新」 */
const VERSION = "jindaiji-v1";
const PRECACHE = ["./", "index.html", "hero.jpg", "manifest.json", "icon-192.png", "apple-touch-icon.png"];
const CACHEABLE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req, timeoutMs) {
  const cache = await caches.open(VERSION);
  const fetched = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
  const timer = new Promise((resolve) => setTimeout(resolve, timeoutMs, null));
  try {
    const res = await Promise.race([fetched, timer]);
    if (res) return res;
  } catch (_) { /* 圏外 → 保存分へ */ }
  const hit = (await cache.match(req)) || (await cache.match("index.html"));
  return hit || fetched;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => {
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await update) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, 3000));
    return;
  }
  if (url.origin === location.origin || CACHEABLE_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
  // 天気API（open-meteo）などはそのままネットへ
});
