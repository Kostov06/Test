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
import { INTERVALLE, FAECHER, stand, bewerte, istFaellig, hakt } from "../src/leitner.js";
import { GEGENSTAENDE, PLAETZE, RAENGE, rang, lohn, verbuche, kaufe, trage, held, ersetze,
         LOHN_FALSCH, SERIE_FUER_BONUS, SERIEN_BONUS, HAARFARBEN, haarfarbe,
         zuruecksetzen } from "../src/held.js";
import { eintraege, zuruecksetzen as fortschrittZuruecksetzen } from "../src/store.js";
import { KOEPFE } from "../src/koepfe.js";
import { moeglichkeiten } from "../src/karten/auswahl.js";
import { stimmt } from "../src/karten/lueckentext.js";

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
  // Ein Ablenker, der die richtige Antwort wiederholt, macht zwei Knöpfe
  // richtig — und die Auswahl hätte keine eindeutige Lösung mehr.
  pruefe(`${id}: kein Ablenker wiederholt seine eigene Antwort`, () => {
    for (const k of stapel.karten) {
      for (const a of k.ablenker || []) {
        wahr(a.trim() !== String(k.antwort || "").trim(),
          `${k.id}: Ablenker gleicht der Antwort`);
        wahr((k.ablenker || []).filter((x) => x.trim() === a.trim()).length === 1,
          `${k.id}: Ablenker „${a}“ steht doppelt`);
      }
    }
  });
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

// store.js fällt ohne localStorage auf einen Speicher im Arbeitsspeicher
// zurück — damit ist die Leitner-Logik hier prüfbar.
const einheit = (rev) => ({ schluessel: "probe/karte", karte: { rev } });

pruefe("Gewusst rückt ein Fach weiter, falsch setzt auf Fach 1 zurück", () => {
  const e = einheit(1);
  gleich(stand(e).fach, 1, "Startfach");
  bewerte(e, true);  gleich(stand(e).fach, 2, "nach einmal gewusst");
  bewerte(e, true);  gleich(stand(e).fach, 3, "nach zweimal gewusst");
  bewerte(e, false); gleich(stand(e).fach, 1, "nach falsch");
  gleich(stand(e).richtig, 2, "gezählte Treffer");
  gleich(stand(e).falsch, 1, "gezählte Fehler");
});

pruefe("Fach 5 ist die Obergrenze", () => {
  const e = einheit(1);
  for (let i = 0; i < 10; i++) bewerte(e, true);
  gleich(stand(e).fach, FAECHER);
});

pruefe("Eine falsch beantwortete Karte ist sofort wieder fällig", () => {
  const e = einheit(1);
  bewerte(e, false);
  wahr(istFaellig(stand(e)), "sollte heute fällig sein");
  wahr(hakt(stand(e)), "sollte als „hakt“ gelten");
});

pruefe("Eine gewusste Karte ist heute nicht mehr fällig", () => {
  const e = einheit(1);
  bewerte(e, true);
  wahr(!istFaellig(stand(e)), "Fach 2 heißt: frühestens morgen wieder");
});

pruefe("Ein neuer rev wirft die Karte zurück in Fach 1", () => {
  const e = einheit(1);
  for (let i = 0; i < 4; i++) bewerte(e, true);
  gleich(stand(e).fach, FAECHER, "erst einmal in Fach 5");
  // Dieselbe Karte, aber der Inhalt wurde korrigiert.
  const korrigiert = einheit(2);
  gleich(stand(korrigiert).fach, 1, "nach der Korrektur");
  wahr(istFaellig(stand(korrigiert)), "und sofort wieder fällig");
});

pruefe("Ein gleich gebliebener rev lässt den Fortschritt in Ruhe", () => {
  const e = { schluessel: "probe/ruhig", karte: { rev: 3 } };
  bewerte(e, true); bewerte(e, true);
  gleich(stand({ schluessel: "probe/ruhig", karte: { rev: 3 } }).fach, 3);
});

// ------------------------------------------- Vollständigkeit der Listen
// Ein neues Modul muss in beide Listen eingetragen werden, sonst fehlt es
// in der Einzeldatei oder im Offline-Cache — und das merkt man erst im
// Browser. Diese Prüfung hat genau das einmal gefangen.
pruefe("Jedes Modul steht im Einzeldatei-Build und im Service Worker", () => {
  const bau = lies("tools", "build-einzeldatei.mjs");
  const sw = lies("sw.js");
  const module = [];
  const lauf = (verzeichnis) => {
    for (const eintrag of readdirSync(join(wurzel, verzeichnis), { withFileTypes: true })) {
      const pfad = `${verzeichnis}/${eintrag.name}`;
      if (eintrag.isDirectory()) lauf(pfad);
      else if (eintrag.name.endsWith(".js")) module.push(pfad);
    }
  };
  lauf("src");
  const fehlend = module.filter((m) => !bau.includes(`"${m}"`) || !sw.includes(`"./${m}"`));
  wahr(fehlend.length === 0, `nicht eingetragen: ${fehlend.join(", ")}`);
});

pruefe("Die App bringt keine Paketabhängigkeit mit", () => {
  const sichtbar = readdirSync(wurzel);
  wahr(!sichtbar.includes("node_modules"), "node_modules gehört nicht ins Repo");
  wahr(!sichtbar.includes("package.json"), "die App soll ohne Paketdatei laufen");
});

// ------------------------------------------------- Service-Worker-Fassung
pruefe("sw.js trägt die Kennung des aktuellen Inhalts", () => {
  const { status, stderr } = spawnSync(process.execPath,
    [join(wurzel, "tools", "fassung-stempeln.mjs"), "--pruefe"], { encoding: "utf8" });
  wahr(status === 0, (stderr || "").trim());
});

// ------------------------------------------------------- Held und Münzen
pruefe("Jeder Gegenstand liegt auf einem bekannten Platz", () => {
  const plaetze = new Set(PLAETZE.map((p) => p.id));
  for (const g of GEGENSTAENDE) wahr(plaetze.has(g.platz), `${g.id}: Platz „${g.platz}“ gibt es nicht`);
});

pruefe("Jeder Gegenstand hat Name, Beschreibung und Preis", () => {
  for (const g of GEGENSTAENDE) {
    wahr(g.name && g.beschreibung, `${g.id}: Name oder Beschreibung fehlt`);
    wahr(Number.isInteger(g.preis) && g.preis >= 0, `${g.id}: Preis ist keine ganze Zahl ab 0`);
  }
});

pruefe("Die Kennungen der Gegenstände sind eindeutig", () => {
  const gesehen = new Set();
  for (const g of GEGENSTAENDE) {
    wahr(!gesehen.has(g.id), `${g.id} kommt doppelt vor`);
    gesehen.add(g.id);
  }
});

pruefe("Die erbeutete Fahne ist das teuerste Stück", () => {
  const teuerste = [...GEGENSTAENDE].sort((a, b) => b.preis - a.preis)[0];
  gleich(teuerste.platz, "trophaee", "teuerster Platz");
  const andere = GEGENSTAENDE.filter((g) => g.platz !== "trophaee").map((g) => g.preis);
  wahr(teuerste.preis > Math.max(...andere), "Trophäe muss teurer sein als alles andere");
});

pruefe("Man kann am ersten Tag nichts kaufen außer der Startkleidung", () => {
  const umsonst = GEGENSTAENDE.filter((g) => g.preis === 0).map((g) => g.id);
  gleich(umsonst.sort(), ["chino-beige", "hemd-weiss", "socken-weiss"].sort());
});

pruefe("Der Lohn sinkt, je besser eine Karte schon sitzt", () => {
  const loehne = [1, 2, 3, 4, 5].map(lohn);
  wahr(loehne.every((n, i) => i === 0 || n < loehne[i - 1]), `Löhne: ${loehne.join(", ")}`);
  wahr(Math.min(...loehne) >= 1, "nie unter einer Münze");
});

pruefe("Auch eine falsche Antwort zahlt — sonst lügt man sich selbst an", () => {
  wahr(LOHN_FALSCH >= 1, "Falsch muss mehr als nichts bringen");
  wahr(LOHN_FALSCH < lohn(5), "aber weniger als die billigste richtige Antwort");
});

pruefe("Münzen werden gezählt und der Serienbonus greift", () => {
  ersetze({ angelegt: true, name: "Probe" });
  for (let i = 0; i < SERIE_FUER_BONUS - 1; i++) verbuche(true, 1);
  const vorBonus = held().muenzen;
  const letzte = verbuche(true, 1);
  gleich(letzte.bonus, SERIEN_BONUS, "Bonus bei voller Serie");
  gleich(held().muenzen, vorBonus + lohn(1) + SERIEN_BONUS, "Kontostand");
});

pruefe("Eine falsche Antwort reißt die Serie ab", () => {
  ersetze({ angelegt: true });
  verbuche(true, 1); verbuche(true, 1);
  verbuche(false, 1);
  gleich(held().serie, 0);
});

pruefe("Kaufen zieht ab, zweimal kaufen geht nicht, zu arm auch nicht", () => {
  ersetze({ angelegt: true, muenzen: 200 });
  const schuhe = GEGENSTAENDE.find((g) => g.id === "bootsschuhe");
  const teuer = [...GEGENSTAENDE].sort((a, b) => b.preis - a.preis)[0];
  wahr(kaufe(schuhe), "Bootsschuhe sollten bezahlbar sein");
  gleich(held().muenzen, 200 - schuhe.preis, "Kontostand nach dem Kauf");
  wahr(!kaufe(schuhe), "zweimal dasselbe Stück darf nicht gehen");
  wahr(!kaufe(teuer), "zu teuer darf nicht gehen");
  wahr(held().getragen.schuhe === "bootsschuhe", "Gekauftes wird gleich getragen");
});

pruefe("Pflichtplätze lassen sich wechseln, aber nicht leeren", () => {
  ersetze({ angelegt: true, muenzen: 500 });
  const hemd = GEGENSTAENDE.find((g) => g.id === "hemd-weiss");
  trage(hemd);
  gleich(held().getragen.oberteil, "hemd-weiss", "Hemd bleibt an");
  const krawatte = GEGENSTAENDE.find((g) => g.art === "krawatte");
  kaufe(krawatte);
  trage(krawatte);
  gleich(held().getragen.hals, null, "Krawatte lässt sich ablegen");
});

pruefe("Bei Krawatte, Anzug und Kleid gibt es etwas zu wählen", () => {
  for (const art of ["krawatte", "anzug", "kleid"]) {
    const n = GEGENSTAENDE.filter((g) => g.art === art).length;
    wahr(n >= 3, `nur ${n} Stück der Art „${art}“ — da ist nichts auszusuchen`);
  }
});

pruefe("Die Bundesfarben hängen am Zipfelbund, nicht an der Krawatte", () => {
  const zipfel = GEGENSTAENDE.find((g) => g.art === "zipfelbund");
  wahr(/Bundesfarben/.test(zipfel.name), "Zipfelbund führt die Farben");
  for (const k of GEGENSTAENDE.filter((g) => g.art === "krawatte")) {
    wahr(!/Bundesfarben/.test(k.name), `${k.id} sollte keine Bundesfarben tragen`);
  }
});

pruefe("Jedes Stück sagt, wie es gezeichnet wird", () => {
  for (const g of GEGENSTAENDE) wahr(g.art, `${g.id}: art fehlt`);
});

// ------------------------------------------------- Lage der richtigen Wahl
// Die Sorge ist berechtigt: bei maschinell gebauten Multiple-Choice-Fragen
// steht die richtige Antwort oft auffällig oft an derselben Stelle. Hier
// wird nachgezählt statt behauptet.
pruefe("Die richtige Antwort landet gleich oft auf jedem Platz", () => {
  const stapel = json("decks", "muenster-couleur.json");
  const karte = stapel.karten[0];
  const einheit = { stapel, karte };
  const richtig = karte.antworten.map((a) => a.name).join(" / ");
  const textVon = (k) => k.antworten.map((a) => a.name).join(" / ");

  const DURCHLAEUFE = 20000;
  const zaehler = [0, 0, 0, 0];
  let anzahlFalsch = 0;
  for (let i = 0; i < DURCHLAEUFE; i++) {
    const wahl = moeglichkeiten(einheit, richtig, textVon, 4);
    if (wahl.length !== 4) anzahlFalsch++;
    const platz = wahl.findIndex((m) => m.richtig);
    if (platz < 0 || wahl.filter((m) => m.richtig).length !== 1) anzahlFalsch++;
    zaehler[platz]++;
  }
  gleich(anzahlFalsch, 0, "jede Wahl hat vier Möglichkeiten und genau eine richtige");

  const erwartet = DURCHLAEUFE / 4;
  // Chi-Quadrat über drei Freiheitsgrade: 16,27 ist die Schranke für 0,1 %.
  // Eine Gleichverteilung reißt sie nur in einem von tausend Läufen.
  const chi = zaehler.reduce((summe, n) => summe + (n - erwartet) ** 2 / erwartet, 0);
  const anteile = zaehler.map((n) => (n / DURCHLAEUFE * 100).toFixed(1) + " %");
  wahr(chi < 16.27, `Plätze: ${anteile.join(", ")} — Chi-Quadrat ${chi.toFixed(1)}, zu ungleich`);
});

pruefe("Lange Antworten bekommen weniger Möglichkeiten", () => {
  const stapel = json("decks", "ingvaeonia-geschichte.json");
  const lang = stapel.karten.find((k) => k.typ === "frage" && k.antworten[0].length > 120);
  const kurz = stapel.karten.find((k) => k.gruppe === "jahr");
  if (lang) {
    const w = moeglichkeiten({ stapel, karte: lang }, lang.antworten[0], (k) => k.antworten[0]);
    gleich(w.length, 3, "lange Antwort");
  }
  const w2 = moeglichkeiten({ stapel, karte: kurz }, kurz.antworten[0], (k) => k.antworten[0]);
  gleich(w2.length, 4, "kurze Antwort");
});

pruefe("Die Ablenker sind alle verschieden und keiner ist die Lösung", () => {
  const stapel = json("decks", "begriffe.json");
  for (const karte of stapel.karten) {
    const wahl = moeglichkeiten({ stapel, karte }, karte.definition, (k) => k.definition);
    if (!wahl) continue;
    const texte = wahl.map((m) => m.text);
    gleich(texte.length, new Set(texte).size, `${karte.id}: doppelte Möglichkeit`);
    gleich(wahl.filter((m) => m.richtig).length, 1, `${karte.id}: nicht genau eine richtige`);
  }
});

pruefe("Ablenker kommen aus derselben Gruppe", () => {
  const stapel = json("decks", "ingvaeonia-geschichte.json");
  const jahresKarte = stapel.karten.find((k) => k.gruppe === "jahr");
  const jahre = new Set(stapel.karten.filter((k) => k.gruppe === "jahr").map((k) => k.antworten[0]));
  for (let i = 0; i < 200; i++) {
    const wahl = moeglichkeiten({ stapel, karte: jahresKarte }, jahresKarte.antworten[0],
      (k) => k.antworten[0], 4);
    for (const m of wahl) {
      wahr(jahre.has(m.text), `„${m.text}“ ist keine Jahreszahl aus dem Dokument`);
    }
  }
});

pruefe("Die Jahreskarten fragen das Ereignis, nicht das Datum", () => {
  const stapel = json("decks", "ingvaeonia-geschichte.json");
  const jahresKarten = stapel.karten.filter((k) => k.gruppe === "jahr");
  wahr(jahresKarten.length >= 15, `nur ${jahresKarten.length} Jahreskarten`);
  for (const k of jahresKarten) {
    wahr(k.antworten.length === 1, `${k.id}: genau eine Antwort nötig`);
    wahr(/\d{4}/.test(k.antworten[0]), `${k.id}: Antwort „${k.antworten[0]}“ ist kein Datum`);
    wahr(!/^\d/.test(k.frage), `${k.id}: Frage fängt mit einer Zahl an — vermutlich nicht gedreht`);
  }
});

// -------------------------------------------------------- Lückentext-Prüfung
pruefe("Eingetippte Lücken werden nachsichtig, aber nicht blind verglichen", () => {
  wahr(stimmt("herz", ["Herz"]), "Großschreibung darf egal sein");
  wahr(stimmt("  Herz, ", ["Herz"]), "Leerzeichen und Komma am Rand auch");
  wahr(stimmt("Liedchen", ["Lied", "Liedchen"]), "jede Alternative gilt");
  wahr(!stimmt("heisst", ["heißt"]), "ß gegen ss ist nicht dasselbe");
  wahr(!stimmt("", ["Herz"]), "leer ist falsch");
  wahr(!stimmt("Kopf", ["Herz"]), "falsch ist falsch");
});

// ---------------------------------------------------------------- Köpfe
pruefe("Es gibt genug Frisuren zur Auswahl", () =>
  wahr(KOEPFE.length >= 20, `nur ${KOEPFE.length} Frisuren`));

pruefe("Jede Frisur hat Kennung, Namen und Zeichnung", () => {
  for (const k of KOEPFE) {
    wahr(k.id && k.name, `Frisur ohne Kennung oder Namen: ${JSON.stringify(k).slice(0, 60)}`);
    wahr(k.svg && k.svg.length > 200, `${k.id}: Zeichnung fehlt oder ist zu kurz`);
  }
});

pruefe("Jede Frisur zeichnet einen Kopf im wählbaren Hautton", () => {
  for (const k of KOEPFE) {
    wahr(k.svg.includes("{{HAUT}}"), `${k.id}: kein Platzhalter für den Hautton`);
  }
});

pruefe("Die Kennungen der Frisuren sind eindeutig", () => {
  const gesehen = new Set();
  for (const k of KOEPFE) { wahr(!gesehen.has(k.id), `${k.id} doppelt`); gesehen.add(k.id); }
});

pruefe("Die voreingestellte Frisur gibt es wirklich", () => {
  ersetze({});
  wahr(KOEPFE.some((k) => k.id === held().haar), `Vorgabe „${held().haar}“ steht nicht in koepfe.js`);
});

// ------------------------------------------- Held bleibt auf dem Gerät
// Die verschickte Einzeldatei darf nur Stapel enthalten. Landete darin je
// ein Held, spielten alle Empfänger mit derselben Figur.
pruefe("Die Einzeldatei trägt keinen Helden mit sich", () => {
  let datei;
  try { datei = lies("lernapp.html"); }
  catch { return; }                      // noch nicht gebaut — dann nichts zu prüfen
  const eingebettet = datei.match(/window\.STAPEL_EINGEBETTET = (\[[\s\S]*?\]);/);
  wahr(Boolean(eingebettet), "die Stapel stecken nicht wie erwartet in der Datei");
  const stapel = JSON.parse(eingebettet[1]);
  wahr(Array.isArray(stapel) && stapel.length > 0, "keine Stapel eingebettet");
  for (const feld of ["muenzen", "verdient", "besitz", "getragen", "haarfarbe", "angelegt"]) {
    wahr(!eingebettet[1].includes(`"${feld}"`), `Heldendaten in der Einzeldatei: ${feld}`);
  }
  // Außerhalb der Stapel darf kein gespeicherter Stand stehen.
  wahr(!/"was"\s*:\s*"aeltestenrat-spielstand"/.test(datei),
    "ein Spielstand ist in die Einzeldatei geraten");
});

pruefe("Von vorn anfangen löscht Held und Fortschritt", () => {
  ersetze({ angelegt: true, name: "Weg damit", muenzen: 500, verdient: 900 });
  verbuche(true, 1);
  wahr(held().verdient > 0, "Vorbedingung: es gibt etwas zu löschen");
  zuruecksetzen();
  gleich(held().angelegt, false, "angelegt");
  gleich(held().name, "", "Name");
  gleich(held().muenzen, 0, "Münzen");
  gleich(held().verdient, 0, "insgesamt verdient");
  gleich(held().besitz.sort(), ["chino-beige", "hemd-weiss", "socken-weiss"].sort(), "Besitz");
});

pruefe("Von vorn anfangen räumt auch die Leitner-Fächer", () => {
  const e = { schluessel: "probe/weg", karte: { rev: 1 } };
  bewerte(e, true);
  wahr(Object.keys(eintraege()).length > 0, "Vorbedingung: es gibt Fächer");
  fortschrittZuruecksetzen();
  gleich(Object.keys(eintraege()).length, 0);
});

pruefe("Die Ränge sind die Stufen des Bundes", () => {
  gleich(RAENGE.map((r) => r.name),
    ["Castinggast", "Verkehrsgast", "Vorläufiges Mitglied", "Endgültiges Mitglied",
     "Vorstand", "Präside", "Philister"]);
});

pruefe("Jede Frisur lässt sich einfärben und behält ihr Gesicht", () => {
  for (const k of KOEPFE) {
    wahr(k.svg.includes("{{HAAR}}"), `${k.id}: kein Platzhalter für die Haarfarbe`);
    wahr(k.svg.includes('fill="#000"'), `${k.id}: keine schwarzen Gesichtszüge mehr`);
    wahr(k.faerbbar, `${k.id}: nicht als färbbar gekennzeichnet`);
  }
});

pruefe("Es gibt genug Haarfarben zur Wahl", () => {
  wahr(HAARFARBEN.length >= 6, `nur ${HAARFARBEN.length} Haarfarben`);
  for (const f of HAARFARBEN) {
    wahr(/^#[0-9a-f]{6}$/i.test(f.wert), `${f.id}: „${f.wert}“ ist kein Hex-Wert`);
    wahr(f.name, `${f.id}: Name fehlt`);
  }
  gleich(haarfarbe("gibtsnicht"), HAARFARBEN[0].wert, "unbekannte Farbe fällt zurück");
});

pruefe("Die Kneipreihenfolge hat genau die sechs Schritte", () => {
  const stapel = json("decks", "comment-kneipe.json");
  const karte = stapel.karten.find((k) => k.id === "reihe-ablauf");
  gleich(karte.elemente,
    ["Eröffnung", "Begrüßung", "Grußworte", "Prinzipienrede", "Inoffiz", "Bierdorf"]);
});

pruefe("Der Kneipvokabel-Stapel ist als ungeprüft gekennzeichnet", () => {
  const stapel = json("decks", "kneipvokabeln.json");
  wahr(/NICHT GEPRÜFT/i.test(stapel.quelle),
    "der Stapel kommt nicht aus den Unterlagen und muss das auch sagen");
  wahr(stapel.karten.length >= 15, `nur ${stapel.karten.length} Vokabeln`);
});

pruefe("Die Ränge steigen und fangen bei 0 an", () => {
  gleich(RAENGE[0].ab, 0);
  wahr(RAENGE.every((r, i) => i === 0 || r.ab > RAENGE[i - 1].ab), "Schwellen müssen wachsen");
  gleich(rang(0).name, RAENGE[0].name);
  gleich(rang(1e9).name, RAENGE[RAENGE.length - 1].name);
});

console.log(`${gelaufen - gefallen} von ${gelaufen} Prüfungen bestanden.`);
process.exit(gefallen ? 1 : 0);
