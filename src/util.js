/* ============================================================
   util.js – Hilfsfunktionen (Zeit, IDs, DOM, Zufall)
   Klassisches Script, damit die App auch per Doppelklick
   (file://) ohne Server läuft. Alles hängt an window.Util.
   ============================================================ */

window.Util = (function () {
  'use strict';

  var MIN_PER_DAY = 1440;

  /* ---------- Zeit ---------- */

  /** "HH:MM" -> Minuten seit Mitternacht; ungültig -> null */
  function parseTime(value) {
    if (typeof value !== 'string') return null;
    var m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /** Minuten -> "HH:MM" (Tagesüberlauf wird abgeschnitten) */
  function formatTime(minutes) {
    var m = ((Math.round(minutes) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }

  /** Minuten -> "HH:MM" bzw. "HH:MM (+1)" bei Folgetag */
  function formatTimeDay(minutes) {
    var day = Math.floor(minutes / MIN_PER_DAY);
    return formatTime(minutes) + (day > 0 ? ' (+' + day + ')' : '');
  }

  /**
   * Normalisiert ein Zeitfenster: Endet es rechnerisch vor dem Start,
   * liegt das Ende am Folgetag (z. B. 20:00 – 02:00).
   */
  function normalizeWindow(startMin, endMin) {
    var e = endMin;
    while (e <= startMin) e += MIN_PER_DAY;
    return { start: startMin, end: e };
  }

  /**
   * Richtet eine Uhrzeit am Bezugsfenster aus: liegt sie vor dem
   * Fensterstart, wird sie auf den Folgetag geschoben.
   */
  function alignToWindow(minutes, windowStart) {
    var v = minutes;
    while (v < windowStart) v += MIN_PER_DAY;
    return v;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Zwei halboffene Intervalle [a1,a2) und [b1,b2) überschneiden sich? */
  function overlaps(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }

  /** Minuten -> "2 h 30 min" */
  function formatDuration(minutes) {
    var m = Math.round(minutes);
    var h = Math.floor(m / 60), r = m % 60;
    if (h && r) return h + ' h ' + r + ' min';
    if (h) return h + ' h';
    return r + ' min';
  }

  /** Minuten -> "2,5" (Stunden mit Komma, deutsche Schreibweise) */
  function hoursText(minutes) {
    return (minutes / 60).toFixed(2).replace('.', ',');
  }

  /* ---------- Datum ---------- */

  /** "YYYY-MM-DD" -> "DD.MM.YYYY" */
  function formatDate(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length !== 3) return String(iso);
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  /** "YYYY-MM-DD" + n Tage -> "YYYY-MM-DD" */
  function addDays(iso, days) {
    if (!iso) return '';
    var p = String(iso).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + (days || 0));
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  /** Kalenderdatum für einen Minutenwert relativ zum Veranstaltungsstart */
  function dateForMinutes(isoDate, minutes) {
    return addDays(isoDate, Math.floor(minutes / MIN_PER_DAY));
  }

  var WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  function isoToUtc(iso) {
    var p = String(iso).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function weekdayName(iso) {
    if (!iso) return '';
    return WEEKDAYS[new Date(isoToUtc(iso)).getUTCDay()] || '';
  }

  function weekdayShort(iso) {
    if (!iso) return '';
    return WEEKDAYS_SHORT[new Date(isoToUtc(iso)).getUTCDay()] || '';
  }

  /** Ganze Tage zwischen zwei ISO-Daten (b − a); negativ, wenn b vor a liegt. */
  function daysBetween(isoA, isoB) {
    if (!isoA || !isoB) return 0;
    return Math.round((isoToUtc(isoB) - isoToUtc(isoA)) / 86400000);
  }

  /** Tagesnummer (0 = erster Tag) eines Minutenwerts */
  function dayIndex(minutes) { return Math.floor(minutes / MIN_PER_DAY); }

  /**
   * Endzeit einer Schicht. Ein Zusatz erscheint nur, wenn die Schicht
   * über Mitternacht in den nächsten Kalendertag läuft – bei
   * mehrtägigen Veranstaltungen als Wochentag ("07:00 (Sa)"), sonst
   * als "(+1)".
   */
  function endLabel(startIso, start, end, multiDay) {
    var text = formatTime(end);
    if (dayIndex(end - 1) === dayIndex(start)) return text;
    if (multiDay) return text + ' (' + weekdayShort(dateForMinutes(startIso, end - 1)) + ')';
    return text + ' (+1)';
  }

  /** "Fr, 25.07." – Tagesbeschriftung für Zeitpunkte im Veranstaltungsraster */
  function dayLabel(startIso, minutes) {
    var iso = dateForMinutes(startIso, minutes);
    return weekdayShort(iso) + ', ' + formatDate(iso).slice(0, 6);
  }

  /** "Fr, 25.07.2026" – ausführliche Tagesbeschriftung */
  function dayLabelLong(startIso, minutes) {
    var iso = dateForMinutes(startIso, minutes);
    return weekdayName(iso) + ', ' + formatDate(iso);
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* ---------- IDs & Zufall ---------- */

  var idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + idCounter.toString(36);
  }

  /** Deterministischer PRNG (mulberry32) – gleicher Seed, gleicher Plan */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* ---------- Statistik ---------- */

  function sum(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s; }
  function mean(arr) { return arr.length ? sum(arr) / arr.length : 0; }
  function variance(arr) {
    if (!arr.length) return 0;
    var m = mean(arr), s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return s / arr.length;
  }
  function stdev(arr) { return Math.sqrt(variance(arr)); }

  /* ---------- DOM ---------- */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /** Dateinamen-tauglicher Text */
  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'schichtplan';
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  return {
    MIN_PER_DAY: MIN_PER_DAY,
    parseTime: parseTime,
    formatTime: formatTime,
    formatTimeDay: formatTimeDay,
    normalizeWindow: normalizeWindow,
    alignToWindow: alignToWindow,
    overlaps: overlaps,
    formatDuration: formatDuration,
    hoursText: hoursText,
    formatDate: formatDate,
    addDays: addDays,
    dateForMinutes: dateForMinutes,
    weekdayName: weekdayName,
    weekdayShort: weekdayShort,
    daysBetween: daysBetween,
    dayIndex: dayIndex,
    dayLabel: dayLabel,
    endLabel: endLabel,
    dayLabelLong: dayLabelLong,
    todayIso: todayIso,
    pad2: pad2,
    uid: uid,
    rng: rng,
    hashString: hashString,
    sum: sum,
    mean: mean,
    variance: variance,
    stdev: stdev,
    escapeHtml: escapeHtml,
    $: $,
    $$: $$,
    downloadBlob: downloadBlob,
    slugify: slugify,
    clamp: clamp
  };
})();
