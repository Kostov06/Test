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

// Beim Vergleich großzügig bei Groß- und Kleinschreibung, Leerzeichen und
// Satzzeichen am Rand — aber nicht bei der Schreibweise selbst. Wer „heisst“
// statt „heißt“ tippt, hat es nicht gewusst.
export const vergleichbar = (s) => String(s || "")
  .trim().toLowerCase()
  .replace(/[.,;:!?„“"'’]/g, "")
  .replace(/\s+/g, " ");

export const stimmt = (eingabe, loesungen) =>
  loesungen.some((l) => vergleichbar(l) === vergleichbar(eingabe));

export function erstelle(einheit) {
  const { karte } = einheit;
  const teile = zerlege(karte.text);
  const luecken = [];
  let geprueft = false;

  const absatz = h("p", { class: "lueckentext" },
    teile.map((t) => {
      if (!t.luecke) return document.createTextNode(t.text);
      const breite = Math.max(5, t.loesungen[0].length + 2);
      const feld = h("input", {
        type: "text", class: "lueckefeld", autocapitalize: "off", autocomplete: "off",
        autocorrect: "off", spellcheck: "false",
        style: `width:${breite}ch`, "aria-label": `Lücke ${luecken.length + 1}`,
      });
      luecken.push({ feld, teil: t });
      return feld;
    }));

  return {
    modus: "tippen",
    frage: () => [
      karte.titel ? h("p", { class: "prompt", text: karte.titel }) : null,
      h("div", { class: "antwort" }, absatz),
      h("p", { class: "prompt", text: `${luecken.length} ${luecken.length === 1 ? "Lücke" : "Lücken"} ausfüllen.` }),
    ],
    // Geprüft wird jederzeit; eine leere Lücke zählt als falsch.
    bereit: () => true,
    auswerten: () => {
      geprueft = true;
      let alle = true;
      for (const { feld, teil } of luecken) {
        const gut = stimmt(feld.value, teil.loesungen);
        feld.classList.add(gut ? "richtig" : "falsch");
        feld.readOnly = true;
        if (!gut) { feld.value = teil.loesungen[0]; alle = false; }
      }
      return alle;
    },
    antwort: () => {
      const mehrere = luecken.filter(({ teil }) => teil.loesungen.length > 1);
      const falsche = luecken.filter(({ feld }) => feld.classList.contains("falsch")).length;
      return h("div", { class: "antwort" },
        h("p", { class: mehrere.length || karte.notiz ? "multi" : "meta",
                 text: !geprueft ? "" : falsche
                   ? `${falsche} von ${luecken.length} daneben — oben richtig eingesetzt.`
                   : "Alle Lücken richtig." }),
        mehrere.map(({ teil }) =>
          h("p", { class: "meta", text: `Ebenso richtig: ${teil.loesungen.slice(1).join(", ")}` })),
        karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null);
    },
  };
}
