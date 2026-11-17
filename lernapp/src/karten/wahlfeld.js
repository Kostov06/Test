// Die Knopfreihe für eine Multiple-Choice-Abfrage. Ein Antippen zählt:
// danach ist die Wahl gesperrt, richtig und falsch sind markiert.
import { h, leere } from "../dom.js";

// beiAntwort bekommt zusätzlich die angetippte Möglichkeit — das Kneipspiel
// lässt die eigene Figur sagen, was man gewählt hat.
export function wahlfeld(moeglichkeiten, beiAntwort) {
  const liste = h("ul", { class: "wahlfeld" });
  let gesperrt = false;

  function zeichne(gewaehlt) {
    leere(liste);
    moeglichkeiten.forEach((m, i) => {
      let klasse = null;
      if (gesperrt) {
        if (m.richtig) klasse = "richtig";
        else if (m === gewaehlt) klasse = "falsch";
        else klasse = "blass";
      }
      liste.append(h("li", {},
        h("button", {
          class: klasse, disabled: gesperrt,
          onclick: () => {
            if (gesperrt) return;
            gesperrt = true;
            zeichne(m);
            beiAntwort(Boolean(m.richtig), m);
          },
        },
          h("span", { class: "nr", text: String(i + 1) }),
          h("span", { class: "wahltext", text: m.text }))));
    });
  }
  zeichne(null);

  return {
    feld: () => liste,
    // Für die Tastatur: 1 bis 4 wählen die Möglichkeiten.
    waehle: (nr) => {
      if (gesperrt) return false;
      const knopf = liste.querySelectorAll("button")[nr - 1];
      if (!knopf) return false;
      knopf.click();
      return true;
    },
  };
}
