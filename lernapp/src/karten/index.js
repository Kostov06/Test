import * as couleur from "./couleur.js";
import * as frage from "./frage.js";
import * as begriff from "./begriff.js";
import * as lueckentext from "./lueckentext.js";
import * as reihenfolge from "./reihenfolge.js";

const NACH_TYP = { couleur, frage, begriff, lueckentext, reihenfolge };

export function erstelleKarte(einheit, beiAenderung) {
  const modul = NACH_TYP[einheit.karte.typ];
  if (!modul) throw new Error(`Kein Renderer für Typ ${einheit.karte.typ}`);
  return modul.erstelle(einheit, beiAenderung);
}
export { band } from "./couleur.js";
