// Das Kneipspiel: eine Kneipe zum Durchspielen. Man steht mit der eigenen
// Figur an der Tafel, schaut auf zwei besetzte Zapfen und wählt, was man
// sagt. Gespielt werden die Karten des Stapels „kneipspiel“ — der Ablauf
// steht hier, der Inhalt in decks/kneipspiel.json.
import { h } from "./dom.js";
import { figurTeile } from "./figur.js";
import { held, verbuche } from "./held.js";
import { lerneinheiten } from "./decks.js";
import { neueSitzung } from "./sitzung.js";
import { stand } from "./leitner.js";
import { moeglichkeiten } from "./karten/auswahl.js";
import { wahlfeld } from "./karten/wahlfeld.js";

export const SPIEL_STAPEL = "kneipspiel";

const L = "#2a2522";
const S = 3.4;
const Sd = 2.2;
const FARBEN = ["#e2122b", "#f2d200", "#141414"];

// ------------------------------------------------------------ Besetzung
// Die beiden Zapfen sind besetzt: Herren im dunklen Anzug, Damen im Kleid.
// Ihre Sachen gibt es im Laden nicht zu kaufen, deshalb stehen sie hier als
// fertige Stücke — `nachId` nimmt sie unverändert an.
const ANZUG = (farbe) => ({ art: "anzug", farbe });
const KLEID = (farbe) => ({ art: "kleid", farbe });
const HOSE = (farbe) => ({ art: "hose", farbe });
const KRAWATTE = (farbe) => ({ art: "krawatte", farbe });
const LEDER = { art: "boot", farbe: "#3a2a1c" };

function herr(kopf, haar, haut, anzug, hose, krawatte, figur) {
  return { name: "", figur, haut, haar: kopf, haarfarbe: haar,
    getragen: { oberteil: { art: "hemd", farbe: "#fbfaf6" }, hose: HOSE(hose),
      schuhe: LEDER, hals: KRAWATTE(krawatte), jacke: ANZUG(anzug) } };
}
function dame(kopf, haar, haut, kleid, figur) {
  return { name: "", figur, haut, haar: kopf, haarfarbe: haar,
    getragen: { oberteil: KLEID(kleid), schuhe: LEDER } };
}

// Vier Gäste, fest besetzt — die Szene soll von Runde zu Runde dieselbe
// bleiben, damit man sich an der Tafel zurechtfindet.
const BESETZUNG = [
  herr("short4", "#3a2a1c", "#f2d3b8", "#1d1a17", "#201d1a", "#7d1f2b", "schlank"),
  dame("long", "#4a3526", "#efcdb0", "#2a2f45", "schlank"),
  herr("grayShort", "#9a958c", "#e8c5a6", "#232a3c", "#232a3c", "#2f4232", "kraeftig"),
  dame("bun", "#c9a35e", "#f4dcc4", "#4a2130", "schlank"),
];

// --------------------------------------------------------------- Kulisse
const p = (d, f, extra = "") =>
  `<path d="${d.replace(/\s+/g, " ")}" fill="${f || "none"}" ${extra}/>`;

// Ein Zapfen: Fass auf dem Bock, Messinghahn, Eimer darunter.
function zapfen(x, boden) {
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  const duenn = `stroke="${L}" stroke-width="${Sd}"`;
  const b = 104, hoch = 64;
  const oben = boden - 42 - hoch;
  return `<g>
    ${p(`M${x - 30} ${boden} l10 -40 h40 l10 40 Z`, "#8a6540", strich)}
    <rect x="${x - b / 2}" y="${oben}" width="${b}" height="${hoch}" rx="16"
          fill="#a8773f" ${strich}/>
    <rect x="${x - b / 2 + 14}" y="${oben}" width="9" height="${hoch}" fill="#cfa468"/>
    <rect x="${x + b / 2 - 23}" y="${oben}" width="9" height="${hoch}" fill="#cfa468"/>
    ${p(`M${x - b / 2 + 2} ${oben + 16} h${b - 4} M${x - b / 2 + 2} ${oben + hoch - 16} h${b - 4}`,
        null, duenn)}
    <circle cx="${x}" cy="${oben + hoch / 2}" r="11" fill="#d8ae4f" ${strich}/>
    ${p(`M${x} ${oben + hoch} v16 h-7 v8`, null,
        `stroke="#d8ae4f" stroke-width="7" stroke-linecap="round" fill="none"`)}
    ${p(`M${x - 16} ${boden - 14} h32 l-5 14 h-22 Z`, "#e9e5db", strich)}
  </g>`;
}

const humpen = (x, y) => `<g>
  <rect x="${x - 9}" y="${y - 26}" width="18" height="26" rx="3" fill="#e9b94a"
        stroke="${L}" stroke-width="${Sd}"/>
  <rect x="${x - 9}" y="${y - 26}" width="18" height="7" rx="3" fill="#fdf7e8"
        stroke="${L}" stroke-width="${Sd}"/>
  ${p(`M${x + 9} ${y - 21} q9 1 9 8 t-9 8`, null, `stroke="${L}" stroke-width="${Sd}" fill="none"`)}
</g>`;

function figurAn(gast, x, boden, massstab) {
  const y = boden - 400 * massstab;
  return `<g transform="translate(${x} ${y}) scale(${massstab})">${figurTeile(gast, null)}</g>`;
}

export function szeneSvg(spieler) {
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  const boden = 372;          // Fußlinie der Zapfenbesatzung
  const tafel = 408;          // Oberkante der Tafel
  const fahnenBreite = 118, fahnenHoch = 168, fx = 460 - fahnenBreite / 2;
  const banner = FARBEN.map((c, i) =>
    `<rect x="${fx}" y="${40 + i * (fahnenHoch / 3)}" width="${fahnenBreite}"
           height="${fahnenHoch / 3 + 0.6}" fill="${c}"/>`).join("");

  return `<svg class="szene" viewBox="0 0 920 500" role="img"
      aria-label="Du stehst an der Kneiptafel, links und rechts ein besetzter Zapfen.">
    <rect x="0" y="0" width="920" height="${boden}" fill="#e7e0d1"/>
    <rect x="0" y="262" width="920" height="${boden - 262}" fill="#dccfb6"/>
    ${p(`M0 262 H920`, null, `stroke="${L}" stroke-width="${Sd}"`)}
    <rect x="0" y="${boden}" width="920" height="${500 - boden}" fill="#c9bca3"/>
    ${p(`M0 ${boden} H920`, null, `stroke="${L}" stroke-width="${S}"`)}

    <g>${banner}
      <rect x="${fx}" y="40" width="${fahnenBreite}" height="${fahnenHoch}" fill="none" ${strich}/>
      <rect x="${fx - 14}" y="30" width="${fahnenBreite + 28}" height="10" rx="5"
            fill="#9a6b3e" ${strich}/>
    </g>

    ${figurAn(BESETZUNG[0], 20, boden, 0.52)}
    ${figurAn(BESETZUNG[1], 150, boden, 0.52)}
    ${zapfen(152, tafel + 8)}
    ${figurAn(BESETZUNG[2], 620, boden, 0.52)}
    ${figurAn(BESETZUNG[3], 750, boden, 0.52)}
    ${zapfen(762, tafel + 8)}

    <g>
      <rect x="10" y="${tafel}" width="900" height="24" rx="4" fill="#a8773f" ${strich}/>
      <rect x="10" y="${tafel + 24}" width="900" height="11" fill="#8a6540"/>
      ${[62, 836].map((x) =>
        `<rect x="${x}" y="${tafel + 35}" width="20" height="${500 - tafel - 35}"
               fill="#8a6540" ${strich}/>`).join("")}
      ${[110, 240, 700, 830].map((x) => humpen(x, tafel)).join("")}
    </g>

    ${figurAn(spieler, 330, 498, 0.95)}
  </svg>`;
}

// ---------------------------------------------------------------- Ablauf
let spiel = null;   // { sitzung, einheit, feld, ergebnis, gesagt, lohn, verdient }
let weiterAktion = null;   // was die Leertaste tut, solange eine Antwort steht

export function kneipeBeenden() { spiel = null; weiterAktion = null; }

function starte(stapel, neuZeichnen) {
  spiel = { sitzung: neueSitzung(lerneinheiten(stapel), "alle"),
    karte: null, feld: null, ergebnis: null, gesagt: null, lohn: 0, verdient: 0 };
  naechste(neuZeichnen);
}

function naechste(neuZeichnen) {
  spiel.ergebnis = null;
  spiel.gesagt = null;
  spiel.lohn = null;
  const einheit = spiel.sitzung.aktuell;
  spiel.einheit = einheit;
  if (!einheit) { spiel.feld = null; return; }
  const richtig = einheit.karte.antworten[0];
  const wahl = moeglichkeiten(einheit, richtig, (k) => (k.antworten && k.antworten[0]) || "");
  spiel.feld = wahlfeld(wahl || [{ text: richtig, richtig: true }], (stimmt, gewaehlt) => {
    const altesFach = stand(einheit).fach;
    spiel.gesagt = gewaehlt ? gewaehlt.text : richtig;
    spiel.ergebnis = stimmt;
    spiel.sitzung.antworte(stimmt);
    const lohn = verbuche(stimmt, altesFach);
    spiel.lohn = lohn.betrag + lohn.bonus;
    spiel.verdient += spiel.lohn;
    neuZeichnen();
  });
  spiel.richtigerText = richtig;
}

// ---------------------------------------------------------------- Ansicht
export function kneipspielAnsicht(stapel, { zurueck, neuZeichnen }) {
  if (!stapel) {
    return [kopf(zurueck),
      h("p", { class: "fehler", text: "Der Stapel „kneipspiel“ fehlt — ohne ihn gibt es nichts zu spielen." })];
  }
  const spieler = held();

  weiterAktion = null;
  if (!spiel) {
    return [
      kopf(zurueck),
      h("p", { class: "frage", text: "Eine Kneipe durchspielen" }),
      h("div", { class: "szenekasten" }, szene(spieler, null, null)),
      h("p", { class: "sub" },
        "Du stehst mit deiner Figur an der Tafel. Links und rechts ein Zapfen, ",
        "besetzt mit Herren im dunklen Anzug und Damen im Kleid. Es wird etwas ",
        "gerufen — und du wählst, was du sagst."),
      h("p", { class: "hinweis", text: stapel.quelle || "" }),
      h("div", { class: "row" },
        h("button", { class: "solid", onclick: () => { starte(stapel, neuZeichnen); neuZeichnen(); } },
          "Kneipe eröffnen"),
        h("button", { class: "ghost", onclick: zurueck }, "Übersicht")),
    ];
  }

  // Erst wenn die letzte Szene mit „Weiter“ abgehakt ist, ist die Kneipe
  // aus — sonst verschluckte der Abschluss das Urteil der letzten Szene.
  if (spiel.sitzung.fertig && !spiel.einheit) {
    const s = spiel.sitzung;
    return [
      kopf(zurueck),
      h("p", { class: "frage", text: "Die Kneipe ist aus." }),
      h("div", { class: "szenekasten" }, szene(spieler, null, "Ex est!")),
      h("p", { class: "text", text: `${s.richtig} von ${s.richtig + s.falsch} Antworten saßen.` }),
      h("p", { class: "text", text: `Verdient: ${spiel.verdient} Coins.` }),
      h("div", { class: "row" },
        h("button", { class: "solid", onclick: () => { starte(stapel, neuZeichnen); neuZeichnen(); } },
          "Noch eine Kneipe"),
        h("button", { class: "ghost", onclick: () => { spiel = null; zurueck(); } }, "Übersicht")),
    ];
  }

  // Nicht sitzung.aktuell: die Schlange ist nach der Antwort schon weiter.
  const einheit = spiel.einheit;
  const karte = einheit.karte;
  const beantwortet = spiel.ergebnis !== null;
  const weiter = () => { naechste(neuZeichnen); neuZeichnen(); };
  weiterAktion = beantwortet ? weiter : null;

  return [
    kopf(zurueck),
    h("div", { class: "szenekasten" },
      szene(spieler, karte.prompt || null, beantwortet ? spiel.gesagt : null)),
    h("p", { class: "frage klein", text: karte.frage }),
    spiel.feld.feld(),
    beantwortet
      ? h("div", {},
          h("p", { class: `urteil ${spiel.ergebnis ? "gut" : "schlecht"}`,
                   text: spiel.ergebnis ? "Saß." : "Daneben." }),
          !spiel.ergebnis ? h("p", { class: "text", text: spiel.richtigerText }) : null,
          karte.notiz ? h("p", { class: "notiz", text: karte.notiz }) : null,
          spiel.lohn ? h("p", { class: "lohn", text: `+${spiel.lohn}` }) : null,
          h("div", { class: "row" },
            h("button", { class: "solid", onclick: weiter }, "Weiter")))
      : h("p", { class: "hinweis", text: "Antippen zählt sofort — die Tasten 1 bis 4 gehen auch." }),
  ];

  function kopf(zur) {
    const s = spiel ? spiel.sitzung : null;
    return h("div", { class: "kopf" },
      h("p", { class: "sub", text: s ? `Kneipspiel · noch ${s.schlange.length}` : "Kneipspiel" }),
      h("button", { class: "zurueck", onclick: zur }, "Übersicht"));
  }
}

// Szene samt Sprechblasen. Der Ruf steht über der Tafel, die eigene
// Antwort neben dem Kopf der eigenen Figur.
function szene(spieler, ruf, gesagt) {
  const kasten = h("div", { class: "szene-rahmen" });
  const bild = h("div", { class: "szene-bild" });
  bild.innerHTML = szeneSvg(spieler);
  kasten.append(bild);
  if (ruf) kasten.append(h("p", { class: "blase ruf", text: ruf }));
  if (gesagt) kasten.append(h("p", { class: "blase ich", text: gesagt }));
  return kasten;
}

// Tastatur wie im Lernen: 1 bis 4 wählen, Leertaste und Enter gehen weiter.
export function kneipTaste(ev) {
  if (!spiel) return false;
  const ziel = ev.target;
  if (ziel && (ziel.matches("input, textarea, select") || ziel.isContentEditable)) return false;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  if (/^[1-9]$/.test(ev.key)) {
    if (spiel.ergebnis !== null || !spiel.feld) return false;
    return spiel.feld.waehle(Number(ev.key));
  }
  const leer = ev.key === " " || ev.key.toLowerCase() === "enter";
  // Auf einem Knopf löst die Leertaste schon den Knopf aus — sonst
  // passierte zweierlei auf einen Druck.
  if (leer && weiterAktion && !(ziel && ziel.tagName === "BUTTON")) {
    weiterAktion();
    return true;
  }
  return false;
}
