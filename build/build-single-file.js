/* ============================================================
   build-single-file.js
   ------------------------------------------------------------
   Baut aus index.html + assets/styles.css + src/*.js eine
   einzige, in sich geschlossene HTML-Datei. Diese Datei lässt
   sich verschicken, auf dem Handy speichern und offline öffnen.

   Aufruf:  node build/build-single-file.js

   Erzeugt:
     schichtplaner.html          – komplette Seite (Doppelklick)
     build/out/artifact-body.html – nur der Seiteninhalt (ohne
                                    <html>/<head>/<body>), für die
                                    Veröffentlichung als Web-Seite
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = read('index.html');
const css = read('assets/styles.css');

const scripts = ['util', 'store', 'scheduler', 'xlsx', 'export', 'ui', 'app']
  .map((name) => ({ name, code: read('src/' + name + '.js') }));

/* Sicherheitsnetz: ein "</script>" im Code würde das Inline-Script beenden. */
scripts.forEach((s) => {
  if (/<\/script/i.test(s.code)) {
    throw new Error('src/' + s.name + '.js enthält "</script>" – Inline-Einbettung nicht möglich.');
  }
});

const inlineScripts = scripts
  .map((s) => '<script>\n/* ---- src/' + s.name + '.js ---- */\n' + s.code + '\n</script>')
  .join('\n');

/* ---------- 1. Vollständige Einzeldatei ---------- */

/*
 * Wichtig: Ersetzungen immer über eine Funktion, nie über einen String.
 * In einem Ersetzungs-String hätten "$$", "$&" usw. Sonderbedeutung –
 * aus "U.$$(…)" im Quelltext würde stillschweigend "U.$(…)".
 */
let single = html
  .replace('<link rel="stylesheet" href="assets/styles.css">', () => '<style>\n' + css + '\n</style>')
  .replace(/<script src="src\/[a-z]+\.js"><\/script>\s*/g, () => '')
  .replace('</body>', () => inlineScripts + '\n</body>')
  .replace('<head>', () => '<head>\n<!-- Automatisch erzeugt mit: ' +
    'node build/build-single-file.js – bitte nicht von Hand bearbeiten. -->');

/* Kontrolle: jeder Baustein muss unverändert enthalten sein. */
function assertVerbatim(container, part, label) {
  if (container.indexOf(part) === -1) {
    throw new Error(label + ' wurde beim Zusammenbauen verändert – Ausgabe nicht verwendbar.');
  }
}
assertVerbatim(single, css, 'assets/styles.css');
scripts.forEach((s) => assertVerbatim(single, s.code, 'src/' + s.name + '.js'));

fs.writeFileSync(path.join(ROOT, 'schichtplaner.html'), single);

/* ---------- 2. Variante für die Veröffentlichung ---------- */

const bodyMatch = single.match(/<body>([\s\S]*)<\/body>/);
const titleMatch = single.match(/<title>([\s\S]*?)<\/title>/);
const artifact =
  '<title>' + (titleMatch ? titleMatch[1] : 'Schichtplaner') + '</title>\n' +
  '<style>\n' + css + '\n</style>\n' +
  bodyMatch[1].trim() + '\n';

fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'artifact-body.html'), artifact);

const kb = (f) => (fs.statSync(path.join(ROOT, f)).size / 1024).toFixed(0) + ' kB';
console.log('schichtplaner.html            ', kb('schichtplaner.html'));
console.log('build/out/artifact-body.html  ', kb('build/out/artifact-body.html'));
