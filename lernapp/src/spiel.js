// Charaktererstellung und Kleiderkammer.
import { h, leere } from "./dom.js";
import { figurSvg } from "./figur.js";
import {
  held, aendere, ersetze, GEGENSTAENDE, PLAETZE, HAARE, HAARFARBEN, HAUTTOENE, FIGUREN,
  nachId, kaufe, trage, besitzt, traegt, rang, naechsterRang, platzIstPflicht,
} from "./held.js";

export const MUENZE = "◉";

// Das SVG wird als Zeichenkette gebaut; figur.js lässt nur geprüfte Farben
// und entschärfte Namen hindurch.
export function figurKasten(beuteFarben, klasse) {
  const kasten = h("div", { class: "figurkasten" });
  kasten.innerHTML = figurSvg(held(), beuteFarben, klasse || "figur");
  return kasten;
}

// Welche Farben trägt die erbeutete Fahne? Die des Bundes, bei dem sie
// abhandengekommen ist — und die stehen in den geprüften Stapeln.
export function beuteFarben(alleStapel) {
  const h0 = held();
  const id = h0.getragen && h0.getragen.trophaee;
  if (!id) return null;
  const g = nachId(id);
  const name = h0.beute && h0.beute[id];
  if (!g || !name) return null;
  const stapel = alleStapel.find((s) => s.id === g.quelle);
  if (!stapel) return null;
  const karte = stapel.karten.find((k) => k.antworten.some((a) => a.name === name));
  return karte ? karte.band.streifen.map((s) => s.farbe) : null;
}

function zufallsBeute(alleStapel, g) {
  const stapel = alleStapel.find((s) => s.id === g.quelle);
  if (!stapel) return null;
  const fremde = stapel.karten
    .flatMap((k) => k.antworten.map((a) => a.name))
    .filter((n) => !/Ingvaeonia/i.test(n));
  if (!fremde.length) return null;
  return fremde[Math.floor(Math.random() * fremde.length)];
}

// --------------------------------------------------- Charaktererstellung
export function heldAnlegen(fertig) {
  const wurzel = h("div", {});
  const erstmalig = !held().angelegt;

  const waehle = (werte, schluessel, baue) =>
    h("div", { class: "wahl" }, werte.map((w) => {
      const id = typeof w === "string" ? w : w.id;
      return h("button", {
        class: "wahlknopf", "aria-pressed": held()[schluessel] === id ? "true" : "false",
        onclick: () => { aendere({ [schluessel]: id }); zeichne(); },
      }, baue(w));
    }));

  function zeichne() {
    leere(wurzel);
    const name = held().name;
    wurzel.append(
      h("div", { class: "kopf" },
        h("h1", { text: erstmalig ? "Wer bist du?" : "Dein Held" }),
        erstmalig ? null : h("button", { class: "zurueck", onclick: fertig }, "Fertig")),
      erstmalig
        ? h("p", { class: "sub", text: "Bevor es losgeht: such dir aus, wer da lernen soll." })
        : null,

      figurKasten(null, "figur gross"),

      h("div", { class: "feld" }, h("label", {}, "Name",
        h("input", {
          type: "text", value: name, maxlength: 24, placeholder: "z. B. Jonas",
          oninput: (e) => { aendere({ name: e.currentTarget.value.slice(0, 24) }); pruefe(); },
        }))),

      h("h2", { text: "Statur" }),
      waehle(FIGUREN, "figur", (f) => f.name),

      h("h2", { text: "Frisur" }),
      waehle(HAARE, "haar", (f) => f.name),

      h("h2", { text: "Haarfarbe" }),
      h("div", { class: "wahl" }, HAARFARBEN.map((f) =>
        h("button", {
          class: "farbknopf", "aria-pressed": held().haarfarbe === f.id ? "true" : "false",
          "aria-label": `Haarfarbe ${f.id}`, style: `background:${f.wert}`,
          onclick: () => { aendere({ haarfarbe: f.id }); zeichne(); },
        }))),

      h("h2", { text: "Hautton" }),
      h("div", { class: "wahl" }, HAUTTOENE.map((t, i) =>
        h("button", {
          class: "farbknopf", "aria-pressed": held().haut === t ? "true" : "false",
          "aria-label": `Hautton ${i + 1}`, style: `background:${t}`,
          onclick: () => { aendere({ haut: t }); zeichne(); },
        }))),

      h("div", { class: "row" },
        h("button", {
          class: "solid", id: "fertigKnopf", disabled: !held().name.trim(),
          onclick: () => { aendere({ angelegt: true }); fertig(); },
        }, erstmalig ? "Los geht’s" : "Fertig")),
      h("p", { class: "hinweis",
        text: "Lässt sich später jederzeit ändern — die Ausrüstung bleibt." }),
    );
  }
  function pruefe() {
    const k = wurzel.querySelector("#fertigKnopf");
    if (k) k.disabled = !held().name.trim();
  }
  zeichne();
  return wurzel;
}

// ------------------------------------------------------- Kleiderkammer
export function kleiderkammer(alleStapel, zurueck) {
  const wurzel = h("div", {});

  function zeichne() {
    const hd = held();
    const r = rang(hd.verdient);
    const naechster = naechsterRang(hd.verdient);
    leere(wurzel);

    const gruppen = PLAETZE.map((p) => ({
      platz: p,
      stuecke: GEGENSTAENDE.filter((g) => g.platz === p.id && (g.preis > 0 || besitzt(g.id))),
    })).filter((gr) => gr.stuecke.length);

    wurzel.append(
      h("div", { class: "kopf" },
        h("h1", { text: "Kleiderkammer" }),
        h("button", { class: "zurueck", onclick: zurueck }, "Übersicht")),

      h("div", { class: "schaufenster" },
        figurKasten(beuteFarben(alleStapel), "figur"),
        h("div", { class: "beutel" },
          h("p", { class: "kontostand" }, MUENZE, " ", h("b", { text: String(hd.muenzen) })),
          h("p", { class: "meta", text: `${r.name} · insgesamt ${hd.verdient} verdient` }),
          naechster
            ? h("p", { class: "meta", text: `Noch ${naechster.ab - hd.verdient} bis ${naechster.name}.` })
            : h("p", { class: "meta", text: "Höchster Rang erreicht." }))),

      ...gruppen.flatMap(({ platz, stuecke }) => [
        h("h2", { text: platz.name }),
        h("ul", { class: "laden" }, stuecke.map((g) => zeile(g, hd))),
      ]),

      h("p", { class: "hinweis",
        text: "Coins gibt es für jede beantwortete Karte — für eine richtige mehr, "
          + "und für eine, die noch im ersten Fach steckt, am meisten. Auch „Falsch“ zahlt, "
          + "nur weniger: wer sich selbst belügt, lernt nichts." }),
    );
  }

  function zeile(g, hd) {
    const hat = besitzt(g.id);
    const an = traegt(g.id);
    const fehlt = g.preis - hd.muenzen;
    const beute = hd.beute && hd.beute[g.id];

    let knopf;
    if (!hat && fehlt > 0) {
      knopf = h("button", { class: "ghost", disabled: true }, `noch ${fehlt}`);
    } else if (!hat) {
      knopf = h("button", {
        class: "solid",
        onclick: () => {
          const name = g.quelle ? zufallsBeute(alleStapel, g) : null;
          if (kaufe(g, name)) {
            zeichne();
            if (name) alert(`Erbeutet: die Prunkfahne der ${name}.\n\nSie steht jetzt neben dir.`);
          }
        },
      }, `Kaufen · ${g.preis}`);
    } else if (an && platzIstPflicht(g.platz)) {
      knopf = h("button", { class: "ghost", disabled: true }, "An");
    } else {
      knopf = h("button", { class: an ? "solid" : "ghost",
        onclick: () => { trage(g); zeichne(); } }, an ? "Ablegen" : "Anlegen");
    }

    return h("li", { class: hat ? "besessen" : null },
      h("div", { class: "ware" },
        h("p", { class: "warenname" }, g.name, an ? h("span", { class: "marke", text: "getragen" }) : null),
        h("p", { class: "meta", text: beute ? `Erbeutet bei der ${beute}.` : g.beschreibung }),
        !hat ? h("p", { class: "preis" }, MUENZE, " ", String(g.preis)) : null),
      knopf);
  }

  zeichne();
  return wurzel;
}

// ------------------------------------------------------- Spielstand
// localStorage überlebt kein gelöschtes Browserprofil und reist nicht aufs
// nächste Gerät mit. Deshalb zusätzlich eine Datei zum Mitnehmen.
export function spielstandDaten(fortschritt) {
  return {
    was: "aeltestenrat-spielstand",
    version: 1,
    gesichert: new Date().toISOString().slice(0, 10),
    held: held(),
    fortschritt,
  };
}

export function spielstandLaden(daten, setzeFortschritt) {
  if (!daten || daten.was !== "aeltestenrat-spielstand") {
    throw new Error("Das ist kein Spielstand dieser App.");
  }
  if (daten.held) ersetze(daten.held);
  if (daten.fortschritt) setzeFortschritt(daten.fortschritt);
}

