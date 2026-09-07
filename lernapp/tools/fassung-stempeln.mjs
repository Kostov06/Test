// Stempelt eine Kennung aus dem Inhalt in sw.js.
//
// Der Service Worker liefert aus dem Cache aus. Ändert sich ein Stapel, ohne
// dass FASSUNG sich ändert, lernen die Neuen auf ihren Handys weiter die alte
// Fassung — und merken es nicht. Deshalb ist die Fassung nicht von Hand
// gepflegt, sondern ein Hash über genau die Dateien, die im Cache landen.
//
//   node tools/fassung-stempeln.mjs          stempelt
//   node tools/fassung-stempeln.mjs --pruefe  meldet nur, ob es stimmt (Tests)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFileSync(join(wurzel, p), "utf8");

const swQuelle = lies("sw.js");
// Die Dateiliste steht im Service Worker selbst — so kann sie nicht auseinanderlaufen.
const geruest = JSON.parse(
  swQuelle.match(/const GERUEST = (\[[\s\S]*?\]);/)[1].replace(/,(\s*\])/, "$1"));
const stapel = JSON.parse(lies("decks/index.json")).stapel.map((id) => `./decks/${id}.json`);

const hash = createHash("sha256");
for (const pfad of [...geruest, ...stapel].sort()) {
  if (pfad === "./") continue;                       // gleiche Datei wie ./index.html
  hash.update(pfad).update("\0").update(lies(pfad.replace(/^\.\//, ""))).update("\0");
}
// Der Service Worker selbst zählt mit, aber ohne die Zeile, die wir gleich ersetzen.
hash.update(swQuelle.replace(/const FASSUNG = "[^"]*";/, ""));

const neu = `aeltestenrat-${hash.digest("hex").slice(0, 12)}`;
const alt = swQuelle.match(/const FASSUNG = "([^"]*)";/)[1];

if (process.argv.includes("--pruefe")) {
  if (alt !== neu) {
    console.error(`sw.js ist nicht gestempelt: FASSUNG ist „${alt}“, müsste „${neu}“ sein.\n` +
      `Ohne den Stempel behalten schon installierte Handys die alte Fassung.\n` +
      `Beheben mit: node tools/fassung-stempeln.mjs`);
    process.exit(1);
  }
  console.log(`sw.js gestempelt auf ${neu}`);
} else {
  if (alt === neu) { console.log(`sw.js ist schon aktuell (${neu})`); }
  else {
    writeFileSync(join(wurzel, "sw.js"), swQuelle.replace(/const FASSUNG = "[^"]*";/, `const FASSUNG = "${neu}";`));
    console.log(`sw.js: ${alt} → ${neu}`);
  }
}
