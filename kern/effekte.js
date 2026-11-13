// Gemeinsamer Effekte-Baukasten: Aufpoppen, Wackeln, Zahlen hochzählen und
// einheitliche Übergänge. Spiele können poppe()/wackle()/zaehleHoch() direkt
// aufrufen; startEffekte() (einmal in app.js) sorgt dafür, dass die Punkte-
// anzeigen und Bildschirmwechsel in allen Spielen automatisch mitmachen.
// Wer am Handy "Bewegung reduzieren" eingestellt hat, sieht die Endwerte sofort.

const weniger = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

function spieleKlasse(el, klasse) {
  if (!el || weniger()) return;
  el.classList.remove(klasse);
  void el.offsetWidth;   // Animation neu starten
  el.classList.add(klasse);
  el.addEventListener("animationend", () => el.classList.remove(klasse), { once: true });
}

export const poppe = (el) => spieleKlasse(el, "fx-pop");
export const wackle = (el) => spieleKlasse(el, "fx-wackel");
export const blendeEin = (el) => spieleKlasse(el, "fx-rein");

// Zahl in el von "von" bis "bis" hochzählen (Text bleibt ganzzahlig, "+"/"−" optional)
export function zaehleHoch(el, bis, { von = 0, dauer = 700, vorzeichen = "" } = {}) {
  if (!el) return;
  const text = (n) => `${vorzeichen}${n}`;
  if (el._fxFrame) cancelAnimationFrame(el._fxFrame);
  if (weniger() || von === bis) { el.textContent = text(bis); return; }
  const start = performance.now();
  const schritt = (jetzt) => {
    const t = Math.min(1, (jetzt - start) / dauer);
    const sanft = 1 - Math.pow(1 - t, 3);
    el.textContent = text(Math.round(von + (bis - von) * sanft));
    if (t < 1) el._fxFrame = requestAnimationFrame(schritt);
    else { el._fxFrame = 0; poppe(el); }
  };
  el._fxFrame = requestAnimationFrame(schritt);
}

// ---- automatische Effekte -----------------------------------------------------------------
const letzteWerte = new Map();   // Name -> zuletzt gezeigter Gesamtwert (Zählen startet dort)
const gesehen = new Map();       // Schlüssel -> Zeitpunkt (verhindert Wiederholung bei Neuaufbau der Liste)
const SPERRE_MS = 8000;

function neu(schluessel) {
  const jetzt = Date.now();
  for (const [k, t] of gesehen) if (jetzt - t > SPERRE_MS) gesehen.delete(k);
  if (gesehen.has(schluessel)) return false;
  gesehen.set(schluessel, jetzt);
  return true;
}
const nameVon = (el) => el.closest(".spieler-karte, tr")?.querySelector(".spieler-name, .wertung-spieler-zelle span")?.textContent?.trim() || "";

function gesamtWerte(wurzel) {
  wurzel.querySelectorAll(".spieler-punkte-gesamt:not([data-fx]), .wertung-gesamt-zelle:not([data-fx])").forEach((el) => {
    el.dataset.fx = "1";
    const bis = Number(el.textContent.trim());
    if (!Number.isFinite(bis)) return;
    const name = nameVon(el), art = el.classList.contains("wertung-gesamt-zelle") ? "w" : "s";
    const schluessel = `${art}|${name}`;
    const von = letzteWerte.get(schluessel) ?? 0;
    letzteWerte.set(schluessel, bis);
    if (von === bis || !neu(`${schluessel}|${bis}`)) return;
    zaehleHoch(el, bis, { von: Math.min(von, bis), dauer: 650 });
  });
}

function punkteBadges(wurzel) {
  wurzel.querySelectorAll(".spieler-punkte.positiv:not([data-fx]), .spieler-punkte.negativ:not([data-fx])").forEach((el) => {
    el.dataset.fx = "1";
    const schluessel = `p|${nameVon(el)}|${el.textContent.trim()}`;
    if (!neu(schluessel)) return;
    if (el.classList.contains("positiv")) poppe(el); else wackle(el);
  });
}

export function startEffekte() {
  if (startEffekte.laeuft) return;
  startEffekte.laeuft = true;
  // Bildschirmwechsel: wird ein Bereich sichtbar, blendet er sanft ein
  ["start-screen", "lobby-screen", "profil-screen", "spiel-wurzel", "wertung-dialog", "chat-dialog"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    let war = el.hidden;
    new MutationObserver(() => {
      if (war && !el.hidden) blendeEin(el);
      war = el.hidden;
    }).observe(el, { attributes: true, attributeFilter: ["hidden"] });
  });
  // Punkte: Gesamtwerte zählen hoch, +N poppt, −N wackelt
  let geplant = false;
  new MutationObserver(() => {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      gesamtWerte(document.body);
      punkteBadges(document.body);
    });
  }).observe(document.body, { childList: true, subtree: true });
}
