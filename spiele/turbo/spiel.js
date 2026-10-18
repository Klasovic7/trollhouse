// ============================================================================
//  Turbo (Zeitjagd) - Einzelspieler-Prototyp
// ----------------------------------------------------------------------------
//  Das eigentliche Spiel (Three.js, 3D) liegt als eigene Seite in proto.html
//  und läuft hier im Vollbild darüber (Rahmen direkt am <body>, damit Kopfzeile
//  und Chat-Knopf verdeckt sind). Jede*r fährt für sich allein auf derselben
//  Strecke. Einzig die beste Zeit geht in die Subcollection "turboZeiten"
//  (Dokument = spielerId) und wird den anderen oben rechts angezeigt.
// ============================================================================
import { doc, setDoc, collection, onSnapshot, serverTimestamp } from "../../kern/firebase.js";

let api = null, rahmen = null, stil = null, unsub = null, hoerer = null;
let spielerListe = [], zeiten = [];

function sende() {
  if (!rahmen || !rahmen.contentWindow) return;
  const liste = zeiten
    .filter((z) => z.zeit > 0 && z.spielerId !== api.spielerId)
    .map((z) => {
      const sp = spielerListe.find((s) => s.id === z.spielerId);
      return { name: (sp && sp.name) || "?", zeit: z.zeit, farbe: sp && sp.farbe };
    })
    .sort((a, b) => a.zeit - b.zeit);
  rahmen.contentWindow.postMessage({ typ: "gegner", liste }, "*");
}

function speichereBestzeit(zeit) {
  if (!api || !api.spielerId) return;
  setDoc(doc(api.db, "raeume", api.code, "turboZeiten", api.spielerId), {
    spielerId: api.spielerId, zeit: zeit > 0 ? zeit : null, zeitpunkt: serverTimestamp()
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
  rahmen.addEventListener("load", sende);
  rahmen.src = "spiele/turbo/proto.html?embed=1&v=" + Date.now();
  document.body.appendChild(rahmen);
  document.body.classList.add("turbo-voll");

  hoerer = (e) => {
    if (!rahmen || e.source !== rahmen.contentWindow) return;
    const d = e.data || {};
    if (d.typ === "turbo-verlassen") {
      zeigeRahmen(false);
      const b = document.getElementById("btn-verlassen");
      if (b) b.click();
    } else if (d.typ === "bestzeit") speichereBestzeit(d.zeit);
  };
  window.addEventListener("message", hoerer);

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

export function spieler(liste) { spielerListe = liste || []; sende(); }
export function raumDaten() {}
