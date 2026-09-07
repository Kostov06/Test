import { h } from "../dom.js";

export function erstelle(einheit) {
  const { karte, richtung } = einheit;
  const vonBegriff = richtung === "begriff-definition";
  return {
    frage: () => [
      h("p", { class: vonBegriff ? "frage" : "frage klein",
               text: vonBegriff ? karte.begriff : karte.definition }),
      h("p", { class: "prompt", text: vonBegriff ? "Was heißt das?" : "Welcher Begriff?" }),
    ],
    antwort: () => h("div", { class: "antwort" },
      vonBegriff
        ? h("p", { class: "text", text: karte.definition })
        : h("p", { class: "name", text: karte.begriff }),
      karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null),
  };
}
