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
  STARTMUENZEN, MAX_KARTEN_PRO_SPIELER, ANZAHL_GEBOTSRUNDEN, ANZAHL_SPIELRUNDEN, LAENDER_BONI, BONUS_MUENZEN_SPIELPHASE, ABZUG_ZUFALLSKARTE
} from "./logik.js?v=276";

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
      dauer: 14000,
      html: () => `
        <div ${ein(0, "fa-anl-muenzen")}>
          <div class="fa-anl-muenze"><span class="fa-muenze"></span></div>
          <div class="fa-anl-zahl">${STARTMUENZEN}</div>
        </div>
        <p ${ein(0.5)}>Jeder startet mit <strong>${STARTMUENZEN} Münzen</strong>. Das ist dein Budget für die <em>gesamte</em> Auktion - es gibt kein Nachfüllen.</p>
        <div class="fa-anl-slots">
          ${Array.from({ length: MAX_KARTEN_PRO_SPIELER }, (_, i) => `<span class="fa-anl-slot" style="animation-delay:${1.2 + i * 0.5}s">${i + 1}</span>`).join("")}
        </div>
        <p ${ein(1.0)}>Du kannst höchstens <strong>${MAX_KARTEN_PRO_SPIELER} Karten</strong> besitzen.</p>
        <p ${ein(3.2)}>Die Auktion hat <strong>${ANZAHL_GEBOTSRUNDEN} Gebotsrunden</strong>. In jeder Runde liegen so viele Karten zur Auswahl, wie Spieler mitmachen.</p>
        <p ${ein(4.6)}>Was du nicht ausgibst, <strong>nimmst du mit</strong> in die Spielrunden - dort bekommt jeder noch <strong>+${BONUS_MUENZEN_SPIELPHASE} Münzen</strong> dazu.</p>`
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
      dauer: 17000,
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
          <li ${ein(4.4)}>Bleibt danach noch etwas übrig, wird es <strong>zufällig verteilt</strong> - am Ende hat jeder genau ${MAX_KARTEN_PRO_SPIELER} Karten. Dafür gibt es pro geschenkter Karte <strong>${ABZUG_ZUFALLSKARTE} Bonusmünzen weniger</strong> in den Spielrunden.</li>
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
            <span class="fa-anl-kachel-text"><strong>Deutschland</strong><br>immer +(n−1) in der Runde</span>
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
      dauer: 14000,
      html: () => `
        <p ${ein(0)}>Mit <strong>n deutschen Karten</strong> (ab 2) bekommt in <strong>jeder Spielrunde jede deutsche Karte +(n − 1)</strong> - automatisch, du musst nichts auswählen.</p>
        <p ${ein(0.8)}>Der Bonus landet auf der entscheidenden Fähigkeit mit den <strong>meisten Münzen</strong>. Beispiel: 3 deutsche Karten = <strong>+2</strong> pro Karte, hier in einer Runde mit <strong>Schuss + Pass</strong> (Schuss hat die meisten Münzen):</p>
        <div class="fa-anl-vorher-nachher">
          <div class="fa-anl-paar fa-anl-vorher">
            ${karte(kh, "de-3", { markierteKategorien: ["SCH", "PAS"] }, 92)}${karte(kh, "de-4", { markierteKategorien: ["SCH", "PAS"] }, 92)}${karte(kh, "de-5", { markierteKategorien: ["SCH", "PAS"] }, 92)}
          </div>
          <div class="fa-anl-paar fa-anl-nachher">
            ${karte(kh, "de-3", { markierteKategorien: ["SCH", "PAS"], bonus: boni("SCH", 2) }, 92)}${karte(kh, "de-4", { markierteKategorien: ["SCH", "PAS"], bonus: boni("SCH", 2) }, 92)}${karte(kh, "de-5", { markierteKategorien: ["SCH", "PAS"], bonus: boni("SCH", 2) }, 92)}
          </div>
        </div>
        <p ${ein(3.6)}>Der Bonus steht direkt auf der Karte, sobald die Fähigkeiten der Runde feststehen - und gilt in <strong>jeder</strong> Spielrunde neu.</p>
        <p ${ein(4.6, "fa-anl-klein")}>Anders als bei den anderen Ländern wirkt dieser Bonus immer, auch wenn „seine“ Fähigkeit nicht gezogen wird. Dafür wirkt er nur in Runden, in denen du eine deutsche Karte ausspielst.</p>`
    },
    {
      titel: "Bonus Nigeria",
      dauer: 16000,
      html: () => `
        <p ${ein(0)}>Nigerianische Karten machen sich <strong>teilweise bezahlt</strong>: Du bekommst Münzen zurück - ein Anteil des Preises, den du für die Karte bezahlt hast.</p>
        <table ${ein(0.8, "fa-anl-tabelle")}>
          <tr><th>Nigerianer</th><td>2.</td><td>3.</td><td>4.</td><td>5.</td></tr>
          <tr><th>Erstattung</th><td>30 %</td><td>50 %</td><td>75 %</td><td>100 %</td></tr>
        </table>
        <div ${ein(1.8, "fa-anl-rueck")}>
          <span class="fa-anl-preis">Kartenpreis <strong>10</strong></span>
          <span class="fa-anl-pfeil">→ 30 %</span>
          <span class="fa-anl-muenze-fliegt"><span class="fa-muenze"></span></span><span class="fa-anl-muenze-fliegt fa-anl-m2"><span class="fa-muenze"></span></span><span class="fa-anl-muenze-fliegt fa-anl-m2"><span class="fa-muenze"></span></span>
          <span class="fa-anl-preis"><strong>+3</strong> zurück</span>
        </div>
        <ul class="fa-anl-liste">
          <li ${ein(2.6)}>Die Münzen kommen am <strong>Ende der Auktionsrunde</strong> zurück.</li>
          <li ${ein(3.4)}>Gezählt wird nach <strong>Besitz</strong>: Der 2. Nigerianer, den du besitzt, bringt 30 %.</li>
          <li ${ein(4.2)}>Gewinnst du zwei in einer Runde, bekommt die <strong>teurere</strong> Karte die höhere Stufe.</li>
          <li ${ein(5.0)}>Es wird <strong>kaufmännisch gerundet</strong>: 30 % von 13 sind 3,9 → 4 Münzen.</li>
          <li ${ein(5.8)}>Zurückbekommene Münzen sind auch in den <strong>Spielrunden</strong> nützlich - dort setzt du sie auf Fähigkeiten.</li>
        </ul>`
    },
    {
      titel: "Die Spielrunden",
      dauer: 14000,
      html: () => `
        <p ${ein(0)}>Jetzt geht es in <strong>${ANZAHL_SPIELRUNDEN} Spielrunden</strong> um die Punkte. Jede Runde hat zwei Schritte.</p>
        <p ${ein(0.7)}><strong>① Erst die Karte:</strong> Jeder wählt <strong>verdeckt</strong> eine Karte, die er noch nicht gespielt hat.</p>
        <div class="fa-anl-spielkarten">
          ${karte(kh, "br-2", {}, 108)}
          ${karte(kh, "ng-3", {}, 108)}
        </div>
        <p ${ein(2.6)}><strong>② Dann die Münzen:</strong> Du setzt deine Münzen auf die 6 Fähigkeiten. So bestimmen alle gemeinsam, worauf es in dieser Runde ankommt.</p>
        <p ${ein(3.8, "fa-anl-klein")}>Zum Start der Spielrunden hast du deine übrigen Auktionsmünzen <strong>plus ${BONUS_MUENZEN_SPIELPHASE}</strong>.</p>`
    },
    {
      titel: "Münzen setzen",
      dauer: 18000,
      html: () => `
        <p ${ein(0)}>Die <strong>zwei Fähigkeiten mit den meisten Münzen</strong> entscheiden die Runde. Beispiel - alle Einsätze zusammen:</p>
        <div class="fa-anl-rang">
          ${[
            ["Schuss", 14, true], ["Pass", 9, true], ["Technik", 9, true],
            ["Verteidigung", 4, false], ["Tempo", 2, false], ["Spielverst.", 0, false]
          ].map(([n, s, w], i) => `
            <div class="fa-anl-rang-zeile fa-anl-faeh ${w ? "fa-anl-top" : ""}" style="animation-delay:${0.6 + i * 0.5}s">
              <span class="fa-anl-rang-nr"></span>
              <span class="fa-anl-rang-name">${n}</span>
              <span class="fa-anl-balken"><i style="--b:${s * 6.5}%;animation-delay:${0.8 + i * 0.5}s"></i></span>
              <span class="fa-anl-rang-sum">${s}</span>
              <span class="fa-anl-rang-pkt">${w ? "✓" : ""}</span>
            </div>`).join("")}
        </div>
        <ul class="fa-anl-liste">
          <li ${ein(4.0)}><strong>Gleichstand um Platz 2?</strong> Dann zählen <strong>alle</strong> gleichauf liegenden Fähigkeiten - hier also drei.</li>
          <li ${ein(5.0)}>Für jede Karte zählt die <strong>Summe aller entscheidenden Fähigkeiten</strong> - inklusive Länderboni.</li>
          <li ${ein(6.0)}><strong>Bezahlt</strong> werden nur die Münzen auf entscheidenden Fähigkeiten. Münzen auf den anderen bekommst du <strong>zurück</strong>.</li>
          <li ${ein(7.0)}>Du kannst nie mehr setzen, als du hast.</li>
        </ul>`
    },
    {
      titel: "Punkte pro Runde",
      dauer: 15000,
      html: () => `
        <p ${ein(0)}>Alle Karten werden aufgedeckt und nach ihrer Summe sortiert. Beispiel mit vier Spielern:</p>
        <div class="fa-anl-rang">
          ${[
            ["Spieler A", 19, "+5", "fa-anl-top"],
            ["Spieler B", 14, "+2", ""],
            ["Spieler C", 12, "+1", ""],
            ["Spieler D", 9, "−1", "fa-anl-minus"]
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
          <li ${ein(3.8)}>Letzter Platz: <strong>−1</strong>. Der Vorletzte bekommt <strong>1</strong>, jeder Platz weiter oben <strong>einen Punkt mehr</strong>.</li>
          <li ${ein(4.6)}>Der Beste bekommt zusätzlich <strong>+2 Bonuspunkte</strong>.</li>
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
          <li ${ein(1.4)}><strong>Teile deine Münzen ein.</strong> Sie müssen für alle ${ANZAHL_GEBOTSRUNDEN} Gebotsrunden <em>und</em> die Spielrunden reichen. Nach der letzten Runde sind sie nichts mehr wert.</li>
          <li ${ein(2.2)}><strong>Denk in Ländern.</strong> Zwei passende Karten können mehr wert sein als eine einzelne Superkarte.</li>
          <li ${ein(3.0)}><strong>Münzen sind Mitspracherecht.</strong> Wer viele setzt, lenkt die Runde auf die Fähigkeiten seiner Karte.</li>
          <li ${ein(3.8)}><strong>Beobachte die anderen.</strong> Wer Italiener sammelt, setzt vermutlich auf Verteidigung.</li>
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
