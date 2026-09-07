import { h } from "../dom.js";

// Lücken werden {{so}} markiert, Alternativen {{so|oder so}}.
export function zerlege(text) {
  const teile = [];
  let rest = text;
  const muster = /\{\{([^{}]+)\}\}/;
  let m;
  while ((m = muster.exec(rest))) {
    if (m.index > 0) teile.push({ luecke: false, text: rest.slice(0, m.index) });
    teile.push({ luecke: true, loesungen: m[1].split("|").map((s) => s.trim()).filter(Boolean) });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) teile.push({ luecke: false, text: rest });
  return teile;
}

export function erstelle(einheit) {
  const { karte } = einheit;
  const teile = zerlege(karte.text);
  const luecken = [];

  const absatz = h("p", { class: "lueckentext" },
    teile.map((t) => {
      if (!t.luecke) return document.createTextNode(t.text);
      // Die Lösung steht schon da, nur unsichtbar: so springt beim Auflösen
      // keine Zeile um, und die Länge der Lücke bleibt der Hinweis, der sie
      // beim Auswendiglernen einer Strophe sein soll.
      const el = h("span", { class: "luecke", text: t.loesungen[0], "aria-label": "Lücke" });
      luecken.push({ el, teil: t });
      return el;
    }));

  return {
    frage: () => [
      karte.titel ? h("p", { class: "prompt", text: karte.titel }) : null,
      h("div", { class: "antwort" }, absatz),
    ],
    antwort: () => {
      for (const { el } of luecken) {
        el.classList.add("gefuellt");
        el.removeAttribute("aria-label");
      }
      const mehrere = luecken.filter(({ teil }) => teil.loesungen.length > 1);
      // Die Trennlinie unter der Zählzeile nur, wenn darunter auch etwas steht.
      const folgt = mehrere.length > 0 || Boolean(karte.notiz);
      return h("div", { class: "antwort" },
        h("p", { class: folgt ? "multi" : "meta",
                 text: `${luecken.length} ${luecken.length === 1 ? "Lücke" : "Lücken"} — oben eingesetzt.` }),
        mehrere.map(({ teil }) =>
          h("p", { class: "meta", text: `Ebenso richtig: ${teil.loesungen.slice(1).join(", ")}` })),
        karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null);
    },
  };
}
