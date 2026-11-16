// Letzte Version des alten Service Workers: loescht alle Offline-Daten der alten App,
// meldet sich ab und laedt offene Fenster neu, damit die Umzugsseite erscheint.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.map((n) => caches.delete(n)));
    await self.registration.unregister();
    const fenster = await self.clients.matchAll({ type: "window" });
    fenster.forEach((f) => f.navigate(f.url).catch(() => {}));
  })());
});
