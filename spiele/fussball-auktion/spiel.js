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
  serverTimestamp, increment, arrayUnion, runTransaction
} from "../../kern/firebase.js";
import { escapeHtml, spielerKarte, avatarHtml, renderWarteAvatare, initBereitSystem, zeigeDebug } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";
import {
  KATEGORIEN, KATEGORIE_NAMEN, STARTMUENZEN, MAX_KARTEN_PRO_SPIELER,
  ANZAHL_GEBOTSRUNDEN, ANZAHL_SPIELRUNDEN,
  kartenSumme, pruefeGebote, berechneRundenpunkte,
  kartenBearbeitungsreihenfolge, aufloesenEineKarte,
  zufaelligeRundenKategorien, mische,
  LAENDER_BONI, zaehleNationen, deutschlandPunkte, berechneKartenBoni,
  effektiveFaehigkeiten, effektiveGesamt, berechneNigeriaErstattung
} from "./logik.js?v=247";

// Stechen (Tiebreak bei Gleichstand): 10 Sekunden Zeit zum Erhöhen, jedes
// Erhöhen setzt den Timer zurück (siehe loeseAuktionsrundeAuf/pruefeStechenAblauf).
const STECHEN_DAUER_MS = 10000;
import { nationDesign, PORTRAET_BILDER, PORTRAET_VERSATZ, PORTRAET_GROESSE } from "./design.js?v=247";

const VORLAGE = `
  <div id="fa-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">
      Jeder startet mit ${STARTMUENZEN} Münzen. In 5 Gebotsrunden werden verdeckt Gebote auf
      Fußballkarten abgegeben (maximal ${MAX_KARTEN_PRO_SPIELER} Karten pro Spieler). Danach spielt
      jeder in 5 Runden verdeckt eine seiner Karten aus - entscheidend sind zwei
      je Runde neu bestimmte Fähigkeiten.
    </p>
    <div class="hinweis-text fa-boni-legende">
      <strong>Länderboni</strong> - wer mehrere Spieler eines Landes besitzt, bekommt einen Bonus, der mit der Anzahl wächst:
      <ul>
        <li>🇮🇹 Italien: Verteidigung +n · 🇫🇷 Frankreich: Geschwindigkeit +n · 🇦🇷 Argentinien: Schuss +n</li>
        <li>🇹🇷 Türkei: Pass +n · 🇧🇷 Brasilien: Technik +n · 🇯🇵 Japan: Spielverständnis +n</li>
        <li>🇩🇪 Deutschland: n-1 Fähigkeitspunkte frei verteilen (und die Gesamtwertung steigt zusätzlich um n-1)</li>
        <li>🇳🇬 Nigeria: Münzen-Rückerstattung beim 2. (20 %), 3. (40 %), 4. (60 %), 5. (80 %) Nigerianer</li>
      </ul>
      (n = Anzahl deiner Spieler dieses Landes, ab 2)
    </div>
    <p id="fa-spieleranzahl-hinweis" class="hinweis-text"></p>
    <p id="fa-setup-fehler" class="fehler-text"></p>
    <p><button id="fa-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="fa-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="fa-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="fa-auktion-screen" class="bildschirm-karte" hidden>
    <h2 id="fa-auktion-titel"></h2>
    <p class="hinweis-text">Münzen: <strong id="fa-eigene-muenzen"></strong> · Karten: <strong id="fa-eigene-kartenanzahl"></strong>/${MAX_KARTEN_PRO_SPIELER}</p>
    <p id="fa-eigene-boni" class="hinweis-text" hidden></p>
    <p id="fa-auktion-inaktiv-hinweis" class="hinweis-text" hidden>Du hast bereits ${MAX_KARTEN_PRO_SPIELER} Karten - in dieser Runde bietest du nicht mit.</p>
    <div id="fa-auktion-karten" class="fa-karten-grid"></div>
    <p id="fa-auktion-fehler" class="fehler-text"></p>
    <p><button id="fa-gebote-bestaetigen" class="btn-primaer" hidden>Gebote bestätigen</button></p>
    <div id="fa-auktion-status" class="warten-block"></div>
  </div>

  <div id="fa-stechen-screen" class="bildschirm-karte" hidden>
    <h2>🔥 Stechen!</h2>
    <p class="hinweis-text">Gleichstand bei dieser Karte - wer zuerst erhöht, liegt vorn. Läuft der
      Timer ohne neues Gebot ab, entscheidet das Los unter den aktuell Führenden.</p>
    <div id="fa-stechen-karte" class="fa-karten-grid"></div>
    <p class="wi-countdown" id="fa-stechen-countdown"></p>
    <div id="fa-stechen-gebote-liste" class="fa-gebote-liste"></div>
    <div id="fa-stechen-erhoehen-bereich" hidden>
      <p class="fa-gebot-zeile">
        <span>Dein Gebot</span>
        <input id="fa-stechen-eingabe" type="number" step="1" inputmode="numeric" class="fa-gebot-eingabe">
      </p>
      <p><button id="fa-stechen-erhoehen-btn" class="btn-primaer">Erhöhen</button></p>
      <p id="fa-stechen-fehler" class="fehler-text"></p>
    </div>
    <p id="fa-stechen-zuschauer-hinweis" class="hinweis-text" hidden><em>Du bist bei diesem Stechen nicht dabei.</em></p>
  </div>

  <div id="fa-auktion-ergebnis-screen" class="bildschirm-karte" hidden>
    <h2 id="fa-auktion-erg-titel"></h2>
    <div id="fa-auktion-erg-liste" class="fa-karten-grid fa-karten-grid-ergebnis"></div>
    <p><button id="fa-auktion-weiter" class="btn-primaer" hidden></button></p>
    <p id="fa-auktion-erg-warten" hidden><em>Der Spielleiter macht gleich weiter …</em></p>
  </div>

  <div id="fa-bonus-screen" class="bildschirm-karte" hidden>
    <h2>Länderboni</h2>
    <div id="fa-bonus-info" class="hinweis-text"></div>
    <div id="fa-bonus-de" hidden>
      <p class="hinweis-text"><strong id="fa-bonus-de-titel"></strong></p>
      <div id="fa-bonus-de-zeilen"></div>
      <p id="fa-bonus-fehler" class="fehler-text"></p>
      <p><button id="fa-bonus-bestaetigen" class="btn-primaer">Auswahl bestätigen</button></p>
    </div>
    <div id="fa-bonus-karten" class="fa-karten-grid"></div>
    <div id="fa-bonus-status" class="warten-block"></div>
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

// Stechen (Tiebreak) - siehe loeseAuktionsrundeAuf/pruefeStechenAblauf weiter unten.
let stechenKarte = null;
let stechenSpieler = [];
let stechenGebote = {};
let stechenAblaufZeit = null;
let stechenAufloesungAusgeloest = false;
let timerId = null;

// Länderbonus Deutschland (Auswahlphase "bonus_wahl")
let deEntwurf = [];            // [{ kartenId, kat }] - lokaler Entwurf vor dem Bestätigen
let bonusZeilenSignatur = "";
let bonusWeiterAusgeloest = false;

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

  timerId = setInterval(() => { aktualisiereStechenCountdown(); pruefeStechenAblauf(); }, 300);
}

function verdrahteBedienelemente() {
  $("fa-starten").addEventListener("click", spielStarten);
  $("fa-gebote-bestaetigen").addEventListener("click", geboteBestaetigen);
  $("fa-auktion-weiter").addEventListener("click", auktionWeiter);
  $("fa-runde-weiter").addEventListener("click", rundeWeiter);
  $("fa-stechen-erhoehen-btn").addEventListener("click", () => {
    const wert = parseInt($("fa-stechen-eingabe").value, 10);
    stechenGebotErhoehen(wert);
  });
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
  if (timerId) { clearInterval(timerId); timerId = null; }
  el = {};
  raum = {};
  alleGebote = []; alleSpielzuege = [];
  status = null; auktionRunde = 0; auktionKarten = []; auktionErgebnis = null;
  rundenIndex = 0; rundenKategorien = []; rundenErgebnis = null;
  eigeneGebote = {}; geboteAbgeschickt = false;
  auktionAufloesungAusgeloest = false; rundeAufloesungAusgeloest = false;
  stechenKarte = null; stechenSpieler = []; stechenGebote = {}; stechenAblaufZeit = null;
  stechenAufloesungAusgeloest = false;
  deEntwurf = []; bonusZeilenSignatur = ""; bonusWeiterAusgeloest = false;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "setup") zeigeSetup();
  if (status === "auktion_gebot") { zeigeAuktion(); pruefeAuktionsPhase(); }
  if (status === "auktion_stechen") { zeigeStechen(); }
  if (status === "auktion_ergebnis") zeigeAuktionErgebnis();
  if (status === "bonus_wahl") { zeigeBonusPhase(); pruefeBonusPhase(); }
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
  if (status !== "bonus_wahl") { bonusWeiterAusgeloest = false; deEntwurf = []; bonusZeilenSignatur = ""; }
  auktionKarten = daten.faAuktionKarten ?? [];
  auktionErgebnis = daten.faAuktionErgebnis ?? null;

  const neuerRundenIndex = daten.faRundenIndex ?? 0;
  if (neuerRundenIndex !== rundenIndex) {
    rundenIndex = neuerRundenIndex;
    rundeAufloesungAusgeloest = false;
  }
  rundenKategorien = daten.faRundenKategorien ?? [];
  rundenErgebnis = daten.faRundenErgebnis ?? null;

  const neueStechenKarte = daten.faStechenKarte ?? null;
  if (neueStechenKarte !== stechenKarte) {
    stechenKarte = neueStechenKarte;
    stechenAufloesungAusgeloest = false;
    if ($("fa-stechen-eingabe")) delete $("fa-stechen-eingabe").dataset.beruehrt;
  }
  stechenSpieler = daten.faStechenSpieler ?? [];
  stechenGebote = daten.faStechenGebote ?? {};
  stechenAblaufZeit = daten.faStechenAblaufZeit ?? null;

  api.fortschritt(
    status === "auktion_gebot" || status === "auktion_stechen" || status === "auktion_ergebnis"
      ? (auktionRunde > ANZAHL_GEBOTSRUNDEN ? "Bonusrunde" : `Gebotsrunde ${auktionRunde}/${ANZAHL_GEBOTSRUNDEN}`) :
    status === "bonus_wahl" ? "Länderboni" :
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
  } else if (status === "auktion_stechen") {
    zeigeStechen();
    $("fa-stechen-screen").hidden = false;
  } else if (status === "auktion_ergebnis") {
    zeigeAuktionErgebnis();
    $("fa-auktion-ergebnis-screen").hidden = false;
  } else if (status === "bonus_wahl") {
    zeigeBonusPhase();
    $("fa-bonus-screen").hidden = false;
    pruefeBonusPhase();
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
  ["fa-setup", "fa-auktion-screen", "fa-stechen-screen", "fa-auktion-ergebnis-screen", "fa-bonus-screen", "fa-runde-screen",
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
      updateDoc(api.spielerRef(s.id), { faMuenzen: STARTMUENZEN, faKarten: [], faGespielt: [], punkte: 0, faDeutschlandWahl: [], faDeutschlandFertig: false })
    ));

    await updateDoc(api.raumRef(), {
      faStatus: "auktion_gebot",
      faKartenReihenfolge: reihenfolge,
      faAuktionRunde: 1,
      faAuktionKarten: reihenfolge.slice(0, anzahl),
      faAuktionErgebnis: null,
      faUnvergebeneKarten: [],
      faAuktionOffeneKarten: [], faAuktionKapazitaet: {}, faAuktionGeboteSnapshot: {}, faAuktionZwischenergebnis: {},
      faStechenKarte: null, faStechenSpieler: [], faStechenGebote: {}, faStechenAblaufZeit: null,
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
    updateDoc(api.spielerRef(s.id), { faMuenzen: 0, faKarten: [], faGespielt: [], punkte: 0, faDeutschlandWahl: [], faDeutschlandFertig: false })
  ));
  await updateDoc(api.raumRef(), {
    faStatus: null, faKartenReihenfolge: [], faAuktionRunde: 0, faAuktionKarten: [],
    faAuktionErgebnis: null, faUnvergebeneKarten: [],
    faAuktionOffeneKarten: [], faAuktionKapazitaet: {}, faAuktionGeboteSnapshot: {}, faAuktionZwischenergebnis: {},
    faStechenKarte: null, faStechenSpieler: [], faStechenGebote: {}, faStechenAblaufZeit: null,
    faRundenIndex: 0, faRundenKategorien: [], faRundenErgebnis: null
  });
  await api.zurueckZurAuswahl();
}

// ============================================================================
//  Auktionsphase
// ============================================================================
function kartenPortraitHtml(k, akzent) {
  const bild = PORTRAET_BILDER[k.id];
  if (bild) {
    const versatz = PORTRAET_VERSATZ[k.id];
    const groesse = PORTRAET_GROESSE[k.id];
    const styleTeile = [];
    if (versatz) styleTeile.push(`right: calc(2% + ${versatz}%)`);
    if (groesse?.hoehe) styleTeile.push(`height: ${groesse.hoehe}%`);
    if (groesse?.unten) styleTeile.push(`bottom: ${groesse.unten}%`);
    const style = styleTeile.length ? ` style="${styleTeile.join("; ")}"` : "";
    return `<img class="fa-karte-portrait" src="${escapeHtml(bild)}" alt="${escapeHtml(k.name)}" draggable="false"${style}>`;
  }
  // Platzhalter-Silhouette (Kopf + Schultern) für alle Karten ohne echtes Bild.
  return (
    `<svg class="fa-karte-platzhalter" viewBox="0 0 86 106" fill="none" aria-hidden="true">` +
      `<circle cx="43" cy="30" r="22" fill="${akzent}" fill-opacity=".22"/>` +
      `<path d="M6 104c2-30 16-46 37-46s35 16 37 46" stroke="${akzent}" stroke-opacity=".28" stroke-width="11" fill="none" stroke-linecap="round"/>` +
    `</svg>`
  );
}

// Bonus eines Spielers für alle seine Karten (aus aktuellem Besitz + Deutschland-Wahl).
function bonusFuerSpieler(spielerObj, wahl) {
  return berechneKartenBoni(spielerObj?.faKarten ?? [], kartenNachId, wahl ?? spielerObj?.faDeutschlandWahl ?? []);
}

function kartenKachelHtml(k, { zeigeGesamt = true, markierteKategorien = [], bonus = null } = {}) {
  const { top, mid, bottom, akzent, flagge, flagSvg, flagViewBox } = nationDesign(k.nation);
  const [vorname, ...rest] = k.name.split(" ");
  const nachname = rest.join(" ") || vorname;

  const chipsHtml = KATEGORIEN.map((kat) => {
    const hervorgehoben = markierteKategorien.includes(kat);
    const plus = bonus?.boni?.[kat] ?? 0;
    return `<span class="fa-karte-chip${hervorgehoben ? " fa-karte-chip-aktiv" : ""}">` +
      `<span class="fa-karte-chip-kuerzel">${kat}</span>` +
      `<span class="fa-karte-chip-wert">${k.faehigkeiten[kat] + plus}` +
        (plus ? `<span class="fa-bonus-plus">+${plus}</span>` : "") +
      `</span>` +
    `</span>`;
  }).join("");

  // Gesamtwertung: Hauptzahl enthält die Fähigkeitsboni; daneben steht das
  // "+n" des Länderbonus (Deutschland: der zusätzliche Gesamtpunkt, sonst die
  // Fähigkeitserhöhung).
  const statPlus = Object.values(bonus?.boni ?? {}).reduce((x, y) => x + y, 0);
  const ratingPlus = k.nation === "Deutschland" ? (bonus?.extra ?? 0) : statPlus;
  const ratingHtml = zeigeGesamt
    ? `<div class="fa-karte-rating"><span>${kartenSumme(k) + statPlus}</span></div>` +
      (ratingPlus ? `<div class="fa-karte-rating-plus">+${ratingPlus}</div>` : "")
    : "";

  const flaggenBadgeHtml = zeigeGesamt
    ? `<div class="fa-karte-flaggenbadge"><svg width="100%" height="100%" viewBox="${flagViewBox}" preserveAspectRatio="xMidYMid meet">${flagSvg}</svg></div>`
    : "";

  return (
    `<div class="fa-karte-art" style="--n-top:${top};--n-mid:${mid};--n-bottom:${bottom};--n-akzent:${akzent};" title="${escapeHtml(flagge)} ${escapeHtml(k.nation)}">` +
      `<div class="fa-karte-bg fa-karte-bg-top"></div>` +
      `<div class="fa-karte-bg fa-karte-bg-mid"></div>` +
      `<div class="fa-karte-bg fa-karte-bg-bottom"></div>` +
      `<div class="fa-karte-carbon"></div>` +
      kartenPortraitHtml(k, akzent) +
      `<div class="fa-karte-namebox">` +
        `<span class="fa-vorname">${escapeHtml(vorname)}</span>` +
        `<span class="fa-nachname">${escapeHtml(nachname)}</span>` +
      `</div>` +
      ratingHtml +
      flaggenBadgeHtml +
      `<div class="fa-karte-statwrap">` +
        `<div class="fa-karte-statovl"></div>` +
        `<div class="fa-karte-statgrid">${chipsHtml}</div>` +
      `</div>` +
    `</div>`
  );
}

// Aktuelle Länderboni des eigenen Kartenbesitzes als kurze Textzeile.
function boniTexte(spielerObj) {
  const anzahl = zaehleNationen(spielerObj.faKarten ?? [], kartenNachId);
  const texte = [];
  for (const [nation, n] of Object.entries(anzahl)) {
    const regel = LAENDER_BONI[nation];
    if (!regel || n < 2) continue;
    if (regel.typ === "stat") texte.push(`${nation} ×${n}: ${KATEGORIE_NAMEN[regel.kat]} +${n}`);
    else if (regel.typ === "frei") texte.push(`${nation} ×${n}: ${deutschlandPunkte(n)} frei verteilbare${deutschlandPunkte(n) === 1 ? "r" : ""} Punkt${deutschlandPunkte(n) === 1 ? "" : "e"} (+${deutschlandPunkte(n)} Gesamt)`);
    else if (regel.typ === "rabatt") texte.push(`${nation} ×${n}: Münzen-Rückerstattung bis ${Math.min(80, (n - 1) * 20)} %`);
  }
  return texte;
}

function zeigeEigeneBoniZeile(eigener) {
  const texte = boniTexte(eigener);
  const p = $("fa-eigene-boni");
  p.hidden = texte.length === 0;
  p.textContent = texte.length ? "Länderboni: " + texte.join(" · ") : "";
}

function zeigeAuktion() {
  const eigener = eigenerSpieler();
  if (!eigener) return;
  $("fa-auktion-titel").textContent = auktionRunde > ANZAHL_GEBOTSRUNDEN
    ? "Bonusrunde - unvergebene Karten"
    : `Gebotsrunde ${auktionRunde}/${ANZAHL_GEBOTSRUNDEN}`;
  $("fa-eigene-muenzen").textContent = String(eigener.faMuenzen ?? STARTMUENZEN);
  $("fa-eigene-kartenanzahl").textContent = String(eigener.faKarten?.length ?? 0);
  zeigeEigeneBoniZeile(eigener);

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
    await loeseAuktionsrundeAuf(bieter, abgeschickt);
  } catch (e) {
    zeigeDebug("Fehler bei der Gebotsauswertung: " + e.message);
  }
  // auktionAufloesungAusgeloest bleibt bewusst true, bis die Runde komplett
  // fertig ist (auch über ein laufendes Stechen hinweg) - erst ein Wechsel
  // von faAuktionRunde (siehe raumDaten) setzt die Sperre wieder zurück.
  // Das verhindert, dass ein weiterer Snapshot währenddessen dieselbe Runde
  // ein zweites Mal anstößt.
}

// Setzt eine fertig abgegebene Gebotsrunde in Gang: ermittelt Bearbeitungs-
// reihenfolge (umkämpfteste Karte zuerst, siehe logik.js) und arbeitet sie
// Karte für Karte ab. Bei einem klaren Gewinner oder "niemand geboten" geht
// es sofort mit der nächsten Karte weiter; bei einem Gleichstand > 0 Münzen
// wird ein Stechen gestartet und die Funktion kehrt zurück - die Fortsetzung
// übernimmt dann pruefeStechenAblauf(), sobald das Stechen entschieden ist.
async function loeseAuktionsrundeAuf(bieter, abgeschickt) {
  const geboteProSpieler = {};
  abgeschickt.forEach((g) => { geboteProSpieler[g.spielerId] = g.gebote ?? {}; });

  // Verbleibende Kapazität bis zur 5-Karten-Grenze - wichtig, damit ein
  // Spieler nicht in EINER Runde mehrere Karten gewinnt und dadurch über das
  // Limit kommt (siehe Kommentar in logik.js/aufloesenEineKarte).
  const kapazitaet = {};
  bieter.forEach((s) => { kapazitaet[s.id] = MAX_KARTEN_PRO_SPIELER - (s.faKarten?.length ?? 0); });

  const reihenfolge = kartenBearbeitungsreihenfolge(auktionKarten, geboteProSpieler);

  await updateDoc(api.raumRef(), {
    faAuktionGeboteSnapshot: geboteProSpieler,
    faAuktionZwischenergebnis: {}
  });

  await bearbeiteOffeneKarten(reihenfolge, geboteProSpieler, kapazitaet, {});
}

// Arbeitet die übergebene Kartenliste sequenziell ab. geboteProSpieler/
// kapazitaet/zwischenergebnis werden als normale JS-Werte durchgereicht (kein
// Re-Read aus dem Raum-Dokument nötig), SOLANGE kein Stechen dazwischenkommt -
// bei einem Stechen kehrt die Funktion zurück und wird erst über
// pruefeStechenAblauf() mit frisch eingelesenem Zustand fortgesetzt, weil
// dort echte Zeit vergeht (Spieler können erhöhen).
async function bearbeiteOffeneKarten(offeneKarten, geboteProSpieler, kapazitaet, zwischenergebnis) {
  if (offeneKarten.length === 0) {
    await beendeAuktionsRunde(zwischenergebnis);
    return;
  }

  const [kartenId, ...rest] = offeneKarten;
  const ergebnis = aufloesenEineKarte(kartenId, geboteProSpieler, kapazitaet);

  if (ergebnis.typ === "niemand") {
    await updateDoc(api.raumRef(), { faUnvergebeneKarten: arrayUnion(kartenId) });
    await bearbeiteOffeneKarten(rest, geboteProSpieler, kapazitaet, zwischenergebnis);
  } else if (ergebnis.typ === "gewinner") {
    await vergebeKarte(kartenId, ergebnis.spielerId, ergebnis.betrag);
    kapazitaet[ergebnis.spielerId] -= 1;
    zwischenergebnis[kartenId] = { spielerId: ergebnis.spielerId, betrag: ergebnis.betrag };
    await updateDoc(api.raumRef(), {
      faAuktionZwischenergebnis: zwischenergebnis,
      faAuktionOffeneKarten: rest
    });
    await bearbeiteOffeneKarten(rest, geboteProSpieler, kapazitaet, zwischenergebnis);
  } else {
    // Unentschieden (Gleichstand > 0 Münzen) - Stechen starten und pausieren.
    await updateDoc(api.raumRef(), {
      faStatus: "auktion_stechen",
      faAuktionOffeneKarten: rest,
      faAuktionZwischenergebnis: zwischenergebnis,
      faAuktionKapazitaet: kapazitaet,
      faStechenKarte: kartenId,
      faStechenSpieler: ergebnis.spielerIds,
      faStechenGebote: Object.fromEntries(ergebnis.spielerIds.map((id) => [id, ergebnis.betrag])),
      faStechenAblaufZeit: Date.now() + STECHEN_DAUER_MS
    });
  }
}

async function vergebeKarte(kartenId, spielerId, betrag) {
  await updateDoc(api.spielerRef(spielerId), {
    faKarten: arrayUnion(kartenId),
    faMuenzen: increment(-betrag)
  });
}

// Nigeria-Rabatt: nach jeder Gebotsrunde bekommt ein Spieler für seine in dieser
// Runde gewonnenen Nigerianer einen Teil des Kaufpreises zurück (2. Nigerianer
// 20 %, 3. 40 %, 4. 60 %, 5. 80 %; bei mehreren in einer Runde gehört die
// höhere Stufe zur teureren Karte). Kaufmännisch gerundet.
async function wendeNigeriaErstattungAn(zwischenergebnis) {
  const proSpieler = {};
  for (const [kartenId, e] of Object.entries(zwischenergebnis)) {
    if (karte(kartenId)?.nation !== "Nigeria") continue;
    (proSpieler[e.spielerId] ??= []).push({ kartenId, betrag: e.betrag });
  }
  for (const [spielerId, gewonnen] of Object.entries(proSpieler)) {
    const s = spielerListe.find((x) => x.id === spielerId);
    // Vorbesitz = Nigerianer, die NICHT zu dieser Gebotsrunde gehören (robust
    // gegen einen noch nicht aktualisierten Spieler-Snapshot).
    const bisher = (s?.faKarten ?? []).filter((id) => karte(id)?.nation === "Nigeria" && !auktionKarten.includes(id)).length;
    const erstattungen = berechneNigeriaErstattung(bisher, gewonnen);
    let summe = 0;
    for (const [kartenId, r] of Object.entries(erstattungen)) {
      zwischenergebnis[kartenId] = { ...zwischenergebnis[kartenId], prozent: r.prozent, erstattung: r.erstattung };
      summe += r.erstattung;
    }
    if (summe > 0) await updateDoc(api.spielerRef(spielerId), { faMuenzen: increment(summe) });
  }
}

async function beendeAuktionsRunde(zwischenergebnis) {
  await wendeNigeriaErstattungAn(zwischenergebnis);
  await updateDoc(api.raumRef(), {
    faStatus: "auktion_ergebnis",
    faAuktionErgebnis: zwischenergebnis,
    faAuktionOffeneKarten: [],
    faStechenKarte: null, faStechenSpieler: [], faStechenGebote: {}, faStechenAblaufZeit: null
  });
}

// Vom Leiter periodisch aufgerufen (siehe timerId in starten()): sobald die
// 10-Sekunden-Frist eines laufenden Stechens abgelaufen ist, OHNE dass in der
// Zwischenzeit neu erhöht wurde (das hätte faStechenAblaufZeit verschoben),
// entscheidet das Los unter den Spielern, die aktuell das höchste Gebot
// halten (meist alle ursprünglich Gleichauf-Liegenden - sobald aber jemand
// allein erhöht hat und niemand mehr nachzieht, gewinnt er/sie direkt, weil
// dann nur noch eine Person das Höchstgebot hält).
async function pruefeStechenAblauf() {
  if (!api?.istLeiter || status !== "auktion_stechen" || stechenAufloesungAusgeloest) return;
  if (!raum.faStechenAblaufZeit || Date.now() < raum.faStechenAblaufZeit) return;

  stechenAufloesungAusgeloest = true;
  try {
    const gebote = raum.faStechenGebote ?? {};
    const werte = Object.values(gebote);
    const hoechstesGebot = werte.length ? Math.max(...werte) : 0;
    const fuehrende = Object.entries(gebote).filter(([, betrag]) => betrag === hoechstesGebot).map(([id]) => id);
    const gewinnerId = fuehrende.length === 1
      ? fuehrende[0]
      : fuehrende[Math.floor(Math.random() * fuehrende.length)];

    const kartenId = raum.faStechenKarte;
    const kapazitaet = { ...(raum.faAuktionKapazitaet ?? {}) };
    const zwischenergebnis = { ...(raum.faAuktionZwischenergebnis ?? {}) };
    const geboteProSpieler = raum.faAuktionGeboteSnapshot ?? {};
    const offeneKarten = raum.faAuktionOffeneKarten ?? [];

    await vergebeKarte(kartenId, gewinnerId, hoechstesGebot);
    kapazitaet[gewinnerId] = (kapazitaet[gewinnerId] ?? 1) - 1;
    zwischenergebnis[kartenId] = { spielerId: gewinnerId, betrag: hoechstesGebot };

    await bearbeiteOffeneKarten(offeneKarten, geboteProSpieler, kapazitaet, zwischenergebnis);
  } catch (e) {
    zeigeDebug("Fehler bei der Stechen-Auflösung: " + e.message);
  }
  stechenAufloesungAusgeloest = false;
}

function aktualisiereStechenCountdown() {
  if (!el.wurzel) return;
  if (status !== "auktion_stechen" || !stechenAblaufZeit) { $("fa-stechen-countdown").textContent = ""; return; }
  const rest = Math.max(0, stechenAblaufZeit - Date.now());
  $("fa-stechen-countdown").textContent = `Noch ${Math.ceil(rest / 1000)}s zum Erhöhen`;
}

function zeigeStechen() {
  const k = karte(stechenKarte);
  if (!k) return;

  $("fa-stechen-karte").innerHTML = `<div class="fa-karte">${kartenKachelHtml(k)}</div>`;

  const hoechstesGebot = Math.max(0, ...Object.values(stechenGebote));
  const liste = $("fa-stechen-gebote-liste");
  liste.innerHTML = stechenSpieler.map((spielerId) => {
    const s = spielerListe.find((x) => x.id === spielerId);
    if (!s) return "";
    const betrag = stechenGebote[spielerId] ?? 0;
    const fuehrt = betrag === hoechstesGebot;
    return `<div class="fa-gebot-eintrag${fuehrt ? " fa-gebot-gewinner" : ""}" style="--spieler-farbe:${escapeHtml(s.farbe ?? "#22c55e")}">` +
      avatarHtml(s.icon, "fa-gebot-avatar") +
      `<span class="fa-gebot-name">${escapeHtml(s.name)}</span>` +
      `<strong class="fa-gebot-betrag">${betrag} <span class="fa-goldmuenze" aria-hidden="true"></span></strong>` +
    `</div>`;
  }).join("");

  const binIchDabei = stechenSpieler.includes(api.spielerId);
  $("fa-stechen-erhoehen-bereich").hidden = !binIchDabei;
  $("fa-stechen-zuschauer-hinweis").hidden = binIchDabei;

  if (binIchDabei) {
    const eigener = eigenerSpieler();
    const eingabe = $("fa-stechen-eingabe");
    eingabe.min = String(hoechstesGebot + 1);
    eingabe.max = String(eigener?.faMuenzen ?? hoechstesGebot + 1);
    if (!eingabe.dataset.beruehrt) eingabe.value = String(hoechstesGebot + 1);
    $("fa-stechen-erhoehen-btn").disabled = (eigener?.faMuenzen ?? 0) <= hoechstesGebot;
  }
}

async function stechenGebotErhoehen(neuerBetrag) {
  const eigener = eigenerSpieler();
  $("fa-stechen-fehler").textContent = "";
  if (!eigener || status !== "auktion_stechen" || !stechenSpieler.includes(api.spielerId)) return;
  if (!Number.isInteger(neuerBetrag) || neuerBetrag <= 0) {
    $("fa-stechen-fehler").textContent = "Bitte eine gültige Zahl eingeben.";
    return;
  }
  if (neuerBetrag > (eigener.faMuenzen ?? 0)) {
    $("fa-stechen-fehler").textContent = `Du hast nur noch ${eigener.faMuenzen ?? 0} Münzen.`;
    return;
  }

  $("fa-stechen-eingabe").dataset.beruehrt = "1";
  $("fa-stechen-erhoehen-btn").disabled = true;
  try {
    await runTransaction(api.db, async (tx) => {
      const snap = await tx.get(api.raumRef());
      const daten = snap.data();
      if (!daten || daten.faStatus !== "auktion_stechen" || daten.faStechenKarte !== stechenKarte) {
        throw new Error("__ZU_SPAET__");
      }
      const aktuelleGebote = daten.faStechenGebote ?? {};
      const aktuellesHoechstgebot = Object.values(aktuelleGebote).length
        ? Math.max(...Object.values(aktuelleGebote))
        : 0;
      if (neuerBetrag <= aktuellesHoechstgebot) throw new Error("__ZU_NIEDRIG__");
      tx.update(api.raumRef(), {
        faStechenGebote: { ...aktuelleGebote, [api.spielerId]: neuerBetrag },
        faStechenAblaufZeit: Date.now() + STECHEN_DAUER_MS
      });
    });
  } catch (e) {
    if (e.message === "__ZU_NIEDRIG__") {
      $("fa-stechen-fehler").textContent = "Jemand hat gerade schon höher geboten - bitte neu versuchen.";
    } else if (e.message !== "__ZU_SPAET__") {
      zeigeDebug("Fehler beim Erhöhen: " + e.message);
    }
  }
  $("fa-stechen-erhoehen-btn").disabled = false;
}

function zeigeAuktionErgebnis() {
  $("fa-auktion-erg-titel").textContent = auktionRunde > ANZAHL_GEBOTSRUNDEN
    ? "Ergebnis Bonusrunde"
    : `Ergebnis Gebotsrunde ${auktionRunde}/${ANZAHL_GEBOTSRUNDEN}`;
  const liste = $("fa-auktion-erg-liste");
  liste.innerHTML = "";

  // Alle Gebote dieser (bereits ausgewerteten) Runde - für die "wer hat was
  // geboten"-Übersicht. Bleibt nach der Auswertung unverändert in alleGebote
  // stehen (wird erst beim nächsten Spielstart gelöscht).
  const geboteDieserRunde = alleGebote.filter((g) => g.runde === auktionRunde);

  auktionKarten.forEach((kartenId) => {
    const k = karte(kartenId);
    if (!k) return;

    const geboteFuerKarte = geboteDieserRunde
      .map((g) => ({ spielerId: g.spielerId, betrag: g.gebote?.[kartenId] ?? 0 }))
      .sort((a, b) => b.betrag - a.betrag);

    const gewinnerId = raum.faAuktionErgebnis?.[kartenId]?.spielerId;
    const gewinnerBetrag = raum.faAuktionErgebnis?.[kartenId]?.betrag;

    const geboteHtml = geboteFuerKarte.map((g) => {
      const s = spielerListe.find((x) => x.id === g.spielerId);
      if (!s) return "";
      const hatGewonnen = g.spielerId === gewinnerId;
      // Bei einem Stechen liegt der tatsächliche (ggf. höher erhöhte)
      // Siegerbetrag in faAuktionErgebnis, nicht mehr im ursprünglich
      // abgegebenen Gebot - fürs Siegerfeld den finalen Betrag anzeigen.
      const angezeigterBetrag = hatGewonnen && gewinnerBetrag != null ? gewinnerBetrag : g.betrag;
      return `<div class="fa-gebot-eintrag${hatGewonnen ? " fa-gebot-gewinner" : ""}" style="--spieler-farbe:${escapeHtml(s.farbe ?? "#22c55e")}">` +
        avatarHtml(s.icon, "fa-gebot-avatar") +
        `<span class="fa-gebot-name">${escapeHtml(s.name)}</span>` +
        `<strong class="fa-gebot-betrag">${angezeigterBetrag} <span class="fa-goldmuenze" aria-hidden="true"></span></strong>` +
        (hatGewonnen ? `<span class="fa-gebot-sieger-abzeichen" title="Hat die Karte bekommen">🏆</span>` : "") +
      `</div>`;
    }).join("");

    const erg = raum.faAuktionErgebnis?.[kartenId];
    const rabattHtml = erg?.prozent > 0
      ? `<div class="fa-rabatt-zeile">🇳🇬 Nigeria-Rabatt ${erg.prozent} %: <strong>${erg.erstattung}</strong> <span class="fa-goldmuenze" aria-hidden="true"></span> zurück</div>`
      : "";
    const div = document.createElement("div");
    div.className = "fa-karte fa-karte-ergebnis";
    div.innerHTML = kartenKachelHtml(k) + rabattHtml +
      `<div class="fa-gebote-ueberschrift">Gebote auf diese Karte</div>` +
      (geboteFuerKarte.length
        ? `<div class="fa-gebote-liste">${geboteHtml}</div>`
        : `<div class="fa-gebote-liste"><em>Niemand hat mitgeboten</em></div>`);
    liste.appendChild(div);
  });

  const unvergebene = raum.faUnvergebeneKarten ?? [];
  let weiterText;
  if (auktionRunde < ANZAHL_GEBOTSRUNDEN) {
    weiterText = "Nächste Gebotsrunde";
  } else if (auktionRunde === ANZAHL_GEBOTSRUNDEN && unvergebene.length > 0) {
    weiterText = `Bonusrunde (${unvergebene.length} unvergebene ${unvergebene.length === 1 ? "Karte" : "Karten"})`;
  } else {
    weiterText = "Zur Spielphase";
  }
  $("fa-auktion-weiter").hidden = !api.istLeiter;
  $("fa-auktion-weiter").textContent = weiterText;
  $("fa-auktion-erg-warten").hidden = api.istLeiter;
}

async function starteSpielphase() {
  await updateDoc(api.raumRef(), {
    faStatus: "runde_spielen",
    faRundenIndex: 0,
    faRundenKategorien: zufaelligeRundenKategorien(),
    faRundenErgebnis: null
  });
}

async function auktionWeiter() {
  $("fa-auktion-weiter").disabled = true;
  try {
    const reihenfolge = raum.faKartenReihenfolge ?? [];
    const anzahlSpieler = spielerListe.length;
    const unvergebene = raum.faUnvergebeneKarten ?? [];

    if (auktionRunde < ANZAHL_GEBOTSRUNDEN) {
      const naechsteRunde = auktionRunde + 1;
      const start = (naechsteRunde - 1) * anzahlSpieler;
      await updateDoc(api.raumRef(), {
        faStatus: "auktion_gebot",
        faAuktionRunde: naechsteRunde,
        faAuktionKarten: reihenfolge.slice(start, start + anzahlSpieler),
        faAuktionErgebnis: null
      });
    } else if (auktionRunde === ANZAHL_GEBOTSRUNDEN && unvergebene.length > 0) {
      // Bonusrunde: alle bisher unvergebenen Karten (kein Gebot ODER
      // Gleichstand bei 0 Münzen) noch einmal zur Versteigerung freigeben.
      await updateDoc(api.raumRef(), {
        faStatus: "auktion_gebot",
        faAuktionRunde: ANZAHL_GEBOTSRUNDEN + 1,
        faAuktionKarten: unvergebene,
        faUnvergebeneKarten: [],
        faAuktionErgebnis: null
      });
    } else if (spielerListe.some((s) => deutschlandPunkte(zaehleNationen(s.faKarten ?? [], kartenNachId).Deutschland ?? 0) > 0)) {
      // Mindestens ein Spieler hat 2+ deutsche Karten -> erst die Deutschland-Wahl.
      await updateDoc(api.raumRef(), { faStatus: "bonus_wahl", faAuktionErgebnis: null });
    } else {
      await starteSpielphase();
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("fa-auktion-weiter").disabled = false;
}

// ============================================================================
//  Länderbonus-Phase (nur wenn jemand 2+ deutsche Karten hat)
// ============================================================================
function deutscheKartenIds(spielerObj) {
  return (spielerObj.faKarten ?? []).filter((id) => karte(id)?.nation === "Deutschland");
}

function zeigeBonusPhase() {
  const eigener = eigenerSpieler();
  if (!eigener || !el.wurzel) return;
  const deIds = deutscheKartenIds(eigener);
  const punkte = deutschlandPunkte(deIds.length);
  const fertig = !!eigener.faDeutschlandFertig;

  const texte = boniTexte(eigener).filter((t) => !t.startsWith("Deutschland") && !t.startsWith("Nigeria"));
  $("fa-bonus-info").innerHTML = texte.length
    ? `Deine Länderboni:<ul>${texte.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : (punkte > 0 ? "" : "Du hast keinen Länderbonus.");

  const deBlock = $("fa-bonus-de");
  deBlock.hidden = !(punkte > 0 && !fertig);
  if (punkte > 0 && !fertig) {
    $("fa-bonus-de-titel").textContent =
      `Deutschland ×${deIds.length}: Verteile ${punkte} Punkt${punkte === 1 ? "" : "e"} auf Fähigkeiten deiner deutschen Spieler ` +
      `(jeder Punkt erhöht auch die Gesamtwertung zusätzlich um +1).`;
    const signatur = `${punkte}|${deIds.join(",")}`;
    if (signatur !== bonusZeilenSignatur) {
      bonusZeilenSignatur = signatur;
      deEntwurf = Array.from({ length: punkte }, (_, i) => deEntwurf[i] && deIds.includes(deEntwurf[i].kartenId)
        ? deEntwurf[i] : { kartenId: deIds[0], kat: KATEGORIEN[0] });
      const zeilen = $("fa-bonus-de-zeilen");
      zeilen.innerHTML = "";
      deEntwurf.forEach((wahl, i) => {
        const zeile = document.createElement("div");
        zeile.className = "fa-gebot-zeile fa-bonus-zeile";
        zeile.innerHTML =
          `<span>Punkt ${i + 1}</span>` +
          `<select class="fa-bonus-auswahl" data-i="${i}" data-feld="kartenId">` +
            deIds.map((id) => `<option value="${id}"${id === wahl.kartenId ? " selected" : ""}>${escapeHtml(karte(id)?.name ?? id)}</option>`).join("") +
          `</select>` +
          `<select class="fa-bonus-auswahl" data-i="${i}" data-feld="kat">` +
            KATEGORIEN.map((kat) => `<option value="${kat}"${kat === wahl.kat ? " selected" : ""}>${KATEGORIE_NAMEN[kat]}</option>`).join("") +
          `</select>`;
        zeilen.appendChild(zeile);
      });
      zeilen.querySelectorAll("select").forEach((sel) => sel.addEventListener("change", () => {
        deEntwurf[Number(sel.dataset.i)][sel.dataset.feld] = sel.value;
        zeigeBonusKarten();
      }));
    }
    $("fa-bonus-bestaetigen").onclick = deutschlandBestaetigen;
  }

  zeigeBonusKarten();

  const wartende = spielerListe.filter((s) => deutschlandPunkte(deutscheKartenIds(s).length) > 0 && !s.faDeutschlandFertig);
  renderWarteAvatare($("fa-bonus-status"), wartende);
}

// Eigene Karten inkl. Boni (Vorschau der aktuellen Deutschland-Auswahl).
function zeigeBonusKarten() {
  const eigener = eigenerSpieler();
  if (!eigener) return;
  const wahl = eigener.faDeutschlandFertig ? (eigener.faDeutschlandWahl ?? []) : deEntwurf;
  const bonus = bonusFuerSpieler(eigener, wahl);
  const grid = $("fa-bonus-karten");
  grid.innerHTML = "";
  (eigener.faKarten ?? []).forEach((id) => {
    const k = karte(id);
    if (!k) return;
    const div = document.createElement("div");
    div.className = "fa-karte";
    div.innerHTML = kartenKachelHtml(k, { bonus: bonus[id] });
    grid.appendChild(div);
  });
}

async function deutschlandBestaetigen() {
  const eigener = eigenerSpieler();
  if (!eigener) return;
  $("fa-bonus-bestaetigen").disabled = true;
  try {
    await updateDoc(api.spielerRef(api.spielerId), {
      faDeutschlandWahl: deEntwurf.map((w) => ({ kartenId: w.kartenId, kat: w.kat })),
      faDeutschlandFertig: true
    });
  } catch (e) {
    zeigeDebug("Fehler beim Speichern der Deutschland-Wahl: " + e.message);
  }
  $("fa-bonus-bestaetigen").disabled = false;
}

// Leiter: sobald alle betroffenen Spieler bestätigt haben, geht es los.
async function pruefeBonusPhase() {
  if (!api?.istLeiter || status !== "bonus_wahl" || bonusWeiterAusgeloest) return;
  const offen = spielerListe.some((s) => deutschlandPunkte(deutscheKartenIds(s).length) > 0 && !s.faDeutschlandFertig);
  if (offen) return;
  bonusWeiterAusgeloest = true;
  try {
    await starteSpielphase();
  } catch (e) {
    bonusWeiterAusgeloest = false;
    zeigeDebug("Fehler beim Start der Spielphase: " + e.message);
  }
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
  const eigeneBoni = bonusFuerSpieler(eigener);
  verfuegbar.forEach((kartenId) => {
    const k = karte(kartenId);
    if (!k) return;
    const div = document.createElement("div");
    div.className = "fa-karte fa-karte-waehlbar";
    div.innerHTML = kartenKachelHtml(k, { markierteKategorien: rundenKategorien, bonus: eigeneBoni[kartenId] }) +
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
      const bonus = bonusFuerSpieler(spielerListe.find((x) => x.id === z.spielerId))[z.kartenId];
      const werte = k ? effektiveFaehigkeiten(k, bonus) : {};
      const summe = (werte[kat1] ?? 0) + (werte[kat2] ?? 0);
      return { spielerId: z.spielerId, kartenId: z.kartenId, summe, gesamt: k ? effektiveGesamt(k, bonus) : 0 };
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
