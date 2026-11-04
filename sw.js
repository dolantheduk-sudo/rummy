// Shanghai Rummy service worker
// - keeps a copy of the app so it opens even with a bad connection (and never shows the browser's error page)
// - shows push notifications and opens the game when one is tapped
const CACHE = "rummy-v2";
const SHELL = ["./", "index.html", "manifest.json", "icon.png", "icon-192.png", "icon-maskable.png"];
const CDN = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const OFFLINE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shanghai Rummy</title><style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
font-family:-apple-system,system-ui,sans-serif;color:#fff;text-align:center;padding:24px;background:radial-gradient(ellipse at 50% 35%,#1a8f58,#0b4a2d 60%,#04200f)}
img{width:96px;height:96px;border-radius:22px}h1{margin:0;font-size:24px}p{margin:0;opacity:.8}
button{font:inherit;font-weight:800;border:0;border-radius:14px;padding:13px 22px;background:linear-gradient(180deg,#fff6c8,#f7d25a 35%,#c8921a 62%,#f9dd78);color:#3a2600}</style></head>
<body><img src="icon.png" alt=""><h1>You're offline</h1><p>Shanghai Rummy needs the internet to play.<br>Your game is saved — nothing is lost.</p>
<button onclick="location.reload()">↻ Try again</button></body></html>`;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // The page itself: always try the network first (so updates show up right away), fall back to the saved copy.
  if (req.mode === "navigate" || (url.origin === location.origin && SHELL.some((s) => url.pathname.endsWith(s.replace("./", "/")) ))) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const c = await caches.open(CACHE); c.put(req.mode === "navigate" ? "index.html" : req, res.clone()); }
        return res;
      } catch (err) {
        const hit = await caches.match(req.mode === "navigate" ? "index.html" : req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === "navigate") return new Response(OFFLINE_PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
        throw err;
      }
    })());
    return;
  }
  // Fonts and the connection library: use the saved copy, refresh it in the background.
  if (CDN.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
  // Everything else (game data, photos, sounds) goes straight to the network.
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Shanghai Rummy", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || "rummy",
    renotify: true,
    data: { url: d.url || self.registration.scope }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const scope = self.registration.scope;
  const url = new URL((e.notification.data && e.notification.data.url) || scope, scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const game = wins.find((w) => w.url.startsWith(scope));     // only the rummy game, not other pages on the site
    if (game) {
      try { await game.focus(); } catch (err) {}
      try { if (game.url !== url && "navigate" in game) await game.navigate(url); } catch (err) {}
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
