// Direkte Eingabe in Buchstabenfelder (Blitzquiz-Wort, Länderumrisse).
// Ein unsichtbares Eingabefeld sammelt die Tastatur-Eingabe, die Kästchen der
// Reihe zeigen die getippten Buchstaben an. Ein Tipp auf die Reihe öffnet die
// Tastatur. Die Kästchen müssen data-kasten="1" tragen (optional data-hinweis
// = aufgedeckter Buchstabe), Lücken/Bindestriche sind alle anderen Kinder.
export function bindeBuchstabenEingabe({ reihe, eingabe, istBuchstabe }) {
  eingabe.setAttribute("autocomplete", "off");
  eingabe.setAttribute("autocorrect", "off");
  eingabe.setAttribute("autocapitalize", "off");
  eingabe.setAttribute("spellcheck", "false");
  eingabe.setAttribute("enterkeyhint", "send");

  const aktiv = () => eingabe.classList.contains("tipp-versteckt");
  const kaesten = () => [...reihe.querySelectorAll("[data-kasten]")];

  // Aufgedeckte Hinweis-Buchstaben bleiben stehen: getippt wird nur in die
  // noch freien Kästchen (von links nach rechts), aufgedeckte werden übersprungen.
  const freie = () => kaesten().filter((k) => !k.dataset.hinweis);

  function getippt() {
    const max = freie().length;
    const b = [...eingabe.value].filter(istBuchstabe).slice(0, max).join("");
    if (aktiv() && b !== eingabe.value) eingabe.value = b;
    return [...b];
  }

  function zeichne() {
    if (!aktiv()) return;
    const t = getippt();
    const fokus = document.activeElement === eingabe && !eingabe.disabled;
    let n = 0;
    kaesten().forEach((k) => {
      if (k.dataset.hinweis) {
        k.textContent = k.dataset.hinweis;
        k.classList.remove("tipp-getippt", "tipp-cursor");
        return;
      }
      const buchstabe = t[n];
      k.textContent = buchstabe ? buchstabe.toUpperCase() : "";
      k.classList.toggle("tipp-getippt", Boolean(buchstabe));
      k.classList.toggle("tipp-cursor", fokus && n === t.length);
      n++;
    });
  }

  // Antwort inkl. aufgedeckter Buchstaben und der sichtbaren Lücken
  // (Leerzeichen, Bindestriche) an der richtigen Stelle.
  function antwort() {
    const t = getippt();
    let n = 0, out = "";
    for (const c of reihe.children) {
      if (c.dataset.kasten) {
        if (c.dataset.hinweis) out += c.dataset.hinweis;
        else if (n < t.length) out += t[n++];
        else break;
      } else {
        out += c.textContent;
      }
    }
    return out.trim();
  }

  eingabe.addEventListener("input", zeichne);
  eingabe.addEventListener("focus", zeichne);
  eingabe.addEventListener("blur", zeichne);
  reihe.addEventListener("click", () => {
    if (aktiv() && !eingabe.disabled) eingabe.focus();
  });
  return { zeichne, antwort };
}
