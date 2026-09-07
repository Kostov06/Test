// Leitner mit fünf Fächern. Fach 1 wird in derselben Sitzung wiederholt,
// danach wachsen die Abstände.
import { eintrag, setzeEintrag } from "./store.js";

export const FAECHER = 5;
export const INTERVALLE = [0, 1, 3, 7, 21]; // Tage bis zur nächsten Abfrage, je Fach

export function heute() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function inTagen(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const frisch = (rev) => ({ fach: 1, faellig: heute(), rev, richtig: 0, falsch: 0, zuletzt: null });

// Ändert sich der Inhalt einer Karte (rev hochgezählt), fällt sie zurück in
// Fach 1. Eine korrigierte Farbe darf nicht in Fach 5 weiterschlafen.
export function stand(einheit) {
  const e = eintrag(einheit.schluessel);
  if (!e) return frisch(einheit.karte.rev);
  if (e.rev !== einheit.karte.rev) {
    return { ...e, fach: 1, faellig: heute(), rev: einheit.karte.rev, veraltet: true };
  }
  return e;
}

export function bewerte(einheit, gewusst) {
  const e = stand(einheit);
  const fach = gewusst ? Math.min(FAECHER, e.fach + 1) : 1;
  setzeEintrag(einheit.schluessel, {
    fach,
    faellig: inTagen(INTERVALLE[fach - 1]),
    rev: einheit.karte.rev,
    richtig: e.richtig + (gewusst ? 1 : 0),
    falsch: e.falsch + (gewusst ? 0 : 1),
    zuletzt: heute(),
  });
}

export const istFaellig = (e) => e.faellig <= heute();
export const hakt = (e) => e.fach <= 2 && e.falsch > 0;
