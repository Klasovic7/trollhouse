// ============================================================================
//  Turbo (Zeitjagd) - Einzelspieler-Prototyp
// ----------------------------------------------------------------------------
//  Das eigentliche Spiel (Three.js, 3D) liegt als eigene Seite in proto.html
//  und läuft hier im Vollbild darüber (Rahmen direkt am <body>, damit Kopfzeile
//  und Chat-Knopf verdeckt sind). Jede*r fährt für sich allein auf derselben
//  Strecke. Einzig die beste Zeit geht in die Subcollection "turboZeiten"
//  (Dokument = spielerId) und wird den anderen oben rechts angezeigt.
// ============================================================================
import { doc, setDoc, updateDoc, collection, onSnapshot, serverTimestamp } from "../../kern/firebase.js";
import { STRECKEN } from "./strecke.js";
import { avatarBild } from "../../kern/ui.js";

let api = null, rahmen = null, stil = null, unsub = null, hoerer = null;
let spielerListe = [], zeiten = [], dauerMin = 5, raum = null, startGesehen = null, streckeId = "tal";

function sende() {
  if (!rahmen || !rahmen.contentWindow) return;
  const liste = zeiten
    .filter((z) => z.zeit > 0 && z.spielerId !== api.spielerId)
    .map((z) => {
      const sp = spielerListe.find((s) => s.id === z.spielerId);
      return { name: (sp && sp.name) || "?", zeit: z.zeit, farbe: sp && sp.farbe, strecke: z.strecke || "tal" };
    })
    .sort((a, b) => a.zeit - b.zeit);
  rahmen.contentWindow.postMessage({ typ: "gegner", liste }, "*");
}

function sendeStrecke() {
  if (!rahmen || !rahmen.contentWindow) return;
  rahmen.contentWindow.postMessage({ typ: "strecke", id: streckeId }, "*");
}

function sendeDauer() {
  if (!rahmen || !rahmen.contentWindow || !api) return;
  rahmen.contentWindow.postMessage({ typ: "dauer", min: dauerMin, leiter: !!api.istLeiter }, "*");
}

// Bereit-Status: alle ausser der Spielleitung muessen "Bereit" druecken, dann darf die Spielleitung starten.
function mitspieler() {
  const leiterId = raum && raum.leiterId;
  return spielerListe.filter((s) => s.id !== leiterId);
}
function alleBereit() {
  const bereit = (raum && raum.bereitSpieler) || {};
  return mitspieler().every((s) => bereit[s.id]);
}
function sendeLobby() {
  if (!rahmen || !rahmen.contentWindow || !api) return;
  const bereit = (raum && raum.bereitSpieler) || {};
  const spieler = mitspieler().map((s) => {
    const b = avatarBild(s.icon);
    return { id: s.id, name: s.name || "?", bild: b ? new URL(b, location.href).href : null, bereit: !!bereit[s.id] };
  });
  rahmen.contentWindow.postMessage({
    typ: "lobby", leiter: !!api.istLeiter, spieler, ichBereit: !!bereit[api.spielerId], alleBereit: alleBereit(),
    laufend: !!(raum && raum.turboStartSeit > 0)
  }, "*");
}

function speichereBestzeit(zeit, strecke) {
  if (!api || !api.spielerId) return;
  setDoc(doc(api.db, "raeume", api.code, "turboZeiten", api.spielerId), {
    spielerId: api.spielerId, zeit: zeit > 0 ? zeit : null, strecke: strecke || "tal", zeitpunkt: serverTimestamp()
  }).catch((e) => console.warn("Turbo: Bestzeit nicht gespeichert", e));
}

function zeigeRahmen(an) {
  if (rahmen) rahmen.style.display = an ? "block" : "none";
  document.body.classList.toggle("turbo-voll", an);
  const knopf = api && api.wurzel.querySelector("#turbo-weiter");
  if (knopf) knopf.hidden = an;
}

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  api.wurzel.innerHTML = '<div style="text-align:center;padding:40px 20px"><p class="hinweis-text">Turbo ist pausiert.</p>' +
    '<button id="turbo-weiter" class="btn-primaer" type="button" hidden>▶ Turbo fortsetzen</button></div>';
  api.wurzel.querySelector("#turbo-weiter").addEventListener("click", () => zeigeRahmen(true));

  stil = document.createElement("style");
  stil.textContent = "body.turbo-voll #btn-chat-oeffnen{display:none!important}body.turbo-voll{overflow:hidden}";
  document.head.appendChild(stil);

  rahmen = document.createElement("iframe");
  rahmen.title = "Turbo";
  rahmen.setAttribute("allow", "autoplay; fullscreen");
  rahmen.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:0;background:#0a0e1a;z-index:2147483000;display:block";
  rahmen.addEventListener("load", () => { sende(); sendeDauer(); sendeLobby(); sendeStrecke(); });
  // Alle im Raum starten auf derselben Strecke: sie wird aus dem Raumcode gewaehlt
  let h = 0; for (const ch of String(api.code || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const gespeichert = api.raum && api.raum.turboStrecke;
  streckeId = STRECKEN.some((t) => t.id === gespeichert) ? gespeichert : STRECKEN[h % STRECKEN.length].id;
  rahmen.src = "spiele/turbo/proto.html?embed=1&strecke=" + streckeId + "&v=" + Date.now();
  document.body.appendChild(rahmen);
  document.body.classList.add("turbo-voll");

  hoerer = (e) => {
    if (!rahmen || e.source !== rahmen.contentWindow) return;
    const d = e.data || {};
    if (d.typ === "turbo-verlassen") {
      zeigeRahmen(false);
      const b = document.getElementById("btn-verlassen");
      if (b) b.click();
    } else if (d.typ === "bestzeit") speichereBestzeit(d.zeit, d.strecke);
    else if (d.typ === "bereit") {
      updateDoc(api.raumRef(), { ["bereitSpieler." + api.spielerId]: true }).catch((e) => console.warn("Turbo: Bereit nicht gespeichert", e));
    } else if (d.typ === "start" && api.istLeiter && alleBereit()) {
      updateDoc(api.raumRef(), { turboStartSeit: Date.now() }).catch((e) => console.warn("Turbo: Start nicht gespeichert", e));
    }
    else if (d.typ === "strecke-wahl" && api.istLeiter && STRECKEN.some((t) => t.id === d.id)) {
      updateDoc(api.raumRef(), { turboStrecke: d.id }).catch((e) => console.warn("Turbo: Strecke nicht gespeichert", e));
    }
    else if (d.typ === "dauer-wahl" && api.istLeiter && [3, 4, 5].includes(d.min)) {
      dauerMin = d.min; sendeDauer();
      updateDoc(api.raumRef(), { turboDauer: d.min }).catch((e) => console.warn("Turbo: Dauer nicht gespeichert", e));
    }
  };
  window.addEventListener("message", hoerer);
  startGesehen = null;
  if (api.istLeiter) updateDoc(api.raumRef(), { turboStartSeit: 0 }).catch(() => {});

  unsub = onSnapshot(collection(api.db, "raeume", api.code, "turboZeiten"), (snap) => {
    zeiten = [];
    snap.forEach((d) => zeiten.push(d.data()));
    sende();
  }, () => {});
}

export function beenden() {
  if (unsub) { unsub(); unsub = null; }
  if (hoerer) { window.removeEventListener("message", hoerer); hoerer = null; }
  if (rahmen) { rahmen.src = "about:blank"; rahmen.remove(); rahmen = null; }
  if (stil) { stil.remove(); stil = null; }
  document.body.classList.remove("turbo-voll");
  api = null;
}

export function spieler(liste) { spielerListe = liste || []; sende(); sendeLobby(); }
export function raumDaten(daten) {
  raum = daten || null;
  const neu = daten && daten.turboStrecke;
  if (neu && neu !== streckeId && STRECKEN.some((t) => t.id === neu)) { streckeId = neu; sendeStrecke(); }
  const st = (daten && daten.turboStartSeit) || 0;
  if (startGesehen === null) startGesehen = st;
  else if (st > 0 && st !== startGesehen) { startGesehen = st; if (rahmen && rahmen.contentWindow) rahmen.contentWindow.postMessage({ typ: "los" }, "*"); }
  else if (st === 0) startGesehen = 0;
  sendeLobby();
  const m = daten && daten.turboDauer;
  if ([3, 4, 5].includes(m) && m !== dauerMin) dauerMin = m;
  sendeDauer();
}
