// Version erhöhen:  node tools/bump.mjs        (aktuelle Version + 1)
//                   node tools/bump.mjs 480    (bestimmte Nummer)
// Setzt sw.js, app.js und spiele/register.js gemeinsam und startet danach die Prüfung.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const w = new URL("..", import.meta.url).pathname;
const lies = (p) => readFileSync(w + p, "utf8");
const jetzt = Number(lies("app.js").match(/APP_VERSION\s*=\s*"v(\d+)"/)[1]);
const neu = Number(process.argv[2] || jetzt + 1);
if (!Number.isInteger(neu) || neu <= 0) { console.error("Ungültige Versionsnummer"); process.exit(1); }

const ersetze = (pfad, muster, ersatz) => {
  const text = lies(pfad);
  if (!muster.test(text)) { console.error("Version nicht gefunden in " + pfad); process.exit(1); }
  writeFileSync(w + pfad, text.replace(muster, ersatz));
};
ersetze("sw.js", /(CACHE_NAME\s*=\s*"trollhouse-v)\d+(")/, `$1${neu}$2`);
ersetze("app.js", /(APP_VERSION\s*=\s*"v)\d+(")/, `$1${neu}$2`);
ersetze("spiele/register.js", /(SPIEL_VERSION\s*=\s*")\d+(")/, `$1${neu}$2`);
console.log(`Version: v${jetzt} -> v${neu}`);
execFileSync(process.execPath, [w + "tools/pruefen.mjs"], { stdio: "inherit" });
