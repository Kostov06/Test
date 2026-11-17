// Baut Antwortmöglichkeiten: die richtige plus Ablenker.
//
// Zur Lage der richtigen Antwort: sie wird mit Fisher-Yates gemischt, also
// gleichverteilt über alle Plätze. Kein „meistens B“. tests/run-tests.mjs
// zählt das über zehntausende Durchläufe nach, statt es zu behaupten.
//
// Woher die Ablenker kommen, in dieser Reihenfolge:
//   1. aus dem Feld `ablenker` der Karte — von Hand geschrieben, damit sie
//      wirklich zur Frage passen und nicht am Thema zu erkennen sind. Sie
//      gelten für eine Richtung: auf einer Begriffskarte sind es weitere
//      Definitionen. Wird dieselbe Karte andersherum abgefragt („Welcher
//      Begriff?“), lässt der Aufrufer sie weg — sonst stünde ein einzelnes
//      Wort zwischen drei Sätzen und wäre ohne Wissen zu erkennen;
//   2. aus Karten derselben `gruppe` im selben Stapel;
//   3. notfalls aus dem ganzen Stapel.
// Ohne (1) oder (2) antworten die Ablenker auf andere Fragen und lassen
// sich allein am Gegenstand aussortieren — die Frage wäre dann zu leicht.
import { mische } from "../dom.js";

export const WUNSCH_ANZAHL = 4;
export const MINDEST_ANZAHL = 3;

// Bei langen Antworten werden vier Möglichkeiten auf dem Handy zur
// Textwand. Dann lieber drei — geraten wird immer noch selten genug.
const LANG = 90;

const jahrAus = (text) => {
  const t = String(text).match(/\b(1[6-9]\d\d|20\d\d)\b/);
  return t ? Number(t[1]) : null;
};

function ausStapel(einheit, textVon) {
  const { stapel, karte } = einheit;
  const gleicheGruppe = (k) => (k.gruppe || null) === (karte.gruppe || null);
  const tauglich = stapel.karten.filter((k) => k !== karte && k.typ === karte.typ);
  const bevorzugt = tauglich.filter(gleicheGruppe);
  return (bevorzugt.length >= MINDEST_ANZAHL - 1 ? bevorzugt : tauglich)
    .map(textVon)
    .filter(Boolean);
}

// Steht in der Antwort eine Jahreszahl, sind nahe Jahre die härteren
// Ablenker: 1865 gegen 1867 verlangt Wissen, 1865 gegen 1993 nicht.
// Gewählt wird aus den nächstgelegenen, nicht immer dieselben drei —
// sonst lernte man die Auswahl statt der Jahreszahl.
function nachNaehe(richtigerText, kandidaten) {
  const ziel = jahrAus(richtigerText);
  if (ziel === null) return kandidaten;
  const mitJahr = kandidaten.filter((t) => jahrAus(t) !== null);
  if (mitJahr.length < 6) return kandidaten;
  const sortiert = [...mitJahr].sort(
    (a, b) => Math.abs(jahrAus(a) - ziel) - Math.abs(jahrAus(b) - ziel));
  return sortiert.slice(0, Math.max(6, Math.ceil(sortiert.length / 2)));
}

export function moeglichkeiten(einheit, richtigerText, textVon, anzahl, eigeneAblenker) {
  if (anzahl === undefined) {
    anzahl = String(richtigerText).length > LANG ? MINDEST_ANZAHL : WUNSCH_ANZAHL;
  }
  const liste = eigeneAblenker === undefined ? einheit.karte.ablenker : eigeneAblenker;
  const eigene = (liste || []).filter((t) => t && t !== richtigerText);
  const ausDemStapel = ausStapel(einheit, textVon).filter((t) => t !== richtigerText);

  // Erst die eigenen, dann nach Bedarf aus dem Stapel auffüllen.
  const gesehen = new Set();
  const reihe = [];
  for (const t of [...mische(eigene), ...mische(nachNaehe(richtigerText, ausDemStapel))]) {
    if (gesehen.has(t)) continue;
    gesehen.add(t);
    reihe.push(t);
  }
  if (reihe.length < MINDEST_ANZAHL - 1) return null;   // zu wenig für eine echte Wahl

  const ablenker = reihe.slice(0, anzahl - 1);
  return mische([richtigerText, ...ablenker].map((text) => ({ text, richtig: text === richtigerText })));
}
