import { h, mische } from "../dom.js";

// elemente ist die richtige Reihenfolge. Ein verschachteltes Array bedeutet:
// an dieser Stelle ist die Reihenfolge untereinander egal.
export const gruppen = (elemente) => elemente.map((e) => (Array.isArray(e) ? [...e] : [e]));

export function istRichtig(elemente, gewaehlt) {
  const g = gruppen(elemente);
  let i = 0;
  for (const gruppe of g) {
    const abschnitt = gewaehlt.slice(i, i + gruppe.length);
    if (abschnitt.length !== gruppe.length) return false;
    const a = [...abschnitt].sort(), b = [...gruppe].sort();
    if (a.some((x, j) => x !== b[j])) return false;
    i += gruppe.length;
  }
  return i === gewaehlt.length;
}

// Welche Position ist ein Element richtigerweise? Für die Rückmeldung.
function sollGruppe(elemente, wert) {
  return gruppen(elemente).findIndex((g) => g.includes(wert));
}

export function erstelle(einheit, beiAenderung) {
  const { karte } = einheit;
  const alle = gruppen(karte.elemente).flat();
  const angeboten = mische(alle);
  let gewaehlt = [];
  let aufgeloest = false;

  const liste = h("ul", { class: "reihe" });

  function zeichne() {
    liste.replaceChildren(...angeboten.map((wert) => {
      const platz = gewaehlt.indexOf(wert);
      const gesetzt = platz >= 0;
      let klasse = null;
      if (aufgeloest && gesetzt) {
        // Richtig ist ein Element, wenn seine Gruppe an der Stelle steht,
        // an die sie gehört.
        const grenzen = gruppen(karte.elemente).map((g) => g.length);
        let start = 0, gruppeAmPlatz = 0;
        for (let i = 0; i < grenzen.length; i++) {
          if (platz < start + grenzen[i]) { gruppeAmPlatz = i; break; }
          start += grenzen[i];
        }
        klasse = sollGruppe(karte.elemente, wert) === gruppeAmPlatz ? "richtig" : "falsch";
      }
      return h("li", {},
        h("button", {
          class: klasse,
          "aria-pressed": gesetzt ? "true" : "false",
          disabled: aufgeloest,
          onclick: () => {
            gewaehlt = gesetzt ? gewaehlt.filter((x) => x !== wert) : [...gewaehlt, wert];
            zeichne();
            if (beiAenderung) beiAenderung();
          },
        },
          h("span", { class: "nr", text: gesetzt ? `${platz + 1}.` : "–" }),
          h("span", { text: wert })));
    }));
  }
  zeichne();

  return {
    frage: () => [
      h("p", { class: "frage klein", text: karte.frage }),
      h("p", { class: "prompt", text: "In der richtigen Reihenfolge antippen." }),
      liste,
    ],
    bereit: () => gewaehlt.length === alle.length,
    vorschlag: () => istRichtig(karte.elemente, gewaehlt),
    antwort: () => {
      aufgeloest = true;
      zeichne();
      const richtig = istRichtig(karte.elemente, gewaehlt);
      return h("div", { class: "antwort" },
        h("p", { class: "multi", text: richtig ? "Stimmt." : "So ist es richtig:" }),
        richtig ? null : gruppen(karte.elemente).map((g, i) =>
          h("p", { class: "meta", text: `${i + 1}. ${g.join("  ·  ")}` })),
        karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null);
    },
  };
}
