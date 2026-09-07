// Prüfregeln für Stapel. Werden vom Ladevorgang, von der Redaktionsansicht
// und von tests/pruefe-stapel.mjs benutzt — eine Wahrheit, drei Nutzer.
export const TYPEN = ["couleur", "frage", "begriff", "lueckentext", "reihenfolge"];
export const RICHTUNGEN = ["beide", "begriff-definition", "definition-begriff"];

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;
const istText = (v) => typeof v === "string" && v.trim() !== "";

export function pruefeStapel(stapel) {
  const f = [];
  const meld = (wo, was) => f.push(`${wo}: ${was}`);

  if (!stapel || typeof stapel !== "object") return ["Stapel ist kein Objekt"];
  if (stapel.schema !== 1) meld("Kopf", `schema muss 1 sein (ist ${JSON.stringify(stapel.schema)})`);
  if (!ID.test(stapel.id || "")) meld("Kopf", "id fehlt oder enthält etwas anderes als a–z, 0–9 und Bindestrich");
  if (!istText(stapel.titel)) meld("Kopf", "titel fehlt");
  for (const farbe of stapel.helleFarben || []) {
    if (!HEX.test(farbe)) meld("Kopf", `helleFarben: „${farbe}“ ist kein Hex-Wert wie #aabbcc`);
  }
  if (!Array.isArray(stapel.karten) || stapel.karten.length === 0) {
    meld("Kopf", "karten fehlt oder ist leer");
    return f;
  }

  const gesehen = new Set();
  stapel.karten.forEach((k, i) => {
    const wo = `Karte ${i + 1}${k && k.id ? ` (${k.id})` : ""}`;
    if (!k || typeof k !== "object") return meld(wo, "ist kein Objekt");
    if (!ID.test(k.id || "")) meld(wo, "id fehlt oder enthält etwas anderes als a–z, 0–9 und Bindestrich");
    else if (gesehen.has(k.id)) meld(wo, "id kommt im Stapel doppelt vor — der Fortschritt hängt daran");
    else gesehen.add(k.id);
    if (!Number.isInteger(k.rev) || k.rev < 1) meld(wo, "rev muss eine ganze Zahl ab 1 sein");
    if (!TYPEN.includes(k.typ)) return meld(wo, `typ „${k.typ}“ ist unbekannt (erlaubt: ${TYPEN.join(", ")})`);
    if (k.notiz !== undefined && !istText(k.notiz)) meld(wo, "notiz ist leer");

    if (k.typ === "couleur") {
      const s = k.band && k.band.streifen;
      if (!Array.isArray(s) || s.length < 2) meld(wo, "band.streifen braucht mindestens zwei Streifen");
      else s.forEach((st, j) => {
        if (!st || !HEX.test(st.farbe || "")) meld(wo, `Streifen ${j + 1}: farbe ist kein Hex-Wert wie #aabbcc`);
        if (st.breite !== undefined && !(typeof st.breite === "number" && st.breite > 0)) {
          meld(wo, `Streifen ${j + 1}: breite muss eine Zahl größer 0 sein`);
        }
      });
      if (!istText(k.farben)) meld(wo, "farben fehlt — die Farbbeschreibung im Klartext");
      if (!Array.isArray(k.antworten) || k.antworten.length === 0) meld(wo, "antworten fehlt");
      else k.antworten.forEach((a, j) => {
        if (!a || !istText(a.name)) meld(wo, `Antwort ${j + 1}: name fehlt`);
      });
    }

    if (k.typ === "frage") {
      if (!istText(k.frage)) meld(wo, "frage fehlt");
      if (!Array.isArray(k.antworten) || k.antworten.length === 0) meld(wo, "antworten fehlt");
      else k.antworten.forEach((a, j) => { if (!istText(a)) meld(wo, `Antwort ${j + 1} ist leer`); });
    }

    if (k.typ === "begriff") {
      if (!istText(k.begriff)) meld(wo, "begriff fehlt");
      if (!istText(k.definition)) meld(wo, "definition fehlt");
      if (k.richtung !== undefined && !RICHTUNGEN.includes(k.richtung)) {
        meld(wo, `richtung „${k.richtung}“ ist unbekannt (erlaubt: ${RICHTUNGEN.join(", ")})`);
      }
    }

    if (k.typ === "lueckentext") {
      if (!istText(k.text)) meld(wo, "text fehlt");
      else if (!/\{\{[^{}]+\}\}/.test(k.text)) meld(wo, "text enthält keine Lücke — Lücken werden {{so}} markiert");
    }

    if (k.typ === "reihenfolge") {
      if (!istText(k.frage)) meld(wo, "frage fehlt");
      if (!Array.isArray(k.elemente) || k.elemente.length < 2) meld(wo, "elemente braucht mindestens zwei Einträge");
      else k.elemente.forEach((e, j) => {
        if (Array.isArray(e)) {
          if (e.length < 2) meld(wo, `Element ${j + 1}: eine Gruppe braucht mindestens zwei Einträge`);
          e.forEach((x, m) => { if (!istText(x)) meld(wo, `Element ${j + 1}.${m + 1} ist leer`); });
        } else if (!istText(e)) meld(wo, `Element ${j + 1} ist leer`);
      });
    }
  });
  return f;
}

// Rückfall für Stapel ohne eigene helleFarben-Liste: relative Helligkeit nach
// WCAG. Stapel, die eine Liste mitbringen, benutzen ausschließlich diese —
// bei geprüften Farben entscheidet nicht die Rechnung, sondern das Auge.
export function istHell(hex) {
  const kanal = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5) > 0.55;
}
