# Ältestenrat — Lernstoff

Lern-App für die Neuen des AMB Ingvaeonia Münster (Sondershäuser Verband).
Reines Frontend, keine Anmeldung, kein Server. Der Fortschritt liegt im
localStorage des Geräts.

## Zwei Fassungen, ein Inhalt

| | wofür | Offline |
|---|---|---|
| `index.html` + `decks/` | die Seite, auf einen Webspace legen (GitHub Pages o. ä.) | ja, über `sw.js` — einmal aufrufen, dann auf den Startbildschirm legen |
| `lernapp.html` | eine Datei zum Verschicken, per Doppelklick zu öffnen | ja, alles ist eingebacken |

`lernapp.html` wird gebaut, nicht bearbeitet:

```
node tools/build-einzeldatei.mjs
```

Zum lokalen Ausprobieren der Seitenfassung braucht es einen Webserver —
per `file://` scheitert das Nachladen der Stapel:

```
python3 -m http.server 8000     # dann http://localhost:8000/
```

## Prüfen

```
node tests/run-tests.mjs
```

Prüft alle Stapel gegen das Schema, vergleicht die Couleur-Stapel Streifen
für Streifen mit den geprüften Prototypen in `quellen/` und stellt sicher,
dass `sw.js` die Kennung des aktuellen Inhalts trägt. Nach jeder Änderung an
`decks/` oder `src/` laufen lassen.

## Aufbau

```
index.html                 Einstieg der Seitenfassung
sw.js                      Service Worker fürs Offline-Lernen
assets/styles.css          Optik der Prototypen
src/
  main.js                  Ansichten und Routing
  decks.js                 Stapel laden, Lerneinheiten bilden
  schema.js                Prüfregeln — eine Wahrheit für Laden, Redaktion und Tests
  leitner.js               fünf Fächer, Intervalle, Bewertung
  sitzung.js               Warteschlange einer Lernsitzung
  store.js                 localStorage
  stats.js                 Statistik und „was hakt“
  redaktion.js             Redaktionsansicht
  karten/                  ein Renderer je Kartentyp
decks/                     die Stapel als JSON — hier wird Inhalt gepflegt
  index.json               Manifest: welche Stapel es gibt
quellen/                   die geprüften Prototypen, gegen die getestet wird
tools/
  migriere-prototypen.mjs  erzeugt die beiden Couleur-Stapel aus quellen/
  fassung-stempeln.mjs     schreibt die Inhaltskennung in sw.js
  build-einzeldatei.mjs    baut lernapp.html
tests/run-tests.mjs
```

## Einen Stapel anlegen

Ohne Code anzufassen:

1. In der App auf **Redaktion** gehen, **Neuer Stapel**, Karten anlegen
   (oder über **Schnelleingabe** aus einer Handbuchseite einlesen).
2. **Herunterladen** — die Datei nach `decks/` legen.
3. Die Kennung des Stapels in `decks/index.json` eintragen.
4. `node tools/fassung-stempeln.mjs`, dann `node tests/run-tests.mjs`,
   dann `node tools/build-einzeldatei.mjs`.
5. Committen.

Der Stempelschritt schreibt eine Kennung aus dem Inhalt in `sw.js`. Ohne ihn
liefern schon installierte Handys weiter die alte Fassung aus dem Cache aus —
`tests/run-tests.mjs` schlägt deshalb fehl, wenn der Stempel fehlt.

## Das Schema

Jede Stapeldatei:

```json
{
  "schema": 1,
  "id": "comment-kneipe",
  "titel": "Comment: Kneipe und Kommers",
  "untertitel": "Ablauf, Regeln, Kleidung",
  "quelle": "woher der Inhalt stammt",
  "stand": "2026-09-07",
  "helleFarben": ["#ffffff"],
  "karten": []
}
```

`helleFarben` ist nur für Couleur-Stapel und nur dann nötig, wenn man die
Hairline um helle Streifen genau steuern will. Die beiden geprüften Stapel
bringen die Listen ihrer Prototypen wörtlich mit und werden dadurch
pixelgleich gezeichnet. Fehlt die Liste, entscheidet die Helligkeit der Farbe.

Jede Karte hat `id`, `typ`, `rev` und optional `notiz` und `tags`.

* **`id`** ist dauerhaft. Der Fortschritt aller Lernenden hängt daran —
  eine geänderte Kennung setzt die Karte für alle auf null.
* **`rev`** wird hochgezählt, wenn sich der Inhalt ändert. Dann fällt die
  Karte bei allen zurück in Fach 1. Genau dafür ist sie da: eine korrigierte
  Farbe darf nicht in Fach 5 weiterschlafen. Die Redaktionsansicht zählt
  automatisch hoch.

### `couleur`

```json
{
  "id": "amb-ingvaeonia-muenster",
  "typ": "couleur",
  "rev": 1,
  "band": { "streifen": [
    { "farbe": "#fe192b" },
    { "farbe": "#e3ae4d", "breite": 0.05 },
    { "farbe": "#0a0a0a", "breite": 0.9 },
    { "farbe": "#fdc356", "breite": 0.05 },
    { "farbe": "#fe182b" }
  ] },
  "farben": "rot-schwarz-rot, schwarzer Balken golden durchzogen",
  "antworten": [{ "name": "AMB Ingvaeonia", "ort": "Münster" }]
}
```

`breite` fehlt oder 1 heißt: so breit wie die übrigen. Für Perkussionen und
dünne Streifen etwas wie `0.05`, für „X auf weißem Grund“ zwei äußere
Streifen mit `0.5`. Bei den Antworten sind `ort`, `jahr`, `verband` und
`anmerkung` alle optional.

Mehrere Bünde auf einer Karte sind der Normalfall, nicht die Ausnahme —
in Münster führen drei Unitas-Verbindungen dieselben Farben.

### `frage`

```json
{ "id": "eroeffnungssatz", "typ": "frage", "rev": 1,
  "frage": "Mit welchem Satz eröffnet der Präside die Kneipe?",
  "antworten": ["Das Kommando dieser Veranstaltung liegt bei mir und nur bei mir."] }
```

Mehrere Einträge in `antworten` heißt: jeder davon gilt.

### `begriff`

```json
{ "id": "farbenfuehrend", "typ": "begriff", "rev": 1,
  "begriff": "Farbenführend",
  "definition": "Die Mitglieder führen Farben zu bestimmten Anlässen mit sich …",
  "richtung": "beide" }
```

`richtung` ist `beide` (Vorgabe), `begriff-definition` oder
`definition-begriff`. `beide` zählt als zwei Karten im Fortschritt — sonst
gälte die Karte als gekonnt, obwohl nur eine Richtung sitzt.

### `lueckentext`

```json
{ "id": "bundeslied-str2", "typ": "lueckentext", "rev": 1,
  "titel": "Bundeslied, 2. Strophe",
  "text": "Frei ist das {{Herz}}, und frei das {{Lied}}," }
```

Lücken werden `{{so}}` markiert, Alternativen `{{so|oder so}}`. Die Lücke ist
so breit wie das Wort — beim Auswendiglernen einer Strophe ist die Länge ein
gewollter Hinweis.

### `reihenfolge`

```json
{ "id": "reihe-ablauf", "typ": "reihenfolge", "rev": 1,
  "frage": "Bringe den Ablauf einer Kneipe in die richtige Reihenfolge.",
  "elemente": ["Eröffnung", "Begrüßung", ["Biermimik", "Spiele"], "Bierdorf"] }
```

`elemente` steht in der richtigen Reihenfolge; die App mischt für die Anzeige.
Ein verschachteltes Array bedeutet: an dieser Stelle ist die Reihenfolge
untereinander egal — sonst würde die App eine Ordnung als richtig lehren,
die es nicht gibt.

## Lernen

Leitner mit fünf Fächern. „Gewusst“ rückt eine Karte ein Fach weiter,
„Falsch“ setzt sie auf Fach 1 zurück und stellt sie in derselben Sitzung
noch einmal. Die Abstände in Tagen: 0, 1, 3, 7, 21.

Drei Modi: **Fällige** (was heute dran ist), **Alle**, **Nur Fehler**
(zuletzt falsch und noch in Fach 1 oder 2).

Tastatur: Leertaste zeigt die Antwort, `S` stellt zurück, `G` gewusst,
`F` falsch.

## Woher der Inhalt stammt

| Stapel | Quelle |
|---|---|
| `sv-couleur`, `muenster-couleur` | die geprüften Prototypen in `quellen/`, maschinell übertragen |
| `ingvaeonia-geschichte` | Ältestenrat, „Die Geschichte des AMB Ingvaeonia“ |
| `comment-kneipe`, `begriffe`, `verbandskunde`, `lieder` | Ältestenrat, Fuxenstunde „Studentische Traditionen und Bummeln“ |

Die Farbwerte der beiden Couleur-Stapel wurden nur umgeformt, nie neu
bestimmt. `tests/run-tests.mjs` vergleicht sie bei jedem Lauf Streifen für
Streifen mit den Prototypen.
