// ============================================================================
//  Pokerduell
// ----------------------------------------------------------------------------
//  Jeder Spieler hat ein 5x5-Raster. In jeder Runde kommt für alle dieselbe Karte,
//  die man in ein freies Feld legen muss (jede dritte Runde: zwei Karten, eine
//  davon wählen). Nach 25 Runden ist das Raster voll. Dann zählen 12 Reihen
//  (5 Zeilen, 5 Spalten, 2 Diagonalen) als Pokerhand. Pro Reihe bekommt der Beste
//  n Reihenpunkte, der Nächste n-1 ... Wer die meisten Reihenpunkte hat, gewinnt;
//  die Spielpunkte folgen dem einheitlichen Punktesystem (siehe kern/wertung.js).
//  Bonus: jede starke Hand gibt zusätzlich Bonuspunkte (Straße +1 ... Royal Flush +12).
//  Tausch: zwischen der 11. und 20. Karte wird eine Tausch-Karte aufgedeckt - dann darf jeder zwei Karten im eigenen Raster tauschen.
//  Raumfelder beginnen mit "pd"; die Züge liegen in "pdZuege" (Dokument je
//  Spieler und Runde).
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem } from "../../kern/ui.js";
import { speichereWertung, punkteNachRang } from "../../kern/wertung.js";
import {
  ZELLEN, REIHEN, baueRunden, kartenDerRunde, istTauschEintrag, istWahlEintrag, kartenBild, TAUSCH_BILD,
  alleKartenBilder, wertePokerduellAus, zellenAusZuegen, tauscheZellen
} from "./logik.js";

const ZUG_SEKUNDEN = 25;
const WAHL_SEKUNDEN = 35;
const PUFFER_MS = 10000;   // Sicherheitsnetz: der Spielleiter legt für Säumige automatisch

const VORLAGE = `
  <div id="pd-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Jeder hat ein leeres 5x5-Raster. Jede Runde kommt für alle dieselbe Karte, die du in ein
      freies Feld legst - jede dritte Runde kommen zwei Karten und du wählst eine. Nach 25 Runden ist das Raster voll.
      Dann zählen alle 12 Reihen (5 Zeilen, 5 Spalten, 2 Diagonalen) als Pokerhand. Pro Reihe gibt es Punkte für die
      beste Hand - wer insgesamt die meisten Reihenpunkte hat, gewinnt. Starke Hände geben außerdem Bonuspunkte
      (Straße +1, Flush +2, Full House +3, Vierling +5, Straight Flush +8, Royal Flush +12). Zwischen Karte 11 und 20
      wird eine Tausch-Karte aufgedeckt: Dann darfst du zwei Karten in deinem Raster vertauschen.</p>
    <p id="pd-setup-fehler" class="fehler-text"></p>
    <p><button id="pd-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="pd-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="pd-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="pd-runde-screen" class="bildschirm-karte pd-karte" hidden>
    <p class="kategorie" id="pd-titel">Pokerduell</p>
    <div class="ft-zeitbalken"><div id="pd-zeitbalken-fuell"></div></div>
    <div id="pd-angebot" class="pd-angebot"></div>
    <div class="ft-knoepfe"><button id="pd-tausch" type="button" class="btn-sekundaer" hidden>Karten tauschen</button></div>
    <div class="ft-knoepfe"><button id="pd-ablegen" type="button" class="btn-primaer" disabled>Ablegen</button></div>
    <div id="pd-status" class="warten-block"></div>
    <div id="pd-mein-raster" class="pd-raster"></div>
  </div>

  <div id="pd-ergebnis-screen" class="bildschirm-karte pd-karte" hidden>
    <p class="kategorie">Pokerduell - Auswertung</p>
    <ul id="pd-erg-liste" class="pd-erg-liste"></ul>
    <div id="pd-detail-raster" class="pd-detail"></div>
    <ul id="pd-reihen-liste" class="pd-reihen-liste"></ul>
    <p><button id="pd-weiter" class="btn-primaer" hidden>Endstand anzeigen</button></p>
  </div>

  <div id="pd-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="pd-endstand-liste"></ul>
    <p id="pd-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="pd-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let alleZuege = [];
let zuegeUnsub = null;
let tickId = null;

let status = null;
let rundenIndex = -1;
let startZeit = 0;
let runden = [];
let gewaehlteKarte = null;     // Index im Angebot (nur Wahlrunden relevant)
let gewaehlteZelle = null;
let tauschModus = false;       // gerade im Tausch-Modus (zwei Karten antippen)
let tauschErste = null;
let tauschPaar = null;         // geplanter Tausch dieser Runde: [feldA, feldB]
let sendet = false;
let leiterBeschaeftigt = false;
let letzteBearbeiteteRunde = -2;
let angezeigterSpieler = null;
let markierteReihe = null;

let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "pd");
  olympiadeAutoStart = false;
  alleKartenBilder().forEach((src) => { const i = new Image(); i.src = src; });

  $("pd-starten").addEventListener("click", spielStarten);
  $("pd-ablegen").addEventListener("click", () => legeAb(false));
  $("pd-tausch").addEventListener("click", tauschKnopf);
  $("pd-weiter").addEventListener("click", weiter);
  starteListener();

  if (api.istLeiter && !api.raum?.pdStatus) {
    await updateDoc(api.raumRef(), { pdStatus: "setup", pdRundenIndex: 0, pdStart: 0, pdRunden: [] });
  }
  tickId = setInterval(tick, 200);
}

function starteListener() {
  zuegeUnsub = onSnapshot(collection(api.db, "raeume", api.code, "pdZuege"), (snap) => {
    alleZuege = [];
    snap.forEach((d) => alleZuege.push(d.data()));
    if (status === "runde_aktiv") { zeichneRunde(); }
    if (status === "ausgewertet") zeigeErgebnis();
  });
}

export function beenden() {
  bereitSystem = null;
  if (zuegeUnsub) { zuegeUnsub(); zuegeUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  el = {};
  spielerListe = []; alleZuege = []; status = null; rundenIndex = -1; startZeit = 0; runden = [];
  gewaehlteKarte = null; gewaehlteZelle = null; sendet = false; leiterBeschaeftigt = false;
  tauschModus = false; tauschErste = null; tauschPaar = null;
  letzteBearbeiteteRunde = -2; angezeigterSpieler = null; markierteReihe = null;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "runde_aktiv") zeichneRunde();
  if (status === "ausgewertet") zeigeErgebnis();
  if (status === "beendet") zeigeEndstand();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.pdStatus ?? null;
  runden = daten.pdRunden ?? [];
  const neuerIndex = daten.pdRundenIndex ?? 0;
  const neuerStart = daten.pdStart ?? 0;
  if (status === "runde_aktiv" && (rundenIndex !== neuerIndex || startZeit !== neuerStart)) {
    gewaehlteKarte = null; gewaehlteZelle = null; sendet = false;
    tauschModus = false; tauschErste = null; tauschPaar = null;
  }
  rundenIndex = neuerIndex;
  startZeit = neuerStart;

  api.fortschritt(status === "runde_aktiv" ? `${rundenIndex + 1}/${runden.length}` : "");

  ["pd-setup", "pd-runde-screen", "pd-ergebnis-screen", "pd-endstand-screen"].forEach((id) => { $(id).hidden = true; });
  if (status === "setup" || !status) {
    zeigeSetup();
    $("pd-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    $("pd-runde-screen").hidden = false;
    zeichneRunde();
    tick();
  } else if (status === "ausgewertet") {
    $("pd-ergebnis-screen").hidden = false;
    zeigeErgebnis();
  } else if (status === "beendet") {
    $("pd-endstand-screen").hidden = false;
    zeigeEndstand();
  }
}

// ---- Setup ---------------------------------------------------------------------
function zeigeSetup() {
  $("pd-starten").hidden = !api.istLeiter;
  $("pd-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();
  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("pd-setup-fehler").textContent = "";
  if (spielerListe.length < 2) {
    $("pd-setup-fehler").textContent = "Für Pokerduell braucht ihr mindestens zwei Spieler.";
    return;
  }
  $("pd-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      pdStatus: "runde_aktiv", pdRundenIndex: 0, pdRunden: baueRunden(), pdStart: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("pd-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "pdZuege"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleZuege = [];
  letzteBearbeiteteRunde = -2;
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), { pdStatus: null, pdRundenIndex: 0, pdStart: 0, pdRunden: [] });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---- Raster-Darstellung ----------------------------------------------------------
function baueRaster(container, zellen, optionen = {}) {
  const { klick = null, ausgewaehlt = null, vorschau = null, hervorgehoben = [], tauschKlick = null, tauschMarke = null } = optionen;
  container.innerHTML = "";
  for (let i = 0; i < ZELLEN; i++) {
    const z = document.createElement("button");
    z.type = "button";
    z.className = "pd-zelle";
    const karte = zellen[i];
    if (karte) {
      z.classList.add("belegt");
      z.innerHTML = `<img src="${kartenBild(karte)}" alt="" draggable="false">`;
    } else {
      z.classList.add("frei");
      if (i === ausgewaehlt) {
        z.classList.add("gewaehlt");
        if (vorschau) z.innerHTML = `<img src="${kartenBild(vorschau)}" alt="" draggable="false">`;
      }
    }
    if (hervorgehoben.includes(i)) z.classList.add("hervor");
    if (tauschKlick && karte) {
      z.classList.add("tauschbar");
      if (i === tauschMarke) z.classList.add("tausch-gewaehlt");
      z.addEventListener("click", () => tauschKlick(i));
    } else if (klick && !karte && !tauschKlick) z.addEventListener("click", () => klick(i));
    else z.tabIndex = -1;
    container.appendChild(z);
  }
}

// ---- Runde ---------------------------------------------------------------------
const istTauschRunde = () => istTauschEintrag(runden, rundenIndex);
const dauerMs = () => (istWahlEintrag(runden, rundenIndex) ? WAHL_SEKUNDEN : ZUG_SEKUNDEN) * 1000;
const verstrichen = () => Date.now() - startZeit;
const aktiveIds = () => new Set(spielerListe.map((s) => s.id));
const zuegeDieserRunde = () => {
  const aktiv = aktiveIds();
  return alleZuege.filter((m) => m.rundenIndex === rundenIndex && aktiv.has(m.spielerId));
};
const meinZug = () => alleZuege.find((m) => m.spielerId === api.spielerId && m.rundenIndex === rundenIndex);
const meineZellen = () => zellenAusZuegen(alleZuege, api.spielerId);
// Raster so, wie es nach dem geplanten Tausch dieser Runde aussieht (dort wird die Karte abgelegt).
const meineZellenNachTausch = () => (tauschPaar ? tauscheZellen(meineZellen(), tauschPaar) : meineZellen());

function zeichneRunde() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const angebot = kartenDerRunde(runden, rundenIndex);
  const wahl = istWahlEintrag(runden, rundenIndex);
  const zug = meinZug();
  const abgelegt = Boolean(zug);
  if (!wahl && gewaehlteKarte == null) gewaehlteKarte = 0;   // (bei der Tausch-Karte nur ein Platzhalter)

  const tausch = istTauschRunde();
  $("pd-titel").textContent = wahl ? `Runde ${rundenIndex + 1} - Wähle eine Karte`
    : tausch ? `Runde ${rundenIndex + 1} - Tausch-Karte!` : `Runde ${rundenIndex + 1}`;

  const box = $("pd-angebot");
  box.innerHTML = "";
  if (tausch) {
    const b = document.createElement("button");
    b.type = "button"; b.tabIndex = -1;
    b.className = "pd-angebotskarte pd-tauschkarte" + (abgelegt ? " abgelegt" : " gewaehlt");
    b.innerHTML = `<img src="${TAUSCH_BILD}" alt="Tausch" draggable="false">`;
    box.appendChild(b);
  }
  angebot.forEach((code, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pd-angebotskarte" + (abgelegt ? (zug.karte === code ? " abgelegt" : " weg") : (i === gewaehlteKarte ? " gewaehlt" : ""));
    b.innerHTML = `<img src="${kartenBild(code)}" alt="" draggable="false">`;
    if (!abgelegt && wahl) b.addEventListener("click", () => { gewaehlteKarte = i; zeichneRunde(); });
    else b.tabIndex = -1;
    box.appendChild(b);
  });

  const karte = !abgelegt && gewaehlteKarte != null ? angebot[gewaehlteKarte] : null;
  const zellen = abgelegt ? meineZellen() : meineZellenNachTausch();
  const imTausch = tausch && !abgelegt && tauschModus;
  baueRaster($("pd-mein-raster"), zellen, {
    klick: abgelegt ? null : (i) => { gewaehlteZelle = i; zeichneRunde(); },
    ausgewaehlt: abgelegt ? null : gewaehlteZelle,
    vorschau: karte,
    hervorgehoben: !abgelegt && tauschPaar ? tauschPaar : [],
    tauschKlick: imTausch ? tauschAntippen : null,
    tauschMarke: tauschErste
  });

  const tb = $("pd-tausch");
  tb.hidden = !tausch || abgelegt;
  tb.textContent = tauschPaar ? "Tausch zurücknehmen" : tauschModus ? "Tausch abbrechen" : "Karten tauschen";

  const btn = $("pd-ablegen");
  if (tausch) {
    btn.disabled = abgelegt || sendet || tauschModus;
    btn.textContent = abgelegt ? "Bestätigt" : tauschPaar ? "Tausch bestätigen" : "Nicht tauschen";
  } else {
    btn.disabled = abgelegt || sendet || gewaehlteZelle == null || gewaehlteKarte == null;
    btn.textContent = abgelegt ? "Abgelegt" : "Hier ablegen";
  }

  const fertig = new Set(zuegeDieserRunde().map((m) => m.spielerId));
  const offen = spielerListe.filter((s) => !fertig.has(s.id)).length;
  $("pd-status").textContent = abgelegt
    ? (offen ? `${tausch ? "Fertig" : "Abgelegt"}! Noch ${offen} ${offen === 1 ? "Person ist" : "Personen sind"} dran …` : (tausch ? "Fertig!" : "Abgelegt!"))
    : imTausch ? (tauschErste == null ? "Tippe auf die erste Karte, die du tauschen willst." : "Tippe auf die zweite Karte.")
    : tausch ? (tauschPaar ? "Die beiden Karten sind vertauscht. Mit „Tausch bestätigen“ gilt es - oder nimm es mit dem Knopf oben zurück."
        : "Tausch-Karte: Du darfst zwei Karten in deinem Raster vertauschen - oder passen.")
    : wahl && gewaehlteKarte == null ? "Tippe auf die Karte, die du behalten willst - dann auf ein freies Feld."
    : gewaehlteZelle == null ? "Tippe auf ein freies Feld, um die Karte dort abzulegen."
    : "Tippe auf „Hier ablegen“ zum Bestätigen.";
}

function tauschKnopf() {
  if (status !== "runde_aktiv" || !istTauschRunde() || meinZug() || sendet) return;
  if (tauschPaar) { tauschPaar = null; tauschModus = false; }
  else tauschModus = !tauschModus;
  tauschErste = null;
  gewaehlteZelle = null;     // das Raster ändert sich - die Feldwahl gilt nicht mehr
  zeichneRunde();
}

function tauschAntippen(i) {
  if (!tauschModus || tauschPaar) return;
  if (tauschErste == null) tauschErste = i;
  else if (tauschErste === i) tauschErste = null;
  else { tauschPaar = [tauschErste, i]; tauschModus = false; tauschErste = null; gewaehlteZelle = null; }
  zeichneRunde();
}

async function legeAb(automatisch) {
  if (status !== "runde_aktiv" || meinZug() || sendet) return;
  const angebot = kartenDerRunde(runden, rundenIndex);
  const zellen = meineZellenNachTausch();
  const nurTausch = istTauschRunde();      // Tausch-Karte: nichts ablegen, nur (optional) zwei Karten vertauschen
  let zelle = nurTausch ? -1 : gewaehlteZelle;
  let ki = gewaehlteKarte;
  if (ki == null || !angebot[ki]) ki = 0;
  if (!nurTausch && (zelle == null || zellen[zelle])) {
    const frei = zellen.map((k, i) => (k ? -1 : i)).filter((i) => i >= 0);
    if (!frei.length) return;
    zelle = frei[Math.floor(Math.random() * frei.length)];
  }
  sendet = true;
  $("pd-ablegen").disabled = true;
  try {
    await setDoc(doc(api.db, "raeume", api.code, "pdZuege", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId, spielerName: api.spielerName, rundenIndex, zelle, karte: nurTausch ? null : angebot[ki],
      tausch: nurTausch && tauschPaar ? tauschPaar : null,
      auto: Boolean(automatisch), zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    sendet = false;
    zeigeDebug("Fehler beim Ablegen: " + e.message);
  }
  zeichneRunde();
}

function tick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const v = verstrichen();
  const gesamt = dauerMs();
  $("pd-zeitbalken-fuell").style.width = (Math.max(0, gesamt - v) / gesamt * 100) + "%";
  if (v >= gesamt && !meinZug() && !sendet) legeAb(true);
  if (api.istLeiter) pruefeRunde(v);
}

// ---- Leiter: Runde weiterschalten, Auswertung -----------------------------------------
async function pruefeRunde(v) {
  if (!api.istLeiter || status !== "runde_aktiv" || leiterBeschaeftigt || spielerListe.length === 0) return;
  if (letzteBearbeiteteRunde === rundenIndex) return;
  const fertig = new Set(zuegeDieserRunde().map((m) => m.spielerId));
  const fehlend = spielerListe.filter((s) => !fertig.has(s.id));

  if (fehlend.length > 0) {
    if (v < dauerMs() + PUFFER_MS) return;
    leiterBeschaeftigt = true;
    try {
      const angebot = kartenDerRunde(runden, rundenIndex);
      const nurTausch = istTauschRunde();
      await Promise.all(fehlend.map((s) => {
        if (nurTausch) {
          return setDoc(doc(api.db, "raeume", api.code, "pdZuege", `${s.id}_${rundenIndex}`), {
            spielerId: s.id, spielerName: s.name, rundenIndex, zelle: -1, karte: null, tausch: null, auto: true, zeitpunkt: serverTimestamp()
          });
        }
        const frei = zellenAusZuegen(alleZuege, s.id).map((k, i) => (k ? -1 : i)).filter((i) => i >= 0);
        if (!frei.length) return null;
        return setDoc(doc(api.db, "raeume", api.code, "pdZuege", `${s.id}_${rundenIndex}`), {
          spielerId: s.id, spielerName: s.name, rundenIndex, zelle: frei[Math.floor(Math.random() * frei.length)],
          karte: angebot[0], auto: true, zeitpunkt: serverTimestamp()
        });
      }));
    } catch (e) {
      zeigeDebug("Fehler beim automatischen Legen: " + e.message);
    }
    leiterBeschaeftigt = false;
    return;
  }

  leiterBeschaeftigt = true;
  letzteBearbeiteteRunde = rundenIndex;
  try {
    if (rundenIndex + 1 < runden.length) {
      await updateDoc(api.raumRef(), { pdRundenIndex: rundenIndex + 1, pdStart: Date.now() });
    } else {
      const ergebnis = berechne();
      const gewinne = spielPunkte(ergebnis);
      const batch = writeBatch(api.db);
      Object.entries(gewinne).forEach(([id, wert]) => batch.update(api.spielerRef(id), { punkte: increment(wert) }));
      batch.update(api.raumRef(), { pdStatus: "ausgewertet" });
      await batch.commit();
    }
  } catch (e) {
    letzteBearbeiteteRunde = -2;
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  leiterBeschaeftigt = false;
}

// ---- Auswertung ----------------------------------------------------------------------
const FUELL = "C2";   // nur Notnagel, falls ein Feld je leer bliebe
function berechne() {
  const zellen = {};
  spielerListe.forEach((s) => {
    zellen[s.id] = zellenAusZuegen(alleZuege, s.id).map((k) => k || FUELL);
  });
  return wertePokerduellAus(zellen);
}
function spielPunkte(ergebnis) {
  const sortiert = ergebnis.rangfolge.map((id) => ({ id, s: ergebnis.summe[id] }));
  return punkteNachRang(sortiert, (e) => e.s, spielerListe.length, (e) => e.id);
}

function zeigeErgebnis() {
  if (!el.wurzel || spielerListe.length === 0) return;
  const ergebnis = berechne();
  const gewinne = spielPunkte(ergebnis);
  if (!angezeigterSpieler || !ergebnis.summe[angezeigterSpieler]) angezeigterSpieler = ergebnis.rangfolge.includes(api.spielerId) ? api.spielerId : ergebnis.rangfolge[0];

  const liste = $("pd-erg-liste");
  liste.innerHTML = "";
  ergebnis.rangfolge.forEach((id) => {
    const s = spielerListe.find((x) => x.id === id);
    const li = document.createElement("li");
    li.className = "pd-erg-zeile" + (id === angezeigterSpieler ? " aktiv" : "");
    li.innerHTML = spielerKarte(s?.name, s?.farbe, s?.icon, `+${gewinne[id] ?? 0}`,
      { extra: `${ergebnis.summe[id]} Reihenpunkte`, punkteRechts: s ? (s.punkte ?? 0) : "?" });
    if (ergebnis.bonus[id]) li.querySelector(".spieler-extra")?.insertAdjacentHTML("beforeend", ` <b class="pd-gold">+${ergebnis.bonus[id]} Bonus</b>`);
    li.addEventListener("click", () => { angezeigterSpieler = id; markierteReihe = null; zeigeErgebnis(); });
    liste.appendChild(li);
  });

  const s = spielerListe.find((x) => x.id === angezeigterSpieler);
  const reihenInfo = ergebnis.reihen[angezeigterSpieler] || [];
  const markiert = REIHEN.find((r) => r.id === markierteReihe)?.zellen || [];
  baueDetailRaster($("pd-detail-raster"), zellenAusZuegen(alleZuege, angezeigterSpieler).map((k) => k || FUELL), reihenInfo, markiert);

  const rl = $("pd-reihen-liste");
  rl.innerHTML = "";
  reihenInfo.forEach((r) => {
    const li = document.createElement("li");
    li.className = "pd-reihe" + (r.reihe === markierteReihe ? " aktiv" : "");
    li.innerHTML = `<span class="pd-reihe-name">${r.name}</span><span class="pd-reihe-hand">${r.hand.name}</span>` +
      `<span class="pd-reihe-rang">${r.rang}.</span><span class="pd-reihe-punkte">+${r.punkte}${r.bonus ? `<b class="pd-gold">+${r.bonus}</b>` : ""}</span>`;
    li.addEventListener("click", () => { markierteReihe = markierteReihe === r.reihe ? null : r.reihe; zeigeErgebnis(); });
    rl.appendChild(li);
    if (r.reihe === markierteReihe) rl.appendChild(vergleichsBlock(r.reihe, ergebnis));
  });

  $("pd-weiter").hidden = !api.istLeiter;
}

// Alle Spieler in einer Reihe, bester oben - jeweils in der Spielerfarbe, mit den fünf Karten darunter.
function vergleichsBlock(reiheId, ergebnis) {
  const reihe = REIHEN.find((r) => r.id === reiheId);
  const eintraege = ergebnis.rangfolge.map((id) => ({ id, info: ergebnis.reihen[id].find((x) => x.reihe === reiheId) }))
    .sort((a, b) => a.info.rang - b.info.rang || (ergebnis.summe[b.id] - ergebnis.summe[a.id]));
  const li = document.createElement("li");
  li.className = "pd-vergleich";
  eintraege.forEach(({ id, info }) => {
    const sp = spielerListe.find((x) => x.id === id);
    const zellen = zellenAusZuegen(alleZuege, id).map((k) => k || FUELL);
    const block = document.createElement("div");
    block.className = "pd-vergleich-zeile";
    block.innerHTML = spielerKarte(sp?.name, sp?.farbe, sp?.icon, `+${info.punkte}`, { extra: info.hand.name, punkteRechts: `${info.rang}.` }) +
      (info.bonus ? `<div class="pd-bonus-zeile">★ +${info.bonus} Bonus</div>` : "") +
      `<div class="pd-mini">${reihe.zellen.map((z) => `<img src="${kartenBild(zellen[z])}" alt="">`).join("")}</div>`;
    li.appendChild(block);
  });
  return li;
}

// Detailraster: Karten + Punkte am Ende jeder Linie (Zeilen rechts, Spalten unten, Diagonalen in den Ecken)
function baueDetailRaster(container, zellen, reihenInfo, markiert) {
  container.innerHTML = "";
  const info = Object.fromEntries(reihenInfo.map((r) => [r.reihe, r]));
  const leer = () => { const d = document.createElement("div"); container.appendChild(d); };
  const badge = (id) => {
    const r = info[id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pd-badge" + (r && r.rang === 1 ? " best" : "") + (r && r.bonus ? " bonus" : "") + (id === markierteReihe ? " aktiv" : "");
    b.innerHTML = r ? `<span>+${r.punkte}</span>${r.bonus ? `<span class="pd-gold">+${r.bonus}</span>` : ""}` : "";
    b.title = r ? `${r.name}: ${r.hand.name}${r.bonus ? ` (+${r.bonus} Bonus)` : ""}` : "";
    b.addEventListener("click", () => { markierteReihe = markierteReihe === id ? null : id; zeigeErgebnis(); });
    container.appendChild(b);
  };
  for (let i = 0; i < 5; i++) leer();
  badge("d2");
  for (let z = 0; z < 5; z++) {
    for (let sp = 0; sp < 5; sp++) {
      const i = z * 5 + sp;
      const k = document.createElement("div");
      k.className = "pd-zelle belegt" + (markiert.includes(i) ? " hervor" : "");
      k.innerHTML = `<img src="${kartenBild(zellen[i])}" alt="" draggable="false">`;
      container.appendChild(k);
    }
    badge(`z${z}`);
  }
  for (let sp = 0; sp < 5; sp++) badge(`s${sp}`);
  badge("d1");
}

async function weiter() {
  $("pd-weiter").disabled = true;
  try {
    await updateDoc(api.raumRef(), { pdStatus: "beendet" });
    speichereWertung(api, "pokerduell", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("pd-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("pd-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("pd-endstand-warten").hidden = api.istLeiter;
  const btn = $("pd-gesamtwertung-btn");
  if (btn) {
    btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    btn.onclick = () => api.zeigeGesamtwertung();
  }
}
