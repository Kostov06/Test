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
node tests/
  run-tests.mjs            Schema, Farbtreue, Leitner, Spiellogik
  browser-check.mjs        Durchlauf im echten Browser (braucht Playwright)
```

Prüft alle Stapel gegen das Schema, vergleicht die Couleur-Stapel Streifen
für Streifen mit den geprüften Prototypen in `quellen/`, prüft Leitner- und
Spiellogik und stellt sicher, dass `sw.js` die Kennung des aktuellen Inhalts
trägt. Nach jeder Änderung an `decks/` oder `src/` laufen lassen.

Dazu ein Durchlauf im echten Browser — Seitenfassung unter einem Unterpfad,
offline, Einzeldatei, alle Kartentypen, alle Breiten ab 320 px:

```
node tests/browser-check.mjs            # wenn playwright installiert ist
node tests/browser-check.mjs /pfad/zu/playwright/index.js
```

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
  held.js                  Figur, Ausrüstung, Münzen, Ränge
  koepfe.js                ERZEUGT — Frisuren aus Open Peeps (CC0)
  figur.js                 zeichnet den Helden als SVG
  spiel.js                 Charaktererstellung und Kleiderkammer
  redaktion.js             Redaktionsansicht (nur über #/redaktion)
  karten/                  ein Renderer je Kartentyp
    auswahl.js             baut die Möglichkeiten und mischt sie
    wahlfeld.js            die Knopfreihe für Multiple Choice
decks/                     die Stapel als JSON — hier wird Inhalt gepflegt
  index.json               Manifest: welche Stapel es gibt
quellen/                   die geprüften Prototypen, gegen die getestet wird
tools/
  migriere-prototypen.mjs  erzeugt die beiden Couleur-Stapel aus quellen/
  fassung-stempeln.mjs     schreibt die Inhaltskennung in sw.js
  icons-bauen.mjs          erzeugt die App-Symbole aus Ingvaeonias Farbband
  koepfe-bauen.mjs         schneidet die Frisuren aus Open Peeps aus
  build-einzeldatei.mjs    baut lernapp.html
tests/
  run-tests.mjs            Schema, Farbtreue, Leitner, Spiellogik
  browser-check.mjs        Durchlauf im echten Browser (braucht Playwright)
```

## Einen Stapel anlegen

Ohne Code anzufassen:

1. Die Redaktionsansicht über die Adresse `…/#/redaktion` öffnen — sie steht
   bewusst nicht auf der Startseite, die Neuen brauchen sie nicht. Dort
   **Neuer Stapel**, Karten anlegen (oder über **Schnelleingabe** aus einer
   Handbuchseite einlesen).
2. **Herunterladen** — die Datei nach `decks/` legen.
3. Die Kennung des Stapels in `decks/index.json` eintragen.
4. `node tools/fassung-stempeln.mjs`, dann `node tests/run-tests.mjs`,
   dann `node tools/build-einzeldatei.mjs`.
5. Committen.

Die **Schnelleingabe** liest Blöcke, die durch eine Leerzeile getrennt sind.
Die erste Zeile bestimmt die Art: `F:` Frage, `B:` Begriff, `L:` Lückentext,
`R:` Reihenfolge. Dazu `A:` Antwort, `D:` Definition, `T:` Text, `E:` Element,
`N:` Notiz — und für Fragen und Begriffe `P:` für die Zusatzzeile sowie `X:`
für je eine falsche Möglichkeit:

```
F: Wie lautet der Wahlspruch des SV?
A: „Lied, Freundschaft, Vaterland“
X: „Ehre, Freiheit, Vaterland“
X: „Lied, Freiheit, Vaterland“
N: „Ehre, Freiheit, Vaterland“ ist der Wahlspruch vieler Burschenschaften.
```

Dieselben Felder gibt es auch einzeln im Karteneditor.

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

Jede Karte hat `id`, `typ`, `rev` und optional `notiz`, `prompt` (eine
Zusatzzeile unter der Frage), `gruppe` (woraus die Ablenker kommen dürfen)
und `ablenker` (eine Liste eigener falscher Möglichkeiten).

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

## Der Held

Beim ersten Start legt man eine Figur an: Name, Statur, Frisur, Haarfarbe,
Hautton. Danach steht sie oben auf der Übersicht und lässt sich dort wieder
ändern — die Ausrüstung bleibt dabei erhalten.

Gezeichnet wird sie in `src/figur.js` als SVG aus Einzelteilen: Fahne hinten,
Beine, Schuhe, Oberteil, Halsstück, Jacke, Zipfelbund, Arme, Gegenstand in
der Hand, Kopf. Kräftige Tuschelinie, flache Flächen, keine Verläufe. Alle
Farben laufen durch eine Schleuse, die nur `#rrggbb` durchlässt: die
Fahnenfarben kommen aus den Stapeln, und Stapel sind Dateien, die jemand
von Hand schreibt.

### Die Frisuren

Der Kopf wird nicht gezeichnet, sondern eingesetzt. Die 33 Frisuren stammen
aus **„Open Peeps“ von Pablo Stanley** (openpeeps.com), gemeinfrei unter
CC0 1.0. `tools/koepfe-bauen.mjs` schneidet sie einmalig aus und legt sie als
`src/koepfe.js` ab:

```
npm install @dicebear/core @dicebear/collection
node tools/koepfe-bauen.mjs
```

Das ist ein reines Bauwerkzeug. Das Ergebnis ist eingecheckt, die App selbst
hat keine Paketabhängigkeit und lädt nichts nach — sonst liefe sie nicht
offline. Der Schritt ist nur nötig, wenn Frisuren dazukommen sollen; eine
Prüfung in `tests/run-tests.mjs` wacht darüber, dass kein `node_modules` im
Repo landet.

Alle Frisuren teilen dieselbe Schädelform, deshalb sitzt der Kopf über eine
feste Verschiebung an derselben Stelle. Große Frisuren ragen darüber hinaus,
statt die Figur zu stauchen. Vom Ausschneiden verworfen werden Varianten,
die in der Vorlage gar keinen Schädel zeichnen — das prüft das Werkzeug
selbst, sonst fiele es erst im Bild auf.

**Eine eigene Haarfarbe gibt es nicht.** In der Vorlage ist das Haar bei den
meisten Frisuren Teil der Tuschezeichnung und lässt sich nicht sauber von
den Umrissen trennen. Dafür sind es 33 wirkliche Frisuren statt sechs
Formen in sechs Farben.

## Ingvaeonencoins

Jede beantwortete Karte zahlt. Der Lohn hängt am Leitner-Fach **vor** der
Antwort — eine Karte, die noch im ersten Fach steckt, bringt am meisten,
weil dort wirklich etwas gelernt wird:

| Fach vor der Antwort | 1 | 2 | 3 | 4 | 5 | falsch |
|---|---|---|---|---|---|---|
| Coins | 10 | 8 | 6 | 5 | 4 | 2 |

Dazu 20 Coins für jede fünfte richtige Antwort in Folge und 50 für eine
beendete Sitzung. Ein erster vollständiger Durchgang über alle Stapel bringt
rund 2100 Coins; spätere Durchgänge weniger, weil die Karten dann in höheren
Fächern stehen. Damit sind Schuhe, Krawatte, Bier, Wachsjacke und Octopott
schon im ersten Durchgang drin; die SV-Fahne bleibt das Fernziel.

**Eine falsche Antwort zahlt auch.** Nicht viel, aber mehr als nichts — und
immer weniger als die billigste richtige. `tests/run-tests.mjs` prüft diese
Ordnung.

Der Katalog steht in `src/held.js`. Jedes Stück sagt über sein Feld `art`,
wie es gezeichnet wird — nicht über seine Kennung. Eine weitere Krawatte
oder ein weiterer Anzug braucht deshalb nur einen Eintrag im Katalog, keine
Codeänderung. Eine neue *Art* braucht zusätzlich eine Stelle in
`src/figur.js`.

Bei den Trophäen sucht man sich aus, bei welchem Bund die Fahne
abhandenkommt. Die Liste kommt aus dem jeweiligen Couleur-Stapel, mit den
geprüften Farben daneben — der Diebstahl ist damit nebenbei eine Übung.

## Der Held bleibt auf dem Gerät

Held, Ausrüstung, Coins und Lernfortschritt liegen im localStorage — also im
Browser des jeweiligen Geräts, nicht in der App. **Wer die App weitergibt,
gibt seinen Helden nicht mit:** `lernapp.html` enthält nur die Stapel, und
der Pages-Link ist für jeden Besucher eine leere Seite. Wer sie zum ersten
Mal öffnet, landet in der Charaktererstellung und fängt bei null an.

`tests/run-tests.mjs` sieht in der gebauten Einzeldatei nach, dass dort
wirklich kein Heldenfeld steht, und `tests/browser-check.mjs` legt in zwei
getrennten Browserkontexten — also auf zwei Geräten — je einen eigenen
Helden an.

Auf **demselben** Gerät teilen sich alle denselben Speicher. Dafür steht
beim Ändern des Helden **Von vorn anfangen**: das löscht Held, Ausrüstung,
Coins und alle Leitner-Fächer nach Rückfrage. Wer seinen Stand behalten
will, sichert ihn vorher als Datei.

## Das Kneipspiel

Unter **Kneipspiel** steht man mit der eigenen Figur an der Kneiptafel.
Links und rechts ein Zapfen, besetzt mit Herren im dunklen Anzug und Damen
im Kleid; dazwischen hängt die Fahne. Es wird etwas gerufen — „Silentium!“,
„Ad exercitium salamandris!“ — und man wählt aus vier Möglichkeiten, was man
sagt oder tut. Richtig und falsch zählen wie im Lernen: dieselben Fächer,
derselbe Lohn.

Das Spiel bringt keinen eigenen Inhalt mit. Es spielt den Stapel
`decks/kneipspiel.json`, und zwar mit ganz gewöhnlichen `frage`-Karten:
die `frage` ist die Lage, das optionale `prompt` der Zuruf, `antworten[0]`
die richtige Entgegnung und `ablenker` die drei falschen. Wer eine Szene
ergänzen will, schreibt eine Karte mehr in diesen Stapel — am Code ist
nichts zu ändern. `src/kneipspiel.js` zeichnet nur die Kulisse: die Gäste
tragen Sachen, die es im Laden gar nicht zu kaufen gibt, deshalb stehen
ihre Kleidungsstücke dort als fertige Stücke statt als Kennungen.

Der Stapel ist **noch nicht geprüft** — er baut auf allgemein üblichem
Kneiplatein auf. Was davon bei uns so gilt, muss der Ältestenrat durchsehen;
der Warnhinweis steht in `quelle` und auf der Startseite des Spiels.

## Spielstand

Fortschritt, Coins und Ausrüstung liegen im localStorage dieses Geräts, in
zwei getrennten Schlüsseln (`ael.fortschritt.v1`, `ael.held.v1`), damit das
eine nicht das andere beschädigt.

localStorage überlebt aber kein gelöschtes Browserprofil und reist nicht aufs
nächste Handy mit. Deshalb gibt es auf der Übersicht **Stand sichern** und
**Stand laden**: eine JSON-Datei mit Held und Fortschritt, die man
aufbewahren oder auf ein anderes Gerät mitnehmen kann. Beim Laden wird der
Stand auf dem Gerät überschrieben, nach Rückfrage.

## Karte und Abfrage

Eine **Karte** ist ein Eintrag in `decks/`. Eine **Abfrage** ist das, was beim
Lernen einmal auf dem Schirm steht und einen eigenen Platz im Leitner-Fach
hat. Meist ist das dasselbe — nur ein Begriff mit `richtung: "beide"` ist
eine Karte, aber zwei Abfragen. Die Redaktionsansicht zählt Karten, die
Lernansicht zählt Abfragen; die Statistik zeigt beides nebeneinander.

## Lernen

Leitner mit fünf Fächern. Eine richtige Antwort rückt die Karte ein Fach
weiter, eine falsche setzt sie auf Fach 1 zurück und stellt sie in derselben
Sitzung noch einmal. Die Abstände in Tagen: 0, 1, 3, 7, 21.

Drei Modi: **Fällige** (was heute dran ist), **Alle**, **Nur Fehler**
(zuletzt falsch und noch in Fach 1 oder 2).

### Wie abgefragt wird

Die App prüft selbst, statt zu fragen „gewusst?“. Eine Selbsteinschätzung
lässt sich belügen — und wer sich belügt, lernt nichts, weil das ganze
Leitner-Verfahren auf der Bewertung steht.

| Kartentyp | Abfrage |
|---|---|
| `couleur` | Band sehen, aus vier Bünden den richtigen antippen |
| `frage` | aus mehreren Antworten die richtige antippen |
| `begriff` | je nach Richtung aus mehreren Begriffen oder Definitionen wählen |
| `lueckentext` | die fehlenden Wörter eintippen |
| `reihenfolge` | Elemente ordnen, die App weiß selbst, ob es stimmt |

**Wo die richtige Antwort steht, entscheidet Fisher-Yates** — gleichverteilt
über alle Plätze, kein „meistens B“. `tests/run-tests.mjs` zählt das über
20 000 Durchläufe nach und lässt nur durch, was den Chi-Quadrat-Test auf
dem 0,1-%-Niveau besteht.

Ablenker stehen zuerst in der Karte selbst (`ablenker`), danach kommen sie
aus derselben `gruppe` und erst zuletzt aus dem ganzen Stapel. Auf einer
Begriffskarte sind die eigenen Ablenker *Definitionen*; wird dieselbe Karte
andersherum abgefragt („Welcher Begriff?“), bleiben sie weg und die
Möglichkeiten kommen aus dem Stapel — ein einzelnes Wort zwischen drei
Sätzen verriete sich von selbst. Handgeschrieben
sind sie am besten: beim SV-Wahlspruch stehen die Wahlsprüche anderer Verbände
zur Wahl, bei der Nadel die Seite, auf der sie gerade nicht sitzt. Ohne das
antworten die Ablenker auf andere Fragen und lassen sich allein am Gegenstand
aussortieren — die Frage wäre zu leicht. Enthält die Antwort eine Jahreszahl,
werden nahe Jahre bevorzugt: bei „Wann war das?“ stehen vier Jahreszahlen zur
Wahl, kein Fließtext. Ist eine Antwort länger als 90 Zeichen, gibt es drei statt
vier Möglichkeiten — sonst wird es auf dem Handy eine Textwand.

Beim Eintippen wird großzügig verglichen: Groß- und Kleinschreibung,
Leerzeichen und Satzzeichen am Rand sind egal, die Schreibweise selbst
nicht. Wer `heisst` statt `heißt` tippt, hat es nicht gewusst.

Gibt es für eine Karte zu wenige Ablenker im Stapel — oder hat sie mehrere
gültige Antworten, die sich nicht ankreuzen lassen —, fällt sie auf die
Selbsteinschätzung zurück. Das ist der Ausnahmefall, nicht die Regel.

Tastatur: `1` bis `4` wählen, Leertaste prüft und geht weiter, `S` stellt
zurück.

## Fremdes Material

| Was | Woher | Lizenz |
|---|---|---|
| Die 33 Frisuren in `src/koepfe.js` | „Open Peeps“ von Pablo Stanley, openpeeps.com | CC0 1.0, gemeinfrei |

CC0 verlangt keine Nennung; sie steht hier, weil es sich gehört. Sonst ist
nichts Fremdes in der App: keine Schriftarten, keine Bibliotheken, keine
Bilder von außen.

## Woher der Inhalt stammt

| Stapel | Quelle |
|---|---|
| `sv-couleur`, `muenster-couleur` | die geprüften Prototypen in `quellen/`, maschinell übertragen |
| `ingvaeonia-geschichte` | Ältestenrat, „Die Geschichte des AMB Ingvaeonia“ |
| `comment-kneipe`, `begriffe`, `verbandskunde`, `lieder` | Ältestenratsabend „Studentische Traditionen und Bummeln“ |
| `sv-verbandskunde` | Ältestenratsabend „Sondershäuser Verband — Geschichte & Struktur“ |
| `kneipvokabeln`, `kneipspiel` | **noch nicht geprüft** — allgemein übliches Kneiplatein, nicht aus euren Unterlagen |

An den Liedstrophen sind drei Schreibfehler der Vorlage stillschweigend
berichtigt: `heisst’s` → `heißt’s`, das Wiederholungszeichen `¦:` → `|:`
(die Folie benutzt den Broken Bar statt des Taktstrichs) und ein `noch` am
Satzanfang großgeschrieben. Sonst stehen die Strophen Wort für Wort wie in
der Vorlage. Die App-Symbole in `assets/` sind kein Bild, sondern aus
`decks/muenster-couleur.json` gerechnet — auch das Symbol erfindet keine
Farbe.

Die Farbwerte der beiden Couleur-Stapel wurden nur umgeformt, nie neu
bestimmt. `tests/run-tests.mjs` vergleicht sie bei jedem Lauf Streifen für
Streifen mit den Prototypen.
