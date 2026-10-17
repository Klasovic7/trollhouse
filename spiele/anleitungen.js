// ============================================================================
//  Spiele-Anleitungen: Übersicht aller Spiele, dann Seite für Seite durchblättern.
//  Wird erst beim Klick auf "Spiele" (Startseite) geladen.
// ============================================================================
import { SPIELE } from "./register.js?v=324";
import { ANLEITUNGEN, szene } from "./anleitungen-daten.js?v=324";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fett = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const symbol = (sp) => sp.bild ? `<img class="spiel-bild" src="${sp.bild}" alt="">` : sp.emoji;

let dialog = null;
let tasteFn = null;

function schliessen() {
  if (tasteFn) document.removeEventListener("keydown", tasteFn);
  tasteFn = null;
  if (dialog) dialog.remove();
  dialog = null;
  document.body.classList.remove("anl-offen");
}

export function oeffneAnleitungen(startId = null) {
  if (dialog) return;
  dialog = document.createElement("div");
  dialog.className = "anl-overlay";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  document.body.appendChild(dialog);
  document.body.classList.add("anl-offen");
  dialog.addEventListener("click", (e) => { if (e.target === dialog) schliessen(); });

  let spiel = null, seite = 0;

  const liste = () => {
    spiel = null;
    dialog.innerHTML = `<div class="anl-panel">
      <div class="anl-kopf"><h2>Spiele &amp; Anleitungen</h2><button class="anl-x" data-zu aria-label="Schließen">✕</button></div>
      <p class="anl-sub">Tippe ein Spiel an und blättere durch die Anleitung.</p>
      <div class="anl-liste">${SPIELE.filter((s) => ANLEITUNGEN[s.id]).map((s) =>
        `<button class="anl-kachel" data-id="${s.id}" style="--farbe:${s.farbe}">
           <span class="anl-kachel-sym">${symbol(s)}</span>
           <span class="anl-kachel-txt"><b>${esc(s.name)}</b><small>${esc(s.beschreibung || "")}</small></span>
           <span class="anl-kachel-n">${ANLEITUNGEN[s.id].length} Seiten</span>
         </button>`).join("")}</div></div>`;
    dialog.querySelector("[data-zu]").onclick = schliessen;
    dialog.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => zeige(b.dataset.id, 0));
  };

  const zeige = (id, nr) => {
    const sp = SPIELE.find((s) => s.id === id);
    const folien = ANLEITUNGEN[id];
    if (!sp || !folien) return liste();
    spiel = sp; seite = Math.max(0, Math.min(folien.length - 1, nr));
    const f = folien[seite];
    const letzte = seite === folien.length - 1;
    dialog.innerHTML = `<div class="anl-panel" style="--farbe:${sp.farbe}">
      <div class="anl-kopf">
        <button class="anl-zurueck" data-liste aria-label="Zur Spieleliste">‹ Alle Spiele</button>
        <button class="anl-x" data-zu aria-label="Schließen">✕</button>
      </div>
      <div class="anl-titel"><span class="anl-titel-sym">${symbol(sp)}</span><h2>${esc(sp.name)}</h2></div>
      <div class="anl-folie" id="anl-folie">
        <div class="anl-bildrahmen"><img class="anl-foto" src="bilder/anleitung/${id}-${seite + 1}.webp?v=324" alt="Screenshot: ${esc(f.t)}" loading="eager"></div>
        <h3>${esc(f.t)}</h3>
        ${f.x.map((a) => `<p>${fett(a)}</p>`).join("")}
      </div>
      <div class="anl-punkte">${folien.map((_, i) => `<button class="anl-punkt${i === seite ? " an" : ""}" data-n="${i}" aria-label="Seite ${i + 1}"></button>`).join("")}</div>
      <div class="anl-nav">
        <button class="btn-sekundaer" data-zur ${seite === 0 ? "disabled" : ""}>Zurück</button>
        <span class="anl-zaehler">${seite + 1} / ${folien.length}</span>
        <button class="btn-primaer" data-weiter>${letzte ? "Fertig" : "Weiter"}</button>
      </div></div>`;
    const q = (s) => dialog.querySelector(s);
    q("[data-zu]").onclick = schliessen;
    q("[data-liste]").onclick = liste;
    q("[data-zur]").onclick = () => zeige(id, seite - 1);
    q("[data-weiter]").onclick = () => letzte ? liste() : zeige(id, seite + 1);
    // Falls ein Screenshot fehlt (z. B. offline): gezeichnete Ersatz-Szene
    const foto = q(".anl-foto");
    foto.addEventListener("error", () => { foto.parentElement.innerHTML = szene(sp.farbe, f.s()); });
    dialog.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => zeige(id, +b.dataset.n));
    // Wischen
    const fl = q("#anl-folie");
    let x0 = null;
    fl.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    fl.addEventListener("pointerup", (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) < 45) return;
      if (dx < 0 && !letzte) zeige(id, seite + 1);
      else if (dx > 0 && seite > 0) zeige(id, seite - 1);
    });
    fl.addEventListener("pointercancel", () => { x0 = null; });
  };

  tasteFn = (e) => {
    if (e.key === "Escape") return schliessen();
    if (!spiel) return;
    const n = ANLEITUNGEN[spiel.id].length;
    if (e.key === "ArrowRight" && seite < n - 1) zeige(spiel.id, seite + 1);
    if (e.key === "ArrowLeft" && seite > 0) zeige(spiel.id, seite - 1);
  };
  document.addEventListener("keydown", tasteFn);

  startId && ANLEITUNGEN[startId] ? zeige(startId, 0) : liste();
}
