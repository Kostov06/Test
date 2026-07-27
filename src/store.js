/* ============================================================
   store.js – Datenmodell, Persistenz, Validierung
   ------------------------------------------------------------
   Datenmodell (Version 1):

   state = {
     version: 1,
     step:    Number,                       // aktueller Wizard-Schritt (1..6)
     event:   { name, date, startTime, endTime, notes },
     people:  [ { id, name, arrival, departure, note } ],
     tasks:   [ { id, name, wholeEvent, startTime, endTime,
                  slotMinutes, peoplePerSlot, note } ],
     absences:[ { id, personId, startTime, endTime, reason } ],
     options: { seed, minRestMinutes, preferBlocks, maxShiftsPerPerson,
                mergeShortLastSlot, balanceTaskTypes },
     schedule: null | Ergebnisobjekt aus scheduler.js
   }

   Uhrzeiten werden als "HH:MM" gespeichert und beim Rechnen in
   Minuten seit Veranstaltungsbeginn umgerechnet. Endet eine Zeit
   rechnerisch vor ihrem Start, liegt sie am Folgetag – damit sind
   Veranstaltungen über Mitternacht abgedeckt.
   ============================================================ */

window.Store = (function () {
  'use strict';

  var U = window.Util;
  var STORAGE_KEY = 'schichtplaner.state.v1';
  var VERSION = 1;

  function defaultState() {
    return {
      version: VERSION,
      step: 1,
      event: { name: '', date: U.todayIso(), startTime: '08:00', endTime: '22:00', notes: '' },
      people: [],
      tasks: [],
      absences: [],
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

  /** Fehlende Felder ergänzen – hält alte gespeicherte Stände lauffähig. */
  function migrate(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    var next = {
      version: VERSION,
      step: U.clamp(parseInt(raw.step, 10) || 1, 1, 6),
      event: Object.assign({}, base.event, raw.event || {}),
      people: (raw.people || []).map(function (p) {
        return {
          id: p.id || U.uid('p'),
          name: String(p.name || ''),
          arrival: p.arrival || '',
          departure: p.departure || '',
          note: String(p.note || '')
        };
      }),
      tasks: (raw.tasks || []).map(function (t) {
        return {
          id: t.id || U.uid('t'),
          name: String(t.name || ''),
          wholeEvent: t.wholeEvent !== false,
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
          startTime: a.startTime || '',
          endTime: a.endTime || '',
          reason: String(a.reason || '')
        };
      }),
      options: Object.assign({}, base.options, raw.options || {}, {
        exportSheets: Object.assign({}, base.options.exportSheets, (raw.options || {}).exportSheets || {})
      }),
      schedule: raw.schedule || null
    };
    // Abwesenheiten ohne existierende Person verwerfen.
    var ids = {};
    next.people.forEach(function (p) { ids[p.id] = true; });
    next.absences = next.absences.filter(function (a) { return ids[a.personId]; });
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
    var person = { id: U.uid('p'), name: name || '', arrival: '', departure: '', note: '' };
    state.people.push(person);
    invalidateSchedule();
    save();
    return person;
  }

  function removePerson(id) {
    state.people = state.people.filter(function (p) { return p.id !== id; });
    state.absences = state.absences.filter(function (a) { return a.personId !== id; });
    invalidateSchedule();
    save();
  }

  function addTask(preset) {
    var task = Object.assign({
      id: U.uid('t'),
      name: '',
      wholeEvent: true,
      startTime: state.event.startTime,
      endTime: state.event.endTime,
      slotMinutes: 60,
      peoplePerSlot: 1,
      note: ''
    }, preset || {});
    task.id = U.uid('t');
    state.tasks.push(task);
    invalidateSchedule();
    save();
    return task;
  }

  function removeTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    invalidateSchedule();
    save();
  }

  function addAbsence(personId) {
    var absence = {
      id: U.uid('a'),
      personId: personId,
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

  function absencesFor(personId) {
    return state.absences.filter(function (a) { return a.personId === personId; });
  }

  /** Ein bereits berechneter Plan passt nach Datenänderungen nicht mehr. */
  function invalidateSchedule() {
    if (state.schedule) state.schedule.stale = true;
  }

  /* ---------- Validierung ---------- */

  /** Prüft einen Wizard-Schritt. Rückgabe: Array von Fehlermeldungen. */
  function validateStep(step) {
    var errors = [];
    var ev = state.event;

    if (step === 1) {
      if (!ev.name.trim()) errors.push('Bitte einen Namen für die Veranstaltung eingeben.');
      if (!ev.date) errors.push('Bitte ein Datum auswählen.');
      var s = U.parseTime(ev.startTime), e = U.parseTime(ev.endTime);
      if (s === null) errors.push('Startzeit ist ungültig (Format HH:MM).');
      if (e === null) errors.push('Endzeit ist ungültig (Format HH:MM).');
      if (s !== null && e !== null && s === e) {
        errors.push('Start- und Endzeit dürfen nicht identisch sein.');
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
      state.tasks.forEach(function (t, i) {
        var label = t.name.trim() || 'Aufgabe ' + (i + 1);
        if (!t.name.trim()) errors.push('Aufgabe ' + (i + 1) + ': Bitte einen Namen eingeben.');
        if (!(t.slotMinutes > 0)) errors.push(label + ': Schichtlänge muss größer als 0 sein.');
        if (!(t.peoplePerSlot >= 1)) errors.push(label + ': Es wird mindestens 1 Person pro Schicht benötigt.');
        if (!t.wholeEvent) {
          var ts = U.parseTime(t.startTime), te = U.parseTime(t.endTime);
          if (ts === null || te === null) {
            errors.push(label + ': Zeitraum ist unvollständig oder ungültig.');
          } else if (ts === te) {
            errors.push(label + ': Start- und Endzeit dürfen nicht identisch sein.');
          }
        }
      });
    }

    if (step === 4) {
      state.absences.forEach(function (a) {
        var name = personName(a.personId) || 'Unbekannt';
        var as = U.parseTime(a.startTime), ae = U.parseTime(a.endTime);
        if (as === null || ae === null) {
          errors.push(name + ': Abwesenheit hat eine ungültige Uhrzeit.');
        } else if (as === ae) {
          errors.push(name + ': Abwesenheit hat identische Start- und Endzeit.');
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

  function loadDemo() {
    state = defaultState();
    state.event = {
      name: 'Jugendfreizeit – Sommerfest',
      date: U.todayIso(),
      startTime: '08:00',
      endTime: '22:00',
      notes: 'Treffpunkt für alle Schichten ist der Info-Tisch im Foyer.'
    };
    ['Anna', 'Ben', 'Clara', 'David', 'Elena', 'Frank', 'Greta', 'Hannes']
      .forEach(function (n) { state.people.push({ id: U.uid('p'), name: n, arrival: '', departure: '', note: '' }); });

    state.people[3].arrival = '12:00';   // David kommt später
    state.people[6].departure = '18:00'; // Greta geht früher

    state.tasks = [
      { id: U.uid('t'), name: 'Teeschicht',            wholeEvent: true,  startTime: '08:00', endTime: '22:00', slotMinutes: 120, peoplePerSlot: 1, note: 'Teeküche im Foyer' },
      { id: U.uid('t'), name: 'Türschicht',            wholeEvent: true,  startTime: '08:00', endTime: '22:00', slotMinutes: 60,  peoplePerSlot: 2, note: 'Immer zu zweit besetzen' },
      { id: U.uid('t'), name: 'Küchendienst / Essen',  wholeEvent: false, startTime: '11:30', endTime: '14:00', slotMinutes: 75,  peoplePerSlot: 2, note: '' },
      { id: U.uid('t'), name: 'Frühstücksvorbereitung',wholeEvent: false, startTime: '08:00', endTime: '09:30', slotMinutes: 90,  peoplePerSlot: 2, note: '' },
      { id: U.uid('t'), name: 'Aufräumen',             wholeEvent: false, startTime: '20:00', endTime: '22:00', slotMinutes: 60,  peoplePerSlot: 2, note: '' },
      { id: U.uid('t'), name: 'Brötchen besorgen',     wholeEvent: false, startTime: '08:00', endTime: '09:00', slotMinutes: 60,  peoplePerSlot: 1, note: 'Bäckerei Ecke Hauptstraße' }
    ];

    state.absences = [
      { id: U.uid('a'), personId: state.people[0].id, startTime: '14:00', endTime: '16:00', reason: 'Workshop-Leitung' },
      { id: U.uid('a'), personId: state.people[2].id, startTime: '17:00', endTime: '19:00', reason: 'Probe' },
      { id: U.uid('a'), personId: state.people[5].id, startTime: '09:00', endTime: '11:00', reason: 'Anreise Gäste' }
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
    absencesFor: absencesFor,
    invalidateSchedule: invalidateSchedule,
    validateStep: validateStep,
    activePeople: activePeople,
    toJson: toJson,
    fromJson: fromJson,
    loadDemo: loadDemo
  };
})();
