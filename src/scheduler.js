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
  function buildContext(state) {
    var ev = state.event;
    var evStart = U.parseTime(ev.startTime);
    var evEnd = U.parseTime(ev.endTime);
    if (evStart === null) evStart = 0;
    if (evEnd === null) evEnd = evStart + 60;
    var win = U.normalizeWindow(evStart, evEnd);

    var people = state.people.filter(function (p) { return p.name.trim(); });
    var unavailable = {};
    var availableMinutes = {};

    people.forEach(function (p) {
      var blocks = [];

      // Kommt erst später / geht früher -> Randzeiten sperren
      if (p.arrival && U.parseTime(p.arrival) !== null) {
        var arr = U.alignToWindow(U.parseTime(p.arrival), win.start);
        if (arr > win.start) blocks.push({ start: win.start, end: Math.min(arr, win.end), reason: 'kommt später' });
      }
      if (p.departure && U.parseTime(p.departure) !== null) {
        var dep = U.alignToWindow(U.parseTime(p.departure), win.start);
        if (dep < win.end) blocks.push({ start: Math.max(dep, win.start), end: win.end, reason: 'geht früher' });
      }

      // Eingetragene Abwesenheiten
      state.absences.forEach(function (a) {
        if (a.personId !== p.id) return;
        var s = U.parseTime(a.startTime), e = U.parseTime(a.endTime);
        if (s === null || e === null) return;
        var as = U.alignToWindow(s, win.start);
        var ae = U.alignToWindow(e, as);
        if (ae <= as) ae += U.MIN_PER_DAY;
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

  function buildSlots(state, ctx) {
    var slots = [];
    var warnings = [];
    var win = ctx.window;
    var merge = state.options.mergeShortLastSlot !== false;

    state.tasks.forEach(function (task) {
      var start, end;
      if (task.wholeEvent) {
        start = win.start;
        end = win.end;
      } else {
        var ts = U.parseTime(task.startTime), te = U.parseTime(task.endTime);
        if (ts === null || te === null) {
          warnings.push({ type: 'task', taskName: task.name, message: 'Zeitraum unvollständig – Aufgabe wurde übersprungen.' });
          return;
        }
        start = U.alignToWindow(ts, win.start);
        end = U.alignToWindow(te, start);
        if (end <= start) end += U.MIN_PER_DAY;
        // auf das Veranstaltungsfenster begrenzen
        var clippedStart = Math.max(start, win.start);
        var clippedEnd = Math.min(end, win.end);
        if (clippedEnd <= clippedStart) {
          warnings.push({
            type: 'task', taskName: task.name,
            message: 'Zeitraum liegt außerhalb der Veranstaltung – Aufgabe wurde übersprungen.'
          });
          return;
        }
        if (clippedStart !== start || clippedEnd !== end) {
          warnings.push({
            type: 'task', taskName: task.name,
            message: 'Zeitraum wurde auf die Veranstaltungszeit gekürzt (' +
              U.formatTime(clippedStart) + '–' + U.formatTime(clippedEnd) + ').'
          });
        }
        start = clippedStart;
        end = clippedEnd;
      }

      var len = Math.max(5, parseInt(task.slotMinutes, 10) || 60);
      var required = U.clamp(parseInt(task.peoplePerSlot, 10) || 1, 1, 10);
      var taskSlots = [];
      var cursor = start;
      while (cursor < end) {
        var slotEnd = Math.min(cursor + len, end);
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

      taskSlots.forEach(function (s, i) {
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

    if (ctx.peopleIds.length && slots.length) {
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
      slots: slots,
      stats: buildStats(state, ctx, slots),
      issues: buildIssues(ctx, slots, built.warnings),
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
    isAvailable: isAvailable
  };
})();
