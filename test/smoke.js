/* ============================================================
   Funktionsprüfung der ausgelieferten Einzeldatei.
   Startet Chromium, lädt netzwerk_topologie_tool.html per file://
   und bedient die Anwendung mit echten Maus- und Tastaturereignissen.

   Aufruf:  node test/smoke.js  [--headed]
   ============================================================ */
'use strict';

const { launch, openApp, outFile, helpUrl } = require('./browser');

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
  console.log((cond ? '  OK   ' : '  FAIL ') + name +
    (extra !== undefined ? '   [' + String(extra).slice(0, 160) + ']' : ''));
}

(async () => {
  const { browser, executablePath } = await launch();
  console.log('Chromium: ' + executablePath + '\n');
  const page = await openApp(browser, { width: 1500, height: 950 });
  const errors = page.nwtErrors;

  /* --- 1. Module vorhanden ------------------------------------------- */
  const mods = await page.evaluate(() => Object.keys(window.NWT || {}));
  check('Module geladen', mods.length > 12, mods.join(','));

  /* --- 2. Geräte erzeugen ------------------------------------------- */
  const added = await page.evaluate(() => {
    const a = NWT.Interaction.addDeviceAt('router', 300, 200);
    const b = NWT.Interaction.addDeviceAt('switch_managed', 300, 400);
    const c = NWT.Interaction.addDeviceAt('server', 600, 400);
    return [a.id, b.id, c.id, a.name, b.name];
  });
  check('3 Geräte erzeugt', added.length === 5 && added[0] === 'dev_001', added.join('|'));
  const nodeCount = await page.locator('#l-nodes > g.node').count();
  check('3 Knoten gerendert', nodeCount === 3, nodeCount);

  /* --- 3. Automatische Nummerierung -------------------------------- */
  await page.evaluate(() => { NWT.Interaction.addDeviceAt('switch_managed', 900, 200); });
  const names = await page.evaluate(() => NWT.Store.project.devices.map(d => d.name));
  check('Auto-Nummerierung', names.filter(n => /^Managed Switch \d$/.test(n)).length === 2, names.join(', '));

  /* --- 4. Katalog vollständig --------------------------------------- */
  const catItems = await page.locator('#catalog .cat-item:not(.cat-new)').count();
  check('Katalog: 72 Komponenten', catItems === 72, catItems);
  const catGroups = await page.locator('#catalog .cat-group').count();
  check('Katalog: 9 Kategorien', catGroups === 9, catGroups);
  const mobra = await page.evaluate(() => NWT.Catalog.typesIn('mobra').length);
  check('Modellbahn-Kategorie mit 15 Komponenten', mobra === 15, mobra);
  const mobraIcons = await page.evaluate(() =>
    NWT.Catalog.typesIn('mobra').filter(id => document.getElementById(NWT.Catalog.type(id).icon)).length);
  check('Alle Modellbahn-Symbole vorhanden', mobraIcons === 15, mobraIcons);

  /* --- 5. Katalogsuche --------------------------------------------- */
  await page.fill('#catalog-search', 'switch');
  await page.waitForTimeout(120);
  const filtered = await page.locator('#catalog .cat-item:not(.cat-new)').count();
  check('Katalogsuche filtert', filtered > 0 && filtered < 59, filtered);
  await page.fill('#catalog-search', '');

  /* --- 6. Verbindungsmodus per Mausklick --------------------------- */
  await page.evaluate(() => NWT.Store.setMode('connect'));
  async function clickDevice(id) {
    const p = await page.evaluate(devId => {
      const d = NWT.Store.dev(devId);
      const c = NWT.Store.deviceCenter(d);
      return NWT.Viewport.worldToScreen(c.x, c.y);
    }, id);
    await page.mouse.click(p.x, p.y);
  }
  await clickDevice('dev_001');
  await clickDevice('dev_002');
  await clickDevice('dev_003');
  await page.keyboard.press('Escape');
  const conns = await page.evaluate(() => NWT.Store.project.connections.map(c => c.source + '->' + c.target));
  check('2 Verbindungen per Klick', conns.length === 2, conns.join(', '));
  const edgeD = await page.locator('#l-edges > g.edge .edge-line').first().getAttribute('d');
  check('Kantenpfad erzeugt', edgeD && edgeD.length > 10, (edgeD || '').slice(0, 40));

  /* --- 7. Gerät verschieben, Leitungen folgen ---------------------- */
  await page.evaluate(() => NWT.Store.setMode('select'));
  const before = await page.evaluate(() => {
    const d = NWT.Store.dev('dev_002');
    return { x: d.x, y: d.y, screen: NWT.Viewport.worldToScreen(d.x + 66, d.y + 44) };
  });
  const edgeBefore = await page.locator('#l-edges > g.edge .edge-line').first().getAttribute('d');
  await page.mouse.move(before.screen.x, before.screen.y);
  await page.mouse.down();
  await page.mouse.move(before.screen.x + 137, before.screen.y + 93, { steps: 8 });
  await page.mouse.up();
  const after = await page.evaluate(() => { const d = NWT.Store.dev('dev_002'); return { x: d.x, y: d.y }; });
  check('Gerät verschoben', after.x !== before.x && after.y !== before.y,
    JSON.stringify(before) + ' -> ' + JSON.stringify(after));
  check('Snap am Raster (20 px)', after.x % 20 === 0 && after.y % 20 === 0, after.x + '/' + after.y);
  const edgeAfter = await page.locator('#l-edges > g.edge .edge-line').first().getAttribute('d');
  check('Leitung folgt dem Gerät', edgeAfter !== edgeBefore);

  /* --- 8. Undo / Redo ---------------------------------------------- */
  await page.keyboard.press('Control+z');
  const undone = await page.evaluate(() => { const d = NWT.Store.dev('dev_002'); return { x: d.x, y: d.y }; });
  check('Undo stellt Position wieder her', undone.x === before.x && undone.y === before.y, JSON.stringify(undone));
  await page.keyboard.press('Control+y');
  const redone = await page.evaluate(() => { const d = NWT.Store.dev('dev_002'); return { x: d.x, y: d.y }; });
  check('Redo wiederholt Verschiebung', redone.x === after.x && redone.y === after.y, JSON.stringify(redone));

  /* --- 9. Ein Drag = ein Undo-Schritt (Coalescing) ----------------- */
  const histLen = await page.evaluate(() => {
    let n = 0;
    while (NWT.History.canUndo() && n < 100) { NWT.History.undo(); n++; }
    return n;
  });
  check('Drag = 1 Undo-Schritt (Coalescing)', histLen <= 8, 'Schritte gesamt: ' + histLen);
  await page.evaluate(() => { while (NWT.History.canRedo()) NWT.History.redo(); });

  /* --- 10. Auswahlrechteck ----------------------------------------- */
  await page.evaluate(() => { NWT.Store.clearSelection(); NWT.Viewport.zoomToFit(); });
  await page.waitForTimeout(200);
  const bb = await page.evaluate(() => {
    const b = NWT.Store.contentBounds(20);
    return { a: NWT.Viewport.worldToScreen(b.x, b.y), c: NWT.Viewport.worldToScreen(b.x + b.w, b.y + b.h) };
  });
  await page.mouse.move(bb.a.x + 2, bb.a.y + 2);
  await page.mouse.down();
  await page.mouse.move(bb.c.x - 2, bb.c.y - 2, { steps: 10 });
  await page.mouse.up();
  const selCount = await page.evaluate(() => NWT.Store.selection.size);
  check('Auswahlrechteck markiert alle 4 Geräte', selCount === 4, selCount);

  /* --- 11. Duplizieren --------------------------------------------- */
  await page.evaluate(() => NWT.Store.select(['dev_001']));
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(100);
  const devCount = await page.evaluate(() => NWT.Store.project.devices.length);
  check('Duplizieren (Strg+D)', devCount === 5, devCount);

  /* --- 12. Löschen entfernt hängende Verbindungen ------------------ */
  await page.evaluate(() => NWT.Store.select(['dev_002']));
  await page.keyboard.press('Delete');
  await page.waitForTimeout(150);
  const afterDel = await page.evaluate(() => ({
    devs: NWT.Store.project.devices.length,
    cons: NWT.Store.project.connections.length,
    domEdges: document.querySelectorAll('#l-edges > g.edge').length
  }));
  check('Gerät gelöscht', afterDel.devs === 4, afterDel.devs);
  check('Verbindungen mitgelöscht', afterDel.cons === 0 && afterDel.domEdges === 0, JSON.stringify(afterDel));
  await page.evaluate(() => NWT.History.undo());

  /* --- 13. Beispielprojekt ---------------------------------------- */
  await page.evaluate(() => NWT.Commands.loadExample());
  await page.waitForTimeout(150);
  const okDlg = page.getByRole('button', { name: 'Verwerfen', exact: true });
  if (await okDlg.count()) { await okDlg.click(); await page.waitForTimeout(250); }
  const ex = await page.evaluate(() => ({
    name: NWT.Store.project.name,
    devs: NWT.Store.project.devices.length,
    cons: NWT.Store.project.connections.length,
    areas: NWT.Store.project.areas.length,
    domNodes: document.querySelectorAll('#l-nodes > g.node').length,
    domEdges: document.querySelectorAll('#l-edges > g.edge').length
  }));
  check('Beispielnetzwerk geladen', ex.devs === 8 && ex.cons === 7 && ex.areas === 1, JSON.stringify(ex));
  check('Beispiel gerendert', ex.domNodes === 8 && ex.domEdges === 7, JSON.stringify(ex));

  /* --- 14. Beschriftungen ----------------------------------------- */
  const labelText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.edge-label-tx')).map(t => t.textContent).filter(Boolean));
  check('Verbindungsbeschriftungen gerendert', labelText.length >= 7, labelText.slice(0, 3).join(' | '));
  const portText = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.edge-port')).map(t => t.textContent).filter(Boolean).length);
  check('Portbeschriftungen gerendert', portText >= 10, portText);

  /* --- 15. Zoom ---------------------------------------------------- */
  const z1 = await page.evaluate(() => NWT.Store.project.settings.zoom);
  await page.keyboard.press('Control+Equal');
  const z2 = await page.evaluate(() => NWT.Store.project.settings.zoom);
  check('Zoom + funktioniert', z2 > z1, z1 + ' -> ' + z2);
  await page.evaluate(() => NWT.Viewport.resetZoom());
  const z3 = await page.evaluate(() => NWT.Store.project.settings.zoom);
  check('Zoom zurücksetzen = 1', Math.abs(z3 - 1) < 1e-9, z3);

  const zoomAnchor = await page.evaluate(() => {
    const b = NWT.Viewport.screenToWorld(700, 500);
    NWT.Viewport.zoomAt(1.7, 700, 500);
    const a = NWT.Viewport.screenToWorld(700, 500);
    return { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y) };
  });
  check('Zoom hält den Punkt unter dem Cursor', zoomAnchor.dx < 0.01 && zoomAnchor.dy < 0.01, JSON.stringify(zoomAnchor));
  await page.evaluate(() => NWT.Viewport.zoomToFit());

  /* --- 16. Ablageposition bei Zoom != 1 --------------------------- */
  const dropTest = await page.evaluate(() => {
    NWT.Viewport.zoomAt(0.6, 800, 500);
    const w = NWT.Viewport.screenToWorld(800, 500);
    const d = NWT.Interaction.addDeviceAt('pc', w.x, w.y);
    const back = NWT.Viewport.worldToScreen(d.x + 66, d.y + 44);
    return { dx: Math.abs(back.x - 800), dy: Math.abs(back.y - 500), zoom: NWT.Store.project.settings.zoom };
  });
  check('Ablageposition korrekt bei Zoom≠1', dropTest.dx <= 20 && dropTest.dy <= 20, JSON.stringify(dropTest));
  await page.evaluate(() => {
    NWT.Commands.deleteIds([NWT.Store.project.devices.slice(-1)[0].id]);
    NWT.Viewport.zoomToFit();
  });

  /* --- 17. JSON Round-Trip ---------------------------------------- */
  const round = await page.evaluate(() => {
    const json = JSON.stringify(NWT.Model.serialize(NWT.Store.project));
    const res = NWT.Model.validate(JSON.parse(json));
    return {
      warnings: res.warnings.length,
      devs: res.project.devices.length,
      cons: res.project.connections.length,
      areas: res.project.areas.length,
      ports: res.project.devices[3] ? res.project.devices[3].ports.length : -1,
      layers: res.project.layers.length
    };
  });
  check('JSON Round-Trip verlustfrei',
    round.devs === 8 && round.cons === 7 && round.areas === 1 && round.warnings === 0, JSON.stringify(round));

  /* --- 18. Robustheit gegen kaputte Importdaten ------------------- */
  const bad = await page.evaluate(() => {
    const out = {};
    try { NWT.Model.validate(null); out.nullThrows = false; } catch (e) { out.nullThrows = true; }
    try { NWT.Model.validate({ devices: 'nope' }); out.badDevices = false; } catch (e) { out.badDevices = true; }
    const res = NWT.Model.validate({
      name: 'Kaputt',
      devices: [{ id: 'dev_1', type: 'gibtsnicht', x: 10, y: 10 }],
      connections: [{ id: 'con_1', source: 'dev_1', target: 'fehlt' },
                    { id: 'con_2', source: 'dev_1', target: 'dev_1' }]
    });
    out.warn = res.warnings.length;
    out.cons = res.project.connections.length;
    out.type = res.project.devices[0].type;
    return out;
  });
  check('Import: null/kaputte Struktur wirft sauber', bad.nullThrows && bad.badDevices, JSON.stringify(bad));
  check('Import: ungültige Verbindungen verworfen + gemeldet', bad.cons === 0 && bad.warn >= 2, JSON.stringify(bad));
  check('Import: unbekannter Gerätetyp ersetzt', bad.type === 'pc', bad.type);

  /* --- 19. localStorage ------------------------------------------- */
  const store = await page.evaluate(() => {
    const ok = NWT.Persistence.saveProject('Testprojekt Labor');
    const list = NWT.Persistence.listProjects();
    const loaded = NWT.Persistence.loadProject(list[0].id);
    return { ok, count: list.length, name: loaded.project.name, devs: loaded.project.devices.length };
  });
  check('localStorage speichern/laden', store.ok && store.count === 1 && store.devs === 8, JSON.stringify(store));

  /* --- 20. SVG-Export -------------------------------------------- */
  const svg = await page.evaluate(() => NWT.Exchange.buildSvgString());
  check('SVG-Export erzeugt Dokument', /^<\?xml/.test(svg) && svg.indexOf('</svg>') > 0, svg.length + ' Zeichen');
  check('SVG enthält Icon-Symbole (defs)', svg.indexOf('<symbol') > 0 && svg.indexOf('ic-router') > 0);
  check('SVG enthält eingebettetes CSS', svg.indexOf('.node-box') > 0);
  const svgMarkup = svg.slice(svg.indexOf('</style>'));
  check('SVG-Markup ohne Auswahl-/Hilfselemente',
    svgMarkup.indexOf('node-halo') < 0 && svgMarkup.indexOf('edge-hit') < 0 &&
    svgMarkup.indexOf('class="sel') < 0 && svgMarkup.indexOf('area-handle') < 0);
  const useCount = (svg.match(/<use/g) || []).length;
  check('SVG: alle Geräte-Icons referenziert', useCount === 8, useCount);

  const svgOk = await page.evaluate(async (s) => {
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
    return await new Promise(res => {
      const img = new Image();
      img.onload = () => res({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res({ ok: false });
      img.src = url;
    });
  }, svg);
  check('SVG im Browser darstellbar (PNG-Pfad)', svgOk.ok && svgOk.w > 100, JSON.stringify(svgOk));

  /* --- 21. Ebenen ------------------------------------------------- */
  const layerTest = await page.evaluate(() => {
    const l = NWT.Store.project.layers[0];
    l.visible = false;
    NWT.emit('change', { structural: true });
    const hidden = Array.from(document.querySelectorAll('#l-nodes > g.node'))
      .filter(el => el.style.display === 'none').length;
    l.visible = true;
    NWT.emit('change', { structural: true });
    const shown = Array.from(document.querySelectorAll('#l-nodes > g.node'))
      .filter(el => el.style.display === 'none').length;
    return { hidden, shown };
  });
  check('Ebene ausblenden/einblenden', layerTest.hidden === 8 && layerTest.shown === 0, JSON.stringify(layerTest));

  /* --- 22. Gerätesuche ------------------------------------------- */
  await page.fill('#device-search', 'nas');
  await page.waitForTimeout(120);
  const srCount = await page.locator('#search-results .sr-item').count();
  check('Suche findet Gerät', srCount >= 1, srCount);
  await page.locator('#search-results .sr-item').first().click();
  const searchSel = await page.evaluate(() => Array.from(NWT.Store.selection));
  check('Suche markiert den Treffer', searchSel.length === 1, searchSel.join());
  await page.fill('#device-search', '');

  /* --- 23. Kontextmenü ------------------------------------------- */
  const nasPos = await page.evaluate(() => {
    const d = NWT.Store.project.devices.find(x => x.type === 'nas');
    const c = NWT.Store.deviceCenter(d);
    return NWT.Viewport.worldToScreen(c.x, c.y);
  });
  await page.mouse.click(nasPos.x, nasPos.y, { button: 'right' });
  await page.waitForTimeout(120);
  const ctxVisible = await page.locator('#contextmenu:not([hidden]) button').count();
  check('Kontextmenü öffnet', ctxVisible >= 5, ctxVisible);
  await page.keyboard.press('Escape');

  /* --- 24. Geräteeigenschaften per Doppelklick ------------------- */
  await page.mouse.dblclick(nasPos.x, nasPos.y);
  await page.waitForTimeout(200);
  const dlgOpen = await page.evaluate(() => document.getElementById('modal').open);
  const fieldCount = await page.locator('#modal .field').count();
  check('Doppelklick öffnet Geräteeigenschaften', dlgOpen === true, dlgOpen);
  check('Dialog enthält alle Dokumentationsfelder', fieldCount >= 17, fieldCount);
  await page.fill('#modal [name="ip"]', '10.10.10.99');
  await page.fill('#modal [name="name"]', 'NAS Umbenannt');
  await page.locator('#modal .btn.primary').click();
  await page.waitForTimeout(200);
  const edited = await page.evaluate(() => {
    const d = NWT.Store.project.devices.find(x => x.type === 'nas');
    const el = document.querySelector('[data-id="' + d.id + '"] .node-name');
    return { ip: d.ip, name: d.name, dom: el ? el.textContent : null };
  });
  check('Eigenschaften gespeichert und gerendert',
    edited.ip === '10.10.10.99' && edited.name === 'NAS Umbenannt' && edited.dom === 'NAS Umbenannt',
    JSON.stringify(edited));

  /* --- 25. Verbindungsdialog mit Portauswahl --------------------- */
  await page.evaluate(() => NWT.Viewport.zoomToFit());
  await page.waitForTimeout(250);
  const edgePos = await page.evaluate(() => {
    const line = document.querySelector('#l-edges > g.edge .edge-line');
    const p = line.getPointAtLength(line.getTotalLength() / 2);
    const st = NWT.Store.project.settings;
    const r = document.getElementById('canvas').getBoundingClientRect();
    return { x: p.x * st.zoom + st.panX + r.left, y: p.y * st.zoom + st.panY + r.top };
  });
  await page.mouse.dblclick(edgePos.x, edgePos.y);
  await page.waitForTimeout(200);
  const portOpts = await page.locator('#modal [name="sourcePort"] option').count();
  const dlgTitle = await page.evaluate(() => {
    const h = document.querySelector('#modal .dlg-head h2');
    return (document.getElementById('modal').open ? 'offen: ' : 'zu: ') + (h ? h.textContent : '—');
  });
  check('Verbindungsdialog listet Ports', portOpts >= 2, portOpts + ' · ' + dlgTitle);
  await page.locator('#modal .btn').first().click();
  await page.waitForTimeout(150);
  await page.evaluate(() => NWT.Modal.close(null));

  /* --- 26. Bereich aus Auswahl ---------------------------------- */
  await page.evaluate(() => {
    NWT.Store.select(NWT.Store.project.devices.slice(0, 3).map(d => d.id));
    NWT.Commands.groupSelection();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => NWT.Modal.close(null));
  const areaCount = await page.evaluate(() => NWT.Store.project.areas.length);
  check('Bereich aus Auswahl erzeugt', areaCount === 2, areaCount);

  /* --- 27. Linienführung ---------------------------------------- */
  for (const mode of ['straight', 'curved', 'orthogonal']) {
    const d = await page.evaluate(m => {
      NWT.Store.project.settings.routing = m;
      NWT.emit('change', { structural: true });
      return document.querySelector('#l-edges > g.edge .edge-line').getAttribute('d');
    }, mode);
    check('Routing "' + mode + '" liefert Pfad', d && d.length > 8, (d || '').slice(0, 30));
  }

  /* --- 28. Parallele Verbindungen versetzt ---------------------- */
  const parallel = await page.evaluate(() => {
    const ds = NWT.Store.project.devices;
    NWT.Store.addConnection(ds[3].id, ds[5].id);
    NWT.Store.addConnection(ds[3].id, ds[5].id);
    NWT.emit('change', { structural: true });
    const key = [ds[3].id, ds[5].id].sort().join('|');
    return NWT.Store.project.connections
      .filter(c => [c.source, c.target].sort().join('|') === key)
      .map(c => NWT.Store.index.parallel.get(c.id));
  });
  check('Parallele Leitungen versetzt gezeichnet',
    new Set(parallel).size === parallel.length && parallel.length >= 2, JSON.stringify(parallel));

  /* --- 29. Zeichenfläche leeren --------------------------------- */
  await page.evaluate(() => NWT.Commands.clearCanvas());
  await page.waitForTimeout(150);
  const dlgText = await page.locator('#modal .msg-body').textContent();
  check('Sicherheitsabfrage vor dem Leeren',
    /Möchten Sie wirklich alle Geräte und Verbindungen löschen\?/.test(dlgText), dlgText);
  await page.locator('#modal .btn.danger').click();
  await page.waitForTimeout(200);
  const cleared = await page.evaluate(() => ({
    d: NWT.Store.project.devices.length, c: NWT.Store.project.connections.length,
    dom: document.querySelectorAll('#l-nodes > g.node').length
  }));
  check('Zeichenfläche geleert', cleared.d === 0 && cleared.c === 0 && cleared.dom === 0, JSON.stringify(cleared));
  await page.evaluate(() => NWT.History.undo());
  const restored = await page.evaluate(() => NWT.Store.project.devices.length);
  check('Leeren ist rückgängig machbar', restored === 8, restored);

  /* --- 30. Autosave über einen Reload hinweg -------------------- */
  await page.evaluate(() => { NWT.Store.project.name = 'Autosave-Test'; NWT.Persistence.autosave.flush(); });
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(600);
  const afterReload = await page.evaluate(() => ({
    name: NWT.Store.project.name,
    devs: NWT.Store.project.devices.length,
    dom: document.querySelectorAll('#l-nodes > g.node').length
  }));
  check('Autosave nach Reload wiederhergestellt',
    afterReload.name === 'Autosave-Test' && afterReload.devs === 8 && afterReload.dom === 8,
    JSON.stringify(afterReload));

  /* --- 31. Textfeld und Notiz ---------------------------------- */
  const special = await page.evaluate(() => {
    const t = NWT.Interaction.addDeviceAt('text', 200, 900);
    const n = NWT.Interaction.addDeviceAt('note', 500, 900);
    t.name = 'Standort München';
    n.name = 'Wartungsfenster jeden ersten Sonntag im Monat ab 02:00 Uhr.';
    NWT.emit('change', { structural: true });
    return {
      tspans: document.querySelectorAll('[data-id="' + n.id + '"] tspan').length,
      textNode: document.querySelector('[data-id="' + t.id + '"] .nt-body').textContent
    };
  });
  check('Textfeld gerendert', special.textNode === 'Standort München', special.textNode);
  check('Notiz mit Zeilenumbruch gerendert', special.tspans >= 3, special.tspans);

  /* --- 32. Druckvorbereitung ---------------------------------- */
  const printOk = await page.evaluate(() => {
    try {
      window.dispatchEvent(new Event('beforeprint'));
      window.dispatchEvent(new Event('afterprint'));
      return true;
    } catch (e) { return String(e); }
  });
  check('Druckvorbereitung fehlerfrei', printOk === true, printOk);

  /* --- 33. Minimap -------------------------------------------- */
  const mm = await page.locator('#mm-content rect').count();
  check('Minimap zeichnet Objekte', mm > 5, mm);

  /* --- 34. Hinweisfenster (Tooltips) --------------------------- */
  await page.hover('[data-act="save"]');
  await page.waitForTimeout(700);
  const tipBtn = await page.evaluate(() => {
    const t = document.getElementById('tooltip');
    const title = t.querySelector('.tt-title');
    const kbd = t.querySelector('kbd');
    return { hidden: t.hidden, title: title && title.textContent, key: kbd && kbd.textContent };
  });
  check('Tooltip an der Werkzeugleiste', !tipBtn.hidden && /Projekt speichern/.test(tipBtn.title || '') &&
    tipBtn.key === 'Strg+S', JSON.stringify(tipBtn));

  const nativeTitle = await page.evaluate(() =>
    document.querySelector('[data-act="save"]').hasAttribute('title'));
  check('Natives title-Attribut abgelöst (kein Doppel-Tooltip)', nativeTitle === false, nativeTitle);

  await page.locator('#catalog .cat-item').first().hover();
  await page.waitForTimeout(500);
  const tipCat = await page.evaluate(() => document.getElementById('tooltip').textContent);
  check('Tooltip an einer Katalogkachel', /Router/.test(tipCat) && /Kategorie/.test(tipCat) && /Ports/.test(tipCat),
    tipCat.slice(0, 90));

  await page.evaluate(() => NWT.Viewport.zoomToFit());
  await page.waitForTimeout(250);
  const srvPos = await page.evaluate(() => {
    const d = NWT.Store.project.devices.find(x => x.ip === '192.168.1.10');
    const c = NWT.Store.deviceCenter(d);
    return NWT.Viewport.worldToScreen(c.x, c.y);
  });
  await page.mouse.move(srvPos.x - 30, srvPos.y - 30);
  await page.mouse.move(srvPos.x, srvPos.y);
  await page.waitForTimeout(700);
  const tipDev = await page.evaluate(() => document.getElementById('tooltip').textContent);
  check('Tooltip am Gerät zeigt Dokumentationsdaten',
    /Server 1/.test(tipDev) && /192\.168\.1\.10/.test(tipDev) && /srv01/.test(tipDev) && /Ports/.test(tipDev),
    tipDev.slice(0, 110));

  /* Abschalten */
  await page.uncheck('#opt-tips');
  await page.mouse.move(10, 400);
  await page.hover('[data-act="load"]');
  await page.waitForTimeout(700);
  const tipOff = await page.evaluate(() => document.getElementById('tooltip').hidden);
  check('Tooltips abschaltbar', tipOff === true, tipOff);

  /* Einstellung überlebt den Neustart und reist nicht im Projekt mit */
  const inProject = await page.evaluate(() =>
    JSON.stringify(NWT.Model.serialize(NWT.Store.project)).indexOf('tooltip') >= 0);
  check('Tooltip-Einstellung nicht im Projekt gespeichert', inProject === false, inProject);

  await page.reload();
  await page.waitForTimeout(600);
  const prefKept = await page.evaluate(() => ({
    box: document.getElementById('opt-tips').checked,
    api: NWT.Tooltip.isEnabled()
  }));
  check('Tooltip-Einstellung bleibt nach Neustart erhalten',
    prefKept.box === false && prefKept.api === false, JSON.stringify(prefKept));
  await page.check('#opt-tips');

  /* --- 35. Ausführliches Handbuch im Programm ------------------ */
  await page.click('[data-act="help-menu"]');
  await page.waitForTimeout(150);
  const menuItems = await page.locator('#help-menu:not([hidden]) button').count();
  check('Hilfemenü öffnet', menuItems === 3, menuItems);
  await page.click('#help-menu [data-act="handbook"]');
  await page.waitForTimeout(400);
  const menuClosed = await page.evaluate(() => document.getElementById('help-menu').hidden);
  check('Menü schließt nach Auswahl', menuClosed === true, menuClosed);
  const hb = await page.evaluate(() => {
    const o = document.getElementById('help-overlay');
    return {
      open: !!o && o.classList.contains('on'),
      chapters: o ? o.querySelectorAll('.help-toc a.lvl2').length : 0,
      subs: o ? o.querySelectorAll('.help-toc a.lvl3').length : 0,
      sections: o ? o.querySelectorAll('.help-main section').length : 0,
      tables: o ? o.querySelectorAll('.help-main table').length : 0
    };
  });
  check('Handbuch öffnet im Programm', hb.open === true, JSON.stringify(hb));
  check('Inhaltsverzeichnis vollständig (23 Kapitel)',
    hb.chapters === 23 && hb.subs > 65 && hb.sections === 23, JSON.stringify(hb));

  await page.click('#help-overlay .help-toc a[href="#k12"]');
  await page.waitForTimeout(700);
  const jumped = await page.evaluate(() => {
    const main = document.querySelector('#help-overlay .help-main');
    const el = document.getElementById('k12');
    return {
      scrollTop: Math.round(main.scrollTop),
      delta: Math.round(el.getBoundingClientRect().top - main.getBoundingClientRect().top),
      active: (document.querySelector('#help-overlay .help-toc a.on') || {}).getAttribute
        ? document.querySelector('#help-overlay .help-toc a.on').getAttribute('href') : null
    };
  });
  check('Sprung über das Inhaltsverzeichnis', jumped.scrollTop > 200 && Math.abs(jumped.delta) < 40,
    JSON.stringify(jumped));
  check('Aktuelles Kapitel im Verzeichnis markiert', jumped.active === '#k12', jumped.active);

  await page.fill('#help-overlay .help-search', 'VLAN');
  await page.waitForTimeout(350);
  const hsearch = await page.evaluate(() => ({
    shown: Array.from(document.querySelectorAll('#help-overlay .help-main section'))
      .filter(s => s.style.display !== 'none').length,
    hiddenLinks: document.querySelectorAll('#help-overlay .help-toc a.hidden').length,
    marks: document.querySelectorAll('#help-overlay mark.hit').length
  }));
  check('Handbuchsuche filtert und hebt Treffer hervor',
    hsearch.marks > 5 && hsearch.hiddenLinks > 0 && hsearch.shown > 0 && hsearch.shown < 23,
    JSON.stringify(hsearch));

  await page.fill('#help-overlay .help-search', '');
  await page.waitForTimeout(300);
  const hreset = await page.evaluate(() => ({
    shown: Array.from(document.querySelectorAll('#help-overlay .help-main section'))
      .filter(s => s.style.display !== 'none').length,
    marks: document.querySelectorAll('#help-overlay mark.hit').length,
    hiddenLinks: document.querySelectorAll('#help-overlay .help-toc a.hidden').length
  }));
  check('Handbuchsuche vollständig zurückgesetzt',
    hreset.shown === 23 && hreset.marks === 0 && hreset.hiddenLinks === 0, JSON.stringify(hreset));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const hbClosed = await page.evaluate(() =>
    document.getElementById('help-overlay').classList.contains('on'));
  check('Handbuch schließt mit Esc', hbClosed === false, hbClosed);

  /* --- 36. Eigenständige hilfe.html ---------------------------- */
  const helpPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const helpErrors = [];
  helpPage.on('pageerror', e => helpErrors.push('pageerror: ' + e.message));
  helpPage.on('console', m => { if (m.type() === 'error') helpErrors.push('console: ' + m.text()); });
  await helpPage.goto(helpUrl());
  await helpPage.waitForTimeout(400);
  const standalone = await helpPage.evaluate(() => ({
    chapters: document.querySelectorAll('.help-toc a.lvl2').length,
    subs: document.querySelectorAll('.help-toc a.lvl3').length,
    sections: document.querySelectorAll('.help-main section').length,
    title: document.title,
    link: !!document.querySelector('a[href="netzwerk_topologie_tool.html"]')
  }));
  check('hilfe.html eigenständig lauffähig',
    standalone.chapters === 23 && standalone.sections === 23 && standalone.link === true,
    JSON.stringify(standalone));

  await helpPage.click('.help-toc a[href="#k9-3"]');
  await helpPage.waitForTimeout(700);
  const standaloneJump = await helpPage.evaluate(() => {
    const main = document.querySelector('.help-main');
    const el = document.getElementById('k9-3');
    return Math.round(el.getBoundingClientRect().top - main.getBoundingClientRect().top);
  });
  check('hilfe.html: Sprung zum Unterabschnitt', Math.abs(standaloneJump) < 40, standaloneJump);

  await helpPage.fill('.help-search', 'Portbelegung');
  await helpPage.waitForTimeout(350);
  const standaloneSearch = await helpPage.evaluate(() =>
    document.querySelectorAll('mark.hit').length);
  check('hilfe.html: Volltextsuche findet Treffer', standaloneSearch > 0, standaloneSearch);
  check('hilfe.html ohne JS-Fehler', helpErrors.length === 0, helpErrors.join(' | '));
  await helpPage.screenshot({ path: outFile('handbuch.png'), fullPage: false });
  await helpPage.close();

  /* --- 37. Gerätefotos ---------------------------------------- */
  const photoRes = await page.evaluate(async () => {
    /* Testbild im Browser erzeugen und wie eine Datei behandeln. */
    const cv = document.createElement('canvas');
    cv.width = 1400; cv.height = 900;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#334155'; cx.fillRect(0, 0, 1400, 900);
    cx.fillStyle = '#f59e0b'; cx.fillRect(200, 150, 1000, 600);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const file = new File([blob], 'geraet.png', { type: 'image/png' });
    const dev = NWT.Store.project.devices.find(d => d.type === 'switch_managed');
    await NWT.Images.setFromFile(dev.id, file);
    const el = document.querySelector('[data-id="' + dev.id + '"] .node-photo');
    return {
      hasImage: /^data:image\/jpeg/.test(dev.image || ''),
      kb: Math.round((dev.image.length - dev.image.indexOf(',') - 1) * 0.75 / 1024),
      shown: el && el.style.display !== 'none' && !!el.getAttribute('href'),
      rectH: NWT.Store.deviceRect(dev).h,
      id: dev.id
    };
  });
  check('Foto übernommen und verkleinert',
    photoRes.hasImage && photoRes.kb > 0 && photoRes.kb < 120, JSON.stringify(photoRes));
  check('Fotostreifen auf der Kachel', photoRes.shown === true && photoRes.rectH === 108,
    JSON.stringify(photoRes));

  const photoRound = await page.evaluate(id => {
    const json = JSON.stringify(NWT.Model.serialize(NWT.Store.project));
    const back = NWT.Model.validate(JSON.parse(json)).project;
    const d = back.devices.find(x => x.id === id);
    return { kept: /^data:image\//.test(d.image || ''), bytes: json.length };
  }, photoRes.id);
  check('Foto übersteht JSON-Round-Trip', photoRound.kept === true, JSON.stringify(photoRound));

  const svgWithPhoto = await page.evaluate(() => NWT.Exchange.buildSvgString());
  check('SVG-Export enthält das Foto und den Zuschnitt',
    svgWithPhoto.indexOf('data:image/jpeg') > 0 && svgWithPhoto.indexOf('clip-node-photo') > 0);

  const photoOff = await page.evaluate(() => {
    NWT.Store.project.settings.photos = false;
    NWT.emit('change', { structural: true });
    const d = NWT.Store.project.devices.find(x => x.type === 'switch_managed');
    const h = NWT.Store.deviceRect(d).h;
    NWT.Store.project.settings.photos = true;
    NWT.emit('change', { structural: true });
    return { h: h, kept: !!d.image };
  });
  check('Fotoanzeige abschaltbar, Bild bleibt erhalten',
    photoOff.h === 88 && photoOff.kept === true, JSON.stringify(photoOff));

  /* --- 37b. Hardware-Ansicht und Typbilder -------------------- */
  const hwView = await page.evaluate(() => {
    NWT.Store.project.settings.photos = false;
    NWT.Store.project.settings.hardware = true;
    NWT.emit('change', { structural: true });
    const d = NWT.Store.project.devices.find(x => x.type === 'router');
    const el = document.querySelector('[data-id="' + d.id + '"] .node-hw');
    const strip = NWT.Store.stripFor(d);
    const res = {
      kind: strip && strip.kind, href: strip && strip.href,
      shown: el && el.style.display !== 'none',
      h: NWT.Store.deviceRect(d).h,
      inDefs: !!document.getElementById('hw-router'),
      count: Object.keys(NWT.Catalog.HARDWARE).length
    };
    NWT.Store.project.settings.photos = true;
    NWT.emit('change', { structural: true });
    return res;
  });
  check('Hardware-Ansicht wird gezeichnet',
    hwView.kind === 'symbol' && hwView.href === '#hw-router' && hwView.shown &&
    hwView.h === 108 && hwView.inDefs, JSON.stringify(hwView));

  const priority = await page.evaluate(() => {
    const sw = NWT.Store.project.devices.find(x => x.type === 'switch_managed');
    const pc = NWT.Store.project.devices.find(x => x.type === 'pc');
    if (!NWT.Store.project.typeImages) NWT.Store.project.typeImages = {};
    NWT.Store.project.typeImages.pc =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    NWT.emit('change', { structural: true });
    return {
      geraetefoto: NWT.Store.stripFor(sw).kind,        // hat eigenes Foto
      typbild: NWT.Store.stripFor(pc).href.slice(0, 14) // hat Typbild
    };
  });
  check('Reihenfolge Foto → Typbild → Hardware',
    priority.geraetefoto === 'image' && priority.typbild === 'data:image/png',
    JSON.stringify(priority));

  const hwRound = await page.evaluate(() => {
    const json = JSON.stringify(NWT.Model.serialize(NWT.Store.project));
    const back = NWT.Model.validate(JSON.parse(json)).project;
    const svg = NWT.Exchange.buildSvgString();
    return {
      typeImages: Object.keys(back.typeImages || {}).length,
      hardware: back.settings.hardware === true,
      svgHasHw: svg.indexOf('hw-router') > 0
    };
  });
  check('Typbilder und Hardware-Ansicht überstehen Export/Import',
    hwRound.typeImages === 1 && hwRound.hardware && hwRound.svgHasHw, JSON.stringify(hwRound));

  /* --- 37a. Design (hell / dunkel / automatisch) -------------- */
  const themeStart = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    mode: NWT.Theme.get()
  }));
  check('Startet im hellen Design', themeStart.attr === 'light' && themeStart.mode === 'light',
    JSON.stringify(themeStart));

  const themeDark = await page.evaluate(() => {
    NWT.Theme.set('dark');
    const cs = getComputedStyle(document.documentElement);
    return {
      attr: document.documentElement.getAttribute('data-theme'),
      bg: cs.getPropertyValue('--bg').trim(),
      ink: cs.getPropertyValue('--ink').trim(),
      nodeFill: getComputedStyle(document.querySelector('.node-box')).fill,
      nameFill: getComputedStyle(document.querySelector('.node-name')).fill
    };
  });
  check('Dunkles Design färbt Oberfläche und Kacheln',
    themeDark.attr === 'dark' && themeDark.bg === '#0d1219' &&
    themeDark.nodeFill === 'rgb(26, 35, 49)' && themeDark.nameFill === 'rgb(232, 238, 248)',
    JSON.stringify(themeDark));

  /* Export und Druck müssen hell bleiben — sonst ist der Plan auf Papier unbrauchbar. */
  const darkExport = await page.evaluate(() => {
    const svg = NWT.Exchange.buildSvgString();
    const css = svg.slice(svg.indexOf('<style'), svg.indexOf('</style>'));
    return {
      weißerGrund: svg.indexOf('fill="#ffffff"') > 0,
      keinDarkCss: css.indexOf('data-theme') < 0,
      nodeBoxHell: /\.node-box\{fill:#fff/.test(css.replace(/\s/g, ''))
    };
  });
  check('SVG-Export bleibt hell, auch im dunklen Design',
    darkExport.weißerGrund && darkExport.keinDarkCss && darkExport.nodeBoxHell,
    JSON.stringify(darkExport));

  const printTheme = await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const during = document.documentElement.getAttribute('data-theme');
    window.dispatchEvent(new Event('afterprint'));
    return { during: during, after: document.documentElement.getAttribute('data-theme') };
  });
  check('Druck erzwingt helles Design und stellt es zurück',
    printTheme.during === 'light' && printTheme.after === 'dark', JSON.stringify(printTheme));

  const themeCycle = await page.evaluate(() => {
    NWT.Theme.set('light');
    const a = NWT.Theme.cycle();
    const b = NWT.Theme.cycle();
    const c = NWT.Theme.cycle();
    return [a, b, c];
  });
  check('Design läuft reihum hell → dunkel → automatisch',
    themeCycle.join(',') === 'dark,auto,light', themeCycle.join(','));

  const themePersist = await page.evaluate(() => {
    NWT.Theme.set('dark');
    return {
      inPrefs: JSON.parse(localStorage.getItem('nwt.prefs') || '{}').theme,
      inProject: JSON.stringify(NWT.Model.serialize(NWT.Store.project)).indexOf('"theme"') >= 0
    };
  });
  check('Design liegt am Arbeitsplatz, nicht im Projekt',
    themePersist.inPrefs === 'dark' && themePersist.inProject === false, JSON.stringify(themePersist));

  await page.reload();
  await page.waitForTimeout(600);
  const themeAfterReload = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'));
  check('Design überlebt den Neustart', themeAfterReload === 'dark', themeAfterReload);
  await page.evaluate(() => { NWT.Theme.set('light'); });

  /* --- 37a2. Setups ------------------------------------------- */
  const setupsMade = await page.evaluate(() => {
    const made = NWT.Setups.createExamples();
    return { made: made, names: NWT.Setups.names() };
  });
  check('Beispiel-Setups angelegt',
    setupsMade.made.length === 4 && setupsMade.names.length === 4 &&
    setupsMade.names.indexOf('Präsentation') >= 0, JSON.stringify(setupsMade.names));

  const setupApply = await page.evaluate(() => {
    NWT.Store.project.settings.grid = true;
    NWT.Store.project.settings.hardware = false;
    NWT.Theme.set('light');
    NWT.Tooltip.setEnabled(true);
    NWT.Setups.apply('Präsentation');
    return {
      grid: NWT.Store.project.settings.grid,
      hardware: NWT.Store.project.settings.hardware,
      minimap: NWT.Store.project.settings.minimap,
      theme: NWT.Theme.get(),
      tips: NWT.Tooltip.isEnabled(),
      active: NWT.Setups.active()
    };
  });
  check('Setup „Präsentation“ schaltet Ansicht, Design und Tipps um',
    setupApply.grid === false && setupApply.hardware === true && setupApply.minimap === false &&
    setupApply.theme === 'dark' && setupApply.tips === false &&
    setupApply.active === 'Präsentation', JSON.stringify(setupApply));

  const setupUndo = await page.evaluate(() => {
    NWT.History.undo();
    return { grid: NWT.Store.project.settings.grid, hardware: NWT.Store.project.settings.hardware };
  });
  check('Setup-Wechsel ist ein einziger Undo-Schritt',
    setupUndo.grid === true && setupUndo.hardware === false, JSON.stringify(setupUndo));

  const setupRound = await page.evaluate(() => {
    NWT.Setups.apply('Druck');
    const beforeName = NWT.Setups.active();
    NWT.Setups.save('Mein Setup');
    const captured = NWT.Setups.all()['Mein Setup'];
    NWT.Setups.rename('Mein Setup', 'Feldarbeit');
    const renamed = NWT.Setups.names().indexOf('Feldarbeit') >= 0;
    NWT.Setups.remove('Feldarbeit');
    return {
      beforeName: beforeName,
      hatSettings: !!(captured && captured.settings && captured.settings.routing),
      hatPrefs: !!(captured && captured.prefs && captured.prefs.theme),
      ohneGeraete: JSON.stringify(captured).indexOf('dev_') < 0,
      renamed: renamed,
      danach: NWT.Setups.names().length
    };
  });
  check('Setup enthält Einstellungen und Vorlieben, aber keine Geräte',
    setupRound.hatSettings && setupRound.hatPrefs && setupRound.ohneGeraete,
    JSON.stringify(setupRound));
  check('Setups umbenennen und löschen',
    setupRound.renamed && setupRound.danach === 4, JSON.stringify(setupRound));

  const setupNotInProject = await page.evaluate(() =>
    JSON.stringify(NWT.Model.serialize(NWT.Store.project)).indexOf('Präsentation') < 0);
  check('Setups reisen nicht in der Projektdatei mit', setupNotInProject === true, setupNotInProject);

  /* Menü in der Werkzeugleiste */
  await page.click('[data-act="settings-menu"]');
  await page.waitForTimeout(200);
  const setupMenu = await page.evaluate(() => ({
    open: !document.getElementById('settings-menu').hidden,
    entries: document.querySelectorAll('#setup-list [data-setup]').length,
    hasTheme: !!document.querySelector('#settings-menu [data-act="theme"]')
  }));
  check('Zahnrad-Menü listet Setups und Designwechsel',
    setupMenu.open && setupMenu.entries === 4 && setupMenu.hasTheme, JSON.stringify(setupMenu));
  await page.click('#setup-list [data-setup="Arbeiten"]');
  await page.waitForTimeout(300);
  const viaMenu = await page.evaluate(() => ({
    active: NWT.Setups.active(),
    grid: NWT.Store.project.settings.grid,
    theme: NWT.Theme.get()
  }));
  check('Setup lässt sich aus dem Menü anwenden',
    viaMenu.active === 'Arbeiten' && viaMenu.grid === true && viaMenu.theme === 'light',
    JSON.stringify(viaMenu));

  await page.evaluate(() => {
    ['Arbeiten', 'Präsentation', 'Druck', 'Weitergabe'].forEach(n => NWT.Setups.remove(n));
    NWT.Theme.set('light');
    NWT.Tooltip.setEnabled(true);
  });

  /* --- 37c. Grafik- und Dekorationselemente ------------------- */
  /* Der bisherige Aufbau wird gesichert: die folgenden Blöcke räumen
     die Zeichenfläche mehrfach leer, spätere Prüfungen brauchen sie. */
  await page.evaluate(() => {
    const p = NWT.Store.project;
    window.__snap = JSON.parse(JSON.stringify(
      { devices: p.devices, connections: p.connections, areas: p.areas }));
  });

  const decoAdd = await page.evaluate(() => {
    NWT.Store.project.devices = []; NWT.Store.project.connections = []; NWT.Store.project.areas = []; NWT.Store.selection.clear(); NWT.Store.reindex(); NWT.emit('change', { structural: true });
    const d = NWT.Interaction.addDeviceAt('deco_rect', 300, 300);
    const el = document.querySelector('#l-deco .node-decor .decor-shape');
    return {
      shape: NWT.Catalog.shapeOf(d.type),
      w: d.w, h: d.h, fill: d.fill, figure: d.figure,
      hinten: !!el,
      pfad: el ? el.getAttribute('d').slice(0, 2) : '',
      keineports: (d.ports || []).length
    };
  });
  check('Rahmen liegt hinter dem Netz und ist ungefüllt',
    decoAdd.shape === 'shape' && decoAdd.hinten && decoAdd.fill === 'none' &&
    decoAdd.w === 240 && decoAdd.keineports === 0,
    JSON.stringify(decoAdd));

  const figuren = await page.evaluate(() => {
    const ids = Object.keys(NWT.Decor.FIGURES);
    const bad = ids.filter(f => {
      const p = NWT.Decor.figure(f).path(200, 140, 2);
      return !p || /NaN|undefined|Infinity/.test(p);
    });
    return { anzahl: ids.length, bad: bad };
  });
  check('Alle Figuren liefern gültige Pfade',
    figuren.anzahl === 11 && figuren.bad.length === 0, JSON.stringify(figuren));

  /* Ziehgriff: Größe ändern über echte Mausereignisse. */
  const handleBox = await page.evaluate(() => {
    const d = NWT.Store.project.devices[0];
    NWT.Store.select(d.id);
    NWT.Render.selection();
    const h = document.querySelector('.node.sel .node-handle');
    const r = h.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, sichtbar: r.width > 0 };
  });
  await page.mouse.move(handleBox.x, handleBox.y);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 80, handleBox.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const resized = await page.evaluate(() => {
    const d = NWT.Store.project.devices[0];
    return { w: d.w, h: d.h, undo: NWT.History.canUndo() };
  });
  check('Grafikelement lässt sich am Griff vergrößern',
    handleBox.sichtbar && resized.w > 280 && resized.h > 200 && resized.undo,
    JSON.stringify(resized));

  const decoStyle = await page.evaluate(() => {
    const d = NWT.Store.project.devices[0];
    d.figure = 'arrow'; d.fill = '#ff0000'; d.stroke = '#2563eb';
    d.strokeWidth = 4; d.dash = '6 4'; d.rot = 90; d.front = true;
    NWT.emit('change', { structural: true });
    const g = document.querySelector('.node-decor');
    const path = g.querySelector('.decor-shape');
    const tip = g.querySelector('.decor-tip');
    return {
      vorn: !!document.querySelector('#l-deco-front .node-decor'),
      fuellung: path.getAttribute('fill'),
      farbe: path.getAttribute('stroke'),
      staerke: path.getAttribute('stroke-width'),
      spitze: tip.getAttribute('fill'),
      dreh: (g.getAttribute('transform') || '').indexOf('rotate') > -1
    };
  });
  check('Offene Figuren bleiben ungefüllt, Pfeilspitze trägt die Linienfarbe',
    decoStyle.vorn && decoStyle.fuellung === 'none' && decoStyle.farbe === '#2563eb' &&
    String(decoStyle.staerke) === '4' && decoStyle.spitze === '#2563eb' && decoStyle.dreh,
    JSON.stringify(decoStyle));

  const decoExport = await page.evaluate(() => {
    const svg = NWT.Exchange.buildSvgString();
    return {
      hatForm: svg.indexOf('decor-shape') > -1,
      hatGriff: svg.indexOf('class="node-handle"') > -1,
      hatTreffer: svg.indexOf('class="node-hit"') > -1
    };
  });
  check('Dekoration steht im SVG-Export, Griffe nicht',
    decoExport.hatForm && !decoExport.hatGriff && !decoExport.hatTreffer,
    JSON.stringify(decoExport));

  const decoConnect = await page.evaluate(() => {
    const deco = NWT.Store.project.devices[0];
    const pc = NWT.Interaction.addDeviceAt('pc', 700, 300);
    NWT.Interaction.startConnectFrom(pc.id);
    const before = NWT.Store.project.connections.length;
    NWT.Store.setMode('select');
    return { before: before, decoId: deco.id, istForm: NWT.Catalog.shapeOf(deco.type) === 'shape' };
  });
  check('Dekoration ist kein Netzobjekt', decoConnect.istForm, JSON.stringify(decoConnect));

  const decoRoundtrip = await page.evaluate(() => {
    const json = JSON.parse(JSON.stringify(NWT.Model.serialize(NWT.Store.project)));
    const back = NWT.Model.validate(json).project;
    const d = back.devices.find(x => NWT.Catalog.shapeOf(x.type) === 'shape');
    return { figure: d.figure, rot: d.rot, dash: d.dash, front: d.front, w: d.w };
  });
  check('Grafikelement übersteht Speichern und Laden',
    decoRoundtrip.figure === 'arrow' && decoRoundtrip.rot === 90 &&
    decoRoundtrip.dash === '6 4' && decoRoundtrip.front === true,
    JSON.stringify(decoRoundtrip));

  const decoBoese = await page.evaluate(() => {
    const raw = NWT.Model.serialize(NWT.Store.project);
    raw.devices[0].fill = 'url(#evil)';
    raw.devices[0].dash = 'expression(alert(1))';
    raw.devices[0].stroke = 'javascript:1';
    raw.devices[0].figure = 'gibtesnicht';
    const d = NWT.Model.validate(raw).project.devices[0];
    return { fill: d.fill, dash: d.dash, stroke: d.stroke, figure: d.figure };
  });
  check('Fremde Darstellungswerte werden beim Import verworfen',
    decoBoese.fill === 'none' && decoBoese.dash === '' &&
    decoBoese.stroke === '#64748b' && decoBoese.figure === 'rect',
    JSON.stringify(decoBoese));

  /* --- 37d. Maskierung vertraulicher Angaben ------------------ */
  await page.evaluate(() => { NWT.Store.project.devices = []; NWT.Store.project.connections = []; NWT.Store.project.areas = []; NWT.Store.selection.clear(); NWT.Store.reindex(); NWT.emit('change', { structural: true }); NWT.Persistence.markSaved(false); NWT.Commands.loadExample(); });
  await page.waitForTimeout(200);

  const maskOff = await page.evaluate(() => ({
    ip: Array.from(document.querySelectorAll('#l-nodes .node-ip')).map(e => e.textContent).filter(Boolean)[0],
    aktiv: NWT.Privacy.active()
  }));
  await page.evaluate(() => { NWT.Privacy.set('on', true); });
  await page.waitForTimeout(150);
  const maskOn = await page.evaluate(() => ({
    ip: Array.from(document.querySelectorAll('#l-nodes .node-ip')).map(e => e.textContent).filter(Boolean)[0],
    sub: document.querySelector('.area-sub').textContent,
    status: document.getElementById('st-counts').textContent
  }));
  check('Maskierung ersetzt Adressen auf der Zeichenfläche',
    !maskOff.aktiv && /^\d/.test(maskOff.ip) && /^[•]/.test(maskOn.ip) &&
    maskOn.sub.indexOf('192.') < 0 && maskOn.status.indexOf('maskiert') > -1,
    JSON.stringify({ maskOff, maskOn }));

  const maskSvg = await page.evaluate(() => {
    const mit = NWT.Exchange.buildSvgString();
    NWT.Privacy.set('on', false);
    const ohne = NWT.Exchange.buildSvgString();
    return {
      mitIp: /192\.168\.1\.254/.test(mit),
      ohneIp: /192\.168\.1\.254/.test(ohne),
      wiederAn: NWT.Privacy.active()
    };
  });
  check('Maskierter Export enthält die Adresse auch im Quelltext nicht',
    !maskSvg.mitIp && maskSvg.ohneIp && !maskSvg.wiederAn, JSON.stringify(maskSvg));

  const maskStyles = await page.evaluate(() => {
    const out = {};
    ['dots', 'partial', 'blocks', 'hide'].forEach(st => {
      NWT.Privacy.set('style', st);
      out[st] = [NWT.Privacy.preview('192.168.10.42'), NWT.Privacy.preview('00:1A:2B:3C:4D:5E')];
    });
    NWT.Privacy.set('style', 'dots');
    return out;
  });
  check('Alle vier Maskierstile greifen',
    maskStyles.dots[0] === '•••.•••.••.••' &&
    maskStyles.partial[0] === '192.168.x.x' &&
    maskStyles.partial[1] === '00:1A:2B:xx:xx:xx' &&
    /^█+$/.test(maskStyles.blocks[0]) && maskStyles.hide[0] === '',
    JSON.stringify(maskStyles));

  const maskGruppen = await page.evaluate(() => {
    NWT.Privacy.set('on', true);
    NWT.Privacy.set('names', true);
    const name = document.querySelector('#l-nodes .node-name').textContent;
    NWT.Privacy.set('labels', true);
    const label = document.querySelector('.edge-label-tx').textContent;
    NWT.Privacy.set('names', false);
    NWT.Privacy.set('labels', false);
    NWT.Privacy.set('on', false);
    return { name: name, label: label };
  });
  check('Namen und Leitungsbeschriftungen lassen sich getrennt maskieren',
    /\d$/.test(maskGruppen.name) && maskGruppen.label === '', JSON.stringify(maskGruppen));

  const maskUnberuehrt = await page.evaluate(() => {
    NWT.Privacy.set('on', true);
    const json = NWT.Model.serialize(NWT.Store.project);
    const d = json.devices.find(x => x.ip);
    NWT.Privacy.set('on', false);
    return { ip: d.ip, imProjekt: !!json.settings.privacy };
  });
  check('Die JSON-Arbeitsdatei bleibt unmaskiert',
    /^\d{1,3}\./.test(maskUnberuehrt.ip) && maskUnberuehrt.imProjekt,
    JSON.stringify(maskUnberuehrt));

  /* --- 37e. Verbindungen aus dem Analyse-Skript --------------- */
  const v5Json = JSON.stringify({
    tool: 'nwt-scan', version: 5, generated: '2026-08-18T15:02:20+02:00',
    scannedFrom: 'MSI', interface: 'WLAN', localAddress: '10.9.0.71',
    subnets: ['10.9.0.71/24'], gateway: '10.9.0.1', wifi: { ssid: 'TESTNETZ' },
    hosts: [
      { ip: '10.9.0.1', mac: '50:E6:36:7B:D1:26', hostname: 'router.lan', discovery: ['icmp', 'arp', 'gateway'], ports: [{ port: 53, proto: 'tcp' }, { port: 80, proto: 'tcp' }] },
      { ip: '10.9.0.5', mac: '08:96:D7:B4:8A:08', hostname: 'nas.lan', discovery: ['icmp', 'arp'], ports: [{ port: 445, proto: 'tcp' }] },
      { ip: '10.9.0.9', mac: '3C:2A:F4:00:11:22', hostname: 'drucker.lan', discovery: ['arp'], ping: false, ports: [{ port: 9100, proto: 'tcp' }] },
      { ip: '10.9.0.71', mac: '', hostname: 'msi.lan', discovery: ['local'], ports: [] }
    ],
    links: [
      { source: '10.9.0.1', target: '10.9.0.5', type: 'logical', method: 'same-subnet', confidence: 0.4, description: 'Gleiches Subnetz.' },
      { source: '10.9.0.1', target: '10.9.0.9', type: 'logical', method: 'same-subnet', confidence: 0.4, description: 'Gleiches Subnetz.' },
      { source: '10.9.0.1', target: '10.9.0.71', type: 'logical', method: 'same-subnet', confidence: 0.4, description: 'Gleiches Subnetz.' },
      { source: '10.9.0.1', target: '10.9.0.5', type: 'layer2-logical', method: 'arp', confidence: 0.65, description: 'ARP-Nachbar.' },
      { source: '10.9.0.1', target: '10.9.0.9', type: 'layer2-logical', method: 'arp', confidence: 0.65, description: 'ARP-Nachbar.' },
      { source: '10.9.0.71', target: '10.9.0.1', type: 'observed', method: 'local-discovery', confidence: 0.55, description: 'Selbst gesehen.' },
      { source: '10.9.0.71', target: '10.9.0.5', type: 'observed', method: 'local-discovery', confidence: 0.55, description: 'Selbst gesehen.' },
      { source: '10.9.0.71', target: '10.9.0.9', type: 'observed', method: 'local-discovery', confidence: 0.55, description: 'Selbst gesehen.' }
    ]
  });

  const v5Res = await page.evaluate(text => {
    NWT.Store.project.devices = []; NWT.Store.project.connections = []; NWT.Store.project.areas = []; NWT.Store.selection.clear(); NWT.Store.reindex(); NWT.emit('change', { structural: true });
    const r = NWT.Discovery.analyze(text);
    return {
      hosts: r.hosts.length,
      links: r.ipLinks.length,
      dropped: r.ipLinksDropped,
      gateway: r.local.gateway,
      wifi: r.meta.wifi,
      paare: r.ipLinks.map(l => l.a + '>' + l.b + ':' + l.method + ':' + l.connType),
      gwTyp: r.hosts.find(h => h.ip === '10.9.0.1').guessType,
      gwGrund: r.hosts.find(h => h.ip === '10.9.0.1').confidence,
      druckerNotiz: r.hosts.find(h => h.ip === '10.9.0.9').notes.join(' | ')
    };
  }, v5Json);
  check('Scan-Verbindungen werden auf einen Stern verdichtet',
    v5Res.hosts === 4 && v5Res.links === 3 && v5Res.dropped === 5 &&
    v5Res.paare.filter(p => p.indexOf('10.9.0.1>') === 0).length === 3 &&
    v5Res.paare.some(p => p.indexOf('arp:logical') > -1) &&
    v5Res.paare.some(p => p.indexOf('local-discovery:wlan') > -1),
    JSON.stringify(v5Res));

  check('Das Standardgateway wird als Router erkannt',
    v5Res.gwTyp === 'router' && v5Res.gwGrund === 'hoch' &&
    /arp/.test(v5Res.druckerNotiz) && /Ping/.test(v5Res.druckerNotiz),
    JSON.stringify({ t: v5Res.gwTyp, n: v5Res.druckerNotiz }));

  const v5Apply = await page.evaluate(() => {
    const r = NWT.Discovery.last();
    const res = NWT.Discovery.apply(r.hosts, { createArea: false });
    const P = NWT.Store.project;
    const gw = P.devices.find(d => d.ip === '10.9.0.1');
    const leaf = P.devices.find(d => d.ip === '10.9.0.5');
    return {
      created: res.created, linked: res.linked,
      conns: P.connections.length,
      typen: P.connections.map(c => c.type).sort(),
      ohneLeitung: P.devices.filter(d => !NWT.Store.connectionsOf(d.id).length).length,
      gwOben: gw.y < leaf.y,
      grund: P.connections[0].description
    };
  });
  check('Erkannte Verbindungen landen im Diagramm',
    v5Apply.created === 4 && v5Apply.linked === 3 && v5Apply.conns === 3 &&
    v5Apply.ohneLeitung === 0 && v5Apply.gwOben &&
    v5Apply.typen.join(',') === 'logical,logical,wlan' &&
    /Zuverlässigkeit 65 %/.test(v5Apply.grund),
    JSON.stringify(v5Apply));

  const v5Abwahl = await page.evaluate(() => {
    NWT.Store.project.devices = []; NWT.Store.project.connections = []; NWT.Store.project.areas = []; NWT.Store.selection.clear(); NWT.Store.reindex(); NWT.emit('change', { structural: true });
    const r = NWT.Discovery.last();
    r.hosts.forEach(h => { h.existingId = ''; h.appliedId = ''; h.selected = true; });
    r.ipLinks.forEach((l, i) => { l.selected = i === 0; });
    const res = NWT.Discovery.apply(r.hosts, { createArea: false });
    return { linked: res.linked, conns: NWT.Store.project.connections.length };
  });
  check('Abgewählte Verbindungen werden nicht angelegt',
    v5Abwahl.linked === 1 && v5Abwahl.conns === 1, JSON.stringify(v5Abwahl));

  const v5Tabelle = await page.evaluate(() => {
    NWT.Dashboard.open('discovery');
    const rows = document.querySelectorAll('[data-link]').length;
    const head = document.querySelectorAll('.dash-subhead').length;
    NWT.Dashboard.close();
    return { rows: rows, head: head };
  });
  check('Das Dashboard zeigt die Verbindungen zur Prüfung an',
    v5Tabelle.rows === 3 && v5Tabelle.head === 1, JSON.stringify(v5Tabelle));

  /* --- 37f. Schrift in Textfeld, Notiz und Beschriftung ------- */
  const schrift = await page.evaluate(() => {
    const t = NWT.Interaction.addDeviceAt('text', 2400, 200);
    t.name = 'Standort München';
    NWT.emit('change', { structural: true });
    const tx = document.querySelector('[data-id="' + t.id + '"] .nt-body');
    const vor = { w: t.w, h: t.h, size: getComputedStyle(tx).fontSize };
    t.font = 'serif'; t.fontSize = 34; t.color = '#dc2626';
    t.bold = true; t.italic = true; t.align = 'start';
    NWT.emit('change', { structural: true });
    const cs = getComputedStyle(tx);
    return {
      id: t.id, vor: vor,
      nach: { w: t.w, h: t.h, size: cs.fontSize, weight: cs.fontWeight,
              style: cs.fontStyle, anchor: cs.textAnchor,
              serif: /Georgia/.test(cs.fontFamily), fill: cs.fill }
    };
  });
  check('Textfeld übernimmt Schriftart, Größe, Farbe und Schnitt',
    schrift.vor.size === '15px' && schrift.nach.size === '34px' &&
    schrift.nach.serif && schrift.nach.weight === '700' &&
    schrift.nach.style === 'italic' && schrift.nach.anchor === 'start' &&
    schrift.nach.fill === 'rgb(220, 38, 38)',
    JSON.stringify(schrift.nach));

  check('Die Kachel eines Textfelds wächst mit der Schrift',
    schrift.nach.w > schrift.vor.w * 1.8 && schrift.nach.h > schrift.vor.h * 1.8,
    JSON.stringify({ vor: schrift.vor, nach: { w: schrift.nach.w, h: schrift.nach.h } }));

  const schriftExport = await page.evaluate(() => {
    const svg = NWT.Exchange.buildSvgString();
    return { georgia: svg.indexOf('Georgia') > -1, rot: svg.indexOf('220, 38, 38') > -1 };
  });
  check('Die Schrift steht auch im SVG-Export',
    schriftExport.georgia && schriftExport.rot, JSON.stringify(schriftExport));

  const themeSchrift = await page.evaluate(id => {
    const d = NWT.Store.dev(id);
    d.color = undefined;
    NWT.emit('change', { structural: true });
    const tx = document.querySelector('[data-id="' + id + '"] .nt-body');
    const hell = getComputedStyle(tx).fill;
    NWT.Theme.set('dark');
    const dunkel = getComputedStyle(tx).fill;
    NWT.Theme.set('light');
    return { hell: hell, dunkel: dunkel, inline: tx.style.fill };
  }, schrift.id);
  check('Ohne eigene Farbe folgt die Schrift dem Design',
    themeSchrift.hell !== themeSchrift.dunkel && themeSchrift.inline === '',
    JSON.stringify(themeSchrift));

  const notizUmbruch = await page.evaluate(() => {
    const n = NWT.Interaction.addDeviceAt('note', 2400, 500);
    n.name = 'Wartungsfenster jeden ersten Sonntag im Monat, 02:00 bis 05:00 Uhr.';
    NWT.emit('change', { structural: true });
    const lesen = () => {
      const ts = document.querySelectorAll('[data-id="' + n.id + '"] .nt-body tspan');
      const body = document.querySelector('[data-id="' + n.id + '"] .nt-body');
      return {
        zeilen: ts.length,
        size: getComputedStyle(body).fontSize,
        abstand: ts.length > 1 ? Number(ts[1].getAttribute('y')) - Number(ts[0].getAttribute('y')) : 0,
        gekuerzt: ts.length ? /…$/.test(ts[ts.length - 1].textContent) : false
      };
    };
    const klein = lesen();
    n.fontSize = 20;
    NWT.emit('change', { structural: true });
    const gross = lesen();
    NWT.Commands.deleteIds([n.id]);
    return { klein: klein, gross: gross };
  });
  check('Notiztext bricht mit der Schriftgröße um und zeigt Gekürztes an',
    notizUmbruch.klein.size === '11px' && notizUmbruch.gross.size === '20px' &&
    notizUmbruch.gross.abstand > notizUmbruch.klein.abstand &&
    !notizUmbruch.klein.gekuerzt && notizUmbruch.gross.gekuerzt,
    JSON.stringify(notizUmbruch));

  const schriftImport = await page.evaluate(() => {
    const raw = NWT.Model.serialize(NWT.Store.project);
    const t = raw.devices.find(x => x.type === 'text');
    t.font = 'url(javascript:alert(1))';
    t.color = 'red; background:url(x)';
    t.fontSize = 99999;
    t.align = 'evil';
    const back = NWT.Model.validate(raw).project.devices.find(x => x.type === 'text');
    return { font: back.font, color: back.color, size: back.fontSize, align: back.align };
  });
  check('Fremde Schriftangaben werden beim Import verworfen',
    schriftImport.font === undefined && schriftImport.color === undefined &&
    schriftImport.size === 200 && schriftImport.align === undefined,
    JSON.stringify(schriftImport));

  await page.evaluate(id => { NWT.Commands.deleteIds([id]); }, schrift.id);

  /* --- 37g. Knoten und Abzweige an Verbindungen --------------- */
  const knoten = await page.evaluate(() => {
    const c = NWT.Store.project.connections[0];
    NWT.Commands.addWaypoint(c.id, { x: 700, y: 300 });
    NWT.Commands.addWaypoint(c.id, { x: 760, y: 380 });
    const el = document.querySelector('[data-id="' + c.id + '"]');
    return {
      id: c.id,
      anzahl: c.points.length,
      griffe: el.querySelectorAll('.edge-point').length,
      ausgewaehlt: NWT.Store.selection.has(c.id),
      geordnet: c.points.map(p => p.x + '/' + p.y).join(' ')
    };
  });
  check('Knoten lassen sich in eine Leitung einfügen',
    knoten.anzahl === 2 && knoten.griffe === 2 && knoten.ausgewaehlt,
    JSON.stringify(knoten));

  const fuehrung = await page.evaluate(id => {
    const out = {};
    ['orthogonal', 'straight', 'curved'].forEach(m => {
      NWT.Store.project.settings.routing = m;
      NWT.emit('change', { structural: true });
      out[m] = document.querySelector('[data-id="' + id + '"] .edge-line').getAttribute('d');
    });
    NWT.Store.project.settings.routing = 'orthogonal';
    NWT.emit('change', { structural: true });
    return out;
  }, knoten.id);
  check('Alle drei Linienführungen laufen über die Knoten',
    ['orthogonal', 'straight', 'curved'].every(m =>
      fuehrung[m] && fuehrung[m].indexOf('760') > -1 && !/NaN/.test(fuehrung[m])) &&
    fuehrung.orthogonal !== fuehrung.straight,
    JSON.stringify(Object.keys(fuehrung).map(k => k + ':' + fuehrung[k].length)));

  /* Griff mit echter Maus ziehen */
  const griffBox = await page.evaluate(id => {
    NWT.Store.select(id); NWT.Render.selection();
    const r = document.querySelector('[data-id="' + id + '"] .edge-point').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  }, knoten.id);
  await page.mouse.move(griffBox.x, griffBox.y);
  await page.mouse.down();
  await page.mouse.move(griffBox.x + 90, griffBox.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const gezogen = await page.evaluate(id => {
    const c = NWT.Store.con(id);
    return { x: c.points[0].x, y: c.points[0].y, undo: NWT.History.canUndo() };
  }, knoten.id);
  check('Ein Knoten lässt sich mit der Maus verschieben',
    griffBox.w > 0 && gezogen.x > 700 && gezogen.undo, JSON.stringify(gezogen));

  const knotenWeg = await page.evaluate(id => {
    NWT.Commands.removeWaypoint(id, 0);
    const nachEinem = NWT.Store.con(id).points.length;
    NWT.Commands.clearWaypoints(id);
    return { nachEinem: nachEinem, leer: NWT.Store.con(id).points.length };
  }, knoten.id);
  check('Knoten lassen sich einzeln und gesammelt entfernen',
    knotenWeg.nachEinem === 1 && knotenWeg.leer === 0, JSON.stringify(knotenWeg));

  const abzweig = await page.evaluate(() => {
    const P = NWT.Store.project;
    const c = P.connections[0];
    const alt = { id: c.id, src: c.source, dst: c.target, typ: c.type, vlan: c.vlan, layer: c.layer };
    const vorher = P.connections.length;
    const j = NWT.Commands.insertJunction(c.id, { x: 900, y: 250 });
    const cons = NWT.Store.connectionsOf(j.id).map(id => NWT.Store.con(id));
    return {
      shape: NWT.Catalog.shapeOf(j.type),
      rect: NWT.Store.deviceRect(j),
      vorher: vorher, nachher: P.connections.length,
      alteWeg: !P.connections.some(x => x.id === alt.id),
      anJ: cons.length,
      erbt: cons.every(x => x.type === alt.typ && x.layer === alt.layer),
      kette: cons.some(x => x.source === alt.src) && cons.some(x => x.target === alt.dst),
      punkt: !!document.querySelector('[data-id="' + j.id + '"] .junction-dot'),
      jid: j.id
    };
  });
  check('Ein Abzweig teilt die Leitung und erbt ihre Art',
    abzweig.shape === 'junction' && abzweig.rect.w === 16 &&
    abzweig.nachher === abzweig.vorher + 1 && abzweig.alteWeg &&
    abzweig.anJ === 2 && abzweig.erbt && abzweig.kette && abzweig.punkt,
    JSON.stringify(abzweig));

  const abzweigWeiter = await page.evaluate(jid => {
    const pc = NWT.Interaction.addDeviceAt('pc', 2600, 900);
    const c = NWT.Store.addConnection(jid, pc.id, 'gigabit');
    const drei = NWT.Store.connectionsOf(jid).length;
    const status = document.getElementById('st-counts').textContent;
    return { verbunden: !!c, drei: drei, status: status };
  }, abzweig.jid);
  check('Vom Abzweig aus lässt sich weiterverbinden',
    abzweigWeiter.verbunden && abzweigWeiter.drei === 3, JSON.stringify(abzweigWeiter));

  await page.waitForTimeout(150);
  const zaehlung = await page.evaluate(() => document.getElementById('st-counts').textContent);
  check('Abzweige zählen nicht als Geräte',
    /Abzweig/.test(zaehlung) && !/Text\/Grafik/.test(zaehlung), zaehlung);

  const knotenExport = await page.evaluate(() => {
    const c = NWT.Store.project.connections[0];
    NWT.Commands.addWaypoint(c.id, { x: 820, y: 300 });
    NWT.Store.select(c.id); NWT.Render.selection();
    const svg = NWT.Exchange.buildSvgString();
    NWT.Commands.clearWaypoints(c.id);
    return { griffe: svg.indexOf('class="edge-point"') > -1, punkt: svg.indexOf('junction-dot') > -1 };
  });
  check('Abzweige stehen im Export, Knotengriffe nicht',
    knotenExport.punkt && !knotenExport.griffe, JSON.stringify(knotenExport));

  const knotenImport = await page.evaluate(() => {
    const raw = NWT.Model.serialize(NWT.Store.project);
    raw.connections[0].points = [{ x: 10, y: 20 }, { x: 'x', y: 5 }, { x: 30, y: 40 }];
    const arr = [];
    for (let i = 0; i < 200; i++) arr.push({ x: i, y: i });
    raw.connections[1].points = arr;
    const back = NWT.Model.validate(raw).project;
    return { gefiltert: back.connections[0].points.length, gedeckelt: back.connections[1].points.length };
  });
  check('Stützpunkte werden beim Import geprüft und begrenzt',
    knotenImport.gefiltert === 2 && knotenImport.gedeckelt === 40,
    JSON.stringify(knotenImport));

  await page.evaluate(() => {
    const p = NWT.Store.project;
    p.devices = window.__snap.devices;
    p.connections = window.__snap.connections;
    p.areas = window.__snap.areas;
    NWT.Store.selection.clear();
    NWT.Store.reindex();
    NWT.emit('change', { structural: true });
  });
  await page.waitForTimeout(150);

  /* --- 37b0. Typwahl in der Werkzeugleiste -------------------- */
  const connPicker = await page.evaluate(() => ({
    options: document.querySelectorAll('#opt-conntype option').length,
    groups: document.querySelectorAll('#opt-conntype optgroup').length,
    value: document.getElementById('opt-conntype').value,
    swatch: document.getElementById('conn-swatch').getAttribute('stroke')
  }));
  check('Typwahl neben „Verbinden“ ist gefüllt und gruppiert',
    connPicker.options >= 45 && connPicker.groups === 7 &&
    connPicker.value === 'gigabit' && connPicker.swatch === '#2563eb',
    JSON.stringify(connPicker));

  await page.evaluate(() => NWT.Store.setMode('select'));
  await page.selectOption('#opt-conntype', 'ac230');
  await page.waitForTimeout(250);
  const afterPick = await page.evaluate(() => ({
    setting: NWT.Store.project.settings.defaultConnType,
    mode: NWT.Store.mode,
    swatch: document.getElementById('conn-swatch').getAttribute('stroke'),
    dash: document.getElementById('conn-swatch').getAttribute('stroke-dasharray')
  }));
  check('Auswahl setzt den Standardtyp und startet den Verbindungsmodus',
    afterPick.setting === 'ac230' && afterPick.mode === 'connect' &&
    afterPick.swatch === '#b91c1c' && afterPick.dash === '10 4 2 4', JSON.stringify(afterPick));

  /* Neue Leitung übernimmt den gewählten Typ */
  const drawn = await page.evaluate(() => {
    const ds = NWT.Store.project.devices;
    const c = NWT.Store.addConnection(ds[0].id, ds[2].id);
    const t = c.type;
    NWT.Commands.deleteIds([c.id]);
    return t;
  });
  check('Neue Verbindung erhält den gewählten Typ', drawn === 'ac230', drawn);

  await page.selectOption('#opt-conntype', 'gigabit');
  await page.evaluate(() => NWT.Store.setMode('select'));
  await page.waitForTimeout(150);

  /* --- 37ba. Bildbibliothek und Abgleich ---------------------- */
  const libBasics = await page.evaluate(() => ({
    embedded: (window.__NWT_IMAGE_LIBRARY__ || []).length,
    analysed: NWT.Library.analyze().length,
    hasData: (NWT.Library.all()[0] || {}).data ? /^data:image\//.test(NWT.Library.all()[0].data) : false
  }));
  check('Bilder aus bilder/ sind eingebettet',
    libBasics.analysed === libBasics.embedded &&
    (libBasics.embedded === 0 ? !libBasics.hasData : libBasics.hasData),
    JSON.stringify(libBasics));

  const libMatch = await page.evaluate(() => {
    const m = n => {
      const r = NWT.Library.match(n);
      return r.type + '/' + (r.confidence || 'offen') + (r.variant ? '/' + r.variant : '');
    };
    return {
      kennung: m('switch_managed.png'),
      bezeichnung: m('ESU_ECoS.jpg'),
      alias: m('Central_Station_3.jpg'),
      ziffer: m('Central_Station_2.jpg'),
      variante: m('Intellibox_1_a.jpg'),
      fritz: m('fritzbox-7590.jpg'),
      raspi: m('raspi4.png'),
      nichts: m('DSC_04711.jpg'),
      leer: m('')
    };
  });
  check('Abgleich über Typkennung und Bezeichnung',
    libMatch.kennung === 'switch_managed/hoch' && libMatch.bezeichnung === 'mb_ecos/hoch',
    JSON.stringify(libMatch));
  check('Abgleich über Alias-Tabelle, Ziffern werden beachtet',
    libMatch.alias === 'mb_cs3/hoch' && libMatch.ziffer === 'mb_cs2/hoch' &&
    libMatch.fritz === 'wlan_router/hoch' && libMatch.raspi === 'raspberrypi/hoch',
    JSON.stringify(libMatch));
  check('Bildvariante erkannt, Unbekanntes bleibt offen',
    libMatch.variante === 'mb_intellibox/hoch/a' && libMatch.nichts === '/offen' &&
    libMatch.leer === '/offen', JSON.stringify(libMatch));

  const libAuto = await page.evaluate(() => {
    const before = NWT.Library.imageFor('mb_ecos');
    /* Auswahl des Anwenders sticht den automatischen Treffer */
    NWT.Library.pick('mb_intellibox', 'Intellibox_3.jpg');
    const picked = NWT.Library.imageFor('mb_intellibox');
    const named = NWT.Library.all().find(e => e.name === 'Intellibox_3.jpg');
    const dangling = (() => {
      NWT.Library.pick('mb_z21', 'gibtsnicht.jpg');
      const r = NWT.Library.imageFor('mb_z21');
      NWT.Library.pick('mb_z21', '');
      return r;
    })();
    return {
      autoEcos: /^data:image\//.test(before),
      pickWins: named && picked === named.data,
      dangling: dangling,
      unknownType: NWT.Library.imageFor('pc')
    };
  });
  check('Sichere Treffer werden automatisch verwendet',
    libBasics.embedded === 0 ? libAuto.autoEcos === false : libAuto.autoEcos === true,
    JSON.stringify({ autoEcos: libAuto.autoEcos }));
  check('Auswahl sticht Automatik, tote Verweise liefern nichts',
    (libBasics.embedded === 0 || libAuto.pickWins === true) &&
    libAuto.dangling === '' && libAuto.unknownType === '',
    JSON.stringify({ pickWins: libAuto.pickWins, dangling: libAuto.dangling }));

  const libStrip = await page.evaluate(() => {
    const d = NWT.Interaction.addDeviceAt('mb_ecos', 200, 1400);
    const strip = NWT.Store.stripFor(d);
    const fromLib = strip && strip.kind === 'image' && /^data:image\//.test(strip.href);
    /* Eigenes Gerätefoto hat Vorrang vor der Bibliothek */
    d.image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const own = NWT.Store.stripFor(d).href === d.image;
    NWT.Commands.deleteIds([d.id]);
    return { fromLib, own };
  });
  check('Bibliotheksbild landet auf der Kachel, Gerätefoto sticht',
    (libBasics.embedded === 0 || libStrip.fromLib === true) &&
    libStrip.own === true, JSON.stringify(libStrip));

  const libRound = await page.evaluate(() => {
    const json = JSON.stringify(NWT.Model.serialize(NWT.Store.project));
    const back = NWT.Model.validate(JSON.parse(json)).project;
    const bad = NWT.Model.validate({
      name: 'x', devices: [],
      libraryPicks: { mb_ecos: 'gut.jpg', gibtsnicht: 'x.jpg', pc: 'y'.repeat(400) }
    }).project;
    return {
      kept: back.libraryPicks.mb_intellibox,
      size: json.length,
      badKeys: Object.keys(bad.libraryPicks)
    };
  });
  check('Auswahl übersteht Export/Import, nur Dateinamen gespeichert',
    libRound.kept === 'Intellibox_3.jpg' && libRound.size < 400000, JSON.stringify({ kept: libRound.kept }));
  check('Import filtert unbekannte Typen und überlange Namen',
    libRound.badKeys.length === 1 && libRound.badKeys[0] === 'mb_ecos', JSON.stringify(libRound.badKeys));

  await page.evaluate(() => { NWT.Library.pick('mb_intellibox', ''); });

  /* --- 37bb. Verbindungsarten und Darstellung ----------------- */
  const connCat = await page.evaluate(() => ({
    types: Object.keys(NWT.Catalog.CONNECTION_TYPES).length,
    cats: NWT.Catalog.CONN_CATEGORIES.length,
    grouped: NWT.Catalog.connTypeOptions().every(o => !!o.group),
    perCat: NWT.Catalog.CONN_CATEGORIES.map(c => NWT.Catalog.connTypesIn(c.id).length),
    usb: !!NWT.Catalog.CONNECTION_TYPES.usb3,
    power: !!NWT.Catalog.CONNECTION_TYPES.ac230,
    bus: !!NWT.Catalog.CONNECTION_TYPES.profibus,
    mobra: !!NWT.Catalog.CONNECTION_TYPES.loconet
  }));
  check('Verbindungsarten in 7 Kategorien',
    connCat.types >= 45 && connCat.cats === 7 && connCat.grouped &&
    connCat.perCat.every(n => n > 0), JSON.stringify(connCat));
  check('USB, Strom, Feldbus und Modellbahn vorhanden',
    connCat.usb && connCat.power && connCat.bus && connCat.mobra, JSON.stringify(connCat));

  const styleCascade = await page.evaluate(() => {
    const c = NWT.Store.project.connections[0];
    c.type = 'usb3';
    delete c.style;
    NWT.Store.project.connStyles = {};
    const base = NWT.Store.edgeStyle(c);

    /* Ebene 2: Typvorgabe im Projekt */
    NWT.Store.project.connStyles.usb3 = { color: '#112233', width: 5, dash: '1 4' };
    const viaType = NWT.Store.edgeStyle(c);

    /* Ebene 1: diese eine Leitung */
    c.style = { color: '#ff0000', width: 8, dash: '' };
    const viaConn = NWT.Store.edgeStyle(c);

    NWT.emit('change', { structural: true });
    const line = document.querySelector('[data-id="' + c.id + '"] .edge-line');
    const drawn = { stroke: line.style.stroke, width: line.style.strokeWidth, dash: line.style.strokeDasharray };

    delete c.style;
    NWT.emit('change', { structural: true });
    const line2 = document.querySelector('[data-id="' + c.id + '"] .edge-line');
    const afterReset = { stroke: line2.style.stroke, width: line2.style.strokeWidth };

    NWT.Store.project.connStyles = {};
    NWT.emit('change', { structural: true });
    return { base, viaType, viaConn, drawn, afterReset };
  });
  check('Kaskade: Auslieferung → Typvorgabe → Einzelleitung',
    styleCascade.base.color === '#d97706' &&
    styleCascade.viaType.color === '#112233' && styleCascade.viaType.width === 5 &&
    styleCascade.viaConn.color === '#ff0000' && styleCascade.viaConn.width === 8,
    JSON.stringify(styleCascade.base) + ' | ' + JSON.stringify(styleCascade.viaType) +
    ' | ' + JSON.stringify(styleCascade.viaConn));
  check('Gezeichnet wird die wirksame Darstellung',
    /rgb\(255, 0, 0\)|#ff0000/.test(styleCascade.drawn.stroke) && styleCascade.drawn.width === '8' &&
    styleCascade.drawn.dash === 'none', JSON.stringify(styleCascade.drawn));
  check('Zurücksetzen fällt auf die Typvorgabe zurück',
    /rgb\(17, 34, 51\)|#112233/.test(styleCascade.afterReset.stroke) && styleCascade.afterReset.width === '5',
    JSON.stringify(styleCascade.afterReset));

  const styleRound = await page.evaluate(() => {
    const c = NWT.Store.project.connections[0];
    c.style = { color: '#00ff88', width: 4.5, dash: '6 4' };
    NWT.Store.project.connStyles = { poe: { color: '#123456', width: 6, dash: '' } };
    const json = JSON.stringify(NWT.Model.serialize(NWT.Store.project));
    const back = NWT.Model.validate(JSON.parse(json)).project;
    const bad = NWT.Model.validate({
      name: 'x', devices: [],
      connStyles: { poe: { color: 'javascript:alert(1)', width: 999, dash: 'url(#x)' }, gibtsnicht: { color: '#fff' } }
    }).project;
    const res = {
      connKept: back.connections[0].style && back.connections[0].style.color,
      typeKept: back.connStyles.poe && back.connStyles.poe.width,
      badColor: (bad.connStyles.poe || {}).color,
      badWidth: (bad.connStyles.poe || {}).width,
      badDash: (bad.connStyles.poe || {}).dash,
      unknownType: Object.prototype.hasOwnProperty.call(bad.connStyles, 'gibtsnicht')
    };
    delete c.style;
    NWT.Store.project.connStyles = {};
    NWT.emit('change', { structural: true });
    return res;
  });
  check('Darstellung übersteht Export und Import',
    styleRound.connKept === '#00ff88' && styleRound.typeKept === 6, JSON.stringify(styleRound));
  check('Fremde Stilangaben werden gefiltert',
    styleRound.badColor === '' && styleRound.badWidth === 12 && styleRound.badDash === '' &&
    styleRound.unknownType === false, JSON.stringify(styleRound));

  /* Gruppierte Auswahlliste im Verbindungsdialog */
  await page.evaluate(() => { NWT.Dialogs.editConnection(NWT.Store.project.connections[0].id); });
  await page.waitForTimeout(300);
  const dlgConn = await page.evaluate(() => ({
    groups: document.querySelectorAll('#modal [name="type"] optgroup').length,
    options: document.querySelectorAll('#modal [name="type"] option').length,
    hasColor: !!document.querySelector('#modal [name="styleColor"]'),
    hasWidth: !!document.querySelector('#modal [name="styleWidth"]'),
    hasDash: document.querySelectorAll('#modal [name="styleDash"] option').length,
    preview: !!document.querySelector('#modal #style-preview-line')
  }));
  check('Verbindungsdialog: gruppierte Liste und Darstellungsfelder',
    dlgConn.groups === 7 && dlgConn.options >= 45 && dlgConn.hasColor && dlgConn.hasWidth &&
    dlgConn.hasDash === 5 && dlgConn.preview, JSON.stringify(dlgConn));

  await page.fill('#modal [name="styleWidth"]', '6.5');
  await page.selectOption('#modal [name="styleDash"]', '1 4');
  await page.waitForTimeout(150);
  const previewLive = await page.evaluate(() => {
    const l = document.querySelector('#modal #style-preview-line');
    return { w: l.style.strokeWidth, d: l.style.strokeDasharray };
  });
  check('Vorschaulinie folgt der Eingabe',
    previewLive.w === '6.5' && previewLive.d.replace(/,/g, '') === '1 4', JSON.stringify(previewLive));
  await page.locator('#modal .btn.primary').click();
  await page.waitForTimeout(250);
  const stored = await page.evaluate(() => {
    const c = NWT.Store.project.connections[0];
    return { hasStyle: !!c.style, w: c.style && c.style.width, d: c.style && c.style.dash };
  });
  check('Abweichende Darstellung wird an der Leitung festgehalten',
    stored.hasStyle && stored.w === 6.5 && stored.d === '1 4', JSON.stringify(stored));

  await page.evaluate(() => {
    delete NWT.Store.project.connections[0].style;
    NWT.Store.project.connections[0].type = 'gigabit';
    NWT.emit('change', { structural: true });
  });

  /* --- 37c. Einstellungsseite --------------------------------- */
  await page.keyboard.press('Control+Comma');
  await page.waitForTimeout(400);
  const setPage = await page.evaluate(() => {
    const o = document.getElementById('set-overlay');
    return {
      open: !!o && o.classList.contains('on'),
      cards: o ? o.querySelectorAll('.set-card').length : 0,
      toggles: o ? o.querySelectorAll('[data-set]').length : 0,
      tiles: o ? o.querySelectorAll('.ti-tile').length : 0
    };
  });
  check('Einstellungsseite öffnet (Strg+Komma)',
    setPage.open && setPage.cards >= 7 && setPage.toggles >= 10 && setPage.tiles > 0,
    JSON.stringify(setPage));

  await page.uncheck('#set-overlay [data-set="hardware"]');
  await page.waitForTimeout(250);
  const hwOff = await page.evaluate(() => ({
    setting: NWT.Store.project.settings.hardware,
    routerH: NWT.Store.deviceRect(NWT.Store.project.devices.find(x => x.type === 'router')).h
  }));
  check('Hardware-Ansicht auf der Einstellungsseite abschaltbar',
    hwOff.setting === false && hwOff.routerH === 88, JSON.stringify(hwOff));

  const csCard = await page.evaluate(() => {
    const o = document.getElementById('set-overlay');
    return {
      groups: o.querySelectorAll('.cs-group').length,
      rows: o.querySelectorAll('.cs-row').length,
      previews: o.querySelectorAll('.cs-preview line').length
    };
  });
  check('Karte „Verbindungsarten“ listet alle Typen mit Vorschau',
    csCard.groups === 7 && csCard.rows >= 45 && csCard.previews === csCard.rows,
    JSON.stringify(csCard));

  await page.fill('#set-overlay .cs-row[data-conn="usb3"] [data-cs="width"]', '7');
  await page.locator('#set-overlay .cs-row[data-conn="usb3"] [data-cs="width"]').blur();
  await page.waitForTimeout(300);
  const csApplied = await page.evaluate(() => ({
    stored: (NWT.Store.project.connStyles.usb3 || {}).width,
    marked: !!document.querySelector('#set-overlay .cs-row[data-conn="usb3"].changed'),
    effective: NWT.Store.edgeStyle({ type: 'usb3' }).width
  }));
  check('Typvorgabe wirkt projektweit und wird markiert',
    csApplied.stored === 7 && csApplied.marked && csApplied.effective === 7, JSON.stringify(csApplied));

  await page.click('#set-overlay .cs-row[data-conn="usb3"] .cs-reset');
  await page.waitForTimeout(300);
  const csReset = await page.evaluate(() => ({
    left: Object.keys(NWT.Store.project.connStyles || {}).length,
    effective: NWT.Store.edgeStyle({ type: 'usb3' }).width
  }));
  check('Einzelne Verbindungsart zurücksetzbar',
    csReset.left === 0 && csReset.effective === 1.9, JSON.stringify(csReset));

  const libCard = await page.evaluate(() => {
    const o = document.getElementById('set-overlay');
    return {
      cards: o.querySelectorAll('.lib-card').length,
      review: !!o.querySelector('[data-lib-review]'),
      folder: !!o.querySelector('[data-lib-open]'),
      pickButtons: o.querySelectorAll('[data-lib-pick]').length
    };
  });
  check('Karte „Bildbibliothek“ zeigt alle Bilder mit Zuordnung',
    libCard.review && libCard.folder &&
    (libBasics.embedded === 0
      ? libCard.cards === 0 && libCard.pickButtons === 0
      : libCard.cards > 0 && libCard.pickButtons > 0),
    JSON.stringify(libCard));

  await page.click('#set-overlay [data-lib-review]');
  await page.waitForTimeout(400);
  const libReview = await page.evaluate(() => ({
    open: document.getElementById('modal').open,
    rows: document.querySelectorAll('#modal .lib-review tbody tr').length,
    selects: document.querySelectorAll('#modal [data-lib-type]').length,
    groups: document.querySelectorAll('#modal [data-lib-type] optgroup').length,
    thumbs: document.querySelectorAll('#modal .lib-thumb').length
  }));
  check('Prüfliste mit Umstellmöglichkeit je Zeile',
    libReview.open && libReview.selects === libReview.rows && libReview.thumbs === libReview.rows &&
    (libBasics.embedded === 0 ? libReview.rows === 0 : libReview.rows > 0 && libReview.groups > 5),
    JSON.stringify(libReview));
  await page.evaluate(() => NWT.Modal.close(null));
  await page.waitForTimeout(200);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const setClosed = await page.evaluate(() =>
    document.getElementById('set-overlay').classList.contains('on'));
  check('Einstellungsseite schließt mit Esc', setClosed === false, setClosed);

  await page.evaluate(() => {
    delete NWT.Store.project.typeImages.pc;
    NWT.emit('change', { structural: true });
  });

  /* --- 38. Netzwerkanalyse: Parser ---------------------------- */
  const arpText = [
    'Schnittstelle: 192.168.178.24 --- 0x5',
    '  Internetadresse       Physische Adresse     Typ',
    '  192.168.178.1         3c-a6-2f-11-22-33     dynamisch',
    '  192.168.178.30        b8-27-eb-aa-bb-cc     dynamisch',
    '  192.168.178.255       ff-ff-ff-ff-ff-ff     statisch',
    '  224.0.0.22            01-00-5e-00-00-16     statisch',
    'Standardgateway . . . . . . . . : 192.168.178.1'
  ].join('\n');
  const arpRes = await page.evaluate(t => {
    const r = NWT.Discovery.analyze(t);
    return {
      n: r.hosts.length,
      ips: r.hosts.map(h => h.ip),
      gw: r.local.gateway,
      pi: (r.hosts.find(h => h.mac === 'B8:27:EB:AA:BB:CC') || {}).guessType,
      vendor: (r.hosts.find(h => h.mac === 'B8:27:EB:AA:BB:CC') || {}).vendor,
      gwType: (r.hosts.find(h => h.ip === '192.168.178.1') || {}).guessType,
      subnets: r.subnets
    };
  }, arpText);
  check('arp -a: Broadcast und Multicast gefiltert', arpRes.n === 2, JSON.stringify(arpRes.ips));
  check('arp -a: Gateway aus ipconfig erkannt', arpRes.gw === '192.168.178.1' && arpRes.gwType === 'router',
    JSON.stringify(arpRes));
  check('OUI-Erkennung Raspberry Pi', arpRes.pi === 'raspberrypi' && /Raspberry/.test(arpRes.vendor || ''),
    JSON.stringify(arpRes));
  check('Subnetz abgeleitet', arpRes.subnets.indexOf('192.168.178.0/24') >= 0, JSON.stringify(arpRes.subnets));

  const nmapText = [
    'Nmap scan report for ecos.fritz.box (192.168.178.50)',
    'Host is up (0.0031s latency).',
    'PORT      STATE SERVICE',
    '80/tcp    open  http',
    '15471/tcp open  unknown',
    'MAC Address: 00:11:22:33:44:55 (Unknown)',
    '',
    'Nmap scan report for drucker (192.168.178.60)',
    'Host is up (0.010s latency).',
    'PORT     STATE SERVICE',
    '9100/tcp open  jetdirect',
    '631/tcp  open  ipp'
  ].join('\n');
  const nmapRes = await page.evaluate(t => {
    const r = NWT.Discovery.analyze(t);
    return r.hosts.map(h => ({ ip: h.ip, type: h.guessType, conf: h.confidence, ports: h.ports.length }));
  }, nmapText);
  check('nmap: ESU ECoS über Port 15471 erkannt',
    nmapRes[0] && nmapRes[0].type === 'mb_ecos' && nmapRes[0].conf === 'hoch', JSON.stringify(nmapRes[0]));
  check('nmap: Netzwerkdrucker über Port 9100 erkannt',
    nmapRes[1] && nmapRes[1].type === 'netprinter', JSON.stringify(nmapRes[1]));

  const xmlRes = await page.evaluate(() => {
    const xml = '<?xml version="1.0"?><nmaprun><host><address addr="10.0.0.5" addrtype="ipv4"/>' +
      '<address addr="AA:BB:CC:DD:EE:FF" addrtype="mac" vendor="Testhersteller"/>' +
      '<hostnames><hostname name="cs3.local"/></hostnames><ports>' +
      '<port protocol="udp" portid="15731"><state state="open"/><service name="unknown"/></port>' +
      '</ports></host></nmaprun>';
    const r = NWT.Discovery.analyze(xml);
    return { n: r.hosts.length, type: r.hosts[0].guessType, vendor: r.hosts[0].vendor, mac: r.hosts[0].mac };
  });
  check('nmap-XML: Märklin CS3 über UDP 15731 erkannt',
    xmlRes.type === 'mb_cs3' && xmlRes.vendor === 'Testhersteller' && xmlRes.mac === 'AA:BB:CC:DD:EE:FF',
    JSON.stringify(xmlRes));

  const scanJson = await page.evaluate(() => {
    const obj = {
      tool: 'nwt-scan', version: 1, generated: '2026-08-17T10:00:00Z', scannedFrom: 'PC',
      subnets: ['192.168.5.0/24'], gateway: '192.168.5.1',
      hosts: [
        { ip: '192.168.5.10', mac: '00:1B:2C:3D:4E:5F', hostname: 'z21', vendor: '', ports: [{ port: 80, proto: 'tcp' }] },
        { ip: '192.168.5.20', mac: '08:00:27:11:22:33', hostname: 'srv-test', vendor: '', ports: [{ port: 22, proto: 'tcp' }] }
      ]
    };
    const r = NWT.Discovery.analyze(JSON.stringify(obj));
    return {
      n: r.hosts.length,
      z21: r.hosts[0].guessType,
      vm: r.hosts[1].guessType,
      vmVendor: r.hosts[1].vendor,
      src: r.sources
    };
  });
  check('Analyse-Skript-JSON eingelesen', scanJson.n === 2 && scanJson.src.indexOf('Analyse-Skript') >= 0,
    JSON.stringify(scanJson));
  check('Hostname-Heuristik (z21) und OUI (VirtualBox)',
    scanJson.z21 === 'mb_z21' && scanJson.vm === 'server' && /VirtualBox/.test(scanJson.vmVendor),
    JSON.stringify(scanJson));

  const lldpRes = await page.evaluate(() => {
    const t = 'Device ID: SW-KELLER\n  IP address: 192.168.178.2\n' +
      'Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet0/24\n';
    const r = NWT.Discovery.analyze(t);
    return { links: r.links.length, name: r.links[0] && r.links[0].remoteName, ip: r.hosts[0].ip };
  });
  check('LLDP/CDP: Nachbarschaft erkannt',
    lldpRes.links === 1 && lldpRes.name === 'SW-KELLER' && lldpRes.ip === '192.168.178.2',
    JSON.stringify(lldpRes));

  const badAnalysis = await page.evaluate(() => {
    try { NWT.Discovery.analyze('nur irgendein Text ohne Adressen'); return 'kein Fehler'; }
    catch (e) { return e.message.slice(0, 40); }
  });
  check('Analyse meldet fehlende Adressen verständlich',
    /Im Text wurden keine/.test(badAnalysis), badAnalysis);

  /* --- 39. Übernahme ins Projekt ------------------------------ */
  const applyRes = await page.evaluate(t => {
    const before = NWT.Store.project.devices.length;
    const r = NWT.Discovery.analyze(t);
    const sw = NWT.Store.project.devices.find(d => d.type === 'switch_managed');
    const res = NWT.Discovery.apply(r.hosts, { createArea: true, connectTo: sw.id, overwrite: false });
    return {
      before: before, after: NWT.Store.project.devices.length,
      created: res.created, linked: res.linked,
      areas: NWT.Store.project.areas.length,
      lastArea: NWT.Store.project.areas.slice(-1)[0].label
    };
  }, arpText);
  check('Erkannte Hosts übernommen', applyRes.created === 2 && applyRes.after === applyRes.before + 2,
    JSON.stringify(applyRes));
  check('Neue Geräte verbunden und Bereich angelegt',
    applyRes.linked === 2 && applyRes.lastArea === 'Automatisch erkannt', JSON.stringify(applyRes));

  const applyAgain = await page.evaluate(t => {
    const r = NWT.Discovery.analyze(t);
    const known = r.hosts.filter(h => h.state === 'bekannt').length;
    const res = NWT.Discovery.apply(r.hosts, {});
    return { known: known, created: res.created };
  }, arpText);
  check('Zweite Analyse erkennt die Geräte wieder (kein Duplikat)',
    applyAgain.known === 2 && applyAgain.created === 0, JSON.stringify(applyAgain));

  await page.evaluate(() => { NWT.History.undo(); NWT.History.undo(); });

  /* --- 40. Dashboard ----------------------------------------- */
  /* Jede Analyse öffnet das Dashboard automatisch — für den
     Kürzel-Test erst wieder schließen. */
  const autoOpened = await page.evaluate(() => {
    const wasOpen = NWT.Dashboard.isOpen();
    NWT.Dashboard.close();
    return wasOpen;
  });
  check('Analyse öffnet das Dashboard automatisch', autoOpened === true, autoOpened);

  await page.keyboard.press('Control+Shift+D');
  await page.waitForTimeout(350);
  const dash = await page.evaluate(() => {
    const o = document.getElementById('dash-overlay');
    return {
      open: !!o && o.classList.contains('on'),
      cards: o ? o.querySelectorAll('.dash-card').length : 0,
      kpis: o ? o.querySelectorAll('.kpi').length : 0,
      bars: o ? o.querySelectorAll('.bar-row').length : 0,
      mobra: o ? /Modellbahn/.test(o.textContent) : false
    };
  });
  check('Dashboard öffnet mit Auswertungskarten',
    dash.open && dash.cards >= 7 && dash.kpis >= 6 && dash.bars > 8, JSON.stringify(dash));

  await page.click('#dash-overlay [data-tab="discovery"]');
  await page.waitForTimeout(250);
  const dashDisc = await page.evaluate(() => {
    const o = document.getElementById('dash-overlay');
    return {
      rows: o.querySelectorAll('.dash-table.wide tbody tr').length,
      hasApply: !!o.querySelector('[data-dash-apply]'),
      hasHeur: /Heuristiken/.test(o.textContent)
    };
  });
  check('Dashboard zeigt die Erkennungsliste',
    dashDisc.rows === 2 && dashDisc.hasApply && dashDisc.hasHeur, JSON.stringify(dashDisc));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const dashClosed = await page.evaluate(() =>
    document.getElementById('dash-overlay').classList.contains('on'));
  check('Dashboard schließt mit Esc', dashClosed === false, dashClosed);

  /* --- 41. Analyse-Skripte ----------------------------------- */
  const scripts = await page.evaluate(() => ({
    ps1: (window.__NWT_SCRIPT_PS1__ || '').length,
    sh: (window.__NWT_SCRIPT_SH__ || '').length,
    ps1Head: (window.__NWT_SCRIPT_PS1__ || '').slice(0, 60),
    hasScan: /nwt-scan/.test(window.__NWT_SCRIPT_PS1__ || '')
  }));
  check('Analyse-Skripte in die Einzeldatei eingebettet',
    scripts.ps1 > 3000 && scripts.sh > 1500 && scripts.hasScan, JSON.stringify({ ps1: scripts.ps1, sh: scripts.sh }));

  /* --- 42. Symbol-Editor ------------------------------------- */
  const symSaved = await page.evaluate(() => {
    const def = NWT.Symbols.save({
      id: 'custom_1', label: 'Hutschienen-Netzteil', cat: 'custom', color: '#0891b2',
      iconInner: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 18v3M17 18v3"/>',
      iconViewBox: '0 0 24 24',
      ports: ['230 V', '24 V +', '24 V -']
    });
    return {
      id: def.id,
      inCatalog: NWT.Catalog.typesIn('custom').indexOf('custom_1') >= 0,
      label: NWT.Catalog.typeLabel('custom_1'),
      ports: NWT.Catalog.buildPorts('custom_1').length,
      symbolInDefs: !!document.getElementById(NWT.Symbols.symbolId('custom_1'))
    };
  });
  check('Eigenes Symbol angelegt und im Katalog registriert',
    symSaved.inCatalog && symSaved.label === 'Hutschienen-Netzteil' && symSaved.ports === 3 &&
    symSaved.symbolInDefs, JSON.stringify(symSaved));

  const symTile = await page.locator('#catalog .cat-custom').count();
  const symNew = await page.locator('#catalog .cat-new').count();
  check('Kachel in der Seitenleiste erschienen', symTile === 1 && symNew === 1, symTile + '/' + symNew);

  const symUse = await page.evaluate(() => {
    const d = NWT.Interaction.addDeviceAt('custom_1', 300, 1200);
    const el = document.querySelector('[data-id="' + d.id + '"] .node-icon');
    return { name: d.name, href: el.getAttribute('href'), ports: d.ports.length };
  });
  check('Gerät mit eigenem Symbol nutzbar',
    /^Hutschienen-Netzteil \d$/.test(symUse.name) && symUse.href === '#ic-custom_1' && symUse.ports === 3,
    JSON.stringify(symUse));

  const symExport = await page.evaluate(() => {
    const json = JSON.stringify(NWT.Model.serialize(NWT.Store.project));
    const back = NWT.Model.validate(JSON.parse(json));
    const svg = NWT.Exchange.buildSvgString();
    return {
      types: back.project.customTypes.length,
      label: back.project.customTypes[0].label,
      inSvg: svg.indexOf('ic-custom_1') > 0,
      warnings: back.warnings.length
    };
  });
  check('Eigenes Symbol übersteht Export und Import',
    symExport.types === 1 && symExport.label === 'Hutschienen-Netzteil' && symExport.inSvg,
    JSON.stringify(symExport));

  /* Sicherheit: Skripte und Fremdverweise werden entfernt */
  const symSanitize = await page.evaluate(() => {
    const evil = '<svg viewBox="0 0 24 24">' +
      '<script>window.__pwned = true;<\/script>' +
      '<rect x="2" y="2" width="20" height="20" onclick="alert(1)" fill="url(#x)"/>' +
      '<image href="http://example.com/a.png" x="0" y="0" width="24" height="24"/>' +
      '<a href="javascript:alert(1)"><circle cx="12" cy="12" r="5"/></a>' +
      '</svg>';
    const clean = NWT.Symbols.sanitizeSvg(evil);
    return {
      inner: clean ? clean.inner : '',
      pwned: !!window.__pwned,
      hasScript: /script/i.test(clean ? clean.inner : ''),
      hasOn: /onclick/i.test(clean ? clean.inner : ''),
      hasUrl: /url\(/i.test(clean ? clean.inner : ''),
      hasImage: /<image/i.test(clean ? clean.inner : ''),
      hasRect: /<rect/i.test(clean ? clean.inner : '')
    };
  });
  check('SVG-Filter entfernt Skript, Ereignisse, url() und Fremdbilder',
    !symSanitize.pwned && !symSanitize.hasScript && !symSanitize.hasOn &&
    !symSanitize.hasUrl && !symSanitize.hasImage && symSanitize.hasRect,
    JSON.stringify(symSanitize));

  const symImportEvil = await page.evaluate(() => {
    const raw = {
      name: 'Fremd', devices: [],
      customTypes: [{ id: 'custom_9', label: 'Böse', iconInner: '<script>window.__pwned2=1;<\/script><path d="M2 2h20"/>' }]
    };
    const res = NWT.Model.validate(raw);
    return {
      pwned: !!window.__pwned2,
      inner: res.project.customTypes[0] ? res.project.customTypes[0].iconInner : '',
      count: res.project.customTypes.length
    };
  });
  check('Importierte Fremdsymbole werden ebenfalls gefiltert',
    !symImportEvil.pwned && symImportEvil.count === 1 && !/script/i.test(symImportEvil.inner),
    JSON.stringify(symImportEvil));

  /* Löschen fragt nach, weil das Symbol benutzt wird — nicht auf das
     Promise warten, die Bestätigung kommt von außen. */
  await page.evaluate(() => { NWT.Symbols.remove('custom_1'); });
  await page.waitForTimeout(250);
  const confirmText = await page.locator('#modal .msg-body').textContent();
  check('Löschen warnt vor benutzten Symbolen', /Gerät\(en\) verwendet/.test(confirmText), confirmText);
  await page.locator('#modal .btn.danger').click();
  await page.waitForTimeout(300);
  const symGone = await page.evaluate(() => ({
    types: NWT.Store.project.customTypes.length,
    fallback: NWT.Store.project.devices.filter(d => d.type === 'custom_1').length
  }));
  check('Symbol gelöscht, Geräte auf Ersatztyp gesetzt',
    symGone.types === 0 && symGone.fallback === 0, JSON.stringify(symGone));

  await page.evaluate(() => { NWT.Viewport.zoomToFit(); NWT.Store.clearSelection(); NWT.Render.selection(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: outFile('smoke-final.png') });

  check('Keine JS-Fehler in der Konsole', errors.length === 0, errors.slice(0, 6).join(' || '));

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' Prüfungen bestanden');
  if (failed.length) {
    console.log('\nFehlgeschlagen:');
    failed.forEach(r => console.log('  ' + r.name + '   [' + r.extra + ']'));
    process.exitCode = 1;
  }
})().catch(e => {
  console.error('\nTESTLAUF ABGEBROCHEN: ' + (e && e.message ? e.message : e));
  process.exitCode = 2;
});
