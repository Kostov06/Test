// Übersetzt die beiden geprüften Prototypen in decks/*.json.
// Die Farbwerte werden ausschließlich durchgereicht, nie umgerechnet.
// Der Lauf endet mit einer Gegenprobe: aus dem erzeugten JSON wird die
// Streifenliste zurückgerechnet und mit dem Prototyp verglichen.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const quellen = join(hier, "..", "quellen");
const ziel = join(hier, "..", "decks");

const lies = (datei) => {
  const html = readFileSync(join(quellen, datei), "utf8");
  const nimm = (name) => {
    const m = html.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
    if (!m) throw new Error(`${name} nicht in ${datei} gefunden`);
    return JSON.parse(m[1]);
  };
  return { karten: nimm("CARDS"), pale: nimm("PALE") };
};

const slug = (s) =>
  s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Kennung aus Name und Ort — der Ort entfällt, wenn er schon im Namen steckt
// (AGV München in München), damit keine Kennung wie agv-muenchen-muenchen
// entsteht. Kennungen sind dauerhaft: der Fortschritt hängt daran.
const kennung = (name, zusatz) => {
  const a = slug(name);
  const b = slug(String(zusatz));
  return a.includes(b) ? a : `${a}-${b}`;
};

const streifen = (hex, w) =>
  hex.map((farbe, i) => (w && w[i] !== 1 ? { farbe, breite: w[i] } : { farbe }));

// Zwei Bänder gelten als praktisch gleich, wenn die Breiten übereinstimmen und
// sich kein Kanal um mehr als 4 von 255 unterscheidet.
const kanaele = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const fastGleich = (a, b) => {
  if (a.hex.length !== b.hex.length) return false;
  const wa = a.w || a.hex.map(() => 1), wb = b.w || b.hex.map(() => 1);
  if (wa.some((x, i) => x !== wb[i])) return false;
  return a.hex.every((h, i) => {
    const [r1, g1, b1] = kanaele(h), [r2, g2, b2] = kanaele(b.hex[i]);
    return Math.abs(r1 - r2) <= 4 && Math.abs(g1 - g2) <= 4 && Math.abs(b1 - b2) <= 4;
  });
};

const bandSchluessel = (c) => JSON.stringify([c.hex, c.w || c.hex.map(() => 1)]);

// ---------------------------------------------------------------- SV
function sv() {
  const { karten, pale } = lies("sv-couleur.prototyp.html");

  // Exakt gleiche Bänder zu einer Karte mit mehreren Antworten zusammenlegen.
  const gruppen = new Map();
  for (const c of karten) {
    const k = bandSchluessel(c);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(c);
  }

  const roh = [...gruppen.values()].map((g) => {
    const farben = new Set(g.map((c) => c.farben));
    if (farben.size > 1) {
      throw new Error(`Gleiches Band, verschiedene Farbbeschreibung: ${[...farben].join(" / ")}`);
    }
    return { erst: g[0], gruppe: g };
  });

  const kartenNeu = roh.map(({ erst, gruppe }) => {
    // Hinweis auf ein anderes, praktisch nicht unterscheidbares Band.
    const zwillinge = roh
      .filter(({ erst: a }) => a !== erst && fastGleich(a, erst))
      .flatMap(({ gruppe: g }) => g.map((c) => `${c.name} (${c.ort})`));

    const karte = {
      id: kennung(erst.name, erst.ort),
      typ: "couleur",
      rev: 1,
      band: { streifen: streifen(erst.hex, erst.w) },
      farben: erst.farben,
      antworten: gruppe.map((c) => ({ name: c.name, ort: c.ort })),
    };
    if (zwillinge.length) {
      karte.notiz = `Praktisch dasselbe Band führt auch ${zwillinge.join(", ")}.`;
    }
    return karte;
  });

  return {
    schema: 1,
    id: "sv-couleur",
    titel: "Couleur des SV",
    untertitel: "Die aktiven Verbindungen des Sondershäuser Verbands",
    quelle: "quellen/sv-couleur.prototyp.html — Farben aus den Original-Wappen ausgelesen und geprüft",
    stand: "2026-09-07",
    helleFarben: pale,
    karten: kartenNeu,
  };
}

// ---------------------------------------------------------- Münster
function muenster() {
  const { karten, pale } = lies("muenster-couleur.prototyp.html");
  return {
    schema: 1,
    id: "muenster-couleur",
    titel: "Couleur in Münster",
    untertitel: "Die aktiven Verbindungen am Ort",
    quelle: "quellen/muenster-couleur.prototyp.html — Farben aus den Original-Wappen ausgelesen und geprüft",
    stand: "2026-09-07",
    helleFarben: pale,
    karten: karten.map((c) => ({
      id: kennung(c.eintraege[0].name, c.eintraege[0].jahr),
      typ: "couleur",
      rev: 1,
      band: { streifen: streifen(c.hex, c.w) },
      farben: c.farben,
      antworten: c.eintraege.map((e) => ({
        name: e.name,
        jahr: e.jahr,
        verband: e.verband,
        ...(e.anm ? { anmerkung: e.anm } : {}),
      })),
    })),
  };
}

// ------------------------------------------------------- Gegenprobe
function pruefe(stapel, datei) {
  const { karten } = lies(datei);
  const ausJson = stapel.karten.flatMap((k) => [
    k.band.streifen.map((s) => s.farbe).join(","),
    k.band.streifen.map((s) => s.breite ?? 1).join(","),
  ]);
  const ausProto = karten.flatMap((c) => [
    c.hex.join(","),
    (c.w || c.hex.map(() => 1)).join(","),
  ]);
  // Nach dem Zusammenlegen kann das JSON weniger Karten haben; jedes Band im
  // JSON muss aber wörtlich im Prototyp stehen, und jedes Band des Prototyps
  // muss im JSON vorkommen.
  for (let i = 0; i < ausJson.length; i += 2) {
    const paar = [ausJson[i], ausJson[i + 1]].join("|");
    const treffer = ausProto.some((_, j) =>
      j % 2 === 0 && [ausProto[j], ausProto[j + 1]].join("|") === paar);
    if (!treffer) throw new Error(`Band nicht im Prototyp: ${paar}`);
  }
  for (let j = 0; j < ausProto.length; j += 2) {
    const paar = [ausProto[j], ausProto[j + 1]].join("|");
    const treffer = ausJson.some((_, i) =>
      i % 2 === 0 && [ausJson[i], ausJson[i + 1]].join("|") === paar);
    if (!treffer) throw new Error(`Band des Prototyps fehlt im JSON: ${paar}`);
  }
  const antworten = stapel.karten.reduce((n, k) => n + k.antworten.length, 0);
  if (antworten !== karten.reduce((n, c) => n + (c.eintraege ? c.eintraege.length : 1), 0)) {
    throw new Error("Anzahl der Bünde stimmt nach der Migration nicht mehr");
  }
  console.log(`${stapel.id}: ${stapel.karten.length} Karten, ${antworten} Bünde — Bänder identisch`);
}

const a = sv(), b = muenster();
pruefe(a, "sv-couleur.prototyp.html");
pruefe(b, "muenster-couleur.prototyp.html");
for (const s of [a, b]) {
  writeFileSync(join(ziel, `${s.id}.json`), JSON.stringify(s, null, 2) + "\n");
}
