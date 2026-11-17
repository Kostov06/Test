import { h } from "../dom.js";
import { hellPruefer } from "../decks.js";
import { moeglichkeiten } from "./auswahl.js";
import { wahlfeld } from "./wahlfeld.js";

export function band(karte, istHell, klasse = "band") {
  return h("div", { class: klasse, role: "img", "aria-label": `Farbband: ${karte.farben}` },
    karte.band.streifen.map((s) => h("span", {
      class: istHell(s.farbe) ? "hell" : null,
      style: `background:${s.farbe};flex:${s.breite ?? 1} 1 0`,
    })));
}

const meta = (a) => [a.ort, a.jahr, a.verband, a.anmerkung].filter(Boolean).join(" · ");
const buendeVon = (karte) => karte.antworten.map((a) => a.name).join(" / ");

export function erstelle(einheit, ctx) {
  const { karte, stapel } = einheit;
  const istHell = hellPruefer(stapel);
  const wahl = moeglichkeiten(einheit, buendeVon(karte), buendeVon);

  const antwort = () => h("div", { class: "antwort" },
    h("p", { class: "farben", text: karte.farben }),
    karte.antworten.length > 1
      ? h("p", { class: "multi", text: `Diese Farben führen ${karte.antworten.length} Bünde.` })
      : null,
    karte.antworten.map((a) => h("div", { class: "eintrag" },
      h("p", { class: "name", text: a.name }),
      meta(a) ? h("p", { class: "meta", text: meta(a) }) : null)),
    karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null);

  // Ohne genug andere Bünde im Stapel gäbe es nichts zu wählen — dann
  // bleibt es bei der Selbsteinschätzung.
  if (!wahl) {
    return { modus: "selbst", frage: () => [band(karte, istHell),
      h("p", { class: "prompt", text: "Welcher Bund?" })], antwort };
  }

  const feld = wahlfeld(wahl, ctx.beiAntwort);
  return {
    modus: "auswahl",
    frage: () => [band(karte, istHell), h("p", { class: "prompt", text: "Welcher Bund führt diese Farben?" })],
    feld: feld.feld,
    waehle: feld.waehle,
    antwort,
  };
}
