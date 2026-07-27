/* ============================================================
   scheduler.js – Faire automatische Schichtverteilung
   ------------------------------------------------------------
   Ablauf:
     1. Kontext aufbauen (Zeitfenster, Nichtverfügbarkeiten)
     2. Schichten (Slots) aus den Aufgaben erzeugen
     3. Greedy-Erstbelegung: knappste Schicht zuerst,
        günstigste Person (= geringste Last) zuerst
     4. Reparaturlauf: freie Plätze durch Umsetzen füllen
     5. Ausgleichslauf: Verschieben & Tauschen, solange die
        Fairness-Kostenfunktion sinkt
     6. Statistik und Problemliste

   Harte Regeln (werden nie verletzt):
     - keine Einteilung in Abwesenheitszeiten
     - keine zwei Aufgaben gleichzeitig
     - keine Person doppelt in derselben Schicht
     - optionale Obergrenze an Schichten pro Person

   Weiche Regeln (fließen in die Kostenfunktion ein):
     - gleiche Gesamtarbeitszeit für alle
     - gleiche Anzahl Schichten für alle
     - gleichmäßige Verteilung über die Aufgabenarten
     - Mindestpause zwischen zwei Schichten
     - Blöcke bevorzugen bzw. Schichten hintereinander vermeiden
   ============================================================ */

window.Scheduler = (function () {
  'use strict';

  var U = window.Util;
  var EPS = 1e-9;

  /* Gewichte der Kostenfunktion (kleiner = fairer) */
  var W_MINUTES = 1;      // Varianz der Gesamtminuten (Leitgröße)
  var W_COUNT = 900;      // Varianz der Schichtanzahl
  var W_TASKMIX = 250;    // Varianz je Aufgabenart
  var W_REST = 2500;      // verletzte Mindestpause
  var W_ADJACENT = 400;   // direkt aneinandergrenzende Schichten

  /* ---------------- Kontext ---------------- */

  /**
   * Bereitet alle Zeitangaben in Minuten relativ zum Veranstaltungstag auf.
   * Ergebnis enthält u. a. die Nichtverfügbarkeiten je Person.
   */
  /**
   * Zeitfenster der Veranstaltung in Minuten seit Mitternacht des
   * Starttags. Deckt eintägige Veranstaltungen (auch über Mitternacht)
   * und mehrtägige Veranstaltungen ab.
   */
  function eventWindow(event) {
    var start = U.parseTime(event.startTime);
    var end = U.parseTime(event.endTime);
    if (start === null) start = 0;
    if (end === null) end = start + 60;

    var spanDays = U.daysBetween(event.date, event.endDate || event.date);
    if (!(spanDays >= 0)) spanDays = 0;

    var absoluteEnd = spanDays * U.MIN_PER_DAY + end;
    // Gleicher Tag und Ende rechnerisch vor dem Start -> Folgetag
    if (absoluteEnd <= start) absoluteEnd += U.MIN_PER_DAY;
    return { start: start, end: absoluteEnd, spanDays: spanDays };
  }

  /**
   * Rechnet Datum + Uhrzeit in das Minutenraster der Veranstaltung um.
   * Ohne Datum (Altbestand) gilt der Starttag; bei eintägigen
   * Veranstaltungen über Mitternacht wird wie bisher automatisch auf
   * den Folgetag geschoben.
   */
  function toMinutes(event, win, dateIso, time, fallbackIso) {
    var t = U.parseTime(time);
    if (t === null) return null;
    var iso = dateIso || fallbackIso || event.date;
    var offset = U.daysBetween(event.date, iso);
    if (!isFinite(offset)) offset = 0;
    var value = offset * U.MIN_PER_DAY + t;
    var singleDay = U.daysBetween(event.date, event.endDate || event.date) === 0;
    if (singleDay && !dateIso && value < win.start) value += U.MIN_PER_DAY;
    return value;
  }

  function buildContext(state) {
    var ev = state.event;
    var win = eventWindow(ev);

    var people = state.people.filter(function (p) { return p.name.trim(); });
    var unavailable = {};
    var availableMinutes = {};
    var lastDayIso = U.dateForMinutes(ev.date, win.end - 1);

    people.forEach(function (p) {
      var blocks = [];

      // Kommt erst später / geht früher -> Randzeiten sperren
      if (p.arrival && U.parseTime(p.arrival) !== null) {
        var arr = toMinutes(ev, win, p.arrivalDate, p.arrival, ev.date);
        if (arr > win.start) blocks.push({ start: win.start, end: Math.min(arr, win.end), reason: 'kommt später' });
      }
      if (p.departure && U.parseTime(p.departure) !== null) {
        var dep = toMinutes(ev, win, p.departureDate, p.departure, lastDayIso);
        if (dep < win.end) blocks.push({ start: Math.max(dep, win.start), end: win.end, reason: 'geht früher' });
      }

      // Eingetragene Abwesenheiten
      state.absences.forEach(function (a) {
        if (a.personId !== p.id) return;
        var as = toMinutes(ev, win, a.date, a.startTime, ev.date);
        var ae = toMinutes(ev, win, a.date, a.endTime, ev.date);
        if (as === null || ae === null) return;
        if (ae <= as) ae += U.MIN_PER_DAY;   // Abwesenheit über Mitternacht
        blocks.push({ start: as, end: ae, reason: a.reason || 'abwesend' });
      });

      unavailable[p.id] = blocks;

      // Wie viel Zeit steht die Person überhaupt zur Verfügung?
      var free = win.end - win.start;
      blocks.forEach(function (b) {
        var s = Math.max(b.start, win.start), e = Math.min(b.end, win.end);
        if (e > s) free -= (e - s);
      });
      availableMinutes[p.id] = Math.max(0, free);
    });

    return {
      window: win,
      people: people,
      peopleIds: people.map(function (p) { return p.id; }),
      unavailable: unavailable,
      availableMinutes: availableMinutes,
      options: state.options,
      event: ev,
      date: ev.date
    };
  }

  /** Ist die Person im gesamten Intervall [start,end) verfügbar? */
  function isAvailable(ctx, personId, start, end) {
    var blocks = ctx.unavailable[personId] || [];
    for (var i = 0; i < blocks.length; i++) {
      if (U.overlaps(start, end, blocks[i].start, blocks[i].end)) return false;
    }
    return true;
  }

  /** Grund der Nichtverfügbarkeit (für Anzeige/Export) */
  function blockingReason(ctx, personId, start, end) {
    var blocks = ctx.unavailable[personId] || [];
    for (var i = 0; i < blocks.length; i++) {
      if (U.overlaps(start, end, blocks[i].start, blocks[i].end)) return blocks[i].reason;
    }
    return '';
  }

  /* ---------------- Schichten erzeugen ---------------- */

  /**
   * Zeiträume, in denen eine Aufgabe benötigt wird – je nach Rhythmus:
   *   continuous  einmal über die gesamte Veranstaltung
   *   daily       an jedem Veranstaltungstag zur gleichen Uhrzeit
   *   once        einmalig an einem bestimmten Tag
   * Alle Zeiträume werden auf das Veranstaltungsfenster begrenzt.
   */
  function taskPeriods(state, ctx, task, warnings) {
    var win = ctx.window;
    var ev = state.event;
    var mode = task.mode || 'continuous';

    if (mode === 'continuous') return [{ start: win.start, end: win.end }];

    var ts = U.parseTime(task.startTime), te = U.parseTime(task.endTime);
    if (ts === null || te === null) {
      warnings.push({ taskName: task.name, message: 'Zeitraum unvollständig – Aufgabe wurde übersprungen.' });
      return [];
    }

    var raw = [];
    if (mode === 'once') {
      var offset = U.daysBetween(ev.date, task.day || ev.date);
      if (!isFinite(offset)) offset = 0;
      raw.push(offset * U.MIN_PER_DAY + ts);
    } else {
      var lastDay = Math.floor((win.end - 1) / U.MIN_PER_DAY);
      for (var d = 0; d <= lastDay; d++) raw.push(d * U.MIN_PER_DAY + ts);
    }

    var periods = [];
    var clippedAny = false;
    raw.forEach(function (start) {
      var end = start - ts + te;
      if (end <= start) end += U.MIN_PER_DAY;         // Zeitraum über Mitternacht
      var s = Math.max(start, win.start);
      var e = Math.min(end, win.end);
      if (e <= s) return;                             // liegt komplett außerhalb
      if (s !== start || e !== end) clippedAny = true;
      periods.push({ start: s, end: e });
    });

    if (!periods.length) {
      warnings.push({
        taskName: task.name,
        message: mode === 'once'
          ? 'Der gewählte Tag liegt außerhalb der Veranstaltung – Aufgabe wurde übersprungen.'
          : 'Zeitraum liegt außerhalb der Veranstaltung – Aufgabe wurde übersprungen.'
      });
    } else if (clippedAny) {
      warnings.push({
        taskName: task.name,
        message: 'Der Zeitraum wurde am Anfang bzw. Ende auf die Veranstaltungszeit gekürzt.'
      });
    }
    return periods;
  }

  /**
   * Zeitraster einer einzelnen Aufgabe: [{ start, end }].
   * Gemeinsame Grundlage für die Planung und für die Schichtauswahl
   * bei festen Zuteilungen in der Oberfläche.
   */
  function slotsForTask(state, ctx, task, warnings) {
    var len = Math.max(5, parseInt(task.slotMinutes, 10) || 60);
    var merge = state.options.mergeShortLastSlot !== false;
    var result = [];

    taskPeriods(state, ctx, task, warnings || []).forEach(function (period) {
      var taskSlots = [];
      var cursor = period.start;
      while (cursor < period.end) {
        var slotEnd = Math.min(cursor + len, period.end);
        taskSlots.push({ start: cursor, end: slotEnd });
        cursor = slotEnd;
      }
      // Sehr kurze Restschicht an die vorherige anhängen
      if (merge && taskSlots.length > 1) {
        var last = taskSlots[taskSlots.length - 1];
        if ((last.end - last.start) < len / 2) {
          taskSlots[taskSlots.length - 2].end = last.end;
          taskSlots.pop();
        }
      }
      result = result.concat(taskSlots);
    });
    return result;
  }

  function buildSlots(state, ctx) {
    var slots = [];
    var warnings = [];

    state.tasks.forEach(function (task) {
      var required = U.clamp(parseInt(task.peoplePerSlot, 10) || 1, 1, 10);
      slotsForTask(state, ctx, task, warnings).forEach(function (s, i) {
        slots.push({
          id: U.uid('s'),
          taskId: task.id,
          taskName: task.name.trim() || 'Aufgabe',
          taskNote: task.note || '',
          index: i + 1,
          start: s.start,
          end: s.end,
          required: required,
          assigned: new Array(required).fill(null),
          manual: new Array(required).fill(false)
        });
      });
    });

    slots.sort(function (a, b) {
      return a.start - b.start || a.taskName.localeCompare(b.taskName, 'de');
    });
    return { slots: slots, warnings: warnings };
  }

  /* ---------------- Belegungszustand ---------------- */

  function createAssignmentState(ctx, slots) {
    var st = {
      ctx: ctx,
      slots: slots,
      byPerson: {},      // personId -> [{start, end, slotId, taskId}]
      minutes: {},
      count: {},
      taskCount: {},     // personId -> { taskId: n }
      penalty: {},       // personId -> weiche Einzelstrafen
      taskIds: []
    };
    ctx.peopleIds.forEach(function (id) {
      st.byPerson[id] = [];
      st.minutes[id] = 0;
      st.count[id] = 0;
      st.taskCount[id] = {};
      st.penalty[id] = 0;
    });
    var seen = {};
    slots.forEach(function (s) { if (!seen[s.taskId]) { seen[s.taskId] = true; st.taskIds.push(s.taskId); } });
    return st;
  }

  function assign(st, slot, seat, personId) {
    slot.assigned[seat] = personId;
    st.byPerson[personId].push({ start: slot.start, end: slot.end, slotId: slot.id, taskId: slot.taskId });
    st.minutes[personId] += (slot.end - slot.start);
    st.count[personId] += 1;
    st.taskCount[personId][slot.taskId] = (st.taskCount[personId][slot.taskId] || 0) + 1;
    updatePenalty(st, personId);
  }

  function unassign(st, slot, seat) {
    var personId = slot.assigned[seat];
    if (!personId) return null;
    slot.assigned[seat] = null;
    var list = st.byPerson[personId];
    for (var i = 0; i < list.length; i++) {
      if (list[i].slotId === slot.id) { list.splice(i, 1); break; }
    }
    st.minutes[personId] -= (slot.end - slot.start);
    st.count[personId] -= 1;
    st.taskCount[personId][slot.taskId] -= 1;
    updatePenalty(st, personId);
    return personId;
  }

  /** Weiche Strafen einer Person: Mindestpause und Blockbildung */
  function updatePenalty(st, personId) {
    var opts = st.ctx.options || {};
    var minRest = parseInt(opts.minRestMinutes, 10) || 0;
    var list = st.byPerson[personId].slice().sort(function (a, b) { return a.start - b.start; });
    var penalty = 0;
    for (var i = 1; i < list.length; i++) {
      var gap = list[i].start - list[i - 1].end;
      if (gap < 0) gap = 0;
      if (gap === 0) {
        // direkt aneinander: je nach Wunsch Bonus oder Strafe
        penalty += opts.preferBlocks ? -W_ADJACENT / 2 : W_ADJACENT;
      } else if (minRest > 0 && gap < minRest) {
        penalty += W_REST;
      }
    }
    st.penalty[personId] = penalty;
  }

  /** Fairness-Kosten des aktuellen Gesamtplans (kleiner ist besser) */
  function cost(st) {
    var ids = st.ctx.peopleIds;
    if (!ids.length) return 0;
    var mins = [], cnts = [];
    var total = 0;
    for (var i = 0; i < ids.length; i++) {
      mins.push(st.minutes[ids[i]]);
      cnts.push(st.count[ids[i]]);
      total += st.penalty[ids[i]];
    }
    var c = W_MINUTES * U.variance(mins) + W_COUNT * U.variance(cnts) + total;

    if (st.ctx.options && st.ctx.options.balanceTaskTypes !== false) {
      for (var t = 0; t < st.taskIds.length; t++) {
        var tid = st.taskIds[t];
        var per = [];
        for (var j = 0; j < ids.length; j++) per.push(st.taskCount[ids[j]][tid] || 0);
        c += W_TASKMIX * U.variance(per);
      }
    }
    return c;
  }

  /* ---------------- Eignungsprüfung ---------------- */

  function hasConflict(st, personId, start, end, exceptSlotId) {
    var list = st.byPerson[personId] || [];
    for (var i = 0; i < list.length; i++) {
      if (exceptSlotId && list[i].slotId === exceptSlotId) continue;
      if (U.overlaps(start, end, list[i].start, list[i].end)) return true;
    }
    return false;
  }

  function inSlot(slot, personId) {
    for (var i = 0; i < slot.assigned.length; i++) if (slot.assigned[i] === personId) return true;
    return false;
  }

  function isEligible(st, slot, personId) {
    var max = parseInt(st.ctx.options.maxShiftsPerPerson, 10) || 0;
    if (max > 0 && st.count[personId] >= max) return false;
    if (inSlot(slot, personId)) return false;
    if (!isAvailable(st.ctx, personId, slot.start, slot.end)) return false;
    if (hasConflict(st, personId, slot.start, slot.end, slot.id)) return false;
    return true;
  }

  /** Personen, die (nur nach Abwesenheiten betrachtet) infrage kämen */
  function availableCountFor(ctx, slot) {
    var n = 0;
    for (var i = 0; i < ctx.peopleIds.length; i++) {
      if (isAvailable(ctx, ctx.peopleIds[i], slot.start, slot.end)) n++;
    }
    return n;
  }

  /* ---------------- Feste Zuteilungen ---------------- */

  /**
   * Trägt die vorab festgelegten Zuteilungen ein, bevor automatisch
   * verteilt wird. Diese Plätze gelten als `manual` und werden von den
   * späteren Ausgleichsläufen nicht mehr angefasst.
   *
   * Umfang (`scope`):
   *   slot  eine bestimmte Schicht (Tag + Uhrzeit)
   *   any   irgendeine Schicht dieser Aufgabe – die App sucht eine aus
   *   all   alle Schichten dieser Aufgabe
   *
   * Harte Regeln bleiben gültig: Ist die Person zu der Zeit abwesend
   * oder bereits anderweitig eingeteilt, wird die Zuteilung nicht
   * eingetragen, sondern als Problem gemeldet.
   */
  function applyFixed(st, state, issues) {
    var ctx = st.ctx;
    var order = { slot: 0, all: 1, any: 2 };

    var entries = (state.fixed || []).slice().sort(function (a, b) {
      return (order[a.scope] || 0) - (order[b.scope] || 0);
    });

    entries.forEach(function (entry) {
      var person = null;
      ctx.people.forEach(function (p) { if (p.id === entry.personId) person = p; });
      var task = null;
      state.tasks.forEach(function (t) { if (t.id === entry.taskId) task = t; });

      if (!person || !task) {
        issues.push({
          severity: 'warn', fixed: true,
          taskName: task ? task.name : '',
          message: 'Feste Zuteilung übersprungen: Person oder Aufgabe existiert nicht mehr.'
        });
        return;
      }

      var taskSlots = st.slots.filter(function (s) { return s.taskId === task.id; })
        .sort(function (a, b) { return a.start - b.start; });

      if (!taskSlots.length) {
        issues.push({
          severity: 'warn', fixed: true, taskName: task.name,
          message: 'Feste Zuteilung für ' + personLabel(person) + ' nicht möglich: ' +
            'für diese Aufgabe entstehen keine Schichten.'
        });
        return;
      }

      if (entry.scope === 'all') {
        var placed = 0, skipped = 0;
        taskSlots.forEach(function (slot) {
          if (placeFixed(st, slot, person.id)) placed++; else skipped++;
        });
        if (!placed) {
          issues.push({
            severity: 'error', fixed: true, taskName: task.name,
            message: personLabel(person) + ' sollte alle Schichten von „' + task.name +
              '“ übernehmen, ist aber in keiner davon verfügbar.'
          });
        } else if (skipped) {
          issues.push({
            severity: 'warn', fixed: true, taskName: task.name,
            message: personLabel(person) + ' übernimmt ' + placed + ' von ' + (placed + skipped) +
              ' Schichten von „' + task.name + '“. Die übrigen ' + skipped +
              ' wurden automatisch besetzt (abwesend oder zeitgleich anders eingeteilt).'
          });
        }
        return;
      }

      if (entry.scope === 'any') {
        // Die passendste freie Schicht wählen: geringste Last zuerst
        var candidates = taskSlots.filter(function (slot) { return canPlaceFixed(st, slot, person.id); });
        if (!candidates.length) {
          issues.push({
            severity: 'error', fixed: true, taskName: task.name,
            message: personLabel(person) + ' hat sich für „' + task.name +
              '“ gemeldet, ist aber in keiner Schicht dieser Aufgabe verfügbar.'
          });
          return;
        }
        placeFixed(st, candidates[0], person.id);
        return;
      }

      // scope === 'slot'
      var target = findFixedSlot(state, taskSlots, entry);
      if (!target) {
        issues.push({
          severity: 'error', fixed: true, taskName: task.name,
          start: null, end: null,
          message: 'Feste Zuteilung für ' + personLabel(person) + ' nicht möglich: ' +
            'zur angegebenen Zeit gibt es keine Schicht von „' + task.name +
            '“ (Zeiten der Aufgabe wurden vermutlich nachträglich geändert).'
        });
        return;
      }
      if (!placeFixed(st, target, person.id)) {
        issues.push({
          severity: 'error', fixed: true, taskName: task.name,
          start: target.start, end: target.end, required: target.required,
          filled: target.assigned.filter(Boolean).length,
          message: 'Feste Zuteilung für ' + personLabel(person) + ' nicht möglich: ' +
            reasonForRefusal(st, target, person.id)
        });
      }
    });
  }

  function personLabel(person) { return person.name.trim() || 'Ohne Namen'; }

  /** Schicht zu Tag + Uhrzeit einer festen Zuteilung finden */
  function findFixedSlot(state, taskSlots, entry) {
    var minutes = null;
    if (entry.startTime) {
      var t = U.parseTime(entry.startTime);
      if (t !== null) {
        var offset = U.daysBetween(state.event.date, entry.day || state.event.date);
        if (!isFinite(offset)) offset = 0;
        minutes = offset * U.MIN_PER_DAY + t;
      }
    }
    if (minutes === null) return null;
    var exact = null, containing = null;
    taskSlots.forEach(function (slot) {
      if (slot.start === minutes) exact = exact || slot;
      else if (minutes > slot.start && minutes < slot.end) containing = containing || slot;
    });
    return exact || containing;
  }

  /** Darf die Person hier fest eingetragen werden? (ohne Schichtobergrenze) */
  function canPlaceFixed(st, slot, personId) {
    if (slot.assigned.indexOf(null) === -1) return false;      // kein Platz frei
    if (inSlot(slot, personId)) return false;
    if (!isAvailable(st.ctx, personId, slot.start, slot.end)) return false;
    if (hasConflict(st, personId, slot.start, slot.end, slot.id)) return false;
    return true;
  }

  function placeFixed(st, slot, personId) {
    if (!canPlaceFixed(st, slot, personId)) return false;
    var seat = slot.assigned.indexOf(null);
    assign(st, slot, seat, personId);
    slot.manual[seat] = true;
    return true;
  }

  function reasonForRefusal(st, slot, personId) {
    if (inSlot(slot, personId)) return 'die Person steht bereits in dieser Schicht.';
    if (!isAvailable(st.ctx, personId, slot.start, slot.end)) {
      var why = blockingReason(st.ctx, personId, slot.start, slot.end);
      return 'die Person ist zu dieser Zeit nicht verfügbar (' + (why || 'abwesend') + ').';
    }
    if (hasConflict(st, personId, slot.start, slot.end, slot.id)) {
      return 'die Person ist zur gleichen Zeit schon fest für eine andere Aufgabe eingetragen.';
    }
    if (slot.assigned.indexOf(null) === -1) {
      return 'die Schicht ist durch andere feste Zuteilungen bereits voll besetzt.';
    }
    return 'die Schicht lässt sich nicht besetzen.';
  }

  /* ---------------- Greedy-Erstbelegung ---------------- */

  function greedyFill(st, rand) {
    var ctx = st.ctx;
    var maxAvail = 1;
    ctx.peopleIds.forEach(function (id) { maxAvail = Math.max(maxAvail, ctx.availableMinutes[id]); });

    // Knappste Schichten zuerst: wenig Auswahl, viele benötigte Personen
    var order = st.slots.slice().map(function (slot) {
      return { slot: slot, slack: availableCountFor(ctx, slot) - slot.required };
    });
    order.sort(function (a, b) {
      return a.slack - b.slack || a.slot.start - b.slot.start ||
        a.slot.taskName.localeCompare(b.slot.taskName, 'de');
    });

    order.forEach(function (entry) {
      var slot = entry.slot;
      for (var seat = 0; seat < slot.required; seat++) {
        if (slot.assigned[seat]) continue;
        var best = null, bestScore = Infinity;
        for (var i = 0; i < ctx.peopleIds.length; i++) {
          var pid = ctx.peopleIds[i];
          if (!isEligible(st, slot, pid)) continue;
          var score = candidateScore(st, slot, pid, maxAvail, rand);
          if (score < bestScore) { bestScore = score; best = pid; }
        }
        if (best) assign(st, slot, seat, best);
      }
    });
  }

  function candidateScore(st, slot, personId, maxAvail, rand) {
    var opts = st.ctx.options;
    var score = st.minutes[personId] + st.count[personId] * 15;

    if (opts.balanceTaskTypes !== false) {
      score += (st.taskCount[personId][slot.taskId] || 0) * 25;
    }

    // Wer insgesamt wenig Zeit hat, wird früher berücksichtigt
    var ratio = maxAvail > 0 ? (st.ctx.availableMinutes[personId] / maxAvail) : 1;
    score -= (1 - ratio) * 90;

    // Nachbarschaft zu bereits vergebenen Schichten
    var minRest = parseInt(opts.minRestMinutes, 10) || 0;
    var list = st.byPerson[personId];
    for (var i = 0; i < list.length; i++) {
      var gap = list[i].start >= slot.end ? (list[i].start - slot.end)
        : (slot.start >= list[i].end ? (slot.start - list[i].end) : 0);
      if (gap === 0) score += opts.preferBlocks ? -35 : 45;
      else if (minRest > 0 && gap < minRest) score += 200;
    }

    // Deterministischer Mini-Zufall bricht Gleichstände auf
    score += rand() * 4;
    return score;
  }

  /* ---------------- Reparatur: freie Plätze füllen ---------------- */

  /**
   * Für jeden freien Platz wird versucht, eine verfügbare Person
   * freizuräumen, indem ihre kollidierende Schicht an jemand
   * anderen abgegeben wird (einstufige Kettenverschiebung).
   */
  function repairOpenSeats(st) {
    var changed = false;
    st.slots.forEach(function (slot) {
      for (var seat = 0; seat < slot.required; seat++) {
        if (slot.assigned[seat]) continue;

        // 1. Direkt jemanden einsetzen, falls möglich
        var direct = bestEligible(st, slot);
        if (direct) { assign(st, slot, seat, direct); changed = true; continue; }

        // 2. Kettenverschiebung
        if (moveChain(st, slot, seat)) changed = true;
      }
    });
    return changed;
  }

  function bestEligible(st, slot, excludeId) {
    var best = null, bestScore = Infinity;
    for (var i = 0; i < st.ctx.peopleIds.length; i++) {
      var pid = st.ctx.peopleIds[i];
      if (excludeId && pid === excludeId) continue;
      if (!isEligible(st, slot, pid)) continue;
      var score = st.minutes[pid] + st.count[pid] * 15;
      if (score < bestScore) { bestScore = score; best = pid; }
    }
    return best;
  }

  function moveChain(st, slot, seat) {
    var ctx = st.ctx;
    for (var i = 0; i < ctx.peopleIds.length; i++) {
      var pid = ctx.peopleIds[i];
      if (inSlot(slot, pid)) continue;
      if (!isAvailable(ctx, pid, slot.start, slot.end)) continue;
      var max = parseInt(ctx.options.maxShiftsPerPerson, 10) || 0;
      if (max > 0 && st.count[pid] >= max) continue;

      // Kollidierende Schichten dieser Person suchen
      var clashes = st.byPerson[pid].filter(function (a) {
        return U.overlaps(slot.start, slot.end, a.start, a.end);
      });
      if (clashes.length !== 1) continue;

      var clashSlot = findSlot(st, clashes[0].slotId);
      if (!clashSlot) continue;
      var clashSeat = clashSlot.assigned.indexOf(pid);
      if (clashSeat < 0) continue;
      if (clashSlot.manual && clashSlot.manual[clashSeat]) continue;

      // Ersatz für die freigewordene Schicht suchen
      unassign(st, clashSlot, clashSeat);
      var replacement = bestEligible(st, clashSlot, pid);
      if (replacement) {
        assign(st, clashSlot, clashSeat, replacement);
        assign(st, slot, seat, pid);
        return true;
      }
      assign(st, clashSlot, clashSeat, pid); // zurückrollen
    }
    return false;
  }

  function findSlot(st, slotId) {
    for (var i = 0; i < st.slots.length; i++) if (st.slots[i].id === slotId) return st.slots[i];
    return null;
  }

  /* ---------------- Ausgleich: Verschieben & Tauschen ---------------- */

  function balance(st, rand, maxPasses) {
    var passes = 0;
    while (passes < maxPasses) {
      passes++;
      var improved = false;
      if (improveByMoving(st)) improved = true;
      if (improveBySwapping(st, rand)) improved = true;
      if (!improved) break;
    }
    return passes;
  }

  function improveByMoving(st) {
    var improved = false;
    for (var i = 0; i < st.slots.length; i++) {
      var slot = st.slots[i];
      for (var seat = 0; seat < slot.required; seat++) {
        var current = slot.assigned[seat];
        if (!current) continue;
        if (slot.manual && slot.manual[seat]) continue;

        var before = cost(st);
        var bestPerson = null, bestCost = before;
        for (var j = 0; j < st.ctx.peopleIds.length; j++) {
          var pid = st.ctx.peopleIds[j];
          if (pid === current) continue;
          unassign(st, slot, seat);
          var ok = isEligible(st, slot, pid);
          if (ok) {
            assign(st, slot, seat, pid);
            var c = cost(st);
            if (c < bestCost - EPS) { bestCost = c; bestPerson = pid; }
            unassign(st, slot, seat);
          }
          assign(st, slot, seat, current); // Ausgangszustand wiederherstellen
        }
        if (bestPerson) {
          unassign(st, slot, seat);
          assign(st, slot, seat, bestPerson);
          improved = true;
        }
      }
    }
    return improved;
  }

  function improveBySwapping(st, rand) {
    // Liste aller belegten Plätze
    var seats = [];
    st.slots.forEach(function (slot) {
      for (var seat = 0; seat < slot.required; seat++) {
        if (slot.assigned[seat] && !(slot.manual && slot.manual[seat])) {
          seats.push({ slot: slot, seat: seat });
        }
      }
    });
    if (seats.length < 2) return false;

    var improved = false;
    var attemptsPerSeat = Math.min(seats.length - 1, 24);

    for (var i = 0; i < seats.length; i++) {
      for (var k = 0; k < attemptsPerSeat; k++) {
        var j = Math.floor(rand() * seats.length);
        if (j === i) continue;
        var a = seats[i], b = seats[j];
        if (a.slot.id === b.slot.id) continue;
        var pa = a.slot.assigned[a.seat], pb = b.slot.assigned[b.seat];
        if (!pa || !pb || pa === pb) continue;

        var before = cost(st);
        unassign(st, a.slot, a.seat);
        unassign(st, b.slot, b.seat);

        if (isEligible(st, a.slot, pb) && isEligible(st, b.slot, pa)) {
          assign(st, a.slot, a.seat, pb);
          assign(st, b.slot, b.seat, pa);
          if (cost(st) < before - EPS) { improved = true; continue; }
          unassign(st, a.slot, a.seat);
          unassign(st, b.slot, b.seat);
        }
        assign(st, a.slot, a.seat, pa);
        assign(st, b.slot, b.seat, pb);
      }
    }
    return improved;
  }

  /* ---------------- Statistik & Probleme ---------------- */

  function buildStats(state, ctx, slots) {
    var perPerson = {};
    ctx.people.forEach(function (p) {
      perPerson[p.id] = {
        personId: p.id,
        name: p.name.trim(),
        count: 0,
        minutes: 0,
        availableMinutes: ctx.availableMinutes[p.id],
        tasks: {},
        shifts: []
      };
    });

    var requiredSeats = 0, filledSeats = 0;
    slots.forEach(function (slot) {
      requiredSeats += slot.required;
      slot.assigned.forEach(function (pid) {
        if (!pid || !perPerson[pid]) return;
        filledSeats++;
        var rec = perPerson[pid];
        rec.count += 1;
        rec.minutes += (slot.end - slot.start);
        rec.tasks[slot.taskName] = (rec.tasks[slot.taskName] || 0) + 1;
        rec.shifts.push(slot.id);
      });
    });

    var list = ctx.people.map(function (p) { return perPerson[p.id]; });
    var mins = list.map(function (r) { return r.minutes; });
    var counts = list.map(function (r) { return r.count; });

    return {
      perPerson: list,
      totalSlots: slots.length,
      requiredSeats: requiredSeats,
      filledSeats: filledSeats,
      openSeats: requiredSeats - filledSeats,
      totalMinutes: U.sum(mins),
      meanMinutes: U.mean(mins),
      minMinutes: mins.length ? Math.min.apply(null, mins) : 0,
      maxMinutes: mins.length ? Math.max.apply(null, mins) : 0,
      spreadMinutes: mins.length ? (Math.max.apply(null, mins) - Math.min.apply(null, mins)) : 0,
      stdevMinutes: U.stdev(mins),
      minCount: counts.length ? Math.min.apply(null, counts) : 0,
      maxCount: counts.length ? Math.max.apply(null, counts) : 0
    };
  }

  function buildIssues(ctx, slots, taskWarnings) {
    var issues = [];

    taskWarnings.forEach(function (w) {
      issues.push({
        severity: 'warn',
        taskName: w.taskName,
        start: null,
        end: null,
        required: 0,
        filled: 0,
        message: w.message
      });
    });

    slots.forEach(function (slot) {
      var filled = slot.assigned.filter(Boolean).length;
      if (filled >= slot.required) return;
      var avail = availableCountFor(ctx, slot);
      var message;
      if (avail === 0) {
        message = 'Niemand ist in diesem Zeitraum verfügbar.';
      } else if (avail < slot.required) {
        message = 'Nur ' + avail + ' von ' + slot.required + ' benötigten Personen sind überhaupt verfügbar.';
      } else {
        message = 'Alle verfügbaren Personen sind zu dieser Zeit bereits anderweitig eingeteilt.';
      }
      issues.push({
        severity: filled === 0 ? 'error' : 'warn',
        slotId: slot.id,
        taskName: slot.taskName,
        start: slot.start,
        end: slot.end,
        required: slot.required,
        filled: filled,
        message: message
      });
    });

    return issues;
  }

  /* ---------------- Öffentliche API ---------------- */

  /** Berechnet einen kompletten Plan aus dem aktuellen Zustand. */
  function compute(state) {
    var ctx = buildContext(state);
    var built = buildSlots(state, ctx);
    var slots = built.slots;
    var st = createAssignmentState(ctx, slots);
    var seed = parseInt(state.options.seed, 10);
    if (isNaN(seed)) seed = 42;
    var rand = U.rng(seed);

    var fixedIssues = [];
    if (ctx.peopleIds.length && slots.length) {
      applyFixed(st, state, fixedIssues);   // Vorabfestlegungen zuerst
      greedyFill(st, rand);
      repairOpenSeats(st);
      balance(st, rand, 8);
      repairOpenSeats(st);
      balance(st, rand, 3);
    }

    var schedule = {
      generatedAt: new Date().toISOString(),
      seed: seed,
      window: ctx.window,
      date: state.event.date,
      endDate: state.event.endDate || state.event.date,
      multiDay: U.dayIndex(ctx.window.end - 1) > 0,
      slots: slots,
      stats: buildStats(state, ctx, slots),
      issues: fixedIssues.concat(buildIssues(ctx, slots, built.warnings)),
      stale: false
    };
    return schedule;
  }

  /**
   * Kandidatenlisten für die manuelle Nachbesetzung in der Oberfläche.
   * Rückgabe: { slotId: [ [ {personId, name, ok, reason}, ... ] je Platz ] }
   */
  function seatOptions(state, schedule) {
    var ctx = buildContext(state);
    var busy = {};
    ctx.peopleIds.forEach(function (id) { busy[id] = []; });
    schedule.slots.forEach(function (slot) {
      slot.assigned.forEach(function (pid) {
        if (pid && busy[pid]) busy[pid].push({ start: slot.start, end: slot.end, slotId: slot.id });
      });
    });

    function busyElsewhere(pid, slot) {
      var list = busy[pid] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].slotId === slot.id) continue;
        if (U.overlaps(slot.start, slot.end, list[i].start, list[i].end)) return true;
      }
      return false;
    }

    var result = {};
    schedule.slots.forEach(function (slot) {
      var seats = [];
      for (var seat = 0; seat < slot.required; seat++) {
        var current = slot.assigned[seat];
        /* jshint loopfunc:true */
        seats.push(ctx.people.map(function (p) {
          if (p.id === current) return { personId: p.id, name: p.name.trim(), ok: true, reason: '' };
          if (inSlot(slot, p.id)) return { personId: p.id, name: p.name.trim(), ok: false, reason: 'schon in dieser Schicht' };
          if (!isAvailable(ctx, p.id, slot.start, slot.end)) {
            return {
              personId: p.id, name: p.name.trim(), ok: false,
              reason: blockingReason(ctx, p.id, slot.start, slot.end) || 'nicht verfügbar'
            };
          }
          if (busyElsewhere(p.id, slot)) {
            return { personId: p.id, name: p.name.trim(), ok: false, reason: 'andere Schicht zur gleichen Zeit' };
          }
          return { personId: p.id, name: p.name.trim(), ok: true, reason: '' };
        }));
      }
      result[slot.id] = seats;
    });
    return result;
  }

  /** Statistik und Problemliste nach manueller Änderung neu berechnen. */
  function refresh(state, schedule) {
    var ctx = buildContext(state);
    schedule.stats = buildStats(state, ctx, schedule.slots);
    schedule.issues = buildIssues(ctx, schedule.slots, []);
    return schedule;
  }

  return {
    compute: compute,
    seatOptions: seatOptions,
    refresh: refresh,
    buildContext: buildContext,
    eventWindow: eventWindow,
    taskPeriods: taskPeriods,
    slotsForTask: slotsForTask,
    isAvailable: isAvailable
  };
})();
