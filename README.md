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

Testlauf ohne Browser: `node tests/run-tests.js` (49 Prüfungen: Zeitlogik, Planungsregeln,
Randfälle, Validierung, Excel-Erzeugung).

---

## 1. Anforderungsbeschreibung

### 1.1 Funktionale Anforderungen

| Nr. | Anforderung | Umgesetzt in |
|-----|-------------|--------------|
| F1 | Veranstaltung mit Name, Datum, Start-/Endzeit und optionalen Bemerkungen anlegen | Schritt 1 |
| F2 | Beliebig viele Personen erfassen (einzeln oder als Namensliste auf einmal) | Schritt 2 |
| F3 | Aufgaben/Schichtarten definieren: Name, Zeitraum, Schichtlänge, Personen pro Schicht | Schritt 3 |
| F4 | Aufgabe wahlweise über die gesamte Veranstaltung oder nur in einem Teilzeitraum | Schritt 3 (`wholeEvent`) |
| F5 | Abwesenheiten je Person mit Von-/Bis-Zeit und Grund | Schritt 4 |
| F6 | „Kommt später“ / „geht früher“ je Person | Schritt 4 |
| F7 | Automatische, faire Verteilung auf Knopfdruck | Schritt 5 → `src/scheduler.js` |
| F8 | Übersichtliche Anzeige des Ergebnisses (Zeitplan, je Person, Probleme) | Schritt 6 |
| F9 | Nicht besetzbare Schichten sichtbar markieren | Schritt 6 + Blatt „Offene Schichten“ |
| F10 | Manuelle Nachbesetzung im fertigen Plan | Schritt 6, Auswahlfelder je Platz |
| F11 | Excel-Export (XLSX), manuell weiterbearbeitbar | `src/export.js`, `src/xlsx.js` |
| F12 | Zwischenstand sichern und wieder laden | JSON-Export/-Import in der Kopfzeile |

### 1.2 Planungsregeln

**Hart** (werden nie verletzt – lieber bleibt eine Schicht offen):

1. Niemand wird in einem Zeitraum eingeplant, in dem er/sie nicht verfügbar ist.
2. Niemand hat zwei sich überschneidende Schichten.
3. Niemand steht zweimal in derselben Schicht.
4. Eine optionale Obergrenze an Schichten pro Person wird eingehalten.
5. Schichten liegen immer innerhalb des Veranstaltungszeitraums.

**Weich** (fließen als Kosten in die Optimierung ein):

6. Alle Personen bekommen möglichst gleich viel **Gesamtarbeitszeit**.
7. Alle Personen bekommen möglichst gleich viele **Schichten**.
8. Die **Aufgabenarten** werden gleichmäßig gestreut (nicht eine Person nur Türdienst).
9. Optionale **Mindestpause** zwischen zwei Schichten.
10. Optional **Blöcke bevorzugen** (Schichten am Stück) statt sie zu vermeiden.

Ist keine vollständige Besetzung möglich, wird die bestmögliche Lösung erzeugt und jede
offene Schicht mit Begründung ausgewiesen.

### 1.3 Nicht-funktionale Anforderungen

- Bedienbar ohne technische Vorkenntnisse, deutschsprachige Oberfläche, klare Schritt-für-Schritt-Führung.
- Läuft offline und ohne Build-Werkzeuge; nur Standard-Browser-APIs.
- Reproduzierbar: gleicher Zufallsstartwert ⇒ identischer Plan.
- Responsiv (Desktop, Tablet, Handy), hell/dunkel, Druckansicht.
- Erweiterbar: neue Schichtarten und Regeln ohne Umbau des Datenmodells.

### 1.4 Bewusst nicht enthalten

Mehrtägige Veranstaltungen mit unterschiedlichen Tagesplänen (eine Veranstaltung =
ein Zeitraum, Mitternachtsüberlauf ist abgedeckt), Rollen/Qualifikationen, Benutzerkonten,
Mehrbenutzerbetrieb, Serverspeicherung, E-Mail-Versand.

---

## 2. Datenmodell

Ein einziges JSON-Objekt beschreibt den gesamten Zustand (`src/store.js`). Es wird
im localStorage gespeichert und kann als Datei exportiert/importiert werden.

```jsonc
{
  "version": 1,
  "step": 3,                       // aktueller Wizard-Schritt (1–6)

  "event": {
    "name":      "Sommerfest",
    "date":      "2026-07-27",     // ISO-Datum
    "startTime": "08:00",          // "HH:MM"
    "endTime":   "22:00",          // liegt sie vor startTime → Folgetag
    "notes":     "Treffpunkt Foyer"
  },

  "people": [
    { "id": "p_1", "name": "Anna",
      "arrival":   "",             // optional: kommt erst ab
      "departure": "18:00",        // optional: geht früher
      "note":      "" }
  ],

  "tasks": [
    { "id": "t_1", "name": "Türschicht",
      "wholeEvent":    true,       // false → eigener Teilzeitraum
      "startTime":     "08:00",    // nur bei wholeEvent = false relevant
      "endTime":       "22:00",
      "slotMinutes":   60,         // Länge einer einzelnen Schicht
      "peoplePerSlot": 2,          // 1, 2, … gleichzeitig benötigt
      "note":          "immer zu zweit" }
  ],

  "absences": [
    { "id": "a_1", "personId": "p_1",
      "startTime": "14:00", "endTime": "16:00", "reason": "Workshop" }
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
    "generatedAt": "2026-07-27T10:00:00Z",
    "seed": 42,
    "window": { "start": 480, "end": 1320 },   // Minuten seit Mitternacht
    "slots": [
      { "id": "s_1", "taskId": "t_1", "taskName": "Türschicht",
        "start": 480, "end": 540,              // Minuten seit Mitternacht des Starttags
        "required": 2,
        "assigned": ["p_1", null],             // null = offener Platz
        "manual":   [false, false] }           // von Hand gesetzt?
    ],
    "stats":  { "…": "Kennzahlen je Person und gesamt" },
    "issues": [ { "severity": "error", "taskName": "…", "message": "…" } ]
  }
}
```

**Zeitmodell.** Alle Uhrzeiten werden als `"HH:MM"` erfasst und intern in *Minuten seit
Mitternacht des Starttags* umgerechnet. Liegt eine Endzeit rechnerisch vor ihrer Startzeit,
wird ein Tag addiert – damit funktionieren Veranstaltungen über Mitternacht (20:00–02:00)
ohne Sonderfälle. Für die Anzeige wird ein Folgetag als `01:00 (+1)` markiert, im Excel
steht das korrekte Kalenderdatum in der Datumsspalte.

**Erweiterbarkeit.** Aufgaben und Personen sind flache Listen mit stabilen IDs; eine neue
Eigenschaft (z. B. `requiredSkill`, `location`, `priority`) ist ein zusätzliches Feld plus
eine Zeile in `migrate()`. Alte gespeicherte Stände bleiben lauffähig, weil `migrate()`
fehlende Felder aus dem Standardzustand ergänzt.

---

## 3. Logik der fairen Verteilung

`src/scheduler.js`, Ablauf in fünf Phasen:

### Phase 0 – Kontext und Schichten

Aus jeder Aufgabe entsteht eine Kette von Schichten (`slots`): vom Beginn des Aufgaben-
zeitraums in Schritten von `slotMinutes` bis zum Ende. Eine sehr kurze Restschicht
(< halbe Schichtlänge) wird auf Wunsch an die vorherige angehängt. Je Schicht gibt es
`peoplePerSlot` Plätze. Aufgabenzeiträume werden auf das Veranstaltungsfenster begrenzt;
liegt eine Aufgabe komplett außerhalb, erscheint ein Hinweis in der Problemliste.

Parallel werden je Person die **Sperrzeiten** gesammelt: Abwesenheiten, Zeit vor der
Ankunft, Zeit nach dem Gehen. Daraus ergibt sich die insgesamt verfügbare Zeit je Person.

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
Von Hand gesetzte Zuteilungen (`manual`) werden dabei nicht angerührt.

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
| **1** | Veranstaltung | Name, Datum, Start-/Endzeit, Bemerkungen | Live-Anzeige von Wochentag, Dauer und Mitternachtsüberlauf |
| **2** | Personen | Namensliste mit Notiz, Einzel- oder Sammeleingabe | Personenzähler |
| **3** | Aufgaben | Karte je Aufgabe: Name, ganzer/teilweiser Zeitraum, Schichtlänge, Personen pro Schicht, Bemerkung. Vorlagen für Tee-, Türschicht, Küche, Frühstück, Aufräumen, Einkauf | Vorschau „ergibt *n* Schichten à *x*, Personenstunden gesamt“ |
| **4** | Verfügbarkeit | Je Person: „kommt erst ab“, „geht früher“, beliebig viele Abwesenheiten mit Grund | Zähler je Person |
| **5** | Planungsregeln | Mindestpause, Höchstzahl Schichten, Zufallsstartwert, Blöcke, Aufgabenmischung, Restschichten | Bedarfsvorschau inkl. Warnung, wenn der Bedarf die verfügbare Zeit übersteigt |
| **6** | Plan & Export | Kennzahlen, drei Ansichten (Zeitplan / Nach Person / Probleme), manuelle Nachbesetzung, XLSX-, CSV- und Druckausgabe | fertige Datei |

Ansichten in Schritt 6:

* **Zeitplan** – chronologische Tabelle; je Platz ein Auswahlfeld. Nicht wählbare Personen
  sind ausgegraut *mit Grund* („kommt später“, „andere Schicht zur gleichen Zeit“).
  Offene Schichten sind rot, teilbesetzte gelb hinterlegt.
* **Nach Person** – Karte je Person mit Auslastungsbalken, verfügbarer Zeit und Schichtliste.
* **Probleme** – alle offenen Punkte mit Begründung und Hinweisen zur Behebung.

Änderungen an den Stammdaten nach einer Berechnung markieren den Plan als veraltet und
blenden einen Hinweis „Plan neu berechnen“ ein.

---

## 5. Excel-Ausgabe

Erzeugt wird eine echte XLSX-Datei (`src/xlsx.js` schreibt den ZIP-Container und das
OOXML selbst – keine Bibliothek, kein CDN). Alle Werte stehen als Text bzw. einfache Zahl
in der Zelle, damit die Datei anschließend frei bearbeitbar ist.

| Blatt | Spalten |
|-------|---------|
| **Schichtplan** | Datum · Aufgabe · Startzeit · Endzeit · Dauer (min) · Person 1 … Person *n* · Bemerkung |
| **Teilnehmende** | Name · Kommt ab · Geht bis · Notiz · Anzahl Schichten · Gesamtzeit (h) · Aufgabenverteilung |
| **Verfügbarkeiten** | Person · Art · Nicht verfügbar von · bis · Grund |
| **Offene Schichten** | Aufgabe · Datum · Von · Bis · Benötigt · Besetzt · Fehlt · Hinweis |
| **Veranstaltung** | Rahmendaten und Kennzahlen des Plans |

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

* **Neue Regel:** Term in `cost()` ergänzen und optional in `candidateScore()` spiegeln.
* **Neue Aufgabeneigenschaft:** Feld in `Store.addTask()` + `migrate()`, Eingabe in
  `UI.taskCard()`, Auswertung in `isEligible()`.
* **Qualifikationen:** `person.skills` und `task.requiredSkill` ergänzen, in `isEligible()`
  prüfen – die harten Regeln greifen dann automatisch in allen Phasen.
* **Weiteres Tabellenblatt:** Funktion in `src/export.js` schreiben und in
  `buildWorkbook()` einhängen.
