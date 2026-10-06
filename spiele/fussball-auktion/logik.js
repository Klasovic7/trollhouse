// ============================================================================
//  Länderspiel - reine Spiellogik (keine DOM-/Firestore-Zugriffe)
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

// Bestimmt die Bearbeitungsreihenfolge einer Menge von Karten (umkämpfteste
// zuerst, d. h. höchstes abgegebenes Gebot zuerst) - extrahiert aus
// loeseGebotsrundeAuf, damit spiel.js Karten auch EINZELN (mit Pausen für ein
// Stechen) nacheinander auflösen kann, statt wie bisher alle auf einmal.
export function kartenBearbeitungsreihenfolge(kartenIds, geboteProSpieler) {
  return [...kartenIds].sort((a, b) => {
    const hoechstesA = Math.max(0, ...Object.values(geboteProSpieler).map((g) => g[a] ?? 0));
    const hoechstesB = Math.max(0, ...Object.values(geboteProSpieler).map((g) => g[b] ?? 0));
    return hoechstesB - hoechstesA;
  });
}

// Löst GENAU EINE Karte auf (kein Zufall mehr bei Gleichstand - siehe unten):
//  - "niemand":       kein aktiver Bieter mit Kapazität, ODER das höchste
//                      Gebot ist 0 (Sonderfall vom Nutzer bestätigt: ein
//                      Gleichstand bei 0 Münzen bedeutet, dass niemand
//                      geboten hat - die Karte bleibt unvergeben).
//  - "gewinner":       genau ein Spieler hat das höchste Gebot - bekommt die
//                      Karte direkt.
//  - "unentschieden":  mindestens zwei Spieler teilen sich das höchste Gebot
//                      (> 0) - hier muss spiel.js ein Stechen starten statt
//                      (wie früher) einfach zufällig zu entscheiden.
export function aufloesenEineKarte(kartenId, geboteProSpieler, kapazitaetProSpieler) {
  const gebote = Object.entries(geboteProSpieler)
    .map(([spielerId, g]) => ({ spielerId, betrag: g[kartenId] ?? 0 }))
    .filter((g) => (kapazitaetProSpieler[g.spielerId] ?? 0) > 0);
  if (gebote.length === 0) return { typ: "niemand" };

  const hoechstesGebot = Math.max(...gebote.map((g) => g.betrag));
  if (hoechstesGebot === 0) return { typ: "niemand" };

  const bestbieter = gebote.filter((g) => g.betrag === hoechstesGebot);
  if (bestbieter.length === 1) {
    return { typ: "gewinner", spielerId: bestbieter[0].spielerId, betrag: hoechstesGebot };
  }
  return { typ: "unentschieden", spielerIds: bestbieter.map((g) => g.spielerId), betrag: hoechstesGebot };
}

// Löst eine Gebotsrunde auf: für jede Karte gewinnt das höchste Gebot, bei
// Gleichstand entscheidet zufaelligFn() (Standard: Math.random) - austauschbar,
// damit sich diese Funktion deterministisch testen lässt.
//
// Hinweis (v231): seit Einführung des Stechens (siehe aufloesenEineKarte
// oben und spiel.js/loeseAuktionsrundeAuf) wird diese Funktion vom Spiel
// selbst NICHT mehr verwendet - sie bleibt für bestehende Tests/Aufrufer
// erhalten, löst Gleichstände aber weiterhin per Zufall auf.
//
// v217-Fix: berücksichtigt jetzt die 5-Karten-Obergrenze INNERHALB einer
// einzelnen Gebotsrunde. Vorher konnte ein Spieler, der z. B. schon 4 Karten
// hatte, in derselben Runde mehrere weitere Karten gewinnen und damit über 5
// Karten kommen - das widerspricht der Regel und dem vom Nutzer bestätigten
// Verhalten, dass sich am Ende die 5*Spielerzahl aufgedeckten Karten exakt
// auf 5 Karten pro Spieler aufteilen. Um das zu garantieren, wird zuerst die
// am stärksten umkämpfte Karte (höchstes Gebot) vergeben, danach die nächste
// usw.; ein Spieler, der seine Kapazität in dieser Runde bereits ausgeschöpft
// hat, scheidet für die restlichen Karten DIESER Runde aus (nicht erst ab der
// nächsten Runde).
// geboteProSpieler:      { spielerId: { kartenId: betrag, ... }, ... }
// kapazitaetProSpieler:  { spielerId: verbleibende Kartenanzahl bis zum Limit }
// Rückgabe: { sieger: { kartenId: spielerId }, kostenProSpieler: { spielerId: betrag } }
export function loeseGebotsrundeAuf(kartenIds, geboteProSpieler, kapazitaetProSpieler, zufaelligFn = Math.random) {
  const sieger = {};
  const kostenProSpieler = {};
  const verbleibend = { ...kapazitaetProSpieler };

  // Höchstes Gebot je Karte ermitteln, um die Bearbeitungsreihenfolge
  // festzulegen (umkämpfteste Karte zuerst) - dadurch bekommt bei knapper
  // werdender Kapazität nicht zufällig die zuletzt bearbeitete Karte den
  // Nachteil, sondern konsistent die mit dem niedrigsten Höchstgebot.
  const reihenfolge = [...kartenIds].sort((a, b) => {
    const hoechstesA = Math.max(0, ...Object.values(geboteProSpieler).map((g) => g[a] ?? 0));
    const hoechstesB = Math.max(0, ...Object.values(geboteProSpieler).map((g) => g[b] ?? 0));
    return hoechstesB - hoechstesA;
  });

  for (const kartenId of reihenfolge) {
    const gebote = Object.entries(geboteProSpieler)
      .map(([spielerId, g]) => ({ spielerId, betrag: g[kartenId] ?? 0 }))
      .filter((g) => (verbleibend[g.spielerId] ?? 0) > 0);
    if (gebote.length === 0) continue; // niemand hat noch Kapazität übrig - Karte bleibt unvergeben

    const hoechstesGebot = Math.max(...gebote.map((g) => g.betrag));
    const bestbieter = gebote.filter((g) => g.betrag === hoechstesGebot);
    const gewinner = bestbieter.length === 1
      ? bestbieter[0]
      : bestbieter[Math.floor(zufaelligFn() * bestbieter.length)];
    sieger[kartenId] = gewinner.spielerId;
    kostenProSpieler[gewinner.spielerId] = (kostenProSpieler[gewinner.spielerId] ?? 0) + gewinner.betrag;
    verbleibend[gewinner.spielerId] -= 1;
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

// ============================================================================
//  Länderboni (v246)
// ----------------------------------------------------------------------------
//  Wer mehrere Spieler desselben Landes besitzt, bekommt einen Bonus, der mit
//  der Anzahl wächst. Der Bonus wird NICHT in die Karte geschrieben, sondern
//  immer aus dem aktuellen Kartenbesitz berechnet (karten.json bleibt
//  unverändert).
//   - "stat":   n Karten eines Landes (n >= 2) -> jede dieser Karten +n auf
//               eine feste Fähigkeit (z. B. Italien: Verteidigung).
//   - "frei":   Deutschland - n >= 2 deutsche Karten -> n-1 frei verteilbare
//               Fähigkeitspunkte (Wahl nach der Auktion) PLUS n-1 Extrapunkte
//               auf die Gesamtwertung (je vergebenem Punkt +1 auf die
//               gewählte Karte).
//   - "rabatt": Nigeria - Preisnachlass beim Ersteigern (siehe unten).
// ============================================================================
export const LAENDER_BONI = {
  Italien:     { typ: "stat", kat: "VER" },
  Frankreich:  { typ: "stat", kat: "GES" },
  Argentinien: { typ: "stat", kat: "SCH" },
  "Türkei":    { typ: "stat", kat: "PAS" },
  Brasilien:   { typ: "stat", kat: "TEC" },
  Japan:       { typ: "stat", kat: "SPI" },
  Deutschland: { typ: "frei" },
  Nigeria:     { typ: "rabatt" }
};

// Anzahl Karten je Land aus einer Liste von Karten-IDs.
export function zaehleNationen(kartenIds, kartenNachId) {
  const anzahl = {};
  for (const id of kartenIds ?? []) {
    const nation = kartenNachId.get(id)?.nation;
    if (nation) anzahl[nation] = (anzahl[nation] ?? 0) + 1;
  }
  return anzahl;
}

// Anzahl frei verteilbarer Punkte für n deutsche Karten (2 -> 1, 3 -> 2, ...).
export function deutschlandPunkte(anzahlDeutsche) {
  return anzahlDeutsche >= 2 ? anzahlDeutsche - 1 : 0;
}

// Prüft/bereinigt eine Deutschland-Wahl: nur Karten, die der Spieler besitzt
// und die deutsch sind, nur gültige Fähigkeiten, höchstens so viele Punkte wie
// erlaubt. wahl = [{ kartenId, kat }, ...]
export function bereinigeDeutschlandWahl(wahl, kartenIds, kartenNachId) {
  const erlaubt = deutschlandPunkte(zaehleNationen(kartenIds, kartenNachId).Deutschland ?? 0);
  const besitz = new Set(kartenIds ?? []);
  return (Array.isArray(wahl) ? wahl : [])
    .filter((w) => w && besitz.has(w.kartenId) && kartenNachId.get(w.kartenId)?.nation === "Deutschland" && KATEGORIEN.includes(w.kat))
    .slice(0, erlaubt);
}

// Berechnet alle Boni eines Spielers: { kartenId: { boni: { KAT: +n }, extra: +n } }
// Es erscheinen nur Karten, die tatsächlich einen Bonus haben.
export function berechneKartenBoni(kartenIds, kartenNachId, deutschlandWahl = []) {
  const ergebnis = {};
  const eintrag = (id) => (ergebnis[id] ??= { boni: {}, extra: 0 });
  const nationen = zaehleNationen(kartenIds, kartenNachId);

  for (const id of kartenIds ?? []) {
    const k = kartenNachId.get(id);
    const regel = k && LAENDER_BONI[k.nation];
    const n = k ? nationen[k.nation] : 0;
    if (regel?.typ === "stat" && n >= 2) {
      const e = eintrag(id);
      e.boni[regel.kat] = (e.boni[regel.kat] ?? 0) + n;
    }
  }
  for (const w of bereinigeDeutschlandWahl(deutschlandWahl, kartenIds, kartenNachId)) {
    const e = eintrag(w.kartenId);
    e.boni[w.kat] = (e.boni[w.kat] ?? 0) + 1;
    e.extra += 1;
  }
  return ergebnis;
}

// Fähigkeitswerte inkl. Bonus.
export function effektiveFaehigkeiten(karte, bonus) {
  const werte = {};
  for (const kat of KATEGORIEN) werte[kat] = (karte.faehigkeiten[kat] ?? 0) + (bonus?.boni?.[kat] ?? 0);
  return werte;
}

// Gesamtwertung inkl. aller Boni (Fähigkeitsboni + Deutschland-Extrapunkte).
export function effektiveGesamt(karte, bonus) {
  return kartenSumme(karte) + Object.values(bonus?.boni ?? {}).reduce((s, v) => s + v, 0) + (bonus?.extra ?? 0);
}

// ---------- Nigeria: Preisnachlass ----------
// Der k-te Nigerianer im Besitz: 1. 0 %, 2. 20 %, 3. 40 %, 4. 60 %, 5. 80 %.
export function nigeriaRabattProzent(nummer) {
  return nummer <= 1 ? 0 : Math.min(80, (nummer - 1) * 20);
}

// Kaufmännisch gerundeter Prozentanteil (x,5 wird aufgerundet) - rein ganzzahlig.
export function rundeProzent(betrag, prozent) {
  return Math.floor((betrag * prozent + 50) / 100);
}

// Erstattung für die in EINER Gebotsrunde gewonnenen Nigerianer eines Spielers.
// bisherAnzahl: so viele Nigerianer besaß er vorher; gewonnen: [{ kartenId, betrag }].
// Die höheren Rabattstufen gehen an die teureren Karten.
// Rückgabe: { kartenId: { prozent, erstattung } }
export function berechneNigeriaErstattung(bisherAnzahl, gewonnen) {
  const sortiert = [...gewonnen].sort((a, b) => b.betrag - a.betrag || (a.kartenId < b.kartenId ? -1 : 1));
  const stufen = sortiert.map((_, i) => nigeriaRabattProzent(bisherAnzahl + 1 + i)).sort((a, b) => b - a);
  const ergebnis = {};
  sortiert.forEach((g, i) => {
    ergebnis[g.kartenId] = { prozent: stufen[i], erstattung: rundeProzent(g.betrag, stufen[i]) };
  });
  return ergebnis;
}
