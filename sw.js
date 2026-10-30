// Service Worker: macht die App installierbar und offline startfähig.
//
// WICHTIG bei Änderungen: die Zahl in CACHE_NAME hochzählen (z. B. v106 -> v181).
// Nur dann wirft der Browser den alten Zwischenspeicher weg und alle Spieler
// bekommen zuverlässig die neue Version. Das ist der einzige Handgriff, den man
// nach dem Bearbeiten von Dateien nicht vergessen darf.
const CACHE_NAME = "trollhouse-v416";

const DATEIEN = [
  "./",
  "index.html",
  "stil.css",
  "app.js",
  "manifest.json",
  "kern/firebase.js",
  "kern/ui.js",
  "kern/update-hinweis.js",
  "kern/teams.js",
  "kern/wertung.js",
  "kern/verlauf.js",
  "kern/buchstabeneingabe.js",
  "spiele/register.js",
  "spiele/schaetzfragen/spiel.js",
  "spiele/schaetzfragen/fragen.json",
  "spiele/denk-gleich/spiel.js",
  "spiele/denk-gleich/fragen.json",
  "spiele/zehn-treffer/spiel.js",
  "spiele/zehn-treffer/logik.js",
  "spiele/zehn-treffer/fragen.json",
  "spiele/reih-dich-ein/spiel.js",
  "spiele/reih-dich-ein/logik.js",
  "spiele/reih-dich-ein/fragen.json",
  "spiele/wer-ist-es/spiel.js",
  "spiele/wer-ist-es/fragen.json",
  "spiele/wann-war-es/spiel.js",
  "spiele/wann-war-es/jahre.json",
  "spiele/finto/spiel.js",
  "spiele/finto/fragen.json",
  "spiele/merks-dir/spiel.js",
  "bilder/merks-dir-emojis/kevin-rapper.png",
  "spiele/zeitgefuehl/spiel.js",
  "spiele/passgenau/spiel.js",
  "spiele/memory/spiel.js",
  "spiele/revier/spiel.js",
  "spiele/kartentausch/spiel.js",
  "spiele/schnellschuss/spiel.js",
  "spiele/revier/feld.js",
  "spiele/run/spiel.js",
  "spiele/groessenvergleich/spiel.js",
  "spiele/groessenvergleich/objekte.js",
  "spiele/groessenvergleich/silhouetten.js",
  "spiele/knobeln/spiel.js",
  "spiele/anleitungen.js?v=411",
  "spiele/anleitungen-daten.js?v=411",
  "spiele/doppelkopf/spiel.js",
  "spiele/tetris/spiel.js",
  "spiele/doppelkopf/regeln.js",
  "spiele/doppelkopf/karten.js?v=411",
  "spiele/laenderumrisse/spiel.js",
  "spiele/wo-liegts/spiel.js",
  "spiele/wo-liegts/staedte.js",
  "spiele/wo-liegts/geo.js",
  "spiele/wo-liegts/welt.json",
  "spiele/wo-liegts/de-grenzen.json",
  "spiele/laenderumrisse/laender.json",
  "spiele/stimmts/spiel.js",
  "spiele/stimmts/fragen.json",
  "spiele/imposter/spiel.js",
  "spiele/imposter/woerter.json",
  "spiele/fussball-auktion/spiel.js",
  "spiele/fussball-auktion/logik.js",
  "spiele/fussball-auktion/design.js",
  "spiele/fussball-auktion/anleitung.js",
  "spiele/fussball-auktion/karten.json",
  "bilder/fussball-auktion/spieler-it-1.png?v=335",
  "bilder/fussball-auktion/spieler-it-2.png?v=335",
  "bilder/fussball-auktion/spieler-it-3.png?v=335",
  "bilder/fussball-auktion/spieler-it-4.png?v=335",
  "bilder/fussball-auktion/spieler-it-5.png?v=335",
  "bilder/fussball-auktion/spieler-de-1.png?v=335",
  "bilder/doppelkopf-dame.webp",
  "bilder/doppelkopf/kreuz-9.webp?v=379",
  "bilder/doppelkopf/kreuz-10.webp?v=379",
  "bilder/doppelkopf/kreuz-bube.webp?v=379",
  "bilder/doppelkopf/kreuz-dame.webp?v=379",
  "bilder/doppelkopf/kreuz-koenig.webp?v=379",
  "bilder/doppelkopf/kreuz-ass.webp?v=379",
  "bilder/doppelkopf/pik-9.webp?v=379",
  "bilder/doppelkopf/pik-10.webp?v=379",
  "bilder/doppelkopf/pik-bube.webp?v=379",
  "bilder/doppelkopf/pik-dame.webp?v=379",
  "bilder/doppelkopf/pik-koenig.webp?v=379",
  "bilder/doppelkopf/pik-ass.webp?v=379",
  "bilder/doppelkopf/herz-9.webp?v=379",
  "bilder/doppelkopf/herz-10.webp?v=379",
  "bilder/doppelkopf/herz-bube.webp?v=379",
  "bilder/doppelkopf/herz-dame.webp?v=379",
  "bilder/doppelkopf/herz-koenig.webp?v=379",
  "bilder/doppelkopf/herz-ass.webp?v=379",
  "bilder/tetris-stein.webp",
  "bilder/knobeln-kachel.webp",
  "bilder/wer-ist-es-kachel.webp",
  "bilder/reih-dich-ein-kachel.webp",
  "bilder/merks-dir-karten.webp",
  "bilder/passgenau-bloecke2.webp",
  "bilder/memory-karten.webp",
  "bilder/revier-gebiete2.webp",
  "bilder/kartentausch-karten.webp",
  "bilder/schnellschuss-kachel4.webp",
  "bilder/turbo-kachel.webp",
  "bilder/run-kachel2.webp",
  "bilder/laenderumrisse-kachel.webp",
  "bilder/groessenvergleich-kachel.webp",
  "bilder/memory/f01.webp?v=411",
  "bilder/memory/f02.webp?v=411",
  "bilder/memory/f03.webp?v=411",
  "bilder/memory/f04.webp?v=411",
  "bilder/memory/f05.webp?v=411",
  "bilder/memory/f06.webp?v=411",
  "bilder/memory/f07.webp?v=411",
  "bilder/memory/f08.webp?v=411",
  "bilder/memory/f09.webp?v=411",
  "bilder/memory/f10.webp?v=411",
  "bilder/memory/f11.webp?v=411",
  "bilder/memory/f12.webp?v=411",
  "bilder/memory/f13.webp?v=411",
  "bilder/memory/f14.webp?v=411",
  "bilder/memory/f15.webp?v=411",
  "bilder/memory/f16.webp?v=411",
  "bilder/memory/f17.webp?v=411",
  "bilder/memory/f18.webp?v=411",
  "bilder/memory/f19.webp?v=411",
  "bilder/memory/f20.webp?v=411",
  "bilder/memory/f21.webp?v=411",
  "bilder/memory/f22.webp?v=411",
  "bilder/fussball-auktion/spieler-de-2.png?v=335",
  "bilder/fussball-auktion/spieler-de-3.png?v=335",
  "bilder/fussball-auktion/spieler-de-4.png?v=335",
  "bilder/fussball-auktion/spieler-de-5.png?v=335",
  "bilder/fussball-auktion/spieler-jp-1.png?v=335",
  "bilder/fussball-auktion/spieler-jp-2.png?v=335",
  "bilder/fussball-auktion/spieler-jp-3.png?v=335",
  "bilder/fussball-auktion/spieler-jp-4.png?v=335",
  "bilder/fussball-auktion/spieler-jp-5.png?v=335",
  "bilder/fussball-auktion/spieler-br-1.png?v=335",
  "bilder/fussball-auktion/spieler-br-2.png?v=335",
  "bilder/fussball-auktion/spieler-br-3.png?v=335",
  "bilder/fussball-auktion/spieler-br-4.png?v=335",
  "bilder/fussball-auktion/spieler-br-5.png?v=335",
  "bilder/fussball-auktion/spieler-es-1.png?v=335",
  "bilder/fussball-auktion/spieler-es-2.png?v=335",
  "bilder/fussball-auktion/spieler-es-3.png?v=335",
  "bilder/fussball-auktion/spieler-es-4.png?v=335",
  "bilder/fussball-auktion/spieler-es-5.png?v=335",
  "bilder/fussball-auktion/spieler-ar-1.png?v=335",
  "bilder/fussball-auktion/spieler-ar-2.png?v=335",
  "bilder/fussball-auktion/spieler-ar-3.png?v=335",
  "bilder/fussball-auktion/spieler-ar-4.png?v=335",
  "bilder/fussball-auktion/spieler-ar-5.png?v=335",
  "bilder/fussball-auktion/spieler-fr-1.png?v=335",
  "bilder/fussball-auktion/spieler-fr-2.png?v=335",
  "bilder/fussball-auktion/spieler-fr-3.png?v=335",
  "bilder/fussball-auktion/spieler-fr-4.png?v=335",
  "bilder/fussball-auktion/spieler-fr-5.png?v=335",
  "bilder/fussball-auktion/spieler-ng-1.png?v=335",
  "bilder/fussball-auktion/spieler-ng-2.png?v=335",
  "bilder/fussball-auktion/spieler-ng-3.png?v=335",
  "bilder/fussball-auktion/spieler-ng-4.png?v=335",
  "bilder/fussball-auktion/spieler-ng-5.png?v=335",
  "spiele/doppelblick/spiel.js",
  "spiele/blitzquiz/spiel.js",
  "spiele/blitzquiz/fragen.json",
  "spiele/blitzquiz/bilder/lampe.jpg",
  "spiele/blitzquiz/bilder/sonnenbrille.jpg",
  "spiele/blitzquiz/bilder/regenschirm.jpg",
  "spiele/blitzquiz/bilder/anker.png",
  "spiele/blitzquiz/bilder/rakete.jpg",
  "spiele/blitzquiz/bilder/kerze.jpg",
  "spiele/blitzquiz/bilder/glocke.png",
  "spiele/blitzquiz/bilder/pizza.jpg",
  "spiele/blitzquiz/bilder/schere.jpg",
  "spiele/blitzquiz/bilder/hammer.jpg",
  "spiele/blitzquiz/bilder/leiter.jpg",
  "spiele/blitzquiz/bilder/gitarre.jpg",
  "spiele/blitzquiz/bilder/trompete.jpg",
  "spiele/blitzquiz/bilder/fahrrad.jpg",
  "spiele/blitzquiz/bilder/zahnbuerste.jpg",
  "spiele/blitzquiz/bilder/hufeisen.jpg",
  "spiele/blitzquiz/bilder/kompass.jpg",
  "spiele/blitzquiz/bilder/schluessel.jpg",
  "spiele/blitzquiz/bilder/zange.jpg",
  "spiele/blitzquiz/bilder/kaktus.jpg",
  "spiele/blitzquiz/bilder/weinglas.jpg",
  "spiele/blitzquiz/bilder/igel.jpg",
  "spiele/blitzquiz/bilder/schmetterling.jpg",
  "spiele/blitzquiz/bilder/pinguin.jpg",
  "spiele/blitzquiz/bilder/flamingo.jpg",
  "spiele/blitzquiz/bilder/elefant.jpg",
  "spiele/blitzquiz/bilder/zitrone.jpg",
  "spiele/blitzquiz/bilder/erdbeere.jpg",
  "spiele/blitzquiz/bilder/avocado.jpg",
  "spiele/blitzquiz/bilder/brokkoli.jpg",
  "spiele/blitzquiz/bilder/pilz.jpg",
  "spiele/blitzquiz/bilder/tomate.jpg",
  "spiele/blitzquiz/bilder/wuerfel.jpg",
  "spiele/blitzquiz/bilder/trommel.jpg",
  "spiele/blitzquiz/bilder/geige.jpg",
  "spiele/blitzquiz/bilder/saxophon.jpg",
  "spiele/blitzquiz/bilder/kamera.jpg",
  "spiele/blitzquiz/bilder/fernglas.jpg",
  "spiele/blitzquiz/bilder/globus.jpg",
  "spiele/blitzquiz/bilder/zahnrad.jpg",
  "spiele/blitzquiz/bilder/magnet.jpg",
  "spiele/blitzquiz/bilder/laterne.jpg",
  "spiele/blitzquiz/bilder/sanduhr.jpg",
  "spiele/blitzquiz/bilder/krone.jpg",
  "spiele/blitzquiz/bilder/muschel.jpg",
  "spiele/blitzquiz/bilder/seestern.jpg",
  "spiele/blitzquiz/bilder/qualle.jpg",
  "spiele/blitzquiz/bilder/kuerbis.jpg",
  "spiele/blitzquiz/bilder/giraffe.jpg",
  "spiele/blitzquiz/bilder/auto.jpg",
  "bilder/icon-192.png",
  "bilder/icon-512.png",
  "bilder/icon-512-maskable.png",
  "bilder/apple-touch-icon.png",
  "bilder/logo-fuchs-transparent.png",
  "bilder/brand-app-icon.svg",
  "bilder/icon-raum-verlassen.svg",
  "bilder/avatar1-hd.jpg?v=38", "bilder/avatar2-hd.jpg?v=38", "bilder/avatar3-hd.jpg?v=38", "bilder/avatar4-hd.jpg?v=38",
  "bilder/avatar5-hd.jpg?v=38", "bilder/avatar6-hd.jpg?v=38", "bilder/avatar7-hd.jpg?v=38", "bilder/avatar8-hd.jpg?v=38",
  "bilder/freund-rapper-kevin.jpg?v=178", "bilder/freund-zocker-luca.jpg?v=178", "bilder/freund-bettler-nader.jpg?v=178",
  "bilder/freund-eintracht-sinan.jpg?v=178", "bilder/freund-boxer-kevin.jpg?v=178", "bilder/freund-gay-luca.jpg?v=178",
  "bilder/freund-diktator-nader.jpg?v=178", "bilder/freund-rambo-sinan.jpg?v=178", "bilder/freund-meerjungfrau-kevin.jpg?v=178",
  "bilder/freund-baywatch-luca.jpg?v=178", "bilder/freund-baby-nader.jpg?v=178", "bilder/freund-leoparden-sinan.jpg?v=178"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // Einzeln laden: fällt eine Datei aus, scheitert nicht die ganze Installation.
      .then((cache) => Promise.allSettled(DATEIEN.map((d) => cache.add(d))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Firestore und Google Fonts niemals abfangen - die brauchen immer das echte Netz.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  // "Netz zuerst, Cache als Rückfall": online sieht man immer die aktuelle Version,
  // offline startet die App trotzdem. Für Bilder umgekehrt (die ändern sich kaum).
  const istBild = /\.(png|jpg|jpeg|svg|webp)$/i.test(url.pathname);

  if (istBild) {
    event.respondWith(
      caches.match(event.request).then((treffer) => treffer || fetch(event.request).then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, kopie));
        return antwort;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE_NAME).then((c) => c.put(event.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(event.request).then((treffer) => treffer || caches.match("index.html")))
  );
});
