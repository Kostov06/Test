// Zeichnet den Helden als SVG aus Figur, Haar und getragener Ausrüstung.
//
// Kräftige Tuschelinie, flache Flächen, keine Verläufe. Die Teile liegen in
// fester Reihenfolge übereinander: Fahne hinten, Haar vorn. Jedes Kleidungs-
// stück sagt über sein Feld `art`, wie es gezeichnet wird — nicht über seine
// Kennung, damit ein neuer Anzug keine Codeänderung braucht.
import { nachId, haarfarbe } from "./held.js";
import { KOEPFE } from "./koepfe.js";

// Alles, was in das SVG eingesetzt wird, muss hier durch. Farben kommen
// teils aus den Stapeln, und Stapel sind Dateien, die jemand von Hand
// schreibt.
const farbe = (wert, rueckfall = "#000000") =>
  /^#[0-9a-fA-F]{6}$/.test(String(wert || "")) ? String(wert) : rueckfall;
const text = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, "");

const BUNDESFARBEN = ["#e2122b", "#f2d200", "#141414"];
const L = "#2a2522";           // Tuschefarbe
const S = 3.4;                 // Strichstärke
const Sd = 2.2;                // dünner Strich für Nähte und Falten

// Dunklere Variante einer Farbe — für Schattenseiten und Kragen.
function dunkler(hex, anteil = 0.72) {
  const c = farbe(hex, "#808080");
  const k = (i) => Math.round(parseInt(c.slice(i, i + 2), 16) * anteil);
  return `#${[1, 3, 5].map((i) => k(i).toString(16).padStart(2, "0")).join("")}`;
}

const p = (d, fuellung, extra = "") =>
  `<path d="${d.replace(/\s+/g, " ")}" fill="${fuellung || "none"}" ${extra}/>`;

const MITTE = 130;
const KOPF_Y = 66, KOPF_RX = 31, KOPF_RY = 35;
const HALS_UNTEN = 110, SCHULTER_Y = 116, TAILLE_Y = 208, HUEFTE_Y = 236, FUSS_Y = 376;
// Oberkante von Hosenbund und Gürtel. Das Hemd steckt dahinter, die
// Krawattenspitze endet hier — so lang gehört sie, nicht länger.
const BUND_Y = HUEFTE_Y - 18;

const MASSE = {
  schlank: { schulter: 72, taille: 58, huefte: 64, arm: 16, bein: 25 },
  kraeftig: { schulter: 86, taille: 76, huefte: 80, arm: 19, bein: 30 },
};

// ----------------------------------------------------------------- Teile
function fahne(g, beuteFarben) {
  if (!g) return "";
  const streifen = (beuteFarben && beuteFarben.length ? beuteFarben : BUNDESFARBEN).map((c) => farbe(c, "#888888"));
  const x = 210, oben = 56, hoch = 112, breit = 44;
  const teil = hoch / streifen.length;
  return `<g>
    <rect x="${x}" y="${oben - 14}" width="5" height="${FUSS_Y - oben + 14}" rx="2.5"
          fill="#9a6b3e" stroke="${L}" stroke-width="${S}"/>
    <circle cx="${x + 2.5}" cy="${oben - 20}" r="7" fill="#d8ae4f" stroke="${L}" stroke-width="${S}"/>
    ${streifen.map((c, i) =>
      `<rect x="${x + 4}" y="${oben + i * teil}" width="${breit}" height="${teil + 0.6}" fill="${c}"/>`).join("")}
    <rect x="${x + 4}" y="${oben}" width="${breit}" height="${hoch}" fill="none"
          stroke="${L}" stroke-width="${S}" stroke-linejoin="round"/>
  </g>`;
}

// Beide Beine als ausdrückliche Spannen — vorher kreuzten sich die
// Vorzeichen und die Hosenbeine überlappten sich zu einer Säule.
function beinSpannen(m) {
  const innen = 7;
  return [
    { aussen: MITTE - m.huefte / 2, innen: MITTE - innen, zeichen: -1 },
    { aussen: MITTE + m.huefte / 2, innen: MITTE + innen, zeichen: 1 },
  ];
}

function beine(m, hose, kleid, haut) {
  const f = kleid ? farbe(haut, "#f2d3b8") : farbe(hose && hose.farbe, "#d8c9a7");
  const oben = kleid ? HUEFTE_Y + 50 : BUND_Y + 4;
  const unten = FUSS_Y - 16;
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  return beinSpannen(m).map(({ aussen, innen, zeichen }) => {
    const breit = Math.abs(innen - aussen);
    const fuss = aussen - zeichen * breit * 0.1;   // unten leicht schmaler
    const koerper = p(`M${aussen} ${oben} L${fuss} ${unten} L${innen} ${unten} L${innen} ${oben + 12} Z`,
      f, strich);
    const falte = kleid ? "" :
      p(`M${(aussen + innen) / 2} ${oben + 18} V${unten - 8}`, null,
        `stroke="${dunkler(f, .86)}" stroke-width="${Sd}"`);
    return koerper + falte;
  }).join("");
}

function schuhe(m, schuh) {
  const f = farbe(schuh && schuh.farbe, "#f4f2ea");
  const boot = schuh && schuh.art === "boot";
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  const y = FUSS_Y - 20, hoehe = 22;

  return beinSpannen(m).map(({ aussen, innen, zeichen }) => {
    const ferse = innen;                       // am inneren Rand beginnt die Ferse
    const spitze = aussen + zeichen * 12;      // die Zehen zeigen nach außen
    if (!boot) {
      // Tennissocke: Rippenbündchen, runder Zeh, keine Sohle.
      return p(`M${ferse} ${y - 10} L${ferse} ${y + hoehe - 4}
          Q${ferse} ${y + hoehe}, ${ferse - zeichen * -6} ${y + hoehe}
          L${spitze - zeichen * 5} ${y + hoehe} Q${spitze} ${y + hoehe - 1}, ${spitze} ${y + hoehe - 11}
          Q${spitze - zeichen * 2} ${y - 9}, ${aussen} ${y - 10} Z`, f, strich)
        + [0, 4, 8].map((d) =>
            p(`M${ferse + zeichen * 1} ${y - 7 + d} L${aussen - zeichen * 2} ${y - 7 + d}`, null,
              `stroke="${dunkler(f, .9)}" stroke-width="1.6"`)).join("");
    }
    // Bootsschuh: Leder, helle Sohle, Ziernaht über dem Spann.
    return p(`M${ferse} ${y + 2} L${ferse} ${y + hoehe - 8}
        Q${ferse} ${y + hoehe - 3}, ${ferse + zeichen * 6} ${y + hoehe - 3}
        L${spitze - zeichen * 5} ${y + hoehe - 3} Q${spitze} ${y + hoehe - 3}, ${spitze} ${y + hoehe - 11}
        Q${spitze - zeichen * 5} ${y + 3}, ${aussen - zeichen * 2} ${y + 2} Z`, f, strich)
      + p(`M${ferse} ${y + hoehe - 3} L${spitze} ${y + hoehe - 3}`, null,
          `stroke="#f2ece0" stroke-width="6" stroke-linecap="round"`)
      + p(`M${ferse} ${y + hoehe - 3} L${spitze} ${y + hoehe - 3}`, null,
          `stroke="${L}" stroke-width="${Sd}" stroke-linecap="round"`)
      + p(`M${aussen - zeichen * 6} ${y + 6} Q${aussen + zeichen * 3} ${y + 11},
           ${spitze - zeichen * 6} ${y + 8}`, null,
          `stroke="${dunkler(f, .55)}" stroke-width="${Sd}" fill="none" stroke-linecap="round"`);
  }).join("");
}

// Rumpfumriss — davon leben Hemd, Kleid und Jacke
function rumpfPfad(m, bis, saumBreite) {
  const s = m.schulter / 2, t = m.taille / 2;
  const e = saumBreite === undefined ? t + 3 : saumBreite;
  return `M${MITTE - s} ${SCHULTER_Y + 10}
    Q${MITTE - s - 1} ${SCHULTER_Y - 4}, ${MITTE - s + 13} ${SCHULTER_Y - 7}
    L${MITTE + s - 13} ${SCHULTER_Y - 7}
    Q${MITTE + s + 1} ${SCHULTER_Y - 4}, ${MITTE + s} ${SCHULTER_Y + 10}
    L${MITTE + t} ${TAILLE_Y} L${MITTE + e} ${bis}
    L${MITTE - e} ${bis} L${MITTE - t} ${TAILLE_Y} Z`;
}

function torso(m, oberteil, haut) {
  const kleid = oberteil && oberteil.art === "kleid";
  const f = farbe(oberteil && oberteil.farbe, "#fbfaf6");
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  if (kleid) {
    const s = m.schulter / 2, t = m.taille / 2;
    return p(`M${MITTE - s} ${SCHULTER_Y + 10}
      Q${MITTE - s - 1} ${SCHULTER_Y - 5}, ${MITTE - s + 13} ${SCHULTER_Y - 8}
      L${MITTE + s - 13} ${SCHULTER_Y - 8}
      Q${MITTE + s + 1} ${SCHULTER_Y - 5}, ${MITTE + s} ${SCHULTER_Y + 10}
      L${MITTE + t + 2} ${TAILLE_Y}
      L${MITTE + m.huefte / 2 + 30} ${HUEFTE_Y + 66}
      Q${MITTE} ${HUEFTE_Y + 78}, ${MITTE - m.huefte / 2 - 30} ${HUEFTE_Y + 66}
      L${MITTE - t - 2} ${TAILLE_Y} Z`, f, strich)
      + p(`M${MITTE - t - 1} ${TAILLE_Y - 2} L${MITTE + t + 1} ${TAILLE_Y - 2}`, null,
          `stroke="${dunkler(f, .72)}" stroke-width="${Sd}"`);
  }
  // Hemd: Rumpf, Knopfleiste, Knöpfe. Der Saum endet schmal und tief —
  // der Hosenbund deckt ihn zu, dadurch steckt das Hemd in der Hose.
  const saum = BUND_Y + 12;
  return p(rumpfPfad(m, saum, m.huefte / 2 - 4), f, strich)
    + p(`M${MITTE} ${SCHULTER_Y - 2} V${BUND_Y + 2}`, null,
        `stroke="${dunkler(f, .86)}" stroke-width="${Sd + 1}"`)
    + [0.3, 0.52, 0.74].map((anteil) =>
        `<circle cx="${MITTE}" cy="${SCHULTER_Y + (BUND_Y - SCHULTER_Y) * anteil}" r="2.6"
                 fill="none" stroke="${dunkler(f, .62)}" stroke-width="${Sd}"/>`).join("");
}

// Hosenbund samt Gürtel: liegt über dem Hemdsaum, deshalb erst nach dem Torso.
function hosenbund(m, hose, kleid) {
  if (kleid) return "";
  const f = farbe(hose && hose.farbe, "#d8c9a7");
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  const b = m.huefte / 2;
  const bund = p(`M${MITTE - b} ${BUND_Y} L${MITTE + b} ${BUND_Y}
      L${MITTE + b} ${BUND_Y + 17} L${MITTE - b} ${BUND_Y + 17} Z`, f, strich)
    + [-1, 1].map((z) =>
        p(`M${MITTE + z * (b - 9)} ${BUND_Y + 1} V${BUND_Y + 16}`, null,
          `stroke="${dunkler(f, .82)}" stroke-width="${Sd}"`)).join("");

  // Gürtel: Rindleder, Messingschließe, Lochreihe
  const leder = "#5b3a24", messing = "#d8ae4f";
  const gy = BUND_Y + 3, gh = 10;
  const guertel = `<rect x="${MITTE - b}" y="${gy}" width="${b * 2}" height="${gh}"
        fill="${leder}" ${strich}/>`
    + p(`M${MITTE - b} ${gy + 2.5} L${MITTE + b} ${gy + 2.5}`, null,
        `stroke="rgba(255,255,255,.14)" stroke-width="2"`)
    + [7, 13, 19].map((d) =>
        `<circle cx="${MITTE + b - d}" cy="${gy + gh / 2}" r="1.1" fill="${dunkler(leder, .5)}"/>`).join("")
    + `<rect x="${MITTE - 12}" y="${gy - 2}" width="24" height="${gh + 4}" rx="3"
        fill="${messing}" ${strich}/>`
    + `<rect x="${MITTE - 4}" y="${gy + 0.5}" width="8" height="${gh - 1}" rx="1.5"
        fill="${leder}" stroke="${L}" stroke-width="${Sd}"/>`;
  return bund + guertel;
}

function kragen(m, oberteil) {
  if (oberteil && oberteil.art === "kleid") return "";
  const f = farbe(oberteil && oberteil.farbe, "#fbfaf6");
  const y = SCHULTER_Y - 7;
  return p(`M${MITTE - 17} ${y} L${MITTE - 2} ${y + 20} L${MITTE - 10} ${y + 3} Z`, f,
      `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`)
    + p(`M${MITTE + 17} ${y} L${MITTE + 2} ${y + 20} L${MITTE + 10} ${y + 3} Z`, f,
      `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`);
}

function halsstueck(hals) {
  if (!hals) return "";
  const o = SCHULTER_Y - 4;
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  if (hals.art === "fliege") {
    const f = farbe(hals.farbe, "#1d1a17");
    return p(`M${MITTE - 19} ${o - 7} L${MITTE - 5} ${o + 1} L${MITTE - 19} ${o + 9} Z`, f, strich)
      + p(`M${MITTE + 19} ${o - 7} L${MITTE + 5} ${o + 1} L${MITTE + 19} ${o + 9} Z`, f, strich)
      + `<rect x="${MITTE - 5}" y="${o - 3}" width="10" height="8" rx="3" fill="${dunkler(f, .7)}" ${strich}/>`;
  }
  const f = farbe(hals.farbe, "#243352");
  const spitze = BUND_Y + 5;   // ideale Länge: die Spitze trifft die Schließe
  const krawatte = p(`M${MITTE - 8} ${o - 6} L${MITTE + 8} ${o - 6} L${MITTE + 5} ${o + 6}
      L${MITTE + 10} ${spitze - 12} L${MITTE} ${spitze} L${MITTE - 10} ${spitze - 12}
      L${MITTE - 5} ${o + 6} Z`, f, strich);
  const bis = spitze - 18, von = o + 22;
  const streifen = hals.art === "krawatte-gestreift"
    ? Array.from({ length: Math.max(1, Math.floor((bis - von) / 17) + 1) }, (_, i) => {
        const yy = von + i * 17;
        return p(`M${MITTE - 7.5} ${yy} L${MITTE + 8.5} ${yy - 7}`, null,
          `stroke="${farbe(hals.zweitfarbe, "#2f5d3a")}" stroke-width="6" stroke-linecap="round"`);
      }).join("")
    : "";
  const knoten = `<rect x="${MITTE - 8}" y="${o - 7}" width="16" height="13" rx="3"
      fill="${dunkler(f, .78)}" ${strich}/>`;
  return krawatte + streifen + knoten;
}

function jacke(m, j) {
  if (!j) return "";
  const f = farbe(j.farbe, "#2f4232");
  const wachs = j.art === "wachsjacke";
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  const s = m.schulter / 2 + 6, t = m.taille / 2 + 7;
  const unten = wachs ? HUEFTE_Y + 40 : HUEFTE_Y + 24;
  const spalt = wachs ? 7 : 15;

  const haelfte = (zeichen) => p(`M${MITTE + zeichen * s} ${SCHULTER_Y + 10}
      Q${MITTE + zeichen * (s + 1)} ${SCHULTER_Y - 8}, ${MITTE + zeichen * (s - 15)} ${SCHULTER_Y - 11}
      L${MITTE + zeichen * spalt} ${SCHULTER_Y - 11}
      L${MITTE + zeichen * spalt} ${unten}
      L${MITTE + zeichen * (t + 2)} ${unten} L${MITTE + zeichen * t} ${TAILLE_Y} Z`, f, strich);

  if (wachs) {
    // Wachsjacke: Cordkragen, Druckknopfleiste, zwei Balgtaschen mit Klappe.
    // Jede Kante bekommt eine Tuschelinie — im Dunkelgrün trägt eine bloße
    // Helligkeitsstufe nicht.
    const cord = "#b08a52";
    const taschenY = TAILLE_Y + 8, taschenB = 34, taschenH = 30;
    const tasche = (zeichen) => {
      const x = zeichen > 0 ? MITTE + t - taschenB + 1 : MITTE - t - 1;
      return `
        ${p(`M${x} ${taschenY} h${taschenB} v${taschenH} q0 4 -4 4 h-${taschenB - 8} q-4 0 -4 -4 Z`,
            dunkler(f, .84), `stroke="${L}" stroke-width="${Sd}" stroke-linejoin="round"`)}
        ${p(`M${x - 2} ${taschenY - 7} h${taschenB + 4} v11 h-${taschenB + 4} Z`, f,
            `stroke="${L}" stroke-width="${Sd}" stroke-linejoin="round"`)}
        <circle cx="${x + taschenB / 2}" cy="${taschenY + 9}" r="2.6" fill="#cfd3d8"
                stroke="${L}" stroke-width="1.6"/>`;
    };
    const leiste = p(`M${MITTE - 9} ${SCHULTER_Y - 11} h18 v${unten - SCHULTER_Y + 11} h-18 Z`,
      dunkler(f, .86), `stroke="${L}" stroke-width="${Sd}"`);
    const knoepfe = [0.14, 0.38, 0.62, 0.86].map((a) =>
      `<circle cx="${MITTE}" cy="${SCHULTER_Y + (unten - SCHULTER_Y) * a}" r="3.6"
               fill="#cfd3d8" stroke="${L}" stroke-width="1.8"/>`).join("");
    // Der Kragen sitzt auf den Schultern, nicht darüber — sonst verdeckt ihn der Kopf.
    const kragenY = SCHULTER_Y - 9;
    const cordkragen = `
      ${p(`M${MITTE - 30} ${kragenY + 16} L${MITTE - 26} ${kragenY} L${MITTE + 26} ${kragenY}
           L${MITTE + 30} ${kragenY + 16} L${MITTE + 12} ${kragenY + 13}
           L${MITTE - 12} ${kragenY + 13} Z`, cord,
          `stroke="${L}" stroke-width="${Sd + .4}" stroke-linejoin="round"`)}
      ${[-20, -13, -6, 1, 8, 15].map((dx) =>
        p(`M${MITTE + dx} ${kragenY + 2} v11`, null,
          `stroke="${dunkler(cord, .72)}" stroke-width="1.5"`)).join("")}`;
    return `<g>
      ${haelfte(-1)}${haelfte(1)}
      ${leiste}
      ${tasche(-1)}${tasche(1)}
      ${knoepfe}
      ${p(`M${MITTE - t - 2} ${TAILLE_Y - 4} L${MITTE + t + 2} ${TAILLE_Y - 4}`, null,
          `stroke="${dunkler(f, .7)}" stroke-width="${Sd}"`)}
      ${cordkragen}
    </g>`;
  }

  // Anzug: Revers, ein Knopf, Einstecktuch
  const revers = (zeichen) => p(`M${MITTE + zeichen * spalt} ${SCHULTER_Y - 11}
      L${MITTE + zeichen * 6} ${TAILLE_Y - 16} L${MITTE + zeichen * (spalt + 11)} ${SCHULTER_Y + 22} Z`,
    dunkler(f, .76), `stroke="${L}" stroke-width="${Sd}" stroke-linejoin="round"`);
  return `<g>
    ${haelfte(-1)}${haelfte(1)}
    ${revers(-1)}${revers(1)}
    <circle cx="${MITTE + 4}" cy="${TAILLE_Y - 6}" r="3.4" fill="${dunkler(f, .55)}"
            stroke="${L}" stroke-width="${Sd}"/>
    ${p(`M${MITTE - s + 9} ${SCHULTER_Y + 30} l16 0 l-3 -7 l-10 0 Z`, "#f6f2e8",
        `stroke="${L}" stroke-width="${Sd}" stroke-linejoin="round"`)}
    ${p(`M${MITTE - t - 1} ${TAILLE_Y + 24} L${MITTE - t + 22} ${TAILLE_Y + 24}`, null,
        `stroke="${dunkler(f, .7)}" stroke-width="${Sd}"`)}
    ${p(`M${MITTE + t + 1} ${TAILLE_Y + 24} L${MITTE + t - 22} ${TAILLE_Y + 24}`, null,
        `stroke="${dunkler(f, .7)}" stroke-width="${Sd}"`)}
  </g>`;
}

function zipfelbund(g, m) {
  if (!g) return "";
  const [rot, gold, schwarz] = BUNDESFARBEN;
  const y = BUND_Y + 1, x = MITTE + m.taille / 2 - 10;
  const strich = `stroke="${L}" stroke-width="${Sd}" stroke-linejoin="round"`;
  const band = (bx, bw, bh) => `
    <rect x="${bx}" y="${y + 6}" width="${bw}" height="${bh}" rx="2" fill="${rot}" ${strich}/>
    <rect x="${bx}" y="${y + 6 + bh * 0.28}" width="${bw}" height="${bh * 0.13}" fill="${gold}"/>
    <rect x="${bx}" y="${y + 6 + bh * 0.48}" width="${bw}" height="${bh * 0.17}" fill="${schwarz}"/>
    <rect x="${bx}" y="${y + 6 + bh * 0.72}" width="${bw}" height="${bh * 0.13}" fill="${gold}"/>`;
  return `<g>
    ${band(x - 10, 6, 28)}${band(x - 1, 12, 38)}${band(x + 13, 6, 28)}
    <rect x="${x - 12}" y="${y}" width="32" height="8" rx="3" fill="#d8ae4f"
          stroke="${L}" stroke-width="${S}"/>
  </g>`;
}

function arme(m, haut, aermel, kleid) {
  const fArm = aermel ? farbe(aermel) : farbe(haut, "#f2d3b8");
  const fHaut = farbe(haut, "#f2d3b8");
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  const oben = SCHULTER_Y - 2;
  const unten = kleid ? HUEFTE_Y - 4 : HUEFTE_Y + 2;
  const arm = (zeichen) => {
    // Der Ärmel setzt innerhalb der Schulterkante an, sonst klafft eine Lücke.
    const x = MITTE + zeichen * (m.schulter / 2 - 4);
    const b = m.arm;
    return p(`M${x} ${oben}
        Q${x + zeichen * (b + 3)} ${oben + 6}, ${x + zeichen * (b - 1)} ${oben + 46}
        L${x + zeichen * (b - 3)} ${unten} L${x - zeichen * 2} ${unten} Z`, fArm, strich)
      + `<circle cx="${x + zeichen * (b / 2 - 1)}" cy="${unten + 9}" r="${b / 2 + 2.5}"
                 fill="${fHaut}" ${strich}/>`
      + (aermel && !kleid
        ? p(`M${x - zeichen * 1} ${unten - 9} L${x + zeichen * (b - 2)} ${unten - 9}`, null,
            `stroke="${dunkler(fArm, .74)}" stroke-width="${Sd}"`)
        : "");
  };
  return arm(-1) + arm(1);
}

function handPunkt(m) {
  return { x: MITTE + (m.schulter / 2 - 4) + (m.arm / 2 - 1), y: HUEFTE_Y + 11 };
}

function inDerHand(m, g, aermel, kleid) {
  if (!g) return "";
  const { x } = handPunkt(m);
  const y = (kleid ? HUEFTE_Y - 4 : HUEFTE_Y + 2) + 9;
  const strich = `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`;
  if (g.art === "glas") {
    const o = y - 20;
    return `<g>
      ${p(`M${x + 13} ${o + 12} q13 1 13 11 t-13 11`, null, `${strich} fill="none"`)}
      ${p(`M${x - 13} ${o} h26 v38 h-26 Z`, "#e9b94a", strich)}
      ${p(`M${x - 13} ${o} h26 v10 h-26 Z`, "#fdf7e8", `stroke="${L}" stroke-width="${Sd}"`)}
      ${p(`M${x - 7} ${o + 16} V${o + 32}`, null, `stroke="rgba(255,255,255,.6)" stroke-width="3"`)}
    </g>`;
  }
  // Octopott: hohes Facettenglas, Henkel links, Ausguss rechts, Bier drin
  // mit Schaumkrone. Alles durchscheinend, deshalb sitzt die Kontur vorn.
  const glas = "#eceef0";
  const bier = farbe(g.farbe, "#e3a92f");
  const hoch = 58, breit = 30;
  const o = y - hoch + 10;
  const l = x - breit / 2, r = x + breit / 2;
  const schaumY = o + 13;
  return `<g>
    ${p(`M${l - 10} ${o + 16} q-11 3 -11 14 t11 14`, null,
        `fill="none" stroke="${L}" stroke-width="${S}" stroke-linecap="round"`)}
    ${p(`M${l} ${o + 4} L${l + 2} ${o + hoch - 4} q0 4 4 4 h${breit - 12} q4 0 4 -4
         L${r} ${o + 4} Z`, glas, `stroke="${L}" stroke-width="${S}" stroke-linejoin="round"`)}
    ${p(`M${l + 1.2} ${schaumY} L${l + 2} ${o + hoch - 4} q0 4 4 4 h${breit - 12} q4 0 4 -4
         L${r - 1.2} ${schaumY} Z`, bier, "")}
    ${p(`M${l + 1} ${schaumY} h${breit - 2}`, null, `stroke="#fdf6e6" stroke-width="7"`)}
    ${[-9, -3, 3, 9].map((dx) =>
      p(`M${x + dx} ${o + 6} V${o + hoch - 2}`, null,
        `stroke="rgba(255,255,255,.5)" stroke-width="1.6"`)).join("")}
    ${p(`M${r - 1} ${o + 4} q7 -3 10 2`, null,
        `fill="none" stroke="${L}" stroke-width="${S}" stroke-linecap="round"`)}
    ${p(`M${l} ${o + 4} L${r} ${o + 4}`, null, `stroke="${L}" stroke-width="${S}" stroke-linecap="round"`)}
    ${p(`M${l + 5} ${o + 20} V${o + hoch - 10}`, null,
        `stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round"`)}
  </g>`;
}

// Der Kopf kommt fertig gezeichnet aus koepfe.js (Open Peeps, CC0). Alle
// Frisuren teilen dieselbe Schädelform, deshalb reicht eine feste
// Verschiebung: der Schädel liegt in der Vorlage um (392|346) und ist dort
// 382 breit. Große Frisuren ragen einfach darüber hinaus, statt die Figur
// zu stauchen — genau so soll es sein.
const KOPF_MASSSTAB = 0.235;
const KOPF_X = MITTE - 392 * KOPF_MASSSTAB;
const KOPF_VERSATZ_Y = KOPF_Y - 346 * KOPF_MASSSTAB;

export const kopfFuer = (id) => KOEPFE.find((k) => k.id === id) || KOEPFE[0];

function kopf(haut, frisur, haarId) {
  const k = kopfFuer(frisur);
  if (!k) return "";
  const h = farbe(haut, "#f2d3b8");
  const haar = farbe(haarfarbe(haarId), "#1d1a17");
  return `<g transform="translate(${KOPF_X} ${KOPF_VERSATZ_Y}) scale(${KOPF_MASSSTAB})">
    ${k.svg.split("{{HAUT}}").join(h).split("{{HAAR}}").join(haar)}
  </g>`;
}

// ---------------------------------------------------------------- Zusammen
export function figurSvg(h, beuteFarben, klasse = "figur") {
  const m = MASSE[h.figur] || MASSE.schlank;
  const g = (platz) => nachId(h.getragen && h.getragen[platz]);

  const oberteil = g("oberteil");
  const kleid = Boolean(oberteil && oberteil.art === "kleid");
  const j = g("jacke");
  const aermel = j ? j.farbe : (oberteil ? oberteil.farbe : null);

  return `<svg class="${klasse}" viewBox="0 0 270 400" role="img"
      aria-label="Figur von ${text(h.name) || "noch namenlos"}">
    ${fahne(g("trophaee"), beuteFarben)}
    ${beine(m, g("hose"), kleid, h.haut)}
    ${schuhe(m, g("schuhe"))}
    ${torso(m, oberteil, h.haut)}
    ${hosenbund(m, g("hose"), kleid)}
    ${halsstueck(g("hals"))}
    ${kragen(m, oberteil)}
    ${jacke(m, j)}
    ${zipfelbund(g("guertel"), m)}
    ${arme(m, h.haut, aermel, kleid)}
    ${inDerHand(m, g("hand"), aermel, kleid)}
    ${kopf(h.haut, h.haar, h.haarfarbe)}
  </svg>`;
}
