/* ============================================================
   ui.js – Darstellung der einzelnen Wizard-Schritte
   Liefert HTML-Strings; die Ereignisbehandlung übernimmt app.js
   per Delegation (data-action / data-bind).
   ============================================================ */

window.UI = (function () {
  'use strict';

  var U = window.Util;
  var e = U.escapeHtml;

  var STEPS = [
    { n: 1, label: 'Veranstaltung',   desc: 'Name, Datum, Zeitraum' },
    { n: 2, label: 'Personen',        desc: 'Wer kann eingeteilt werden?' },
    { n: 3, label: 'Aufgaben',        desc: 'Schichtarten und Längen' },
    { n: 4, label: 'Verfügbarkeit',   desc: 'Abwesenheiten eintragen' },
    { n: 5, label: 'Planungsregeln',  desc: 'Feineinstellungen' },
    { n: 6, label: 'Plan & Export',   desc: 'Ergebnis und Excel' }
  ];

  var TASK_PRESETS = [
    { name: 'Teeschicht',             slotMinutes: 120, peoplePerSlot: 1, wholeEvent: true },
    { name: 'Türschicht',             slotMinutes: 60,  peoplePerSlot: 2, wholeEvent: true },
    { name: 'Küchendienst / Essen',   slotMinutes: 90,  peoplePerSlot: 2, wholeEvent: false },
    { name: 'Frühstücksvorbereitung', slotMinutes: 90,  peoplePerSlot: 2, wholeEvent: false },
    { name: 'Aufräumen',              slotMinutes: 60,  peoplePerSlot: 2, wholeEvent: false },
    { name: 'Brötchen besorgen',      slotMinutes: 60,  peoplePerSlot: 1, wholeEvent: false }
  ];

  /* view-lokaler Zustand (nicht persistiert) */
  var view = { tab: 'timeline' };

  /* ---------------- Navigation ---------------- */

  function renderNav(state) {
    return STEPS.map(function (s) {
      var current = s.n === state.step;
      var done = s.n < state.step;
      return '<button type="button" class="stepnav-item' + (done ? ' done' : '') + '"' +
        (current ? ' aria-current="step"' : '') +
        ' data-action="goto-step" data-step="' + s.n + '">' +
        '<span class="stepnav-num">' + (done ? '✓' : s.n) + '</span>' +
        '<span><span class="stepnav-label">' + e(s.label) + '</span><br>' +
        '<span class="stepnav-desc">' + e(s.desc) + '</span></span>' +
        '</button>';
    }).join('');
  }

  function head(step, title, text) {
    return '<div class="step-head">' +
      '<div class="step-kicker">Schritt ' + step + ' von 6</div>' +
      '<h2>' + e(title) + '</h2>' +
      '<p>' + text + '</p></div>';
  }

  /* ---------------- Schritt 1: Veranstaltung ---------------- */

  /** Live-Hinweis zum Zeitraum der Veranstaltung (wird gezielt aktualisiert) */
  function eventDurationHtml(state) {
    var ev = state.event;
    var s = U.parseTime(ev.startTime), en = U.parseTime(ev.endTime);
    if (s === null || en === null || !ev.date) return '';
    if (ev.endDate && U.daysBetween(ev.date, ev.endDate) < 0) {
      return '<span style="color:var(--danger)">Das Enddatum liegt vor dem Startdatum.</span>';
    }
    var w = window.Scheduler.eventWindow(ev);
    var days = window.Store.eventDays().length;
    var lastIso = U.dateForMinutes(ev.date, w.end - 1);
    return 'Von <strong>' + U.weekdayShort(ev.date) + ', ' + U.formatDate(ev.date) + ', ' + U.formatTime(w.start) +
      '</strong> bis <strong>' + U.weekdayShort(lastIso) + ', ' + U.formatDate(lastIso) + ', ' + U.formatTime(w.end) +
      '</strong> · Dauer ' + U.formatDuration(w.end - w.start) +
      (days > 1 ? ' · <strong>' + days + ' Tage</strong>' : '');
  }

  /** Hinweistext unter den Datumsfeldern */
  function dayHint(iso, isEnd) {
    if (!iso) return '';
    var state = window.Store.get();
    var text = U.weekdayName(iso);
    if (isEnd && U.daysBetween(state.event.date, iso) === 0) text += ' · gleicher Tag = eintägig';
    return text;
  }

  function step1(state) {
    var ev = state.event;
    var multi = U.daysBetween(ev.date, ev.endDate || ev.date) > 0;

    return '<section class="panel">' +
      head(1, 'Veranstaltung anlegen',
        'Rahmendaten der Veranstaltung. Der hier festgelegte Zeitraum ist die Obergrenze für alle Schichten. ' +
        'Für ein Wochenende einfach ein späteres Enddatum wählen.') +
      '<div class="field-grid">' +
        field('Name der Veranstaltung *', '<input type="text" data-bind="event.name" value="' + e(ev.name) + '" placeholder="z. B. Sommerfest der Gemeinde" autocomplete="off">', '', 'span-2') +
        field('Erster Tag *', '<input type="date" data-bind="event.date" value="' + e(ev.date) + '">',
          '<span id="dayHintStart">' + e(dayHint(ev.date)) + '</span>') +
        field('Letzter Tag *', '<input type="date" data-bind="event.endDate" value="' + e(ev.endDate || ev.date) + '">',
          '<span id="dayHintEnd">' + e(dayHint(ev.endDate || ev.date, true)) + '</span>') +
        field('Beginn am ersten Tag *', '<input type="time" data-bind="event.startTime" value="' + e(ev.startTime) + '">') +
        field('Ende am letzten Tag *', '<input type="time" data-bind="event.endTime" value="' + e(ev.endTime) + '">',
          multi ? '' : 'Liegt die Endzeit vor der Startzeit, endet die Veranstaltung nach Mitternacht.') +
        field('Bemerkungen (optional)', '<textarea data-bind="event.notes" placeholder="Hinweise, die im Plan und im Excel-Export erscheinen">' + e(ev.notes) + '</textarea>', '', 'span-2') +
      '</div>' +
      '<p class="small muted mt-16" id="eventDuration">' + eventDurationHtml(state) + '</p>' +
      '</section>';
  }

  function field(label, control, hint, extraClass) {
    return '<div class="field ' + (extraClass || '') + '">' +
      '<label>' + e(label) + '</label>' + control +
      (hint ? '<span class="hint">' + hint + '</span>' : '') +
      '</div>';
  }

  /* ---------------- Schritt 2: Personen ---------------- */

  function peopleCountText(state) {
    return state.people.filter(function (p) { return p.name.trim(); }).length + ' Person(en) erfasst';
  }

  function step2(state) {
    var rows = state.people.map(function (p, i) {
      return '<div class="row-item">' +
        '<span class="idx">' + (i + 1) + '.</span>' +
        '<input type="text" data-bind="person.name" data-id="' + p.id + '" value="' + e(p.name) + '" placeholder="Vor- und Nachname" autocomplete="off">' +
        '<input type="text" data-bind="person.note" data-id="' + p.id + '" value="' + e(p.note) + '" placeholder="Notiz (optional)" style="max-width:220px">' +
        '<button type="button" class="btn btn-icon" data-action="remove-person" data-id="' + p.id + '" title="Person entfernen" aria-label="Person entfernen">✕</button>' +
        '</div>';
    }).join('');

    return '<section class="panel">' +
      head(2, 'Teilnehmende Personen erfassen',
        'Alle Personen, die grundsätzlich für Schichten eingeplant werden dürfen. Abwesenheiten werden erst in Schritt&nbsp;4 eingetragen.') +
      (state.people.length
        ? '<div class="row-list">' + rows + '</div>'
        : '<div class="empty">Noch keine Personen erfasst.</div>') +
      '<div class="actions-row mt-16">' +
        '<button type="button" class="btn btn-secondary" data-action="add-person">+ Person hinzufügen</button>' +
        '<span class="small muted" id="peopleCount">' + peopleCountText(state) + '</span>' +
      '</div>' +
      '<div class="mt-16">' +
        '<div class="section-title"><h3>Mehrere Namen auf einmal einfügen</h3></div>' +
        '<textarea id="bulkNames" placeholder="Ein Name pro Zeile oder durch Komma getrennt"></textarea>' +
        '<div class="actions-row mt-16"><button type="button" class="btn btn-secondary btn-sm" data-action="add-bulk">Namen übernehmen</button></div>' +
      '</div>' +
      '</section>';
  }

  /* ---------------- Schritt 3: Aufgaben ---------------- */

  function step3(state) {
    var cards = state.tasks.map(function (t, i) { return taskCard(state, t, i); }).join('');
    var presets = TASK_PRESETS.map(function (p, i) {
      return '<button type="button" class="btn btn-ghost btn-sm" data-action="add-preset" data-preset="' + i + '">+ ' + e(p.name) + '</button>';
    }).join('');

    return '<section class="panel">' +
      head(3, 'Aufgaben und Schichtarten definieren',
        'Je Aufgabe wird festgelegt, wann sie benötigt wird, wie lang eine Schicht ist und wie viele Personen gleichzeitig gebraucht werden.') +
      '<div class="note note-info"><strong>Vorlagen:</strong> ' + presets + '</div>' +
      (state.tasks.length ? cards : '<div class="empty">Noch keine Aufgaben angelegt.</div>') +
      '<div class="actions-row mt-16">' +
        '<button type="button" class="btn btn-secondary" data-action="add-task">+ Eigene Aufgabe hinzufügen</button>' +
      '</div>' +
      '</section>';
  }

  function taskTitleText(task, index) {
    return 'Aufgabe ' + (index + 1) + (task.name.trim() ? ': ' + task.name.trim() : '');
  }

  function taskCard(state, task, index) {
    var multi = window.Store.isMultiDay();
    var mode = task.mode || 'continuous';
    var days = window.Store.eventDays();

    var modeOptions =
      '<option value="continuous"' + (mode === 'continuous' ? ' selected' : '') + '>' +
        (multi ? 'Durchgehend, Tag und Nacht' : 'Über die gesamte Veranstaltung') + '</option>' +
      '<option value="daily"' + (mode === 'daily' ? ' selected' : '') + '>' +
        (multi ? 'Jeden Tag zur gleichen Zeit' : 'Nur in einem bestimmten Zeitraum') + '</option>' +
      (multi ? '<option value="once"' + (mode === 'once' ? ' selected' : '') + '>Nur an einem bestimmten Tag</option>' : '');

    var dayOptions = days.map(function (d) {
      return '<option value="' + e(d.iso) + '"' + (d.iso === task.day ? ' selected' : '') + '>' + e(d.label) + '</option>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-head">' +
        '<h4 id="taskTitle_' + task.id + '">' + e(taskTitleText(task, index)) + '</h4>' +
        '<button type="button" class="btn btn-icon" data-action="remove-task" data-id="' + task.id + '" title="Aufgabe entfernen" aria-label="Aufgabe entfernen">✕</button>' +
      '</div>' +
      '<div class="field-grid">' +
        field('Name der Aufgabe *', '<input type="text" data-bind="task.name" data-id="' + task.id + '" value="' + e(task.name) + '" placeholder="z. B. Teeschicht" autocomplete="off">', '', 'span-2') +
        field('Wann wird sie gebraucht? *',
          '<select data-bind="task.mode" data-id="' + task.id + '">' + modeOptions + '</select>',
          mode === 'continuous' ? 'Ohne Unterbrechung von Anfang bis Ende' : '') +
        (mode === 'once'
          ? field('An welchem Tag? *', '<select data-bind="task.day" data-id="' + task.id + '">' + dayOptions + '</select>')
          : '') +
        (mode === 'continuous' ? '' :
          field('Benötigt von *', '<input type="time" data-bind="task.startTime" data-id="' + task.id + '" value="' + e(task.startTime) + '">') +
          field('bis *', '<input type="time" data-bind="task.endTime" data-id="' + task.id + '" value="' + e(task.endTime) + '">',
            mode === 'daily' && multi ? 'Gilt an jedem Tag; Zeiten über Mitternacht sind möglich (z. B. 23:00–07:00).' : '')) +
        field('Länge einer Schicht (Minuten) *', '<input type="number" min="5" step="5" data-bind="task.slotMinutes" data-id="' + task.id + '" value="' + e(task.slotMinutes) + '">', U.formatDuration(task.slotMinutes)) +
        field('Personen pro Schicht *', '<input type="number" min="1" max="10" step="1" data-bind="task.peoplePerSlot" data-id="' + task.id + '" value="' + e(task.peoplePerSlot) + '">') +
        field('Bemerkung (optional)', '<input type="text" data-bind="task.note" data-id="' + task.id + '" value="' + e(task.note) + '" placeholder="erscheint im Excel-Export">', '', 'span-2') +
      '</div>' +
      '<p class="small muted mt-16" id="taskPreview_' + task.id + '">' + previewSlots(state, task) + '</p>' +
      '</div>';
  }

  /** Kleine Vorschau: wie viele Schichten entstehen aus dieser Aufgabe? */
  function previewSlots(state, task) {
    var demand = taskDemand(state, task);
    if (demand.error) return '<span style="color:var(--danger)">' + e(demand.error) + '</span>';
    if (!demand.slots) return '';
    return 'Ergibt <strong>' + demand.slots + '</strong> Schicht(en) à ' + U.formatDuration(demand.slotLength) +
      (demand.periods > 1 ? ' an ' + demand.periods + ' Tagen' : '') +
      ' · erste Schicht ' + demand.firstLabel +
      ' · Personenstunden gesamt: <strong>' + U.hoursText(demand.personMinutes) + ' h</strong>';
  }

  /** Bedarf einer Aufgabe – gemeinsame Grundlage für Vorschau und Summe */
  function taskDemand(state, task) {
    if (!state.event.date) return { slots: 0 };
    var ctx = window.Scheduler.buildContext(state);
    var warnings = [];
    var periods = window.Scheduler.taskPeriods(state, ctx, task, warnings);
    if (!periods.length) {
      return { slots: 0, error: warnings.length ? warnings[0].message : '' };
    }
    var len = Math.max(5, parseInt(task.slotMinutes, 10) || 60);
    var required = U.clamp(parseInt(task.peoplePerSlot, 10) || 1, 1, 10);
    var slots = 0, minutes = 0;
    periods.forEach(function (p) {
      slots += Math.ceil((p.end - p.start) / len);
      minutes += (p.end - p.start);
    });
    return {
      slots: slots,
      periods: periods.length,
      slotLength: len,
      personMinutes: minutes * required,
      firstLabel: (window.Store.isMultiDay() ? U.dayLabel(state.event.date, periods[0].start) + ' ' : '') +
        U.formatTime(periods[0].start) + '–' + U.formatTime(periods[0].end)
    };
  }

  /* ---------------- Schritt 4: Verfügbarkeiten ---------------- */

  function step4(state) {
    var people = state.people.filter(function (p) { return p.name.trim(); });
    if (!people.length) {
      return '<section class="panel">' + head(4, 'Verfügbarkeiten und Abwesenheiten', 'Bitte zuerst Personen erfassen.') +
        '<div class="empty">Keine Personen vorhanden – zurück zu Schritt 2.</div></section>';
    }

    var multi = window.Store.isMultiDay();
    var days = window.Store.eventDays();
    var daySelect = function (bind, id, selected, fallback) {
      var opts = days.map(function (d) {
        return '<option value="' + e(d.iso) + '"' +
          ((selected || fallback) === d.iso ? ' selected' : '') + '>' + e(d.short) + '</option>';
      }).join('');
      return '<select data-bind="' + bind + '" data-id="' + id + '" style="max-width:150px">' + opts + '</select>';
    };

    var cards = people.map(function (p) {
      var absences = state.absences.filter(function (a) { return a.personId === p.id; });
      var rows = absences.map(function (a) {
        return '<div class="row-item">' +
          (multi ? daySelect('absence.date', a.id, a.date, state.event.date) : '') +
          '<span class="small muted">nicht da von</span>' +
          '<input type="time" data-bind="absence.startTime" data-id="' + a.id + '" value="' + e(a.startTime) + '" style="max-width:130px">' +
          '<span class="small muted">bis</span>' +
          '<input type="time" data-bind="absence.endTime" data-id="' + a.id + '" value="' + e(a.endTime) + '" style="max-width:130px">' +
          '<input type="text" data-bind="absence.reason" data-id="' + a.id + '" value="' + e(a.reason) + '" placeholder="Grund (optional)">' +
          '<button type="button" class="btn btn-icon" data-action="remove-absence" data-id="' + a.id + '" title="Eintrag entfernen" aria-label="Eintrag entfernen">✕</button>' +
          '</div>';
      }).join('');

      var lastDay = days.length ? days[days.length - 1].iso : state.event.date;

      return '<div class="card">' +
        '<div class="card-head"><h4>' + e(p.name) + '</h4>' +
        '<span class="card-meta">' + (absences.length ? absences.length + ' Abwesenheit(en)' : 'durchgehend verfügbar') + '</span></div>' +
        '<div class="field-grid">' +
          field('Kommt erst ab (optional)',
            (multi ? daySelect('person.arrivalDate', p.id, p.arrivalDate, state.event.date) + ' ' : '') +
            '<input type="time" data-bind="person.arrival" data-id="' + p.id + '" value="' + e(p.arrival) + '">',
            multi ? 'Tag und Uhrzeit der Ankunft' : '') +
          field('Geht früher ab (optional)',
            (multi ? daySelect('person.departureDate', p.id, p.departureDate, lastDay) + ' ' : '') +
            '<input type="time" data-bind="person.departure" data-id="' + p.id + '" value="' + e(p.departure) + '">',
            multi ? 'Tag und Uhrzeit der Abreise' : '') +
        '</div>' +
        (rows ? '<div class="row-list mt-16">' + rows + '</div>' : '') +
        '<div class="actions-row mt-16">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="add-absence" data-id="' + p.id + '">+ Abwesenheit eintragen</button>' +
        '</div>' +
        '</div>';
    }).join('');

    return '<section class="panel">' +
      head(4, 'Verfügbarkeiten und Abwesenheiten festlegen',
        'Zeiten, in denen jemand <strong>nicht</strong> eingeplant werden darf. Wer immer da ist, braucht keinen Eintrag.') +
      cards +
      '</section>';
  }

  /* ---------------- Schritt 5: Planungsregeln ---------------- */

  function step5(state) {
    var o = state.options;
    var demand = totalDemand(state);

    return '<section class="panel">' +
      head(5, 'Planungsregeln festlegen',
        'Die Grundregeln (keine Abwesenheiten, keine Doppelbelegung, faire Verteilung) gelten immer. Hier lassen sich zusätzliche Wünsche einstellen.') +
      '<div class="field-grid">' +
        field('Mindestpause zwischen zwei Schichten (Minuten)',
          '<input type="number" min="0" step="15" data-bind="option.minRestMinutes" value="' + e(o.minRestMinutes) + '">',
          '0 = keine Vorgabe. Wird nur eingehalten, wenn der Plan sonst besetzbar bleibt.') +
        field('Höchstzahl Schichten je Person',
          '<input type="number" min="0" step="1" data-bind="option.maxShiftsPerPerson" value="' + e(o.maxShiftsPerPerson) + '">',
          '0 = keine Obergrenze. Eine zu niedrige Zahl führt zu offenen Schichten.') +
        field('Zufallsstartwert',
          '<input type="number" step="1" data-bind="option.seed" value="' + e(o.seed) + '">',
          'Gleicher Wert = gleicher Plan. Ändern erzeugt eine andere faire Variante.') +
        field('Weitere Regeln',
          '<label class="check"><input type="checkbox" data-bind="option.preferBlocks"' + (o.preferBlocks ? ' checked' : '') + '> Schichten möglichst am Stück (Blöcke)</label>' +
          '<label class="check"><input type="checkbox" data-bind="option.balanceTaskTypes"' + (o.balanceTaskTypes !== false ? ' checked' : '') + '> Aufgabenarten gleichmäßig verteilen</label>' +
          '<label class="check"><input type="checkbox" data-bind="option.mergeShortLastSlot"' + (o.mergeShortLastSlot !== false ? ' checked' : '') + '> Sehr kurze Restschicht an die vorherige anhängen</label>',
          '', 'span-2') +
      '</div>' +

      '<div class="note note-info mt-16" id="demandPreview"><strong>Bedarfsvorschau:</strong> ' + demand.text + '</div>' +
      '<div class="note note-warn" id="demandWarning"' + (demand.warning ? '' : ' hidden') + '>' + demand.warning + '</div>' +

      '<div class="actions-row mt-16">' +
        '<button type="button" class="btn btn-primary" data-action="compute">⚙️ Plan berechnen</button>' +
        '<span class="small muted">Die Berechnung dauert nur einen Augenblick und kann beliebig oft wiederholt werden.</span>' +
      '</div>' +
      '</section>';
  }

  function totalDemand(state) {
    if (U.parseTime(state.event.startTime) === null || U.parseTime(state.event.endTime) === null) {
      return { text: 'Zeitraum unvollständig.', warning: '' };
    }
    var personMinutes = 0, slotCount = 0;
    state.tasks.forEach(function (t) {
      var d = taskDemand(state, t);
      personMinutes += d.personMinutes || 0;
      slotCount += d.slots || 0;
    });

    var ctx = window.Scheduler.buildContext(state);
    var capacity = 0;
    ctx.peopleIds.forEach(function (id) { capacity += ctx.availableMinutes[id]; });
    var people = ctx.peopleIds.length;

    var text = slotCount + ' Schichten · ' + U.hoursText(personMinutes) + ' Personenstunden zu verteilen · ' +
      people + ' Person(en) · rechnerisch <strong>' +
      (people ? U.hoursText(personMinutes / people) : '0') + ' h</strong> pro Person.';

    var warning = '';
    if (!people) warning = 'Es sind keine Personen erfasst – der Plan bliebe komplett leer.';
    else if (personMinutes > capacity) {
      warning = 'Der Bedarf (' + U.hoursText(personMinutes) + ' h) übersteigt die verfügbare Zeit aller Personen (' +
        U.hoursText(capacity) + ' h). Es werden zwangsläufig Schichten offen bleiben.';
    }
    return { text: text, warning: warning };
  }

  /* ---------------- Schritt 6: Ergebnis ---------------- */

  function step6(state) {
    var schedule = state.schedule;
    if (!schedule) {
      return '<section class="panel">' +
        head(6, 'Schichtplan & Export', 'Es wurde noch kein Plan berechnet.') +
        '<div class="empty">Bitte in Schritt 5 auf „Plan berechnen“ klicken.</div>' +
        '<div class="actions-row mt-16"><button type="button" class="btn btn-primary" data-action="compute">⚙️ Plan jetzt berechnen</button></div>' +
        '</section>';
    }

    var s = schedule.stats;
    var openIssues = schedule.issues.length;

    var html = '<section class="panel">' +
      head(6, 'Schichtplan & Export',
        'Der Plan kann hier noch von Hand angepasst werden. Der Excel-Export übernimmt immer den aktuell angezeigten Stand.');

    if (schedule.stale) {
      html += '<div class="note note-warn">Die Stammdaten wurden nach der Berechnung geändert. ' +
        '<button type="button" class="btn btn-sm btn-secondary" data-action="compute">Plan neu berechnen</button></div>';
    }

    html += '<div class="stat-grid">' +
      stat('Schichten', s.totalSlots) +
      stat('Besetzte Plätze', s.filledSeats + ' / ' + s.requiredSeats, s.openSeats ? 'is-warn' : 'is-ok') +
      stat('Offene Plätze', s.openSeats, s.openSeats ? 'is-danger' : 'is-ok') +
      stat('Ø Zeit je Person', U.hoursText(s.meanMinutes) + ' h') +
      stat('Spanne min–max', U.hoursText(s.minMinutes) + '–' + U.hoursText(s.maxMinutes) + ' h', s.spreadMinutes > 90 ? 'is-warn' : 'is-ok') +
      stat('Schichten je Person', s.minCount + '–' + s.maxCount) +
      '</div>';

    html += '<div class="actions-row mt-16">' +
      '<button type="button" class="btn btn-primary" data-action="download-xlsx">⬇️ Excel herunterladen (.xlsx)</button>' +
      '<button type="button" class="btn btn-secondary" data-action="download-csv">CSV herunterladen</button>' +
      '<button type="button" class="btn btn-secondary" data-action="print">Drucken</button>' +
      '<button type="button" class="btn btn-secondary" data-action="compute">Neu berechnen</button>' +
      '</div>';

    html += '<div class="mt-16"><div class="section-title"><h3>Inhalt der Excel-Datei</h3></div>' +
      '<div class="field-grid">' +
        '<label class="check"><input type="checkbox" checked disabled> Blatt „Schichtplan“ (immer enthalten)</label>' +
        '<label class="check"><input type="checkbox" data-bind="export.people"' + (state.options.exportSheets.people !== false ? ' checked' : '') + '> Blatt „Teilnehmende“</label>' +
        '<label class="check"><input type="checkbox" data-bind="export.availability"' + (state.options.exportSheets.availability !== false ? ' checked' : '') + '> Blatt „Verfügbarkeiten“</label>' +
        '<label class="check"><input type="checkbox" data-bind="export.issues"' + (state.options.exportSheets.issues !== false ? ' checked' : '') + '> Blatt „Offene Schichten“</label>' +
        '<label class="check"><input type="checkbox" data-bind="export.info"' + (state.options.exportSheets.info !== false ? ' checked' : '') + '> Blatt „Veranstaltung“</label>' +
      '</div></div>';

    html += '</section>';

    html += '<section class="panel">' +
      '<div class="tabs" role="tablist">' +
        tab('timeline', 'Zeitplan') +
        tab('people', 'Nach Person') +
        tab('issues', 'Probleme' + (openIssues ? ' (' + openIssues + ')' : '')) +
      '</div>' +
      (view.tab === 'people' ? renderPeopleView(state, schedule)
        : view.tab === 'issues' ? renderIssuesView(state, schedule)
        : renderTimeline(state, schedule)) +
      '</section>';

    return html;
  }

  function stat(key, value, cls) {
    return '<div class="stat ' + (cls || '') + '"><div class="k">' + e(key) + '</div>' +
      '<div class="v">' + e(value) + '</div></div>';
  }

  function tab(id, label) {
    return '<button type="button" class="tab" role="tab" aria-selected="' + (view.tab === id) + '" ' +
      'data-action="tab" data-tab="' + id + '">' + e(label) + '</button>';
  }

  function renderTimeline(state, schedule) {
    if (!schedule.slots.length) return '<div class="empty">Keine Schichten vorhanden.</div>';

    var options = window.Scheduler.seatOptions(state, schedule);
    var maxSeats = 1;
    schedule.slots.forEach(function (s) { maxSeats = Math.max(maxSeats, s.required); });

    var slots = schedule.slots.slice().sort(function (a, b) {
      return a.start - b.start || a.taskName.localeCompare(b.taskName, 'de');
    });

    var headCells = '<th>Zeit</th><th>Aufgabe</th>';
    for (var i = 0; i < maxSeats; i++) headCells += '<th>Person ' + (i + 1) + '</th>';
    headCells += '<th>Status</th>';
    var columnCount = maxSeats + 3;

    var lastStart = null;
    var lastDay = null;
    var body = slots.map(function (slot) {
      var prefix = '';
      // Bei mehrtägigen Veranstaltungen je Tag eine Zwischenüberschrift
      if (schedule.multiDay) {
        var day = U.dayIndex(slot.start);
        if (day !== lastDay) {
          prefix = '<tr class="day-row"><th colspan="' + columnCount + '">' +
            e(U.dayLabelLong(state.event.date, slot.start)) + '</th></tr>';
          lastDay = day;
          lastStart = null;
        }
      }

      var filled = slot.assigned.filter(Boolean).length;
      var cls = filled === 0 ? 'is-open' : (filled < slot.required ? 'is-partial' : '');
      if (lastStart !== null && slot.start !== lastStart) cls += ' row-gap';
      lastStart = slot.start;

      var cells = '<td class="time">' + U.formatTime(slot.start) + '–' +
        U.endLabel(state.event.date, slot.start, slot.end, schedule.multiDay) +
        '<br><span class="small muted">' + U.formatDuration(slot.end - slot.start) + '</span></td>' +
        '<td>' + e(slot.taskName) + (slot.taskNote ? '<br><span class="small muted">' + e(slot.taskNote) + '</span>' : '') + '</td>';

      for (var seat = 0; seat < maxSeats; seat++) {
        if (seat >= slot.required) { cells += '<td class="muted small">–</td>'; continue; }
        cells += '<td class="seat">' + seatSelect(slot, seat, options[slot.id][seat]) + '</td>';
      }

      cells += '<td>' + (filled >= slot.required
        ? '<span class="badge badge-ok">besetzt</span>'
        : (filled === 0
          ? '<span class="badge badge-danger">offen</span>'
          : '<span class="badge badge-warn">' + (slot.required - filled) + ' fehlt</span>')) + '</td>';

      return prefix + '<tr class="' + cls + '">' + cells + '</tr>';
    }).join('');

    return '<div class="table-wrap"><table class="data"><thead><tr>' + headCells + '</tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>' +
      '<p class="small muted mt-16">Über die Auswahlfelder lassen sich Personen manuell tauschen. ' +
      'Nicht auswählbare Personen sind zu dieser Zeit abwesend oder bereits eingeteilt.</p>';
  }

  function seatSelect(slot, seat, candidates) {
    var current = slot.assigned[seat] || '';
    var opts = '<option value=""' + (current ? '' : ' selected') + '>— frei —</option>';
    (candidates || []).forEach(function (cand) {
      var selected = cand.personId === current;
      opts += '<option value="' + e(cand.personId) + '"' +
        (selected ? ' selected' : '') +
        (!cand.ok && !selected ? ' disabled' : '') + '>' +
        e(cand.name) + (cand.ok || selected ? '' : ' – ' + e(cand.reason)) +
        '</option>';
    });
    return '<select class="' + (current ? '' : 'is-empty') + '" data-action="seat" data-slot="' + e(slot.id) +
      '" data-seat="' + seat + '" aria-label="Person für ' + e(slot.taskName) + '">' + opts + '</select>';
  }

  function renderPeopleView(state, schedule) {
    var s = schedule.stats;
    if (!s.perPerson.length) return '<div class="empty">Keine Personen erfasst.</div>';
    var max = Math.max(1, s.maxMinutes);
    var slotById = {};
    schedule.slots.forEach(function (slot) { slotById[slot.id] = slot; });

    var cards = s.perPerson.slice().sort(function (a, b) {
      return b.minutes - a.minutes || a.name.localeCompare(b.name, 'de');
    }).map(function (rec) {
      var shifts = rec.shifts.map(function (id) { return slotById[id]; })
        .filter(Boolean)
        .sort(function (a, b) { return a.start - b.start; })
        .map(function (slot) {
          var day = schedule.multiDay ? U.weekdayShort(U.dateForMinutes(state.event.date, slot.start)) + ' ' : '';
          return '<li><span class="t">' + day + U.formatTime(slot.start) + '–' +
            U.endLabel(state.event.date, slot.start, slot.end, schedule.multiDay) + '</span>' +
            '<span>' + e(slot.taskName) + '</span></li>';
        }).join('');

      return '<div class="person-card">' +
        '<h4><span>' + e(rec.name) + '</span>' +
        '<span class="small muted">' + rec.count + ' Schicht(en) · ' + U.hoursText(rec.minutes) + ' h</span></h4>' +
        '<div class="bar mt-16"><span style="width:' + Math.round(rec.minutes / max * 100) + '%"></span></div>' +
        (rec.availableMinutes < (schedule.window.end - schedule.window.start)
          ? '<p class="small muted mt-16">verfügbar: ' + U.hoursText(rec.availableMinutes) + ' h von ' +
            U.hoursText(schedule.window.end - schedule.window.start) + ' h</p>' : '') +
        (shifts ? '<ul>' + shifts + '</ul>' : '<p class="small muted mt-16">Keine Schicht zugeteilt.</p>') +
        '</div>';
    }).join('');

    return '<div class="person-grid">' + cards + '</div>';
  }

  function renderIssuesView(state, schedule) {
    if (!schedule.issues.length) {
      return '<div class="note note-ok">Alle Schichten sind vollständig besetzt – es gibt keine offenen Punkte.</div>';
    }
    var rows = schedule.issues.map(function (issue) {
      return '<tr class="' + (issue.severity === 'error' ? 'is-open' : 'is-partial') + '">' +
        '<td>' + e(issue.taskName || '') + '</td>' +
        '<td class="time">' + (issue.start != null
          ? (schedule.multiDay ? U.dayLabel(state.event.date, issue.start) + ' ' : '') +
            U.formatTime(issue.start) + '–' +
            U.endLabel(state.event.date, issue.start, issue.end, schedule.multiDay) : '–') + '</td>' +
        '<td class="num">' + (issue.required ? issue.filled + ' / ' + issue.required : '–') + '</td>' +
        '<td>' + e(issue.message) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="table-wrap"><table class="data">' +
      '<thead><tr><th>Aufgabe</th><th>Zeit</th><th>Besetzt</th><th>Hinweis</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<p class="small muted mt-16">Mögliche Gegenmaßnahmen: Schichtlänge ändern, Personen pro Schicht reduzieren, ' +
      'weitere Personen erfassen oder Abwesenheiten prüfen.</p>';
  }

  /* ---------------- Dispatcher ---------------- */

  function renderStep(state) {
    switch (state.step) {
      case 1: return step1(state);
      case 2: return step2(state);
      case 3: return step3(state);
      case 4: return step4(state);
      case 5: return step5(state);
      case 6: return step6(state);
      default: return step1(state);
    }
  }

  function primaryLabel(step) {
    if (step === 5) return '⚙️ Plan berechnen';
    if (step === 6) return '⬇️ Excel herunterladen';
    return 'Weiter ›';
  }

  return {
    STEPS: STEPS,
    TASK_PRESETS: TASK_PRESETS,
    view: view,
    renderNav: renderNav,
    renderStep: renderStep,
    primaryLabel: primaryLabel,
    // Bausteine für gezielte Aktualisierungen ohne Neuaufbau des DOM
    eventDurationHtml: eventDurationHtml,
    dayHint: dayHint,
    peopleCountText: peopleCountText,
    taskTitleText: taskTitleText,
    previewSlots: previewSlots,
    totalDemand: totalDemand
  };
})();
