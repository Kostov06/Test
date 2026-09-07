// Fortschritt liegt ausschließlich im localStorage dieses Geräts.
// Schlägt der Zugriff fehl (privates Fenster, gesperrter Speicher), läuft die
// App weiter und merkt sich den Fortschritt nur für diese Sitzung.
const SCHLUESSEL = "ael.fortschritt.v1";
const LEER = { version: 1, eintraege: {}, auswahl: null };

let speicherGeht = true;
let zwischen = null;

function roh() {
  if (zwischen) return zwischen;
  try {
    const s = localStorage.getItem(SCHLUESSEL);
    zwischen = s ? { ...LEER, ...JSON.parse(s) } : { ...LEER, eintraege: {} };
  } catch {
    speicherGeht = false;
    zwischen = { ...LEER, eintraege: {} };
  }
  return zwischen;
}

function sichere() {
  if (!speicherGeht) return;
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(zwischen));
  } catch {
    speicherGeht = false;
  }
}

export const speicherVerfuegbar = () => speicherGeht;
export const eintraege = () => roh().eintraege;
export const eintrag = (schluessel) => roh().eintraege[schluessel] || null;

export function setzeEintrag(schluessel, wert) {
  roh().eintraege[schluessel] = wert;
  sichere();
}

export function auswahl() { return roh().auswahl; }
export function setzeAuswahl(ids) { roh().auswahl = ids; sichere(); }

export function vergiss(schluesselTest) {
  const e = roh().eintraege;
  for (const k of Object.keys(e)) if (schluesselTest(k)) delete e[k];
  sichere();
}
