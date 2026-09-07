// Redaktionsansicht: Stapel pflegen, ohne JSON zu tippen.
// Sie schreibt nichts auf die Platte — sie gibt eine Datei aus, die nach
// decks/ gehört. Bei Couleur ist die Bandvorschau der eigentliche Zweck:
// ein Farbfehler fällt im Bild auf, in einer Zeichenkette nicht.
import { h, leere } from "./dom.js";
import { pruefeStapel, TYPEN, istHell } from "./schema.js";
import { band } from "./karten/couleur.js";
import { zerlege } from "./karten/lueckentext.js";
import { bezeichnung } from "./stats.js";

const kopie = (x) => JSON.parse(JSON.stringify(x));
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const slug = (s) => (s || "").toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "karte";

function freieId(stapel, wunsch, ausser = null) {
  const belegt = new Set(stapel.karten.filter((k) => k !== ausser).map((k) => k.id));
  let id = slug(wunsch), n = 2;
  while (belegt.has(id)) id = `${slug(wunsch)}-${n++}`;
  return id;
}

const heuteIso = () => new Date().toISOString().slice(0, 10);

// -------------------------------------------------------------- Bausteine
function feld(beschriftung, el) {
  return h("div", { class: "feld" }, h("label", {}, beschriftung, el));
}
const textFeld = (wert, beiEingabe) =>
  h("input", { type: "text", value: wert || "", oninput: (e) => beiEingabe(e.currentTarget.value) });
const flaeche = (wert, beiEingabe, klasse) =>
  h("textarea", { class: klasse || null, oninput: (e) => beiEingabe(e.currentTarget.value) }, wert || "");

function zeilenFeld(beschriftung, werte, beiEingabe, hinweis) {
  const el = flaeche((werte || []).join("\n"), (v) =>
    beiEingabe(v.split("\n").map((z) => z.trim()).filter(Boolean)));
  return h("div", { class: "feld" },
    h("label", {}, beschriftung, el),
    hinweis ? h("p", { class: "hinweis", text: hinweis }) : null);
}

// ----------------------------------------------------------- Karteneditor
function couleurEditor(karte, neuZeichnen) {
  karte.band = karte.band || { streifen: [{ farbe: "#000000" }, { farbe: "#ffffff" }] };
  karte.antworten = karte.antworten || [{ name: "" }];

  const vorschau = h("div", {});
  const zeichneVorschau = () => {
    leere(vorschau);
    const gueltig = karte.band.streifen.every((s) => /^#[0-9a-fA-F]{6}$/.test(s.farbe || ""));
    vorschau.append(gueltig
      ? band(karte, istHell)
      : h("p", { class: "fehler", text: "Sobald alle Streifen einen Hex-Wert wie #aabbcc haben, steht hier das Band." }));
  };
  zeichneVorschau();

  const streifenZeilen = karte.band.streifen.map((s, i) => {
    const hexEingabe = h("input", {
      type: "text", value: s.farbe, "aria-label": `Streifen ${i + 1}, Farbwert`,
      oninput: (e) => {
        s.farbe = e.currentTarget.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(s.farbe)) waehler.value = s.farbe.toLowerCase();
        zeichneVorschau();
      },
    });
    const waehler = h("input", {
      type: "color", value: /^#[0-9a-fA-F]{6}$/.test(s.farbe) ? s.farbe.toLowerCase() : "#000000",
      "aria-label": `Streifen ${i + 1}, Farbe wählen`,
      oninput: (e) => { s.farbe = e.currentTarget.value; hexEingabe.value = s.farbe; zeichneVorschau(); },
    });
    return h("div", { class: "streifen" }, waehler, hexEingabe,
      h("input", {
        type: "text", class: "breite", value: s.breite ?? "", placeholder: "Breite",
        "aria-label": `Streifen ${i + 1}, Breite`,
        oninput: (e) => {
          const v = e.currentTarget.value.trim().replace(",", ".");
          if (v === "" || v === "1") delete s.breite; else s.breite = Number(v);
          zeichneVorschau();
        },
      }),
      h("button", {
        "aria-label": `Streifen ${i + 1} entfernen`,
        onclick: () => { karte.band.streifen.splice(i, 1); neuZeichnen(); },
      }, "−"));
  });

  return [
    h("h2", { text: "Farbband" }),
    vorschau,
    h("div", { style: "margin-top:14px" }, streifenZeilen),
    h("div", { class: "row eng" },
      h("button", { class: "ghost", onclick: () => { karte.band.streifen.push({ farbe: "#ffffff" }); neuZeichnen(); } },
        "Streifen anfügen")),
    h("p", { class: "hinweis",
      text: "Breite leer oder 1 heißt: gleich breit wie die übrigen. Für Perkussionen und dünne Streifen etwas wie 0.05, für einen Grund außen 0.5." }),
    feld("Farben im Klartext", textFeld(karte.farben, (v) => { karte.farben = v; })),
    h("h2", { text: "Bünde" }),
    ...karte.antworten.map((a, i) => h("div", { class: "feld" },
      h("label", {}, `Bund ${i + 1}`,
        textFeld(a.name, (v) => { a.name = v; })),
      h("div", { class: "streifen" },
        h("input", { type: "text", value: a.ort || "", placeholder: "Ort",
          "aria-label": `Bund ${i + 1}, Ort`, oninput: (e) => { a.ort = e.currentTarget.value || undefined; } }),
        h("input", { type: "text", value: a.jahr || "", placeholder: "Jahr",
          "aria-label": `Bund ${i + 1}, Jahr`,
          oninput: (e) => { const v = e.currentTarget.value.trim(); a.jahr = v ? Number(v) : undefined; } }),
        h("input", { type: "text", value: a.verband || "", placeholder: "Verband",
          "aria-label": `Bund ${i + 1}, Verband`, oninput: (e) => { a.verband = e.currentTarget.value || undefined; } }),
        karte.antworten.length > 1
          ? h("button", { "aria-label": `Bund ${i + 1} entfernen`,
              onclick: () => { karte.antworten.splice(i, 1); neuZeichnen(); } }, "−")
          : null),
      h("input", { type: "text", value: a.anmerkung || "", placeholder: "Anmerkung",
        "aria-label": `Bund ${i + 1}, Anmerkung`,
        oninput: (e) => { a.anmerkung = e.currentTarget.value || undefined; } }))),
    h("div", { class: "row eng" },
      h("button", { class: "ghost", onclick: () => { karte.antworten.push({ name: "" }); neuZeichnen(); } },
        "Weiteren Bund anfügen")),
    h("p", { class: "hinweis",
      text: "Mehrere Bünde auf einer Karte sind der Normalfall, wenn sie dieselben Farben führen." }),
  ];
}

function kartenEditor(karte, neuZeichnen) {
  if (karte.typ === "couleur") return couleurEditor(karte, neuZeichnen);

  if (karte.typ === "frage") {
    return [
      feld("Frage", flaeche(karte.frage, (v) => { karte.frage = v; })),
      zeilenFeld("Antworten", karte.antworten, (v) => { karte.antworten = v; },
        "Eine Antwort je Zeile. Mehrere Zeilen heißt: jede davon gilt."),
    ];
  }

  if (karte.typ === "begriff") {
    return [
      feld("Begriff", textFeld(karte.begriff, (v) => { karte.begriff = v; })),
      feld("Definition", flaeche(karte.definition, (v) => { karte.definition = v; })),
      feld("Abfragerichtung", h("select", {
        onchange: (e) => { karte.richtung = e.currentTarget.value; },
      },
        h("option", { value: "beide", selected: (karte.richtung || "beide") === "beide" }, "In beide Richtungen"),
        h("option", { value: "begriff-definition", selected: karte.richtung === "begriff-definition" }, "Begriff → Definition"),
        h("option", { value: "definition-begriff", selected: karte.richtung === "definition-begriff" }, "Definition → Begriff"))),
      h("p", { class: "hinweis",
        text: "„In beide Richtungen“ zählt als zwei Karten im Fortschritt — sonst gilt sie als gekonnt, obwohl nur eine Richtung sitzt." }),
    ];
  }

  if (karte.typ === "lueckentext") {
    const vorschau = h("p", { class: "lueckentext" });
    const zeichneVorschau = () => {
      leere(vorschau);
      const teile = zerlege(karte.text || "");
      for (const t of teile) {
        vorschau.append(t.luecke
          ? h("span", { class: "luecke gefuellt", text: t.loesungen[0] })
          : document.createTextNode(t.text));
      }
      if (!teile.some((t) => t.luecke)) {
        leere(vorschau).append(h("span", { class: "fehler", text: "Noch keine Lücke — Lücken werden {{so}} markiert." }));
      }
    };
    const el = flaeche(karte.text, (v) => { karte.text = v; zeichneVorschau(); });
    zeichneVorschau();
    return [
      feld("Überschrift", textFeld(karte.titel, (v) => { karte.titel = v; })),
      h("div", { class: "feld" }, h("label", {}, "Text mit Lücken", el),
        h("p", { class: "hinweis", text: "Lücken werden {{so}} markiert, Alternativen {{so|oder so}}." })),
      h("h2", { text: "So sieht es aus" }),
      h("div", { class: "antwort" }, vorschau),
    ];
  }

  if (karte.typ === "reihenfolge") {
    const alsText = (karte.elemente || []).map((e) => (Array.isArray(e) ? e.join(" | ") : e));
    return [
      feld("Frage", flaeche(karte.frage, (v) => { karte.frage = v; })),
      zeilenFeld("Elemente in der richtigen Reihenfolge", alsText, (zeilen) => {
        karte.elemente = zeilen.map((z) => {
          const teile = z.split("|").map((s) => s.trim()).filter(Boolean);
          return teile.length > 1 ? teile : teile[0];
        });
      }, "Ein Element je Zeile. Stehen mehrere Elemente durch | getrennt in einer Zeile, ist ihre Reihenfolge untereinander egal."),
    ];
  }
  return [];
}

// ------------------------------------------------------------ Schnelleingabe
const MUSTER = { "f:": "frage", "b:": "begriff", "l:": "lueckentext", "r:": "reihenfolge" };

export function ausSchnelleingabe(text) {
  const bloecke = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const karten = [], fehler = [];

  bloecke.forEach((block, nr) => {
    const zeilen = block.split("\n").map((z) => z.trim()).filter(Boolean);
    const marke = (zeilen[0] || "").slice(0, 2).toLowerCase();
    const typ = MUSTER[marke];
    if (!typ) { fehler.push(`Block ${nr + 1}: beginnt nicht mit F:, B:, L: oder R:`); return; }

    const nimm = (buchstabe) => zeilen
      .filter((z) => z.slice(0, 2).toLowerCase() === `${buchstabe}:`)
      .map((z) => z.slice(2).trim());
    const erste = (buchstabe) => nimm(buchstabe)[0] || "";
    const notiz = erste("n");
    const karte = { id: "", typ, rev: 1 };

    if (typ === "frage") {
      karte.frage = erste("f");
      karte.antworten = nimm("a");
      if (!karte.antworten.length) fehler.push(`Block ${nr + 1}: keine Antwort (A:)`);
    } else if (typ === "begriff") {
      karte.begriff = erste("b");
      karte.definition = erste("d");
      karte.richtung = "beide";
      if (!karte.definition) fehler.push(`Block ${nr + 1}: keine Definition (D:)`);
    } else if (typ === "lueckentext") {
      karte.titel = erste("l");
      karte.text = nimm("t").join("\n");
      if (!/\{\{[^{}]+\}\}/.test(karte.text)) fehler.push(`Block ${nr + 1}: der Text (T:) hat keine {{Lücke}}`);
    } else if (typ === "reihenfolge") {
      karte.frage = erste("r");
      karte.elemente = nimm("e").map((z) => {
        const teile = z.split("|").map((s) => s.trim()).filter(Boolean);
        return teile.length > 1 ? teile : teile[0];
      });
      if (karte.elemente.length < 2) fehler.push(`Block ${nr + 1}: weniger als zwei Elemente (E:)`);
    }
    if (notiz) karte.notiz = notiz;
    karten.push(karte);
  });
  return { karten, fehler };
}

const SCHNELL_HILFE = `F: Mit welchem Satz eröffnet der Präside die Kneipe?
A: Das Kommando dieser Veranstaltung liegt bei mir und nur bei mir.

B: Farbenführend
D: Die Mitglieder führen Farben zu bestimmten Anlässen mit sich.
N: Viele SV-Bünde sind farbenführend.

L: Bundeslied, 2. Strophe
T: Frei ist das {{Herz}}, und frei das {{Lied}},

R: Bringe die Teile eines Kneipabends in die richtige Reihenfolge.
E: Officium
E: Inoffizium
E: Bierdorf`;

// ------------------------------------------------------------------ Ansicht
export function redaktionsAnsicht(stapel, kaputt, zurueck) {
  const wurzel = h("div", {});
  let entwurf = null;      // der Stapel, der gerade bearbeitet wird
  let original = null;     // zum Vergleich, damit rev nur bei echter Änderung steigt
  let offen = null;        // die Karte, die gerade offen ist

  const neuZeichnen = () => { leere(wurzel); wurzel.append(...zeichne()); };

  function ladeDatei(datei) {
    const leser = new FileReader();
    leser.onload = () => {
      try {
        const s = JSON.parse(leser.result);
        entwurf = s; original = kopie(s); offen = null; neuZeichnen();
      } catch (e) {
        alert(`Diese Datei ist kein gültiges JSON: ${e.message}`);
      }
    };
    leser.readAsText(datei);
  }

  function speichereKarte() {
    if (!offen) return;
    // Eine neue Karte bekommt ihre Kennung aus dem ersten Inhalt.
    if (!offen.karte.id) {
      offen.karte.id = freieId(entwurf,
        offen.karte.frage || offen.karte.begriff || offen.karte.titel ||
        (offen.karte.antworten && offen.karte.antworten[0] && offen.karte.antworten[0].name) ||
        offen.karte.typ,
        offen.karte);
    }
    // rev steigt nur, wenn sich am Inhalt wirklich etwas geändert hat —
    // dann fällt die Karte bei allen zurück in Fach 1.
    const alt = (original.karten || []).find((k) => k.id === offen.urspruenglicheId);
    const neu = { ...offen.karte };
    delete neu.urspruenglicheId;
    if (alt) {
      const a = { ...alt }, b = { ...neu };
      delete a.rev; delete b.rev;
      neu.rev = gleich(a, b) ? alt.rev : alt.rev + 1;
    }
    const platz = entwurf.karten.indexOf(offen.karte);
    if (platz >= 0) entwurf.karten[platz] = neu; else entwurf.karten.push(neu);
    offen = null;
    neuZeichnen();
  }

  // Die Stapel liegen schon geladen vor — auch in der Einzeldatei-Fassung.
  // Bearbeitet wird eine Kopie, damit ein Abbruch die laufende Sitzung nicht
  // durcheinanderbringt.
  function lade(s) {
    entwurf = kopie(s); original = kopie(s); offen = null; neuZeichnen();
  }

  function herunterladen() {
    const text = JSON.stringify(entwurf, null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = h("a", { href: url, download: `${entwurf.id}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------------------------------------------------- Teilansichten
  function zeichne() {
    if (offen) return kartenAnsicht();
    if (entwurf) return stapelAnsicht();
    return uebersicht();
  }

  function uebersicht() {
    const eingabe = h("input", {
      type: "file", accept: ".json,application/json",
      onchange: (e) => { const d = e.currentTarget.files[0]; if (d) ladeDatei(d); },
    });
    return [
      h("div", { class: "kopf" }, h("h1", { text: "Redaktion" }),
        h("button", { class: "zurueck", onclick: zurueck }, "Übersicht")),
      h("p", { class: "sub",
        text: "Stapel bearbeiten, JSON herunterladen, Datei nach decks/ legen und einchecken." }),
      kaputt.length ? h("div", { class: "fehler" },
        "Diese Stapel laden nicht:",
        h("ul", {}, kaputt.map((k) => h("li", {}, `${k.id}: `, k.fehler.join("; "))))) : null,
      h("h2", { text: "Vorhandene Stapel" }),
      h("ul", { class: "stapel" }, stapel.map((s) => h("li", {},
        h("label", { style: "cursor:default" }, h("div", { style: "flex:1" },
          h("div", { class: "titel", text: s.titel }),
          h("div", { class: "zeile", text: `${s.karten.length} Karten · ${s.id}.json` })),
          h("button", { class: "ghost", onclick: () => lade(s) }, "Öffnen"))))),
      h("div", { class: "row" },
        h("button", {
          class: "solid",
          onclick: () => {
            entwurf = { schema: 1, id: "", titel: "", untertitel: "", quelle: "", stand: heuteIso(), karten: [] };
            original = kopie(entwurf); neuZeichnen();
          },
        }, "Neuer Stapel")),
      h("div", { class: "feld", style: "margin-top:14px" },
        h("label", {}, "Oder eine JSON-Datei öffnen", eingabe)),
    ];
  }

  function stapelAnsicht() {
    const fehler = pruefeStapel(entwurf);
    const schnell = h("textarea", { class: "mono", placeholder: SCHNELL_HILFE });

    return [
      h("div", { class: "kopf" }, h("h1", { text: entwurf.titel || "Neuer Stapel" }),
        h("button", { class: "zurueck", onclick: () => { entwurf = null; neuZeichnen(); } }, "Alle Stapel")),

      feld("Kennung (Dateiname ohne .json)", textFeld(entwurf.id, (v) => { entwurf.id = v.trim(); })),
      feld("Titel", textFeld(entwurf.titel, (v) => { entwurf.titel = v; })),
      feld("Untertitel", textFeld(entwurf.untertitel, (v) => { entwurf.untertitel = v; })),
      feld("Quelle", textFeld(entwurf.quelle, (v) => { entwurf.quelle = v; })),
      feld("Stand", textFeld(entwurf.stand, (v) => { entwurf.stand = v; })),

      h("h2", { text: `Karten (${entwurf.karten.length})` }),
      entwurf.karten.length
        ? h("ul", { class: "stapel" }, entwurf.karten.map((k, i) => h("li", {},
            h("label", { style: "cursor:default" }, h("div", { style: "flex:1" },
              h("div", { class: "titel", text: bezeichnung({ karte: k }) || "(ohne Text)" }),
              h("div", { class: "zeile", text: `${k.typ} · ${k.id || "ohne id"} · rev ${k.rev}` })),
              h("button", { class: "ghost", onclick: () => { offen = { karte: k, urspruenglicheId: k.id }; neuZeichnen(); } }, "Ändern"),
              h("button", {
                class: "ghost", "aria-label": "Karte löschen",
                onclick: () => {
                  if (confirm(`Karte „${bezeichnung({ karte: k })}“ löschen?`)) {
                    entwurf.karten.splice(i, 1); neuZeichnen();
                  }
                },
              }, "−")))))
        : h("p", { class: "leer", text: "Noch keine Karte." }),

      h("div", { class: "feld", style: "margin-top:14px" },
        h("label", {}, "Karte anfügen",
          h("select", {
            onchange: (e) => {
              const typ = e.currentTarget.value;
              if (!typ) return;
              e.currentTarget.value = "";
              const k = { id: "", typ, rev: 1 };
              entwurf.karten.push(k);
              offen = { karte: k, urspruenglicheId: null };
              neuZeichnen();
            },
          },
            h("option", { value: "" }, "Typ wählen …"),
            TYPEN.map((t) => h("option", { value: t }, t))))),

      h("h2", { text: "Schnelleingabe" }),
      h("p", { class: "hinweis",
        text: "Für Fragen, Begriffe, Lückentexte und Reihenfolgen aus einer Handbuchseite. Blöcke durch eine Leerzeile trennen. Couleur fehlt hier absichtlich: Farbwerte gehören nicht blind getippt, sondern mit Bandvorschau gesetzt." }),
      schnell,
      h("div", { class: "row eng" },
        h("button", {
          class: "ghost",
          onclick: () => {
            const { karten, fehler: f } = ausSchnelleingabe(schnell.value);
            if (f.length) { alert(f.join("\n")); return; }
            for (const k of karten) {
              k.id = freieId(entwurf, k.frage || k.begriff || k.titel || k.typ);
              entwurf.karten.push(k);
            }
            schnell.value = "";
            neuZeichnen();
          },
        }, "Blöcke übernehmen")),

      h("h2", { text: "Prüfung" }),
      fehler.length
        ? h("div", { class: "fehler" }, `${fehler.length} Stellen stimmen noch nicht:`,
            h("ul", {}, fehler.map((f) => h("li", { text: f }))))
        : h("p", { class: "hinweis", text: "Der Stapel erfüllt das Schema." }),

      h("div", { class: "row" },
        h("button", { class: "solid", disabled: fehler.length > 0, onclick: herunterladen },
          `${entwurf.id || "stapel"}.json herunterladen`),
        h("button", {
          class: "ghost", disabled: fehler.length > 0,
          onclick: () => navigator.clipboard.writeText(JSON.stringify(entwurf, null, 2) + "\n")
            .then(() => alert("JSON liegt in der Zwischenablage."))
            .catch(() => alert("Die Zwischenablage ist hier gesperrt — bitte herunterladen.")),
        }, "Kopieren")),
      h("p", { class: "hinweis",
        text: "Die Datei gehört nach decks/. Ein neuer Stapel braucht zusätzlich eine Zeile in decks/index.json." }),
    ];
  }

  function kartenAnsicht() {
    const k = offen.karte;
    return [
      h("div", { class: "kopf" }, h("h1", { text: `Karte · ${k.typ}` }),
        h("button", { class: "zurueck", onclick: speichereKarte }, "Fertig")),
      feld("Kennung", h("input", {
        type: "text", value: k.id,
        onchange: (e) => { k.id = slug(e.currentTarget.value); e.currentTarget.value = k.id; },
      })),
      h("p", { class: "hinweis",
        text: "Die Kennung darf sich nicht mehr ändern, sobald der Stapel verteilt ist — der Fortschritt hängt daran." }),
      ...kartenEditor(k, neuZeichnen),
      feld("Notiz (optional)", flaeche(k.notiz, (v) => { k.notiz = v || undefined; })),
      h("div", { class: "row" },
        h("button", { class: "solid", onclick: speichereKarte }, "Übernehmen")),
    ];
  }

  wurzel.append(...zeichne());
  return wurzel;
}
