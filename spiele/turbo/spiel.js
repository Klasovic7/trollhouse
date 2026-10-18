// ============================================================================
//  Turbo (Zeitjagd) - Einzelspieler-Prototyp
// ----------------------------------------------------------------------------
//  Das eigentliche Spiel (Three.js, 3D) liegt als eigene Seite in proto.html
//  und wird hier nur in die App eingebettet. Jede*r fährt für sich allein
//  auf derselben Strecke, es wird nichts im Raum synchronisiert. Später:
//  beste Rundenzeit pro Spieler in den Raum schreiben und als Wertung nutzen.
// ============================================================================
let api = null;
let rahmen = null;
let anpassen = null;

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  api.wurzel.innerHTML = '<iframe id="turbo-rahmen" title="Turbo" allow="autoplay; fullscreen" ' +
    'style="position:fixed;left:0;right:0;bottom:0;top:0;width:100%;border:0;background:#0a0e1a;z-index:3"></iframe>';
  rahmen = document.getElementById("turbo-rahmen");
  anpassen = () => {
    const leiste = document.getElementById("top-bar");
    const oben = leiste && !leiste.hidden ? Math.ceil(leiste.getBoundingClientRect().bottom) : 0;
    rahmen.style.top = oben + "px";
  };
  anpassen();
  window.addEventListener("resize", anpassen);
  setTimeout(anpassen, 300);
  rahmen.src = "spiele/turbo/proto.html?v=" + Date.now();
}

export function beenden() {
  if (anpassen) window.removeEventListener("resize", anpassen);
  if (rahmen) { rahmen.src = "about:blank"; rahmen.remove(); }
  rahmen = null; anpassen = null; api = null;
}

export function spieler() {}
export function raumDaten() {}
