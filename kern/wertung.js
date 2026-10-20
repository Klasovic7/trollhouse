// ============================================================================
//  Wertung: raumuebergreifende Punkte-Historie je Spiel-Typ
// ----------------------------------------------------------------------------
//  Jedes Spielmodul ruft speichereWertung() genau einmal auf, sobald ein
//  Durchgang beendet ist (Uebergang zum Endstand) - direkt an der Stelle, an
//  der der Status auf "beendet" gesetzt wird, damit das garantiert nur einmal
//  pro Durchgang passiert (nicht bei jedem Rendern des Endstand-Screens, der
//  bei allen Mitspielern durch den Realtime-Listener erneut ausgeloest wird).
//  Die Punkte landen unter raeume/{code}/wertung/{spielId} und werden ueber
//  mehrere Durchgaenge desselben Spiels hinweg aufaddiert (increment), damit
//  z. B. zweimal gespieltes Schaetzfragen in einer Spalte zusammengefasst
//  wird. Gelesen/angezeigt wird das Ganze in app.js (Wertungs-Kachel + Dialog
//  in der Lobby).
// ============================================================================
import { doc, setDoc, collection, increment } from "./firebase.js";

export async function speichereWertung(api, spielId, punkteProSpieler) {
  // Nur der Spielleiter schreibt - sonst wuerde jedes Geraet, das den
  // Endstand-Screen anzeigt, dieselben Punkte nochmal aufaddieren.
  if (!api?.istLeiter || !spielId || !punkteProSpieler) return;
  const werte = {};
  for (const [id, wert] of Object.entries(punkteProSpieler)) {
    const zahl = Number(wert) || 0;
    if (zahl) werte[id] = increment(zahl);
  }
  if (!Object.keys(werte).length) return;
  try {
    const ref = doc(collection(api.raumRef(), "wertung"), spielId);
    await setDoc(ref, { punkte: werte }, { merge: true });
  } catch (e) {
    api.fehler?.("Fehler beim Speichern der Wertung: " + e.message);
  }
}

// ----------------------------------------------------------------------------
//  Einheitliches Punktesystem (ab v359)
//  Platz 1 = n + 1 Punkte (n = Anzahl Spieler, der Extrapunkt ist der Siegerbonus),
//  Platz 2 = n - 1, Platz 3 = n - 2 ... der letzte Platz bekommt 1 Punkt.
//  Gleichstand teilt sich den besseren Platz; danach wird mit dem echten Platz weiter-
//  gezählt (zwei auf Platz 1 -> der Nächste ist Platz 3). Wer nichts geschafft hat,
//  bekommt 0 (diese Spieler gar nicht in die Liste aufnehmen).
// ----------------------------------------------------------------------------
export function punkteFuerRang(rang, n) {
  return rang <= 1 ? n + 1 : Math.max(0, n - rang + 1);
}

// "sortiert": Einträge, beste zuerst. "schluessel": liefert je Eintrag einen Wert, der bei
// Gleichstand identisch ist. "id": liefert die Spieler-ID. Rückgabe: { spielerId: punkte }.
export function punkteNachRang(sortiert, schluessel, n, id = (e) => e.spielerId ?? e.id) {
  const ergebnis = {};
  let rang = 1, vorher;
  sortiert.forEach((e, i) => {
    const k = schluessel(e);
    if (i > 0 && k !== vorher) rang = i + 1;
    vorher = k;
    ergebnis[id(e)] = punkteFuerRang(rang, n);
  });
  return ergebnis;
}

// Gesamtwertung für Spiele, die intern eigene Punkte zählen: Platz nach Spielstand
// (höher = besser), dann einheitliche Platzpunkte. Spieler ohne Eintrag bekommen 0.
export function platzPunkteAusStand(stand, n = Object.keys(stand).length) {
  const liste = Object.entries(stand).map(([id, wert]) => ({ id, wert: Number(wert) || 0 }))
    .sort((a, b) => b.wert - a.wert);
  return punkteNachRang(liste, (e) => e.wert, n);
}

export async function speichereWertungNachPlatz(api, spielId, stand) {
  return speichereWertung(api, spielId, platzPunkteAusStand(stand));
}
