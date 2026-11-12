// ============================================================================
//  Kartenliga - Darstellung: Spielerkarten, Flaggen, Fähigkeits-Symbole,
//  Teamwappen (je App-Farbe) und Arena (wächst mit Tribüne und Hexenkessel).
// ============================================================================
import { FARBEN, escapeHtml } from "../../kern/ui.js";
import { karte, BONUS_NAME, BONUS_TEXT } from "./logik.js";

export const BILD_VERSION = 1;
export const spielerBild = (id) => `bilder/kartenliga/${id}.webp?v=${BILD_VERSION}`;
export const vereinsWappen = (v) => `bilder/kartenliga/wappen/${v}.svg?v=${BILD_VERSION}`;
export const VEREIN_NAME = {
  bvb: "Borussia Dortmund", fcb: "Bayern München", sge: "Eintracht Frankfurt", vfb: "VfB Stuttgart", svw: "Werder Bremen",
  b04: "Bayer Leverkusen", scf: "SC Freiburg", hsv: "Hamburger SV", s04: "Schalke 04", koe: "1. FC Köln"
};

// ---- Flaggen und Nationalfarben ---------------------------------------------------------
const FLAGGEN = {
  Deutschland: '<rect width="30" height="7" fill="#000"/><rect y="6.66" width="30" height="7" fill="#dd0000"/><rect y="13.33" width="30" height="6.67" fill="#ffce00"/>',
  Italien: '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce2b37"/>',
  Frankreich: '<rect width="10" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ef4135"/>',
  Argentinien: '<rect width="30" height="20" fill="#74acdf"/><rect y="6.66" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="2.2" fill="#f6b40e"/>',
  "Türkei": '<rect width="30" height="20" fill="#e30a17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.3" cy="10" r="4" fill="#e30a17"/><path d="M17.5 10 l3.2 -1 -2 2.7 0 -3.4 2 2.7z" fill="#fff"/>',
  Japan: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  Brasilien: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2 L28 10 L15 18 L2 10Z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.4" fill="#002776"/>',
  Nigeria: '<rect width="10" height="20" fill="#008751"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#008751"/>'
};
// [schmaler Streifen, Mittelstreifen, große Fläche unten]
const NATION_FARBEN = {
  Deutschland: ["#000000", "#dd0000", "#c9a227"], Italien: ["#009246", "#f2f2f2", "#ce2b37"],
  Frankreich: ["#0055a4", "#f2f2f2", "#ef4135"], Argentinien: ["#f6b40e", "#f2f2f2", "#74acdf"],
  "Türkei": ["#f2f2f2", "#e30a17", "#b80813"], Japan: ["#f2f2f2", "#bc002d", "#8f0022"],
  Brasilien: ["#002776", "#ffdf00", "#009c3b"], Nigeria: ["#f2f2f2", "#008751", "#006b40"]
};
export const flagge = (nation, klasse = "kl-flagge") =>
  FLAGGEN[nation] ? `<svg class="${klasse}" viewBox="0 0 30 20">${FLAGGEN[nation]}</svg>` : "";

// ---- Fähigkeits-Symbole -----------------------------------------------------------------
const GLYPHEN = {
  talent: `<path d="M15 40.5 H33" stroke="#6d4c41" stroke-width="3" stroke-linecap="round"/><path d="M24 40 V23" stroke="#2e7d32" stroke-width="3.6" stroke-linecap="round"/><path d="M24 27 C23.5 17 17 12 7.5 12.5 C7.5 22 14 28 24 27Z" fill="#43a047" stroke="#1b5e20" stroke-width="1.6"/><path d="M24 23 C24.5 13 31 7.5 40.5 8 C40.5 17.5 34 23.5 24 23Z" fill="#7cc576" stroke="#1b5e20" stroke-width="1.6"/><path d="M36 30 l2 -4 l2 4 l-2 4z" fill="#f2c230"/>`,
  veteran: `<path d="M13 7.5 H35 M13 40.5 H35" stroke="#5d4037" stroke-width="3.6" stroke-linecap="round"/><path d="M16 9.5 C16 18 22 21 22 24 C22 27 16 30 16 38.5 H32 C32 30 26 27 26 24 C26 21 32 18 32 9.5 Z" fill="#fff3e0" stroke="#5d4037" stroke-width="2.4" stroke-linejoin="round"/><path d="M19.5 14 H28.5 C27.5 18 25 20 24 21 C23 20 20.5 18 19.5 14Z" fill="#d4a017"/><path d="M24 21 V31" stroke="#d4a017" stroke-width="1.4"/><path d="M18.3 36.8 C19 32 22 30.8 24 30.3 C26 30.8 29 32 29.7 36.8Z" fill="#d4a017"/>`,
  kleiner_wuerfel: `<g transform="rotate(-14 24 24)"><rect x="12" y="12" width="24" height="24" rx="5" fill="#eceff1" stroke="#37474f" stroke-width="2.6"/><circle cx="18.3" cy="18.3" r="2.7" fill="#263238"/><circle cx="24" cy="24" r="2.7" fill="#263238"/><circle cx="29.7" cy="29.7" r="2.7" fill="#263238"/></g>`,
  grosser_wuerfel: `<g transform="rotate(12 24 24)"><rect x="7.5" y="7.5" width="33" height="33" rx="7" fill="#f2c230" stroke="#7a5600" stroke-width="2.6"/><circle cx="16" cy="16" r="3.1" fill="#3e2c00"/><circle cx="32" cy="16" r="3.1" fill="#3e2c00"/><circle cx="16" cy="32" r="3.1" fill="#3e2c00"/><circle cx="32" cy="32" r="3.1" fill="#3e2c00"/></g>`,
  kapitaen: `<rect x="5" y="13.5" width="38" height="21" rx="4.5" fill="#fbc02d" stroke="#8d6e00" stroke-width="2.4"/><path d="M6.5 17.5 H41.5 M6.5 30.5 H41.5" stroke="#c49000" stroke-width="1.4"/><path d="M29.8 19.6 A7.2 7.2 0 1 0 29.8 28.4" fill="none" stroke="#1d1d1f" stroke-width="4.2" stroke-linecap="round"/>`,
  fanliebling: `<path d="M22 38 C9 29.5 5 22 5 16.5 C5 11.5 9 8 13.5 8 C17.3 8 20 10.3 22 13.5 C24 10.3 26.7 8 30.5 8 C35 8 39 11.5 39 16.5 C39 22 35 29.5 22 38Z" fill="#e53950" stroke="#9e1b32" stroke-width="2.2" stroke-linejoin="round"/><circle cx="35" cy="34" r="8.2" fill="#f2c230" stroke="#a67a06" stroke-width="2.2"/><path d="M35 30 V38 M31 34 H39" stroke="#6b4a00" stroke-width="2.6" stroke-linecap="round"/>`
};
export const wuerfelIcon = (b) => GLYPHEN[b] ? `<svg class="kl-wf-icon" viewBox="6 6 36 36">${GLYPHEN[b]}</svg>` : "";
export const bonusSymbol = (b, klasse = "kl-bsym") => b && GLYPHEN[b]
  ? `<svg class="${klasse}" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22.6" fill="#fff" stroke="#d4a017" stroke-width="2.6"/><g transform="translate(24 24) scale(.72) translate(-24 -24)">${GLYPHEN[b]}</g></svg>` : "";

// ---- Spielerkarte ------------------------------------------------------------------------
// opt: { mini, wert (aktueller Wert), neu, verkauf, klasse, attr }
export function karteHtml(id, opt = {}) {
  const k = karte(id);
  if (!k) return "";
  const wert = opt.wert ?? (k.start ? Number(id.split("-")[1]) : k.staerke);
  const klassen = ["kl-karte", opt.mini ? "kl-mini" : "", opt.klasse || ""];
  if (k.start) {
    return `<div class="${klassen.join(" ")} kl-start" ${opt.attr || ""}>
      <div class="kl-k-name"><span class="kl-k-vn">SPIELER</span><span class="kl-k-nn">START</span></div>
      <div class="kl-k-staerke">${wert}</div>
      <div class="kl-k-startbild">⚽</div>
      <div class="kl-k-unten kl-pos-none"><div class="kl-k-fx"></div><div class="kl-k-inhalt"><div class="kl-k-text"><b>Ohne Position</b><span>zählt überall voll</span></div></div></div>
    </div>`;
  }
  const teile = k.name.split(" ");
  const nn = teile.pop(), vn = teile.join(" ");
  const nf = NATION_FARBEN[k.nation] || ["#444", "#666", "#888"];
  const lang = nn.length > 10 ? " kl-lang2" : nn.length > 8 ? " kl-lang" : "";
  const diff = wert - k.staerke;
  return `<div class="${klassen.join(" ")} kl-pos-${k.pos}" style="--n1:${nf[0]};--n2:${nf[1]};--n3:${nf[2]}" ${opt.attr || ""}>
    <div class="kl-k-bg"></div>
    <div class="kl-k-name${lang}"><span class="kl-k-vn">${escapeHtml(vn.toUpperCase())}</span><span class="kl-k-nn">${escapeHtml(nn.toUpperCase())}</span></div>
    <div class="kl-k-staerke${diff > 0 ? " hoch" : diff < 0 ? " runter" : ""}">${wert}</div>
    ${flagge(k.nation, "kl-k-flagge")}
    <img class="kl-k-wappen" src="${vereinsWappen(k.verein)}" alt="">
    <img class="kl-k-bild" src="${spielerBild(id)}" alt="" loading="lazy" draggable="false">
    <div class="kl-k-unten"><div class="kl-k-fx"></div>
      <div class="kl-k-inhalt">${k.bonus ? bonusSymbol(k.bonus) : ""}<div class="kl-k-text">${k.bonus ? `<b>${BONUS_NAME[k.bonus]}</b><span>${BONUS_TEXT[k.bonus]}</span>` : `<b class="kl-k-ohne">Ohne Fähigkeit</b>`}</div>
      <div class="kl-k-kosten">${k.kosten}</div></div>
      <div class="kl-k-pos"><b>${k.pos}</b></div></div>
    ${opt.neu ? `<div class="kl-k-marke neu">NEU</div>` : ""}${opt.verkauf != null ? `<div class="kl-k-marke weg">+${opt.verkauf}</div>` : ""}
  </div>`;
}

// ---- Teamfarben ------------------------------------------------------------------------
export function farbIndex(hex, belegt = []) {
  const i = FARBEN.findIndex((f) => f.hex.toLowerCase() === String(hex || "").toLowerCase());
  if (i >= 0) return i;
  const frei = FARBEN.findIndex((f, j) => !belegt.includes(j));
  return frei >= 0 ? frei : 0;
}
export const FARBEN_LISTE = FARBEN;

// ---- Stil (wird beim Start einmal in den <head> gehängt) --------------------------------
export const STIL = `
.kl { --kl-st:#2e7d32; --kl-st-d:#1b5e20; --kl-mf:#1565c0; --kl-mf-d:#0d3f7a; --kl-abw:#c62828; --kl-abw-d:#7f1616;
  --kl-gold:#f2c230; --kl-flaeche:var(--club-ink-2,#24152a); --kl-flaeche2:var(--club-ink-3,#352039);
  --kl-text:var(--club-text,#fffaf3); --kl-muted:var(--club-muted,#bdb3c0); --kl-linie:rgba(255,255,255,.12);
  color:var(--kl-text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
.kl .kl-box { background:var(--kl-flaeche); border:1px solid var(--kl-linie); border-radius:18px; padding:14px; margin-bottom:12px; }
.kl h2, .kl h3 { font-family:"Barlow Condensed",sans-serif; font-weight:800; margin:0 0 8px; letter-spacing:.01em; }
.kl h2 { font-size:1.5rem; } .kl h3 { font-size:1.15rem; }
.kl .kl-muted { color:var(--kl-muted); font-size:.88rem; }
.kl .kl-zeile { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.kl .kl-chip { display:inline-flex; align-items:center; gap:5px; background:var(--kl-flaeche2); border-radius:999px; padding:4px 10px; font-size:.82rem; font-weight:600; }
.kl .kl-btn { width:auto; padding:9px 14px; margin:0; border-radius:12px; font-size:.95rem; }
.kl .kl-btn.sek { background:var(--kl-flaeche2); color:var(--kl-text); border:1px solid var(--kl-linie); }
.kl .kl-btn.an { background:var(--club-orange,#ff5b36); color:#fff; }
.kl .kl-btn:disabled { opacity:.45; }
.kl .kl-voll { width:100%; }

/* Kopfzeile */
.kl-kopf { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:8px; padding:10px 12px; margin:0 -2px 10px;
  background:rgba(18,13,23,.92); backdrop-filter:blur(8px); border:1px solid var(--kl-linie); border-radius:16px; }
.kl-kopf .kl-phase { flex:1; min-width:0; }
.kl-kopf .kl-phase b { display:block; font-family:"Barlow Condensed",sans-serif; font-size:1.15rem; line-height:1.1; }
.kl-kopf .kl-phase span { color:var(--kl-muted); font-size:.78rem; }
.kl-geld { display:inline-flex; align-items:center; gap:6px; font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:1.35rem; }
.kl-muenze { display:inline-grid; place-items:center; width:1.35em; height:1.35em; border-radius:50%; font-family:"Barlow Condensed",sans-serif; font-weight:800; color:#5a3d00;
  background:radial-gradient(circle at 35% 30%,#fff0b8,#ecb928 58%,#b98a0c); box-shadow:inset 0 0 0 .1em #a67a06; font-size:.9em; line-height:1; }
.kl-zeit { height:5px; border-radius:3px; background:rgba(255,255,255,.12); overflow:hidden; margin:-4px 2px 10px; }
.kl-zeit i { display:block; height:100%; background:var(--club-orange,#ff5b36); transition:width .3s linear; }
.kl-tabs { display:flex; gap:6px; margin-bottom:10px; }
.kl-tabs button { flex:1; margin:0; padding:8px 6px; font-size:.88rem; background:var(--kl-flaeche); border:1px solid var(--kl-linie); color:var(--kl-muted); border-radius:12px; }
.kl-tabs button.an { background:var(--kl-flaeche2); color:var(--kl-text); border-color:rgba(255,255,255,.3); }

/* Karte (Design "Klassik" mit Wabenmuster) */
.kl-karte { --pos:var(--kl-st); --posd:var(--kl-st-d); position:relative; width:18em; height:25.2em; border-radius:1.1em; overflow:hidden; color:#fff;
  font-family:"Barlow Condensed",sans-serif; box-shadow:0 .5em 1.2em rgba(0,0,0,.45); isolation:isolate; flex:none; text-align:left; font-size:10px; }
.kl-karte.kl-pos-MF { --pos:var(--kl-mf); --posd:var(--kl-mf-d); }
.kl-karte.kl-pos-ABW { --pos:var(--kl-abw); --posd:var(--kl-abw-d); }
.kl-k-bg { position:absolute; inset:0; z-index:0; background:
  linear-gradient(-22deg,var(--n3) 0 34%,var(--n2) 34% 40%,var(--n1) 40% 43%,transparent 43%), radial-gradient(circle at 50% 40%,#3a3a40,#1a1a1e 70%); }
.kl-k-bg::after { content:""; position:absolute; inset:0; opacity:.35;
  background:radial-gradient(circle,#000 22%,transparent 24%) 0 0/.7em .7em,radial-gradient(circle,#000 22%,transparent 24%) .35em .35em/.7em .7em; }
.kl-k-name { position:absolute; left:1em; top:.8em; right:4.4em; z-index:6; line-height:.95; text-shadow:0 .08em .25em rgba(0,0,0,.6); }
.kl-k-vn { display:block; font-weight:800; font-size:1.05em; letter-spacing:.06em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.kl-k-nn { display:block; font-weight:800; font-size:2em; letter-spacing:.02em; white-space:nowrap; }
.kl-k-name.kl-lang .kl-k-nn { font-size:1.7em; } .kl-k-name.kl-lang2 .kl-k-nn { font-size:1.45em; }
.kl-k-staerke { position:absolute; right:.9em; top:.8em; z-index:6; width:2.1em; height:2.1em; border-radius:50%; display:grid; place-items:center;
  font-weight:800; font-size:1.6em; background:#16161a; box-shadow:0 0 0 .12em var(--kl-gold),0 0 .6em rgba(242,194,48,.55); }
.kl-k-staerke.hoch { color:#7dff9a; } .kl-k-staerke.runter { color:#ff9a9a; }
.kl-k-flagge { position:absolute; right:1em; top:5.5em; width:3.3em; z-index:6; box-shadow:0 .1em .3em rgba(0,0,0,.4); }
.kl-k-wappen { position:absolute; left:.85em; top:5.05em; width:3em; height:3em; object-fit:contain; z-index:6;
  filter:drop-shadow(0 0 .07em rgba(255,255,255,.85)) drop-shadow(0 .1em .25em rgba(0,0,0,.5)); }
.kl-k-bild { position:absolute; left:.6em; right:.6em; top:4.2em; bottom:4.6em; width:calc(100% - 1.2em); height:calc(100% - 8.8em); object-fit:contain; object-position:center bottom; z-index:2;
  filter:drop-shadow(0 .3em .5em rgba(0,0,0,.35)); pointer-events:none; }
.kl-k-unten { position:absolute; left:0; right:0; bottom:0; height:5.9em; z-index:3; overflow:hidden;
  background:linear-gradient(180deg,var(--pos),var(--posd)); box-shadow:inset 0 .14em 0 rgba(255,255,255,.35); }
.kl-k-fx { position:absolute; inset:0; opacity:.22; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='48.5' viewBox='0 0 28 48.5'%3E%3Cpath d='M14 0 L28 8.08 L28 24.25 L14 32.33 L0 24.25 L0 8.08 Z M14 32.33 L14 48.5' fill='none' stroke='white' stroke-width='1.3'/%3E%3C/svg%3E"); background-size:1.6em 2.77em; }
.kl-k-inhalt { position:absolute; inset:0; right:2em; display:flex; align-items:center; gap:.55em; padding:0 .7em 0 .8em; z-index:2; }
.kl-k-inhalt .kl-bsym { width:2.7em; height:2.7em; flex:none; }
.kl-k-text { flex:1; min-width:0; }
.kl-k-text b { display:block; font-size:1.1em; line-height:1; font-weight:800; letter-spacing:.04em; text-transform:uppercase; margin-bottom:.15em; }
.kl-k-text span { display:block; font-family:-apple-system,"Segoe UI",sans-serif; font-weight:500; font-size:.74em; line-height:1.2; opacity:.95; }
.kl-k-ohne { opacity:.6; }
.kl-k-kosten { flex:none; width:2.25em; height:2.25em; border-radius:50%; display:grid; place-items:center; font-weight:800; font-size:1.5em; color:#5a3d00; line-height:1;
  background:radial-gradient(circle at 35% 30%,#fff0b8,#ecb928 58%,#b98a0c); box-shadow:inset 0 0 0 .1em #a67a06,0 .1em .3em rgba(0,0,0,.45); }
.kl-k-pos { position:absolute; right:0; top:0; bottom:0; width:2em; z-index:2; display:grid; place-items:center;
  background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.4)); border-left:.1em solid #e4b726; }
.kl-k-pos b { writing-mode:vertical-rl; transform:rotate(180deg); font-weight:800; font-size:1.05em; letter-spacing:.14em; }
.kl-start .kl-k-unten { background:linear-gradient(180deg,#6b7280,#4b5563); }
.kl-start { background:radial-gradient(circle at 50% 40%,#3f4450,#1f2228 70%); }
.kl-k-startbild { position:absolute; inset:5em 0 6em; display:grid; place-items:center; font-size:5em; opacity:.35; }
.kl-k-marke { position:absolute; left:50%; top:46%; transform:translate(-50%,-50%) rotate(-8deg); z-index:8; font-weight:800; font-size:1.6em;
  padding:.1em .5em; border-radius:.3em; letter-spacing:.06em; box-shadow:0 .2em .5em rgba(0,0,0,.4); }
.kl-k-marke.neu { background:#22c55e; color:#04230f; } .kl-k-marke.weg { background:#f2c230; color:#3a2a00; }
.kl-mini .kl-k-text, .kl-mini .kl-k-vn { display:none; }
.kl-mini .kl-k-name { right:3.6em; }
.kl-mini .kl-k-inhalt .kl-bsym { width:3.2em; height:3.2em; }

/* Raster */
.kl-raster-wrap { display:grid; grid-template-columns:22px 1fr 34px; gap:4px; align-items:stretch; }
.kl-raster { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; padding:5px; border-radius:12px;
  background:repeating-linear-gradient(180deg,#2f6b3a 0 33.33%,#2a6234 33.33% 66.66%); }
.kl-zelle { position:relative; aspect-ratio:18/25.2; border-radius:8px; background:rgba(0,0,0,.18); border:1px dashed rgba(255,255,255,.25);
  padding:0; margin:0; display:block; overflow:visible; font-size:inherit; }
.kl-zelle { container-type:inline-size; }
.kl-zelle .kl-karte { width:100%; height:100%; font-size:calc(100cqw / 18); box-shadow:0 .3em .6em rgba(0,0,0,.4); }
.kl-zelle.ziel { border:2px solid #fff; background:rgba(255,255,255,.12); cursor:pointer; }
.kl-zelle.ziel.belegt { box-shadow:0 0 0 2px #fff; }
.kl-reihen-label { display:grid; grid-template-rows:repeat(3,1fr); gap:5px; padding:5px 0; }
.kl-reihen-label span { writing-mode:vertical-rl; transform:rotate(180deg); text-align:center; font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:.8rem;
  border-radius:6px; color:#fff; display:grid; place-items:center; }
.kl-summe-r { display:grid; grid-template-rows:repeat(3,1fr); gap:5px; padding:5px 0; }
.kl-summe-s { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; padding:4px 5px 0; }
.kl-summe { display:grid; place-items:center; font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:1.05rem; border-radius:8px; background:var(--kl-flaeche2); color:var(--kl-text); }
.kl-summe small { display:block; font-size:.62rem; color:var(--kl-muted); font-weight:700; line-height:1; }
.kl-summe-wf { display:flex !important; align-items:center; justify-content:center; gap:1px; }
.kl-wf-icon { width:15px; height:15px; flex:none; }
.kl-summe.aktiv { background:var(--club-orange,#ff5b36); color:#fff; } .kl-summe.aktiv small { color:#ffe2d9; }
.kl-raster-info { display:flex; justify-content:space-between; gap:8px; margin-top:8px; font-size:.8rem; color:var(--kl-muted); }

/* Handkarten */
.kl-hand { display:flex; gap:10px; overflow-x:auto; padding:4px 2px 10px; scroll-snap-type:x mandatory; }
.kl-hand > button { padding:0; margin:0; background:none; border:3px solid transparent; border-radius:14px; scroll-snap-align:start; flex:none; }
.kl-hand > button.gewaehlt { border-color:#fff; box-shadow:0 0 0 3px var(--club-orange,#ff5b36); }
.kl-hand > button.platziert { opacity:.55; }
.kl-hand > button.teuer .kl-k-kosten { box-shadow:0 0 0 .15em #ff3b3b; }
.kl-hand .kl-karte { font-size:7.6px; }
.kl-hand-info { font-size:.82rem; color:var(--kl-muted); margin:2px 0 8px; }

/* Geldübersicht und Arena */
.kl-rechnung { display:grid; grid-template-columns:1fr auto; gap:3px 12px; font-size:.9rem; }
.kl-rechnung .sum { border-top:1px solid var(--kl-linie); padding-top:4px; font-weight:700; }
.kl-arena svg { display:block; width:100%; height:auto; border-radius:12px; }
.kl-pfade { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
.kl-pfad { background:var(--kl-flaeche2); border-radius:12px; padding:10px; border:2px solid transparent; text-align:left; margin:0; color:var(--kl-text); font-size:.85rem; }
.kl-pfad b { display:block; font-family:"Barlow Condensed",sans-serif; font-size:1.05rem; }
.kl-pfad .stufen { display:flex; gap:4px; margin:4px 0; } .kl-pfad .stufen i { width:18px; height:6px; border-radius:3px; background:rgba(255,255,255,.18); }
.kl-pfad .stufen i.an { background:var(--kl-gold); }
.kl-pfad.gewaehlt { border-color:var(--club-orange,#ff5b36); }
button.kl-pfad:disabled { opacity:.5; }

/* Warten / Status */
.kl-wer { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.kl-wer span { font-size:.8rem; padding:3px 8px; border-radius:999px; background:var(--kl-flaeche2); color:var(--kl-muted); }
.kl-wer span.ok { color:#fff; background:#1f7a3b; }
.kl-team-name { display:inline-flex; align-items:center; gap:6px; font-weight:700; }
.kl-team-name svg { width:22px; height:22px; flex:none; }
.kl-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }

/* Tabelle */
.kl-tab { width:100%; border-collapse:collapse; font-size:.88rem; font-variant-numeric:tabular-nums; }
.kl-tab th { text-align:left; color:var(--kl-muted); font-weight:600; font-size:.72rem; text-transform:uppercase; letter-spacing:.05em; padding:4px; }
.kl-tab td { padding:6px 4px; border-top:1px solid var(--kl-linie); }
.kl-tab td.z, .kl-tab th.z { text-align:center; }
.kl-tab tr.ich td { background:rgba(255,91,54,.12); }
.kl-tab tr.klickbar { cursor:pointer; }
.kl-plus { color:#7dff9a; font-size:.75rem; margin-left:3px; }

/* Spieltag */
.kl-spiel { background:var(--kl-flaeche2); border-radius:14px; padding:10px 12px; margin-bottom:10px; }
.kl-spiel-kopf { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:8px; }
.kl-spiel-kopf .r { justify-self:end; text-align:right; }
.kl-ergebnis { font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:1.8rem; letter-spacing:.04em; }
.kl-heim { font-size:.68rem; color:var(--kl-gold); display:block; }
.kl-duell { display:grid; grid-template-columns:1fr auto 1fr; gap:6px; align-items:center; font-size:.85rem; padding:5px 0; border-top:1px solid var(--kl-linie);
  animation:klAuf .45s ease both; }
.kl-duell .r { text-align:right; }
.kl-duell .mitte { font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:1.1rem; text-align:center; min-width:70px; }
.kl-duell .tore { font-size:.95rem; }
.kl-duell .w { color:var(--kl-muted); font-size:.72rem; }
.kl-duell.sieg-a .l b, .kl-duell.sieg-b .r b { color:#7dff9a; }
@keyframes klAuf { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion:reduce) { .kl-duell { animation:none; } }
.kl-entw { display:flex; align-items:center; gap:8px; font-size:.85rem; padding:4px 0; }
.kl-entw .kl-bsym { width:24px; height:24px; flex:none; }
.kl-entw { align-items:flex-start; line-height:1.4; } .kl-entw > span { min-width:0; }

/* Overlay für große Karte */
.kl-overlay { position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.72); display:grid; place-items:center; padding:20px; }
.kl-overlay .kl-karte { font-size:clamp(11px,4.2vw,16px); }
.kl-overlay .kl-ov-info { color:#fff; text-align:center; margin-top:10px; font-size:.9rem; }
.kl-regeln { margin:0 0 14px; padding:0; list-style:none; counter-reset:klr; color:var(--kl-muted); font-size:.9rem; }
.kl-regeln li { display:grid; grid-template-columns:auto 1fr; column-gap:8px; margin:0 0 8px; line-height:1.4; }
.kl-regeln li::before { content:"•"; color:var(--club-orange,#ff5b36); font-weight:800; grid-row:span 2; }
ol.kl-regeln li { counter-increment:klr; }
ol.kl-regeln li::before { content:counter(klr) "."; color:var(--kl-text); min-width:1.2em; }
.kl-regeln li b { color:var(--kl-text); }
.kl-schon { margin-top:12px; }
.kl-schon-karten { display:flex; gap:8px; margin-top:6px; }
.kl-schon-karten button { padding:0; margin:0; background:none; border:0; width:72px; flex:none; container-type:inline-size; }
.kl-schon-karten .kl-karte { width:100%; height:auto; aspect-ratio:18/25.2; font-size:calc(100cqw / 18); }
.kl-spiel[data-a] { cursor:pointer; } .kl-spiel[data-a]:active { transform:scale(.99); } .kl-weitere { cursor:pointer; }
.kl-overlay-scroll { display:block; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; background:rgba(8,6,12,.94);
  padding:calc(env(safe-area-inset-top, 0px) + 16px) 12px calc(env(safe-area-inset-bottom, 0px) + 40px); }
.kl-overlay-scroll .kl-sp-panel { margin:0 auto; }
.kl-sp-panel { width:100%; max-width:440px; background:var(--kl-flaeche); border:1px solid var(--kl-linie); border-radius:18px; padding:14px; }
.kl-sp-duell { margin-top:14px; padding:10px 10px 12px; background:var(--kl-flaeche2); border:1px solid rgba(255,255,255,.18); border-radius:16px; box-shadow:0 6px 18px rgba(0,0,0,.35); }
.kl-sp-titel { font-family:"Barlow Condensed",sans-serif; font-weight:800; font-size:.8rem; letter-spacing:.08em; text-transform:uppercase; color:#fff;
  background:var(--club-orange,#ff5b36); border-radius:999px; padding:2px 10px; display:inline-block; margin-bottom:6px; }
.kl-sp-kopf { display:grid; grid-template-columns:1fr auto 1fr; gap:6px; align-items:center; font-size:.85rem; }
.kl-sp-kopf span:last-child { text-align:right; } .kl-sp-kopf b { font-family:"Barlow Condensed",sans-serif; font-size:1.4rem; }
.kl-sp-tore { text-align:center; font-size:.8rem; color:var(--kl-muted); margin:2px 0 6px; }
.kl-sp-karten { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.kl-sp-karte { container-type:inline-size; min-width:0; }
.kl-sp-karte .kl-karte { width:100%; height:auto; aspect-ratio:18/25.2; font-size:calc(100cqw / 18); }
.kl-sp-leer { aspect-ratio:18/25.2; border:1px dashed rgba(255,255,255,.25); border-radius:8px; display:grid; place-items:center; color:var(--kl-muted); font-size:.8rem; }
.kl-sp-wert { text-align:center; margin-top:4px; line-height:1.15; }
.kl-sp-wert b { font-family:"Barlow Condensed",sans-serif; font-size:1.2rem; display:block; }
.kl-sp-wert small { font-size:.62rem; color:var(--kl-muted); }
.kl-sp-gegen { text-align:center; font-size:.72rem; color:var(--kl-muted); text-transform:uppercase; letter-spacing:.08em; margin:6px 0; }
.kl-flagge { width:20px; height:14px; vertical-align:-2px; border-radius:2px; }
.kl-setup-bots { display:flex; gap:6px; flex-wrap:wrap; }
.kl-setup-bots button { margin:0; width:auto; padding:8px 14px; background:var(--kl-flaeche2,#352039); color:#fff; border:1px solid rgba(255,255,255,.15); }
.kl-setup-bots button.an { background:var(--club-orange,#ff5b36); }
`;

// ---- Teamwappen und Arena (aus den Entwürfen übernommen) ----------------------------------
function rgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.substr(i,2),16))}
function hex(a){return '#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')}
function shade(h,t){const c=rgb(h);return t<0?hex(c.map(v=>v*(1+t))):hex(c.map(v=>v+(255-v)*t))}
function lum(h){const [r,g,b]=rgb(h);return (0.299*r+0.587*g+0.114*b)/255}
let UID=0;

/* ---------------- Teamwappen ---------------- */
const SHIELDS={
 klassik:'M50 4 L92 14 V48 C92 74 74 90 50 98 C26 90 8 74 8 48 V14 Z',
 rund:'M50 4 A46 46 0 1 1 49.9 4 Z',
 spitz:'M14 6 H86 V40 C86 66 70 84 50 96 C30 84 14 66 14 40 Z',
 sechs:'M50 3 L91 26 V74 L50 97 L9 74 V26 Z',
 wappen:'M10 8 H90 V52 C90 76 70 90 50 97 C30 90 10 76 10 52 Z M10 8 Q30 16 50 8 Q70 16 90 8',
 oval:'M50 3 C78 3 92 26 92 50 C92 76 76 97 50 97 C24 97 8 76 8 50 C8 26 22 3 50 3 Z'
};
const WAPPEN=[
 {name:'Blitz',form:'klassik',sym:(c,d,i)=>`<path d="M56 18 L32 56 H48 L42 84 L68 44 H52 Z" fill="${d}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`},
 {name:'Welle',form:'rund',sym:(c,d,i)=>`<g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"><path d="M22 44 q7 -9 14 0 t14 0 t14 0 t14 0"/><path d="M22 60 q7 -9 14 0 t14 0 t14 0 t14 0" stroke="${d}"/><path d="M22 76 q7 -9 14 0 t14 0 t14 0 t14 0" opacity=".85"/></g><circle cx="50" cy="26" r="7" fill="#fff"/>`},
 {name:'Burg',form:'spitz',sym:(c,d,i)=>`<path d="M32 78 V38 H38 V30 H45 V38 H55 V30 H62 V38 H68 V78 Z" fill="${d}" stroke="#fff" stroke-width="2.5"/><path d="M45 78 V62 A5 5 0 0 1 55 62 V78 Z" fill="#fff"/><rect x="47" y="46" width="6" height="8" rx="1" fill="#fff"/>`},
 {name:'Eiche',form:'wappen',sym:(c,d,i)=>`<path d="M50 30 C36 30 30 42 36 50 C28 54 32 68 44 66 C46 72 54 72 56 66 C68 68 72 54 64 50 C70 42 64 30 50 30 Z" fill="#3f7a2e" stroke="#fff" stroke-width="2.5"/><rect x="46.5" y="64" width="7" height="16" rx="2" fill="${d}" stroke="#fff" stroke-width="2"/>`},
 {name:'Anker',form:'oval',sym:(c,d,i)=>`<g fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"><circle cx="50" cy="26" r="6"/><path d="M50 32 V80"/><path d="M36 44 H64"/><path d="M26 62 C28 76 40 82 50 82 C60 82 72 76 74 62"/></g><path d="M22 64 l6 -8 6 8z M78 64 l-6 -8 -6 8z" fill="#fff"/>`},
 {name:'Flamme',form:'klassik',sym:(c,d,i)=>`<path d="M50 20 C58 34 70 40 68 58 C67 72 58 82 50 82 C40 82 31 73 32 60 C33 50 40 46 42 38 C46 44 46 50 50 52 C54 44 50 32 50 20 Z" fill="#fff"/><path d="M50 52 C54 58 60 62 58 70 C57 76 53 79 50 79 C46 79 42 75 43 69 C44 64 48 60 50 52 Z" fill="${d}"/>`},
 {name:'Sonne',form:'rund',sym:(c,d,i)=>{let r='';for(let k=0;k<12;k++){const a=k*30*Math.PI/180;r+=`<path d="M${50+Math.cos(a)*22} ${52+Math.sin(a)*22} L${50+Math.cos(a+0.13)*34} ${52+Math.sin(a+0.13)*34} L${50+Math.cos(a-0.13)*34} ${52+Math.sin(a-0.13)*34}Z" fill="#fff"/>`}return r+`<circle cx="50" cy="52" r="17" fill="${d}" stroke="#fff" stroke-width="3.5"/>`}},
 {name:'Tanne',form:'sechs',sym:(c,d,i)=>`<path d="M50 18 L64 40 H57 L70 58 H60 L74 76 H26 L40 58 H30 L43 40 H36 Z" fill="#fff"/><rect x="45" y="76" width="10" height="9" fill="${d}"/>`},
 {name:'Diamant',form:'spitz',sym:(c,d,i)=>`<path d="M32 40 L40 28 H60 L68 40 L50 76 Z" fill="#fff"/><path d="M32 40 H68 M40 28 L46 40 L50 76 M60 28 L54 40 L50 76 M46 40 L50 28 L54 40" fill="none" stroke="${d}" stroke-width="2.2" stroke-linejoin="round"/>`},
 {name:'Krone',form:'wappen',sym:(c,d,i)=>`<path d="M26 70 L22 36 L38 50 L50 28 L62 50 L78 36 L74 70 Z" fill="#fff" stroke="${d}" stroke-width="2.5" stroke-linejoin="round"/><rect x="26" y="70" width="48" height="8" rx="2" fill="${d}"/><circle cx="22" cy="34" r="4" fill="#fff"/><circle cx="50" cy="26" r="4" fill="#fff"/><circle cx="78" cy="34" r="4" fill="#fff"/>`}
];
function crest(i,size){
 const c=FARBEN[i].hex,w=WAPPEN[i],d=shade(c,-0.45),l=shade(c,0.25),id='cg'+(UID++);
 const P=SHIELDS[w.form].split(' M10 8 Q')[0];
 const deco=w.form==='wappen'?`<path d="M10 8 Q30 16 50 8 Q70 16 90 8" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/>`:'';
 return `<svg viewBox="0 0 100 100" ${size?`width="${size}" height="${size}"`:''} xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
 <path d="${P}" fill="${d}"/><path d="${P}" fill="url(#${id})" transform="translate(50 50) scale(.88) translate(-50 -50)"/>${deco}
 <path d="${P}" fill="none" stroke="#fff" stroke-width="2" opacity=".55" transform="translate(50 50) scale(.88) translate(-50 -50)"/>${w.sym(c,d,i)}</svg>`;
}

/* ---------------- Arena (rechteckig, 3D-Projektion) ---------------- */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const CAM={cx:200,hy:22,camH:110,dist:140,f:200};
function P(x,y,z){const d=y+CAM.dist,s=CAM.f/d;return[CAM.cx+x*s,CAM.hy+(CAM.camH-z)*s,s]}
function pts(arr){return arr.map(p=>{const q=P(...p);return q[0].toFixed(1)+','+q[1].toFixed(1)}).join(' ')}
function poly(arr,fill,extra=''){return `<polygon points="${pts(arr)}" fill="${fill}" ${extra}/>`}
function line(a,b,stroke,w,extra=''){const p=P(...a),q=P(...b);return `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`}
function lerp3(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
function bil(q,u,v){return lerp3(lerp3(q[0],q[1],u),lerp3(q[3],q[2],u),v)} // q: innen-a, innen-b, aussen-b, aussen-a

const PW=52,PL=34,GX=58,GY=40; // Spielfeld halbe Länge/Breite, Innenkante der Ränge

function stadion(ci,t,h){
 const c=FARBEN[ci].hex,d=shade(c,-0.35),dd=shade(c,-0.62),l=shade(c,0.35),u='a'+(UID++),R=rng(ci*31+t*7+h*3+1);
 const grey=lum(c)>0.7;
 const conc1='#5f666e',conc2='#474d54',seatGrey='#8c939b';
 // Rang-Geometrie je Tribünen-Stufe
 const G=[
  {tiers:[{t0:0,t1:13,z0:1,z1:9}],corners:false,top:9},
  {tiers:[{t0:0,t1:20,z0:1,z1:16}],corners:true,top:16},
  {tiers:[{t0:0,t1:15,z0:1,z1:12},{t0:18,t1:33,z0:16,z1:29}],corners:true,top:29,roof:true}
 ][t];
 const along={far:[-GX,GX],side:G.corners?[-GY,GY]:[-PL-2,PL+2]};
 // Flächen der Ränge als Vierecke (innen-a, innen-b, außen-b, außen-a)
 function farQ(tr,a=along.far[0],b=along.far[1]){return[[a,GY+tr.t0,tr.z0],[b,GY+tr.t0,tr.z0],[b,GY+tr.t1,tr.z1],[a,GY+tr.t1,tr.z1]]}
 function sideQ(tr,sg){const a=along.side[0],b=along.side[1],x0=sg*(GX+tr.t0),x1=sg*(GX+tr.t1);return[[x0,a,tr.z0],[x0,b,tr.z0],[x1,b,tr.z1],[x1,a,tr.z1]]}
 function cornerQ(tr,sg){return[[sg*(GX+tr.t0),GY+tr.t0,tr.z0],[sg*(GX+tr.t1),GY+tr.t0,tr.z1],[sg*(GX+tr.t1),GY+tr.t1,tr.z1],[sg*(GX+tr.t0),GY+tr.t1,tr.z1]]}

 let s=`<svg class="st" viewBox="30 66 340 182" xmlns="http://www.w3.org/2000/svg"><defs>
 <linearGradient id="${u}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset=".55" stop-color="#151b2e"/><stop offset="1" stop-color="#0c0f16"/></linearGradient>
 <linearGradient id="${u}seat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t?l:'#a3aab2'}"/><stop offset="1" stop-color="${t?d:'#6c737b'}"/></linearGradient>
 <linearGradient id="${u}seatS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t?d:'#6c737b'}"/><stop offset="1" stop-color="${t?c:'#959ca4'}"/></linearGradient>
 <radialGradient id="${u}glow"><stop offset="0" stop-color="#fffbe6" stop-opacity=".95"/><stop offset=".35" stop-color="#fff3c4" stop-opacity=".35"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>
 <radialGradient id="${u}fire"><stop offset="0" stop-color="#fff2c0"/><stop offset=".3" stop-color="#ff9b2f"/><stop offset=".7" stop-color="#ff4d0d" stop-opacity=".5"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
 <radialGradient id="${u}pitchL" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity="${h==2?.16:.07}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <linearGradient id="${u}beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0" stop-opacity=".22"/><stop offset="1" stop-color="#fffbe0" stop-opacity="0"/></linearGradient>
 <filter id="${u}blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
 </defs><rect x="0" y="0" width="400" height="260" fill="url(#${u}sky)"/>`;
 // Skyline-Andeutung
 let sky='';for(let i=0;i<26;i++){const x=i*16+R()*6,w=8+R()*10,hh=8+R()*22;sky+=`<rect x="${x.toFixed(1)}" y="${(112-hh).toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" fill="#141a28"/>`;if(R()<.6)sky+=`<rect x="${(x+2+R()*4).toFixed(1)}" y="${(112-hh+3+R()*6).toFixed(1)}" width="1.6" height="1.6" fill="#f3d27a" opacity=".55"/>`}
 s+=sky;
 // Boden um die Arena
 s+=poly([[-120,-60,0],[120,-60,0],[120,110,0],[-120,110,0]],'#10151b');
 // Masten (Flutlicht ohne Dach) hinten
 const masts=h==2&&!G.roof?[[-GX-24,GY+24],[GX+24,GY+24]]:[];
 masts.forEach(([x,y])=>{s+=line([x,y,0],[x,y,58],'#7b8592',1.6)+poly([[x-6,y,56],[x+6,y,56],[x+6,y,61],[x-6,y,61]],'#e9eef4');const p=P(x,y,59);s+=`<circle cx="${p[0]}" cy="${p[1]}" r="${26*p[2]}" fill="url(#${u}glow)"/>`});
 // Schatten/Unterbau der Ränge
 const OUT=G.tiers[G.tiers.length-1].t1;
 s+=poly([[-GX-OUT-3,-PL-4,0],[GX+OUT+3,-PL-4,0],[GX+OUT+3,GY+OUT+3,0],[-GX-OUT-3,GY+OUT+3,0]],'#05070a','opacity=".7"');
 // Innenraum + Spielfeld
 s+=poly([[-GX,-GY,0],[GX,-GY,0],[GX,GY,0],[-GX,GY,0]],'#1d5a2a');
 const N=12;for(let i=0;i<N;i++){const x0=-PW+i*2*PW/N,x1=x0+2*PW/N;s+=poly([[x0,-PL,0],[x1,-PL,0],[x1,PL,0],[x0,PL,0]],i%2?'#2f8f40':'#37a04a')}
 s+=poly([[-PW,-PL,0],[PW,-PL,0],[PW,PL,0],[-PW,PL,0]],`url(#${u}pitchL)`);
 const W='#ffffff',lw=.9;
 s+=`<polygon points="${pts([[-PW+1,-PL+1,0],[PW-1,-PL+1,0],[PW-1,PL-1,0],[-PW+1,PL-1,0]])}" fill="none" stroke="${W}" stroke-width="${lw}" stroke-opacity=".9"/>`;
 s+=line([0,-PL+1,0],[0,PL-1,0],W,lw,'stroke-opacity=".9"');
 let cc=[];for(let k=0;k<=40;k++){const a=k/40*Math.PI*2;cc.push([Math.cos(a)*9.15,Math.sin(a)*9.15,0])}
 s+=`<polyline points="${pts(cc)}" fill="none" stroke="${W}" stroke-width="${lw}" stroke-opacity=".9"/>`;
 [-1,1].forEach(sg=>{const x0=sg*(PW-1),x1=sg*(PW-1-16.5),x2=sg*(PW-1-5.5);
  s+=`<polyline points="${pts([[x0,-20.15,0],[x1,-20.15,0],[x1,20.15,0],[x0,20.15,0]])}" fill="none" stroke="${W}" stroke-width="${lw}" stroke-opacity=".9"/>`;
  s+=`<polyline points="${pts([[x0,-9.16,0],[x2,-9.16,0],[x2,9.16,0],[x0,9.16,0]])}" fill="none" stroke="${W}" stroke-width="${lw}" stroke-opacity=".9"/>`;
  const gx=sg*(PW-1),gb=sg*(PW+1.5);
  s+=poly([[gx,-3.66,0],[gb,-3.66,0],[gb,3.66,0],[gx,3.66,0]],'#ffffff','opacity=".18"');
  s+=line([gx,-3.66,0],[gx,-3.66,2.44],W,1.1)+line([gx,3.66,0],[gx,3.66,2.44],W,1.1)+line([gx,-3.66,2.44],[gx,3.66,2.44],W,1.1);
 });
 // Wappen im Mittelkreis (flach auf dem Rasen)
 {const p=P(0,0,0),sz=13*p[2];s+=`<g transform="translate(${p[0]-sz/2} ${p[1]-sz*0.28}) scale(${sz/100} ${sz/100*0.56})" opacity=".9">${crest(ci).replace(/<svg[^>]*>/,'').replace('</svg>','')}</g>`}
 // Werbebanden
 const bandC=h>=1?c:'#d9dee4',bandL=h>=1?l:'#ffffff';
 const boards=[[[-PW-2,PL+3],[PW+2,PL+3]],[[PW+3,-PL-2],[PW+3,PL+2]],[[-PW-3,-PL-2],[-PW-3,PL+2]]];
 boards.forEach(([a,b])=>{s+=poly([[a[0],a[1],0],[b[0],b[1],0],[b[0],b[1],1.3],[a[0],a[1],1.3]],bandC);
  for(let k=0;k<6;k++){const f0=k/6+.03,f1=f0+.1;const A=lerp3([a[0],a[1],.55],[b[0],b[1],.55],f0),B=lerp3([a[0],a[1],.55],[b[0],b[1],.55],f1);s+=line(A,B,bandL,.9,'opacity=".8"')}});
 // Ränge zeichnen
 function seatSurface(q,fill,rows,dens,isFar){
  let o=poly(q,fill);
  for(let k=1;k<rows;k++){const v=k/rows;o+=`<polyline points="${pts([bil(q,0,v),bil(q,1,v)])}" fill="none" stroke="#000" stroke-opacity=".22" stroke-width=".7"/>`}
  // Fans
  const n=Math.round(dens*(isFar?520:300));let f='';
  for(let k=0;k<n;k++){const p=P(...bil(q,R(),R()*.96+.02)),r=Math.max(.45,p[2]*.75);const rr=R();
   const col=h==2?(rr<.62?c:rr<.82?'#ffffff':dd):(rr<.35?c:rr<.6?'#e8e2d6':rr<.8?'#2b2f36':'#b5734a');
   f+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r.toFixed(2)}" fill="${col}"/>`}
  return o+f;
 }
 const dens=[.28,.55,.9][h];
 G.tiers.forEach((tr,ti)=>{
  const rows=Math.round((tr.t1-tr.t0)/2.2);
  s+=seatSurface(farQ(tr),`url(#${u}seat)`,rows,dens,true);
  if(G.corners){s+=seatSurface(cornerQ(tr,-1),`url(#${u}seat)`,rows,dens*.5);s+=seatSurface(cornerQ(tr,1),`url(#${u}seat)`,rows,dens*.5)}
  [-1,1].forEach(sg=>{s+=seatSurface(sideQ(tr,sg),`url(#${u}seatS)`,rows,dens)});
  [-1,1].forEach(sg=>{const q=sideQ(tr,sg),y=q[0][1];s+=poly([[q[0][0],y,0],[q[0][0],y,q[0][2]],[q[3][0],y,q[3][2]],[q[3][0],y,0]],t?dd:conc2,'stroke="#000" stroke-opacity=".25" stroke-width=".5"')});
  // Stirnkante (Brüstung) innen
  s+=poly([[-GX,GY+tr.t0,tr.z0-1],[GX,GY+tr.t0,tr.z0-1],[GX,GY+tr.t0,tr.z0],[-GX,GY+tr.t0,tr.z0]],t?dd:conc2);
 });
 // VIP-Logenband zwischen den Rängen (Tribüne 2)
 if(t==2){const a=G.tiers[0],b=G.tiers[1];
  s+=poly([[-GX-a.t1,GY+a.t1,a.z1],[GX+a.t1,GY+a.t1,a.z1],[GX+a.t1,GY+a.t1,b.z0],[-GX-a.t1,GY+a.t1,b.z0]],'#0e1218');
  for(let k=0;k<22;k++){const x=-GX-a.t1+k*(2*(GX+a.t1))/22+1.5;s+=poly([[x,GY+a.t1-.1,a.z1+1],[x+3.4,GY+a.t1-.1,a.z1+1],[x+3.4,GY+a.t1-.1,b.z0-.8],[x,GY+a.t1-.1,b.z0-.8]],R()<.7?'#f6d98a':'#6d86a8','opacity=".75"')}
  [-1,1].forEach(sg=>{const x=sg*(GX+a.t1);s+=poly([[x,-GY,a.z1],[x,GY+a.t1,a.z1],[x,GY+a.t1,b.z0],[x,-GY,b.z0]],'#0e1218');
   for(let k=0;k<9;k++){const y=-GY+k*(2*GY+a.t1)/9+1;s+=poly([[x,y,a.z1+1],[x,y+4,a.z1+1],[x,y+4,b.z0-.8],[x,y,b.z0-.8]],R()<.7?'#f6d98a':'#6d86a8','opacity=".7"')}});
 }
 // Choreo (Hexenkessel 2) auf der Gegengerade
 if(h==2){const tr=G.tiers[G.tiers.length-1];const q=farQ(tr,-GX*.62,GX*.62);
  s+=poly(q,c,'opacity=".92"');
  for(let k=0;k<7;k++){const a=k/7,b=a+1/14;s+=poly([bil(q,a,0),bil(q,b,0),bil(q,b,1),bil(q,a,1)],k%2?'#ffffff':dd,'opacity=".35"')}
  const m=P(...bil(q,.5,.5)),hgt=Math.abs(P(...bil(q,.5,1))[1]-P(...bil(q,.5,0))[1])*1.15;
  s+=`<g transform="translate(${m[0]-hgt/2} ${m[1]-hgt/2}) scale(${hgt/100})">${crest(ci).replace(/<svg[^>]*>/,'').replace('</svg>','')}</g>`;
 }
 // Fahnen oben auf den Rängen und Zaunfahnen (Hexenkessel 1+)
 if(h>=1){const tr=G.tiers[G.tiers.length-1];
  for(let k=0;k<=8;k++){const x=-GX+k*(2*GX)/8;s+=line([x,GY+tr.t1,tr.z1],[x,GY+tr.t1,tr.z1+7],'#cfd5dc',.7)+poly([[x,GY+tr.t1,tr.z1+7],[x+5,GY+tr.t1,tr.z1+5.6],[x,GY+tr.t1,tr.z1+4.2]],k%2?'#fff':c)}
  [-1,1].forEach(sg=>{for(let k=0;k<=5;k++){const y=-PL+k*(2*PL)/5,x=sg*(GX+tr.t1);s+=line([x,y,tr.z1],[x,y,tr.z1+7],'#cfd5dc',.7)+poly([[x,y,tr.z1+7],[x,y+5,tr.z1+5.6],[x,y,tr.z1+4.2]],k%2?c:'#fff')}});
  // Zaunfahnen vorne an der Gegengerade
  for(let k=0;k<5;k++){const x0=-GX+6+k*22,x1=x0+14;s+=poly([[x0,GY-.2,0.2],[x1,GY-.2,0.2],[x1,GY-.2,G.tiers[0].z0+2],[x0,GY-.2,G.tiers[0].z0+2]],k%2?'#fff':c,'stroke="'+dd+'" stroke-width=".5"')}
 }
 // Bengalos + Rauch in den Kurven (Hexenkessel 2)
 if(h==2){const tr=G.tiers[0];
  [-1,1].forEach(sg=>{for(let k=0;k<5;k++){const y=-22+k*11+R()*3,tt=tr.t0+3+R()*(tr.t1-tr.t0-6),z=tr.z0+(tr.z1-tr.z0)*(tt-tr.t0)/(tr.t1-tr.t0);const p=P(sg*(GX+tt),y,z);
   s+=`<ellipse cx="${p[0]}" cy="${p[1]-10*p[2]}" rx="${11*p[2]}" ry="${7*p[2]}" fill="#c7c9d1" opacity=".28" filter="url(#${u}blur)"/><circle cx="${p[0]}" cy="${p[1]}" r="${5*p[2]}" fill="url(#${u}fire)"/><circle cx="${p[0]}" cy="${p[1]}" r="${.9*p[2]}" fill="#fff"/>`}});
 }
 // Dach (Tribüne 2): Arena-Dach mit LED-Band
 if(G.roof){const zR=34,i0=24,o0=38;
  const ring=[[-GX-o0,-PL-2,zR],[-GX-o0,GY+o0,zR],[GX+o0,GY+o0,zR],[GX+o0,-PL-2,zR],[GX+i0,-PL-2,zR],[GX+i0,GY+i0,zR],[-GX-i0,GY+i0,zR],[-GX-i0,-PL-2,zR]];
  s+=poly(ring,'#c9d6e6','opacity=".16"');
  s+=`<polyline points="${pts([[-GX-i0,-PL-2,zR],[-GX-i0,GY+i0,zR],[GX+i0,GY+i0,zR],[GX+i0,-PL-2,zR]])}" fill="none" stroke="${h>=1?c:'#9aa6b4'}" stroke-width="1.6"/>`;
  // Dachstreben
  for(let k=0;k<=8;k++){const x=-GX-i0+k*(2*(GX+i0))/8;s+=line([x,GY+i0,zR],[x,GY+o0,zR],'#aab6c4',.6,'opacity=".55"')}
  [-1,1].forEach(sg=>{for(let k=0;k<=5;k++){const y=-PL-2+k*(PL*2+2+i0)/5;s+=line([sg*(GX+i0),y,zR],[sg*(GX+o0),y,zR],'#aab6c4',.6,'opacity=".55"')}});
  s+=`<polyline points="${pts([[-GX-o0,-PL-2,zR],[-GX-o0,GY+o0,zR],[GX+o0,GY+o0,zR],[GX+o0,-PL-2,zR]])}" fill="none" stroke="#d7e0ea" stroke-width="1.1" opacity=".7"/>`;
  // Videowürfel
  const vb=[[-13,GY+i0+2,zR+1],[13,GY+i0+2,zR+1],[13,GY+i0+2,zR+11],[-13,GY+i0+2,zR+11]];
  s+=poly(vb,'#06080c','stroke="#8d99a8" stroke-width=".8"');
  {const m=P(0,GY+i0+2,zR+6);s+=`<text x="${m[0]}" y="${m[1]+3}" text-anchor="middle" font-family="Barlow Condensed,sans-serif" font-weight="800" font-size="${9*m[2]}" fill="${lum(c)<.3?l:c}">2 : 1</text>`}
  // Flutlicht-Ring unter dem Dach (Hexenkessel 2) bzw. dezente Lichter
  for(let k=0;k<=10;k++){const x=-GX-i0+k*(2*(GX+i0))/10,p=P(x,GY+i0,zR-.5);
   s+=`<circle cx="${p[0]}" cy="${p[1]}" r="${(h==2?7:3.5)*p[2]}" fill="url(#${u}glow)"/>`}
  [-1,1].forEach(sg=>{for(let k=0;k<=5;k++){const y=-PL+k*(PL*2+i0)/5,p=P(sg*(GX+i0),y,zR-.5);s+=`<circle cx="${p[0]}" cy="${p[1]}" r="${(h==2?7:3.5)*p[2]}" fill="url(#${u}glow)"/>`}});
  if(h==2){[-1,1].forEach(sg=>{s+=poly([[sg*(GX+i0),PL,zR],[sg*(GX+i0),-PL,zR],[sg*PW*.4,-PL*.6,0],[sg*PW*.4,PL*.6,0]],`url(#${u}beam)`)})}
 } else if(h==2){
  // Lichtkegel von den Masten
  [-1,1].forEach(sg=>{s+=poly([[sg*(GX+24),GY+24,58],[sg*(GX+24)-sg*6,GY+24,58],[sg*PW*.2,-PL,0],[sg*PW*.8,PL*.2,0]],`url(#${u}beam)`)});
 }
 // Vordere Bande + Unterkante (Schnitt durch die Haupttribüne)
 s+=poly([[-PW-2,-PL-3,0],[PW+2,-PL-3,0],[PW+2,-PL-3,1.3],[-PW-2,-PL-3,1.3]],bandC);
 for(let k=0;k<8;k++){const f0=k/8+.02,A=lerp3([-PW-2,-PL-3,.6],[PW+2,-PL-3,.6],f0),B=lerp3([-PW-2,-PL-3,.6],[PW+2,-PL-3,.6],f0+.07);s+=line(A,B,bandL,1,'opacity=".8"')}
 s+=poly([[-GX-OUT,-GY,0],[GX+OUT,-GY,0],[GX+OUT,-GY-30,0],[-GX-OUT,-GY-30,0]],t?dd:conc2);
 s+=poly([[-GX-OUT,-GY,0],[GX+OUT,-GY,0],[GX+OUT,-GY,-2],[-GX-OUT,-GY,-2]],t?d:conc1);
 // Vordere Masten
 if(h==2&&!G.roof){[[-GX-26,-GY-4],[GX+26,-GY-4]].forEach(([x,y])=>{s+=line([x,y,0],[x,y,52],'#7b8592',2.2)+poly([[x-6,y,50],[x+6,y,50],[x+6,y,55],[x-6,y,55]],'#e9eef4');const p=P(x,y,53);s+=`<circle cx="${p[0]}" cy="${p[1]}" r="${22*p[2]}" fill="url(#${u}glow)"/>`})}
 return s+`</svg>`;
}


// ---- Öffentliche Helfer -------------------------------------------------------------------
export const teamWappen = (farbIdx, groesse) => crest(farbIdx, groesse);
export const WAPPEN_NAME = WAPPEN.map((w) => w.name);
export const arenaSvg = (farbIdx, tribuene, hexenkessel) => stadion(farbIdx, tribuene, hexenkessel);
