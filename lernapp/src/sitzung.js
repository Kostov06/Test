// Eine Lernsitzung ist eine Warteschlange von Lerneinheiten.
// Falsch beantwortete Einheiten kommen in derselben Sitzung noch einmal dran,
// aber nicht sofort — sie rutschen ein paar Plätze nach hinten.
import { mische } from "./dom.js";
import { bewerte, stand, istFaellig, hakt } from "./leitner.js";

const ABSTAND = 3;

export function neueSitzung(einheiten, modus) {
  const gefiltert = einheiten.filter((e) => {
    const s = stand(e);
    if (modus === "alle") return true;
    if (modus === "fehler") return hakt(s);
    return istFaellig(s);
  });

  const schlange = mische(gefiltert);
  return {
    modus,
    schlange,
    gesamt: schlange.length,
    richtig: 0,
    falsch: 0,
    erledigt: new Set(),

    get aktuell() { return this.schlange[0] || null; },
    get fertig() { return this.schlange.length === 0; },
    // Wie viele Einheiten sitzen schon — nicht wie viele Antworten gegeben wurden.
    get geschafft() { return this.erledigt.size; },

    antworte(gewusst) {
      const e = this.schlange.shift();
      if (!e) return;
      bewerte(e, gewusst);
      if (gewusst) {
        this.richtig++;
        this.erledigt.add(e.schluessel);
      } else {
        this.falsch++;
        this.erledigt.delete(e.schluessel);
        const platz = Math.min(this.schlange.length, ABSTAND);
        this.schlange.splice(platz, 0, e);
      }
    },

    zurueckstellen() {
      const e = this.schlange.shift();
      if (e) this.schlange.push(e);
    },
  };
}
