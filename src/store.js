/* ============================================================
   store.js – Datenmodell, Persistenz, Validierung
   ------------------------------------------------------------
   Datenmodell (Version 2):

   state = {
     version: 2,
     step:    Number,                       // aktueller Wizard-Schritt (1..7)
     event:   { name, date, endDate, startTime, endTime, notes },
     people:  [ { id, name, arrival, arrivalDate,
                  departure, departureDate, note } ],
     tasks:   [ { id, name, mode, day, startTime, endTime,
                  slotMinutes, peoplePerSlot, note } ],
     absences:[ { id, personId, date, startTime, endTime, reason } ],
     fixed:   [ { id, personId, taskId, scope, day, startTime } ],
     options: { seed, minRestMinutes, preferBlocks, maxShiftsPerPerson,
                mergeShortLastSlot, balanceTaskTypes, exportSheets },
     schedule: null | Ergebnisobjekt aus scheduler.js
   }

   Uhrzeiten werden als "HH:MM" gespeichert und beim Rechnen in
   Minuten seit Mitternacht des ersten Tages umgerechnet – 08:00 am
   zweiten Tag ist also 1920. Damit sind eintägige Veranstaltungen,
   Veranstaltungen über Mitternacht und mehrtägige Veranstaltungen
   mit demselben Raster abgedeckt.

   `fixed` hält Vorabfestlegungen ("X macht Y"), etwa wenn sich
   jemand freiwillig meldet. Sie werden vor der automatischen
   Verteilung eingetragen und danach nicht mehr verändert.
   ============================================================ */

window.Store = (function () {
  'use strict';

  var U = window.Util;
  var STORAGE_KEY = 'schichtplaner.state.v1';
  var VERSION = 2;

  function defaultState() {
    return {
      version: VERSION,
      step: 1,
      event: {
        name: '',
        date: U.todayIso(),        // erster Tag
        endDate: U.todayIso(),     // letzter Tag (gleich = eintägig)
        startTime: '08:00',
        endTime: '22:00',
        notes: ''
      },
      people: [],
      tasks: [],
      absences: [],
      fixed: [],
      options: {
        seed: 42,
        minRestMinutes: 0,
        preferBlocks: false,
        maxShiftsPerPerson: 0,      // 0 = keine Obergrenze
        mergeShortLastSlot: true,
        balanceTaskTypes: true,
        exportSheets: { people: true, availability: true, issues: true, info: true }
      },
      schedule: null
    };
  }

  var state = defaultState();

  /* ---------- Persistenz ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* Speicher voll oder nicht verfügbar – App funktioniert trotzdem weiter. */
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      state = migrate(parsed);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Fehlende Felder ergänzen – hält alte gespeicherte Stände lauffähig.
   * Version 1 → 2: Enddatum der Veranstaltung, Rhythmus je Aufgabe
   * (`wholeEvent` → `mode`), Datum je Abwesenheit und je An-/Abreise.
   */
  function migrate(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    var rawEvent = raw.event || {};
    var event = Object.assign({}, base.event, rawEvent);
    // Version 1 kannte kein Enddatum: eintägig, also gleich dem Startdatum
    if (!rawEvent.endDate) event.endDate = event.date;

    var next = {
      version: VERSION,
      step: U.clamp(parseInt(raw.step, 10) || 1, 1, 7),
      event: event,
      people: (raw.people || []).map(function (p) {
        return {
          id: p.id || U.uid('p'),
          name: String(p.name || ''),
          arrival: p.arrival || '',
          arrivalDate: p.arrivalDate || '',      // leer = erster Tag
          departure: p.departure || '',
          departureDate: p.departureDate || '',  // leer = letzter Tag
          note: String(p.note || '')
        };
      }),
      tasks: (raw.tasks || []).map(function (t) {
        var mode = t.mode;
        if (!mode) mode = (t.wholeEvent !== false) ? 'continuous' : 'daily';
        return {
          id: t.id || U.uid('t'),
          name: String(t.name || ''),
          mode: mode,                            // continuous | daily | once
          day: t.day || '',                      // nur bei mode = once
          startTime: t.startTime || '',
          endTime: t.endTime || '',
          slotMinutes: parseInt(t.slotMinutes, 10) || 60,
          peoplePerSlot: U.clamp(parseInt(t.peoplePerSlot, 10) || 1, 1, 10),
          note: String(t.note || '')
        };
      }),
      absences: (raw.absences || []).map(function (a) {
        return {
          id: a.id || U.uid('a'),
          personId: a.personId || '',
          date: a.date || '',                    // leer = erster Tag
          startTime: a.startTime || '',
          endTime: a.endTime || '',
          reason: String(a.reason || '')
        };
      }),
      fixed: (raw.fixed || []).map(function (f) {
        return {
          id: f.id || U.uid('f'),
          personId: f.personId || '',
          taskId: f.taskId || '',
          scope: f.scope || 'slot',          // slot | any | all
          day: f.day || '',
          startTime: f.startTime || ''
        };
      }),
      options: Object.assign({}, base.options, raw.options || {}, {
        exportSheets: Object.assign({}, base.options.exportSheets, (raw.options || {}).exportSheets || {})
      }),
      schedule: raw.schedule || null
    };
    // Einträge ohne existierende Person bzw. Aufgabe verwerfen.
    var ids = {};
    next.people.forEach(function (p) { ids[p.id] = true; });
    var taskIds = {};
    next.tasks.forEach(function (t) { taskIds[t.id] = true; });
    next.absences = next.absences.filter(function (a) { return ids[a.personId]; });
    next.fixed = next.fixed.filter(function (f) { return ids[f.personId] && taskIds[f.taskId]; });
    return next;
  }

  function reset() {
    state = defaultState();
    save();
  }

  /* ---------- Zugriff ---------- */

  function get() { return state; }

  function set(patch) {
    Object.assign(state, patch);
    save();
  }

  function personById(id) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === id) return state.people[i];
    return null;
  }

  function personName(id) {
    var p = personById(id);
    return p ? (p.name || 'Ohne Namen') : '';
  }

  function taskById(id) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i];
    return null;
  }

  /* ---------- Mutationen ---------- */

  function addPerson(name) {
    var person = {
      id: U.uid('p'), name: name || '',
      arrival: '', arrivalDate: '', departure: '', departureDate: '', note: ''
    };
    state.people.push(person);
    invalidateSchedule();
    save();
    return person;
  }

  function removePerson(id) {
    state.people = state.people.filter(function (p) { return p.id !== id; });
    state.absences = state.absences.filter(function (a) { return a.personId !== id; });
    state.fixed = state.fixed.filter(function (f) { return f.personId !== id; });
    invalidateSchedule();
    save();
  }

  function addTask(preset) {
    var task = Object.assign({
      id: U.uid('t'),
      name: '',
      mode: 'continuous',
      day: '',
      startTime: state.event.startTime,
      endTime: state.event.endTime,
      slotMinutes: 60,
      peoplePerSlot: 1,
      note: ''
    }, preset || {});
    // Vorlagen aus Version 1 können noch `wholeEvent` mitbringen
    if (preset && preset.mode === undefined && preset.wholeEvent !== undefined) {
      task.mode = preset.wholeEvent ? 'continuous' : 'daily';
    }
    delete task.wholeEvent;
    if (!task.day) task.day = state.event.date;
    task.id = U.uid('t');
    state.tasks.push(task);
    invalidateSchedule();
    save();
    return task;
  }

  function removeTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    state.fixed = state.fixed.filter(function (f) { return f.taskId !== id; });
    invalidateSchedule();
    save();
  }

  function addAbsence(personId) {
    var absence = {
      id: U.uid('a'),
      personId: personId,
      date: state.event.date,
      startTime: state.event.startTime,
      endTime: state.event.endTime,
      reason: ''
    };
    state.absences.push(absence);
    invalidateSchedule();
    save();
    return absence;
  }

  function removeAbsence(id) {
    state.absences = state.absences.filter(function (a) { return a.id !== id; });
    invalidateSchedule();
    save();
  }

  function addFixed() {
    var first = state.people.filter(function (p) { return p.name.trim(); })[0];
    var entry = {
      id: U.uid('f'),
      personId: first ? first.id : '',
      taskId: state.tasks.length ? state.tasks[0].id : '',
      scope: 'any',
      day: state.event.date,
      startTime: ''
    };
    state.fixed.push(entry);
    invalidateSchedule();
    save();
    return entry;
  }

  function removeFixed(id) {
    state.fixed = state.fixed.filter(function (f) { return f.id !== id; });
    invalidateSchedule();
    save();
  }

  function fixedById(id) {
    for (var i = 0; i < state.fixed.length; i++) if (state.fixed[i].id === id) return state.fixed[i];
    return null;
  }

  function absencesFor(personId) {
    return state.absences.filter(function (a) { return a.personId === personId; });
  }

  /** Ein bereits berechneter Plan passt nach Datenänderungen nicht mehr. */
  function invalidateSchedule() {
    if (state.schedule) state.schedule.stale = true;
  }

  /* ---------- Validierung ---------- */

  /** Liste der Veranstaltungstage: [{ index, iso, label, short }] */
  function eventDays() {
    var ev = state.event;
    if (!ev.date) return [];
    var last = U.daysBetween(ev.date, ev.endDate || ev.date);
    if (!(last >= 0)) last = 0;
    // Endet die Veranstaltung am Starttag nach Mitternacht, gehört der
    // Folgetag noch dazu.
    var s = U.parseTime(ev.startTime), e = U.parseTime(ev.endTime);
    if (last === 0 && s !== null && e !== null && e <= s) last = 1;

    var days = [];
    for (var i = 0; i <= last; i++) {
      var iso = U.addDays(ev.date, i);
      days.push({
        index: i,
        iso: iso,
        label: U.weekdayName(iso) + ', ' + U.formatDate(iso),
        short: U.weekdayShort(iso) + ', ' + U.formatDate(iso).slice(0, 6)
      });
    }
    return days;
  }

  /** Geht die Veranstaltung über mehr als einen Kalendertag? */
  function isMultiDay() {
    return eventDays().length > 1;
  }

  /** Prüft einen Wizard-Schritt. Rückgabe: Array von Fehlermeldungen. */
  function validateStep(step) {
    var errors = [];
    var ev = state.event;

    if (step === 1) {
      if (!ev.name.trim()) errors.push('Bitte einen Namen für die Veranstaltung eingeben.');
      if (!ev.date) errors.push('Bitte ein Startdatum auswählen.');
      if (!ev.endDate) errors.push('Bitte ein Enddatum auswählen (bei eintägigen Veranstaltungen dasselbe Datum).');
      if (ev.date && ev.endDate && U.daysBetween(ev.date, ev.endDate) < 0) {
        errors.push('Das Enddatum liegt vor dem Startdatum.');
      }
      var s = U.parseTime(ev.startTime), e = U.parseTime(ev.endTime);
      if (s === null) errors.push('Startzeit ist ungültig (Format HH:MM).');
      if (e === null) errors.push('Endzeit ist ungültig (Format HH:MM).');
      if (s !== null && e !== null && s === e && U.daysBetween(ev.date, ev.endDate) === 0) {
        errors.push('Start- und Endzeit dürfen am selben Tag nicht identisch sein.');
      }
    }

    if (step === 2) {
      var named = state.people.filter(function (p) { return p.name.trim(); });
      if (named.length < 1) errors.push('Bitte mindestens eine Person erfassen.');
      var seen = {};
      named.forEach(function (p) {
        var key = p.name.trim().toLowerCase();
        if (seen[key]) errors.push('Der Name „' + p.name.trim() + '“ kommt mehrfach vor.');
        seen[key] = true;
      });
    }

    if (step === 3) {
      if (!state.tasks.length) errors.push('Bitte mindestens eine Aufgabe anlegen.');
      var days = eventDays();
      state.tasks.forEach(function (t, i) {
        var label = t.name.trim() || 'Aufgabe ' + (i + 1);
        if (!t.name.trim()) errors.push('Aufgabe ' + (i + 1) + ': Bitte einen Namen eingeben.');
        if (!(t.slotMinutes > 0)) errors.push(label + ': Schichtlänge muss größer als 0 sein.');
        if (!(t.peoplePerSlot >= 1)) errors.push(label + ': Es wird mindestens 1 Person pro Schicht benötigt.');
        if (t.mode !== 'continuous') {
          var ts = U.parseTime(t.startTime), te = U.parseTime(t.endTime);
          if (ts === null || te === null) {
            errors.push(label + ': Zeitraum ist unvollständig oder ungültig.');
          } else if (ts === te) {
            errors.push(label + ': Start- und Endzeit dürfen nicht identisch sein.');
          }
        }
        if (t.mode === 'once') {
          var known = days.some(function (d) { return d.iso === t.day; });
          if (!known) errors.push(label + ': Bitte einen Tag der Veranstaltung auswählen.');
        }
      });
    }

    if (step === 4) {
      var dayList = eventDays();
      state.absences.forEach(function (a) {
        var name = personName(a.personId) || 'Unbekannt';
        var as = U.parseTime(a.startTime), ae = U.parseTime(a.endTime);
        if (as === null || ae === null) {
          errors.push(name + ': Abwesenheit hat eine ungültige Uhrzeit.');
        } else if (as === ae) {
          errors.push(name + ': Abwesenheit hat identische Start- und Endzeit.');
        }
        if (a.date && !dayList.some(function (d) { return d.iso === a.date; })) {
          errors.push(name + ': Die Abwesenheit liegt an einem Tag außerhalb der Veranstaltung.');
        }
      });
      state.people.forEach(function (p) {
        if (p.arrival && U.parseTime(p.arrival) === null) {
          errors.push((p.name || 'Person') + ': „kommt erst ab“ ist ungültig.');
        }
        if (p.departure && U.parseTime(p.departure) === null) {
          errors.push((p.name || 'Person') + ': „geht früher“ ist ungültig.');
        }
      });
    }

    if (step === 5) {
      state.fixed.forEach(function (f, i) {
        var label = 'Feste Zuteilung ' + (i + 1);
        if (!f.personId || !personById(f.personId)) errors.push(label + ': Bitte eine Person auswählen.');
        if (!f.taskId || !taskById(f.taskId)) errors.push(label + ': Bitte eine Aufgabe auswählen.');
        if (f.scope === 'slot' && (!f.startTime || U.parseTime(f.startTime) === null)) {
          errors.push(label + ': Bitte eine konkrete Schicht auswählen.');
        }
      });
    }

    return errors;
  }

  /** Personen mit Namen – nur diese werden verplant. */
  function activePeople() {
    return state.people.filter(function (p) { return p.name.trim(); });
  }

  /* ---------- Import / Export ---------- */

  function toJson() { return JSON.stringify(state, null, 2); }

  function fromJson(text) {
    var parsed = JSON.parse(text);
    state = migrate(parsed);
    save();
  }

  /* ---------- Demodaten ---------- */

  function person(name, extra) {
    return Object.assign({
      id: U.uid('p'), name: name, arrival: '', arrivalDate: '',
      departure: '', departureDate: '', note: ''
    }, extra || {});
  }

  function task(name, mode, startTime, endTime, slotMinutes, peoplePerSlot, extra) {
    return Object.assign({
      id: U.uid('t'), name: name, mode: mode, day: '',
      startTime: startTime, endTime: endTime,
      slotMinutes: slotMinutes, peoplePerSlot: peoplePerSlot, note: ''
    }, extra || {});
  }

  /** Eintägiges Beispiel */
  function loadDemo() {
    state = defaultState();
    var day = U.todayIso();
    state.event = {
      name: 'Jugendfreizeit – Sommerfest',
      date: day,
      endDate: day,
      startTime: '08:00',
      endTime: '22:00',
      notes: 'Treffpunkt für alle Schichten ist der Info-Tisch im Foyer.'
    };
    state.people = ['Anna', 'Ben', 'Clara', 'David', 'Elena', 'Frank', 'Greta', 'Hannes']
      .map(function (n) { return person(n); });

    state.people[3].arrival = '12:00';   // David kommt später
    state.people[6].departure = '18:00'; // Greta geht früher

    state.tasks = [
      task('Teeschicht',             'continuous', '08:00', '22:00', 120, 1, { note: 'Teeküche im Foyer' }),
      task('Türschicht',             'continuous', '08:00', '22:00', 60,  2, { note: 'Immer zu zweit besetzen' }),
      task('Küchendienst / Essen',   'daily',      '11:30', '14:00', 75,  2),
      task('Frühstücksvorbereitung', 'daily',      '08:00', '09:30', 90,  2),
      task('Aufräumen',              'daily',      '20:00', '22:00', 60,  2),
      task('Brötchen besorgen',      'once',       '08:00', '09:00', 60,  1, { day: day, note: 'Bäckerei Ecke Hauptstraße' })
    ];

    // Vorabfestlegungen: Frank holt immer die Brötchen, Ben meldet sich für die Küche
    state.fixed = [
      { id: U.uid('f'), personId: state.people[5].id, taskId: state.tasks[5].id, scope: 'all', day: day, startTime: '' },
      { id: U.uid('f'), personId: state.people[1].id, taskId: state.tasks[2].id, scope: 'any', day: day, startTime: '' }
    ];

    state.absences = [
      { id: U.uid('a'), personId: state.people[0].id, date: day, startTime: '14:00', endTime: '16:00', reason: 'Workshop-Leitung' },
      { id: U.uid('a'), personId: state.people[2].id, date: day, startTime: '17:00', endTime: '19:00', reason: 'Probe' },
      { id: U.uid('a'), personId: state.people[5].id, date: day, startTime: '09:00', endTime: '11:00', reason: 'Anreise Gäste' }
    ];

    state.step = 1;
    save();
  }

  /** Mehrtägiges Beispiel: Freitagabend bis Sonntagmittag */
  function loadDemoWeekend() {
    state = defaultState();
    // Nächsten Freitag suchen, damit das Beispiel plausibel wirkt
    var friday = U.todayIso();
    for (var i = 0; i < 7; i++) {
      if (U.weekdayShort(friday) === 'Fr') break;
      friday = U.addDays(friday, 1);
    }
    var saturday = U.addDays(friday, 1);
    var sunday = U.addDays(friday, 2);

    state.event = {
      name: 'Gemeindefreizeit (Wochenende)',
      date: friday,
      endDate: sunday,
      startTime: '17:00',
      endTime: '14:00',
      notes: 'Anreise Freitagnachmittag, Abreise nach dem Mittagessen am Sonntag.'
    };

    state.people = ['Anna', 'Ben', 'Clara', 'David', 'Elena', 'Frank', 'Greta', 'Hannes', 'Ida', 'Jonas']
      .map(function (n) { return person(n); });
    state.people[3].arrival = '20:00';                                   // David kommt Freitagabend später
    state.people[3].arrivalDate = friday;
    state.people[8].departure = '09:00';                                 // Ida fährt Sonntagfrüh
    state.people[8].departureDate = sunday;

    state.tasks = [
      task('Teeschicht',             'daily', '15:00', '22:00', 120, 1, { note: 'Teeküche im Foyer' }),
      task('Türschicht',             'daily', '08:00', '22:00', 120, 2, { note: 'Immer zu zweit besetzen' }),
      task('Nachtwache',             'daily', '23:00', '07:00', 240, 1, { note: 'Zwei Schichten je Nacht' }),
      task('Frühstücksvorbereitung', 'daily', '07:00', '08:30', 90,  2),
      task('Küchendienst / Essen',   'daily', '11:30', '14:00', 75,  2),
      task('Brötchen besorgen',      'daily', '07:00', '08:00', 60,  1, { note: 'Bäckerei Ecke Hauptstraße' }),
      task('Aufräumen',              'once',  '12:00', '14:00', 60,  2, { day: sunday, note: 'Endreinigung' })
    ];

    // Vorabfestlegungen: wer sich schon gemeldet hat
    state.fixed = [
      // Frank übernimmt das Brötchenholen an allen Tagen
      { id: U.uid('f'), personId: state.people[5].id, taskId: state.tasks[5].id, scope: 'all', day: '', startTime: '' },
      // Jonas macht die Endreinigung am Sonntag (eine bestimmte Schicht)
      { id: U.uid('f'), personId: state.people[9].id, taskId: state.tasks[6].id, scope: 'slot', day: sunday, startTime: '12:00' },
      // Clara meldet sich freiwillig für eine Nachtwache – welche, sucht die App aus
      { id: U.uid('f'), personId: state.people[2].id, taskId: state.tasks[2].id, scope: 'any', day: '', startTime: '' }
    ];

    state.absences = [
      { id: U.uid('a'), personId: state.people[0].id, date: saturday, startTime: '14:00', endTime: '17:00', reason: 'Workshop-Leitung' },
      { id: U.uid('a'), personId: state.people[2].id, date: saturday, startTime: '20:00', endTime: '22:00', reason: 'Bandprobe' },
      { id: U.uid('a'), personId: state.people[5].id, date: sunday,   startTime: '09:00', endTime: '11:00', reason: 'Gottesdienst-Technik' }
    ];

    state.step = 1;
    save();
  }

  return {
    VERSION: VERSION,
    defaultState: defaultState,
    get: get,
    set: set,
    save: save,
    load: load,
    reset: reset,
    personById: personById,
    personName: personName,
    taskById: taskById,
    addPerson: addPerson,
    removePerson: removePerson,
    addTask: addTask,
    removeTask: removeTask,
    addAbsence: addAbsence,
    removeAbsence: removeAbsence,
    addFixed: addFixed,
    removeFixed: removeFixed,
    fixedById: fixedById,
    absencesFor: absencesFor,
    invalidateSchedule: invalidateSchedule,
    validateStep: validateStep,
    activePeople: activePeople,
    eventDays: eventDays,
    isMultiDay: isMultiDay,
    toJson: toJson,
    fromJson: fromJson,
    loadDemo: loadDemo,
    loadDemoWeekend: loadDemoWeekend
  };
})();
