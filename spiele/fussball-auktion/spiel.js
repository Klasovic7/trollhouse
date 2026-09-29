// ============================================================================
//  Fußball-Auktion
// ----------------------------------------------------------------------------
//  Ablauf: 1) Auktionsphase - 5 Gebotsrunden, in denen verdeckt auf Karten
//  geboten wird (maximal 5 Karten pro Spieler). 2) Spielphase - 5 Runden, in
//  denen jeder eine seiner Karten verdeckt ausspielt; entscheidend sind zwei
//  je Runde zufällig bestimmte Fähigkeiten.
//
//  Alle Felder dieses Spiels im Raum-Dokument beginnen mit "fa".
//
//  Offene Annahmen (siehe Commit-Nachricht/Chat, bitte gegenprüfen):
//   - Gebots-Gleichstand (zwei Spieler bieten denselben Höchstbetrag auf
//     dieselbe Karte): Gewinner wird zufällig bestimmt.
//   - Ein Spieler, der nach der Auktion weniger als 5 Karten hat, spielt in
//     den Spielrunden einfach so lange mit, wie er noch Karten übrig hat -
//     in Runden ohne eigene Karte bekommt er weder Bonus noch Malus und
//     zählt in der Rangfolge dieser Runde nicht mit.
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, arrayUnion
} from "../../kern/firebase.js";
import { escapeHtml, spielerKarte, avatarHtml, renderWarteAvatare, initBereitSystem, zeigeDebug } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";
import {
  KATEGORIEN, KATEGORIE_NAMEN, STARTMUENZEN, MAX_KARTEN_PRO_SPIELER,
  ANZAHL_GEBOTSRUNDEN, ANZAHL_SPIELRUNDEN,
  kartenSumme, pruefeGebote, loeseGebotsrundeAuf, berechneRundenpunkte,
  zufaelligeRundenKategorien, mische
} from "./logik.js";

const VORLAGE = `
  <div id="fa-setup" class="bildschirm-karte" hidden>
    <h1>⚽ Fußball-Auktion</h1>
    <p class="hinweis-text">
      Jeder startet mit ${STARTMUENZEN} Münzen. In 5 Gebotsrunden werden verdeckt Gebote auf
      Fußballkarten abgegeben (maximal ${MAX_KARTEN_PRO_SPIELER} Karten pro Spieler). Danach spielt
      jeder in 5 Runden verdeckt eine seiner Karten aus - entscheidend sind zwei
      je Runde neu bestimmte Fähigkeiten.
    </p>
    <p id="fa-spieleranzahl-hinweis" class="hinweis-text"></p>
    <p id="fa-setup-fehler" class="fehler-text"></p>
    <p><button id="fa-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="fa-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="fa-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="fa-auktion-screen" class="bildschirm-karte" hidden>
    <h2>Gebotsrunde <span id="fa-auktion-runde"></span>/${ANZAHL_GEBOTSRUNDEN}</h2>
    <p class="hinweis-text">Münzen: <strong id="fa-eigene-muenzen"></strong></p>
    <p id="fa-auktion-inaktiv-hinweis" class="hinweis-text" hidden>Du hast bereits ${MAX_KARTEN_PRO_SPIELER} Karten - in dieser Runde bietest du nicht mit.</p>
    <div id="fa-auktion-karten" class="fa-karten-grid"></div>
    <p id="fa-auktion-fehler" class="fehler-text"></p>
    <p><button id="fa-gebote-bestaetigen" class="btn-primaer" hidden>Gebote bestätigen</button></p>
    <div id="fa-auktion-status" class="warten-block"></div>
  </div>

  <div id="fa-auktion-ergebnis-screen" class="bildschirm-karte" hidden>
    <h2>Ergebnis Gebotsrunde <span id="fa-auktion-erg-runde"></span>/${ANZAHL_GEBOTSRUNDEN}</h2>
    <div id="fa-auktion-erg-liste"></div>
    <p><button id="fa-auktion-weiter" class="btn-primaer" hidden></button></p>
    <p id="fa-auktion-erg-warten" hidden><em>Der Spielleiter macht gleich weiter …</em></p>
  </div>

  <div id="fa-runde-screen" class="bildschirm-karte" hidden>
    <h2>Spielrunde <span id="fa-runde-index"></span>/${ANZAHL_SPIELRUNDEN}</h2>
    <p class="hinweis-text">Entscheidend: <strong id="fa-runde-kategorien"></strong></p>
    <p id="fa-runde-keine-karte-hinweis" class="hinweis-text" hidden>Du hast keine Karte mehr für diese Runde.</p>
    <div id="fa-runde-karten" class="fa-karten-grid"></div>
    <div id="fa-runde-status" class="warten-block"></div>
  </div>

  <div id="fa-runde-ergebnis-screen" class="bildschirm-karte" hidden>
    <h2>Ergebnis Spielrunde <span id="fa-runde-erg-index"></span>/${ANZAHL_SPIELRUNDEN}</h2>
    <p class="hinweis-text">Entscheidend war: <strong id="fa-runde-erg-kategorien"></strong></p>
    <div id="fa-runde-erg-liste"></div>
    <p><button id="fa-runde-weiter" class="btn-primaer" hidden></button></p>
    <p id="fa-runde-erg-warten" hidden><em>Der Spielleiter macht gleich weiter …</em></p>
  </div>

  <div id="fa-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="fa-endstand-liste"></ul>
    <p id="fa-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
  </div>
`;

// ---------- Modulzustand ----------
let api = null;
let karten = [];              // alle 40 Karten aus karten.json
let kartenNachId = new Map();
let el = {};
let raum = {};
let spielerListe = [];
let alleGebote = [];          // alle Dokumente aus fa_gebote (ungefiltert)
let alleSpielzuege = [];      // alle Dokumente aus fa_spielzuege (ungefiltert)
let geboteUnsub = null;
let spielzuegeUnsub = null;

let status = null;
let auktionRunde = 0;
let auktionKarten = [];       // Karten-IDs dieser Gebotsrunde
let auktionErgebnis = null;
let rundenIndex = 0;
let rundenKategorien = [];
let rundenErgebnis = null;

let eigeneGebote = {};        // { kartenId: betrag } - lokaler Entwurf vor dem Bestätigen
let geboteAbgeschickt = false;
let auktionAufloesungAusgeloest = false;
let rundeAufloesungAusgeloest = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

function karte(id) {
  return kartenNachId.get(id) ?? null;
}

function eigenerSpieler() {
  return spielerListe.find((s) => s.id === api.spielerId) ?? null;
}

function istAktiverBieter(spieler) {
  return (spieler.faKarten?.length ?? 0) < MAX_KARTEN_PRO_SPIELER;
}

// ============================================================================
//  Start
// ============================================================================
let bereitSystem = null;

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "fa");

  if (karten.length === 0) {
    const antwort = await fetch(new URL("karten.json", import.meta.url), { cache: "no-store" });
    if (!antwort.ok) throw new Error("karten.json konnte nicht geladen werden");
    karten = await antwort.json();
    kartenNachId = new Map(karten.map((k) => [k.id, k]));
  }

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.faStatus) {
    await updateDoc(api.raumRef(), { faStatus: "setup" });
  }
}

function verdrahteBedienelemente() {
  $("fa-starten").addEventListener("click", spielStarten);
  $("fa-gebote-bestaetigen").addEventListener("click", geboteBestaetigen);
  $("fa-auktion-weiter").addEventListener("click", auktionWeiter);
  $("fa-runde-weiter").addEventListener("click", rundeWeiter);
}

function starteListener() {
  geboteUnsub = onSnapshot(collection(api.db, "raeume", api.code, "fa_gebote"), (snap) => {
    alleGebote = [];
    snap.forEach((d) => alleGebote.push(d.data()));
    if (status === "auktion_gebot") { aktualisiereAuktionStatus(); pruefeAuktionsPhase(); }
  });
  spielzuegeUnsub = onSnapshot(collection(api.db, "raeume", api.code, "fa_spielzuege"), (snap) => {
    alleSpielzuege = [];
    snap.forEach((d) => alleSpielzuege.push(d.data()));
    if (status === "runde_spielen") { aktualisiereRundenStatus(); pruefeRundenPhase(); }
  });
}

export function beenden() {
  bereitSystem = null;
  if (geboteUnsub) { geboteUnsub(); geboteUnsub = null; }
  if (spielzuegeUnsub) { spielzuegeUnsub(); spielzuegeUnsub = null; }
  el = {};
  raum = {};
  alleGebote = []; alleSpielzuege = [];
  status = null; auktionRunde = 0; auktionKarten = []; auktionErgebnis = null;
  rundenIndex = 0; rundenKategorien = []; rundenErgebnis = null;
  eigeneGebote = {}; geboteAbgeschickt = false;
  auktionAufloesungAusgeloest = false; rundeAufloesungAusgeloest = false;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "setup") zeigeSetup();
  if (status === "auktion_gebot") { zeigeAuktion(); pruefeAuktionsPhase(); }
  if (status === "auktion_ergebnis") zeigeAuktionErgebnis();
  if (status === "runde_spielen") { zeigeRunde(); pruefeRundenPhase(); }
  if (status === "runde_ergebnis") zeigeRundenErgebnis();
  if (status === "beendet") zeigeEndstand();
}

// ============================================================================
//  Reaktion auf das Raum-Dokument
// ============================================================================
export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  raum = daten;
  status = daten.faStatus ?? null;

  const neueAuktionRunde = daten.faAuktionRunde ?? 0;
  if (neueAuktionRunde !== auktionRunde) {
    auktionRunde = neueAuktionRunde;
    eigeneGebote = {};
    geboteAbgeschickt = false;
    auktionAufloesungAusgeloest = false;
  }
  auktionKarten = daten.faAuktionKarten ?? [];
  auktionErgebnis = daten.faAuktionErgebnis ?? null;

  const neuerRundenIndex = daten.faRundenIndex ?? 0;
  if (neuerRundenIndex !== rundenIndex) {
    rundenIndex = neuerRundenIndex;
    rundeAufloesungAusgeloest = false;
  }
  rundenKategorien = daten.faRundenKategorien ?? [];
  rundenErgebnis = daten.faRundenErgebnis ?? null;

  api.fortschritt(
    status === "auktion_gebot" || status === "auktion_ergebnis" ? `Gebotsrunde ${auktionRunde}/${ANZAHL_GEBOTSRUNDEN}` :
    status === "runde_spielen" || status === "runde_ergebnis" ? `Spielrunde ${rundenIndex + 1}/${ANZAHL_SPIELRUNDEN}` :
    ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("fa-setup").hidden = false;
  } else if (status === "auktion_gebot") {
    zeigeAuktion();
    $("fa-auktion-screen").hidden = false;
    pruefeAuktionsPhase();
  } else if (status === "auktion_ergebnis") {
    zeigeAuktionErgebnis();
    $("fa-auktion-ergebnis-screen").hidden = false;
  } else if (status === "runde_spielen") {
    zeigeRunde();
    $("fa-runde-screen").hidden = false;
    pruefeRundenPhase();
  } else if (status === "runde_ergebnis") {
    zeigeRundenErgebnis();
    $("fa-runde-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("fa-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["fa-setup", "fa-auktion-screen", "fa-auktion-ergebnis-screen", "fa-runde-screen",
   "fa-runde-ergebnis-screen", "fa-endstand-screen"].forEach((id) => { $(id).hidden = true; });
}

// ============================================================================
//  Setup
// ============================================================================
function zeigeSetup() {
  const anzahl = spielerListe.length;
  const maxSpieler = Math.floor(40 / ANZAHL_GEBOTSRUNDEN); // 8 - so oft passt der Kartenpool in 5 Runden
  $("fa-spieleranzahl-hinweis").textContent =
    `Aktuell ${anzahl} Spieler. Möglich sind 2 bis ${maxSpieler} Spieler (der Kartenpool reicht für ${maxSpieler} Spieler über ${ANZAHL_GEBOTSRUNDEN} Gebotsrunden).`;
  $("fa-starten").hidden = !api.istLeiter;
  $("fa-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();
}

async function spielStarten() {
  $("fa-setup-fehler").textContent = "";
  const anzahl = spielerListe.length;
  const maxSpieler = Math.floor(40 / ANZAHL_GEBOTSRUNDEN);
  if (anzahl < 2) {
    $("fa-setup-fehler").textContent = "Für die Fußball-Auktion werden mindestens 2 Spieler benötigt.";
    return;
  }
  if (anzahl > maxSpieler) {
    $("fa-setup-fehler").textContent = `Für die Fußball-Auktion sind maximal ${maxSpieler} Spieler möglich.`;
    return;
  }

  $("fa-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();

    const reihenfolge = mische(karten.map((k) => k.id));
    await Promise.all(spielerListe.map((s) =>
      updateDoc(api.spielerRef(s.id), { faMuenzen: STARTMUENZEN, faKarten: [], faGespielt: [], punkte: 0 })
    ));

    await updateDoc(api.raumRef(), {
      faStatus: "auktion_gebot",
      faKartenReihenfolge: reihenfolge,
      faAuktionRunde: 1,
      faAuktionKarten: reihenfolge.slice(0, anzahl),
      faAuktionErgebnis: null,
      faRundenIndex: 0,
      faRundenKategorien: [],
      faRundenErgebnis: null
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("fa-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  for (const name of ["fa_gebote", "fa_spielzuege"]) {
    const snap = await getDocs(collection(api.db, "raeume", api.code, name));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
}

export async function vorZurueck() {
  await raeumeSpieldatenAuf();
  await Promise.all(spielerListe.map((s) =>
    updateDoc(api.spielerRef(s.id), { faMuenzen: 0, faKarten: [], faGespielt: [], punkte: 0 })
  ));
  await updateDoc(api.raumRef(), {
    faStatus: null, faKartenReihenfolge: [], faAuktionRunde: 0, faAuktionKarten: [],
    faAuktionErgebnis: null, faRundenIndex: 0, faRundenKategorien: [], faRundenErgebnis: null
  });
  await api.zurueckZurAuswahl();
}

// ============================================================================
//  Auktionsphase
// ============================================================================
function kartenKachelHtml(k, { zeigeGesamt = true, markierteKategorien = [] } = {}) {
  const faehigkeitenHtml = KATEGORIEN.map((kat) => {
    const hervorgehoben = markierteKategorien.includes(kat);
    return `<span class="fa-faehigkeit${hervorgehoben ? " fa-faehigkeit-aktiv" : ""}">` +
      `<span class="fa-faehigkeit-kuerzel">${kat}</span>` +
      `<span class="fa-faehigkeit-wert">${k.faehigkeiten[kat]}</span>` +
    `</span>`;
  }).join("");
  return (
    `<div class="fa-karte-kopf">` +
      `<strong class="fa-karte-name">${escapeHtml(k.name)}</strong>` +
      `<span class="fa-karte-nation">${escapeHtml(k.nation)}</span>` +
    `</div>` +
    `<div class="fa-karte-faehigkeiten">${faehigkeitenHtml}</div>` +
    (zeigeGesamt ? `<div class="fa-karte-gesamt">Gesamt: ${kartenSumme(k)}</div>` : "")
  );
}

function zeigeAuktion() {
  const eigener = eigenerSpieler();
  if (!eigener) return;
  $("fa-auktion-runde").textContent = String(auktionRunde);
  $("fa-eigene-muenzen").textContent = String(eigener.faMuenzen ?? STARTMUENZEN);

  const aktiv = istAktiverBieter(eigener);
  $("fa-auktion-inaktiv-hinweis").hidden = aktiv;

  const bereitsAbgeschickt = alleGebote.some((g) => g.spielerId === api.spielerId && g.runde === auktionRunde);
  geboteAbgeschickt = bereitsAbgeschickt;

  const grid = $("fa-auktion-karten");
  grid.innerHTML = "";
  auktionKarten.forEach((kartenId) => {
    const k = karte(kartenId);
    if (!k) return;
    const div = document.createElement("div");
    div.className = "fa-karte";
    div.innerHTML = kartenKachelHtml(k) +
      (aktiv
        ? `<div class="fa-gebot-zeile"><span>Gebot</span>` +
          `<input type="number" min="0" step="1" inputmode="numeric" class="fa-gebot-eingabe" data-karte="${kartenId}" value="${eigeneGebote[kartenId] ?? 0}" ${bereitsAbgeschickt ? "disabled" : ""}></div>`
        : "");
    grid.appendChild(div);
  });

  if (aktiv && !bereitsAbgeschickt) {
    grid.querySelectorAll(".fa-gebot-eingabe").forEach((feld) => {
      feld.addEventListener("input", () => {
        const wert = parseInt(feld.value, 10);
        eigeneGebote[feld.dataset.karte] = Number.isFinite(wert) && wert >= 0 ? wert : 0;
      });
    });
  }

  $("fa-gebote-bestaetigen").hidden = !aktiv || bereitsAbgeschickt;
  $("fa-auktion-fehler").textContent = "";
  aktualisiereAuktionStatus();
}

async function geboteBestaetigen() {
  const eigener = eigenerSpieler();
  if (!eigener) return;
  $("fa-auktion-fehler").textContent = "";

  const gebote = {};
  auktionKarten.forEach((id) => { gebote[id] = eigeneGebote[id] ?? 0; });
  const fehler = pruefeGebote(gebote, auktionKarten, eigener.faMuenzen ?? STARTMUENZEN);
  if (fehler) {
    $("fa-auktion-fehler").textContent = fehler;
    return;
  }

  $("fa-gebote-bestaetigen").disabled = true;
  try {
    await setDoc(doc(api.db, "raeume", api.code, "fa_gebote", `${api.spielerId}_${auktionRunde}`), {
      spielerId: api.spielerId, runde: auktionRunde, gebote, zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Bestätigen der Gebote: " + e.message);
  }
  $("fa-gebote-bestaetigen").disabled = false;
}

function aktivierteBieter() {
  return spielerListe.filter(istAktiverBieter);
}

function aktualisiereAuktionStatus() {
  if (!el.wurzel || status !== "auktion_gebot") return;
  const bieter = aktivierteBieter();
  const abgeschickt = new Set(
    alleGebote.filter((g) => g.runde === auktionRunde).map((g) => g.spielerId)
  );
  renderWarteAvatare($("fa-auktion-status"), bieter.filter((s) => !abgeschickt.has(s.id)));
}

// Sobald alle aktiven Bieter ihre Gebote bestätigt haben, wertet nur der
// Spielleiter aus (verhindert doppelte Vergabe).
async function pruefeAuktionsPhase() {
  if (!api?.istLeiter || status !== "auktion_gebot" || auktionAufloesungAusgeloest) return;
  const bieter = aktivierteBieter();
  const abgeschickt = alleGebote.filter((g) => g.runde === auktionRunde);
  if (bieter.length > 0 && abgeschickt.length < bieter.length) return;

  auktionAufloesungAusgeloest = true;
  try {
    const geboteProSpieler = {};
    abgeschickt.forEach((g) => { geboteProSpieler[g.spielerId] = g.gebote ?? {}; });

    // Verbleibende Kapazität bis zur 5-Karten-Grenze - wichtig, damit ein
    // Spieler nicht in EINER Runde mehrere Karten gewinnt und dadurch über
    // das Limit kommt (siehe Kommentar in logik.js/loeseGebotsrundeAuf).
    const kapazitaetProSpieler = {};
    bieter.forEach((s) => {
      kapazitaetProSpieler[s.id] = MAX_KARTEN_PRO_SPIELER - (s.faKarten?.length ?? 0);
    });

    const { sieger, kostenProSpieler } = loeseGebotsrundeAuf(auktionKarten, geboteProSpieler, kapazitaetProSpieler);

    // Gewonnene Karten je Spieler sammeln, damit pro Spieler EIN updateDoc reicht.
    const kartenProGewinner = {};
    for (const [kartenId, spielerId] of Object.entries(sieger)) {
      if (!kartenProGewinner[spielerId]) kartenProGewinner[spielerId] = [];
      kartenProGewinner[spielerId].push(kartenId);
    }
    await Promise.all(Object.entries(kartenProGewinner).map(([spielerId, kartenIds]) =>
      updateDoc(api.spielerRef(spielerId), {
        faKarten: arrayUnion(...kartenIds),
        faMuenzen: increment(-(kostenProSpieler[spielerId] ?? 0))
      })
    ));

    const ergebnisAnzeige = {};
    for (const [kartenId, spielerId] of Object.entries(sieger)) {
      ergebnisAnzeige[kartenId] = { spielerId, betrag: geboteProSpieler[spielerId]?.[kartenId] ?? 0 };
    }

    await updateDoc(api.raumRef(), { faStatus: "auktion_ergebnis", faAuktionErgebnis: ergebnisAnzeige });
  } catch (e) {
    auktionAufloesungAusgeloest = false;
    zeigeDebug("Fehler bei der Gebotsauswertung: " + e.message);
  }
}

function zeigeAuktionErgebnis() {
  $("fa-auktion-erg-runde").textContent = String(auktionRunde);
  const liste = $("fa-auktion-erg-liste");
  liste.innerHTML = "";
  auktionKarten.forEach((kartenId) => {
    const k = karte(kartenId);
    if (!k) return;
    const eintrag = auktionErgebnis?.[kartenId];
    const gewinner = eintrag ? spielerListe.find((s) => s.id === eintrag.spielerId) : null;
    const div = document.createElement("div");
    div.className = "fa-karte fa-karte-ergebnis";
    div.innerHTML = kartenKachelHtml(k, { zeigeGesamt: false }) +
      (gewinner
        ? `<div class="fa-auktion-gewinner">${spielerKarte(gewinner.name, gewinner.farbe, gewinner.icon, `${eintrag.betrag} 🪙`, { punkteLinks: false })}</div>`
        : `<div class="fa-auktion-gewinner"><em>Niemand hat mitgeboten</em></div>`);
    liste.appendChild(div);
  });

  const letzteRunde = auktionRunde >= ANZAHL_GEBOTSRUNDEN;
  $("fa-auktion-weiter").hidden = !api.istLeiter;
  $("fa-auktion-weiter").textContent = letzteRunde ? "Zur Spielphase" : "Nächste Gebotsrunde";
  $("fa-auktion-erg-warten").hidden = api.istLeiter;
}

async function auktionWeiter() {
  $("fa-auktion-weiter").disabled = true;
  try {
    const reihenfolge = raum.faKartenReihenfolge ?? [];
    const anzahlSpieler = spielerListe.length;
    if (auktionRunde >= ANZAHL_GEBOTSRUNDEN) {
      await updateDoc(api.raumRef(), {
        faStatus: "runde_spielen",
        faRundenIndex: 0,
        faRundenKategorien: zufaelligeRundenKategorien(),
        faRundenErgebnis: null
      });
    } else {
      const naechsteRunde = auktionRunde + 1;
      const start = (naechsteRunde - 1) * anzahlSpieler;
      await updateDoc(api.raumRef(), {
        faStatus: "auktion_gebot",
        faAuktionRunde: naechsteRunde,
        faAuktionKarten: reihenfolge.slice(start, start + anzahlSpieler),
        faAuktionErgebnis: null
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("fa-auktion-weiter").disabled = false;
}

// ============================================================================
//  Spielphase
// ============================================================================
function eigeneVerfuegbareKarten(spielerObj) {
  const gespielt = new Set(spielerObj.faGespielt ?? []);
  return (spielerObj.faKarten ?? []).filter((id) => !gespielt.has(id));
}

// Spieler, die in dieser Runde noch eine Karte übrig haben und somit mitspielen.
function relevanteSpielerFuerRunde() {
  return spielerListe.filter((s) => eigeneVerfuegbareKarten(s).length > 0);
}

function zeigeRunde() {
  const eigener = eigenerSpieler();
  if (!eigener) return;
  $("fa-runde-index").textContent = String(rundenIndex + 1);
  $("fa-runde-kategorien").textContent = rundenKategorien.map((k) => KATEGORIE_NAMEN[k] ?? k).join(" + ");

  const verfuegbar = eigeneVerfuegbareKarten(eigener);
  $("fa-runde-keine-karte-hinweis").hidden = verfuegbar.length > 0;

  const bereitsGespielt = alleSpielzuege.some((z) => z.spielerId === api.spielerId && z.rundenIndex === rundenIndex);

  const grid = $("fa-runde-karten");
  grid.innerHTML = "";
  verfuegbar.forEach((kartenId) => {
    const k = karte(kartenId);
    if (!k) return;
    const div = document.createElement("div");
    div.className = "fa-karte fa-karte-waehlbar";
    div.innerHTML = kartenKachelHtml(k, { markierteKategorien: rundenKategorien }) +
      (bereitsGespielt ? "" : `<button type="button" class="btn-flach fa-karte-spielen-btn">Diese Karte spielen</button>`);
    if (!bereitsGespielt) {
      div.querySelector(".fa-karte-spielen-btn").addEventListener("click", () => karteSpielen(kartenId));
    }
    grid.appendChild(div);
  });

  aktualisiereRundenStatus();
}

async function karteSpielen(kartenId) {
  try {
    await setDoc(doc(api.db, "raeume", api.code, "fa_spielzuege", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId, rundenIndex, kartenId, zeitpunkt: serverTimestamp()
    });
    zeigeRunde();
  } catch (e) {
    zeigeDebug("Fehler beim Ausspielen der Karte: " + e.message);
  }
}

function aktualisiereRundenStatus() {
  if (!el.wurzel || status !== "runde_spielen") return;
  const relevant = relevanteSpielerFuerRunde();
  const gespielt = new Set(
    alleSpielzuege.filter((z) => z.rundenIndex === rundenIndex).map((z) => z.spielerId)
  );
  renderWarteAvatare($("fa-runde-status"), relevant.filter((s) => !gespielt.has(s.id)));
}

async function pruefeRundenPhase() {
  if (!api?.istLeiter || status !== "runde_spielen" || rundeAufloesungAusgeloest) return;
  const relevant = relevanteSpielerFuerRunde();
  const zuegeDieserRunde = alleSpielzuege.filter((z) => z.rundenIndex === rundenIndex);
  if (relevant.length > 0 && zuegeDieserRunde.length < relevant.length) return;

  rundeAufloesungAusgeloest = true;
  try {
    const [kat1, kat2] = rundenKategorien;
    const eintraege = zuegeDieserRunde.map((z) => {
      const k = karte(z.kartenId);
      const summe = (k?.faehigkeiten?.[kat1] ?? 0) + (k?.faehigkeiten?.[kat2] ?? 0);
      return { spielerId: z.spielerId, kartenId: z.kartenId, summe, gesamt: k ? kartenSumme(k) : 0 };
    });
    const punkte = relevant.length > 0 ? berechneRundenpunkte(eintraege) : {};

    await Promise.all(eintraege.map((eintrag) =>
      Promise.all([
        updateDoc(api.spielerRef(eintrag.spielerId), {
          punkte: increment(punkte[eintrag.spielerId] ?? 0),
          faGespielt: arrayUnion(eintrag.kartenId)
        })
      ])
    ));

    const ergebnisAnzeige = {};
    eintraege.forEach((eintrag) => {
      ergebnisAnzeige[eintrag.spielerId] = {
        kartenId: eintrag.kartenId, summe: eintrag.summe, gesamt: eintrag.gesamt,
        punkte: punkte[eintrag.spielerId] ?? 0
      };
    });

    await updateDoc(api.raumRef(), { faStatus: "runde_ergebnis", faRundenErgebnis: ergebnisAnzeige });
  } catch (e) {
    rundeAufloesungAusgeloest = false;
    zeigeDebug("Fehler bei der Rundenauswertung: " + e.message);
  }
}

function formatiertePunkte(p) {
  return p > 0 ? `+${p}` : `${p}`;
}

function zeigeRundenErgebnis() {
  $("fa-runde-erg-index").textContent = String(rundenIndex + 1);
  $("fa-runde-erg-kategorien").textContent = rundenKategorien.map((k) => KATEGORIE_NAMEN[k] ?? k).join(" + ");

  const eintraege = Object.entries(rundenErgebnis ?? {});
  const sortiert = eintraege.sort((a, b) => b[1].summe - a[1].summe);

  const liste = $("fa-runde-erg-liste");
  liste.innerHTML = "";
  sortiert.forEach(([spielerId, daten]) => {
    const s = spielerListe.find((x) => x.id === spielerId);
    if (!s) return;
    const k = karte(daten.kartenId);
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(
      s.name, s.farbe, s.icon, formatiertePunkte(daten.punkte),
      { extra: `${k ? k.name : "?"} - Summe ${daten.summe}`, punkteRechts: s.punkte ?? 0 }
    );
    liste.appendChild(li);
  });
  const ausgesetzt = spielerListe.filter((s) => !rundenErgebnis?.[s.id]);
  if (ausgesetzt.length > 0) {
    const hinweis = document.createElement("p");
    hinweis.className = "hinweis-text";
    hinweis.textContent = `Ohne eigene Karte diese Runde: ${ausgesetzt.map((s) => s.name).join(", ")}`;
    liste.appendChild(hinweis);
  }

  const letzteRunde = rundenIndex + 1 >= ANZAHL_SPIELRUNDEN;
  $("fa-runde-weiter").hidden = !api.istLeiter;
  $("fa-runde-weiter").textContent = letzteRunde ? "Endstand anzeigen" : "Nächste Runde";
  $("fa-runde-erg-warten").hidden = api.istLeiter;
}

async function rundeWeiter() {
  $("fa-runde-weiter").disabled = true;
  try {
    const naechste = rundenIndex + 1;
    if (naechste >= ANZAHL_SPIELRUNDEN) {
      await updateDoc(api.raumRef(), { faStatus: "beendet" });
      speichereWertung(api, "fussball-auktion", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        faStatus: "runde_spielen",
        faRundenIndex: naechste,
        faRundenKategorien: zufaelligeRundenKategorien(),
        faRundenErgebnis: null
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("fa-runde-weiter").disabled = false;
}

// ============================================================================
//  Endstand
// ============================================================================
function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("fa-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("fa-endstand-warten").hidden = api.istLeiter;
}
