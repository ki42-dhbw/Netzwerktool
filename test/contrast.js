/* ============================================================
   Kontrastprüfung für helles und dunkles Design.

   Misst jede sichtbare Schrift gegen ihren tatsächlichen
   Hintergrund — HTML über `color`, die Zeichenfläche über `fill`.
   Meldet außerdem, wie viele Elemente geprüft wurden: eine
   Prüfung, die nichts findet, weil sie nichts misst, ist keine.

   Aufruf:  node test/contrast.js  [--headed]
   ============================================================ */
'use strict';

const { launch, openApp, outFile } = require('./browser');

/* Schwellen nach WCAG: 4.5 für normale Schrift, 3.0 für große
   oder fette. Die Zeichenfläche wird mit 3.0 bewertet, weil dort
   nur kurze, fette Beschriftungen stehen. */
const MIN_TEXT = 4.5;
const MIN_LARGE = 3.0;

/* Läuft im Browser. Wird als Funktion übergeben, nicht als Text —
   sonst verschluckt die Maskierung die Backslashes der regulären
   Ausdrücke und die Prüfung misst stillschweigend nichts. */
function probe() {
  function channels(color) {
    const str = String(color);
    const m = str.match(/[0-9.]+/g);
    if (!m || m.length < 3) return null;
    /* color-mix() liefert `color(srgb 0.73 0.6 0.96)` — dort laufen die
       Komponenten von 0 bis 1, bei rgb() von 0 bis 255. */
    if (/^color\(/.test(str)) return m.slice(0, 3).map(v => Number(v) * 255);
    return m.slice(0, 3).map(Number);
  }
  function alpha(color) {
    const m = String(color).match(/[0-9.]+/g);
    return m && m.length >= 4 ? Number(m[3]) : 1;
  }
  function luminance(color) {
    const ch = channels(color);
    if (!ch) return null;
    const f = ch.map(v => {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  }
  function ratio(fg, bg) {
    const a = luminance(fg), b = luminance(bg);
    if (a === null || b === null || isNaN(a) || isNaN(b)) return null;
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }
  function backgroundBehind(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      const c = getComputedStyle(n).backgroundColor;
      if (channels(c) && alpha(c) > 0.5) return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.documentElement).backgroundColor;
  }

  const results = [];
  let checked = 0;

  /* --- HTML: color gegen Hintergrund --- */
  document.querySelectorAll('body *').forEach(el => {
    /* SVG-Text wird über fill gefärbt, nicht über color — dort würde man
       die Symbolfarbe des Geräts messen und Fehlalarme ernten.
       Die Zeichenfläche prüft der zweite Block gezielt. */
    if (el.ownerSVGElement || el.tagName === 'svg') return;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.3) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const hasOwnText = Array.prototype.some.call(el.childNodes,
      n => n.nodeType === 3 && n.nodeValue.trim().length > 1);
    if (!hasOwnText) return;

    const value = ratio(s.color, backgroundBehind(el));
    if (value === null) return;
    checked++;
    const size = parseFloat(s.fontSize) || 13;
    const bold = (parseInt(s.fontWeight, 10) || 400) >= 600;
    const min = (size >= 18.66 || (bold && size >= 14)) ? 3.0 : 4.5;
    if (value < min) {
      results.push({
        kind: 'html', ratio: value, min: min,
        what: el.tagName.toLowerCase() +
          (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''),
        fg: s.color, bg: backgroundBehind(el),
        text: (el.textContent || '').trim().slice(0, 40)
      });
    }
  });

  /* --- Zeichenfläche: fill gegen fill --- */
  const fillOf = sel => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fill : null;
  };
  const canvasBg = getComputedStyle(document.getElementById('canvas-wrap')).backgroundColor;
  const svgPairs = [
    ['Gerätename', '.node-name', () => fillOf('.node-box')],
    ['Gerätetyp', '.node-type', () => fillOf('.node-box')],
    ['IP-Adresse', '.node-ip', () => fillOf('.node-box')],
    ['Leitungsbeschriftung', '.edge-label-tx', () => fillOf('.edge-label-bg')],
    ['Portbeschriftung', '.edge-port', () => canvasBg],
    ['Bereichstitel', '.area-title', () => canvasBg],
    ['Notiztext', '.node-note .nt-body', () => fillOf('.node-note .note-box')],
    ['Textfeld', '.node-text .nt-body', () => canvasBg]
  ];
  const svg = [];
  svgPairs.forEach(([name, sel, bgFn]) => {
    const fg = fillOf(sel);
    if (!fg) return;
    const bg = bgFn();
    const value = ratio(fg, bg);
    if (value === null) return;
    checked++;
    svg.push({ name: name, ratio: value, fg: fg, bg: bg });
    if (value < 3.0) {
      results.push({ kind: 'svg', ratio: value, min: 3.0, what: name, fg: fg, bg: bg, text: '' });
    }
  });

  return { checked: checked, problems: results.sort((a, b) => a.ratio - b.ratio), svg: svg };
}

(async () => {
  const { browser } = await launch();
  const page = await openApp(browser, { width: 1600, height: 1000 });
  await page.evaluate(() => {
    NWT.Commands.loadExample();
    const d = NWT.Interaction.addDeviceAt('note', 200, 1200);
    d.name = 'Wartungsfenster jeden ersten Sonntag im Monat.';
    const t = NWT.Interaction.addDeviceAt('text', 600, 1200);
    t.name = 'Standort München';
    NWT.emit('change', { structural: true });
  });
  await page.waitForTimeout(500);
  if (await page.evaluate(() => NWT.Store.project.devices.length) < 10) throw new Error('Beispielprojekt fuer die Kontrastpruefung wurde nicht geladen.');

  let problems = 0;
  let anyChecked = 0;

  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => { NWT.Theme.set(t); }, theme);
    await page.waitForTimeout(250);

    for (const view of ['Zeichenfläche', 'Einstellungen', 'Dashboard', 'Handbuch', 'Inventar', 'Netzprüfung', 'Sicherungen']) {
      await page.evaluate(v => {
        NWT.Settings.close(); NWT.Dashboard.close(); NWT.HelpDoc.close(); NWT.Modal.close();
        if (v === 'Einstellungen') NWT.Settings.open();
        if (v === 'Dashboard') NWT.Dashboard.open('overview');
        if (v === 'Handbuch') NWT.HelpDoc.open();
        if (v === 'Inventar') NWT.Workbench.open('devices');
        if (v === 'Netzprüfung') NWT.Workbench.open('checks');
        if (v === 'Sicherungen') NWT.Recovery.open();
      }, view);
      await page.waitForTimeout(400);
      if (['Inventar', 'Netzprüfung', 'Sicherungen'].includes(view)) {
        if (!await page.locator('#modal[open]').count()) throw new Error(view + ' wurde nicht geoeffnet.');
        await page.screenshot({ path: outFile('view-' + view + '-' + theme + '.png') });
      }

      const res = await page.evaluate(probe);
      anyChecked += res.checked;
      problems += res.problems.length;
      const ok = res.problems.length === 0;
      console.log((ok ? '  OK   ' : '  FAIL ') + theme.padEnd(6) + view.padEnd(16) +
        res.checked + ' Elemente geprüft' + (ok ? '' : ', ' + res.problems.length + ' zu schwach'));
      res.problems.slice(0, 8).forEach(p =>
        console.log('         ' + String(p.ratio).padEnd(7) + '(min ' + p.min + ')  ' +
          p.what.padEnd(26) + p.fg + ' auf ' + p.bg + (p.text ? '  „' + p.text + '“' : '')));

      if (view === 'Zeichenfläche') {
        res.svg.forEach(s => console.log('         Kachel  ' + String(s.ratio).padEnd(7) + s.name));
      }
    }
  }

  /* Eine Prüfung, die nichts misst, ist kein bestandener Test. */
  if (anyChecked < 200) {
    console.log('\nFEHLER: nur ' + anyChecked + ' Elemente geprüft — die Messung greift nicht.');
    process.exitCode = 1;
  } else if (problems) {
    console.log('\n' + problems + ' Stelle(n) unter der Schwelle.');
    process.exitCode = 1;
  } else {
    console.log('\nAlle Schriften erreichen die Kontrastschwelle (' + anyChecked + ' Messungen).');
  }

  if (page.nwtErrors.length) {
    console.log('JS-Fehler: ' + page.nwtErrors.join(' | '));
    process.exitCode = 1;
  }
  await browser.close();
})().catch(e => { console.error('ABGEBROCHEN: ' + e.message); process.exitCode = 2; });
