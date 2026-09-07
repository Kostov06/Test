import { h } from "../dom.js";
import { hellPruefer } from "../decks.js";

export function band(karte, istHell, klasse = "band") {
  return h("div", { class: klasse, role: "img", "aria-label": `Farbband: ${karte.farben}` },
    karte.band.streifen.map((s) => h("span", {
      class: istHell(s.farbe) ? "hell" : null,
      style: `background:${s.farbe};flex:${s.breite ?? 1} 1 0`,
    })));
}

const meta = (a) => [a.ort, a.jahr, a.verband, a.anmerkung].filter(Boolean).join(" · ");

export function erstelle(einheit) {
  const { karte, stapel } = einheit;
  const istHell = hellPruefer(stapel);

  return {
    frage: () => [
      band(karte, istHell),
      h("p", { class: "prompt", text: "Welcher Bund?" }),
    ],
    antwort: () => h("div", { class: "antwort" },
      h("p", { class: "farben", text: karte.farben }),
      karte.antworten.length > 1
        ? h("p", { class: "multi", text: `Diese Farben führen ${karte.antworten.length} Bünde.` })
        : null,
      karte.antworten.map((a) => h("div", { class: "eintrag" },
        h("p", { class: "name", text: a.name }),
        meta(a) ? h("p", { class: "meta", text: meta(a) }) : null)),
      karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null),
  };
}
