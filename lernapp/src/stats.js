import { lerneinheiten } from "./decks.js";
import { stand, istFaellig, hakt, FAECHER } from "./leitner.js";

export function statistik(stapel) {
  const einheiten = lerneinheiten(stapel);
  const faecher = Array(FAECHER).fill(0);
  let faellig = 0, neu = 0, haken = 0, sitzt = 0;

  for (const e of einheiten) {
    const s = stand(e);
    faecher[s.fach - 1]++;
    if (istFaellig(s)) faellig++;
    if (!s.zuletzt) neu++;
    if (hakt(s)) haken++;
    if (s.fach >= 4) sitzt++;
  }
  return { stapel, einheiten, faecher, faellig, neu, haken, sitzt, gesamt: einheiten.length };
}

// Was hakt: zuletzt falsch beantwortet und noch in den unteren Fächern,
// die stärksten Ausreißer zuerst.
export function wasHakt(stapel, hoechstens = 8) {
  return lerneinheiten(stapel)
    .map((e) => ({ einheit: e, s: stand(e) }))
    .filter(({ s }) => hakt(s))
    .sort((a, b) => b.s.falsch - a.s.falsch || a.s.fach - b.s.fach)
    .slice(0, hoechstens);
}

export function bezeichnung(einheit) {
  const k = einheit.karte;
  if (k.typ === "couleur") return k.antworten.map((a) => a.name).join(" / ");
  if (k.typ === "begriff") return k.begriff;
  if (k.typ === "lueckentext") return k.titel || k.text.slice(0, 40) + "…";
  return k.frage;
}
