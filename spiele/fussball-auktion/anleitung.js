// ============================================================================
//  Länderspiel - animierte Spielanleitung
// ----------------------------------------------------------------------------
//  Ein Overlay mit mehreren Szenen, das sich beim allerersten Öffnen des Spiels
//  von selbst abspielt (danach über den "Spielanleitung"-Knopf abrufbar).
//  Die Szenen nutzen die echten Karten des Spiels und lesen die Regelwerte
//  (Münzen, Rundenzahl, Boni) aus logik.js - ändert sich dort etwas, stimmt
//  die Anleitung automatisch mit. Nur die erklärenden Texte stehen hier.
//
//  Gesteuert wird über das Ende der Fortschritts-Animation (animationend): so
//  lässt sich per "Pause" alles gemeinsam anhalten (CSS animation-play-state).
// ============================================================================
import {
  STARTMUENZEN, MAX_KARTEN_PRO_SPIELER, ANZAHL_GEBOTSRUNDEN, ANZAHL_SPIELRUNDEN, LAENDER_BONI
} from "./logik.js?v=257";

const SPEICHER_KEY = "fa_anleitung_raum";

// Pro Raum (und Gerät) nur einmal automatisch zeigen.
export function anleitungFuerRaumGezeigt(raumCode) {
  try { return localStorage.getItem(SPEICHER_KEY) === String(raumCode); } catch { return false; }
}
function merkeGezeigt(raumCode) {
  try { if (raumCode) localStorage.setItem(SPEICHER_KEY, String(raumCode)); } catch { /* ohne Speicher: dann halt jedes Mal */ }
}

const KURZ = {
  SCH: "Schuss", PAS: "Pass", TEC: "Technik", VER: "Verteidigung", GES: "Tempo", SPI: "Spielverständnis"
};
const FLAGGEN = {
  Italien: "🇮🇹", Frankreich: "🇫🇷", Argentinien: "🇦🇷", "Türkei": "🇹🇷", Brasilien: "🇧🇷",
  Japan: "🇯🇵", Deutschland: "🇩🇪", Nigeria: "🇳🇬"
};

// d = Verzögerung in Sekunden für die Einblend-Animation
const ein = (d = 0, klasse = "") => `class="fa-anl-ein ${klasse}" style="animation-delay:${d}s"`;

function karte(kartenHtml, id, optionen, breite = 128, extra = "") {
  return `<div class="fa-anl-karte ${extra}" style="width:${breite}px">${kartenHtml(id, optionen)}</div>`;
}

// ----------------------------------------------------------------------------
//  Szenen
// ----------------------------------------------------------------------------
function szenen(kh) {
  const boni = (kat, n) => ({ boni: { [kat]: n }, extra: 0 });

  return [
    {
      titel: "Worum geht's?",
      dauer: 11000,
      html: () => `
        <div class="fa-anl-faecher">
          ${karte(kh, "it-3", {}, 118, "fa-anl-f1")}
          ${karte(kh, "ar-3", {}, 118, "fa-anl-f2")}
          ${karte(kh, "jp-1", {}, 118, "fa-anl-f3")}
        </div>
        <p ${ein(0.2)}>Du ersteigerst Fußballer, stellst dir damit ein Team zusammen und trittst in <strong>${ANZAHL_SPIELRUNDEN} Spielrunden</strong> gegen deine Freunde an.</p>
        <p ${ein(0.8)}><strong>Wer am Ende die meisten Punkte hat, gewinnt.</strong></p>
        <div class="fa-anl-phasen">
          <span ${ein(1.4)}>1 · Auktion</span>
          <span ${ein(2.0)}>2 · Länderboni</span>
          <span ${ein(2.6)}>3 · Spielrunden</span>
        </div>`
    },
    {
      titel: "Münzen und Karten",
      dauer: 11000,
      html: () => `
        <div ${ein(0, "fa-anl-muenzen")}>
          <div class="fa-anl-muenze">🪙</div>
          <div class="fa-anl-zahl">${STARTMUENZEN}</div>
        </div>
        <p ${ein(0.5)}>Jeder startet mit <strong>${STARTMUENZEN} Münzen</strong>. Das ist dein Budget für die <em>gesamte</em> Auktion - es gibt kein Nachfüllen.</p>
        <div class="fa-anl-slots">
          ${Array.from({ length: MAX_KARTEN_PRO_SPIELER }, (_, i) => `<span class="fa-anl-slot" style="animation-delay:${1.2 + i * 0.5}s">${i + 1}</span>`).join("")}
        </div>
        <p ${ein(1.0)}>Du kannst höchstens <strong>${MAX_KARTEN_PRO_SPIELER} Karten</strong> besitzen.</p>
        <p ${ein(3.2)}>Die Auktion hat <strong>${ANZAHL_GEBOTSRUNDEN} Gebotsrunden</strong>. In jeder Runde liegen so viele Karten zur Auswahl, wie Spieler mitmachen.</p>`
    },
    {
      titel: "Verdeckt bieten",
      dauer: 13000,
      html: () => `
        <p ${ein(0)}>Alle sehen dieselben Karten und bieten <strong>gleichzeitig und verdeckt</strong> Münzen darauf.</p>
        <div class="fa-anl-gebote">
          <div ${ein(0.7, "fa-anl-gebot")}>${karte(kh, "fr-3", {}, 74)}<span class="fa-anl-eingabe">12</span></div>
          <div ${ein(1.3, "fa-anl-gebot")}>${karte(kh, "de-2", {}, 74)}<span class="fa-anl-eingabe">0</span></div>
          <div ${ein(1.9, "fa-anl-gebot")}>${karte(kh, "jp-2", {}, 74)}<span class="fa-anl-eingabe fa-anl-hoch">20</span></div>
        </div>
        <p ${ein(2.8, "fa-anl-summe")}>Summe deiner Gebote: <strong>32</strong> / ${STARTMUENZEN} Münzen</p>
        <p ${ein(3.6)}>Alle Gebote einer Runde zusammen dürfen deine Münzen <strong>nicht übersteigen</strong> - auch wenn du nicht jede Karte gewinnst.</p>
        <p ${ein(4.4)}>Ein Gebot von <strong>0</strong> heißt: Diese Karte interessiert dich nicht.</p>`
    },
    {
      titel: "Wer bekommt die Karte?",
      dauer: 15000,
      html: () => `
        <p ${ein(0)}>Das <strong>höchste Gebot</strong> gewinnt die Karte und zahlt genau diesen Betrag.</p>
        <div ${ein(0.8, "fa-anl-stechen")}>
          <div class="fa-anl-ring"><span class="fa-anl-ring-zahl">10</span></div>
          <div>
            <strong>Gleichstand = Stechen!</strong><br>
            Wer gleichauf liegt, hat <strong>10 Sekunden</strong> zum Erhöhen. Jedes neue Gebot startet den Timer neu. Läuft er ab, entscheidet das <strong>Los</strong> unter den Führenden.
          </div>
        </div>
        <ul class="fa-anl-liste">
          <li ${ein(2.0)}>Gleichstand bei <strong>0 Münzen</strong>: niemand hat geboten, die Karte bleibt übrig.</li>
          <li ${ein(2.8)}>Wer schon <strong>${MAX_KARTEN_PRO_SPIELER} Karten</strong> hat, bietet nicht mehr mit.</li>
          <li ${ein(3.6)}>Nach Runde ${ANZAHL_GEBOTSRUNDEN} kommen alle <strong>unverkauften Karten</strong> noch einmal in eine Bonusrunde.</li>
        </ul>`
    },
    {
      titel: "Länderboni",
      dauer: 13000,
      html: () => `
        <p ${ein(0)}>Besitzt du <strong>mehrere Spieler desselben Landes</strong>, bekommst du einen Bonus. Je mehr, desto stärker - ab 2 Karten.</p>
        <div class="fa-anl-vorher-nachher">
          <div class="fa-anl-paar fa-anl-vorher">
            ${karte(kh, "it-1", {}, 104)}${karte(kh, "it-2", {}, 104)}
          </div>
          <div class="fa-anl-paar fa-anl-nachher">
            ${karte(kh, "it-1", { bonus: boni("VER", 2) }, 104)}${karte(kh, "it-2", { bonus: boni("VER", 2) }, 104)}
          </div>
        </div>
        <p ${ein(3.4)}><strong>Beispiel:</strong> Zwei Italiener = Verteidigung <strong>+2</strong> auf <em>beiden</em> Karten. Bei drei Italienern wären es +3 usw. (bis +5).</p>
        <p ${ein(4.4, "fa-anl-klein")}>Den Bonus siehst du direkt als grünes „+n“ auf der Karte.</p>`
    },
    {
      titel: "Alle Boni im Überblick",
      dauer: 13000,
      html: () => {
        const stats = Object.entries(LAENDER_BONI).filter(([, r]) => r.typ === "stat");
        return `
        <p ${ein(0)}>Mit <strong>n</strong> Spielern eines Landes (ab 2) bekommt jede dieser Karten:</p>
        <div class="fa-anl-kacheln">
          ${stats.map(([nation, regel], i) => `
            <div class="fa-anl-kachel" style="animation-delay:${0.5 + i * 0.35}s">
              <span class="fa-anl-flagge">${FLAGGEN[nation] ?? ""}</span>
              <span class="fa-anl-kachel-text"><strong>${nation}</strong><br>${KURZ[regel.kat]} +n</span>
            </div>`).join("")}
        </div>
        <div class="fa-anl-kacheln fa-anl-kacheln-sonder">
          <div class="fa-anl-kachel" style="animation-delay:${0.5 + stats.length * 0.35}s">
            <span class="fa-anl-flagge">${FLAGGEN.Deutschland}</span>
            <span class="fa-anl-kachel-text"><strong>Deutschland</strong><br>frei verteilbare Punkte</span>
          </div>
          <div class="fa-anl-kachel" style="animation-delay:${0.5 + (stats.length + 1) * 0.35}s">
            <span class="fa-anl-flagge">${FLAGGEN.Nigeria}</span>
            <span class="fa-anl-kachel-text"><strong>Nigeria</strong><br>Münzen zurück</span>
          </div>
        </div>
        <p ${ein(4.2, "fa-anl-klein")}>Die Boni sind kein Extra-Gegenstand: Sie ergeben sich automatisch aus den Karten, die du am Ende besitzt.</p>`;
      }
    },
    {
      titel: "Bonus Deutschland",
      dauer: 15000,
      html: () => `
        <p ${ein(0)}>Mit <strong>n deutschen Karten</strong> (ab 2) bekommst du <strong>n − 1 Punkte</strong>, die du frei verteilen darfst.</p>
        <div ${ein(0.8, "fa-anl-de-beispiel")}>
          <div>2 Deutsche → <strong>1</strong> Punkt</div>
          <div>3 Deutsche → <strong>2</strong> Punkte</div>
          <div>4 Deutsche → <strong>3</strong> Punkte</div>
        </div>
        <p ${ein(1.8)}>Jeder Punkt erhöht <strong>eine Fähigkeit</strong> einer deutschen Karte deiner Wahl um 1 - und zusätzlich die <strong>Gesamtstärke</strong> der Karte ein weiteres Mal.</p>
        <div ${ein(2.8, "fa-anl-gesamt")}>Gesamt <span>44</span> → <span class="fa-anl-neu">45</span> <b>+1</b></div>
        <p ${ein(3.6)}>Du wählst <strong>nach der Auktion</strong>, bevor die Spielrunden beginnen - dafür hast du <strong>30 Sekunden</strong>. Danach verteilt das Spiel die Punkte <strong>zufällig</strong>. Die Wahl gilt dann für das ganze Spiel.</p>
        <p ${ein(4.6, "fa-anl-klein")}>Die Gesamtstärke zählt nur bei Gleichstand in einer Runde. Die Fähigkeitspunkte wirken dagegen immer.</p>`
    },
    {
      titel: "Bonus Nigeria",
      dauer: 15000,
      html: () => `
        <p ${ein(0)}>Nigerianische Karten machen sich <strong>teilweise bezahlt</strong>: Du bekommst Münzen zurück - ein Anteil des Preises, den du für die Karte bezahlt hast.</p>
        <table ${ein(0.8, "fa-anl-tabelle")}>
          <tr><th>Nigerianer</th><td>2.</td><td>3.</td><td>4.</td><td>5.</td></tr>
          <tr><th>Erstattung</th><td>20 %</td><td>40 %</td><td>60 %</td><td>80 %</td></tr>
        </table>
        <div ${ein(1.8, "fa-anl-rueck")}>
          <span class="fa-anl-preis">Kartenpreis <strong>10</strong></span>
          <span class="fa-anl-pfeil">→ 20 %</span>
          <span class="fa-anl-muenze-fliegt">🪙</span><span class="fa-anl-muenze-fliegt fa-anl-m2">🪙</span>
          <span class="fa-anl-preis"><strong>+2</strong> zurück</span>
        </div>
        <ul class="fa-anl-liste">
          <li ${ein(2.6)}>Die Münzen kommen am <strong>Ende der Auktionsrunde</strong> zurück.</li>
          <li ${ein(3.4)}>Gezählt wird nach <strong>Besitz</strong>: Der 2. Nigerianer, den du besitzt, bringt 20 %.</li>
          <li ${ein(4.2)}>Gewinnst du zwei in einer Runde, bekommt die <strong>teurere</strong> Karte die höhere Stufe.</li>
          <li ${ein(5.0)}>Es wird <strong>kaufmännisch gerundet</strong>: 20 % von 13 sind 2,6 → 3 Münzen.</li>
        </ul>`
    },
    {
      titel: "Die Spielrunden",
      dauer: 13000,
      html: () => `
        <p ${ein(0)}>Jetzt spielst du deine Karten aus - <strong>${ANZAHL_SPIELRUNDEN} Runden</strong> lang.</p>
        <p ${ein(0.6)}>In jeder Runde werden <strong>zwei zufällige Fähigkeiten</strong> gezogen:</p>
        <div ${ein(1.2, "fa-anl-kategorien")}>
          <span class="fa-anl-kat">Schuss</span><span class="fa-anl-plus">+</span><span class="fa-anl-kat">Pass</span>
        </div>
        <div class="fa-anl-spielkarten">
          ${karte(kh, "br-2", { markierteKategorien: ["SCH", "PAS"] }, 108)}
          ${karte(kh, "ng-3", { markierteKategorien: ["SCH", "PAS"] }, 108)}
        </div>
        <p ${ein(2.4)}>Jeder spielt <strong>verdeckt eine Karte</strong>, die er noch nicht gespielt hat. Es zählt die <strong>Summe der beiden Werte</strong> - inklusive Länderboni.</p>`
    },
    {
      titel: "Punkte pro Runde",
      dauer: 15000,
      html: () => `
        <p ${ein(0)}>Alle Karten werden aufgedeckt und nach ihrer Summe sortiert. Beispiel mit vier Spielern:</p>
        <div class="fa-anl-rang">
          ${[
            ["Spieler A", 19, "+6", "fa-anl-top"],
            ["Spieler B", 14, "+2", ""],
            ["Spieler C", 12, "+1", ""],
            ["Spieler D", 9, "−2", "fa-anl-minus"]
          ].map(([n, s, p, k], i) => `
            <div class="fa-anl-rang-zeile ${k}" style="animation-delay:${0.8 + i * 0.7}s">
              <span class="fa-anl-rang-nr">${i + 1}.</span>
              <span class="fa-anl-rang-name">${n}</span>
              <span class="fa-anl-balken"><i style="--b:${s * 4.5}%;animation-delay:${1.0 + i * 0.7}s"></i></span>
              <span class="fa-anl-rang-sum">${s}</span>
              <span class="fa-anl-rang-pkt">${p}</span>
            </div>`).join("")}
        </div>
        <ul class="fa-anl-liste">
          <li ${ein(3.8)}>Letzter Platz: <strong>−2</strong>. Der Vorletzte bekommt <strong>1</strong>, jeder Platz weiter oben <strong>einen Punkt mehr</strong>.</li>
          <li ${ein(4.6)}>Der Beste bekommt zusätzlich <strong>+3 Bonuspunkte</strong>.</li>
          <li ${ein(5.4)}>Gleiche Summe? Dann gewinnt die Karte mit der höheren <strong>Gesamtstärke</strong>.</li>
        </ul>`
    },
    {
      titel: "Sieg und Tipps",
      dauer: 14000,
      last: true,
      html: () => `
        <div ${ein(0, "fa-anl-pokal")}>🏆</div>
        <p ${ein(0.6)}>Nach der letzten Runde gewinnt, wer die <strong>meisten Punkte</strong> gesammelt hat.</p>
        <ul class="fa-anl-liste">
          <li ${ein(1.4)}><strong>Teile deine Münzen ein.</strong> Sie müssen für alle ${ANZAHL_GEBOTSRUNDEN} Gebotsrunden reichen.</li>
          <li ${ein(2.2)}><strong>Denk in Ländern.</strong> Zwei passende Karten können mehr wert sein als eine einzelne Superkarte.</li>
          <li ${ein(3.0)}><strong>Auch Schwache zählen.</strong> Mit einem guten Länderbonus werden sie plötzlich stark.</li>
          <li ${ein(3.8)}><strong>Beobachte die anderen.</strong> Wer Italiener sammelt, will vermutlich Verteidigung.</li>
        </ul>
        <p ${ein(4.8, "fa-anl-klein")}>Diese Anleitung findest du jederzeit über „Spielanleitung“.</p>`
    }
  ];
}

// ----------------------------------------------------------------------------
//  Overlay
// ----------------------------------------------------------------------------
let offen = null;

export function zeigeAnleitung({ kartenHtml, raumCode }) {
  if (offen) return;
  merkeGezeigt(raumCode);
  const liste = szenen(kartenHtml);
  const reduziert = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let index = 0;
  let beendeSzene = null;
  let pausiert = reduziert;   // bei reduzierter Bewegung nicht automatisch weiter

  const wurzel = document.createElement("div");
  wurzel.className = "fa-anl";
  wurzel.setAttribute("role", "dialog");
  wurzel.setAttribute("aria-modal", "true");
  wurzel.setAttribute("aria-label", "Spielanleitung Länderspiel");
  wurzel.innerHTML = `
    <div class="fa-anl-kopf">
      <div class="fa-anl-fortschritt"></div>
      <button type="button" class="fa-anl-x" aria-label="Anleitung schließen">✕</button>
    </div>
    <div class="fa-anl-titel"></div>
    <div class="fa-anl-buehne" aria-live="polite"></div>
    <div class="fa-anl-fuss">
      <button type="button" class="fa-anl-nav" data-aktion="zurueck" aria-label="Zurück">‹</button>
      <button type="button" class="fa-anl-nav fa-anl-mitte" data-aktion="pause" aria-label="Pause"></button>
      <button type="button" class="fa-anl-nav" data-aktion="weiter" aria-label="Weiter">›</button>
    </div>`;
  document.body.appendChild(wurzel);
  document.body.classList.add("fa-anl-offen");
  offen = wurzel;

  const q = (s) => wurzel.querySelector(s);
  const fortschritt = q(".fa-anl-fortschritt");
  const pauseKnopf = q('[data-aktion="pause"]');

  function schliessen() {
    if (beendeSzene) { beendeSzene(); beendeSzene = null; }
    wurzel.remove();
    document.body.classList.remove("fa-anl-offen");
    document.removeEventListener("keydown", taste);
    offen = null;
  }

  function zeige(i) {
    index = Math.max(0, Math.min(liste.length - 1, i));
    const szene = liste[index];
    q(".fa-anl-titel").textContent = szene.titel;
    const buehne = q(".fa-anl-buehne");
    if (beendeSzene) { beendeSzene(); beendeSzene = null; }
    buehne.innerHTML = `<div class="fa-anl-szene">${szene.html()}</div>`;
    if (szene.start) beendeSzene = szene.start(buehne);
    buehne.scrollTop = 0;

    fortschritt.innerHTML = liste.map((_, k) => {
      const klasse = k < index ? "fa-anl-fertig" : (k === index ? "fa-anl-aktiv" : "");
      const stil = k === index && !reduziert ? ` style="animation-duration:${szene.dauer}ms"` : "";
      return `<span class="fa-anl-seg ${klasse}"><i${stil}></i></span>`;
    }).join("");
    const aktiv = fortschritt.querySelector(".fa-anl-aktiv i");
    if (aktiv && !reduziert) {
      aktiv.addEventListener("animationend", () => {
        if (index < liste.length - 1) zeige(index + 1);
      }, { once: true });
    } else if (aktiv) {
      aktiv.style.width = "100%";
    }
    // Letzte Szene: Knopf zum Abschließen
    if (szene.last) {
      const ende = document.createElement("button");
      ende.type = "button";
      ende.className = "fa-anl-fertig-knopf";
      ende.textContent = "Los geht's!";
      ende.addEventListener("click", schliessen);
      buehne.appendChild(ende);
    }
    q('[data-aktion="zurueck"]').disabled = index === 0;
    q('[data-aktion="weiter"]').disabled = index === liste.length - 1;
    uebernimmPause();
  }

  function uebernimmPause() {
    wurzel.classList.toggle("fa-anl-pausiert", pausiert);
    pauseKnopf.textContent = pausiert ? "▶ Weiter abspielen" : "❚❚ Pause";
    pauseKnopf.setAttribute("aria-label", pausiert ? "Abspielen" : "Pause");
  }

  function taste(e) {
    if (e.key === "Escape") schliessen();
    else if (e.key === "ArrowRight") zeige(index + 1);
    else if (e.key === "ArrowLeft") zeige(index - 1);
  }
  document.addEventListener("keydown", taste);

  wurzel.addEventListener("click", (e) => {
    const knopf = e.target.closest("[data-aktion],.fa-anl-x");
    if (!knopf) return;
    if (knopf.classList.contains("fa-anl-x")) return schliessen();
    const aktion = knopf.dataset.aktion;
    if (aktion === "weiter") zeige(index + 1);
    else if (aktion === "zurueck") zeige(index - 1);
    else if (aktion === "pause") { pausiert = !pausiert; uebernimmPause(); }
  });

  zeige(0);
}
