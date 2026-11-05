// Prüft das Projekt vor jedem Commit:  node tools/pruefen.mjs
// 1) Syntax aller JS-Dateien (außer mitgelieferte Bibliotheken in lib/)
// 2) JSON-Dateien gültig
// 3) Die drei Versionsstellen (sw.js, app.js, spiele/register.js) sind identisch
// 4) Jede Datei aus der Vorab-Liste DATEIEN in sw.js existiert wirklich
// Beendet mit Exit-Code 1, sobald etwas nicht stimmt.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const wurzel = new URL("..", import.meta.url).pathname;
const fehler = [];
const alleDateien = [];

(function lauf(ordner) {
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "Emojis" || e.name === "lib") continue;
    const pfad = join(ordner, e.name);
    if (e.isDirectory()) lauf(pfad); else alleDateien.push(pfad);
  }
})(wurzel);

const rel = (p) => p.slice(wurzel.length);

for (const f of alleDateien.filter((p) => p.endsWith(".js"))) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { fehler.push("Syntaxfehler in " + rel(f) + "\n" + String(e.stderr || e.message).split("\n").slice(0, 4).join("\n")); }
}
for (const f of alleDateien.filter((p) => p.endsWith(".json"))) {
  try { JSON.parse(readFileSync(f, "utf8")); } catch (e) { fehler.push("Ungültiges JSON: " + rel(f) + " (" + e.message + ")"); }
}

const sw = readFileSync(join(wurzel, "sw.js"), "utf8");
const app = readFileSync(join(wurzel, "app.js"), "utf8");
const reg = readFileSync(join(wurzel, "spiele/register.js"), "utf8");
const vSw = sw.match(/CACHE_NAME\s*=\s*"trollhouse-v(\d+)"/)?.[1];
const vApp = app.match(/APP_VERSION\s*=\s*"v(\d+)"/)?.[1];
const vReg = reg.match(/SPIEL_VERSION\s*=\s*"(\d+)"/)?.[1];
if (!(vSw && vSw === vApp && vApp === vReg)) fehler.push(`Versionen uneinheitlich: sw.js=${vSw} app.js=${vApp} register.js=${vReg}`);

const liste = sw.match(/const DATEIEN = \[([\s\S]*?)\n\];/);
if (!liste) fehler.push("DATEIEN-Liste in sw.js nicht gefunden");
else {
  const eintraege = [...liste[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const doppelt = eintraege.filter((x, i) => eintraege.indexOf(x) !== i);
  if (doppelt.length) fehler.push("Doppelte Einträge in DATEIEN: " + doppelt.join(", "));
  for (const eintrag of eintraege) {
    const datei = eintrag.split("?")[0];
    if (datei !== "./" && !existsSync(join(wurzel, datei))) fehler.push("In DATEIEN, aber nicht vorhanden: " + eintrag);
  }
  console.log(`DATEIEN: ${eintraege.length} Einträge geprüft`);
}

console.log(`${alleDateien.filter((p) => p.endsWith(".js")).length} JS-Dateien geprüft, Version v${vSw}`);
if (fehler.length) { console.error("\nFEHLER:\n- " + fehler.join("\n- ")); process.exit(1); }
console.log("Alles in Ordnung.");
