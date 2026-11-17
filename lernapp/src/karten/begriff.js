import { h } from "../dom.js";
import { moeglichkeiten } from "./auswahl.js";
import { wahlfeld } from "./wahlfeld.js";

export function erstelle(einheit, ctx) {
  const { karte, richtung } = einheit;
  const vonBegriff = richtung === "begriff-definition";
  const gesucht = vonBegriff ? karte.definition : karte.begriff;
  const textVon = (k) => (vonBegriff ? k.definition : k.begriff);

  const antwort = () => h("div", { class: "antwort" },
    vonBegriff
      ? h("p", { class: "text", text: karte.definition })
      : h("p", { class: "name", text: karte.begriff }),
    karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null);

  const frage = () => [
    h("p", { class: vonBegriff ? "frage" : "frage klein",
             text: vonBegriff ? karte.begriff : karte.definition }),
    h("p", { class: "prompt", text: vonBegriff ? "Was heißt das?" : "Welcher Begriff?" }),
  ];

  // Die eigenen Ablenker einer Begriffskarte sind Definitionen. In der
  // Gegenrichtung ist der Begriff gesucht — dann kommen die Ablenker aus
  // dem Stapel, sonst stünde ein Wort zwischen drei Sätzen.
  const wahl = moeglichkeiten(einheit, gesucht, textVon, undefined,
    vonBegriff ? karte.ablenker : []);
  if (!wahl) return { modus: "selbst", frage, antwort };

  const feld = wahlfeld(wahl, ctx.beiAntwort);
  return { modus: "auswahl", frage, feld: feld.feld, waehle: feld.waehle, antwort };
}
