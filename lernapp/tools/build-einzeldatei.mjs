// Backt App und Stapel in eine lernapp.html, die man verschicken und per
// Doppelklick öffnen kann.
//
// Warum nicht einfach alle Module als <script type="module"> einhängen:
// unter file:// scheitert jeder relative import. Deshalb übersetzt dieses
// Skript die Module in eine Registry — jedes Modul wird eine Funktion, die
// ihre Exporte zurückgibt, jeder Import ein Zugriff darauf. Das deckt genau
// die Formen ab, die diese App benutzt; alles andere bricht den Build ab,
// statt still etwas Kaputtes zu erzeugen.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (...p) => readFileSync(join(wurzel, ...p), "utf8");

// Reihenfolge = Abhängigkeitsreihenfolge.
const MODULE = [
  "src/dom.js", "src/schema.js", "src/store.js", "src/leitner.js", "src/decks.js",
  "src/sitzung.js", "src/stats.js", "src/karten/couleur.js", "src/karten/frage.js",
  "src/karten/begriff.js", "src/karten/lueckentext.js", "src/karten/reihenfolge.js",
  "src/karten/index.js", "src/redaktion.js", "src/main.js",
];

const aufloesen = (von, ziel) => posix.normalize(posix.join(posix.dirname(von), ziel));

const IMPORT_NAMEN = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?\s*$/;
const IMPORT_STERN = /^import\s*\*\s*as\s+(\w+)\s+from\s*"([^"]+)";?\s*$/;
const REEXPORT = /^export\s*\{([^}]*)\}\s*from\s*"([^"]+)";?\s*$/;
const EXPORT_DEKL = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)/;

function uebersetze(pfad, quelle) {
  const zeilen = quelle.split("\n");
  const kopf = [];
  const koerper = [];
  const exporte = [];

  for (const zeile of zeilen) {
    let m;
    if ((m = zeile.match(IMPORT_NAMEN))) {
      const namen = m[1].split(",").map((s) => s.trim()).filter(Boolean)
        .map((s) => (s.includes(" as ") ? s.replace(/\s+as\s+/, ": ") : s));
      kopf.push(`  const { ${namen.join(", ")} } = __hole(${JSON.stringify(aufloesen(pfad, m[2]))});`);
    } else if ((m = zeile.match(IMPORT_STERN))) {
      kopf.push(`  const ${m[1]} = __hole(${JSON.stringify(aufloesen(pfad, m[2]))});`);
    } else if ((m = zeile.match(REEXPORT))) {
      const ziel = JSON.stringify(aufloesen(pfad, m[2]));
      for (const roh of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        const [quelleName, alsName] = roh.split(/\s+as\s+/).map((s) => s.trim());
        exporte.push(`  __exporte[${JSON.stringify(alsName || quelleName)}] = __hole(${ziel})[${JSON.stringify(quelleName)}];`);
      }
    } else if ((m = zeile.match(EXPORT_DEKL))) {
      koerper.push(zeile.replace(/^export\s+/, ""));
      exporte.push(`  __exporte[${JSON.stringify(m[1])}] = ${m[1]};`);
    } else if (/^\s*export\s/.test(zeile)) {
      throw new Error(`${pfad}: unbekannte export-Form — „${zeile.trim()}“`);
    } else if (/^\s*import\s/.test(zeile)) {
      throw new Error(`${pfad}: unbekannte import-Form — „${zeile.trim()}“`);
    } else {
      koerper.push(zeile);
    }
  }

  return `__module[${JSON.stringify(pfad)}] = function (__hole) {
  const __exporte = {};
${kopf.join("\n")}
${koerper.join("\n")}
${exporte.join("\n")}
  return __exporte;
};`;
}

const manifest = JSON.parse(lies("decks", "index.json"));
const stapel = manifest.stapel.map((id) => JSON.parse(lies("decks", `${id}.json`)));

const registry = `(function () {
  "use strict";
  const __module = {};
  const __fertig = {};
  function __hole(pfad) {
    if (!(pfad in __fertig)) {
      if (!(pfad in __module)) throw new Error("Modul fehlt im Build: " + pfad);
      __fertig[pfad] = __module[pfad](__hole);
    }
    return __fertig[pfad];
  }
${MODULE.map((p) => uebersetze(p, lies(p))).join("\n")}
  __hole("src/main.js");
})();`;

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#e9e6dc">
<title>Ältestenrat — Lernstoff</title>
<style>
${lies("assets", "styles.css")}</style>
</head>
<body>
<main id="app"></main>
<script>
// Einzeldatei-Fassung: die Stapel liegen hier drin, nichts wird nachgeladen.
// Gebaut mit tools/build-einzeldatei.mjs — Änderungen gehören in decks/ und src/.
window.STAPEL_EINGEBETTET = ${JSON.stringify(stapel)};
</script>
<script>
${registry}
</script>
</body>
</html>
`;

writeFileSync(join(wurzel, "lernapp.html"), html);
console.log(`lernapp.html: ${stapel.length} Stapel, ` +
  `${stapel.reduce((n, s) => n + s.karten.length, 0)} Karten, ` +
  `${(Buffer.byteLength(html) / 1024).toFixed(0)} kB`);
