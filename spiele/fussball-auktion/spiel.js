// ============================================================================
//  Länderspiel (früher: Fußball-Auktion)
// ----------------------------------------------------------------------------
//  Ablauf: 1) Auktionsphase - 5 Gebotsrunden, in denen verdeckt auf Karten
//  geboten wird (maximal 5 Karten pro Spieler). 2) Spielphase - 5 Runden, in
//  denen jeder erst verdeckt eine Karte wählt und dann Münzen auf die 6
//  Fähigkeiten setzt; die zwei Fähigkeiten mit den meisten Münzen (bei
//  Gleichstand mehr) entscheiden, bezahlt werden nur deren Münzen.
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
  BONUS_MUENZEN_SPIELPHASE, pruefeEinsatz, bestimmeRundenKategorien, berechneEinsatzZahlungen, mische,
  LAENDER_BONI, zaehleNationen, berechneKartenBoni,
  effektiveFaehigkeiten, effektiveGesamt, berechneNigeriaErstattung, nigeriaRabattProzent
} from "./logik.js?v=265";

// Stechen (Tiebreak bei Gleichstand): 10 Sekunden Zeit zum Erhöhen, jedes
// Erhöhen setzt den Timer zurück (siehe loeseAuktionsrundeAuf/pruefeStechenAblauf).
const STECHEN_DAUER_MS = 10000;
import { zeigeAnleitung, anleitungFuerRaumGezeigt } from "./anleitung.js?v=265";
import { nationDesign, PORTRAET_BILDER, PORTRAET_VERSATZ, PORTRAET_GROESSE } from "./design.js?v=265";

const VORLAGE = `
  <button id="fa-anleitung-btn" type="button" class="fa-anl-knopf">📖 Spielanleitung</button>
  <div id="fa-setup" class="bildschirm-karte" hidden>
    <div class="fa-regeln">
      <div class="fa-regel-block">
        <h3>🪙 Auktion</h3>
        <p>Jeder startet mit <strong>${STARTMUENZEN} Münzen</strong>.</p>
        <p>In ${ANZAHL_GEBOTSRUNDEN} Gebotsrunden bietest du verdeckt auf Fußballkarten.</p>
        <p>Maximal <strong>${MAX_KARTEN_PRO_SPIELER} Karten</strong> pro Spieler. Karten, die am Ende niemand ersteigert hat, werden zufällig verteilt – jeder hat danach genau ${MAX_KARTEN_PRO_SPIELER}. Pro geschenkter Karte gibt es 1 Bonusmünze weniger in den Spielrunden.</p>
      </div>
      <div class="fa-regel-block">
        <h3>🎯 Spielrunden</h3>
        <p>Deine <strong>übrigen Münzen</strong> nimmst du mit – dazu gibt es <strong>+${BONUS_MUENZEN_SPIELPHASE} Münzen</strong> für jeden.</p>
        <p>In ${ANZAHL_SPIELRUNDEN} Runden wählst du <strong>erst verdeckt eine Karte</strong>, dann setzt du Münzen auf die 6 Fähigkeiten.</p>
        <p>Die <strong>zwei Fähigkeiten mit den meisten Münzen</strong> entscheiden (bei Gleichstand zählen alle). Bezahlt werden nur die Münzen auf diesen Fähigkeiten – der Rest bleibt dir.</p>
      </div>
      <div class="fa-regel-block">
        <h3>🌍 Länderboni</h3>
        <p>Wer mehrere Spieler eines Landes besitzt, bekommt einen Bonus, der mit der Anzahl wächst.</p>
        <ul class="fa-regel-liste">
          <li>🇮🇹 <strong>Italien</strong> – Verteidigung +n</li>
          <li>🇫🇷 <strong>Frankreich</strong> – Geschwindigkeit +n</li>
          <li>🇦🇷 <strong>Argentinien</strong> – Schuss +n</li>
          <li>🇹🇷 <strong>Türkei</strong> – Pass +n</li>
          <li>🇧🇷 <strong>Brasilien</strong> – Technik +n</li>
          <li>🇯🇵 <strong>Japan</strong> – Spielverständnis +n</li>
          <li>🇩🇪 <strong>Deutschland</strong> – in jeder Spielrunde bekommt jede deutsche Karte bekommt automatisch +(n−1) auf die Fähigkeit mit den meisten Münzen</li>
          <li>🇳🇬 <strong>Nigeria</strong> – Münzen-Rückerstattung beim 2. (30 %), 3. (50 %), 4. (75 %) und 5. (100 %) Nigerianer</li>
        </ul>
        <p class="fa-regel-hinweis">n = Anzahl deiner Spieler dieses Landes (ab 2)</p>
      </div>
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

  <div id="fa-runde-screen" class="bildschirm-karte" hidden>
    <h2>Spielrunde <span id="fa-runde-index"></span>/${ANZAHL_SPIELRUNDEN}</h2>
    <p class="hinweis-text">Münzen: <strong id="fa-runde-muenzen"></strong></p>
    <p id="fa-runde-de-hinweis" class="hinweis-text" hidden></p>
    <p id="fa-runde-zufall-hinweis" class="hinweis-text" hidden></p>
    <p id="fa-runde-keine-karte-hinweis" class="hinweis-text" hidden>Du hast keine Karte mehr für diese Runde.</p>
    <p id="fa-runde-schritt" class="fa-runde-schritt"></p>
    <div id="fa-runde-karten" class="fa-karten-grid"></div>
    <div id="fa-runde-einsatz" class="fa-einsatz" hidden>
      <div id="fa-runde-einsatz-zeilen"></div>
      <p class="hinweis-text">Noch frei: <strong id="fa-einsatz-rest"></strong> Münzen</p>
      <p class="fa-regel-hinweis">Die zwei Fähigkeiten mit den meisten Münzen entscheiden die Runde. Bezahlt werden nur die Münzen auf den entscheidenden Fähigkeiten – alles andere bekommst du zurück.</p>
      <p id="fa-einsatz-fehler" class="fehler-text"></p>
      <p><button id="fa-einsatz-bestaetigen" class="btn-primaer"></button></p>
    </div>
    <div id="fa-runde-status" class="warten-block"></div>
  </div>

  <div id="fa-runde-ergebnis-screen" class="bildschirm-karte" hidden>
    <h2>Ergebnis Spielrunde <span id="fa-runde-erg-index"></span>/${ANZAHL_SPIELRUNDEN}</h2>
    <p class="hinweis-text">Entscheidend war: <strong id="fa-runde-erg-kategorien"></strong></p>
    <div id="fa-runde-erg-summen" class="fa-erg-summen"></div>
    <p id="fa-runde-erg-notiz" class="fa-regel-hinweis" hidden></p>
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
let alleEinsaetze = [];       // alle Dokumente aus fa_einsaetze (ungefiltert)
let einsaetzeUnsub = null;
let eigenerEinsatz = {};      // lokaler Entwurf { KAT: n } der laufenden Spielrunde
let einsatzUiRunde = -1;      // für welche Runde das Einsatz-Formular gebaut ist

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

  // Anleitung: automatisch, sobald man (nach Spieler- und Farbwahl) im Raum bei
  // diesem Spiel ankommt - einmal pro Raum und Gerät, und nur im Setup, damit
  // keine laufende Auktion mit Timern verdeckt wird. Sonst über den Knopf oben.
  const anleitungOeffnen = () => zeigeAnleitung({ kartenHtml: (id, opt) => kartenKachelHtml(karte(id), opt), raumCode: api.code });
  $("fa-anleitung-btn").addEventListener("click", anleitungOeffnen);
  // Ist gerade der Update-Hinweis offen, erst danach die Anleitung zeigen.
  let versuche = 0;
  const wartenUndOeffnen = () => {
    if (document.querySelector(".ank-overlay") && versuche++ < 240) { setTimeout(wartenUndOeffnen, 500); return; }
    anleitungOeffnen();
  };
  const startStatus = api.raum?.faStatus ?? null;
  if ((startStatus === null || startStatus === "setup") && !anleitungFuerRaumGezeigt(api.code)) wartenUndOeffnen();

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
  $("fa-einsatz-bestaetigen").addEventListener("click", einsatzBestaetigen);
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
    if (status === "runde_spielen") { zeigeRunde(); pruefeRundenPhase(); }
  });
  einsaetzeUnsub = onSnapshot(collection(api.db, "raeume", api.code, "fa_einsaetze"), (snap) => {
    alleEinsaetze = [];
    snap.forEach((d) => alleEinsaetze.push(d.data()));
    if (status === "runde_spielen") { zeigeRunde(); pruefeRundenPhase(); }
  });
}

export function beenden() {
  bereitSystem = null;
  if (geboteUnsub) { geboteUnsub(); geboteUnsub = null; }
  if (spielzuegeUnsub) { spielzuegeUnsub(); spielzuegeUnsub = null; }
  if (einsaetzeUnsub) { einsaetzeUnsub(); einsaetzeUnsub = null; }
  if (timerId) { clearInterval(timerId); timerId = null; }
  el = {};
  raum = {};
  alleGebote = []; alleSpielzuege = []; alleEinsaetze = [];
  eigenerEinsatz = {}; einsatzUiRunde = -1;
  status = null; auktionRunde = 0; auktionKarten = []; auktionErgebnis = null;
  rundenIndex = 0; rundenKategorien = []; rundenErgebnis = null;
  eigeneGebote = {}; geboteAbgeschickt = false;
  auktionAufloesungAusgeloest = false; rundeAufloesungAusgeloest = false;
  stechenKarte = null; stechenSpieler = []; stechenGebote = {}; stechenAblaufZeit = null;
  stechenAufloesungAusgeloest = false;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "setup") zeigeSetup();
  if (status === "auktion_gebot") { zeigeAuktion(); pruefeAuktionsPhase(); }
  if (status === "auktion_stechen") { zeigeStechen(); }
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
    eigenerEinsatz = {};
    einsatzUiRunde = -1;
  }
  if (status !== "runde_spielen") einsatzUiRunde = -1;
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
  ["fa-setup", "fa-auktion-screen", "fa-stechen-screen", "fa-auktion-ergebnis-screen", "fa-runde-screen",
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
    $("fa-setup-fehler").textContent = "Für Länderspiel werden mindestens 2 Spieler benötigt.";
    return;
  }
  if (anzahl > maxSpieler) {
    $("fa-setup-fehler").textContent = `Für Länderspiel sind maximal ${maxSpieler} Spieler möglich.`;
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
      faUnvergebeneKarten: [], faZufallsKarten: {},
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
  for (const name of ["fa_gebote", "fa_spielzuege", "fa_einsaetze"]) {
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
    faAuktionErgebnis: null, faUnvergebeneKarten: [], faZufallsKarten: {},
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

// Bonus eines Spielers für alle seine Karten (aus aktuellem Besitz; in den
// Spielrunden mit den gezogenen Fähigkeiten, für den Deutschland-Bonus).
function bonusFuerSpieler(spielerObj, kategorien = []) {
  return berechneKartenBoni(spielerObj?.faKarten ?? [], kartenNachId, kategorien);
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
  // "+n" des Länderbonus (Summe der Fähigkeitserhöhungen).
  // Deutschland: Rundenbonus steht nur auf der Fähigkeit, nicht bei der Gesamtwertung.
  const statPlus = k.nation === "Deutschland" ? 0 : Object.values(bonus?.boni ?? {}).reduce((x, y) => x + y, 0);
  const ratingPlus = statPlus;
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
    else if (regel.typ === "frei") texte.push(`${nation} ×${n}: in jeder Spielrunde +${n - 1} auf die Fähigkeit mit den meisten Münzen`);
    else if (regel.typ === "rabatt") texte.push(`${nation} ×${n}: Münzen-Rückerstattung bis ${nigeriaRabattProzent(Math.min(n, 5))} %`);
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
// 30 %, 3. 50 %, 4. 75 %, 5. 100 %; bei mehreren in einer Runde gehört die
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
  // Garantie: Jeder hat 5 Karten. Karten, die auch nach der Bonusrunde unverkauft
  // sind (kein Gebot / keine Münzen mehr), werden zufällig auf Spieler mit
  // weniger als 5 Karten verteilt - ohne Kosten.
  const zufallsKarten = {};
  const uebrig = mische([...(raum.faUnvergebeneKarten ?? [])]);
  const bedarf = mische(spielerListe.flatMap((s) =>
    Array.from({ length: Math.max(0, MAX_KARTEN_PRO_SPIELER - (s.faKarten?.length ?? 0)) }, () => s.id)));
  while (uebrig.length > 0 && bedarf.length > 0) {
    const id = bedarf.pop();
    (zufallsKarten[id] ??= []).push(uebrig.pop());
  }
  await Promise.all(Object.entries(zufallsKarten).map(([id, ids]) =>
    updateDoc(api.spielerRef(id), { faKarten: arrayUnion(...ids) })
  ));
  // Übrige Auktionsmünzen bleiben erhalten, dazu gibt es den Bonus - minus 1 Münze pro geschenkter Zufallskarte.
  await Promise.all(spielerListe.map((s) =>
    updateDoc(api.spielerRef(s.id), {
      faMuenzen: increment(Math.max(0, BONUS_MUENZEN_SPIELPHASE - (zufallsKarten[s.id]?.length ?? 0)))
    })
  ));
  await updateDoc(api.raumRef(), {
    faStatus: "runde_spielen",
    faRundenIndex: 0,
    faRundenKategorien: [],
    faRundenErgebnis: null,
    faZufallsKarten: zufallsKarten,
    faUnvergebeneKarten: []
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
    } else {
      await starteSpielphase();
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

function eigeneEinsatzSumme() {
  return KATEGORIEN.reduce((summe, kat) => summe + (eigenerEinsatz[kat] ?? 0), 0);
}

// Setzt den Einsatz auf eine Fähigkeit, begrenzt auf die noch freien Münzen.
function setzeEinsatz(kat, wert) {
  const muenzen = eigenerSpieler()?.faMuenzen ?? 0;
  const frei = muenzen - (eigeneEinsatzSumme() - (eigenerEinsatz[kat] ?? 0));
  eigenerEinsatz[kat] = Math.max(0, Math.min(Number.isFinite(wert) ? wert : 0, frei));
  aktualisiereEinsatzUi();
}

function aktualisiereEinsatzUi() {
  const muenzen = eigenerSpieler()?.faMuenzen ?? 0;
  const rest = muenzen - eigeneEinsatzSumme();
  $("fa-einsatz-rest").textContent = String(rest);
  $("fa-runde-einsatz-zeilen").querySelectorAll(".fa-einsatz-zeile").forEach((zeile) => {
    const kat = zeile.dataset.kat;
    const eingabe = zeile.querySelector("input");
    if (document.activeElement !== eingabe) eingabe.value = String(eigenerEinsatz[kat] ?? 0);
    zeile.querySelector('[data-d="1"]').disabled = rest <= 0;
    zeile.querySelector('[data-d="-1"]').disabled = (eigenerEinsatz[kat] ?? 0) <= 0;
    zeile.classList.toggle("fa-einsatz-aktiv", (eigenerEinsatz[kat] ?? 0) > 0);
  });
  $("fa-einsatz-bestaetigen").textContent = eigeneEinsatzSumme() === 0 ? "Ohne Münzen weiter" : `${eigeneEinsatzSumme()} Münzen setzen`;
}

function baueEinsatzUi() {
  const box = $("fa-runde-einsatz-zeilen");
  box.innerHTML = "";
  KATEGORIEN.forEach((kat) => {
    const zeile = document.createElement("div");
    zeile.className = "fa-einsatz-zeile";
    zeile.dataset.kat = kat;
    zeile.innerHTML =
      `<span class="fa-einsatz-name">${escapeHtml(KATEGORIE_NAMEN[kat])}</span>` +
      `<button type="button" class="fa-einsatz-btn" data-d="-1" aria-label="weniger">−</button>` +
      `<input type="number" min="0" step="1" inputmode="numeric" class="fa-einsatz-eingabe" value="0" aria-label="Münzen auf ${escapeHtml(KATEGORIE_NAMEN[kat])}">` +
      `<button type="button" class="fa-einsatz-btn" data-d="1" aria-label="mehr">+</button>`;
    const eingabe = zeile.querySelector("input");
    zeile.querySelectorAll(".fa-einsatz-btn").forEach((b) =>
      b.addEventListener("click", () => setzeEinsatz(kat, (eigenerEinsatz[kat] ?? 0) + parseInt(b.dataset.d, 10)))
    );
    eingabe.addEventListener("input", () => {
      const wert = parseInt(eingabe.value, 10);
      setzeEinsatz(kat, Number.isNaN(wert) ? 0 : wert);
      if (eingabe.value !== "" && String(eigenerEinsatz[kat]) !== eingabe.value) eingabe.value = String(eigenerEinsatz[kat]);
    });
    eingabe.addEventListener("blur", () => { eingabe.value = String(eigenerEinsatz[kat] ?? 0); });
    box.appendChild(zeile);
  });
}

function zeigeRunde() {
  const eigener = eigenerSpieler();
  if (!eigener || !el.wurzel) return;
  $("fa-runde-index").textContent = String(rundenIndex + 1);
  $("fa-runde-muenzen").textContent = String(eigener.faMuenzen ?? 0);

  const verfuegbar = eigeneVerfuegbareKarten(eigener);
  $("fa-runde-keine-karte-hinweis").hidden = verfuegbar.length > 0;

  const eigenerZug = alleSpielzuege.find((z) => z.spielerId === api.spielerId && z.rundenIndex === rundenIndex);
  const einsatzAbgegeben = alleEinsaetze.some((e) => e.spielerId === api.spielerId && e.rundenIndex === rundenIndex);
  const schritt = verfuegbar.length === 0 ? 0 : !eigenerZug ? 1 : !einsatzAbgegeben ? 2 : 3;

  const zufall = (raum.faZufallsKarten ?? {})[api.spielerId] ?? [];
  const zufallHinweis = $("fa-runde-zufall-hinweis");
  zufallHinweis.hidden = zufall.length === 0 || rundenIndex !== 0;
  zufallHinweis.textContent = zufallHinweis.hidden ? "" :
    `🎲 Zufällig zugeteilt: ${zufall.map((id) => karte(id)?.name ?? id).join(", ")} – dafür gibt es ${zufall.length} ${zufall.length === 1 ? "Münze" : "Münzen"} weniger Bonus (${Math.max(0, BONUS_MUENZEN_SPIELPHASE - zufall.length)} statt ${BONUS_MUENZEN_SPIELPHASE}).`;

  const deAnzahl = zaehleNationen(eigener.faKarten ?? [], kartenNachId).Deutschland ?? 0;
  const deHinweis = $("fa-runde-de-hinweis");
  deHinweis.hidden = deAnzahl < 2 || verfuegbar.length === 0;
  deHinweis.textContent = deHinweis.hidden ? "" : `🇩🇪 Deutschland-Bonus: jede deutsche Karte bekommt +${deAnzahl - 1} auf die Fähigkeit mit den meisten Münzen`;

  $("fa-runde-schritt").textContent =
    schritt === 1 ? "① Wähle deine Karte für diese Runde – danach setzt du Münzen auf die Fähigkeiten." :
    schritt === 2 ? "② Setze Münzen auf die Fähigkeiten, die für deine Karte stark sind." :
    schritt === 3 ? "Fertig – warte auf die anderen." : "";

  const grid = $("fa-runde-karten");
  grid.innerHTML = "";
  const eigeneBoni = bonusFuerSpieler(eigener, []);
  const anzuzeigen = schritt === 1 ? verfuegbar : (eigenerZug && schritt > 1 ? [eigenerZug.kartenId] : []);
  anzuzeigen.forEach((kartenId) => {
    const k = karte(kartenId);
    if (!k) return;
    const div = document.createElement("div");
    div.className = "fa-karte" + (schritt === 1 ? " fa-karte-waehlbar" : "");
    div.innerHTML = kartenKachelHtml(k, { bonus: eigeneBoni[kartenId] }) +
      (schritt === 1 ? `<button type="button" class="btn-flach fa-karte-spielen-btn">Diese Karte spielen</button>` : "");
    if (schritt === 1) div.querySelector(".fa-karte-spielen-btn").addEventListener("click", () => karteSpielen(kartenId));
    grid.appendChild(div);
  });

  $("fa-runde-einsatz").hidden = schritt !== 2;
  if (schritt === 2) {
    if (einsatzUiRunde !== rundenIndex) { baueEinsatzUi(); einsatzUiRunde = rundenIndex; }
    aktualisiereEinsatzUi();
  } else {
    einsatzUiRunde = -1;
  }

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

async function einsatzBestaetigen() {
  const eigener = eigenerSpieler();
  if (!eigener) return;
  $("fa-einsatz-fehler").textContent = "";
  const einsatz = Object.fromEntries(KATEGORIEN.map((k) => [k, eigenerEinsatz[k] ?? 0]));
  const fehler = pruefeEinsatz(einsatz, eigener.faMuenzen ?? 0);
  if (fehler) { $("fa-einsatz-fehler").textContent = fehler; return; }
  $("fa-einsatz-bestaetigen").disabled = true;
  try {
    await setDoc(doc(api.db, "raeume", api.code, "fa_einsaetze", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId, rundenIndex, einsatz, zeitpunkt: serverTimestamp()
    });
    zeigeRunde();
  } catch (e) {
    zeigeDebug("Fehler beim Setzen der Münzen: " + e.message);
  }
  $("fa-einsatz-bestaetigen").disabled = false;
}

function aktualisiereRundenStatus() {
  if (!el.wurzel || status !== "runde_spielen") return;
  const relevant = relevanteSpielerFuerRunde();
  const fertig = new Set(
    alleSpielzuege.filter((z) => z.rundenIndex === rundenIndex).map((z) => z.spielerId)
      .filter((id) => alleEinsaetze.some((e) => e.spielerId === id && e.rundenIndex === rundenIndex))
  );
  renderWarteAvatare($("fa-runde-status"), relevant.filter((s) => !fertig.has(s.id)));
}

async function pruefeRundenPhase() {
  if (!api?.istLeiter || status !== "runde_spielen" || rundeAufloesungAusgeloest) return;
  const relevant = relevanteSpielerFuerRunde();
  const zuege = alleSpielzuege.filter((z) => z.rundenIndex === rundenIndex);
  const einsatzDocs = alleEinsaetze.filter((e) => e.rundenIndex === rundenIndex);
  const alleFertig = relevant.every((s) =>
    zuege.some((z) => z.spielerId === s.id) && einsatzDocs.some((e) => e.spielerId === s.id));
  if (!alleFertig) return;

  rundeAufloesungAusgeloest = true;
  try {
    const zuegeRelevant = zuege.filter((z) => relevant.some((s) => s.id === z.spielerId));

    // Einsätze einlesen (ungültige -> 0)
    const einsaetze = {};
    relevant.forEach((s) => {
      const roh = einsatzDocs.find((e) => e.spielerId === s.id)?.einsatz ?? {};
      const einsatz = Object.fromEntries(KATEGORIEN.map((k) => [k, Number.isInteger(roh[k]) && roh[k] > 0 ? roh[k] : 0]));
      einsaetze[s.id] = pruefeEinsatz(einsatz, s.faMuenzen ?? 0) ? Object.fromEntries(KATEGORIEN.map((k) => [k, 0])) : einsatz;
    });
    const bestimmung = bestimmeRundenKategorien(einsaetze);
    const kategorien = bestimmung.kategorien;
    const zahlungen = berechneEinsatzZahlungen(einsaetze, kategorien);

    const eintraege = zuegeRelevant.map((z) => {
      const k = karte(z.kartenId);
      const bonus = bonusFuerSpieler(spielerListe.find((x) => x.id === z.spielerId), kategorien)[z.kartenId];
      const werte = k ? effektiveFaehigkeiten(k, bonus) : {};
      const summe = kategorien.reduce((sum, kat) => sum + (werte[kat] ?? 0), 0);
      return { spielerId: z.spielerId, kartenId: z.kartenId, summe, gesamt: k ? effektiveGesamt(k, bonus) : 0 };
    });
    const punkte = eintraege.length > 0 ? berechneRundenpunkte(eintraege) : {};

    await Promise.all(eintraege.map((eintrag) => {
      const aenderung = {
        punkte: increment(punkte[eintrag.spielerId] ?? 0),
        faGespielt: arrayUnion(eintrag.kartenId)
      };
      if ((zahlungen[eintrag.spielerId] ?? 0) > 0) aenderung.faMuenzen = increment(-zahlungen[eintrag.spielerId]);
      return updateDoc(api.spielerRef(eintrag.spielerId), aenderung);
    }));

    const spielerAnzeige = {};
    eintraege.forEach((eintrag) => {
      const eingesetzt = KATEGORIEN.reduce((sum, kat) => sum + einsaetze[eintrag.spielerId][kat], 0);
      const bezahlt = zahlungen[eintrag.spielerId] ?? 0;
      spielerAnzeige[eintrag.spielerId] = {
        kartenId: eintrag.kartenId, summe: eintrag.summe, gesamt: eintrag.gesamt,
        punkte: punkte[eintrag.spielerId] ?? 0,
        einsatz: einsaetze[eintrag.spielerId], bezahlt, zurueck: eingesetzt - bezahlt
      };
    });

    await updateDoc(api.raumRef(), {
      faStatus: "runde_ergebnis",
      faRundenKategorien: kategorien,
      faRundenErgebnis: { spieler: spielerAnzeige, summen: bestimmung.summen, zufaellig: bestimmung.zufaellig }
    });
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

  const erg = rundenErgebnis ?? {};
  const spielerErg = erg.spieler ?? {};
  const summen = erg.summen ?? {};

  const summenBox = $("fa-runde-erg-summen");
  summenBox.innerHTML = [...KATEGORIEN]
    .sort((a, b) => (summen[b] ?? 0) - (summen[a] ?? 0) || KATEGORIEN.indexOf(a) - KATEGORIEN.indexOf(b))
    .map((kat) => `<span class="fa-erg-summe${rundenKategorien.includes(kat) ? " fa-erg-summe-gewonnen" : ""}">` +
      `${escapeHtml(KATEGORIE_NAMEN[kat])} <strong>${summen[kat] ?? 0}</strong> 🪙</span>`)
    .join("");

  const notizen = [];
  if (rundenKategorien.length > 2 && !(erg.zufaellig?.length)) notizen.push("Gleichstand um Platz 2 – alle gleichauf liegenden Fähigkeiten zählen.");
  if (erg.zufaellig?.length) notizen.push(`Zu wenige Münzen gesetzt – ${erg.zufaellig.map((k) => KATEGORIE_NAMEN[k]).join(" + ")} zufällig ergänzt.`);
  const notiz = $("fa-runde-erg-notiz");
  notiz.hidden = notizen.length === 0;
  notiz.textContent = notizen.join(" ");

  const sortiert = Object.entries(spielerErg).sort((a, b) => b[1].summe - a[1].summe);

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
    ) + `<p class="fa-erg-muenzen">🪙 ${daten.bezahlt} bezahlt${daten.zurueck > 0 ? `, ${daten.zurueck} zurück` : ""} · noch ${s.faMuenzen ?? 0}</p>`;
    liste.appendChild(li);
  });
  const ausgesetzt = spielerListe.filter((s) => !spielerErg[s.id]);
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
        faRundenKategorien: [],
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
