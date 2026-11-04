// Shanghai Rummy service worker: shows push notifications and opens the game when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Shanghai Rummy", {
    body: d.body || "",
    icon: "icon.png",
    badge: "icon.png",
    tag: d.tag || "rummy",
    renotify: true,
    data: { url: d.url || self.registration.scope }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const scope = self.registration.scope;                       // e.g. https://dolantheduk-sudo.github.io/rummy/
  const url = new URL((e.notification.data && e.notification.data.url) || scope, scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Only reuse a tab/window that is actually the rummy game (not some other page on the same site).
    const game = wins.find((w) => w.url.startsWith(scope));
    if (game) {
      try { await game.focus(); } catch (err) {}
      try { if (game.url !== url && "navigate" in game) await game.navigate(url); } catch (err) {}
      return;
    }
    // Nothing open: open the game straight to the right table.
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
