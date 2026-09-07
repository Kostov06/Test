import { h } from "../dom.js";

export function erstelle(einheit) {
  const { karte } = einheit;
  return {
    frage: () => h("p", { class: "frage", text: karte.frage }),
    antwort: () => h("div", { class: "antwort" },
      karte.antworten.length > 1
        ? h("p", { class: "multi", text: "Jede dieser Antworten gilt." })
        : null,
      karte.antworten.map((a) => h("p", { class: "text", text: a })),
      karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null),
  };
}
