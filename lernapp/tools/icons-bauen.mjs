// Erzeugt die App-Symbole aus dem Farbband des AMB Ingvaeonia.
// Die Werte sind die geprüften aus decks/muenster-couleur.json — das Symbol
// erfindet keine Farbe, es liest sie aus dem Stapel.
//
//   node tools/icons-bauen.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");
const stapel = JSON.parse(readFileSync(join(wurzel, "decks", "muenster-couleur.json"), "utf8"));
const karte = stapel.karten.find((k) => k.antworten.some((a) => a.name === "AMB Ingvaeonia"));
if (!karte) throw new Error("Ingvaeonia nicht im Münster-Stapel gefunden");

const streifen = karte.band.streifen.map((s) => ({
  rgb: [1, 3, 5].map((i) => parseInt(s.farbe.slice(i, i + 2), 16)),
  breite: s.breite ?? 1,
}));
const summe = streifen.reduce((n, s) => n + s.breite, 0);

const crcTabelle = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabelle[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(typ, daten) {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, "ascii");
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc(Buffer.concat([Buffer.from(typ, "ascii"), daten])), 0);
  return Buffer.concat([kopf, daten, pruef]);
}

function png(kante) {
  // Zeile für Zeile: welcher Streifen liegt auf dieser Höhe?
  const grenzen = [];
  let lauf = 0;
  for (const s of streifen) { lauf += s.breite; grenzen.push((lauf / summe) * kante); }

  const roh = Buffer.alloc(kante * (1 + kante * 3));
  let pos = 0, welcher = 0;
  for (let y = 0; y < kante; y++) {
    while (welcher < grenzen.length - 1 && y + 0.5 > grenzen[welcher]) welcher++;
    const [r, g, b] = streifen[welcher].rgb;
    roh[pos++] = 0;                       // Filter „none“
    for (let x = 0; x < kante; x++) { roh[pos++] = r; roh[pos++] = g; roh[pos++] = b; }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(kante, 0);
  ihdr.writeUInt32BE(kante, 4);
  ihdr[8] = 8;   // 8 Bit je Kanal
  ihdr[9] = 2;   // Echtfarbe
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(roh, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const kante of [180, 192, 512]) {
  const datei = join(wurzel, "assets", `icon-${kante}.png`);
  const daten = png(kante);
  writeFileSync(datei, daten);
  console.log(`assets/icon-${kante}.png — ${kante}×${kante}, ${(daten.length / 1024).toFixed(1)} kB`);
}
console.log("Farben aus:", karte.farben);
