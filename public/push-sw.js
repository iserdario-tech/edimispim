// Обработчик web-push (импортируется в сгенерированный vite-plugin-pwa service worker)
self.addEventListener("push", (event) => {
  let data = { title: "едим и спим", body: "" };
  try { if (event.data) data = event.data.json(); }
  catch (_) { if (event.data) data.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title || "едим и спим", {
    body: data.body || "",
    icon: "/edimispim/icon-192.png",
    badge: "/edimispim/icon-192.png",
    data: data.data || {},
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/edimispim/";
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => {
    const c = cs.find((x) => "focus" in x);
    return c ? c.focus() : self.clients.openWindow(url);
  }));
});
