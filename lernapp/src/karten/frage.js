import { h } from "../dom.js";
import { moeglichkeiten } from "./auswahl.js";
import { wahlfeld } from "./wahlfeld.js";

const ersteAntwort = (karte) => (karte.antworten && karte.antworten[0]) || "";

export function erstelle(einheit, ctx) {
  const { karte } = einheit;
  const antwort = () => h("div", { class: "antwort" },
    karte.antworten.length > 1
      ? h("p", { class: "multi", text: "Jede dieser Antworten gilt." })
      : null,
    karte.antworten.map((a) => h("p", { class: "text", text: a })),
    karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null);

  // Mehrere gültige Antworten lassen sich nicht sinnvoll ankreuzen —
  // dann bleibt es bei der Selbsteinschätzung.
  const wahl = karte.antworten.length > 1
    ? null
    : moeglichkeiten(einheit, ersteAntwort(karte), ersteAntwort);

  // Karten dürfen eine Zusatzzeile mitbringen („Wann war das?“).
  const zusatz = () => (karte.prompt ? h("p", { class: "prompt", text: karte.prompt }) : null);

  if (!wahl) {
    return { modus: "selbst",
      frage: () => [h("p", { class: "frage", text: karte.frage }), zusatz()], antwort };
  }
  const feld = wahlfeld(wahl, ctx.beiAntwort);
  return {
    modus: "auswahl",
    frage: () => [h("p", { class: "frage klein", text: karte.frage }), zusatz()],
    feld: feld.feld,
    waehle: feld.waehle,
    antwort,
  };
}
