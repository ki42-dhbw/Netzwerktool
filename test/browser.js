/* ============================================================
   Testhilfe: Chromium finden und Seite öffnen
   Sucht in dieser Reihenfolge:
     1. Umgebungsvariable NWT_CHROMIUM
     2. den von playwright-core erwarteten Pfad
     3. den ms-playwright-Browsercache
     4. installiertes Chrome bzw. Edge
   ============================================================ */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const engines = require('playwright-core');
const engineName = process.env.NWT_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engineName)) throw new Error('NWT_BROWSER: chromium, firefox oder webkit verwenden.');
const chromium = engines[engineName];
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'netzwerk_topologie_tool.html');
const HELP_HTML = path.join(ROOT, 'hilfe.html');
const OUT_DIR = path.join(__dirname, 'output');

function cacheDirs() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return [path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ms-playwright')];
  }
  if (process.platform === 'darwin') return [path.join(home, 'Library', 'Caches', 'ms-playwright')];
  return [path.join(home, '.cache', 'ms-playwright')];
}

function exeNames() {
  if (process.platform === 'win32') {
    return [
      path.join('chrome-win', 'chrome.exe'),
      path.join('chrome-headless-shell-win', 'chrome-headless-shell.exe')
    ];
  }
  if (process.platform === 'darwin') {
    return [
      path.join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join('chrome-headless-shell-mac', 'chrome-headless-shell')
    ];
  }
  return [
    path.join('chrome-linux', 'chrome'),
    path.join('chrome-headless-shell-linux', 'chrome-headless-shell')
  ];
}

function systemBrowsers() {
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
      path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')
    ];
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
}

function resolveExecutable() {
  if (engineName !== 'chromium') {
    const executable = chromium.executablePath();
    if (!fs.existsSync(executable)) throw new Error(engineName + ' fehlt. Installieren: node node_modules/playwright-core/cli.js install ' + engineName);
    return executable;
  }
  if (process.env.NWT_CHROMIUM && fs.existsSync(process.env.NWT_CHROMIUM)) {
    return process.env.NWT_CHROMIUM;
  }
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* playwright-core kennt den Pfad nicht — weiter unten suchen */ }

  for (const dir of cacheDirs()) {
    if (!fs.existsSync(dir)) continue;
    const builds = fs.readdirSync(dir)
      .filter(n => /^chromium(_headless_shell)?-\d+$/.test(n))
      .sort((a, b) => parseInt(b.replace(/\D/g, ''), 10) - parseInt(a.replace(/\D/g, ''), 10));
    for (const build of builds) {
      for (const rel of exeNames()) {
        const candidate = path.join(dir, build, rel);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  for (const p of systemBrowsers()) if (fs.existsSync(p)) return p;

  throw new Error(
    'Kein Chromium gefunden. Abhilfe:\n' +
    '  npx playwright install chromium\n' +
    'oder den Pfad setzen:  set NWT_CHROMIUM=C:\\Pfad\\zu\\chrome.exe'
  );
}

function fileUrl() {
  if (!fs.existsSync(HTML)) {
    throw new Error('netzwerk_topologie_tool.html fehlt — bitte zuerst "node build.js" ausführen.');
  }
  return pathToFileURL(HTML).href;
}

function helpUrl() {
  if (!fs.existsSync(HELP_HTML)) {
    throw new Error('hilfe.html fehlt — bitte zuerst "node build.js" ausführen.');
  }
  return pathToFileURL(HELP_HTML).href;
}

async function launch() {
  const executablePath = resolveExecutable();
  const headed = process.argv.indexOf('--headed') >= 0;
  const browser = await chromium.launch({ executablePath, headless: !headed });
  return { browser, executablePath };
}

/** Lädt die Anwendung mit garantiert leerem Browser-Speicher. */
async function openApp(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(fileUrl());
  await page.waitForTimeout(300);
  await page.evaluate(() => { NWT.Persistence.autosave.cancel(); try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForTimeout(400);
  page.nwtErrors = errors;
  return page;
}

function outFile(name) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  return path.join(OUT_DIR, name);
}

module.exports = {
  launch, openApp, fileUrl, helpUrl, outFile, resolveExecutable,
  ROOT, HTML, HELP_HTML, OUT_DIR
};
