#!/usr/bin/env node
/* ============================================================
   Build: erzeugt aus src/
     netzwerk_topologie_tool.html   die Anwendung (Einzeldatei)
     hilfe.html                     das eigenständige Handbuch

   Der Handbuchtext existiert nur einmal (src/help/body.html) und
   wird in beide Ziele eingebettet — in die Anwendung zusätzlich
   als JS-Konstante, damit sie ohne Begleitdatei vollständig ist.

   Aufruf:  node build.js [--watch]
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const JS_DIR = path.join(SRC, 'js');
const HELP_DIR = path.join(SRC, 'help');
const ANALYSE_DIR = path.join(SRC, 'analyse');
const OUT_APP = path.join(ROOT, 'netzwerk_topologie_tool.html');
const OUT_HELP = path.join(ROOT, 'hilfe.html');
const ANALYSE_FILES = ['netzwerk_analyse.ps1', 'netzwerk_analyse.sh'];
const IMG_DIR = path.join(ROOT, 'bilder');
const IMG_WARN_FILE = 80 * 1024;
const IMG_WARN_TOTAL = 1.5 * 1024 * 1024;

const DIAGRAM_START = '/*__DIAGRAM_CSS_START__*/';
const DIAGRAM_END = '/*__DIAGRAM_CSS_END__*/';

function read(p) { return fs.readFileSync(p, 'utf8'); }

/** Der Diagramm-Block aus styles.css wird zusätzlich als JS-Konstante
 *  eingebettet, damit der SVG-Export dieselben Regeln mitliefert. */
function extractDiagramCss(css) {
  const a = css.indexOf(DIAGRAM_START);
  const b = css.indexOf(DIAGRAM_END);
  if (a < 0 || b < 0) {
    console.warn('! Marker für Diagramm-CSS nicht gefunden — SVG-Export bleibt ungestylt.');
    return '';
  }
  return css.slice(a + DIAGRAM_START.length, b).trim();
}

/** JSON-Literal, das gefahrlos in einem <script>-Block stehen kann.
 *  </script> muss maskiert werden, ebenso die Zeilentrenner U+2028/U+2029,
 *  die JSON erlaubt, JavaScript-Quelltext aber nicht. */
const RE_LINE_SEP = new RegExp('\\u2028', 'g');
const RE_PARA_SEP = new RegExp('\\u2029', 'g');
function jsString(value) {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(RE_LINE_SEP, '\\u2028')
    .replace(RE_PARA_SEP, '\\u2029');
}

/**
 * Liest bilder/ und bettet die Dateien als Bibliothek ein.
 * Zugeordnet wird hier nichts — das erledigt die Anwendung zur Laufzeit,
 * damit Abgleich und Alias-Tabelle nur an einer Stelle existieren.
 *
 * Node hat ohne Zusatzpakete keinen Bildskalierer; deshalb wird gemeldet
 * statt verkleinert. Empfehlung: rund 600 px Kantenlänge, JPEG.
 */
function collectImages() {
  if (!fs.existsSync(IMG_DIR)) return [];
  const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif'
  };
  const files = fs.readdirSync(IMG_DIR)
    .filter(f => MIME[path.extname(f).toLowerCase()])
    .sort();
  if (!files.length) return [];

  const out = [];
  let total = 0;
  const fat = [];
  files.forEach(name => {
    const buf = fs.readFileSync(path.join(IMG_DIR, name));
    total += buf.length;
    if (buf.length > IMG_WARN_FILE) fat.push(name + ' (' + Math.round(buf.length / 1024) + ' KB)');
    out.push({
      name: name,
      data: 'data:' + MIME[path.extname(name).toLowerCase()] + ';base64,' + buf.toString('base64')
    });
  });

  console.log('  Bildbibliothek: ' + out.length + ' Datei(en), ' +
    (total / 1024).toFixed(0) + ' KB');
  if (fat.length) {
    console.warn('  ! Große Bilder (> ' + Math.round(IMG_WARN_FILE / 1024) + ' KB): ' + fat.join(', '));
    console.warn('    Für einen 120 px breiten Streifen genügen rund 600 px Kantenlänge.');
  }
  if (total > IMG_WARN_TOTAL) {
    console.warn('  ! Die Bibliothek belegt ' + (total / 1024 / 1024).toFixed(2) +
      ' MB in der HTML-Datei.');
  }
  return out;
}

/** Baut das Inhaltsverzeichnis aus den h2/h3-Überschriften des Handbuchs. */
function buildToc(bodyHtml) {
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g;
  const items = [];
  let m;
  while ((m = re.exec(bodyHtml)) !== null) {
    items.push({
      level: Number(m[1]),
      id: m[2],
      text: m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    });
  }
  if (!items.length) {
    console.warn('! Keine Überschriften mit id gefunden — Inhaltsverzeichnis bleibt leer.');
    return '<ul></ul>';
  }
  const html = items.map(it =>
    '<li><a class="lvl' + it.level + '" href="#' + it.id + '">' + it.text + '</a></li>'
  ).join('');
  console.log('  Inhaltsverzeichnis: ' + items.filter(i => i.level === 2).length + ' Kapitel, ' +
    items.filter(i => i.level === 3).length + ' Unterabschnitte');
  return '<ul>' + html + '</ul>';
}

function build() {
  const template = read(path.join(SRC, 'index.html'));
  const css = read(path.join(SRC, 'styles.css'));
  const icons = read(path.join(SRC, 'icons.svg'));
  const hardware = read(path.join(SRC, 'hardware.svg'));

  const helpBody = read(path.join(HELP_DIR, 'body.html'));
  const helpCss = read(path.join(HELP_DIR, 'help.css'));
  const helpUi = read(path.join(HELP_DIR, 'help-ui.js'));
  const helpShell = read(path.join(HELP_DIR, 'shell.html'));
  const helpToc = buildToc(helpBody);

  /* ---- 1. eigenständiges Handbuch --------------------------------- */
  const helpDoc = helpShell
    .replace('/*__HELP_CSS__*/', () => helpCss)
    .replace('<!--__HELP_TOC__-->', () => helpToc)
    .replace('<!--__HELP_BODY__-->', () => helpBody)
    .replace('/*__HELP_JS__*/', () => helpUi);

  if (helpDoc.indexOf('__HELP_') >= 0) {
    throw new Error('Platzhalter in src/help/shell.html wurden nicht ersetzt.');
  }
  fs.writeFileSync(OUT_HELP, helpDoc, 'utf8');

  /* ---- 1b. Bildbibliothek aus bilder/ einbetten -------------------- */
  const library = collectImages();

  /* ---- 2. Analyse-Skripte bereitstellen --------------------------- */
  /* Sie werden neben die HTML-Datei kopiert UND in die Anwendung
     eingebettet, damit sie auch bei reiner Einzeldatei-Weitergabe
     angezeigt und heruntergeladen werden können. */
  const scripts = {};
  ANALYSE_FILES.forEach(name => {
    const text = read(path.join(ANALYSE_DIR, name));
    scripts[name] = text;
    fs.writeFileSync(path.join(ROOT, name), text, 'utf8');
  });

  /* ---- 3. Anwendung als Einzeldatei ------------------------------- */
  const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort();
  if (!files.length) throw new Error('Keine JavaScript-Module in src/js gefunden.');

  const header =
    '/* Netzwerk-Topologie-Tool — erzeugt von build.js. Quellen: src/ */\n' +
    'window.__NWT_DIAGRAM_CSS__ = ' + jsString(extractDiagramCss(css)) + ';\n' +
    'window.__NWT_HELP_BODY__ = ' + jsString(helpBody) + ';\n' +
    'window.__NWT_HELP_TOC__ = ' + jsString(helpToc) + ';\n' +
    'window.__NWT_SCRIPT_PS1__ = ' + jsString(scripts['netzwerk_analyse.ps1']) + ';\n' +
    'window.__NWT_SCRIPT_SH__ = ' + jsString(scripts['netzwerk_analyse.sh']) + ';\n' +
    'window.__NWT_IMAGE_LIBRARY__ = ' + jsString(library) + ';\n';

  const js = header +
    '\n/* ======================= help-ui.js ======================= */\n' + helpUi +
    files.map(f =>
      '\n/* ======================= ' + f + ' ======================= */\n' + read(path.join(JS_DIR, f))
    ).join('\n');

  const out = template
    .replace('<!--__ICONS__-->', () => icons.trim())
    .replace('<!--__HARDWARE__-->', () => hardware.trim())
    .replace('/*__CSS__*/', () => css + '\n\n/* ---- Handbuch ---- */\n' + helpCss)
    .replace('/*__JS__*/', () => js);

  if (out.indexOf('/*__CSS__*/') >= 0 || out.indexOf('/*__JS__*/') >= 0) {
    throw new Error('Platzhalter in src/index.html wurden nicht ersetzt.');
  }
  fs.writeFileSync(OUT_APP, out, 'utf8');

  const kb = s => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1) + ' KB';
  console.log('✓ ' + path.basename(OUT_APP) + '  (' + kb(out) + ', ' + files.length + ' Module)');
  console.log('✓ ' + path.basename(OUT_HELP) + '  (' + kb(helpDoc) + ')');
  ANALYSE_FILES.forEach(n => console.log('✓ ' + n + '  (' + kb(scripts[n]) + ')'));
}

function watch() {
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { build(); } catch (e) { console.error('✗ ' + e.message); }
    }, 120);
  };
  [SRC, JS_DIR, HELP_DIR, ANALYSE_DIR, IMG_DIR].filter(dir => fs.existsSync(dir)).forEach(dir => fs.watch(dir, rebuild));
  console.log('… beobachte src/ (Strg+C beendet)');
}

try {
  build();
  if (process.argv.indexOf('--watch') >= 0) watch();
} catch (e) {
  console.error('✗ Build fehlgeschlagen: ' + e.message);
  process.exit(1);
}
