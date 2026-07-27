/* ============================================================
   run-tests.js – Prüfungen ohne Browser
   Aufruf:  node tests/run-tests.js
   ------------------------------------------------------------
   Die Quelldateien sind klassische Browser-Scripte. Für den Test
   werden sie in einen minimalen "window"-Kontext geladen.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* --- minimale Browserumgebung --- */
const sandbox = {
  console,
  TextEncoder,
  Blob,
  Date,
  Math,
  performance,
  setTimeout,
  localStorage: {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['src/util.js', 'src/store.js', 'src/scheduler.js', 'src/xlsx.js', 'src/export.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f }));

const { Util, Store, Scheduler, XlsxWriter, Exporter } = sandbox;

/* --- Mini-Testrahmen --- */
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) { passed++; return; }
  failures.push(name + (detail ? ' → ' + detail : ''));
}
function section(title) { console.log('\n\x1b[1m' + title + '\x1b[0m'); }

/* ============================================================
   1. Zeit-Hilfsfunktionen
   ============================================================ */
section('1. Zeitlogik');

check('parseTime 08:30', Util.parseTime('08:30') === 510);
check('parseTime ungültig', Util.parseTime('25:00') === null && Util.parseTime('abc') === null);
check('formatTime', Util.formatTime(510) === '08:30');
check('formatTime Überlauf', Util.formatTime(1500) === '01:00');
check('formatTimeDay Folgetag', Util.formatTimeDay(1500) === '01:00 (+1)');
check('normalizeWindow über Mitternacht', Util.normalizeWindow(1200, 120).end === 1560);
check('overlaps', Util.overlaps(0, 10, 5, 15) && !Util.overlaps(0, 10, 10, 20));
check('dateForMinutes Folgetag', Util.dateForMinutes('2026-07-27', 1500) === '2026-07-28');
check('formatDate', Util.formatDate('2026-07-27') === '27.07.2026');
check('formatDuration', Util.formatDuration(90) === '1 h 30 min');

/* ============================================================
   2. Planung mit den Demodaten
   ============================================================ */
section('2. Planung (Demodaten)');

Store.loadDemo();
const state = Store.get();
const schedule = Scheduler.compute(state);
const stats = schedule.stats;

console.log('   Schichten:', stats.totalSlots,
  '| Plätze:', stats.filledSeats + '/' + stats.requiredSeats,
  '| offen:', stats.openSeats,
  '| Ø', (stats.meanMinutes / 60).toFixed(2) + ' h',
  '| Spanne', (stats.minMinutes / 60).toFixed(2) + '–' + (stats.maxMinutes / 60).toFixed(2) + ' h');

check('Schichten wurden erzeugt', stats.totalSlots > 0, 'totalSlots=' + stats.totalSlots);
check('Alle Plätze besetzt', stats.openSeats === 0, stats.openSeats + ' offen');

const ctx = Scheduler.buildContext(state);

// (a) keine Einteilung während Abwesenheit
let absenceViolations = 0;
schedule.slots.forEach((slot) => {
  slot.assigned.filter(Boolean).forEach((pid) => {
    if (!Scheduler.isAvailable(ctx, pid, slot.start, slot.end)) absenceViolations++;
  });
});
check('Keine Einteilung in Abwesenheiten', absenceViolations === 0, absenceViolations + ' Verstöße');

// (b) keine Überschneidungen je Person
const byPerson = {};
schedule.slots.forEach((slot) => {
  slot.assigned.filter(Boolean).forEach((pid) => {
    (byPerson[pid] = byPerson[pid] || []).push(slot);
  });
});
let overlapViolations = 0;
Object.keys(byPerson).forEach((pid) => {
  const list = byPerson[pid].slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < list.length; i++) {
    if (list[i].start < list[i - 1].end) overlapViolations++;
  }
});
check('Keine gleichzeitigen Doppeleinteilungen', overlapViolations === 0, overlapViolations + ' Überschneidungen');

// (c) niemand zweimal in derselben Schicht
let duplicateSeats = 0;
schedule.slots.forEach((slot) => {
  const seen = new Set();
  slot.assigned.filter(Boolean).forEach((pid) => {
    if (seen.has(pid)) duplicateSeats++;
    seen.add(pid);
  });
});
check('Niemand doppelt in derselben Schicht', duplicateSeats === 0, duplicateSeats + ' Fälle');

// (d) Zwei-Personen-Aufgaben sind doppelt besetzt
const doorTask = state.tasks.find((t) => t.name === 'Türschicht');
const doorSlots = schedule.slots.filter((s) => s.taskId === doorTask.id);
check('Türschicht durchgehend doppelt besetzt',
  doorSlots.length > 0 && doorSlots.every((s) => s.required === 2 && s.assigned.filter(Boolean).length === 2));

// (e) Fairness
const spreadHours = stats.spreadMinutes / 60;
console.log('   Fairness-Spanne:', spreadHours.toFixed(2), 'h | Stdabw.:',
  (stats.stdevMinutes / 60).toFixed(2), 'h | Schichten je Person:', stats.minCount + '–' + stats.maxCount);
check('Zeitverteilung ist eng beieinander (< 2 h Spanne)', spreadHours < 2, spreadHours.toFixed(2) + ' h');
check('Jede Person hat mindestens eine Schicht', stats.minCount >= 1, 'min=' + stats.minCount);

// (f) Determinismus
const again = Scheduler.compute(state);
const fingerprint = (sch) => sch.slots.map((s) => s.taskName + s.start + ':' + s.assigned.join(',')).join('|');
check('Gleicher Seed → gleicher Plan', fingerprint(schedule) === fingerprint(again));

state.options.seed = 4711;
const variant = Scheduler.compute(state);
check('Anderer Seed → gültiger Plan', variant.stats.openSeats === 0);
state.options.seed = 42;

// (g) Zeitfenster wird eingehalten
const win = schedule.window;
check('Alle Schichten liegen im Veranstaltungszeitraum',
  schedule.slots.every((s) => s.start >= win.start && s.end <= win.end));

/* ============================================================
   3. Randfälle
   ============================================================ */
section('3. Randfälle');

// Veranstaltung über Mitternacht
Store.reset();
const night = Store.get();
night.event = { name: 'Nachtwache', date: '2026-07-27', startTime: '20:00', endTime: '02:00', notes: '' };
['A', 'B', 'C'].forEach((n) => Store.addPerson(n));
Store.addTask({ name: 'Türschicht', wholeEvent: true, slotMinutes: 60, peoplePerSlot: 1 });
const nightPlan = Scheduler.compute(night);
check('Über Mitternacht: 6 Schichten', nightPlan.stats.totalSlots === 6, 'ist ' + nightPlan.stats.totalSlots);
check('Über Mitternacht: alles besetzt', nightPlan.stats.openSeats === 0);
check('Über Mitternacht: Datum wechselt',
  Util.dateForMinutes('2026-07-27', nightPlan.slots[nightPlan.slots.length - 1].start) === '2026-07-28');

// Unterbesetzung wird gemeldet
Store.reset();
const tight = Store.get();
tight.event = { name: 'Zu wenig Leute', date: '2026-07-27', startTime: '10:00', endTime: '12:00', notes: '' };
Store.addPerson('Solo');
Store.addTask({ name: 'Doppelposten', wholeEvent: true, slotMinutes: 60, peoplePerSlot: 2 });
const tightPlan = Scheduler.compute(tight);
check('Unterbesetzung: offene Plätze erkannt', tightPlan.stats.openSeats === 2, 'offen=' + tightPlan.stats.openSeats);
check('Unterbesetzung: Probleme gelistet', tightPlan.issues.length === 2);
check('Unterbesetzung: Hinweistext vorhanden', /verfügbar/i.test(tightPlan.issues[0].message));

// Person komplett abwesend
Store.reset();
const away = Store.get();
away.event = { name: 'Abwesenheitstest', date: '2026-07-27', startTime: '10:00', endTime: '12:00', notes: '' };
const p1 = Store.addPerson('Da');
const p2 = Store.addPerson('Weg');
away.absences.push({ id: 'a1', personId: p2.id, startTime: '10:00', endTime: '12:00', reason: 'krank' });
Store.addTask({ name: 'Tee', wholeEvent: true, slotMinutes: 60, peoplePerSlot: 1 });
const awayPlan = Scheduler.compute(away);
const awayAssigned = new Set(awayPlan.slots.flatMap((s) => s.assigned.filter(Boolean)));
check('Durchgehend abwesende Person bleibt unverplant', !awayAssigned.has(p2.id));
check('Verfügbare Person übernimmt alles', awayPlan.stats.openSeats === 0 && awayAssigned.has(p1.id));

// Kommt später / geht früher
Store.reset();
const late = Store.get();
late.event = { name: 'Ankunftstest', date: '2026-07-27', startTime: '08:00', endTime: '12:00', notes: '' };
const early = Store.addPerson('Frueh');
const lateP = Store.addPerson('Spaet');
lateP.arrival = '10:00';
Store.addTask({ name: 'Tee', wholeEvent: true, slotMinutes: 60, peoplePerSlot: 1 });
const latePlan = Scheduler.compute(late);
const lateShifts = latePlan.slots.filter((s) => s.assigned.includes(lateP.id));
check('„Kommt später“ wird beachtet', lateShifts.every((s) => s.start >= 600), 'früheste ' + Math.min(...lateShifts.map((s) => s.start)));
check('Ankunftstest vollständig besetzt', latePlan.stats.openSeats === 0);

// Höchstzahl Schichten
Store.reset();
const capped = Store.get();
capped.event = { name: 'Deckel', date: '2026-07-27', startTime: '08:00', endTime: '12:00', notes: '' };
['A', 'B'].forEach((n) => Store.addPerson(n));
capped.options.maxShiftsPerPerson = 1;
Store.addTask({ name: 'Tee', wholeEvent: true, slotMinutes: 60, peoplePerSlot: 1 });
const cappedPlan = Scheduler.compute(capped);
check('Obergrenze wird eingehalten', cappedPlan.stats.maxCount <= 1, 'max=' + cappedPlan.stats.maxCount);
check('Obergrenze erzeugt offene Plätze', cappedPlan.stats.openSeats === 2, 'offen=' + cappedPlan.stats.openSeats);

// Teilzeitraum-Aufgabe
Store.reset();
const partial = Store.get();
partial.event = { name: 'Teilzeitraum', date: '2026-07-27', startTime: '08:00', endTime: '20:00', notes: '' };
['A', 'B', 'C', 'D'].forEach((n) => Store.addPerson(n));
Store.addTask({ name: 'Essen', wholeEvent: false, startTime: '12:00', endTime: '14:00', slotMinutes: 60, peoplePerSlot: 2 });
const partialPlan = Scheduler.compute(partial);
check('Teilzeitraum: nur 2 Schichten', partialPlan.stats.totalSlots === 2, 'ist ' + partialPlan.stats.totalSlots);
check('Teilzeitraum: korrekte Grenzen',
  partialPlan.slots[0].start === 720 && partialPlan.slots[1].end === 840);

// Restschicht anhängen
Store.reset();
const rest = Store.get();
rest.event = { name: 'Restzeit', date: '2026-07-27', startTime: '08:00', endTime: '10:20', notes: '' };
Store.addPerson('A'); Store.addPerson('B');
Store.addTask({ name: 'Tee', wholeEvent: true, slotMinutes: 60, peoplePerSlot: 1 });
const restPlan = Scheduler.compute(rest);
check('Kurze Restschicht wird angehängt', restPlan.stats.totalSlots === 2, 'ist ' + restPlan.stats.totalSlots);
check('Letzte Schicht endet am Veranstaltungsende',
  restPlan.slots[restPlan.slots.length - 1].end === 620);

rest.options.mergeShortLastSlot = false;
const restPlan2 = Scheduler.compute(rest);
check('Ohne Anhängen entsteht eine Restschicht', restPlan2.stats.totalSlots === 3, 'ist ' + restPlan2.stats.totalSlots);

// Aufgabe außerhalb des Veranstaltungszeitraums
Store.reset();
const outside = Store.get();
outside.event = { name: 'Ausserhalb', date: '2026-07-27', startTime: '10:00', endTime: '12:00', notes: '' };
Store.addPerson('A');
Store.addTask({ name: 'Frühstück', wholeEvent: false, startTime: '06:00', endTime: '07:00', slotMinutes: 60, peoplePerSlot: 1 });
const outsidePlan = Scheduler.compute(outside);
check('Aufgabe außerhalb wird gemeldet',
  outsidePlan.stats.totalSlots === 0 && outsidePlan.issues.length === 1 &&
  /außerhalb/.test(outsidePlan.issues[0].message));

/* ============================================================
   3b. Mehrtägige Veranstaltungen
   ============================================================ */
section('3b. Mehrtägige Veranstaltungen (Fr–So)');
{


check('daysBetween', Util.daysBetween('2026-07-24', '2026-07-26') === 2 &&
  Util.daysBetween('2026-07-26', '2026-07-24') === -2);
check('weekdayShort', Util.weekdayShort('2026-07-24') === 'Fr');

Store.reset();
const we = Store.get();
we.event = { name: 'Wochenende', date: '2026-07-24', endDate: '2026-07-26', startTime: '17:00', endTime: '14:00', notes: '' };
['A', 'B', 'C', 'D', 'E', 'F'].forEach((n) => Store.addPerson(n));

const weWin = Scheduler.eventWindow(we.event);
check('Zeitfenster über drei Tage', weWin.start === 1020 && weWin.end === 2 * 1440 + 840,
  weWin.start + "–" + weWin.end);
check('Gesamtdauer 45 h', (weWin.end - weWin.start) / 60 === 45, ((weWin.end - weWin.start) / 60) + ' h');
check('Tage-Liste hat drei Einträge', Store.eventDays().length === 3);
check('isMultiDay erkennt Wochenende', Store.isMultiDay() === true);

// Tägliche Aufgabe: an jedem Tag, an den Rändern gekürzt
Store.addTask({ name: 'Türschicht', mode: 'daily', startTime: '08:00', endTime: '20:00', slotMinutes: 120, peoplePerSlot: 2 });
let wePlan = Scheduler.compute(we);
let weDoorSlots = wePlan.slots.filter((s) => s.taskName === 'Türschicht');
const dayOf = (m) => Math.floor(m / 1440);
check('Tägliche Aufgabe an allen drei Tagen',
  new Set(weDoorSlots.map((s) => dayOf(s.start))).size === 3,
  'Tage: ' + [...new Set(weDoorSlots.map((s) => dayOf(s.start)))].join(','));
check('Freitag erst ab Veranstaltungsbeginn',
  Math.min(...weDoorSlots.filter((s) => dayOf(s.start) === 0).map((s) => s.start)) === 1020);
check('Sonntag endet mit der Veranstaltung',
  Math.max(...weDoorSlots.filter((s) => dayOf(s.start) === 2).map((s) => s.end)) === 2 * 1440 + 840);
check('Samstag voll (08:00–20:00)',
  Math.min(...weDoorSlots.filter((s) => dayOf(s.start) === 1).map((s) => s.start)) === 1440 + 480 &&
  Math.max(...weDoorSlots.filter((s) => dayOf(s.start) === 1).map((s) => s.end)) === 1440 + 1200);

// Nachtschicht über Mitternacht
Store.addTask({ name: 'Nachtwache', mode: 'daily', startTime: '23:00', endTime: '07:00', slotMinutes: 240, peoplePerSlot: 1 });
wePlan = Scheduler.compute(we);
const night = wePlan.slots.filter((s) => s.taskName === 'Nachtwache').sort((a, b) => a.start - b.start);
check('Nachtwache: zwei Nächte à zwei Schichten', night.length === 4, 'ist ' + night.length);
check('Nachtwache erste Schicht Fr 23:00', night[0].start === 1380);
check('Nachtwache läuft über Mitternacht', night[0].end === 1620 && dayOf(night[0].end - 1) === 1);
check('Nachtwache letzte Schicht endet So 07:00',
  night[night.length - 1].end === 2 * 1440 + 420, 'ist ' + night[night.length - 1].end);

// Einmalige Aufgabe an einem bestimmten Tag
Store.addTask({ name: 'Endreinigung', mode: 'once', day: '2026-07-26', startTime: '12:00', endTime: '14:00', slotMinutes: 60, peoplePerSlot: 2 });
wePlan = Scheduler.compute(we);
const clean = wePlan.slots.filter((s) => s.taskName === 'Endreinigung');
check('Einmalige Aufgabe nur am gewählten Tag',
  clean.length === 2 && clean.every((s) => dayOf(s.start) === 2), 'ist ' + clean.length);
check('Einmalige Aufgabe: richtiges Kalenderdatum',
  Util.dateForMinutes(we.event.date, clean[0].start) === '2026-07-26');

// Abwesenheit an einem bestimmten Tag
const personB = we.people[1];
we.absences.push({ id: 'a_we', personId: personB.id, date: '2026-07-25', startTime: '08:00', endTime: '20:00', reason: 'Auswärtstermin' });
wePlan = Scheduler.compute(we);
const bSaturday = wePlan.slots.filter(
  (s) => s.assigned.includes(personB.id) && dayOf(s.start) === 1 && s.start >= 1440 + 480 && s.end <= 1440 + 1200);
check('Datierte Abwesenheit wird beachtet', bSaturday.length === 0, bSaturday.length + ' Schichten am Samstag');
const bOther = wePlan.slots.filter((s) => s.assigned.includes(personB.id));
check('Person ist an den anderen Tagen eingeteilt', bOther.length > 0);

// Späte Anreise mit Datum
const personC = we.people[2];
personC.arrival = '10:00';
personC.arrivalDate = '2026-07-25';
wePlan = Scheduler.compute(we);
const cShifts = wePlan.slots.filter((s) => s.assigned.includes(personC.id));
check('Anreise am zweiten Tag wird beachtet',
  cShifts.every((s) => s.start >= 1440 + 600),
  'früheste ' + Math.min(...cShifts.map((s) => s.start)));
personC.arrival = ''; personC.arrivalDate = '';

// Harte Regeln bleiben auch mehrtägig gültig
wePlan = Scheduler.compute(we);
const weCtx = Scheduler.buildContext(we);
let weViolations = 0;
const wePerPerson = {};
wePlan.slots.forEach((slot) => {
  slot.assigned.filter(Boolean).forEach((pid) => {
    if (!Scheduler.isAvailable(weCtx, pid, slot.start, slot.end)) weViolations++;
    (wePerPerson[pid] = wePerPerson[pid] || []).push(slot);
  });
});
Object.keys(wePerPerson).forEach((pid) => {
  const list = wePerPerson[pid].slice().sort((a, b) => a.start - b.start);
  for (let i = 1; i < list.length; i++) if (list[i].start < list[i - 1].end) weViolations++;
});
check('Mehrtägig: keine Regelverstöße', weViolations === 0, weViolations + ' Verstöße');
check('Mehrtägig: alles besetzt', wePlan.stats.openSeats === 0, wePlan.stats.openSeats + ' offen');
check('Mehrtägig: Kennzeichnung multiDay', wePlan.multiDay === true);
console.log('   Wochenende:', wePlan.stats.totalSlots, 'Schichten,',
  (wePlan.stats.minMinutes / 60).toFixed(2) + '–' + (wePlan.stats.maxMinutes / 60).toFixed(2), 'h je Person');

// Wochenend-Demodaten
Store.loadDemoWeekend();
const demoWe = Store.get();
check('Wochenend-Beispiel ist gültig',
  [1, 2, 3, 4].every((s) => Store.validateStep(s).length === 0),
  JSON.stringify([1, 2, 3, 4].map((s) => Store.validateStep(s))));
const demoWePlan = Scheduler.compute(demoWe);
check('Wochenend-Beispiel: Plan über drei Tage',
  new Set(demoWePlan.slots.map((s) => dayOf(s.start))).size === 3);
check('Wochenend-Beispiel: höchstens vereinzelt offene Plätze',
  demoWePlan.stats.openSeats <= 2, demoWePlan.stats.openSeats + ' offen');
console.log('   Wochenend-Beispiel:', demoWePlan.stats.totalSlots, 'Schichten,',
  demoWePlan.stats.filledSeats + '/' + demoWePlan.stats.requiredSeats, 'Plätze,',
  (demoWePlan.stats.minMinutes / 60).toFixed(2) + '–' + (demoWePlan.stats.maxMinutes / 60).toFixed(2), 'h je Person');

// Altbestand (Version 1) muss weiter laufen
Store.fromJson(JSON.stringify({
  version: 1,
  event: { name: 'Alt', date: '2026-07-24', startTime: '08:00', endTime: '12:00' },
  people: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
  tasks: [
    { id: 't1', name: 'Durchgehend', wholeEvent: true, slotMinutes: 60, peoplePerSlot: 1 },
    { id: 't2', name: 'Teilzeit', wholeEvent: false, startTime: '09:00', endTime: '11:00', slotMinutes: 60, peoplePerSlot: 1 }
  ],
  absences: [{ id: 'x1', personId: 'p1', startTime: '08:00', endTime: '09:00', reason: 'alt' }]
}));
const old = Store.get();
check('Altdaten: Enddatum ergänzt', old.event.endDate === '2026-07-24');
check('Altdaten: wholeEvent → mode', old.tasks[0].mode === 'continuous' && old.tasks[1].mode === 'daily');
check('Altdaten: Abwesenheit ohne Datum bleibt gültig', old.absences.length === 1);
const oldPlan = Scheduler.compute(old);
check('Altdaten: Plan wird berechnet', oldPlan.stats.totalSlots === 6 && oldPlan.stats.openSeats === 0,
  oldPlan.stats.totalSlots + ' Schichten, ' + oldPlan.stats.openSeats + ' offen');
check('Altdaten: alte Abwesenheit wirkt',
  !oldPlan.slots.filter((s) => s.start < 540).some((s) => s.assigned.includes('p1')));
}

/* ============================================================
   4. Validierung
   ============================================================ */
section('4. Validierung');

Store.reset();
check('Leere Veranstaltung wird bemängelt', Store.validateStep(1).length >= 1);
check('Ohne Personen wird bemängelt', Store.validateStep(2).length === 1);
check('Ohne Aufgaben wird bemängelt', Store.validateStep(3).length === 1);

Store.loadDemo();
check('Demodaten sind vollständig gültig',
  [1, 2, 3, 4].every((s) => Store.validateStep(s).length === 0),
  JSON.stringify([1, 2, 3, 4].map((s) => Store.validateStep(s))));

const dup = Store.get();
Store.addPerson('Anna');
check('Doppelter Name wird erkannt', Store.validateStep(2).length === 1);
dup.people.pop();

/* ============================================================
   5. Excel-Export
   ============================================================ */
section('5. Excel-Export');

Store.loadDemo();
const exportState = Store.get();
exportState.schedule = Scheduler.compute(exportState);
const blob = Exporter.buildWorkbook(exportState, exportState.schedule);
check('Blob wurde erzeugt', blob && blob.size > 2000, 'size=' + (blob && blob.size));

const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const xlsxPath = path.join(outDir, 'test-schichtplan.xlsx');

check('Spaltenname A/Z/AA', XlsxWriter.colName(0) === 'A' && XlsxWriter.colName(25) === 'Z' && XlsxWriter.colName(26) === 'AA');
check('Dateiname sinnvoll', /^Schichtplan_.*\.xlsx$/.test(Exporter.filename(exportState)), Exporter.filename(exportState));

blob.arrayBuffer().then((buf) => {
  fs.writeFileSync(xlsxPath, Buffer.from(buf));
  check('Datei geschrieben', fs.statSync(xlsxPath).size > 2000);
  const head = fs.readFileSync(xlsxPath).subarray(0, 2).toString('latin1');
  check('ZIP-Signatur vorhanden', head === 'PK');

  report();
}).catch((err) => {
  failures.push('Excel-Export: ' + err.message);
  report();
});

function report() {
  console.log('\n' + '─'.repeat(56));
  if (failures.length) {
    console.log('\x1b[31m' + failures.length + ' Test(s) fehlgeschlagen:\x1b[0m');
    failures.forEach((f) => console.log('  ✗ ' + f));
    console.log('\x1b[32m' + passed + ' Test(s) bestanden.\x1b[0m');
    process.exitCode = 1;
  } else {
    console.log('\x1b[32m✓ Alle ' + passed + ' Tests bestanden.\x1b[0m');
    console.log('  Beispieldatei: ' + path.relative(ROOT, xlsxPath));
  }
}
