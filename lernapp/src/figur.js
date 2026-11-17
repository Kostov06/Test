// Zeichnet den Helden als SVG aus Figur, Haar und getragener Ausrüstung.
//
// Flache Flächen, klare Kanten, keine Verläufe — dieselbe Handschrift wie
// die Farbbänder. Die Teile liegen in fester Reihenfolge übereinander:
// Fahne hinten, Haar vorn.
import { nachId, HAARFARBEN } from "./held.js";

// Alles, was in das SVG eingesetzt wird, muss vorher durch diese Schleuse.
// Farben kommen teils aus den Stapeln, und Stapel sind Dateien, die jemand
// von Hand schreibt.
const farbe = (wert, rueckfall = "#000000") =>
  /^#[0-9a-fA-F]{6}$/.test(String(wert || "")) ? String(wert) : rueckfall;
const text = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, "");

const BUNDESFARBEN = ["#e2122b", "#f2d200", "#141414"]; // rot, gold, schwarz
const KANTE = "rgba(0,0,0,.13)";

const MITTE = 124;
const KOPF_Y = 74, KOPF_R = 27;
const HALS_Y = 96, SCHULTER_Y = 114, HUEFTE_Y = 216, FUSS_Y = 338;

const MASSE = {
  schlank: { schulter: 56, huefte: 46, arm: 13, bein: 18 },
  kraeftig: { schulter: 66, huefte: 56, arm: 15, bein: 21 },
};

// ------------------------------------------------------------------ Haar
// Der Kopf ist ein Kreis mit Mittelpunkt KOPF_Y und Radius KOPF_R, sein
// Scheitel liegt also bei KOPF_Y - KOPF_R. Die Kappe muss darüber hinaus,
// sonst sieht das Haar aus wie ein Stirnband auf einer Glatze.
const SCHEITEL = KOPF_Y - KOPF_R;        // oberster Punkt des Kopfes
const HAARANSATZ = KOPF_Y - 8;           // wo die Stirn aufhört
const SEITE = KOPF_R + 1;

function haarform(art, f) {
  const d = (p) => `<path d="${p.replace(/\s+/g, " ")}" fill="${f}"/>`;
  const lx = MITTE - SEITE, rx = MITTE + SEITE, unten = KOPF_Y + 4;
  // Steuerpunkte so weit oben, dass der Bogen den Scheitel überragt.
  const ueberDemScheitel = SCHEITEL - 14;
  const kappeAussen = `M${lx} ${unten} C${lx - 2} ${ueberDemScheitel}, ${rx + 2} ${ueberDemScheitel}, ${rx} ${unten}`;

  switch (art) {
    case "glatze":
      return "";

    case "scheitel":
      // Von links nach rechts fallend, mit einer Strähne über der Stirn.
      return d(`${kappeAussen}
        C${rx - 6} ${HAARANSATZ - 6}, ${MITTE + 6} ${HAARANSATZ - 10}, ${MITTE - 4} ${HAARANSATZ - 2}
        C${MITTE - 12} ${HAARANSATZ + 4}, ${MITTE - 20} ${HAARANSATZ - 1}, ${lx} ${unten} Z`);

    case "locken":
      return [[MITTE - 19, SCHEITEL + 4, 13], [MITTE - 3, SCHEITEL - 5, 14],
              [MITTE + 15, SCHEITEL + 1, 13], [MITTE + 25, KOPF_Y - 2, 10],
              [MITTE - 27, KOPF_Y - 2, 10]]
        .map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`).join("");

    case "pferdeschwanz":
      return d(`M${MITTE + 18} ${KOPF_Y - 10}
          C${MITTE + 42} ${KOPF_Y + 2}, ${MITTE + 40} ${KOPF_Y + 42}, ${MITTE + 24} ${KOPF_Y + 48}
          C${MITTE + 34} ${KOPF_Y + 28}, ${MITTE + 32} ${KOPF_Y + 6}, ${MITTE + 14} ${KOPF_Y + 2} Z`)
        + d(`${kappeAussen} C${rx - 4} ${HAARANSATZ - 2}, ${lx + 4} ${HAARANSATZ - 2}, ${lx} ${unten} Z`);

    case "lang":
      return d(`M${lx - 3} ${unten + 4}
        C${lx - 6} ${ueberDemScheitel - 4}, ${rx + 6} ${ueberDemScheitel - 4}, ${rx + 3} ${unten + 4}
        L${rx + 4} ${KOPF_Y + 56} L${MITTE + 16} ${KOPF_Y + 54}
        C${MITTE + 23} ${KOPF_Y + 26}, ${MITTE + 22} ${KOPF_Y + 2}, ${MITTE + 15} ${HAARANSATZ - 2}
        L${MITTE - 15} ${HAARANSATZ - 2}
        C${MITTE - 22} ${KOPF_Y + 2}, ${MITTE - 23} ${KOPF_Y + 26}, ${MITTE - 16} ${KOPF_Y + 54}
        L${lx - 4} ${KOPF_Y + 56} Z`);

    default: // kurz
      return d(`${kappeAussen} C${rx - 4} ${HAARANSATZ - 3}, ${lx + 4} ${HAARANSATZ - 3}, ${lx} ${unten} Z`);
  }
}

// ----------------------------------------------------------------- Teile
function fahne(g, beuteFarben) {
  if (!g) return "";
  const streifen = (beuteFarben && beuteFarben.length ? beuteFarben : BUNDESFARBEN).map((c) => farbe(c, "#888888"));
  const x = 206, oben = 52, hoch = 104, breit = 40;
  const teil = hoch / streifen.length;
  return `<g>
    <rect x="${x}" y="${oben - 12}" width="4.5" height="${FUSS_Y - oben + 12}" rx="2" fill="#6b4a2b"/>
    <circle cx="${x + 2.2}" cy="${oben - 17}" r="6" fill="#c9a23f"/>
    ${streifen.map((c, i) =>
      `<rect x="${x + 3.5}" y="${oben + i * teil}" width="${breit}" height="${teil + 0.6}" fill="${c}"/>`).join("")}
    <rect x="${x + 3.5}" y="${oben}" width="${breit}" height="${hoch}" fill="none" stroke="${KANTE}"/>
  </g>`;
}

function beine(m, hose, kleid, haut) {
  // Unter dem Kleid schauen die Beine heraus, nicht das Beinkleid.
  const f = kleid ? farbe(haut, "#f2d3b8") : farbe(hose && hose.farbe, "#d8c9a7");
  const l = MITTE - m.huefte / 2 + 1, r = MITTE + m.huefte / 2 - m.bein - 1;
  const oben = kleid ? HUEFTE_Y + 40 : HUEFTE_Y - 10;
  const bein = (x) =>
    `<rect x="${x}" y="${oben}" width="${m.bein}" height="${FUSS_Y - oben - 10}" rx="6" fill="${f}"/>`;
  return bein(l) + bein(r);
}

function schuhe(m, schuh) {
  const f = farbe(schuh && schuh.farbe, "#f4f2ea");
  const boot = schuh && schuh.id === "bootsschuhe";
  const y = FUSS_Y - 15, w = m.bein + 9;
  const l = MITTE - m.huefte / 2 - 3, r = MITTE + m.huefte / 2 - m.bein - 5;
  const paar = (x) => `
    <rect x="${x}" y="${y}" width="${w}" height="15" rx="6" fill="${f}"/>
    ${boot ? `<rect x="${x - 1}" y="${y + 10}" width="${w + 2}" height="5" rx="2.5" fill="#efe9dc"/>
              <path d="M${x + 4} ${y + 4.5} h${w - 8}" stroke="#5f3c20" stroke-width="1.6"
                    fill="none" stroke-linecap="round"/>` : ""}
    <rect x="${x}" y="${y}" width="${w}" height="15" rx="6" fill="none" stroke="${KANTE}"/>`;
  return paar(l) + paar(r);
}

function torso(m, oberteil) {
  const kleid = oberteil && oberteil.id === "kleid";
  const f = farbe(oberteil && oberteil.farbe, "#fbfaf6");
  if (kleid) {
    return `<path d="M${MITTE - m.schulter / 2} ${SCHULTER_Y - 4}
      Q${MITTE} ${SCHULTER_Y - 12}, ${MITTE + m.schulter / 2} ${SCHULTER_Y - 4}
      L${MITTE + m.huefte / 2 + 30} ${HUEFTE_Y + 62}
      Q${MITTE} ${HUEFTE_Y + 72}, ${MITTE - m.huefte / 2 - 30} ${HUEFTE_Y + 62} Z"
      fill="${f}" stroke="${KANTE}"/>`;
  }
  return `<path d="M${MITTE - m.schulter / 2} ${SCHULTER_Y + 8}
    Q${MITTE - m.schulter / 2} ${SCHULTER_Y - 6}, ${MITTE - m.schulter / 2 + 12} ${SCHULTER_Y - 8}
    L${MITTE + m.schulter / 2 - 12} ${SCHULTER_Y - 8}
    Q${MITTE + m.schulter / 2} ${SCHULTER_Y - 6}, ${MITTE + m.schulter / 2} ${SCHULTER_Y + 8}
    L${MITTE + m.huefte / 2} ${HUEFTE_Y} L${MITTE - m.huefte / 2} ${HUEFTE_Y} Z"
    fill="${f}" stroke="${KANTE}"/>
    <path d="M${MITTE} ${SCHULTER_Y - 6} V${HUEFTE_Y}" stroke="${KANTE}" stroke-width="1.4"/>
    <circle cx="${MITTE}" cy="${SCHULTER_Y + 34}" r="1.8" fill="${KANTE}"/>
    <circle cx="${MITTE}" cy="${SCHULTER_Y + 62}" r="1.8" fill="${KANTE}"/>`;
}

function kragen(m, oberteil) {
  if (oberteil && oberteil.id === "kleid") return "";
  const f = farbe(oberteil && oberteil.farbe, "#fbfaf6");
  return `<path d="M${MITTE - 13} ${SCHULTER_Y - 8} L${MITTE} ${SCHULTER_Y + 8} L${MITTE + 13} ${SCHULTER_Y - 8}
    L${MITTE + 8} ${SCHULTER_Y - 11} L${MITTE} ${SCHULTER_Y - 4} L${MITTE - 8} ${SCHULTER_Y - 11} Z"
    fill="${f}" stroke="${KANTE}"/>`;
}

function halsstueck(hals) {
  if (!hals) return "";
  const o = SCHULTER_Y;
  if (hals.id === "fliege") {
    return `<g>
      <path d="M${MITTE - 16} ${o - 6} L${MITTE - 4} ${o + 1} L${MITTE - 16} ${o + 8} Z" fill="#1d1a17"/>
      <path d="M${MITTE + 16} ${o - 6} L${MITTE + 4} ${o + 1} L${MITTE + 16} ${o + 8} Z" fill="#1d1a17"/>
      <rect x="${MITTE - 4.5}" y="${o - 2.5}" width="9" height="7.5" rx="2.5" fill="#2e2a25"/>
    </g>`;
  }
  const [rot, gold, schwarz] = BUNDESFARBEN;
  return `<g>
    <path d="M${MITTE - 7} ${o - 7} L${MITTE + 7} ${o - 7} L${MITTE + 4.5} ${o + 4} L${MITTE - 4.5} ${o + 4} Z" fill="${schwarz}"/>
    <path d="M${MITTE - 5} ${o + 4} L${MITTE + 5} ${o + 4} L${MITTE + 8.5} ${o + 56} L${MITTE} ${o + 68}
             L${MITTE - 8.5} ${o + 56} Z" fill="${rot}"/>
    <path d="M${MITTE - 6.1} ${o + 20} L${MITTE + 6.1} ${o + 20} L${MITTE + 6.6} ${o + 27} L${MITTE - 6.6} ${o + 27} Z" fill="${gold}"/>
    <path d="M${MITTE - 7.4} ${o + 38} L${MITTE + 7.4} ${o + 38} L${MITTE + 8} ${o + 45} L${MITTE - 8} ${o + 45} Z" fill="${schwarz}"/>
  </g>`;
}

function jacke(m, j) {
  if (!j) return "";
  const f = farbe(j.farbe, "#2f4232");
  const anzug = j.id === "anzug";
  const l = MITTE - m.schulter / 2 - 5, r = MITTE + m.schulter / 2 + 5;
  const unten = anzug ? HUEFTE_Y + 20 : HUEFTE_Y + 34;
  const haelfte = (aussen, innen, zeichen) => `
    <path d="M${aussen} ${SCHULTER_Y + 6}
      Q${aussen} ${SCHULTER_Y - 10}, ${aussen + zeichen * 14} ${SCHULTER_Y - 12}
      L${innen} ${SCHULTER_Y - 12} L${innen - zeichen * -0} ${unten} L${aussen + zeichen * 3} ${unten} Z"
      fill="${f}" stroke="${KANTE}"/>`;
  return `<g>
    ${haelfte(l, MITTE - 14, 1)}
    ${haelfte(r, MITTE + 14, -1)}
    ${anzug
      ? `<path d="M${MITTE - 14} ${SCHULTER_Y - 12} L${MITTE - 4} ${SCHULTER_Y + 40} L${MITTE - 17} ${SCHULTER_Y + 22} Z" fill="rgba(255,255,255,.13)"/>
         <path d="M${MITTE + 14} ${SCHULTER_Y - 12} L${MITTE + 4} ${SCHULTER_Y + 40} L${MITTE + 17} ${SCHULTER_Y + 22} Z" fill="rgba(255,255,255,.13)"/>`
      : `<rect x="${l + 8}" y="${SCHULTER_Y + 62}" width="18" height="22" rx="3" fill="rgba(0,0,0,.14)"/>
         <rect x="${r - 26}" y="${SCHULTER_Y + 62}" width="18" height="22" rx="3" fill="rgba(0,0,0,.14)"/>
         <rect x="${l + 3}" y="${SCHULTER_Y + 2}" width="${r - l - 6}" height="5" rx="2" fill="rgba(0,0,0,.16)"/>`}
  </g>`;
}

function zipfelbund(g) {
  if (!g) return "";
  const [rot, gold, schwarz] = BUNDESFARBEN;
  const y = HUEFTE_Y - 26, x = MITTE + 20;
  const band = (bx, bw, bh) => `
    <rect x="${bx}" y="${y + 4}" width="${bw}" height="${bh}" rx="2" fill="${rot}"/>
    <rect x="${bx}" y="${y + 4 + bh * 0.3}" width="${bw}" height="${bh * 0.13}" fill="${gold}"/>
    <rect x="${bx}" y="${y + 4 + bh * 0.52}" width="${bw}" height="${bh * 0.16}" fill="${schwarz}"/>
    <rect x="${bx}" y="${y + 4 + bh * 0.74}" width="${bw}" height="${bh * 0.13}" fill="${gold}"/>`;
  return `<g>
    ${band(x - 9, 5, 26)}${band(x, 10, 34)}${band(x + 12, 5, 26)}
    <rect x="${x - 10}" y="${y}" width="29" height="6" rx="2.5" fill="#c9a23f" stroke="${KANTE}"/>
  </g>`;
}

function arme(m, haut, aermel, kleid) {
  const fArm = aermel ? farbe(aermel) : farbe(haut, "#f2d3b8");
  const fHaut = farbe(haut, "#f2d3b8");
  const lx = MITTE - m.schulter / 2 - m.arm + 3;
  const rx = MITTE + m.schulter / 2 - 3;
  const oben = SCHULTER_Y - 4;
  const hoch = (kleid ? HUEFTE_Y + 2 : HUEFTE_Y + 6) - oben;
  const arm = (x) => `
    <rect x="${x}" y="${oben}" width="${m.arm}" height="${hoch}" rx="${m.arm / 2}" fill="${fArm}" stroke="${KANTE}"/>
    <circle cx="${x + m.arm / 2}" cy="${oben + hoch + 4}" r="${m.arm / 2 + 2}" fill="${fHaut}" stroke="${KANTE}"/>`;
  return arm(lx) + arm(rx);
}

// Der Gegenstand sitzt in der rechten Hand, nicht daneben.
function handPunkt(m) {
  const hoch = HUEFTE_Y + 6 - (SCHULTER_Y - 4);
  return { x: MITTE + m.schulter / 2 - 3 + m.arm / 2, y: SCHULTER_Y - 4 + hoch + 4 };
}

function inDerHand(m, g) {
  if (!g) return "";
  const { x, y } = handPunkt(m);
  if (g.id === "helles") {
    const oben = y - 16;
    return `<g>
      <path d="M${x + 10} ${oben + 9} q10 1 10 9 t-10 9" fill="none" stroke="#dfd9c8" stroke-width="4"/>
      <rect x="${x - 11}" y="${oben}" width="22" height="32" rx="3" fill="#e9b94a" stroke="${KANTE}"/>
      <rect x="${x - 11}" y="${oben}" width="22" height="8" rx="3" fill="#fdf7e8"/>
      <rect x="${x - 7}" y="${oben + 11}" width="3" height="16" rx="1.5" fill="rgba(255,255,255,.45)"/>
    </g>`;
  }
  const oben = y - 18;
  return `<g>
    <path d="M${x + 12} ${oben + 12} q11 2 11 11 t-11 11" fill="none" stroke="#9fa3a8" stroke-width="4.5"/>
    <path d="M${x - 13} ${oben + 6} h26 l3 7 v21 l-3 7 h-26 l-3 -7 v-21 Z" fill="#b9bcc0" stroke="${KANTE}"/>
    <path d="M${x - 13} ${oben + 6} h26 l3 7 h-32 Z" fill="#d2d5d9"/>
    <rect x="${x - 16}" y="${oben}" width="32" height="7" rx="3" fill="#a7abb0" stroke="${KANTE}"/>
    <rect x="${x - 4}" y="${oben - 5}" width="8" height="6" rx="2" fill="#a7abb0"/>
    <path d="M${x - 7} ${oben + 16} v16" stroke="rgba(255,255,255,.5)" stroke-width="2.5"/>
  </g>`;
}

function kopf(haut, haarArt, haarWert) {
  const h = farbe(haut, "#f2d3b8");
  return `
    <rect x="${MITTE - 9}" y="${HALS_Y - 10}" width="18" height="26" rx="7" fill="${h}"/>
    <circle cx="${MITTE - KOPF_R}" cy="${KOPF_Y + 5}" r="5.5" fill="${h}"/>
    <circle cx="${MITTE + KOPF_R}" cy="${KOPF_Y + 5}" r="5.5" fill="${h}"/>
    <circle cx="${MITTE}" cy="${KOPF_Y}" r="${KOPF_R}" fill="${h}"/>
    <circle cx="${MITTE - 9.5}" cy="${KOPF_Y + 2}" r="2.5" fill="#2b2622"/>
    <circle cx="${MITTE + 9.5}" cy="${KOPF_Y + 2}" r="2.5" fill="#2b2622"/>
    <path d="M${MITTE - 6} ${KOPF_Y + 13} q6 5 12 0" stroke="#2b2622" stroke-width="2"
          fill="none" stroke-linecap="round"/>
    ${haarform(haarArt, haarWert)}`;
}

// ---------------------------------------------------------------- Zusammen
export function figurSvg(h, beuteFarben, klasse = "figur") {
  const m = MASSE[h.figur] || MASSE.schlank;
  const hf = (HAARFARBEN.find((x) => x.id === h.haarfarbe) || HAARFARBEN[1]).wert;
  const g = (platz) => nachId(h.getragen && h.getragen[platz]);

  const oberteil = g("oberteil");
  const kleid = Boolean(oberteil && oberteil.id === "kleid");
  const j = g("jacke");
  const aermel = j ? j.farbe : (oberteil ? oberteil.farbe : null);

  return `<svg class="${klasse}" viewBox="0 0 256 356" role="img"
      aria-label="Figur von ${text(h.name) || "noch namenlos"}">
    ${fahne(g("trophaee"), beuteFarben)}
    ${beine(m, g("hose"), kleid, h.haut)}
    ${schuhe(m, g("schuhe"))}
    ${torso(m, oberteil)}
    ${halsstueck(g("hals"))}
    ${kragen(m, oberteil)}
    ${jacke(m, j)}
    ${zipfelbund(g("guertel"))}
    ${arme(m, h.haut, aermel, kleid)}
    ${inDerHand(m, g("hand"))}
    ${kopf(h.haut, h.haar, hf)}
  </svg>`;
}
