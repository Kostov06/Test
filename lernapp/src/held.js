// Der Held: Figur, Ausrüstung und Ingvaeonencoins.
//
// Liegt in einem eigenen localStorage-Schlüssel neben dem Lernfortschritt —
// so kann das eine nicht das andere beschädigen, und ein Spielstand lässt
// sich ausführen, ohne die Leitner-Fächer mitzunehmen.
const SCHLUESSEL = "ael.held.v1";

// Die Frisuren stehen in src/koepfe.js (Open Peeps, CC0) — dort steht auch,
// wie sie dorthin kommen. Das Haar ist in der Vorlage schwarz gezeichnet;
// das Bauwerkzeug macht es färbbar, die Gesichtszüge bleiben schwarz.
export const HAARFARBEN = [
  { id: "schwarz", name: "Schwarz", wert: "#1d1a17" },
  { id: "dunkelbraun", name: "Dunkelbraun", wert: "#3a2a1c" },
  { id: "braun", name: "Braun", wert: "#6b4a2b" },
  { id: "hellbraun", name: "Hellbraun", wert: "#9a6b3f" },
  { id: "blond", name: "Blond", wert: "#c9a35e" },
  { id: "hellblond", name: "Hellblond", wert: "#e0c48a" },
  { id: "rot", name: "Rot", wert: "#a9502a" },
  { id: "grau", name: "Grau", wert: "#9a958c" },
  { id: "weiss", name: "Weiß", wert: "#dcd8d0" },
];

export const haarfarbe = (id) =>
  (HAARFARBEN.find((f) => f.id === id) || HAARFARBEN[0]).wert;

export const HAUTTOENE = ["#f2d3b8", "#e0b492", "#c08e63", "#8d5f3c", "#5e3b24"];

export const FIGUREN = [
  { id: "schlank", name: "Schlank" },
  { id: "kraeftig", name: "Kräftig" },
];

// Jeder Gegenstand belegt einen Platz. Was auf demselben Platz liegt,
// verdrängt einander — man trägt nicht zwei Jacken übereinander.
// „pflicht“ heißt: auf diesem Platz liegt immer etwas. Man kann die Sachen
// wechseln, aber nicht alle ablegen — sonst steht der Held nackt da.
export const PLAETZE = [
  { id: "oberteil", name: "Oberteil", pflicht: true },
  { id: "hose", name: "Beinkleid", pflicht: true },
  { id: "schuhe", name: "Schuhe", pflicht: true },
  { id: "hals", name: "Am Hals" },
  { id: "jacke", name: "Jacke" },
  { id: "hand", name: "In der Hand" },
  { id: "guertel", name: "Am Gürtel" },
  { id: "trophaee", name: "Trophäe" },
];

export const GEGENSTAENDE = [
  // --- Was man am ersten Tag anhat -------------------------------------
  { id: "hemd-weiss", platz: "oberteil", preis: 0, art: "hemd", name: "Weißes Hemd",
    beschreibung: "Geht immer. Sitzt hoffentlich.", farbe: "#fbfaf6" },
  { id: "chino-beige", platz: "hose", preis: 0, art: "hose", name: "Beige Chino",
    beschreibung: "Die Uniform der ersten Wochen.", farbe: "#d8c9a7" },
  { id: "socken-weiss", platz: "schuhe", preis: 0, art: "socke", name: "Weiße Tennissocken",
    beschreibung: "Niemand hat dir etwas anderes gesagt.", farbe: "#f4f2ea" },

  // --- Erschwingliches --------------------------------------------------
  { id: "bootsschuhe", platz: "schuhe", preis: 80, art: "boot", name: "Bootsschuhe",
    beschreibung: "Braunes Leder, helle Sohle. Der erste richtige Schritt.", farbe: "#8a5a32" },
  { id: "krawatte-dunkelblau", platz: "hals", preis: 120, art: "krawatte", name: "Krawatte, dunkelblau",
    beschreibung: "Die, mit der man nichts falsch macht.", farbe: "#243352" },
  { id: "krawatte-bordeaux", platz: "hals", preis: 120, art: "krawatte", name: "Krawatte, bordeaux",
    beschreibung: "Etwas mehr Meinung als dunkelblau.", farbe: "#6d2230" },
  { id: "krawatte-silber", platz: "hals", preis: 140, art: "krawatte", name: "Krawatte, silbergrau",
    beschreibung: "Für Stiftungsfeste und Hochzeiten.", farbe: "#a9adb3" },
  { id: "krawatte-gestreift", platz: "hals", preis: 160, art: "krawatte-gestreift", name: "Krawatte, gestreift",
    beschreibung: "Diagonal, dunkelgrün auf nachtblau.", farbe: "#1e3048", zweitfarbe: "#2f5d3a" },
  { id: "fliege", platz: "hals", preis: 140, art: "fliege", name: "Schwarze Fliege",
    beschreibung: "Für den festlichen Kommers.", farbe: "#1d1a17" },
  { id: "helles", platz: "hand", preis: 150, art: "glas", name: "Helles im Henkelglas",
    beschreibung: "Der Zapfen hat ein Auge auf dich.", farbe: "#e0a52a" },

  // --- Mittelklasse ------------------------------------------------------
  { id: "wachsjacke-gruen", platz: "jacke", preis: 350, art: "wachsjacke", name: "Wachsjacke, dunkelgrün",
    beschreibung: "Riecht nach Wachs und nassem Hund. Unverwüstlich.", farbe: "#2f4232" },
  { id: "wachsjacke-blau", platz: "jacke", preis: 350, art: "wachsjacke", name: "Wachsjacke, dunkelblau",
    beschreibung: "Dieselbe Jacke, andere Meinung.", farbe: "#273449" },
  { id: "wachsjacke-braun", platz: "jacke", preis: 350, art: "wachsjacke", name: "Wachsjacke, braun",
    beschreibung: "Die vom Onkel geerbte.", farbe: "#4a3626" },
  { id: "octopott", platz: "hand", preis: 500, art: "octopott", name: "Octopott",
    beschreibung: "Hohes Facettenglas mit Henkel und Ausguss. Acht Kanten, anderthalb Liter, kein Zurück.",
    farbe: "#e3a92f" },

  // --- Gehobenes ---------------------------------------------------------
  { id: "anzug-anthrazit", platz: "jacke", preis: 550, art: "anzug", name: "Anzug, anthrazit",
    beschreibung: "Jackett bleibt an, bis das Präsidium es auszieht.", farbe: "#2e3238" },
  { id: "anzug-nachtblau", platz: "jacke", preis: 550, art: "anzug", name: "Anzug, nachtblau",
    beschreibung: "Abends das bessere Schwarz.", farbe: "#20283d" },
  { id: "anzug-schwarz", platz: "jacke", preis: 650, art: "anzug", name: "Anzug, schwarz",
    beschreibung: "Trauer, Trauung, Kommers.", farbe: "#1a1b1d" },
  { id: "anzug-grau", platz: "jacke", preis: 500, art: "anzug", name: "Anzug, mittelgrau",
    beschreibung: "Geht auch tagsüber durch.", farbe: "#595f66" },
  { id: "kleid-dunkelblau", platz: "oberteil", preis: 550, art: "kleid", name: "Kleid, dunkelblau",
    beschreibung: "Schultern bedeckt, knielang, dem Anlass angemessen.", farbe: "#2b3550" },
  { id: "kleid-bordeaux", platz: "oberteil", preis: 550, art: "kleid", name: "Kleid, bordeaux",
    beschreibung: "Dasselbe in kräftiger.", farbe: "#5d2330" },
  { id: "kleid-schwarz", platz: "oberteil", preis: 650, art: "kleid", name: "Kleid, schwarz",
    beschreibung: "Das kleine Schwarze. Geht immer.", farbe: "#1f2023" },

  // --- Couleur ------------------------------------------------------------
  { id: "zipfelbund", platz: "guertel", preis: 800, art: "zipfelbund", name: "Zipfelbund in Bundesfarben",
    beschreibung: "Ein Bierzipfel, zwei Weinzipfel, rot-gold-schwarz. Getauscht, nicht gekauft — aber wir drücken ein Auge zu." },

  // --- Trophäen -----------------------------------------------------------
  { id: "fahne-muenster", platz: "trophaee", preis: 1500, art: "fahne", name: "Erbeutete Prunkfahne (Münster)",
    beschreibung: "Vom Haus eines Münsteraner Bundes. Kommt nach dem Stiftungsfest zurück. Versprochen.",
    quelle: "muenster-couleur" },
  { id: "fahne-sv", platz: "trophaee", preis: 2500, art: "fahne", name: "Erbeutete Prunkfahne (SV)",
    beschreibung: "Vom Vertretertag mitgenommen. Die Verhandlungen laufen noch.",
    quelle: "sv-couleur" },
];

export const nachId = (id) => GEGENSTAENDE.find((g) => g.id === id) || null;

// Ränge nach insgesamt verdienten Coins — nicht nach dem Kontostand,
// sonst stiege man beim Einkaufen wieder ab.
// Die Stufen des Bundes, nicht erfundene Spielränge. Die Schwellen sind
// insgesamt verdiente Coins, nicht der Kontostand — sonst stiege man beim
// Einkaufen wieder ab.
export const RAENGE = [
  { ab: 0, name: "Castinggast" },
  { ab: 400, name: "Verkehrsgast" },
  { ab: 1200, name: "Vorläufiges Mitglied" },
  { ab: 2500, name: "Endgültiges Mitglied" },
  { ab: 4500, name: "Vorstand" },
  { ab: 7500, name: "Präside" },
  { ab: 12000, name: "Philister" },
];

export const rang = (verdient) =>
  [...RAENGE].reverse().find((r) => verdient >= r.ab) || RAENGE[0];

export const naechsterRang = (verdient) => RAENGE.find((r) => verdient > -1 && r.ab > verdient) || null;

const START = () => ({
  version: 1,
  angelegt: false,
  name: "",
  figur: "schlank",
  haar: "short1",
  haarfarbe: "braun",
  haut: HAUTTOENE[0],
  muenzen: 0,
  verdient: 0,
  besitz: ["hemd-weiss", "chino-beige", "socken-weiss"],
  getragen: { oberteil: "hemd-weiss", hose: "chino-beige", schuhe: "socken-weiss" },
  beute: {},        // Gegenstand-id → welcher Bund, bei Trophäen
  serie: 0,
});

let speicherGeht = true;
let zwischen = null;

function roh() {
  if (zwischen) return zwischen;
  try {
    const s = localStorage.getItem(SCHLUESSEL);
    zwischen = s ? { ...START(), ...JSON.parse(s) } : START();
  } catch {
    speicherGeht = false;
    zwischen = START();
  }
  return zwischen;
}

function sichere() {
  if (!speicherGeht) return;
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(zwischen)); }
  catch { speicherGeht = false; }
}

export const held = () => roh();
export const speicherVerfuegbar = () => speicherGeht;

export function aendere(aenderung) {
  Object.assign(roh(), aenderung);
  sichere();
  return roh();
}

// Alles vergessen und von vorn anfangen — für das Gerät, das weitergereicht
// wird, oder wenn jemand neu beginnen will.
export function zuruecksetzen() {
  zwischen = START();
  try { localStorage.removeItem(SCHLUESSEL); } catch { /* Speicher gesperrt */ }
  return zwischen;
}

export function ersetze(neuerStand) {
  zwischen = { ...START(), ...neuerStand };
  sichere();
  return zwischen;
}

// ----------------------------------------------------------------- Münzen
// „Falsch“ bringt weniger, aber nie null. Wer für Ehrlichkeit bestraft wird,
// klickt irgendwann auf „Gewusst“, ohne es zu wissen — und dann ist die
// Selbsteinschätzung wertlos.
export const LOHN_FALSCH = 2;
export const SERIE_FUER_BONUS = 5;
export const SERIEN_BONUS = 20;
export const SITZUNGS_BONUS = 50;

// Lohn nach dem Fach vor der Antwort. Fach 1 bringt am meisten, da wird
// wirklich etwas gelernt; auch die letzte Stufe bleibt über LOHN_FALSCH,
// damit richtig immer mehr wert ist als falsch.
export const LOEHNE = [10, 8, 6, 5, 4];
export const lohn = (altesFach) => LOEHNE[Math.min(LOEHNE.length, Math.max(1, altesFach)) - 1];

export function verbuche(gewusst, altesFach) {
  const h = roh();
  let betrag = gewusst ? lohn(altesFach) : LOHN_FALSCH;
  let bonus = 0;
  h.serie = gewusst ? h.serie + 1 : 0;
  if (gewusst && h.serie > 0 && h.serie % SERIE_FUER_BONUS === 0) {
    bonus = SERIEN_BONUS;
  }
  h.muenzen += betrag + bonus;
  h.verdient += betrag + bonus;
  sichere();
  return { betrag, bonus, serie: h.serie };
}

export function sitzungsBonus() {
  const h = roh();
  h.muenzen += SITZUNGS_BONUS;
  h.verdient += SITZUNGS_BONUS;
  sichere();
  return SITZUNGS_BONUS;
}

export const kannZahlen = (gegenstand) => roh().muenzen >= gegenstand.preis;
export const besitzt = (id) => roh().besitz.includes(id);
export const traegt = (id) => Object.values(roh().getragen).includes(id);

export function kaufe(gegenstand, beuteName) {
  const h = roh();
  if (h.besitz.includes(gegenstand.id) || h.muenzen < gegenstand.preis) return false;
  h.muenzen -= gegenstand.preis;
  h.besitz.push(gegenstand.id);
  if (beuteName) h.beute[gegenstand.id] = beuteName;
  h.getragen[gegenstand.platz] = gegenstand.id;
  sichere();
  return true;
}

export const platzIstPflicht = (platzId) =>
  Boolean((PLAETZE.find((p) => p.id === platzId) || {}).pflicht);

export function trage(gegenstand) {
  const h = roh();
  if (!h.besitz.includes(gegenstand.id)) return;
  const schonAn = h.getragen[gegenstand.platz] === gegenstand.id;
  if (schonAn && platzIstPflicht(gegenstand.platz)) return;  // nicht ablegbar
  h.getragen[gegenstand.platz] = schonAn ? null : gegenstand.id;
  sichere();
}

export const getragenerAuf = (platz) => nachId(roh().getragen[platz]);
