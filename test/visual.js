/* ============================================================
   Sichtprüfung: erzeugt Screenshots der Oberfläche in mehreren
   Fenstergrößen sowie den SVG-Export als eigenständige Datei.

   Aufruf:  node test/visual.js  [--headed]
   Ausgabe: test/output/
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { launch, openApp, outFile, OUT_DIR } = require('./browser');

const VIEWPORTS = [
  { width: 1920, height: 1080, tag: '1920' },
  { width: 1500, height: 950, tag: '1500' },
  { width: 1280, height: 800, tag: '1280' }
];

(async () => {
  const { browser, executablePath } = await launch();
  console.log('Chromium: ' + executablePath + '\n');
  let problems = 0;

  for (const vp of VIEWPORTS) {
    const page = await openApp(browser, { width: vp.width, height: vp.height });
    await page.evaluate(() => NWT.Commands.loadExample());
    await page.waitForTimeout(500);
    await page.evaluate(() => NWT.Viewport.zoomToFit());
    await page.waitForTimeout(400);
    await page.screenshot({ path: outFile('view-' + vp.tag + '.png') });

    /* Läuft die Werkzeugleiste aus dem sichtbaren Bereich? */
    const overflow = await page.evaluate(() => {
      const tb = document.getElementById('toolbar');
      const last = tb.querySelector('[data-act="help-menu"]').getBoundingClientRect();
      return { right: Math.round(last.right), win: window.innerWidth, rows: Math.round(tb.offsetHeight) };
    });
    const ok = overflow.right <= overflow.win;
    if (!ok) problems++;
    console.log((ok ? '  OK   ' : '  FAIL ') + vp.tag + ' px — Werkzeugleiste vollständig sichtbar   [' +
      JSON.stringify(overflow) + ']');

    if (vp.tag === '1500') {
      /* Hinweisfenster an einem Gerät */
      const pos = await page.evaluate(() => {
        const d = NWT.Store.project.devices.find(x => x.ip === '192.168.1.2');
        const c = NWT.Store.deviceCenter(d);
        return NWT.Viewport.worldToScreen(c.x, c.y);
      });
      await page.mouse.move(pos.x - 40, pos.y - 40);
      await page.mouse.move(pos.x, pos.y);
      await page.waitForTimeout(800);
      await page.screenshot({ path: outFile('view-tooltip.png') });
      await page.mouse.move(20, 500);
      await page.waitForTimeout(200);

      /* Gerätefoto + Modellbahn + Dashboard + Symbol-Editor */
      await page.evaluate(async () => {
        const cv = document.createElement('canvas');
        cv.width = 900; cv.height = 560;
        const cx = cv.getContext('2d');
        const grd = cx.createLinearGradient(0, 0, 900, 560);
        grd.addColorStop(0, '#1e293b'); grd.addColorStop(1, '#475569');
        cx.fillStyle = grd; cx.fillRect(0, 0, 900, 560);
        cx.fillStyle = '#0f172a'; cx.fillRect(60, 180, 780, 200);
        cx.fillStyle = '#22c55e';
        for (let i = 0; i < 12; i++) cx.fillRect(110 + i * 62, 250, 34, 18);
        cx.fillStyle = '#e2e8f0'; cx.font = 'bold 42px sans-serif';
        cx.fillText('24-Port Switch', 240, 150);
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        const file = new File([blob], 'switch.png', { type: 'image/png' });
        const dev = NWT.Store.project.devices.find(d => d.type === 'switch_managed');
        await NWT.Images.setFromFile(dev.id, file);

        const ecos = NWT.Interaction.addDeviceAt('mb_ecos', 1080, 470);
        Object.assign(ecos, { name: 'ECoS Zentrale', ip: '192.168.1.60', protocol: 'DCC, mfx, MM2', status: 'active' });
        const pc = NWT.Interaction.addDeviceAt('mb_pc', 1080, 640);
        Object.assign(pc, { name: 'Rocrail-PC', ip: '192.168.1.61', protocol: 'DCC', status: 'active' });
        const booster = NWT.Interaction.addDeviceAt('mb_booster', 1300, 640);
        Object.assign(booster, { name: 'Booster Kreis 2', protocol: 'DCC', status: 'active' });
        NWT.Store.addConnection(NWT.Store.project.devices.find(d => d.type === 'switch_managed').id, ecos.id, 'gigabit');
        NWT.Store.addConnection(ecos.id, pc.id, 'gigabit');
        NWT.Store.addConnection(ecos.id, booster.id, 'serial');
        NWT.Store.clearSelection();
        NWT.emit('change', { structural: true });
      });
      await page.waitForTimeout(400);
      await page.evaluate(() => NWT.Viewport.zoomToFit());
      await page.waitForTimeout(400);
      await page.screenshot({ path: outFile('view-foto-modellbahn.png') });

      await page.evaluate(() => NWT.Dashboard.open('overview'));
      await page.waitForTimeout(500);
      await page.screenshot({ path: outFile('view-dashboard.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);

      /* Dialoge geben ein Promise zurück, das erst beim Schließen auflöst —
         daher nicht zurückgeben, sonst wartet page.evaluate darauf. */
      await page.evaluate(() => { NWT.Symbols.open(); });
      await page.waitForTimeout(400);
      /* Ein paar Formen zeichnen, damit die Vorschau etwas zeigt. */
      const grid = await page.locator('#sym-grid').boundingBox();
      const u = grid.width / 24;
      const click = (x, y) => page.mouse.click(grid.x + x * u, grid.y + y * u);
      await page.click('[data-tool="rect"]');
      await click(3, 7); await click(21, 17);
      await page.click('[data-tool="poly"]');
      await click(7, 7); await click(7, 3); await click(17, 3); await click(17, 7);
      await page.click('[data-act="close-shape"]');
      await page.fill('#sym-label', 'Hutschienen-Netzteil');
      await page.waitForTimeout(300);
      await page.screenshot({ path: outFile('view-symboleditor.png') });
      await page.evaluate(() => NWT.Modal.close(null));
      await page.waitForTimeout(200);

      /* Analyse-Dialog */
      await page.evaluate(() => { NWT.Analysis.pasteDialog(); });
      await page.waitForTimeout(350);
      await page.screenshot({ path: outFile('view-analyse.png') });
      await page.evaluate(() => NWT.Modal.close(null));
      await page.waitForTimeout(200);

      /* Hardware-Ansicht und Einstellungsseite */
      await page.evaluate(() => {
        NWT.Store.project.settings.hardware = true;
        NWT.emit('change', { structural: true });
        NWT.Viewport.zoomToFit();
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: outFile('view-hardware.png') });

      const overlapping = await page.evaluate(() => {
        /* Kollidiert eine Leitungsbeschriftung mit einer Gerätekachel? */
        const labels = Array.from(document.querySelectorAll('.edge-label-bg'));
        const nodes = Array.from(document.querySelectorAll('#l-nodes > g.node'));
        let hits = 0;
        labels.forEach(l => {
          const a = l.getBoundingClientRect();
          if (!a.width) return;
          nodes.forEach(n => {
            const b = n.getBoundingClientRect();
            if (a.left < b.right - 2 && b.left < a.right - 2 &&
                a.top < b.bottom - 2 && b.top < a.bottom - 2) hits++;
          });
        });
        return hits;
      });
      const okOverlap = overlapping === 0;
      if (!okOverlap) problems++;
      console.log((okOverlap ? '  OK   ' : '  FAIL ') +
        'Beispiel: keine Beschriftung über einer Kachel (Hardware-Ansicht)   [' + overlapping + ']');

      /* Verschiedene Verbindungsarten nebeneinander */
      await page.evaluate(() => {
        const S = NWT.Store;
        const sw = S.project.devices.find(d => d.type === 'switch_managed');
        const ecos = S.project.devices.find(d => d.type === 'mb_ecos');
        const mk = (type, x, y, props) => {
          const d = NWT.Interaction.addDeviceAt(type, x, y);
          Object.assign(d, props || {});
          return d;
        };
        const drucker = mk('netprinter', 1560, 380, { name: 'Etikettendrucker', status: 'active' });
        const sps = mk('plc', 1560, 560, { name: 'SPS Halle 1', protocol: 'PROFINET', status: 'active' });
        const sensor = mk('sensor', 1560, 740, { name: 'Temperatursensor', protocol: 'Modbus RTU' });
        const usv = mk('storage', 1560, 920, { name: 'USV Serverraum' });
        const link = (a, b, type) => NWT.Store.addConnection(a.id, b.id, type);
        link(sw, drucker, 'usb3');
        link(sw, sps, 'profinet');
        link(sps, sensor, 'modbus_rtu');
        link(usv, sw, 'ac230');
        link(sw, ecos, 'poe');
        const bt = mk('smartphone', 1330, 920, { name: 'Wartungs-Tablet' });
        link(bt, sps, 'bluetooth');
        S.clearSelection();
        NWT.emit('change', { structural: true });
        NWT.Viewport.zoomToFit();
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: outFile('view-verbindungsarten.png') });

      await page.evaluate(() => { NWT.Settings.open(); });
      await page.waitForTimeout(600);
      await page.screenshot({ path: outFile('view-einstellungen.png') });
      await page.evaluate(() => {
        const el = document.querySelector('#set-overlay .cs-list');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: outFile('view-verbindungsstile.png') });
      await page.evaluate(() => {
        const el = document.querySelector('#set-overlay .set-wide');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: outFile('view-typbilder.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      await page.evaluate(() => {
        NWT.Store.project.settings.hardware = false;
        NWT.emit('change', { structural: true });
        NWT.Viewport.zoomToFit();
      });
      await page.waitForTimeout(300);

      /* Handbuch im Programm */
      await page.click('[data-act="help-menu"]');
      await page.waitForTimeout(150);
      await page.click('#help-menu [data-act="handbook"]');
      await page.waitForTimeout(600);
      await page.screenshot({ path: outFile('view-handbuch.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      await page.evaluate(() => { NWT.Viewport.setZoom(1.6); NWT.Viewport.centerOn(500, 480); });
      await page.waitForTimeout(400);
      await page.screenshot({ path: outFile('view-detail.png'), clip: { x: 250, y: 60, width: 900, height: 620 } });

      /* Text, Grafik und Maskierung — beides betrifft die Darstellung
         und gehört deshalb in die Sichtprüfung. */
      await page.evaluate(() => {
        const rahmen = NWT.Store.addDevice('deco_rect', 430, 380);
        rahmen.w = 460; rahmen.h = 460; rahmen.stroke = '#ea580c';
        rahmen.dash = '6 4'; rahmen.name = 'Abnahme offen';
        const kreis = NWT.Store.addDevice('deco_circle', 900, 300);
        kreis.w = 220; kreis.h = 220; kreis.fill = '#2563eb';
        kreis.opacity = 0.14; kreis.stroke = '#2563eb';
        const pfeil = NWT.Store.addDevice('deco_arrow', 1180, 620);
        pfeil.w = 240; pfeil.h = 40; pfeil.stroke = '#dc2626';
        pfeil.strokeWidth = 3; pfeil.front = true; pfeil.name = 'Engpass';
        const klammer = NWT.Store.addDevice('deco_bracket', 300, 640);
        klammer.w = 34; klammer.h = 260;
        NWT.Store.clearSelection();
        NWT.emit('change', { structural: true });
        NWT.Viewport.zoomToFit();
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: outFile('view-grafik.png') });

      /* Knoten und Abzweig am Beispielnetz zeigen. */
      await page.evaluate(() => {
        const P = NWT.Store.project;
        const c = P.connections.find(x => x.type !== 'ac230') || P.connections[0];
        NWT.Commands.addWaypoint(c.id, { x: 300, y: 300 });
        NWT.Commands.addWaypoint(c.id, { x: 300, y: 200 });
        const c2 = P.connections[2];
        if (c2) NWT.Commands.insertJunction(c2.id, { x: 700, y: 420 });
        NWT.Store.clearSelection();
        NWT.emit('change', { structural: true });
        NWT.Viewport.zoomToFit();
      });
      await page.waitForTimeout(450);
      await page.screenshot({ path: outFile('view-knoten.png') });

      await page.evaluate(() => { NWT.Privacy.set('on', true); });
      await page.waitForTimeout(400);
      await page.screenshot({ path: outFile('view-maskiert.png') });
      await page.evaluate(() => {
        NWT.Privacy.set('on', false);
        NWT.History.undo(); NWT.History.undo(); NWT.History.undo(); NWT.History.undo();
      });
      await page.waitForTimeout(400);

      /* Dunkles Design: Zeichenfläche, Einstellungsseite und Handbuch. Der SVG-Export
         darunter wird bewusst weiterhin im hellen Zustand gezogen — er soll hell bleiben. */
      await page.evaluate(() => { NWT.Viewport.zoomToFit(); NWT.Theme.set('dark'); });
      await page.waitForTimeout(500);
      await page.screenshot({ path: outFile('view-dunkel.png') });

      await page.evaluate(() => { NWT.Setups.createExamples(); NWT.Settings.open(); });
      await page.waitForTimeout(600);
      await page.screenshot({ path: outFile('view-dunkel-einstellungen.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);

      await page.click('[data-act="help-menu"]');
      await page.waitForTimeout(150);
      await page.click('#help-menu [data-act="handbook"]');
      await page.waitForTimeout(600);
      await page.screenshot({ path: outFile('view-dunkel-handbuch.png') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);

      await page.evaluate(() => { NWT.Theme.set('light'); });
      await page.waitForTimeout(350);

      const svg = await page.evaluate(() => NWT.Exchange.buildSvgString());
      const svgPath = outFile('export-check.svg');
      fs.writeFileSync(svgPath, svg, 'utf8');

      const p2 = await browser.newPage({ viewport: { width: 900, height: 950 } });
      await p2.goto('file:///' + svgPath.replace(/\\/g, '/'));
      await p2.waitForTimeout(400);
      await p2.screenshot({ path: outFile('view-svgexport.png') });
      await p2.close();
    }

    if (page.nwtErrors.length) {
      problems++;
      console.log('  FAIL ' + vp.tag + ' px — JS-Fehler: ' + page.nwtErrors.join(' | '));
    }
    await page.close();
  }

  await browser.close();
  console.log('\nScreenshots in ' + path.relative(process.cwd(), OUT_DIR));
  if (problems) process.exitCode = 1;
})().catch(e => {
  console.error('\nSICHTPRÜFUNG ABGEBROCHEN: ' + (e && e.message ? e.message : e));
  process.exitCode = 2;
});
