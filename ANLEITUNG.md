# Trollhouse – Entwicklerhandbuch

Trollhouse ist eine Party-Spiele-App fürs Handy (PWA, reines JavaScript ohne Build-Schritt).
Alle Spieler eines Raums sehen denselben Stand, die Synchronisation läuft über Firebase Firestore.
Stand: v477 – 30 Spiele.

---

## 1. Was im Ordner liegt

```
index.html            Grundgerüst der Seite
app.js                Raum erstellen/beitreten, Profilwahl, Lobby, Spielauswahl, Update-Hinweis
stil.css              das gesamte Aussehen (inkl. lokale Schriften)
manifest.json         macht die Seite als App installierbar
sw.js                 Service Worker: Offline-Start, Vorab-Liste DATEIEN, Bild-Cache
statistik.html        Auswertungsseite
kern/                 gemeinsame Bausteine
  firebase.js           Verbindung zu Firestore (anonyme Anmeldung, Raumsammlung "raeume")
  ui.js                 Spielerkacheln, Farben, Profilbilder (FREUNDE, Fußballer, ...)
  teams.js, wertung.js, verlauf.js, buchstabeneingabe.js, update-hinweis.js
spiele/
  register.js           Verzeichnis aller Spiele (+ SPIEL_VERSION)
  anleitungen.js / anleitungen-daten.js   Spielregeln-Seiten (Text + Bilder)
  <spielname>/spiel.js  je ein Spiel (größere haben zusätzlich logik.js, design.js, ...)
bilder/                 Kacheln, Avatare, Spielbilder, bilder/anleitung/ für die Regelseiten
schriften/              Bungee und Barlow Condensed lokal (SIL Open Font License)
tools/                  Hilfsskripte (siehe Abschnitt 3)
```

Die Spiele: Schätzfragen, Denk gleich!, 10 Treffer!, Reih dich ein!, Wer ist es?, Wann war es?,
Blitzquiz, Doppelblick!, Merk's dir!, Nachmalen!, Farbton!, Zeitgefühl!, Stimmt's?,
Länderumrisse, Wo liegt's?, Länderspiel (Ordner `fussball-auktion`), Größenvergleich,
Tetris-Duell, Passgenau, Memory, Revierkampf, Kartentausch, Schnellschuss, Run, Turbo,
Pokerduell, Knobeln, Doppelkopf, Imposter, Finto.

---

## 2. Veröffentlichen

Die App liegt auf GitHub (`Klasovic7/trollhouse`) und wird über GitHub Pages ausgeliefert.
Ablauf bei einer Änderung:

1. Dateien ändern.
2. Version erhöhen und prüfen (Abschnitt 3): `node tools/bump.mjs`
3. Committen und pushen (z. B. mit GitHub Desktop). Nach ein bis zwei Minuten ist die neue
   Version live; die App zeigt Mitspielern einen Update-Hinweis.

Als App aufs Handy legen: iPhone nur in Safari → Teilen → *Zum Home-Bildschirm*;
Android in Chrome → *App installieren*.

Hinweise:
- iOS löscht den lokalen Speicher einer Web-App nach ca. 7 Tagen ohne Nutzung. Betroffen ist nur
  die gemerkte Sitzung, Spielstände liegen in Firestore.
- Ohne Internet startet die App, mitspielen geht aber nicht.
- Zoom ist bewusst gesperrt (`user-scalable=no`), damit ein versehentlicher Doppeltipp auf dem
  iPhone nicht reinzoomt. Nicht ändern.

---

## 3. Version und Prüfung (immer so, nicht von Hand)

Die Versionsnummer steht an drei Stellen, die immer gleich sein müssen: `CACHE_NAME` in `sw.js`,
`APP_VERSION` in `app.js` und `SPIEL_VERSION` in `spiele/register.js`.

```
node tools/bump.mjs          Version +1 an allen drei Stellen, danach automatische Prüfung
node tools/bump.mjs 480      bestimmte Nummer setzen
node tools/pruefen.mjs       nur prüfen (vor jedem Commit)
```

Die Prüfung testet die Syntax aller JS-Dateien, ob alle JSON-Dateien gültig sind, ob die drei
Versionsstellen übereinstimmen und ob jede Datei der Liste `DATEIEN` in `sw.js` existiert.

### Cache-Regeln (sw.js)

- Code (JS, CSS, HTML, JSON, Schriften): Netz zuerst, Cache als Rückfall; bei jedem Versionssprung
  wird der Code-Cache neu aufgebaut.
- Bilder: eigener Cache `BILD_CACHE`, der bei einem Versionssprung **nicht** geleert wird.
  Deshalb gilt: **Wird ein Bild ausgetauscht, muss seine `?v=`-Nummer im Code und in `DATEIEN`
  geändert werden** (neue Adresse = neu laden). Hilft das nicht, `BILD_CACHE` von `-1` auf `-2` zählen.
- `DATEIEN` ist bewusst von Hand ausgewählt (Turbo und die Regelbilder sind absichtlich nicht
  vorab im Cache). Neue Pflichtdateien dort eintragen; die Prüfung meldet fehlende.

---

## 4. Ein neues Spiel hinzufügen

1. Ordner `spiele/<meinspiel>/` mit einer `spiel.js` anlegen (Vorlage: `spiele/schaetzfragen/spiel.js`).
   Ein Spielmodul exportiert:

   ```js
   export async function starten(api) { }  // einmal beim Laden: DOM bauen, Listener starten
   export function raumDaten(daten)  { }   // Raum-Dokument hat sich geändert
   export function spieler(liste)    { }   // Spielerliste hat sich geändert
   export function beenden()         { }   // aufräumen vor dem Entladen
   export async function vorZurueck() { }  // optional: Zurück-Taste abfangen
   ```

   Über `api` kommen u. a. `code`, `db`, `spielerId`, `spielerName`, `istLeiter`, `spieler`,
   `raum`, `raumRef()`, `spielerRef(id)` und `zurueckZurAuswahl()`.

   Eigene Felder im Raum-Dokument mit einem kurzen Kürzel beginnen (Pokerduell `pd…`,
   Revierkampf `rv…`, Memory `mm…`), damit sich Spiele nicht in die Quere kommen.
2. In `spiele/register.js` einen Eintrag ergänzen (id, Name, Emoji, Kachelbild, Farbe, Beschreibung).
3. Dateien in `sw.js` → `DATEIEN` aufnehmen, wenn sie offline verfügbar sein sollen.
4. Regeln in `spiele/anleitungen-daten.js` ergänzen (Text, optional Bilder in `bilder/anleitung/`).
5. `node tools/bump.mjs`.

Lobby, Profilbilder, Farben, Raumcode und Spielerliste übernimmt die App.

---

## 5. Datenbank-Regeln (Firebase)

Die App meldet jeden Besucher unsichtbar anonym an (`signInAnonymously` in `kern/firebase.js`).
Geschützt wird über die Firestore-Regeln, nicht über den Schlüssel in `kern/firebase.js` –
der ist bei Firebase absichtlich öffentlich.

Die Regeln liegen **nicht** in diesem Repo, sondern nur in der Firebase-Konsole
(Firestore Database → Regeln). Empfohlener Stand:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /raeume/{code} {
      allow read, write: if request.auth != null && code.matches('^[0-9]{4}$');
      match /{unterpfad=**} {
        allow read, write: if request.auth != null && code.matches('^[0-9]{4}$');
      }
    }
  }
}
```

Dazu in der Konsole unter Authentication → Sign-in method **Anonym** aktivieren (zuerst!, sonst
kommt niemand mehr in die App). Wer den vierstelligen Raumcode kennt, kann beitreten – das ist
gewollt. Bitte den tatsächlichen Stand in der Konsole gelegentlich gegen diesen Text prüfen.
