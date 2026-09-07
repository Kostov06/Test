import { h, leere } from "./dom.js";
import { ladeStapel, lerneinheiten, hellPruefer } from "./decks.js";
import { erstelleKarte, band } from "./karten/index.js";
import { neueSitzung } from "./sitzung.js";
import { statistik, wasHakt, bezeichnung } from "./stats.js";
import { stand, istFaellig, hakt, FAECHER } from "./leitner.js";
import * as store from "./store.js";
import { redaktionsAnsicht } from "./redaktion.js";

const wurzel = document.getElementById("app");
let alleStapel = [];
let kaputt = [];
let gewaehlt = new Set();
let modus = "faellig";       // faellig | alle | fehler
let sitzung = null;
let enthuellt = false;
let kartenObjekt = null;

// ------------------------------------------------------------------ Start
function ansichtStart() {
  const werte = alleStapel.map(statistik);
  const gewaehlteEinheiten = () =>
    werte.filter((w) => gewaehlt.has(w.stapel.id)).flatMap((w) => w.einheiten);

  const zaehle = () => {
    const e = gewaehlteEinheiten();
    if (modus === "alle") return e.length;
    if (modus === "fehler") return e.filter((x) => hakt(stand(x))).length;
    return e.filter((x) => istFaellig(stand(x))).length;
  };

  const knopfLernen = h("button", { class: "solid", onclick: () => starteSitzung() });
  const aktualisiere = () => {
    const n = zaehle();
    knopfLernen.textContent = n ? `${n} Karten lernen` : "Nichts zu tun";
    knopfLernen.disabled = n === 0;
  };

  const modusKnopf = (wert, beschriftung) =>
    h("button", {
      "aria-pressed": modus === wert ? "true" : "false",
      onclick: (ev) => {
        modus = wert;
        for (const b of ev.currentTarget.parentElement.children) {
          b.setAttribute("aria-pressed", String(b === ev.currentTarget));
        }
        aktualisiere();
      },
    }, beschriftung);

  const liste = h("ul", { class: "stapel" }, werte.map((w) => {
    const kasten = h("input", {
      type: "checkbox", checked: gewaehlt.has(w.stapel.id),
      onchange: (ev) => {
        if (ev.currentTarget.checked) gewaehlt.add(w.stapel.id);
        else gewaehlt.delete(w.stapel.id);
        store.setzeAuswahl([...gewaehlt]);
        aktualisiere();
      },
    });
    return h("li", {}, h("label", {}, kasten, h("div", {},
      h("div", { class: "titel", text: w.stapel.titel }),
      h("div", { class: "zeile" },
        h("b", { text: String(w.gesamt) }), " Karten · ",
        h("b", { text: String(w.sitzt) }), " sitzen",
        w.haken ? [" · ", h("b", { text: String(w.haken) }), " haken"] : null,
        w.faellig ? [" · ", h("b", { text: String(w.faellig) }), " fällig"] : null),
      faecherBalken(w))));
  }));

  aktualisiere();

  return [
    h("h1", { text: "Ältestenrat" }),
    h("p", { class: "sub", text: "Stoff für die Neuen: Couleur, Comment, Verbandskunde, Geschichte." }),
    kaputt.length ? h("p", { class: "fehler" },
      `${kaputt.length} Stapel konnten nicht geladen werden: ${kaputt.map((k) => k.id).join(", ")}. `,
      "Die Redaktionsansicht sagt, was fehlt.") : null,
    !store.speicherVerfuegbar() ? h("p", { class: "fehler",
      text: "Dieses Gerät lässt keinen Speicher zu — der Fortschritt gilt nur für diese Sitzung." }) : null,
    h("div", { class: "modes" },
      modusKnopf("faellig", "Fällige"),
      modusKnopf("alle", "Alle"),
      modusKnopf("fehler", "Nur Fehler")),
    liste,
    h("div", { class: "row" },
      knopfLernen,
      h("button", { class: "ghost", onclick: () => { location.hash = "#/statistik"; } }, "Statistik")),
    h("div", { class: "row eng" },
      h("button", { class: "ghost", onclick: () => { location.hash = "#/redaktion"; } }, "Redaktion")),
    h("p", { class: "hinweis" },
      "Fünf Fächer nach Leitner: gewusst rückt eine Karte ein Fach weiter (1 Tag, 3, 7, 21), ",
      "falsch setzt sie zurück auf Fach 1. Der Fortschritt bleibt auf diesem Gerät."),
  ];

  function faecherBalken(w) {
    if (!w.gesamt) return null;
    return h("div", { class: "faecher", "aria-hidden": "true" },
      w.faecher.map((n, i) => n
        ? h("span", { class: `f${i + 1}`, style: `flex:${n} 0 auto` })
        : null),
      w.faecher.reduce((a, b) => a + b, 0) < w.gesamt ? h("span", { class: "f0", style: "flex:1" }) : null);
  }
}

// ----------------------------------------------------------------- Lernen
function starteSitzung() {
  const einheiten = alleStapel
    .filter((s) => gewaehlt.has(s.id))
    .flatMap((s) => lerneinheiten(s));
  sitzung = neueSitzung(einheiten, modus);
  enthuellt = false;
  kartenObjekt = null;
  location.hash = "#/lernen";
}

function ansichtLernen() {
  if (!sitzung) { location.hash = "#/"; return []; }
  if (sitzung.fertig) return ansichtFertig();

  const einheit = sitzung.aktuell;
  if (!kartenObjekt) {
    kartenObjekt = erstelleKarte(einheit, () => zeichne());
    enthuellt = false;
  }

  const weiter = (gewusst) => {
    sitzung.antworte(gewusst);
    kartenObjekt = null;
    enthuellt = false;
    zeichne();
  };

  const kannEnthuellen = !kartenObjekt.bereit || kartenObjekt.bereit();
  const vorschlag = enthuellt && kartenObjekt.vorschlag ? kartenObjekt.vorschlag() : null;

  const knoepfe = enthuellt
    ? h("div", { class: "row" },
        h("button", { class: vorschlag === false ? "solid" : null, onclick: () => weiter(false) }, "Falsch"),
        h("button", { class: vorschlag === null || vorschlag === true ? "solid" : null,
                      onclick: () => weiter(true) }, "Gewusst"))
    : h("div", { class: "row" },
        h("button", { class: "solid", disabled: !kannEnthuellen,
                      onclick: () => { enthuellt = true; zeichne(); } }, "Antwort zeigen"),
        h("button", { class: "ghost", onclick: () => { sitzung.zurueckstellen(); kartenObjekt = null; zeichne(); } },
          "Später"));

  return [
    h("div", { class: "kopf" },
      h("p", { class: "sub", text: einheit.stapel.titel }),
      h("button", { class: "zurueck", onclick: () => { location.hash = "#/"; } }, "Übersicht")),
    kartenObjekt.frage(),
    enthuellt ? kartenObjekt.antwort() : null,
    knoepfe,
    h("div", { class: "score" },
      h("span", {}, "Offen ", h("b", { text: String(sitzung.schlange.length) }),
        " von ", h("b", { text: String(sitzung.gesamt) })),
      h("span", {}, "Gewusst ", h("b", { text: String(sitzung.richtig) }),
        " · Falsch ", h("b", { text: String(sitzung.falsch) }))),
    h("p", { class: "hinweis tasten-hinweis", text: enthuellt
      ? "Tastatur: G gewusst, F falsch."
      : "Tastatur: Leertaste zeigt die Antwort, S stellt zurück." }),
  ];
}

function ansichtFertig() {
  const s = sitzung;
  return [
    h("h1", { text: "Durch." }),
    h("p", { class: "sub",
      text: `${s.gesamt} Karten, ${s.richtig} mal gewusst, ${s.falsch} mal falsch.` }),
    h("div", { class: "row" },
      h("button", { class: "solid", onclick: () => { location.hash = "#/"; } }, "Zur Übersicht")),
  ];
}

// -------------------------------------------------------------- Statistik
function ansichtStatistik() {
  const werte = alleStapel.map(statistik);
  return [
    h("div", { class: "kopf" },
      h("h1", { text: "Statistik" }),
      h("button", { class: "zurueck", onclick: () => { location.hash = "#/"; } }, "Übersicht")),
    h("table", { class: "tabelle" },
      h("thead", {}, h("tr", {},
        h("th", { text: "Stapel" }),
        h("th", { class: "zahl", text: "Karten" }),
        h("th", { class: "zahl", text: "neu" }),
        h("th", { class: "zahl", text: "sitzen" }),
        h("th", { class: "zahl", text: "haken" }))),
      h("tbody", {}, werte.map((w) => h("tr", {},
        h("td", { text: w.stapel.titel }),
        h("td", { class: "zahl", text: String(w.gesamt) }),
        h("td", { class: "zahl", text: String(w.neu) }),
        h("td", { class: "zahl", text: String(w.sitzt) }),
        h("td", { class: "zahl", text: String(w.haken) }))))),
    h("p", { class: "hinweis",
      text: `„Sitzen“ heißt Fach 4 oder 5 von ${FAECHER}, „haken“ heißt: zuletzt falsch und noch in Fach 1 oder 2.` }),
    ...werte.flatMap((w) => {
      const liste = wasHakt(w.stapel);
      if (!liste.length) return [];
      return [
        h("h2", { text: `Was hakt — ${w.stapel.titel}` }),
        h("ul", { class: "hakt" }, liste.map(({ einheit, s }) => h("li", {},
          h("span", { class: "was" },
            einheit.karte.typ === "couleur"
              ? band(einheit.karte, hellPruefer(einheit.stapel), "miniband")
              : null,
            bezeichnung(einheit)),
          h("span", { class: "wie", text: `${s.falsch}× falsch · Fach ${s.fach}` })))),
      ];
    }),
    werte.every((w) => !wasHakt(w.stapel).length)
      ? h("p", { class: "leer", text: "Nichts hakt gerade." }) : null,
  ];
}

// ---------------------------------------------------------------- Rahmen
function zeichne() {
  const route = location.hash || "#/";
  leere(wurzel);
  let inhalt;
  if (route === "#/lernen") inhalt = ansichtLernen();
  else if (route === "#/statistik") inhalt = ansichtStatistik();
  else if (route === "#/redaktion") inhalt = redaktionsAnsicht(alleStapel, kaputt, () => { location.hash = "#/"; });
  else inhalt = ansichtStart();
  for (const teil of [inhalt].flat(Infinity)) if (teil) wurzel.append(teil);
}

function tasten(ev) {
  if (location.hash !== "#/lernen" || !sitzung || sitzung.fertig) return;
  const ziel = ev.target;
  if (ziel && (ziel.matches("input, textarea, select") || ziel.isContentEditable)) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

  const taste = ev.key.toLowerCase();
  if (!enthuellt && (ev.key === " " || taste === "enter")) {
    if (!kartenObjekt.bereit || kartenObjekt.bereit()) {
      ev.preventDefault(); enthuellt = true; zeichne();
    }
  } else if (!enthuellt && taste === "s") {
    ev.preventDefault(); sitzung.zurueckstellen(); kartenObjekt = null; zeichne();
  } else if (enthuellt && (taste === "g" || taste === "j")) {
    ev.preventDefault(); sitzung.antworte(true); kartenObjekt = null; enthuellt = false; zeichne();
  } else if (enthuellt && (taste === "f" || taste === "n")) {
    ev.preventDefault(); sitzung.antworte(false); kartenObjekt = null; enthuellt = false; zeichne();
  }
}

async function start() {
  try {
    const geladen = await ladeStapel();
    alleStapel = geladen.stapel;
    kaputt = geladen.kaputt;
  } catch (fehler) {
    wurzel.append(h("p", { class: "fehler" },
      "Die Stapel konnten nicht geladen werden: ", String(fehler.message || fehler), ". ",
      "Beim Öffnen per Doppelklick benutze bitte die Einzeldatei lernapp.html."));
    return;
  }

  const gemerkt = store.auswahl();
  const bekannt = new Set(alleStapel.map((s) => s.id));
  gewaehlt = new Set(
    (gemerkt && gemerkt.filter((id) => bekannt.has(id)).length ? gemerkt.filter((id) => bekannt.has(id))
      : alleStapel.map((s) => s.id)));

  window.addEventListener("hashchange", () => {
    if (location.hash === "#/lernen" && !sitzung) location.hash = "#/";
    else zeichne();
  });
  document.addEventListener("keydown", tasten);
  zeichne();
}

start();
