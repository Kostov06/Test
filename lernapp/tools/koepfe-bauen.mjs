// Schneidet die Köpfe aus „Open Peeps“ heraus und legt sie als Datenmodul
// src/koepfe.js ab.
//
// Open Peeps von Pablo Stanley (openpeeps.com) steht unter CC0 1.0, ist also
// gemeinfrei. Erzeugt werden die Köpfe mit @dicebear/collection — das ist ein
// reines Bauwerkzeug: die App selbst bekommt davon nichts ab, sie liest nur
// die fertigen Pfade. Deshalb läuft sie weiter ohne Netz und ohne Pakete.
//
// Einmalig vorbereiten und laufen lassen:
//   npm install @dicebear/core @dicebear/collection
//   node tools/koepfe-bauen.mjs
//
// Das Ergebnis ist eingecheckt; dieser Schritt ist nur nötig, wenn Frisuren
// dazukommen sollen.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { createAvatar } = await import("@dicebear/core");
const sammlung = await import("@dicebear/collection");

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");

// Die Hautfarbe wird beim Erzeugen gesetzt und danach wieder zu einem
// Platzhalter gemacht — so bleibt sie zur Laufzeit frei wählbar.
const HAUT_MARKE = "#abcdef";
const PLATZHALTER = "{{HAUT}}";
const HAAR_PLATZHALTER = "{{HAAR}}";

// In der Vorlage ist das Haar schwarz gefüllt — genau wie die Gesichtszüge.
// Trennen lassen sie sich über den Aufbau: Schädel und Haar stecken in der
// Gruppe mit der matrix()-Transformation, die Gesichtszüge in eigenen
// Gruppen mit translate() daneben. Alles Schwarze in der Kopfgruppe ist
// also Haar. Dazu die natürlichen Haarfarben der Vorlage.
const NATUERLICHE_HAARFARBEN = ["#b58143", "#e8e1e1", "#d2b48c"];

// Die Kopfgruppe herausgreifen und darin das Schwarz färbbar machen.
function haarFaerbbar(svg) {
  const anfang = svg.search(/<g transform="matrix\([^"]*\)"\s*>/);
  if (anfang < 0) return { svg, haarPfade: 0 };
  const start = svg.indexOf(">", anfang) + 1;
  let tiefe = 1, i = start;
  const teile = svg.slice(start).split(/(<\/?g[^>]*>)/);
  let pos = start, ende = -1;
  for (const tok of teile) {
    if (/^<g/.test(tok)) tiefe++;
    else if (/^<\/g/.test(tok)) { tiefe--; if (tiefe === 0) { ende = pos; break; } }
    pos += tok.length;
  }
  if (ende < 0) return { svg, haarPfade: 0 };

  let kopf = svg.slice(start, ende);
  let haarPfade = 0;
  kopf = kopf.replace(/fill="#000"/g, () => { haarPfade++; return `fill="${HAAR_PLATZHALTER}"`; });
  for (const farbe of NATUERLICHE_HAARFARBEN) {
    if (kopf.includes(farbe)) { haarPfade++; kopf = kopf.split(farbe).join(HAAR_PLATZHALTER); }
  }
  return { svg: svg.slice(0, start) + kopf + svg.slice(ende), haarPfade };
}

// Ausgewählt aus den 48 Varianten: was als Frisur taugt und sauber zeichnet.
const AUSWAHL = [
  ["short1", "Kurz"], ["short2", "Kurz, rund"], ["short3", "Kurz, gelockt"],
  ["short4", "Undercut"], ["shortComplete", "Igel"], ["pomp", "Tolle"],
  ["mohawk", "Irokese"], ["mohawk2", "Irokese, breit"],
  ["bangs", "Pony"], ["bangs2", "Bob"], ["bantuKnots", "Bantu-Knoten"],
  ["long", "Lang"], ["long2", "Lang, offen"], ["longAfro", "Afro, lang"],
  ["afro", "Afro"], ["bun", "Dutt mit Tuch"], ["bun2", "Dutt"],
  ["buns", "Zwei Dutts"], ["curly", "Locken"], ["curly2", "Locken, kurz"],
  ["dreads1", "Dreads"], ["dreads2", "Dreads, lang"],
  ["flatTop", "Flattop"], ["flatTopLong", "Flattop, hoch"],
  ["grayBun", "Dutt, grau"], ["grayMedium", "Mittellang, grau"],
  ["grayShort", "Kurz, grau"], ["hatHip", "Hut"], ["hijab", "Hidschab"],
  ["medium1", "Mittellang"], ["medium2", "Mittellang, gewellt"],
  ["medium3", "Mittellang, Scheitel"], ["mediumBangs", "Mittellang mit Pony"],
  ["mediumStraight", "Mittellang, glatt"], ["noHair1", "Glatze"],
  ["shortCurly", "Kurz, kraus"], ["shortMessy", "Zerzaust"],
  ["shortWavy", "Kurz, wellig"], ["twists", "Twists"], ["twists2", "Twists, lang"],
];

// Die erste Untergruppe ist der Rumpf mit Hemd. Sie fliegt heraus; was
// bleibt, ist der Kopf.
function ohneRumpf(svg) {
  const nachMaske = svg.indexOf(">", svg.indexOf("<g mask=")) + 1;
  const teile = svg.slice(nachMaske).split(/(<\/?g[^>]*>)/);
  let tiefe = 0, pos = nachMaske, anfang = -1, ende = -1;
  for (const tok of teile) {
    if (/^<g/.test(tok)) { if (tiefe === 0) anfang = pos; tiefe++; }
    else if (/^<\/g/.test(tok)) { tiefe--; if (tiefe === 0) { ende = pos + tok.length; break; } }
    pos += tok.length;
  }
  if (anfang < 0 || ende < 0) throw new Error("Rumpfgruppe nicht gefunden");
  return svg.slice(0, anfang) + svg.slice(ende);
}

const innen = (svg) => {
  const a = svg.indexOf(">", svg.indexOf("<svg")) + 1;
  return svg.slice(a, svg.lastIndexOf("</svg>"));
};

const koepfe = [];
const verworfen = [];

for (const [id, name] of AUSWAHL) {
  let svg;
  try {
    svg = createAvatar(sammlung.openPeeps, {
      seed: "ingvaeonia", head: [id], face: ["smile"], skinColor: [HAUT_MARKE.slice(1)],
      accessoriesProbability: 0, facialHairProbability: 0, maskProbability: 0,
      backgroundColor: ["transparent"],
    }).toString();
  } catch (fehler) {
    verworfen.push([id, `kennt DiceBear nicht (${fehler.message.slice(0, 40)})`]);
    continue;
  }
  const ohne = ohneRumpf(svg);
  // Gegenprobe: ohne eine Hautfläche im Kopf ist die Variante unbrauchbar.
  // Vier der 48 zeichnen keinen Schädel und fielen sonst erst im Bild auf.
  const hautFlaechen = (ohne.match(new RegExp(HAUT_MARKE, "gi")) || []).length;
  if (hautFlaechen < 1) { verworfen.push([id, "zeichnet keinen Kopf"]); continue; }

  let koerper = innen(ohne)
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "")
    .replace(new RegExp(HAUT_MARKE, "gi"), PLATZHALTER);

  // Haar färbbar machen; die Gesichtszüge bleiben schwarz.
  const gefaerbt = haarFaerbbar(koerper);
  koerper = gefaerbt.svg;
  // Gegenprobe: die Gesichtszüge müssen noch da sein, sonst wäre das
  // Gesicht mitgefärbt worden.
  if (!/fill="#000"/.test(koerper)) {
    verworfen.push([id, "keine schwarzen Gesichtszüge mehr übrig"]); continue;
  }

  koerper = koerper.replace(/\s+/g, " ").trim();
  koepfe.push({ id, name, svg: koerper, faerbbar: gefaerbt.haarPfade > 0 });
}

const ausgabe = `// ERZEUGT von tools/koepfe-bauen.mjs — nicht von Hand ändern.
//
// Frisuren aus „Open Peeps“ von Pablo Stanley (https://www.openpeeps.com/),
// gemeinfrei unter CC0 1.0. Herausgeschnitten mit @dicebear/collection.
// ${PLATZHALTER} wird zur Laufzeit durch den gewählten Hautton ersetzt,
// ${HAAR_PLATZHALTER} durch die gewählte Haarfarbe. Die Gesichtszüge bleiben
// schwarz — sie sind bei jeder Frisur derselbe Pfad und daran erkennbar.
export const KOPF_ANSICHT = "0 0 704 704";
export const KOEPFE = ${JSON.stringify(koepfe, null, 1)};
`;
writeFileSync(join(wurzel, "src", "koepfe.js"), ausgabe);

console.log(`${koepfe.length} Frisuren nach src/koepfe.js geschrieben ` +
  `(${(Buffer.byteLength(ausgabe) / 1024).toFixed(0)} kB).`);
if (verworfen.length) {
  console.log("Verworfen:");
  for (const [id, warum] of verworfen) console.log(`  ${id}: ${warum}`);
}
