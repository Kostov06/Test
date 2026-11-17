import { h, leere } from "./dom.js";
import { ladeStapel, lerneinheiten, hellPruefer } from "./decks.js";
import { erstelleKarte, band } from "./karten/index.js";
import { neueSitzung } from "./sitzung.js";
import { statistik, wasHakt, bezeichnung } from "./stats.js";
import { stand, istFaellig, hakt, FAECHER } from "./leitner.js";
import * as store from "./store.js";
import { redaktionsAnsicht } from "./redaktion.js";
import { held, verbuche, sitzungsBonus, rang, naechsterRang } from "./held.js";
import { heldAnlegen, kleiderkammer, figurKasten, beuteFarben, MUENZE,
         spielstandDaten, spielstandLaden } from "./spiel.js";
import { kneipspielAnsicht, kneipTaste, kneipeBeenden, SPIEL_STAPEL } from "./kneipspiel.js";

const wurzel = document.getElementById("app");
let alleStapel = [];
let kaputt = [];
let gewaehlt = new Set();
let modus = "faellig";       // faellig | alle | fehler
let sitzung = null;
let enthuellt = false;
let kartenObjekt = null;
let ergebnis = null;        // null = noch offen, sonst ob richtig beantwortet
let letzterLohn = null;     // was die eben beantwortete Karte eingebracht hat
let sitzungsLohn = 0;
let bonusGezahlt = false;

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
    knopfLernen.textContent = n ? `${n} ${n === 1 ? "Abfrage" : "Abfragen"} lernen` : "Nichts zu tun";
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
        h("b", { text: String(w.gesamt) }), w.gesamt === w.stapel.karten.length ? " Karten · " : " Abfragen · ",
        h("b", { text: String(w.sitzt) }), " sitzen",
        w.haken ? [" · ", h("b", { text: String(w.haken) }), " haken"] : null,
        w.faellig ? [" · ", h("b", { text: String(w.faellig) }), " fällig"] : null),
      faecherBalken(w))));
  }));

  aktualisiere();

  const hd = held();
  const r = rang(hd.verdient);
  const naechster = naechsterRang(hd.verdient);

  return [
    h("div", { class: "heldzeile" },
      h("button", {
        class: "heldknopf", onclick: () => { location.hash = "#/held"; },
        "aria-label": "Held ändern",
      }, figurKasten(beuteFarben(alleStapel), "figur klein")),
      h("div", { class: "heldtext" },
        h("p", { class: "heldname", text: hd.name || "Namenlos" }),
        h("p", { class: "meta", text: r.name }),
        h("p", { class: "kontostand" }, MUENZE, " ", h("b", { text: String(hd.muenzen) })),
        naechster
          ? h("p", { class: "meta", text: `noch ${naechster.ab - hd.verdient} bis ${naechster.name}` })
          : h("p", { class: "meta", text: "höchster Rang" })),
      h("button", { class: "ghost", onclick: () => { location.hash = "#/kleiderkammer"; } },
        "Kleiderkammer")),
    h("p", { class: "sub", text: "Stoff für die Neuen: Couleur, Comment, Verbandskunde, Geschichte, Kneiplatein." }),
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
    h("div", { class: "row" },
      h("button", { class: "ghost breit", onclick: () => { location.hash = "#/kneipspiel"; } },
        "Kneipspiel — eine Kneipe durchspielen")),
    h("div", { class: "row eng" },
      h("button", { class: "ghost", onclick: spielstandSichern }, "Stand sichern"),
      h("button", { class: "ghost", onclick: spielstandOeffnen }, "Stand laden")),
    h("p", { class: "hinweis" },
      "Fünf Fächer nach Leitner: gewusst rückt eine Karte ein Fach weiter (1 Tag, 3, 7, 21), ",
      "falsch setzt sie zurück auf Fach 1. Fortschritt, Coins und Ausrüstung liegen auf diesem ",
      "Gerät — wer das Handy wechselt oder den Browserspeicher leert, nimmt die Datei mit."),
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
  letzterLohn = null;
  ergebnis = null;
  sitzungsLohn = 0;
  bonusGezahlt = false;
  location.hash = "#/lernen";
}

function ansichtLernen() {
  if (!sitzung) { location.hash = "#/"; return []; }
  if (sitzung.fertig) return ansichtFertig();

  const einheit = sitzung.aktuell;
  if (!kartenObjekt) {
    kartenObjekt = erstelleKarte(einheit, {
      neuZeichnen: () => zeichne(),
      // Eine angetippte Wahl zählt sofort — kein „Gewusst“ hinterher,
      // bei dem man sich selbst belügen könnte.
      beiAntwort: (richtig) => { ergebnis = richtig; zeichne(); },
    });
    enthuellt = false;
    ergebnis = null;
  }

  const weiter = fortfahren;
  const spaeter = h("button", { class: "ghost",
    onclick: () => { sitzung.zurueckstellen(); kartenObjekt = null; ergebnis = null; zeichne(); } },
    "Später");

  const selbst = kartenObjekt.modus === "selbst";
  const beantwortet = selbst ? enthuellt : ergebnis !== null;

  let knoepfe;
  if (selbst && !enthuellt) {
    knoepfe = h("div", { class: "row" },
      h("button", { class: "solid", onclick: () => { enthuellt = true; zeichne(); } }, "Antwort zeigen"),
      spaeter);
  } else if (selbst) {
    knoepfe = h("div", { class: "row" },
      h("button", { onclick: () => weiter(false) }, "Falsch"),
      h("button", { class: "solid", onclick: () => weiter(true) }, "Gewusst"));
  } else if (!beantwortet && kartenObjekt.modus === "auswahl") {
    knoepfe = h("div", { class: "row" }, spaeter);     // das Antippen beantwortet
  } else if (!beantwortet) {
    knoepfe = h("div", { class: "row" },
      h("button", { class: "solid", disabled: kartenObjekt.bereit && !kartenObjekt.bereit(),
        onclick: () => { ergebnis = kartenObjekt.auswerten(); zeichne(); } }, "Prüfen"),
      spaeter);
  } else {
    knoepfe = h("div", { class: "row" },
      h("button", { class: "solid", onclick: () => weiter(ergebnis) }, "Weiter"));
  }

  const urteil = ergebnis === null ? null
    : h("p", { class: `urteil ${ergebnis ? "gut" : "schlecht"}`,
               text: ergebnis ? "Richtig." : "Daneben." });

  return [
    h("div", { class: "kopf" },
      h("p", { class: "sub", text: einheit.stapel.titel }),
      h("button", { class: "zurueck", onclick: () => { location.hash = "#/"; } }, "Übersicht")),
    kartenObjekt.frage(),
    kartenObjekt.feld ? kartenObjekt.feld() : null,
    urteil,
    beantwortet ? kartenObjekt.antwort() : null,
    knoepfe,
    h("div", { class: "score" },
      h("span", {}, "Offen ", h("b", { text: String(sitzung.schlange.length) }),
        " von ", h("b", { text: String(sitzung.gesamt) })),
      h("span", {},
        letzterLohn
          ? h("span", { class: "lohn" }, `+${letzterLohn.betrag + letzterLohn.bonus} `, MUENZE,
              letzterLohn.bonus ? h("b", { text: ` ${letzterLohn.serie}er-Serie!` }) : null)
          : null,
        " Richtig ", h("b", { text: String(sitzung.richtig) }),
        " · Falsch ", h("b", { text: String(sitzung.falsch) }))),
    h("p", { class: "hinweis tasten-hinweis", text: tastenHinweis(selbst, beantwortet) }),
  ];
}

function tastenHinweis(selbst, beantwortet) {
  if (beantwortet) return selbst ? "Tastatur: G gewusst, F falsch." : "Tastatur: Leertaste geht weiter.";
  if (selbst) return "Tastatur: Leertaste zeigt die Antwort, S stellt zurück.";
  if (kartenObjekt && kartenObjekt.modus === "auswahl") return "Tastatur: 1 bis 4 wählen, S stellt zurück.";
  return "Tastatur: Leertaste prüft, S stellt zurück.";
}

function ansichtFertig() {
  const s = sitzung;
  // Der Abschlussbonus wird einmal je Sitzung gezahlt, nicht bei jedem
  // Neuzeichnen dieses Bildes.
  if (!bonusGezahlt) {
    sitzungsLohn += sitzungsBonus();
    bonusGezahlt = true;
  }
  const hd = held();
  return [
    h("h1", { text: "Durch." }),
    h("p", { class: "sub",
      text: `${s.gesamt} Abfragen, ${s.richtig} mal gewusst, ${s.falsch} mal falsch.` }),
    figurKasten(beuteFarben(alleStapel), "figur"),
    h("div", { class: "antwort" },
      h("p", { class: "ausbeute" }, "+", h("b", { text: String(sitzungsLohn) }), " ", MUENZE,
        h("span", { class: "meta", text: "  in dieser Sitzung" })),
      h("p", { class: "meta", text: `Kontostand: ${hd.muenzen} · Rang: ${rang(hd.verdient).name}` })),
    h("div", { class: "row" },
      h("button", { class: "solid", onclick: () => { location.hash = "#/"; } }, "Zur Übersicht"),
      h("button", { class: "ghost", onclick: () => { location.hash = "#/kleiderkammer"; } },
        "Kleiderkammer")),
  ];
}

// -------------------------------------------------------------- Statistik
function ansichtStatistik() {
  const werte = alleStapel.map(statistik);
  return [
    h("div", { class: "kopf" },
      h("h1", { text: "Statistik" }),
      h("button", { class: "zurueck", onclick: () => { location.hash = "#/"; } }, "Übersicht")),
    h("div", { class: "tabellenrahmen" }, h("table", { class: "tabelle" },
      h("thead", {}, h("tr", {},
        h("th", { text: "Stapel" }),
        h("th", { class: "zahl", text: "Karten" }),
        h("th", { class: "zahl", text: "Abfragen" }),
        h("th", { class: "zahl", text: "neu" }),
        h("th", { class: "zahl", text: "sitzen" }),
        h("th", { class: "zahl", text: "haken" }))),
      h("tbody", {}, werte.map((w) => h("tr", {},
        h("td", { text: w.stapel.titel }),
        h("td", { class: "zahl", text: String(w.stapel.karten.length) }),
        h("td", { class: "zahl", text: String(w.gesamt) }),
        h("td", { class: "zahl", text: String(w.neu) }),
        h("td", { class: "zahl", text: String(w.sitzt) }),
        h("td", { class: "zahl", text: String(w.haken) })))))),
    h("p", { class: "hinweis",
      text: `„Sitzen“ heißt Fach 4 oder 5 von ${FAECHER}, „haken“ heißt: zuletzt falsch und noch in Fach 1 oder 2. `
        + "Ein Begriff, der in beide Richtungen abgefragt wird, ist eine Karte, aber zwei Abfragen." }),
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
  else if (route === "#/held") inhalt = heldAnlegen(
    () => { location.hash = "#/"; },
    // Von vorn: auch den Lernfortschritt verwerfen, dann neu anlegen.
    () => { store.zuruecksetzen(); sitzung = null; kneipeBeenden(); gewaehlt = new Set(alleStapel.map((x) => x.id)); zeichne(); });
  else if (route === "#/kleiderkammer") inhalt = kleiderkammer(alleStapel, () => { location.hash = "#/"; });
  else if (route === "#/kneipspiel") inhalt = kneipspielAnsicht(
    alleStapel.find((s) => s.id === SPIEL_STAPEL),
    { zurueck: () => { location.hash = "#/"; }, neuZeichnen: () => zeichne() });
  // Die Redaktion steht nicht mehr auf der Startseite — die Neuen brauchen
  // sie nicht. Über die Adresse bleibt sie erreichbar.
  else if (route === "#/redaktion") inhalt = redaktionsAnsicht(alleStapel, kaputt, () => { location.hash = "#/"; });
  else inhalt = ansichtStart();
  for (const teil of [inhalt].flat(Infinity)) if (teil) wurzel.append(teil);
}

// --------------------------------------------------------- Spielstand
function spielstandSichern() {
  const daten = spielstandDaten(store.alleDaten());
  const name = (held().name || "held").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "held";
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(daten, null, 2) + "\n"], { type: "application/json" }));
  const a = h("a", { href: url, download: `aeltestenrat-${name}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function spielstandOeffnen() {
  const eingabe = h("input", {
    type: "file", accept: ".json,application/json", style: "display:none",
    onchange: (ev) => {
      const datei = ev.currentTarget.files[0];
      if (!datei) return;
      const leser = new FileReader();
      leser.onload = () => {
        try {
          const daten = JSON.parse(leser.result);
          const hd = daten.held || {};
          if (!confirm(`Spielstand von „${hd.name || "ohne Namen"}“ vom ${daten.gesichert || "?"} laden?\n\n`
              + "Der Fortschritt auf diesem Gerät wird dabei überschrieben.")) return;
          spielstandLaden(daten, store.ersetzeAlles);
          location.hash = "#/";
          zeichne();
        } catch (fehler) {
          alert(`Konnte nicht geladen werden: ${fehler.message}`);
        }
      };
      leser.readAsText(datei);
    },
  });
  document.body.append(eingabe);
  eingabe.click();
  setTimeout(() => eingabe.remove(), 60000);
}

function tasten(ev) {
  if (location.hash === "#/kneipspiel") {
    if (kneipTaste(ev)) ev.preventDefault();
    return;
  }
  if (location.hash !== "#/lernen" || !sitzung || sitzung.fertig || !kartenObjekt) return;
  const ziel = ev.target;
  if (ziel && (ziel.matches("input, textarea, select") || ziel.isContentEditable)) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

  // Leertaste und Enter lösen einen fokussierten Knopf schon selbst aus.
  // Griffe die Abkürzung zusätzlich, passierte zweierlei auf einen Druck.
  const aufKnopf = ziel && ziel.tagName === "BUTTON";
  const taste = ev.key.toLowerCase();
  const leer = ev.key === " " || taste === "enter";
  const selbst = kartenObjekt.modus === "selbst";
  const beantwortet = selbst ? enthuellt : ergebnis !== null;

  const tu = (fn) => { ev.preventDefault(); fn(); };

  if (!beantwortet && taste === "s") {
    return tu(() => { sitzung.zurueckstellen(); kartenObjekt = null; ergebnis = null; zeichne(); });
  }
  if (!beantwortet && kartenObjekt.modus === "auswahl" && /^[1-9]$/.test(ev.key)) {
    return tu(() => kartenObjekt.waehle(Number(ev.key)));
  }
  if (leer && aufKnopf) return;
  if (!beantwortet && leer) {
    if (selbst) return tu(() => { enthuellt = true; zeichne(); });
    if (kartenObjekt.auswerten && (!kartenObjekt.bereit || kartenObjekt.bereit())) {
      return tu(() => { ergebnis = kartenObjekt.auswerten(); zeichne(); });
    }
    return;
  }
  if (beantwortet && !selbst && leer) {
    return tu(() => fortfahren(ergebnis));
  }
  if (beantwortet && selbst && (taste === "g" || taste === "j")) return tu(() => fortfahren(true));
  if (beantwortet && selbst && (taste === "f" || taste === "n")) return tu(() => fortfahren(false));
}

// Ein Weg nach vorn für Knöpfe und Tastatur. Das Fach vor der Bewertung
// bestimmt den Lohn: eine Karte, die noch im ersten Fach steckt, bringt
// am meisten.
function fortfahren(gewusst) {
  const einheit = sitzung.aktuell;
  if (!einheit) return;
  const altesFach = stand(einheit).fach;
  sitzung.antworte(gewusst);
  letzterLohn = verbuche(gewusst, altesFach);
  sitzungsLohn += letzterLohn.betrag + letzterLohn.bonus;
  kartenObjekt = null;
  enthuellt = false;
  ergebnis = null;
  zeichne();
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

  // Ohne Helden geht gar nichts — der steht am Anfang.
  if (!held().angelegt && location.hash !== "#/held") {
    location.hash = "#/held";
    if (location.hash !== "#/held") zeichne();
  } else {
    zeichne();
  }
}

start();
