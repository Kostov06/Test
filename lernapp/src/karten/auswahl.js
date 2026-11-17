// Baut Antwortmöglichkeiten: die richtige plus Ablenker aus demselben
// Stapel.
//
// Zur Lage der richtigen Antwort: sie wird mit Fisher-Yates gemischt, also
// gleichverteilt über alle Plätze. Kein „meistens B“. tests/run-tests.mjs
// zählt das über zehntausende Durchläufe nach, statt es zu behaupten.
import { mische } from "../dom.js";

export const WUNSCH_ANZAHL = 4;
export const MINDEST_ANZAHL = 3;

// Ablenker kommen bevorzugt aus derselben `gruppe` — sonst stünde bei
// „Wann wurde das Haus gekauft?“ plötzlich ein Fließtext zur Wahl.
function kandidaten(einheit, textVon) {
  const { stapel, karte } = einheit;
  const gleicheGruppe = (k) => (k.gruppe || null) === (karte.gruppe || null);
  const tauglich = stapel.karten.filter((k) => k !== karte && k.typ === karte.typ);
  const bevorzugt = tauglich.filter(gleicheGruppe);
  return (bevorzugt.length >= MINDEST_ANZAHL - 1 ? bevorzugt : tauglich)
    .map(textVon)
    .filter(Boolean);
}

// Bei langen Antworten werden vier Möglichkeiten auf dem Handy zur
// Textwand. Dann lieber drei — geraten wird immer noch selten genug.
const LANG = 90;

export function moeglichkeiten(einheit, richtigerText, textVon, anzahl) {
  if (anzahl === undefined) {
    anzahl = String(richtigerText).length > LANG ? MINDEST_ANZAHL : WUNSCH_ANZAHL;
  }
  const verschieden = [...new Set(kandidaten(einheit, textVon))]
    .filter((t) => t !== richtigerText);
  if (verschieden.length < MINDEST_ANZAHL - 1) return null;   // zu wenig für eine echte Wahl
  const ablenker = mische(verschieden).slice(0, anzahl - 1);
  return mische([richtigerText, ...ablenker].map((text) => ({ text, richtig: text === richtigerText })));
}
