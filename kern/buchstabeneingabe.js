// Direkte Eingabe in Buchstabenfelder (Blitzquiz-Wort, Länderumrisse).
// Ein unsichtbares Eingabefeld sammelt die Tastatur-Eingabe, die Kästchen der
// Reihe zeigen die getippten Buchstaben an. Ein Tipp auf die Reihe öffnet die
// Tastatur. Die Kästchen müssen data-kasten="1" tragen (optional data-hinweis
// = aufgedeckter Buchstabe), Lücken/Bindestriche sind alle anderen Kinder.
//
// Jeder getippte Buchstabe gehört fest zu SEINEM Kästchen (werte[index]):
//  - Ein Tipp auf ein Kästchen setzt den Cursor genau dorthin; der nächste
//    Buchstabe ersetzt den vorhandenen direkt (ohne vorher zu löschen).
//  - Wird ein Hinweis-Buchstabe aufgedeckt, ersetzt er einen dort getippten
//    Buchstaben; alle anderen getippten Buchstaben bleiben, wo sie sind.
// Das Eingabefeld enthält dauerhaft nur ein unsichtbares Zeichen (SENT), damit
// auch die Rücktaste auf leerem Feld ein input-Ereignis auslöst (iOS).
const SENT = "​";

export function bindeBuchstabenEingabe({ reihe, eingabe, istBuchstabe }) {
  eingabe.setAttribute("autocomplete", "off");
  eingabe.setAttribute("autocorrect", "off");
  eingabe.setAttribute("autocapitalize", "off");
  eingabe.setAttribute("spellcheck", "false");
  eingabe.setAttribute("enterkeyhint", "send");

  let werte = [];     // getippter Buchstabe je Kästchen ("" = leer)
  let cursor = 0;     // Index des aktiven Kästchens

  const aktiv = () => eingabe.classList.contains("tipp-versteckt");
  const kaesten = () => [...reihe.querySelectorAll("[data-kasten]")];
  const frei = (k) => !k.dataset.hinweis;

  function naechstesFreies(ks, ab, richtung = 1) {
    for (let i = ab; i >= 0 && i < ks.length; i += richtung) if (frei(ks[i])) return i;
    return -1;
  }

  function normalisiere(ks) {
    if (werte.length !== ks.length) werte = ks.map((_, i) => werte[i] ?? "");
    ks.forEach((k, i) => { if (!frei(k)) werte[i] = ""; });   // Hinweis ersetzt getippten Buchstaben
    cursor = Math.max(0, Math.min(cursor, ks.length - 1));
    if (ks[cursor] && !frei(ks[cursor])) {
      const v = naechstesFreies(ks, cursor, 1);
      const r = naechstesFreies(ks, cursor, -1);
      cursor = v >= 0 ? v : (r >= 0 ? r : cursor);
    }
  }

  function zeichne() {
    if (!aktiv()) return;
    const ks = kaesten();
    normalisiere(ks);
    const fokus = document.activeElement === eingabe && !eingabe.disabled;
    ks.forEach((k, i) => {
      if (!frei(k)) {
        k.textContent = k.dataset.hinweis;
        k.classList.remove("tipp-getippt", "tipp-cursor");
        return;
      }
      const b = werte[i];
      k.textContent = b ? b.toUpperCase() : "";
      k.classList.toggle("tipp-getippt", Boolean(b));
      k.classList.toggle("tipp-cursor", fokus && i === cursor);
    });
  }

  function tippe(b) {
    const ks = kaesten();
    normalisiere(ks);
    if (!ks.length || naechstesFreies(ks, 0, 1) < 0) return;
    if (!frei(ks[cursor])) return;
    werte[cursor] = b;
    const n = naechstesFreies(ks, cursor + 1, 1);
    if (n >= 0) cursor = n;
  }

  function loesche() {
    const ks = kaesten();
    normalisiere(ks);
    if (werte[cursor]) { werte[cursor] = ""; return; }
    const v = naechstesFreies(ks, cursor - 1, -1);
    if (v >= 0) { cursor = v; werte[cursor] = ""; }
  }

  function leereEingabefeld() {
    if (eingabe.value !== SENT) eingabe.value = SENT;
    try { eingabe.setSelectionRange(SENT.length, SENT.length); } catch { /* egal */ }
  }

  function beiEingabe() {
    if (!aktiv()) return;
    const v = eingabe.value;
    if (!v.includes(SENT)) loesche();   // Rücktaste hat das Zeichen entfernt
    else [...v].filter((c) => c !== SENT && istBuchstabe(c)).forEach(tippe);
    leereEingabefeld();
    zeichne();
  }

  eingabe.addEventListener("input", beiEingabe);
  eingabe.addEventListener("focus", () => { if (aktiv()) leereEingabefeld(); zeichne(); });
  eingabe.addEventListener("blur", zeichne);
  eingabe.addEventListener("keydown", (e) => {
    if (!aktiv()) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const ks = kaesten();
    const n = naechstesFreies(ks, cursor + (e.key === "ArrowRight" ? 1 : -1), e.key === "ArrowRight" ? 1 : -1);
    if (n >= 0) { cursor = n; zeichne(); }
    e.preventDefault();
  });
  reihe.addEventListener("click", (e) => {
    if (!aktiv() || eingabe.disabled) return;
    const ks = kaesten();
    const k = e.target.closest?.("[data-kasten]");
    const i = k ? ks.indexOf(k) : -1;
    if (i >= 0 && frei(ks[i])) cursor = i;   // genau dieses Kästchen bearbeiten
    eingabe.focus();
    leereEingabefeld();
    zeichne();
  });

  // Antwort inkl. aufgedeckter Buchstaben und der sichtbaren Lücken
  // (Leerzeichen, Bindestriche) an der richtigen Stelle. Leere Kästchen fehlen.
  function antwort() {
    const ks = kaesten();
    normalisiere(ks);
    let n = 0, out = "";
    for (const c of reihe.children) {
      if (c.dataset.kasten) {
        out += c.dataset.hinweis ? c.dataset.hinweis : (werte[n] ?? "");
        n++;
      } else {
        out += c.textContent;
      }
    }
    return out.trim();
  }

  // Neue Frage: alles zurücksetzen
  function reset() {
    werte = [];
    cursor = 0;
    eingabe.value = aktiv() ? SENT : "";
    zeichne();
  }

  return { zeichne, antwort, reset };
}
