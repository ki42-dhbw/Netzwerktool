'use strict';
const assert = require('assert/strict');
const { launch, openApp, outFile } = require('./browser');
async function main() {
  const { browser } = await launch();
  let passed = 0, failed = 0;
  async function test(name, fn) {
    const page = await openApp(browser);
    try { await fn(page); assert.deepEqual(page.nwtErrors, []); console.log('OK  ' + name); passed++; }
    catch (e) { console.error('FEHLER ' + name + ': ' + e.stack); failed++; }
    finally { await page.close(); }
  }
  try {
    await test('Leeres Projekt mit eigenen Einstellungen wird wiederhergestellt', async page => {
      await page.evaluate(() => { NWT.Store.project.name = 'Leeres Vorlagenprojekt'; NWT.Store.project.settings.gridSize = 40; NWT.Persistence.autosave(); NWT.Persistence.autosave.flush(); });
      await page.reload();
      await page.waitForFunction(() => NWT.Store.project.name === 'Leeres Vorlagenprojekt');
      assert.equal(await page.evaluate(() => NWT.Store.project.settings.gridSize), 40);
    });
    await test('Geraeteeigenschaften sind per Tastatur erreichbar', async page => {
      await page.evaluate(() => { NWT.Interaction.addDeviceAt('pc', 0, 0); });
      await page.locator('#l-nodes > g.node').first().focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#modal').open);
      assert.ok(await page.locator('#fld_name').count());
      await page.keyboard.press('Escape');
    });
    await test('Enter speichert und native Dialogabschluesse loesen auf', async page => {
      await page.evaluate(() => { NWT.Store.addDevice('pc', 0, 0); NWT.Commands.saveProject(); });
      await page.locator('#fld_value').fill('Enter-Projekt');
      await page.locator('#fld_value').press('Enter');
      await page.waitForFunction(() => NWT.Persistence.listProjects().length === 1);
      assert.equal(await page.evaluate(() => NWT.Persistence.loadProject(NWT.Persistence.listProjects()[0].id).project.name), 'Enter-Projekt');
      await page.evaluate(() => { window.closedResult = 'pending'; NWT.Modal.prompt({ title: 'Probe' }).then(x => window.closedResult = x); document.querySelector('#modal').close(); });
      await page.waitForFunction(() => window.closedResult === null);
    });
    await test('Laden kann abgebrochen werden und sichert vor Verwerfen', async page => {
      await page.evaluate(() => { NWT.Store.addDevice('pc', 0, 0); NWT.Persistence.saveProject('Alt'); NWT.Store.addDevice('router', 200, 0); NWT.Commands.openProject(); });
      await page.locator('.plist-item').click();
      await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      assert.equal(await page.evaluate(() => NWT.Store.project.devices.length), 2);
      await page.evaluate(() => { NWT.Commands.openProject(); });
      await page.locator('.plist-item').click();
      await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
      await page.waitForFunction(() => NWT.Store.project.devices.length === 1);
      const restored = await page.evaluate(async () => { const list = await NWT.Recovery.list(); const e = list.find(x => x.reason === 'Vor Projektwechsel'); return (await NWT.Recovery.load(e.id)).project.devices.length; });
      assert.equal(restored, 2);
    });
    await test('Indexfehler meldet Misserfolg und rollt Daten zurueck', async page => {
      const result = await page.evaluate(() => {
        NWT.Persistence.saveProject('Alt');
        const key = Object.keys(localStorage).find(k => k.startsWith('nwt.project.')), before = localStorage.getItem(key);
        NWT.Store.addDevice('pc', 0, 0);
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k, v) { if (k === 'nwt.index') throw new DOMException('Test', 'QuotaExceededError'); return original.call(this, k, v); };
        let result; try { result = NWT.Persistence.saveProject('Alt'); } finally { Storage.prototype.setItem = original; }
        return { result, unchanged: localStorage.getItem(key) === before, failure: NWT.Persistence.status().failure };
      });
      assert.equal(result.result, false); assert.equal(result.unchanged, true); assert.ok(result.failure);
    });
    await test('Autosave erholt sich; Ladeliste bleibt bei Schreibfehler lesbar', async page => {
      const result = await page.evaluate(() => {
        NWT.Persistence.saveProject('Alt');
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k,v) { if (k === 'nwt.autosave') throw new DOMException('Test', 'QuotaExceededError'); return original.call(this,k,v); };
        try { NWT.Persistence.autosave(); NWT.Persistence.autosave.flush(); } finally { Storage.prototype.setItem = original; }
        const failed = NWT.Persistence.status().failure;
        NWT.Persistence.autosave(); NWT.Persistence.autosave.flush();
        return { failed, available: NWT.Persistence.available(), count: NWT.Persistence.listProjects().length, failure: NWT.Persistence.status().failure };
      });
      assert.ok(result.failed); assert.equal(result.available, true); assert.equal(result.count, 1); assert.equal(result.failure, '');
    });
    await test('Importvalidierung ist ohne Seiteneffekte und repariert Grenzfaelle', async page => {
      const result = await page.evaluate(() => {
        NWT.Symbols.save({ id:'custom_test',label:'Test',iconInner:'<rect width="12" height="12"/>' });
        const layers = NWT.Model.validate({ devices: [], layers: [null] });
        const p = NWT.Model.validate(JSON.parse('{"devices":[{"type":"pc","x":1e309}],"seq":1e309}')).project;
        let rejected = false; try { NWT.Model.validate({devices:[],version:999}); } catch(e) { rejected=true; }
        return { known: NWT.Catalog.known('custom_test'), inherited: NWT.Catalog.known('toString'), layers: layers.project.layers.length, x: p.devices[0].x, seq: p.seq, rejected };
      });
      assert.equal(result.known, true); assert.equal(result.inherited,false); assert.ok(result.layers); assert.ok(Number.isFinite(result.x)); assert.ok(Number.isFinite(result.seq)); assert.equal(result.rejected,true);
    });
    await test('Abgebrochener Import erhaelt eigene Symbole', async page => {
      await page.evaluate(() => { NWT.Symbols.save({id:'custom_test',label:'Test',iconInner:'<rect width="12" height="12"/>'}); NWT.Store.addDevice('custom_test',0,0); NWT.Exchange.importFile(new File(['{"devices":[]}'],'probe.json')); });
      await page.getByRole('button',{name:'Abbrechen',exact:true}).click();
      assert.equal(await page.evaluate(() => NWT.Catalog.known('custom_test')),true);
    });
    await test('Symbol-Undo/Redo und Typwechsel funktionieren', async page => {
      const result = await page.evaluate(() => {
        NWT.Symbols.save({id:'custom_test',label:'Test',iconInner:'<rect width="12" height="12"/>'});
        NWT.History.undo(); const removed=!NWT.Catalog.known('custom_test') && !document.getElementById('ic-custom_test');
        NWT.History.redo(); return removed && NWT.Catalog.known('custom_test') && !!document.getElementById('ic-custom_test');
      }); assert.equal(result,true);
      await page.evaluate(() => { const d=NWT.Store.addDevice('pc',0,0); window.deviceId=d.id; NWT.Dialogs.editDevice(d.id); });
      await page.locator('#fld_type').selectOption('custom_test'); await page.getByRole('button',{name:'Übernehmen',exact:true}).click();
      assert.equal(await page.evaluate(() => NWT.Store.dev(window.deviceId).type),'custom_test');
    });
    await test('Scanuebernahme wiederholbar, auch nach Undo und Projektwechsel', async page => {
      const result = await page.evaluate(() => {
        const scan=NWT.Discovery.analyze(JSON.stringify({tool:'nwt-scan',generated:'2026-09-14T10:00:00Z',subnets:['10.20.0.0/16'],hosts:[{ip:'10.20.5.10',ping:true,discovery:['icmp']}]}));
        NWT.Discovery.apply(scan.hosts,{}); NWT.Discovery.apply(scan.hosts,{});
        const one=NWT.Store.project.devices.length;
        NWT.History.undo(); NWT.History.undo(); NWT.Discovery.apply(scan.hosts,{});
        const afterUndo=NWT.Store.project.devices.length;
        NWT.Store.setProject(NWT.Model.emptyProject()); NWT.Discovery.apply(scan.hosts,{});
        return {one,afterUndo,afterSwitch:NWT.Store.project.devices.length,subnet:scan.hosts[0].subnet,observations:NWT.Store.project.devices[0].observations.length};
      }); assert.deepEqual(result,{one:1,afterUndo:1,afterSwitch:1,subnet:'10.20.0.0/16',observations:1});
    });
    await test('CSV unterstuetzt Zitate, Trennzeichen und Zeilenumbrueche', async page => {
      const result=await page.evaluate(() => {
        const scan=NWT.Discovery.analyze('ip;hostname;raum\n10.20.0.10;"server;backup";"Raum\n1"');
        return {name:scan.hosts[0].hostname,room:scan.hosts[0].room,cells:NWT.Net.csv('a;b\n"a""b";c')[1]};
      }); assert.deepEqual(result,{name:'server;backup',room:'Raum\n1',cells:['a"b','c']});
    });
    await test('Fokus bleibt im Overlay; Katalog per Tastatur nutzbar', async page => {
      await page.locator('#canvas').focus(); await page.keyboard.press('Control+,');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('#set-overlay')),true);
      await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('#set-overlay')),true);
      await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.activeElement.id),'canvas');
      await page.locator('.cat-item[data-type="pc"]').focus(); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => NWT.Store.project.devices.length),1);
    });
    await test('Schnittstellen bearbeitbar und round-trip-faehig', async page => {
      await page.evaluate(() => { const d=NWT.Store.addDevice('pc',0,0); window.deviceId=d.id; NWT.Workbench.editInterfaces(d.id); });
      await page.locator('#fld_csv').fill('Name;IPv4;IPv6;MAC;VLAN;Port\neth1;10.20.0.10/16;fd00::1/64;00:11:22:33:44:55;20;eth1');
      await page.getByRole('button',{name:'Übernehmen',exact:true}).click();
      const result=await page.evaluate(() => NWT.Model.validate(NWT.Model.serialize(NWT.Store.project)).project.devices[0].interfaces[0]);
      assert.equal(result.ip,'10.20.0.10/16'); assert.equal(result.ipv6,'fd00::1/64');
    });
    await test('Pruefung erkennt doppelte IP und Portbelegung', async page => {
      const result=await page.evaluate(() => {
        const a=NWT.Store.addDevice('pc',0,0), b=NWT.Store.addDevice('pc',300,0), c=NWT.Store.addDevice('pc',600,0);
        a.ip=b.ip='10.0.0.1'; a.ports=[{name:'eth0'}];
        NWT.Store.addConnection(a.id,b.id).sourcePort='eth0'; NWT.Store.addConnection(a.id,c.id).sourcePort='eth0';
        return NWT.Workbench.check().map(f=>f.message).join('\n');
      }); assert.match(result,/mehrfach vergeben/); assert.match(result,/2 Leitungen/);
      await page.evaluate(() => { NWT.Workbench.open('checks'); });
      await page.locator('#review-filter').fill('mehrfach'); assert.equal(await page.locator('.review-table tbody tr:visible').count(),1);
      await page.screenshot({path:outFile('view-netzpruefung.png')});
    });
    await test('Anordnung ist kollisionsfrei und rueckgaengig', async page => {
      const result=await page.evaluate(() => {
        const a=NWT.Store.addDevice('router',0,0), b=NWT.Store.addDevice('pc',0,0), c=NWT.Store.addDevice('pc',0,0);
        NWT.Store.addConnection(a.id,b.id); NWT.Store.addConnection(a.id,c.id);
        const n=NWT.Layout.arrange({}); const rects=NWT.Store.project.devices.map(d=>NWT.Store.deviceRect(d));
        const overlap=rects.some((r,i)=>rects.some((s,j)=>i!==j && NWT.Util.rectsIntersect(r,s)));
        NWT.History.undo(); return {n,overlap,restored:NWT.Store.project.devices.every(d=>d.x===0 && d.y===0)};
      }); assert.deepEqual(result,{n:3,overlap:false,restored:true});
    });
    await test('Hindernisumweg um mittlere Kachel',async page=>{
      const result=await page.evaluate(()=>{
        const a=NWT.Store.addDevice('pc',0,100),b=NWT.Store.addDevice('pc',600,100);NWT.Store.addDevice('pc',300,100);
        const c=NWT.Store.addConnection(a.id,b.id);NWT.Store.project.settings.avoidObstacles=true;
        return NWT.Geometry.route(c,'orthogonal').d;
      });assert.match(result,/L|Q/);assert.notEqual(result,'M132 144 L600 144');
    });
    await test('HTML-Bericht eigenstaendig und maskierte Ausgabe ohne Inventar',async page=>{
      const html=await page.evaluate(()=>{const d=NWT.Store.addDevice('pc',0,0);d.ip='10.11.12.13';d.hostname='privater-host';NWT.Store.project.name='Privatprojekt';NWT.Render.all();return {full:NWT.Workbench.reportHtml(false),masked:NWT.Workbench.reportHtml(true)};});
      assert.match(html.full,/10\.11\.12\.13/);assert.doesNotMatch(html.masked,/10\.11\.12\.13|privater-host|Privatprojekt/);
      await page.setContent(html.full);assert.ok(await page.locator('svg .node').count());assert.ok(await page.locator('table').count());
    });
    await test('IndexedDB-Sicherung mit Bild dedupliziert und nach Reload lesbar',async page=>{
      const id=await page.evaluate(async()=>{const d=NWT.Store.addDevice('pc',0,0);const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;d.image=canvas.toDataURL();NWT.Store.project.typeImages.pc=d.image;await NWT.Recovery.capture('Bildtest');const list=await NWT.Recovery.list();return list.find(x=>x.reason==='Bildtest').id;});
      await page.reload();await page.waitForTimeout(150);
      const result=await page.evaluate(async id=>{const entry=(await NWT.Recovery.list()).find(x=>x.id===id);const p=(await NWT.Recovery.load(id)).project;return {assets:entry.assets.length,image:p.devices[0].image,match:p.devices[0].image===p.typeImages.pc};},id);
      assert.equal(result.assets,1);assert.equal(result.match,true);assert.match(result.image,/^data:image/);
    });
    await test('500 Geraete: Bildcache und Sammelindex wirksam',async page=>{
      const result=await page.evaluate(()=>{
        let calls=0;const original=NWT.Store.reindex;NWT.Store.reindex=function(){if(!this.batchDepth)calls++;return original.call(this);};
        NWT.Store.batch(()=>{for(let i=0;i<500;i++)NWT.Store.addDevice('pc',(i%25)*160,Math.floor(i/25)*120);});
        NWT.Store.reindex=original;NWT.Render.all();const before=performance.now();NWT.Render.all();const ms=performance.now()-before;
        return {calls,n:NWT.Store.index.dev.size,ms};
      });assert.equal(result.calls,1);assert.equal(result.n,500);assert.ok(result.ms<5000);console.log('    500 Geraete: '+result.ms.toFixed(1)+' ms');
    });
  } finally { await browser.close(); }
  console.log(passed+'/'+(passed+failed)+' Regressionstests bestanden');
  if(failed)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
