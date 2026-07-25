// Обработчик web-push (импортируется в сгенерированный vite-plugin-pwa service worker)
self.addEventListener("push", (event) => {
  let data = { title: "pospat", body: "" };
  try { if (event.data) data = event.data.json(); }
  catch (_) { if (event.data) data.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title || "pospat", {
    body: data.body || "",
    icon: "/pospat/icon-192.png",
    badge: "/pospat/icon-192.png",
    data: data.data || {},
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/pospat/";
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => {
    const c = cs.find((x) => "focus" in x);
    return c ? c.focus() : self.clients.openWindow(url);
  }));
});
