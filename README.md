# Schichtplaner – faire Schichtpläne für Veranstaltungen

Eine kleine Web-App, die Schritt für Schritt durch die Schichtplanung einer Veranstaltung
führt, automatisch einen möglichst fairen Plan berechnet und ihn als **XLSX-Datei** zum
Weiterbearbeiten exportiert.

**Keine Installation, kein Server, keine Bibliotheken.** Alle Daten bleiben auf dem eigenen
Gerät (localStorage des Browsers), es wird nichts übertragen.

## So öffnest du die App

**Am einfachsten – eine einzige Datei:** [`schichtplaner.html`](schichtplaner.html) herunterladen
und antippen bzw. doppelklicken. Darin steckt die komplette App; sie funktioniert auch ohne
Internet und lässt sich per Mail oder Messenger weitergeben.

*Auf dem Handy:* in GitHub die Datei `schichtplaner.html` öffnen → **Download raw file** →
im Downloads-/Dateien-Ordner antippen. Danach im Browser als Lesezeichen speichern
(iPhone: Teilen → „Zum Home-Bildschirm“), dann liegt sie wie eine App auf dem Startbildschirm.

*Am Rechner:* Datei doppelklicken – sie öffnet sich im Standardbrowser.

**Als eigene Internetadresse (GitHub Pages):** im Repository auf *Settings → Pages*,
unter *Branch* diesen Branch und *„/ (root)“* auswählen, *Save*. Nach ein paar Minuten ist die
App unter `https://<benutzername>.github.io/<repository>/` erreichbar – ein Link, der auf jedem
Gerät funktioniert. (Bei privaten Repositories setzt GitHub dafür ein kostenpflichtiges Konto voraus.)

**Zum Weiterentwickeln:** `index.html` im Browser öffnen – dort liegen CSS und JavaScript in
einzelnen Dateien. Nach Änderungen `node build/build-single-file.js` ausführen, damit
`schichtplaner.html` wieder aktuell ist.

Testlauf ohne Browser: `node tests/run-tests.js` (104 Prüfungen: Zeitlogik, Planungsregeln,
Randfälle, mehrtägige Veranstaltungen, feste Zuteilungen, Altbestand, Validierung,
Excel-Erzeugung).

---

## 1. Anforderungsbeschreibung

### 1.1 Funktionale Anforderungen

| Nr. | Anforderung | Umgesetzt in |
|-----|-------------|--------------|
| F1 | Veranstaltung mit Name, Datum, Start-/Endzeit und optionalen Bemerkungen anlegen | Schritt 1 |
| F1b | **Mehrtägige Veranstaltungen** (z. B. Freitag bis Sonntag) über ein Enddatum | Schritt 1 |
| F2 | Beliebig viele Personen erfassen (einzeln oder als Namensliste auf einmal) | Schritt 2 |
| F3 | Aufgaben/Schichtarten definieren: Name, Zeitraum, Schichtlänge, Personen pro Schicht | Schritt 3 |
| F4 | Aufgabe wahlweise durchgehend, täglich wiederkehrend oder einmalig an einem Tag | Schritt 3 (`mode`) |
| F5 | Abwesenheiten je Person mit Tag, Von-/Bis-Zeit und Grund | Schritt 4 |
| F6 | „Kommt später“ / „geht früher“ je Person | Schritt 4 |
| F6b | **Vorab festlegen, wer was übernimmt** (Freiwillige) – eine bestimmte Schicht, eine beliebige Schicht oder alle Schichten einer Aufgabe | Schritt 5 |
| F7 | Automatische, faire Verteilung auf Knopfdruck | Schritt 6 → `src/scheduler.js` |
| F8 | Übersichtliche Anzeige des Ergebnisses (Zeitplan, je Person, Probleme) | Schritt 7 |
| F9 | Nicht besetzbare Schichten sichtbar markieren | Schritt 7 + Blatt „Offene Schichten“ |
| F10 | Manuelle Nachbesetzung im fertigen Plan | Schritt 7, Auswahlfelder je Platz |
| F11 | Excel-Export (XLSX), manuell weiterbearbeitbar | `src/export.js`, `src/xlsx.js` |
| F12 | Zwischenstand sichern und wieder laden | JSON-Export/-Import in der Kopfzeile |

### 1.2 Planungsregeln

**Hart** (werden nie verletzt – lieber bleibt eine Schicht offen):

1. Niemand wird in einem Zeitraum eingeplant, in dem er/sie nicht verfügbar ist.
2. Niemand hat zwei sich überschneidende Schichten.
3. Niemand steht zweimal in derselben Schicht.
4. Eine optionale Obergrenze an Schichten pro Person wird eingehalten
   (feste Zuteilungen sind davon ausgenommen – eine ausdrückliche Ansage sticht eine Faustregel).
5. Schichten liegen immer innerhalb des Veranstaltungszeitraums.
6. Feste Zuteilungen aus Schritt 5 werden vor allem anderen eingetragen und danach nicht
   mehr verändert. Übernommen werden sie nur, wenn Regel 1–3 dabei gewahrt bleiben; sonst
   bleibt der Platz frei und der Konflikt wird mit Begründung gemeldet.

**Weich** (fließen als Kosten in die Optimierung ein):

7. Alle Personen bekommen möglichst gleich viel **Gesamtarbeitszeit**.
8. Alle Personen bekommen möglichst gleich viele **Schichten**.
9. Die **Aufgabenarten** werden gleichmäßig gestreut (nicht eine Person nur Türdienst).
10. Optionale **Mindestpause** zwischen zwei Schichten.
11. Optional **Blöcke bevorzugen** (Schichten am Stück) statt sie zu vermeiden.

Ist keine vollständige Besetzung möglich, wird die bestmögliche Lösung erzeugt und jede
offene Schicht mit Begründung ausgewiesen.

### 1.3 Nicht-funktionale Anforderungen

- Bedienbar ohne technische Vorkenntnisse, deutschsprachige Oberfläche, klare Schritt-für-Schritt-Führung.
- Läuft offline und ohne Build-Werkzeuge; nur Standard-Browser-APIs.
- Reproduzierbar: gleicher Zufallsstartwert ⇒ identischer Plan.
- Responsiv (Desktop, Tablet, Handy), hell/dunkel, Druckansicht.
- Erweiterbar: neue Schichtarten und Regeln ohne Umbau des Datenmodells.

### 1.4 Bewusst nicht enthalten

Rollen und Qualifikationen (wer darf welche Aufgabe?), Benutzerkonten, Mehrbenutzerbetrieb,
Serverspeicherung, E-Mail-Versand. Ebenfalls nicht vorgesehen: mehrere getrennte
Veranstaltungen in einer Datei – dafür wird der Zwischenstand als JSON gespeichert und
später wieder geladen.

---

## 2. Datenmodell

Ein einziges JSON-Objekt beschreibt den gesamten Zustand (`src/store.js`). Es wird
im localStorage gespeichert und kann als Datei exportiert/importiert werden.

```jsonc
{
  "version": 2,
  "step": 3,                       // aktueller Wizard-Schritt (1–7)

  "event": {
    "name":      "Gemeindefreizeit",
    "date":      "2026-07-31",     // erster Tag (ISO-Datum)
    "endDate":   "2026-08-02",     // letzter Tag; gleich = eintägig
    "startTime": "17:00",          // Beginn am ersten Tag
    "endTime":   "14:00",          // Ende am letzten Tag
    "notes":     "Treffpunkt Foyer"
  },

  "people": [
    { "id": "p_1", "name": "Anna",
      "arrival":       "",         // optional: kommt erst ab dieser Uhrzeit
      "arrivalDate":   "",         // optional: an diesem Tag (leer = erster Tag)
      "departure":     "09:00",    // optional: geht ab dieser Uhrzeit
      "departureDate": "2026-08-02",
      "note":          "" }
  ],

  "tasks": [
    { "id": "t_1", "name": "Türschicht",
      "mode":          "daily",    // continuous | daily | once
      "day":           "",         // nur bei mode = "once": Tag der Aufgabe
      "startTime":     "08:00",    // bei mode = "continuous" ohne Bedeutung
      "endTime":       "22:00",
      "slotMinutes":   120,        // Länge einer einzelnen Schicht
      "peoplePerSlot": 2,          // 1, 2, … gleichzeitig benötigt
      "note":          "immer zu zweit" }
  ],

  "absences": [
    { "id": "a_1", "personId": "p_1",
      "date": "2026-08-01",        // Tag der Abwesenheit (leer = erster Tag)
      "startTime": "14:00", "endTime": "17:00", "reason": "Workshop" }
  ],

  "fixed": [                       // Vorabfestlegungen ("X macht Y")
    { "id": "f_1", "personId": "p_1", "taskId": "t_1",
      "scope": "slot",             // slot | any | all
      "day": "2026-08-02",         // nur bei scope = "slot"
      "startTime": "12:00" }       // nur bei scope = "slot"
  ],

  "options": {
    "seed":               42,      // Reproduzierbarkeit
    "minRestMinutes":      0,      // 0 = keine Vorgabe
    "maxShiftsPerPerson":  0,      // 0 = keine Obergrenze
    "preferBlocks":       false,
    "balanceTaskTypes":    true,
    "mergeShortLastSlot":  true,
    "exportSheets": { "people": true, "availability": true, "issues": true, "info": true }
  },

  "schedule": {                    // Ergebnis der Berechnung
    "generatedAt": "2026-07-31T10:00:00Z",
    "seed": 42,
    "multiDay": true,
    "window": { "start": 1020, "end": 3720 },   // Minuten ab Mitternacht des ersten Tags
    "slots": [
      { "id": "s_1", "taskId": "t_1", "taskName": "Türschicht",
        "start": 1920, "end": 2040,            // 08:00–10:00 am zweiten Tag
        "required": 2,
        "assigned": ["p_1", null],             // null = offener Platz
        "manual":   [false, false] }           // von Hand gesetzt?
    ],
    "stats":  { "…": "Kennzahlen je Person und gesamt" },
    "issues": [ { "severity": "error", "taskName": "…", "message": "…" } ]
  }
}
```

**Rhythmus einer Aufgabe** (`mode`) – der Kern der Mehrtagesunterstützung:

| Wert | Bedeutung | Beispiel |
|------|-----------|----------|
| `continuous` | einmal durchgehend über die ganze Veranstaltung, auch nachts | Rufbereitschaft |
| `daily` | an jedem Veranstaltungstag im selben Zeitfenster; am ersten und letzten Tag auf die Veranstaltungszeit gekürzt | Türschicht 08:00–22:00, Nachtwache 23:00–07:00 |
| `once` | einmalig am Tag `day` | Endreinigung am Sonntag |

**Umfang einer festen Zuteilung** (`scope`) – für Freiwillige und Absprachen:

| Wert | Bedeutung | Beispiel |
|------|-----------|----------|
| `slot` | genau die Schicht, die am Tag `day` um `startTime` beginnt | „Ich mache Samstag 14–16 Uhr die Türschicht.“ |
| `any` | irgendeine Schicht dieser Aufgabe – die App sucht die passendste aus | „Ich helfe beim Küchendienst mit.“ |
| `all` | jede Schicht dieser Aufgabe | „Das Brötchenholen übernehme ich jeden Morgen.“ |

Die belegten Plätze werden im Ergebnis als `manual` geführt; die Ausgleichsläufe fassen sie
nicht mehr an, und im Zeitplan sind sie mit 📌 gekennzeichnet.

**Zeitmodell.** Alle Uhrzeiten werden als `"HH:MM"` erfasst und intern in *Minuten seit
Mitternacht des ersten Tags* umgerechnet – 08:00 am zweiten Tag ist also 1920. Dieses eine
Raster deckt alles ab: eintägige Veranstaltungen, Veranstaltungen über Mitternacht
(20:00–02:00, das Ende wird automatisch auf den Folgetag gelegt) und mehrtägige
Veranstaltungen über das Enddatum. Kalenderdaten entstehen erst bei der Ausgabe aus
`Startdatum + ganze Tage`; im Excel steht deshalb in jeder Zeile das richtige Datum und
der Wochentag. Läuft eine Schicht über Mitternacht, wird die Endzeit als `03:00 (Sa)`
bzw. bei eintägigen Veranstaltungen als `02:00 (+1)` gekennzeichnet.

**Erweiterbarkeit und Altbestand.** Aufgaben und Personen sind flache Listen mit stabilen
IDs; eine neue Eigenschaft (z. B. `requiredSkill`, `location`, `priority`) ist ein
zusätzliches Feld plus eine Zeile in `migrate()`. `migrate()` hebt gespeicherte Stände der
Version 1 automatisch auf Version 2: fehlendes `endDate` wird zum Startdatum (also
eintägig), `wholeEvent: true/false` wird zu `mode: "continuous"/"daily"`, Abwesenheiten
ohne Datum gelten am ersten Tag. Ein alter Plan liefert dadurch exakt dasselbe Ergebnis
wie zuvor.

---

## 3. Logik der fairen Verteilung

`src/scheduler.js`, Ablauf in fünf Phasen:

### Phase 0 – Kontext und Schichten

Aus jeder Aufgabe werden zunächst ihre **Zeiträume** bestimmt (`taskPeriods`): einer bei
`continuous`, einer je Veranstaltungstag bei `daily`, genau einer bei `once`. Jeder
Zeitraum wird auf das Veranstaltungsfenster begrenzt – der Freitag beginnt also erst mit
der Anreise, der Sonntag endet mit der Abfahrt; Zeiträume über Mitternacht (23:00–07:00)
laufen korrekt in den nächsten Tag. Liegt ein Zeitraum komplett außerhalb, erscheint ein
Hinweis in der Problemliste.

Innerhalb jedes Zeitraums entsteht eine Kette von Schichten (`slots`) in Schritten von
`slotMinutes`. Eine sehr kurze Restschicht (< halbe Schichtlänge) wird auf Wunsch an die
vorherige angehängt. Je Schicht gibt es `peoplePerSlot` Plätze.

Parallel werden je Person die **Sperrzeiten** gesammelt: Abwesenheiten, Zeit vor der
Ankunft, Zeit nach dem Gehen. Daraus ergibt sich die insgesamt verfügbare Zeit je Person.

### Phase 0b – Feste Zuteilungen eintragen

Vor jeder automatischen Verteilung werden die Vorabfestlegungen gesetzt: erst die konkreten
Schichten (`slot`), dann `all`, zuletzt `any` – so bekommen die genauesten Ansagen den
Vortritt. Vor jedem Eintrag wird geprüft, ob die Person verfügbar und noch frei ist; sonst
bleibt der Platz für die automatische Verteilung offen und es entsteht eine Meldung mit
Begründung („ist zu dieser Zeit nicht verfügbar (Arzt)“, „steht zur gleichen Zeit schon fest
für eine andere Aufgabe“). Bei `any` wird die früheste passende Schicht gewählt, bei `all`
werden alle machbaren belegt und die übersprungenen zusammengefasst gemeldet.

Diese Plätze zählen ganz normal zur Arbeitszeit der Person – wer sich viel vornimmt, bekommt
vom Rest entsprechend weniger zugeteilt.

### Phase 1 – Greedy-Erstbelegung („knappste Schicht zuerst“)

Die Schichten werden nach ihrem **Spielraum** sortiert: `Zahl verfügbarer Personen − benötigte Personen`.
Schichten, für die kaum jemand infrage kommt (frühmorgens, Randzeiten, Doppelbesetzung),
werden zuerst vergeben – sonst sind die wenigen möglichen Personen später schon verplant.

Für jeden Platz wird unter den zulässigen Personen die mit dem niedrigsten Score gewählt:

```
Score = bisherige Minuten                      ← Leitgröße Fairness
      + Anzahl bisheriger Schichten × 15
      + bisherige Schichten dieser Aufgabenart × 25    (Abwechslung)
      − (1 − verfügbare Zeit / max. verfügbare Zeit) × 90
            ← wer wenig Zeit hat, wird früh berücksichtigt, sonst geht er/sie leer aus
      + 45 bei direkt angrenzender Schicht (bzw. −35, wenn Blöcke erwünscht sind)
      + 200 bei Unterschreiten der Mindestpause
      + kleiner deterministischer Zufallswert   ← bricht Gleichstände auf
```

### Phase 2 – Reparatur offener Plätze (Kettenverschiebung)

Bleibt ein Platz frei, obwohl jemand verfügbar wäre (die Person steckt in einer anderen
Schicht), wird geprüft, ob **diese andere Schicht an eine dritte Person abgegeben** werden
kann. Klappt das, rückt die verfügbare Person nach und der Plan wird vollständiger.

### Phase 3 – Ausgleich (Verschieben und Tauschen)

Bewertet wird der Gesamtplan mit einer Kostenfunktion – je kleiner, desto fairer:

```
Kosten = Varianz(Minuten je Person)              × 1
       + Varianz(Schichten je Person)            × 900
       + Σ Varianz(Schichten je Aufgabenart)     × 250
       + 2500 je verletzter Mindestpause
       +  400 je direkt angrenzender Schicht (bzw. Bonus bei „Blöcke bevorzugen“)
```

Die Varianz der Minuten ist die Leitgröße; die übrigen Terme sind so skaliert, dass sie
erst bei Gleichstand den Ausschlag geben. In mehreren Durchläufen wird versucht:

* **Verschieben** – einen Platz an eine andere zulässige Person geben,
* **Tauschen** – zwei Personen tauschen ihre Schichten (löst Fälle, in denen einzelnes
  Verschieben an Terminkollisionen scheitert).

Übernommen wird nur, was die Kosten senkt (Hill-Climbing). Danach läuft die Reparatur
erneut, weil durch das Umsortieren neue Besetzungsmöglichkeiten entstehen können.
Feste Zuteilungen (`manual`) werden dabei nie angerührt – weder verschoben noch getauscht.

### Phase 4 – Kennzahlen und Probleme

Ermittelt werden Schichten/Minuten je Person, Mittelwert, Spanne, Standardabweichung sowie
für jeden nicht besetzten Platz eine **Begründung**:

* „Niemand ist in diesem Zeitraum verfügbar.“
* „Nur *n* von *m* benötigten Personen sind überhaupt verfügbar.“
* „Alle verfügbaren Personen sind zu dieser Zeit bereits anderweitig eingeteilt.“

### Eigenschaften des Verfahrens

Das Verfahren ist eine Heuristik – bei Zielkonflikten (Abwesenheiten, Doppelbesetzungen,
Mindestpausen) garantiert kein Verfahren gleichzeitig Vollständigkeit und perfekte
Gleichverteilung. In der Praxis liegt die Spanne der Arbeitszeit typischerweise unter einer
Schichtlänge; im mitgelieferten Beispiel (8 Personen, 6 Aufgaben, 27 Schichten,
46 Plätze) sind alle Plätze besetzt und die Spanne beträgt 6,00 h – 7,25 h.
Die Laufzeit liegt im Bereich weniger Millisekunden. Wer eine andere gleichwertige Variante
möchte, ändert den Zufallsstartwert in Schritt 5.

---

## 4. Aufbau der Schritte

Durchgehende Struktur: links die Schrittleiste (jederzeit anklickbar), in der Mitte nur die
Eingaben des aktuellen Schritts, unten fest die Navigation mit „Zurück“, Kontexthinweis und
dem Hauptbutton („Weiter“ → „Plan berechnen“ → „Excel herunterladen“). Fehlende Pflichtangaben
blockieren das Weitergehen und werden konkret benannt.

| Schritt | Titel | Inhalt | Ergebnis |
|---------|-------|--------|----------|
| **1** | Veranstaltung | Name, erster und letzter Tag, Start-/Endzeit, Bemerkungen | Live-Anzeige von Wochentag, Gesamtdauer und Anzahl Tage |
| **2** | Personen | Namensliste mit Notiz, Einzel- oder Sammeleingabe | Personenzähler |
| **3** | Aufgaben | Karte je Aufgabe: Name, Rhythmus (durchgehend / jeden Tag / an einem bestimmten Tag), Zeitfenster, Schichtlänge, Personen pro Schicht, Bemerkung. Vorlagen für Tee-, Türschicht, Küche, Frühstück, Aufräumen, Einkauf | Vorschau „ergibt *n* Schichten à *x* an *m* Tagen, Personenstunden gesamt“ |
| **4** | Verfügbarkeit | Je Person: „kommt erst ab“, „geht früher“, beliebig viele Abwesenheiten mit Grund – bei mehrtägigen Veranstaltungen jeweils mit Tagesauswahl | Zähler je Person |
| **5** | Freiwillige | Zeile je Absprache: *Person* macht *Aufgabe* im gewählten *Umfang*; bei „eine bestimmte Schicht“ eine Auswahlliste der tatsächlich entstehenden Schichten. Der Schritt darf leer bleiben | – |
| **6** | Planungsregeln | Mindestpause, Höchstzahl Schichten, Zufallsstartwert, Blöcke, Aufgabenmischung, Restschichten | Bedarfsvorschau inkl. Warnung, wenn der Bedarf die verfügbare Zeit übersteigt |
| **7** | Plan & Export | Kennzahlen, drei Ansichten (Zeitplan / Nach Person / Probleme), manuelle Nachbesetzung, XLSX-, CSV- und Druckausgabe | fertige Datei |

Ansichten in Schritt 6:

* **Zeitplan** – chronologische Tabelle, bei mehrtägigen Veranstaltungen mit einer
  Zwischenüberschrift je Tag („Samstag, 01.08.2026“); je Platz ein Auswahlfeld. Nicht
  wählbare Personen sind ausgegraut *mit Grund* („kommt später“, „andere Schicht zur
  gleichen Zeit“). Offene Schichten sind rot, teilbesetzte gelb hinterlegt.
* **Nach Person** – Karte je Person mit Auslastungsbalken, verfügbarer Zeit und Schichtliste.
* **Probleme** – alle offenen Punkte mit Begründung und Hinweisen zur Behebung.

Änderungen an den Stammdaten nach einer Berechnung markieren den Plan als veraltet und
blenden einen Hinweis „Plan neu berechnen“ ein. Der Unterschied zwischen den beiden Arten
manueller Eingriffe: Eine **feste Zuteilung** (Schritt 5) gehört zu den Eingabedaten und
übersteht jedes Neuberechnen; eine Änderung direkt im **Auswahlfeld der Tabelle** gilt nur
für den gerade angezeigten Plan.

---

## 5. Excel-Ausgabe

Erzeugt wird eine echte XLSX-Datei (`src/xlsx.js` schreibt den ZIP-Container und das
OOXML selbst – keine Bibliothek, kein CDN). Alle Werte stehen als Text bzw. einfache Zahl
in der Zelle, damit die Datei anschließend frei bearbeitbar ist.

| Blatt | Spalten |
|-------|---------|
| **Schichtplan** | Datum · *Wochentag* · Aufgabe · Startzeit · Endzeit · Dauer (min) · Person 1 … Person *n* · Bemerkung (offene Plätze, feste Zuteilungen, Aufgabennotiz) |
| **Teilnehmende** | Name · Kommt ab · Geht bis · Notiz · Anzahl Schichten · Gesamtzeit (h) · Aufgabenverteilung |
| **Verfügbarkeiten** | Person · Art · *Tag* · Nicht verfügbar von · bis · Grund |
| **Offene Schichten** | Aufgabe · Datum · Von · Bis · Benötigt · Besetzt · Fehlt · Hinweis |
| **Veranstaltung** | Rahmendaten und Kennzahlen des Plans |

Die Spalte *Wochentag* und die Spalte *Tag* erscheinen nur bei mehrtägigen Veranstaltungen.
Die Zahl der Personenspalten richtet sich automatisch nach der am stärksten besetzten
Aufgabe. Kopfzeile fixiert, Autofilter gesetzt, Spaltenbreiten vorbelegt; offene Plätze
sind rot hinterlegt und mit `— offen —` beschriftet, teilbesetzte Zeilen gelb. Die
Zusatzblätter lassen sich in Schritt 6 einzeln abwählen. Alternativ gibt es CSV
(Semikolon, UTF-8 mit BOM) und eine aufgeräumte Druckansicht.

---

## 6. Projektstruktur

```
index.html            Grundgerüst, lädt die Skripte in fester Reihenfolge
schichtplaner.html    erzeugte Einzeldatei (alles inline) – zum Weitergeben
build/build-single-file.js   baut die Einzeldatei aus den Quelldateien
assets/styles.css     Gestaltung, hell/dunkel, responsiv, Druck
src/util.js           Zeit-, Datums-, Zufalls- und DOM-Hilfen
src/store.js          Datenmodell, localStorage, Validierung, Demodaten
src/scheduler.js      Schichterzeugung und faire Verteilung
src/xlsx.js           Minimaler XLSX-Writer (ZIP + OOXML)
src/export.js         Aufbau der Tabellenblätter, XLSX-/CSV-Download
src/ui.js             HTML der sechs Schritte
src/app.js            Wizard-Steuerung, Ereignisse, Datenbindung
tests/run-tests.js    Prüfungen für Node (ohne Browser)
```

Klassische `<script>`-Einbindung statt ES-Modulen, damit die App auch direkt per
`file://` (Doppelklick) funktioniert. Jede Datei kapselt sich in ein Modul-Objekt
(`window.Util`, `window.Store`, …).

### Ansatzpunkte für Erweiterungen

* **Neuer Rhythmus** (z. B. „nur an Wochenendtagen“): Zweig in `taskPeriods()` ergänzen und
  als Option in `UI.taskCard()` anbieten – der Rest der Kette bleibt unverändert.
* **Neue Regel:** Term in `cost()` ergänzen und optional in `candidateScore()` spiegeln.
* **Neue Aufgabeneigenschaft:** Feld in `Store.addTask()` + `migrate()`, Eingabe in
  `UI.taskCard()`, Auswertung in `isEligible()`.
* **Qualifikationen:** `person.skills` und `task.requiredSkill` ergänzen, in `isEligible()`
  prüfen – die harten Regeln greifen dann automatisch in allen Phasen.
* **Weiterer Umfang für Freiwillige** (z. B. „höchstens zwei Schichten dieser Aufgabe“):
  Zweig in `applyFixed()` ergänzen und als Option in `UI.fixedRow()` anbieten.
* **Weiteres Tabellenblatt:** Funktion in `src/export.js` schreiben und in
  `buildWorkbook()` einhängen.
