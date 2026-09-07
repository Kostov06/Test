// Prüft die Stapel gegen das Schema und die reine Logik gegen ihre Regeln.
// Der wichtigste Test ist der letzte: kein Farbwert darf sich gegenüber den
// geprüften Prototypen verschoben haben.
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pruefeStapel } from "../src/schema.js";
import { zerlege } from "../src/karten/lueckentext.js";
import { istRichtig, gruppen } from "../src/karten/reihenfolge.js";
import { ausSchnelleingabe } from "../src/redaktion.js";
import { INTERVALLE, FAECHER } from "../src/leitner.js";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");
const lies = (...p) => readFileSync(join(wurzel, ...p), "utf8");
const json = (...p) => JSON.parse(lies(...p));

let gelaufen = 0, gefallen = 0;
function pruefe(name, fn) {
  gelaufen++;
  try { fn(); } catch (e) { gefallen++; console.error(`FEHLT  ${name}\n       ${e.message}`); }
}
const gleich = (a, b, was) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${was || "ungleich"}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  }
};
const wahr = (b, was) => { if (!b) throw new Error(was || "sollte wahr sein"); };

// ------------------------------------------------------------- Die Stapel
const manifest = json("decks", "index.json");
const dateien = readdirSync(join(wurzel, "decks")).filter((f) => f.endsWith(".json") && f !== "index.json");

pruefe("Manifest und Verzeichnis decks/ stimmen überein", () => {
  gleich([...manifest.stapel].sort(), dateien.map((f) => f.replace(/\.json$/, "")).sort(),
    "Manifest gegen Dateien");
});

for (const id of manifest.stapel) {
  const stapel = json("decks", `${id}.json`);
  pruefe(`${id}: erfüllt das Schema`, () => {
    const fehler = pruefeStapel(stapel);
    wahr(fehler.length === 0, fehler.join("\n       "));
  });
  pruefe(`${id}: id im Kopf gleich Dateiname`, () => gleich(stapel.id, id, "Kopf-id"));
}

// ------------------------------------------------- Farbtreue zur Vorlage
function prototypKarten(datei) {
  const html = lies("quellen", datei);
  return JSON.parse(html.match(/const CARDS = (\[[\s\S]*?\]);/)[1]);
}
function baender(karten) {
  return karten.map((c) => [c.hex.join(","), (c.w || c.hex.map(() => 1)).join(",")].join("|")).sort();
}
function baenderAusStapel(stapel) {
  return stapel.karten.map((k) => [
    k.band.streifen.map((s) => s.farbe).join(","),
    k.band.streifen.map((s) => s.breite ?? 1).join(","),
  ].join("|")).sort();
}

for (const [id, datei] of [
  ["sv-couleur", "sv-couleur.prototyp.html"],
  ["muenster-couleur", "muenster-couleur.prototyp.html"],
]) {
  pruefe(`${id}: Farbbänder wörtlich wie im Prototyp`, () => {
    const stapel = json("decks", `${id}.json`);
    const ausProto = [...new Set(baender(prototypKarten(datei)))];
    gleich(baenderAusStapel(stapel), ausProto.sort(), "Bänder");
  });
  pruefe(`${id}: helleFarben wörtlich wie im Prototyp`, () => {
    const stapel = json("decks", `${id}.json`);
    const pale = JSON.parse(lies("quellen", datei).match(/const PALE = (\[[\s\S]*?\]);/)[1]);
    gleich(stapel.helleFarben, pale, "helleFarben");
  });
  pruefe(`${id}: kein Bund verloren gegangen`, () => {
    const stapel = json("decks", `${id}.json`);
    const proto = prototypKarten(datei);
    const ausProto = proto.flatMap((c) => c.eintraege ? c.eintraege.map((e) => e.name) : [c.name]).sort();
    const ausStapel = stapel.karten.flatMap((k) => k.antworten.map((a) => a.name)).sort();
    gleich(ausStapel, ausProto, "Bünde");
  });
  pruefe(`${id}: kein Band führt zwei getrennte Karten`, () => {
    const stapel = json("decks", `${id}.json`);
    const gesehen = new Set();
    for (const b of baenderAusStapel(stapel)) {
      wahr(!gesehen.has(b), `Band kommt doppelt vor: ${b}`);
      gesehen.add(b);
    }
  });
}

// ------------------------------------------------------------ Lückentext
pruefe("zerlege trennt Text und Lücken", () => {
  const t = zerlege("Frei ist das {{Herz}}, und frei das {{Lied|Liedchen}}.");
  gleich(t.map((x) => x.luecke), [false, true, false, true, false]);
  gleich(t[1].loesungen, ["Herz"]);
  gleich(t[3].loesungen, ["Lied", "Liedchen"]);
});
pruefe("zerlege kommt mit einer Lücke am Anfang zurecht", () => {
  const t = zerlege("{{Noch}} ist die blühende Zeit");
  gleich(t.map((x) => x.luecke), [true, false]);
});

// ----------------------------------------------------------- Reihenfolge
const ABLAUF = ["Eröffnung", "Begrüßung", ["Biermimik", "Spiele"], "Bierdorf"];
pruefe("istRichtig erkennt die richtige Reihenfolge", () =>
  wahr(istRichtig(ABLAUF, ["Eröffnung", "Begrüßung", "Biermimik", "Spiele", "Bierdorf"])));
pruefe("istRichtig lässt Vertauschen innerhalb einer Gruppe zu", () =>
  wahr(istRichtig(ABLAUF, ["Eröffnung", "Begrüßung", "Spiele", "Biermimik", "Bierdorf"])));
pruefe("istRichtig weist Vertauschen über Gruppengrenzen zurück", () =>
  wahr(!istRichtig(ABLAUF, ["Begrüßung", "Eröffnung", "Biermimik", "Spiele", "Bierdorf"])));
pruefe("istRichtig weist eine unvollständige Reihe zurück", () =>
  wahr(!istRichtig(ABLAUF, ["Eröffnung", "Begrüßung"])));
pruefe("gruppen macht aus jedem Element eine Gruppe", () =>
  gleich(gruppen(["a", ["b", "c"]]), [["a"], ["b", "c"]]));

// --------------------------------------------------------- Schnelleingabe
pruefe("Schnelleingabe liest alle vier Blockarten", () => {
  const { karten, fehler } = ausSchnelleingabe(`F: Wie eröffnet man?
A: So.
A: Oder so.

B: Farbenführend
D: Farben nur zu Anlässen.
N: Viele SV-Bünde.

L: Strophe 2
T: Frei ist das {{Herz}}.

R: Reihenfolge?
E: eins
E: zwei | zwo`);
  gleich(fehler, []);
  gleich(karten.map((k) => k.typ), ["frage", "begriff", "lueckentext", "reihenfolge"]);
  gleich(karten[0].antworten, ["So.", "Oder so."]);
  gleich(karten[1].notiz, "Viele SV-Bünde.");
  gleich(karten[3].elemente, ["eins", ["zwei", "zwo"]]);
});
pruefe("Schnelleingabe meldet einen Lückentext ohne Lücke", () => {
  const { fehler } = ausSchnelleingabe("L: Ohne\nT: kein Platzhalter hier");
  wahr(fehler.length === 1, `erwartete einen Fehler, bekam ${fehler.length}`);
});
pruefe("Schnelleingabe meldet einen unbekannten Blockanfang", () => {
  const { fehler } = ausSchnelleingabe("X: was auch immer");
  wahr(fehler.length === 1);
});

// ---------------------------------------------------- Schema-Gegenproben
const stapelMit = (karte) => ({ schema: 1, id: "probe", titel: "Probe", karten: [karte] });
pruefe("Schema beanstandet eine doppelte Karten-id", () => {
  const s = stapelMit({ id: "a", typ: "frage", rev: 1, frage: "F", antworten: ["A"] });
  s.karten.push({ ...s.karten[0] });
  wahr(pruefeStapel(s).some((f) => /doppelt/.test(f)));
});
pruefe("Schema beanstandet einen unbekannten Typ", () =>
  wahr(pruefeStapel(stapelMit({ id: "a", typ: "quiz", rev: 1 })).some((f) => /unbekannt/.test(f))));
pruefe("Schema beanstandet einen falschen Farbwert", () =>
  wahr(pruefeStapel(stapelMit({
    id: "a", typ: "couleur", rev: 1, farben: "rot",
    band: { streifen: [{ farbe: "rot" }, { farbe: "#ffffff" }] },
    antworten: [{ name: "X" }],
  })).some((f) => /Hex-Wert/.test(f))));
pruefe("Schema beanstandet eine Breite von 0", () =>
  wahr(pruefeStapel(stapelMit({
    id: "a", typ: "couleur", rev: 1, farben: "rot",
    band: { streifen: [{ farbe: "#ff0000", breite: 0 }, { farbe: "#ffffff" }] },
    antworten: [{ name: "X" }],
  })).some((f) => /breite/.test(f))));
pruefe("Schema beanstandet eine fehlende rev", () =>
  wahr(pruefeStapel(stapelMit({ id: "a", typ: "frage", frage: "F", antworten: ["A"] }))
    .some((f) => /rev/.test(f))));

// ---------------------------------------------------------------- Leitner
pruefe("Es gibt für jedes Fach ein Intervall", () => gleich(INTERVALLE.length, FAECHER));
pruefe("Die Intervalle wachsen", () =>
  wahr(INTERVALLE.every((n, i) => i === 0 || n > INTERVALLE[i - 1])));

// ------------------------------------------------- Service-Worker-Fassung
pruefe("sw.js trägt die Kennung des aktuellen Inhalts", () => {
  const { status, stderr } = spawnSync(process.execPath,
    [join(wurzel, "tools", "fassung-stempeln.mjs"), "--pruefe"], { encoding: "utf8" });
  wahr(status === 0, (stderr || "").trim());
});

console.log(`${gelaufen - gefallen} von ${gelaufen} Prüfungen bestanden.`);
process.exit(gefallen ? 1 : 0);
