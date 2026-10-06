// ============================================================================
//  Update-Hinweis: kurzer Vollbild-Hinweis mit Feuerwerk, den jeder sieht,
//  sobald er (nach Spieler- und Farbwahl) einen Raum betritt - einmal pro Raum
//  und Gerät. Zum nächsten Update einfach TEXTE und HINWEIS_ID anpassen.
// ============================================================================
const HINWEIS_ID = "laenderspiel-1";   // ändern = Hinweis erscheint wieder in jedem Raum
const SPEICHER_KEY = "update_hinweis_raum";
const TEXTE = {
  badge: "‼️ UPDATE ‼️",
  neu: "Ein neues Spiel!",
  symbol: "⚽",
  name: "Länderspiel",
  sub: "Ersteigere Spieler, sammle Länderboni und tritt gegen deine Freunde an.",
  hinweis: "Sobald der Spielleiter das Spiel startet, läuft die Anleitung von selbst."
};

let zeigtGerade = false;

function schonGezeigt(raumCode) {
  try { return localStorage.getItem(SPEICHER_KEY) === `${HINWEIS_ID}:${raumCode}`; } catch { return false; }
}
function merke(raumCode) {
  try { localStorage.setItem(SPEICHER_KEY, `${HINWEIS_ID}:${raumCode}`); } catch { /* egal */ }
}

export function zeigeUpdateHinweis(raumCode) {
  if (zeigtGerade || !raumCode || schonGezeigt(raumCode)) return;
  zeigtGerade = true;
  merke(raumCode);

  const wurzel = document.createElement("div");
  wurzel.className = "ank-overlay";
  wurzel.setAttribute("role", "dialog");
  wurzel.setAttribute("aria-modal", "true");
  wurzel.setAttribute("aria-label", "Update: " + TEXTE.name);
  wurzel.innerHTML = `
    <canvas class="ank-feuerwerk" aria-hidden="true"></canvas>
    <div class="ank-inhalt">
      <div class="ank-badge">${TEXTE.badge}</div>
      <div class="ank-neu">${TEXTE.neu}</div>
      <div class="ank-symbol">${TEXTE.symbol}</div>
      <div class="ank-name">${TEXTE.name}</div>
      <div class="ank-sub">${TEXTE.sub}</div>
      <button type="button" class="ank-ok">Los geht's!</button>
      <div class="ank-hinweis">${TEXTE.hinweis}</div>
    </div>`;
  document.body.appendChild(wurzel);
  document.body.classList.add("ank-offen");
  const stopp = starteFeuerwerk(wurzel.querySelector(".ank-feuerwerk"));

  function schliessen() {
    stopp();
    wurzel.remove();
    document.body.classList.remove("ank-offen");
    document.removeEventListener("keydown", taste);
    zeigtGerade = false;
  }
  function taste(e) { if (e.key === "Escape" || e.key === "Enter") schliessen(); }
  document.addEventListener("keydown", taste);
  wurzel.querySelector(".ank-ok").addEventListener("click", schliessen);
  wurzel.querySelector(".ank-ok").focus({ preventScroll: true });
}

// Canvas-Feuerwerk - gibt eine Funktion zum Beenden zurück
function starteFeuerwerk(canvas) {
  if (!canvas || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const farben = ["#fcd34d", "#f97316", "#f43f5e", "#a78bfa", "#38bdf8", "#4ade80", "#ffffff"];
  let w = 0, h = 0, raketen = [], funken = [], letzte = performance.now(), naechste = 0, laeuft = true, raf = 0;

  function groesse() {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  groesse();

  function rakete() {
    raketen.push({ x: w * (0.15 + Math.random() * 0.7), y: h, ziel: h * (0.12 + Math.random() * 0.4), vy: -(260 + Math.random() * 80), farbe: farben[Math.floor(Math.random() * farben.length)] });
  }
  function explosion(x, y, farbe) {
    const n = 46 + Math.floor(Math.random() * 20);
    for (let i = 0; i < n; i++) {
      const wi = (i / n) * Math.PI * 2 + Math.random() * 0.2, v = 60 + Math.random() * 110;
      funken.push({ x, y, vx: Math.cos(wi) * v, vy: Math.sin(wi) * v, leben: 1, farbe: Math.random() < 0.25 ? "#ffffff" : farbe });
    }
  }
  function schritt(jetzt) {
    if (!laeuft) return;
    const dt = Math.min(0.05, (jetzt - letzte) / 1000); letzte = jetzt;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    naechste -= dt;
    if (naechste <= 0) { rakete(); if (Math.random() < 0.4) rakete(); naechste = 0.35 + Math.random() * 0.5; }
    raketen = raketen.filter((r) => {
      r.y += r.vy * dt;
      ctx.fillStyle = r.farbe; ctx.fillRect(r.x - 1, r.y, 2, 8);
      if (r.y <= r.ziel) { explosion(r.x, r.y, r.farbe); return false; }
      return true;
    });
    funken = funken.filter((f) => {
      f.vy += 90 * dt; f.vx *= 0.985; f.vy *= 0.985;
      f.x += f.vx * dt; f.y += f.vy * dt; f.leben -= dt * 0.7;
      if (f.leben <= 0) return false;
      ctx.globalAlpha = Math.max(0, f.leben); ctx.fillStyle = f.farbe;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      return true;
    });
    raf = requestAnimationFrame(schritt);
  }
  raf = requestAnimationFrame(schritt);
  return () => { laeuft = false; cancelAnimationFrame(raf); };
}
