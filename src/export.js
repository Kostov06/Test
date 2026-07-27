/* ============================================================
   export.js – Aufbau der Excel-Mappe aus Plan + Stammdaten
   ------------------------------------------------------------
   Tabellenblätter:
     1. Schichtplan       – eine Zeile je Schicht, Personen in Spalten
     2. Teilnehmende      – Namen, Zeiten, Auslastung
     3. Verfügbarkeiten   – Abwesenheiten und An-/Abreisezeiten
     4. Offene Schichten  – nicht besetzbare / problematische Schichten
     5. Veranstaltung     – Rahmendaten und Kennzahlen

   Alle Werte werden als Text bzw. einfache Zahlen geschrieben,
   damit die Datei anschließend problemlos von Hand weiter
   bearbeitet werden kann.
   ============================================================ */

window.Exporter = (function () {
  'use strict';

  var U = window.Util;

  function h(text) { return { v: text, s: 'header' }; }
  function c(value, style) { return { v: value, s: style || 'cell' }; }
  function n(value, style) { return { v: value, t: 'n', s: style || 'cell' }; }

  /* ---------------- Blatt 1: Schichtplan ---------------- */

  function sheetPlan(state, schedule) {
    var maxPeople = 1;
    schedule.slots.forEach(function (s) { maxPeople = Math.max(maxPeople, s.required); });

    var header = [h('Datum'), h('Aufgabe'), h('Startzeit'), h('Endzeit'), h('Dauer (min)')];
    for (var i = 0; i < maxPeople; i++) header.push(h('Person ' + (i + 1)));
    header.push(h('Bemerkung'));

    var rows = [];
    rows.push([{ v: state.event.name || 'Schichtplan', s: 'title' }]);
    rows.push([{
      v: U.formatDate(state.event.date) + ' · ' +
        U.formatTime(schedule.window.start) + '–' + U.formatTimeDay(schedule.window.end) +
        (state.event.notes ? ' · ' + state.event.notes : ''),
      s: 'muted'
    }]);
    rows.push([]);
    rows.push(header);

    var slots = schedule.slots.slice().sort(sortSlots);
    slots.forEach(function (slot) {
      var open = slot.required - slot.assigned.filter(Boolean).length;
      var rowStyle = open === 0 ? 'cell' : (open === slot.required ? 'bad' : 'warn');
      var row = [
        c(U.formatDate(U.dateForMinutes(state.event.date, slot.start)), rowStyle),
        c(slot.taskName, rowStyle),
        c(U.formatTime(slot.start), 'time'),
        c(U.formatTimeDay(slot.end), 'time'),
        n(slot.end - slot.start, rowStyle)
      ];
      for (var i = 0; i < maxPeople; i++) {
        if (i >= slot.required) { row.push(c('', 'cell')); continue; }
        var pid = slot.assigned[i];
        row.push(pid ? c(nameOf(state, pid), rowStyle) : c('— offen —', 'bad'));
      }
      var remark = [];
      if (open > 0) remark.push(open === 1 ? '1 Platz offen' : open + ' Plätze offen');
      if (slot.taskNote) remark.push(slot.taskNote);
      row.push(c(remark.join(' · '), open > 0 ? 'bad' : 'wrap'));
      rows.push(row);
    });

    if (!slots.length) rows.push([c('Keine Schichten vorhanden', 'cell')]);

    var columns = [{ width: 13 }, { width: 26 }, { width: 11 }, { width: 12 }, { width: 12 }];
    for (var k = 0; k < maxPeople; k++) columns.push({ width: 20 });
    columns.push({ width: 34 });

    return {
      name: 'Schichtplan',
      columns: columns,
      rows: rows,
      freeze: 4,
      headerRow: 4,
      autoFilter: true,
      autoFilterRow: 4
    };
  }

  function sortSlots(a, b) {
    return a.start - b.start || a.taskName.localeCompare(b.taskName, 'de') || a.end - b.end;
  }

  function nameOf(state, personId) {
    var p = null;
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === personId) p = state.people[i];
    return p ? (p.name || 'Ohne Namen') : 'Unbekannt';
  }

  /* ---------------- Blatt 2: Teilnehmende ---------------- */

  function sheetPeople(state, schedule) {
    var rows = [[
      h('Name'), h('Kommt ab'), h('Geht bis'), h('Notiz'),
      h('Anzahl Schichten'), h('Gesamtzeit (h)'), h('Aufgabenverteilung')
    ]];

    var byId = {};
    schedule.stats.perPerson.forEach(function (r) { byId[r.personId] = r; });

    state.people.forEach(function (p) {
      if (!p.name.trim()) return;
      var rec = byId[p.id] || { count: 0, minutes: 0, tasks: {} };
      var mix = Object.keys(rec.tasks).sort().map(function (t) {
        return t + ': ' + rec.tasks[t];
      }).join(', ');
      rows.push([
        c(p.name.trim(), 'bold'),
        c(p.arrival || '', 'time'),
        c(p.departure || '', 'time'),
        c(p.note || ''),
        n(rec.count),
        n(Math.round(rec.minutes / 60 * 100) / 100, 'number'),
        c(mix, 'wrap')
      ]);
    });

    return {
      name: 'Teilnehmende',
      columns: [{ width: 22 }, { width: 12 }, { width: 12 }, { width: 26 }, { width: 16 }, { width: 15 }, { width: 40 }],
      rows: rows,
      freeze: 1,
      headerRow: 1,
      autoFilter: true
    };
  }

  /* ---------------- Blatt 3: Verfügbarkeiten ---------------- */

  function sheetAvailability(state) {
    var rows = [[h('Person'), h('Art'), h('Nicht verfügbar von'), h('bis'), h('Grund')]];

    state.people.forEach(function (p) {
      if (!p.name.trim()) return;
      var name = p.name.trim();
      if (p.arrival) {
        rows.push([c(name, 'bold'), c('kommt später'), c(state.event.startTime, 'time'), c(p.arrival, 'time'), c('vor Ankunft')]);
      }
      if (p.departure) {
        rows.push([c(name, 'bold'), c('geht früher'), c(p.departure, 'time'), c(state.event.endTime, 'time'), c('nach Abreise')]);
      }
      state.absences.filter(function (a) { return a.personId === p.id; }).forEach(function (a) {
        rows.push([c(name, 'bold'), c('Abwesenheit'), c(a.startTime, 'time'), c(a.endTime, 'time'), c(a.reason || '')]);
      });
    });

    if (rows.length === 1) rows.push([c('Keine Einschränkungen erfasst – alle Personen sind durchgehend verfügbar.', 'cell')]);

    return {
      name: 'Verfügbarkeiten',
      columns: [{ width: 22 }, { width: 16 }, { width: 20 }, { width: 12 }, { width: 32 }],
      rows: rows,
      freeze: 1,
      headerRow: 1,
      autoFilter: true
    };
  }

  /* ---------------- Blatt 4: Offene Schichten ---------------- */

  function sheetIssues(state, schedule) {
    var rows = [[
      h('Aufgabe'), h('Datum'), h('Von'), h('Bis'),
      h('Benötigt'), h('Besetzt'), h('Fehlt'), h('Hinweis')
    ]];

    schedule.issues.forEach(function (issue) {
      var style = issue.severity === 'error' ? 'bad' : 'warn';
      rows.push([
        c(issue.taskName || '', style),
        c(issue.start != null ? U.formatDate(U.dateForMinutes(state.event.date, issue.start)) : '', style),
        c(issue.start != null ? U.formatTime(issue.start) : '', 'time'),
        c(issue.end != null ? U.formatTimeDay(issue.end) : '', 'time'),
        issue.required ? n(issue.required, style) : c('', style),
        issue.required ? n(issue.filled, style) : c('', style),
        issue.required ? n(issue.required - issue.filled, style) : c('', style),
        c(issue.message, 'wrap')
      ]);
    });

    if (rows.length === 1) {
      rows.push([c('Keine offenen oder problematischen Schichten – der Plan ist vollständig besetzt.', 'good')]);
    }

    return {
      name: 'Offene Schichten',
      columns: [{ width: 26 }, { width: 13 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 52 }],
      rows: rows,
      freeze: 1,
      headerRow: 1,
      autoFilter: true
    };
  }

  /* ---------------- Blatt 5: Veranstaltung ---------------- */

  function sheetInfo(state, schedule) {
    var s = schedule.stats;
    var rows = [];
    rows.push([{ v: 'Veranstaltung', s: 'title' }]);
    rows.push([]);
    rows.push([h('Feld'), h('Wert')]);
    rows.push([c('Name', 'bold'), c(state.event.name || '')]);
    rows.push([c('Datum', 'bold'), c(U.formatDate(state.event.date) + ' (' + U.weekdayName(state.event.date) + ')')]);
    rows.push([c('Beginn', 'bold'), c(U.formatTime(schedule.window.start), 'time')]);
    rows.push([c('Ende', 'bold'), c(U.formatTimeDay(schedule.window.end), 'time')]);
    rows.push([c('Dauer', 'bold'), c(U.formatDuration(schedule.window.end - schedule.window.start))]);
    rows.push([c('Bemerkungen', 'bold'), c(state.event.notes || '', 'wrap')]);
    rows.push([]);
    rows.push([h('Kennzahl'), h('Wert')]);
    rows.push([c('Aufgaben', 'bold'), n(state.tasks.length)]);
    rows.push([c('Personen', 'bold'), n(s.perPerson.length)]);
    rows.push([c('Schichten gesamt', 'bold'), n(s.totalSlots)]);
    rows.push([c('Benötigte Plätze', 'bold'), n(s.requiredSeats)]);
    rows.push([c('Besetzte Plätze', 'bold'), n(s.filledSeats)]);
    rows.push([c('Offene Plätze', 'bold'), s.openSeats ? n(s.openSeats, 'bad') : n(0, 'good')]);
    rows.push([c('Gesamtarbeitszeit (h)', 'bold'), n(Math.round(s.totalMinutes / 60 * 100) / 100, 'number')]);
    rows.push([c('Ø je Person (h)', 'bold'), n(Math.round(s.meanMinutes / 60 * 100) / 100, 'number')]);
    rows.push([c('Spanne min/max (h)', 'bold'), c(U.hoursText(s.minMinutes) + ' – ' + U.hoursText(s.maxMinutes))]);
    rows.push([]);
    rows.push([{ v: 'Erstellt am ' + new Date(schedule.generatedAt).toLocaleString('de-DE') +
      ' mit Schichtplaner (Zufallsstartwert ' + schedule.seed + ')', s: 'muted' }]);

    return {
      name: 'Veranstaltung',
      columns: [{ width: 26 }, { width: 46 }],
      rows: rows
    };
  }

  /* ---------------- Öffentliche API ---------------- */

  function buildWorkbook(state, schedule) {
    var opt = (state.options && state.options.exportSheets) || {};
    var sheets = [sheetPlan(state, schedule)];
    if (opt.people !== false) sheets.push(sheetPeople(state, schedule));
    if (opt.availability !== false) sheets.push(sheetAvailability(state));
    if (opt.issues !== false) sheets.push(sheetIssues(state, schedule));
    if (opt.info !== false) sheets.push(sheetInfo(state, schedule));
    return window.XlsxWriter.build(sheets);
  }

  function filename(state) {
    return 'Schichtplan_' + U.slugify(state.event.name) + '_' + (state.event.date || U.todayIso()) + '.xlsx';
  }

  function downloadXlsx(state, schedule) {
    var blob = buildWorkbook(state, schedule);
    U.downloadBlob(blob, filename(state));
  }

  /** Zusätzlicher CSV-Export des Schichtplans (Semikolon, Excel-tauglich) */
  function downloadCsv(state, schedule) {
    var maxPeople = 1;
    schedule.slots.forEach(function (s) { maxPeople = Math.max(maxPeople, s.required); });
    var head = ['Datum', 'Aufgabe', 'Startzeit', 'Endzeit', 'Dauer (min)'];
    for (var i = 0; i < maxPeople; i++) head.push('Person ' + (i + 1));
    head.push('Bemerkung');

    var lines = [head.join(';')];
    schedule.slots.slice().sort(sortSlots).forEach(function (slot) {
      var open = slot.required - slot.assigned.filter(Boolean).length;
      var cells = [
        U.formatDate(U.dateForMinutes(state.event.date, slot.start)),
        slot.taskName,
        U.formatTime(slot.start),
        U.formatTimeDay(slot.end),
        String(slot.end - slot.start)
      ];
      for (var j = 0; j < maxPeople; j++) {
        var pid = j < slot.required ? slot.assigned[j] : null;
        cells.push(j >= slot.required ? '' : (pid ? nameOf(state, pid) : 'offen'));
      }
      cells.push((open > 0 ? open + ' Plätze offen. ' : '') + (slot.taskNote || ''));
      lines.push(cells.map(csvCell).join(';'));
    });

    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    U.downloadBlob(blob, filename(state).replace(/\.xlsx$/, '.csv'));
  }

  function csvCell(value) {
    var s = String(value == null ? '' : value);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  return {
    buildWorkbook: buildWorkbook,
    downloadXlsx: downloadXlsx,
    downloadCsv: downloadCsv,
    filename: filename
  };
})();
