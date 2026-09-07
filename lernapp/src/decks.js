// Lädt die Stapel aus decks/. Der Einzeldatei-Build legt sie stattdessen
// als window.STAPEL_EINGEBETTET ab — dann wird nichts geholt.
import { pruefeStapel, istHell } from "./schema.js";

let geladen = null;

async function hole(pfad) {
  const antwort = await fetch(pfad, { cache: "no-cache" });
  if (!antwort.ok) throw new Error(`${pfad}: ${antwort.status}`);
  return antwort.json();
}

export async function ladeStapel() {
  if (geladen) return geladen;

  let rohe;
  if (globalThis.STAPEL_EINGEBETTET) {
    rohe = globalThis.STAPEL_EINGEBETTET;
  } else {
    const manifest = await hole("decks/index.json");
    rohe = await Promise.all(manifest.stapel.map((id) => hole(`decks/${id}.json`)));
  }

  const gut = [];
  const kaputt = [];
  for (const s of rohe) {
    const fehler = pruefeStapel(s);
    if (fehler.length) kaputt.push({ id: (s && s.id) || "?", fehler });
    else gut.push(s);
  }
  geladen = { stapel: gut, kaputt };
  return geladen;
}

// Ein Stapel kann mehr Lerneinheiten haben als Karten: ein Begriff mit
// richtung "beide" wird in beide Richtungen abgefragt und zählt doppelt.
export function lerneinheiten(stapel) {
  const raus = [];
  for (const karte of stapel.karten) {
    if (karte.typ === "begriff") {
      const r = karte.richtung || "beide";
      if (r === "beide" || r === "begriff-definition") {
        raus.push({ schluessel: `${stapel.id}/${karte.id}#bd`, stapel, karte, richtung: "begriff-definition" });
      }
      if (r === "beide" || r === "definition-begriff") {
        raus.push({ schluessel: `${stapel.id}/${karte.id}#db`, stapel, karte, richtung: "definition-begriff" });
      }
    } else {
      raus.push({ schluessel: `${stapel.id}/${karte.id}`, stapel, karte, richtung: null });
    }
  }
  return raus;
}

// Hairline um helle Streifen: die geprüften Stapel bringen ihre eigene Liste
// mit und werden dadurch pixelgleich wie die Prototypen gezeichnet. Nur
// Stapel ohne Liste bekommen die Helligkeitsregel.
export function hellPruefer(stapel) {
  if (Array.isArray(stapel.helleFarben)) {
    const menge = new Set(stapel.helleFarben.map((f) => f.toLowerCase()));
    return (farbe) => menge.has(farbe.toLowerCase());
  }
  return istHell;
}
