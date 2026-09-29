// ============================================================================
//  Fußball-Auktion - reine Spiellogik (keine DOM-/Firestore-Zugriffe)
//  Getrennt von spiel.js, damit sich die Regeln unabhängig vom UI-Code lesen
//  und (lokal mit Node) testen lassen - gleiches Muster wie bei
//  spiele/reih-dich-ein/logik.js.
// ============================================================================

export const KATEGORIEN = ["SCH", "PAS", "TEC", "VER", "GES", "SPI"];
export const KATEGORIE_NAMEN = {
  SCH: "Schuss", PAS: "Pass", TEC: "Technik",
  VER: "Verteidigung", GES: "Geschwindigkeit", SPI: "Spielverständnis"
};
export const STARTMUENZEN = 50;
export const MAX_KARTEN_PRO_SPIELER = 5;
export const ANZAHL_GEBOTSRUNDEN = 5;
export const ANZAHL_SPIELRUNDEN = 5;

export function kartenSumme(karte) {
  return KATEGORIEN.reduce((summe, kat) => summe + (karte.faehigkeiten[kat] ?? 0), 0);
}

// Prüft ein Gebot-Set eines Spielers für eine Gebotsrunde: jeder Betrag >= 0,
// ganzzahlig, und die SUMME aller Gebote darf den aktuellen Münzstand nicht
// übersteigen (sonst könnte ein Spieler mehr Karten "gewinnen", als er
// bezahlen kann, falls mehrere seiner Gebote gleichzeitig den Zuschlag bekommen).
export function pruefeGebote(gebote, kartenIds, muenzen) {
  for (const id of kartenIds) {
    const wert = gebote[id];
    if (!Number.isInteger(wert) || wert < 0) return `Ungültiges Gebot auf Karte ${id}.`;
  }
  const summe = kartenIds.reduce((s, id) => s + (gebote[id] ?? 0), 0);
  if (summe > muenzen) return `Deine Gebote ergeben zusammen ${summe} Münzen - du hast nur noch ${muenzen}.`;
  return null;
}

// Löst eine Gebotsrunde auf: für jede Karte gewinnt das höchste Gebot, bei
// Gleichstand entscheidet zufaelligFn() (Standard: Math.random) - austauschbar,
// damit sich diese Funktion deterministisch testen lässt.
// geboteProSpieler: { spielerId: { kartenId: betrag, ... }, ... }
// Rückgabe: { sieger: { kartenId: spielerId | null }, kostenProSpieler: { spielerId: betrag } }
export function loeseGebotsrundeAuf(kartenIds, geboteProSpieler, zufaelligFn = Math.random) {
  const sieger = {};
  const kostenProSpieler = {};

  for (const kartenId of kartenIds) {
    const gebote = Object.entries(geboteProSpieler)
      .map(([spielerId, g]) => ({ spielerId, betrag: g[kartenId] ?? 0 }))
      .filter((g) => g.betrag > 0 || true); // auch 0-Gebote zählen mit (siehe Spielregel)
    const hoechstesGebot = Math.max(...gebote.map((g) => g.betrag));
    const bestbieter = gebote.filter((g) => g.betrag === hoechstesGebot);
    const gewinner = bestbieter.length === 1
      ? bestbieter[0]
      : bestbieter[Math.floor(zufaelligFn() * bestbieter.length)];
    sieger[kartenId] = gewinner.spielerId;
    kostenProSpieler[gewinner.spielerId] = (kostenProSpieler[gewinner.spielerId] ?? 0) + gewinner.betrag;
  }

  return { sieger, kostenProSpieler };
}

// Rundenpunkte der Spielphase: jeder Eintrag ist { spielerId, summe, gesamt },
// wobei "summe" die Summe der beiden aktuellen Rundenfähigkeiten der gespielten
// Karte ist und "gesamt" deren Gesamtsumme über alle 6 Fähigkeiten (Tiebreak).
//
// Regeln (vom Nutzer bestätigt):
//  - niedrigste Summe: -2 Punkte
//  - zweitniedrigste ("Vorletzter"): 1 Punkt
//  - jede Position weiter nach oben: +1 Punkt mehr
//  - höchste Summe: zusätzlich +3 Bonuspunkte
//  - Gleichstand bei der Summe: höhere Gesamtsumme (alle 6 Fähigkeiten) gewinnt den Rang
export function berechneRundenpunkte(eintraege) {
  const sortiert = [...eintraege].sort((a, b) =>
    a.summe !== b.summe ? a.summe - b.summe : a.gesamt - b.gesamt
  );
  const ergebnis = {};
  const n = sortiert.length;
  sortiert.forEach((eintrag, i) => {
    const rang = i + 1; // 1 = niedrigste Summe
    let punkte;
    if (rang === 1) punkte = -2;
    else punkte = rang - 1;
    if (rang === n && n > 1) punkte += 3;
    ergebnis[eintrag.spielerId] = punkte;
  });
  return ergebnis;
}

// Wählt zufällig 2 unterschiedliche Fähigkeiten für eine Spielrunde.
export function zufaelligeRundenKategorien(zufaelligFn = Math.random) {
  const kopie = [...KATEGORIEN];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(zufaelligFn() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie.slice(0, 2);
}

// Mischt ein Array (Fisher-Yates) - für die zufällige Kartenreihenfolge der Auktion.
export function mische(werte, zufaelligFn = Math.random) {
  const kopie = [...werte];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(zufaelligFn() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}
