/* ============================================================
   app.js – Wizard-Steuerung, Ereignisbehandlung, Bootstrap
   ============================================================ */

(function () {
  'use strict';

  var U = window.Util;
  var Store = window.Store;
  var UI = window.UI;

  var content = U.$('#stepContent');
  var nav = U.$('#stepNav');
  var footerHint = U.$('#footerHint');
  var toastHost = U.$('#toastHost');
  var fileInput = U.$('#jsonFileInput');

  var lastErrors = [];

  /*
   * Bindungen, die den Aufbau der Seite verändern (Felder erscheinen
   * oder verschwinden). Nur sie lösen einen Neuaufbau aus – alle
   * anderen aktualisieren gezielt einzelne Textstellen, damit ein
   * laufender Klick nicht verloren geht. Es sind ausschließlich
   * Auswahlfelder und Schalter, bei denen die Änderung mit dem Klick
   * abgeschlossen ist.
   */
  var RERENDER_BINDS = ['task.mode', 'fixed.scope', 'fixed.taskId'];

  /* ---------------- Rendering ---------------- */

  function render(focusHint) {
    var state = Store.get();
    nav.innerHTML = UI.renderNav(state);
    content.innerHTML = UI.renderStep(state);

    // Fußzeile
    U.$('[data-action="prev"]').disabled = state.step <= 1;
    var nextBtn = U.$('[data-action="next"]');
    nextBtn.textContent = UI.primaryLabel(state.step);
    nextBtn.classList.toggle('btn-primary', true);

    showHint();
    restoreFocus(focusHint);
  }

  function restoreFocus(hint) {
    if (!hint || !hint.bind) return;
    var selector = '[data-bind="' + hint.bind + '"]' + (hint.id ? '[data-id="' + hint.id + '"]' : '');
    var el = content.querySelector(selector);
    if (!el) return;
    el.focus();
    if (hint.selStart != null && typeof el.setSelectionRange === 'function') {
      try { el.setSelectionRange(hint.selStart, hint.selEnd); } catch (err) { /* z. B. bei type=time */ }
    }
  }

  function focusHintFrom(target) {
    if (!target || document.activeElement !== target || !target.dataset || !target.dataset.bind) return null;
    var hint = { bind: target.dataset.bind, id: target.dataset.id || '' };
    if (typeof target.selectionStart === 'number') {
      try { hint.selStart = target.selectionStart; hint.selEnd = target.selectionEnd; } catch (err) { /* egal */ }
    }
    return hint;
  }

  function showHint(message, isError) {
    if (message) {
      footerHint.innerHTML = message;
      footerHint.classList.toggle('is-error', !!isError);
      return;
    }
    var state = Store.get();
    footerHint.classList.remove('is-error');
    var texts = {
      1: 'Rahmendaten der Veranstaltung eingeben.',
      2: 'Alle Personen erfassen, die eingeplant werden dürfen.',
      3: 'Aufgaben mit Zeitraum, Schichtlänge und Personenzahl anlegen.',
      4: 'Abwesenheiten eintragen – wer immer da ist, braucht keinen Eintrag.',
      5: 'Freiwillige eintragen – dieser Schritt ist optional.',
      6: 'Regeln prüfen und den Plan berechnen.',
      7: 'Plan prüfen, bei Bedarf anpassen und als Excel herunterladen.'
    };
    footerHint.textContent = texts[state.step] || '';
  }

  function toast(message, type) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    toastHost.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
    }, 3200);
  }

  function showErrors(errors) {
    lastErrors = errors;
    if (!errors.length) { showHint(); return; }
    showHint('<strong>Bitte prüfen:</strong> ' + U.escapeHtml(errors[0]) +
      (errors.length > 1 ? ' (+' + (errors.length - 1) + ' weitere)' : ''), true);
  }

  /* ---------------- Navigation ---------------- */

  function goTo(step) {
    var state = Store.get();
    state.step = U.clamp(step, 1, UI.STEP_COUNT);
    Store.save();
    lastErrors = [];
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    content.focus();
  }

  function next() {
    var state = Store.get();
    if (state.step === 6) { compute(); return; }
    if (state.step === UI.STEP_COUNT) { downloadXlsx(); return; }

    var errors = Store.validateStep(state.step);
    if (errors.length) { showErrors(errors); toast(errors[0], 'error'); return; }
    goTo(state.step + 1);
  }

  function prev() {
    var state = Store.get();
    goTo(state.step - 1);
  }

  /* ---------------- Aktionen ---------------- */

  function compute() {
    var state = Store.get();
    // Alle vorherigen Schritte prüfen, bevor gerechnet wird
    var errors = [];
    for (var s = 1; s <= 5; s++) errors = errors.concat(Store.validateStep(s));
    if (errors.length) {
      showErrors(errors);
      toast(errors[0], 'error');
      return;
    }

    var t0 = performance.now();
    state.schedule = window.Scheduler.compute(state);
    state.step = UI.STEP_COUNT;
    UI.view.tab = 'timeline';
    Store.save();
    render();

    var st = state.schedule.stats;
    var ms = Math.round(performance.now() - t0);
    if (st.openSeats > 0) {
      toast('Plan berechnet (' + ms + ' ms) – ' + st.openSeats + ' Platz/Plätze konnten nicht besetzt werden.', 'error');
    } else {
      toast('Plan berechnet (' + ms + ' ms) – alle ' + st.requiredSeats + ' Plätze sind besetzt.', 'ok');
    }
  }

  function downloadXlsx() {
    var state = Store.get();
    if (!state.schedule) { toast('Bitte zuerst einen Plan berechnen.', 'error'); return; }
    try {
      window.Exporter.downloadXlsx(state, state.schedule);
      toast('Excel-Datei wurde erzeugt.', 'ok');
    } catch (err) {
      toast('Excel-Export fehlgeschlagen: ' + err.message, 'error');
    }
  }

  function downloadCsv() {
    var state = Store.get();
    if (!state.schedule) { toast('Bitte zuerst einen Plan berechnen.', 'error'); return; }
    window.Exporter.downloadCsv(state, state.schedule);
    toast('CSV-Datei wurde erzeugt.', 'ok');
  }

  function addBulkNames() {
    var box = U.$('#bulkNames');
    if (!box) return;
    var names = box.value.split(/[\n,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!names.length) { toast('Keine Namen gefunden.', 'error'); return; }
    names.forEach(function (n) { Store.addPerson(n); });
    box.value = '';
    render();
    toast(names.length + ' Person(en) hinzugefügt.', 'ok');
  }

  function exportJson() {
    var state = Store.get();
    var blob = new Blob([Store.toJson()], { type: 'application/json' });
    U.downloadBlob(blob, 'schichtplaner_' + U.slugify(state.event.name) + '.json');
    toast('Projektdatei gespeichert.', 'ok');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        Store.fromJson(String(reader.result));
        render();
        toast('Projektdatei geladen.', 'ok');
      } catch (err) {
        toast('Datei konnte nicht gelesen werden.', 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- Datenbindung ---------------- */

  function applyBinding(target) {
    var bind = target.dataset.bind;
    if (!bind) return false;
    var id = target.dataset.id || '';
    var parts = bind.split('.');
    var group = parts[0], key = parts[1];
    var state = Store.get();
    var value;

    if (target.type === 'checkbox') value = target.checked;
    else if (target.type === 'number') value = target.value === '' ? 0 : Number(target.value);
    else value = target.value;

    if (group === 'event') {
      state.event[key] = value;
      // Enddatum mitführen, solange die Veranstaltung eintägig ist
      if (key === 'date' && (!state.event.endDate || U.daysBetween(value, state.event.endDate) < 0)) {
        state.event.endDate = value;
      }
    } else if (group === 'option') {
      state.options[key] = value;
    } else if (group === 'export') {
      state.options.exportSheets[key] = value;
    } else if (group === 'person') {
      var person = Store.personById(id);
      if (!person) return false;
      person[key] = value;
    } else if (group === 'task') {
      var task = Store.taskById(id);
      if (!task) return false;
      if (key === 'peoplePerSlot') value = U.clamp(parseInt(value, 10) || 1, 1, 10);
      if (key === 'slotMinutes') value = Math.max(5, parseInt(value, 10) || 60);
      task[key] = value;
    } else if (group === 'fixed') {
      var entry = Store.fixedById(id);
      if (!entry) return false;
      if (key === 'slotChoice') {
        // Wert der Schichtauswahl ist "YYYY-MM-TT|HH:MM"
        var parts = String(value).split('|');
        entry.day = parts[0] || '';
        entry.startTime = parts[1] || '';
      } else {
        entry[key] = value;
        // Aufgabe gewechselt: die alte Schichtauswahl passt nicht mehr
        if (key === 'taskId') { entry.day = ''; entry.startTime = ''; }
      }
    } else if (group === 'absence') {
      var absence = null;
      state.absences.forEach(function (a) { if (a.id === id) absence = a; });
      if (!absence) return false;
      absence[key] = value;
    } else {
      return false;
    }

    if (group !== 'export') Store.invalidateSchedule();
    Store.save();
    return true;
  }

  /* ---------------- Ereignisse ---------------- */

  /**
   * Aktualisiert nur die abgeleiteten Textbausteine des aktuellen
   * Schritts. Bewusst kein Neuaufbau des DOM: Ein Neuaufbau während
   * eines laufenden Klicks (Feld verlassen -> change -> Klick auf
   * Button) würde den Klick verschlucken.
   */
  function updateDerived(target) {
    var state = Store.get();
    var id = target && target.dataset ? (target.dataset.id || '') : '';

    var duration = U.$('#eventDuration');
    if (duration) duration.innerHTML = UI.eventDurationHtml(state);

    var hintStart = U.$('#dayHintStart');
    if (hintStart) hintStart.textContent = UI.dayHint(state.event.date);
    var hintEnd = U.$('#dayHintEnd');
    if (hintEnd) hintEnd.textContent = UI.dayHint(state.event.endDate || state.event.date, true);

    var count = U.$('#peopleCount');
    if (count) count.textContent = UI.peopleCountText(state);

    if (state.step === 3) {
      state.tasks.forEach(function (task, index) {
        var preview = U.$('#taskPreview_' + task.id);
        if (preview) preview.innerHTML = UI.previewSlots(state, task);
        var title = U.$('#taskTitle_' + task.id);
        if (title) title.textContent = UI.taskTitleText(task, index);
      });
    }

    if (state.step === 5) {
      var demand = UI.totalDemand(state);
      var box = U.$('#demandPreview');
      if (box) box.innerHTML = '<strong>Bedarfsvorschau:</strong> ' + demand.text;
      var warn = U.$('#demandWarning');
      if (warn) {
        warn.innerHTML = demand.warning;
        warn.hidden = !demand.warning;
      }
    }
    return id;
  }

  document.addEventListener('input', function (ev) {
    var target = ev.target;
    if (!target.dataset || !target.dataset.bind) return;
    applyBinding(target);
    updateDerived(target);
    if (lastErrors.length) showErrors(Store.validateStep(Store.get().step));
  });

  document.addEventListener('change', function (ev) {
    var target = ev.target;
    if (!target.dataset) return;

    if (target.dataset.action === 'seat') {
      handleSeatChange(target);
      return;
    }
    if (target === fileInput) {
      if (fileInput.files && fileInput.files[0]) importJson(fileInput.files[0]);
      fileInput.value = '';
      return;
    }
    if (!target.dataset.bind) return;

    if (applyBinding(target)) {
      updateDerived(target);
      // Diese Felder blenden andere Felder ein bzw. aus und brauchen
      // deshalb einen echten Neuaufbau der Ansicht.
      if (RERENDER_BINDS.indexOf(target.dataset.bind) !== -1) render(focusHintFrom(target));
    }
  });

  function handleSeatChange(select) {
    var state = Store.get();
    var schedule = state.schedule;
    if (!schedule) return;
    var slotId = select.dataset.slot;
    var seat = parseInt(select.dataset.seat, 10);
    var personId = select.value || null;

    var slot = null;
    schedule.slots.forEach(function (s) { if (s.id === slotId) slot = s; });
    if (!slot) return;

    slot.assigned[seat] = personId;
    if (slot.manual) slot.manual[seat] = true;
    window.Scheduler.refresh(state, schedule);
    Store.save();
    render();
    toast(personId ? 'Schicht neu zugeteilt.' : 'Platz freigegeben.', 'ok');
  }

  document.addEventListener('click', function (ev) {
    var target = ev.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    var id = target.dataset.id;
    var state = Store.get();

    switch (action) {
      case 'next': next(); break;
      case 'prev': prev(); break;
      case 'goto-step': goTo(parseInt(target.dataset.step, 10)); break;

      case 'add-person':
        Store.addPerson('');
        render();
        var inputs = U.$$('[data-bind="person.name"]', content);
        if (inputs.length) inputs[inputs.length - 1].focus();
        break;
      case 'remove-person': Store.removePerson(id); render(); break;
      case 'add-bulk': addBulkNames(); break;

      case 'add-task': Store.addTask(); render(); break;
      case 'add-preset':
        var preset = UI.TASK_PRESETS[parseInt(target.dataset.preset, 10)];
        Store.addTask(Object.assign({}, preset, {
          startTime: preset.wholeEvent ? state.event.startTime : state.event.startTime,
          endTime: preset.wholeEvent ? state.event.endTime : state.event.endTime
        }));
        render();
        break;
      case 'remove-task': Store.removeTask(id); render(); break;

      case 'add-absence': Store.addAbsence(id); render(); break;
      case 'remove-absence': Store.removeAbsence(id); render(); break;

      case 'add-fixed': Store.addFixed(); render(); break;
      case 'remove-fixed': Store.removeFixed(id); render(); break;

      case 'compute': compute(); break;
      case 'download-xlsx': downloadXlsx(); break;
      case 'download-csv': downloadCsv(); break;
      case 'print': window.print(); break;

      case 'tab':
        UI.view.tab = target.dataset.tab;
        render();
        break;

      case 'load-demo':
      case 'load-demo-weekend':
        if (state.people.length || state.tasks.length) {
          if (!window.confirm('Die aktuellen Eingaben werden durch das Beispiel ersetzt. Fortfahren?')) return;
        }
        if (action === 'load-demo-weekend') Store.loadDemoWeekend(); else Store.loadDemo();
        render();
        toast(action === 'load-demo-weekend'
          ? 'Beispiel für ein Wochenende geladen (Freitag bis Sonntag).'
          : 'Beispiel für einen Tag geladen.', 'ok');
        break;
      case 'reset-all':
        if (!window.confirm('Wirklich alle Eingaben löschen?')) return;
        Store.reset();
        render();
        toast('Alles zurückgesetzt.', 'ok');
        break;
      case 'export-json': exportJson(); break;
      case 'import-json': fileInput.click(); break;
      default: break;
    }
  });

  /* ---------------- Start ---------------- */

  Store.load();
  render();
})();
