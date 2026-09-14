/* Sicherungsverlauf in IndexedDB: transaktional, mit gemeinsam abgelegten Bildern.
   Der bisherige Browser-Speicher bleibt lesbar; alte Sicherungen werden kopiert. */
NWT.Recovery = (function () {
  const U = NWT.Util;
  let database = null, queue = Promise.resolve(), lastAuto = 0, archiveError = '';
  function ready() {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open('nwt-recovery', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('snapshots', { keyPath: 'id' });
        db.createObjectStore('assets', { keyPath: 'id' });
        db.createObjectStore('meta');
      };
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Sicherungsdatenbank wird durch ein anderes Fenster blockiert.'));
    });
    database.catch(() => { database = null; });
    return database;
  }
  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Sicherung abgebrochen.'));
    });
  }
  function request(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async function pack(project) {
    const data = [], ids = new Map();
    const json = JSON.stringify(project, (key, value) => {
      if (typeof value !== 'string' || !/^data:image\//i.test(value)) return value;
      if (!ids.has(value)) { ids.set(value, data.length); data.push(value); }
      return { __recoveryImage: ids.get(value) };
    });
    const assets = await Promise.all(data.map(async value => {
      const bytes = new TextEncoder().encode(value);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const id = Array.from(new Uint8Array(hash)).map(n => n.toString(16).padStart(2, '0')).join('');
      return { id: id, data: value };
    }));
    return { json: json, assets: assets };
  }
  function capture(reason, automatic, project) {
    if (automatic && Date.now() - lastAuto < 30000) return Promise.resolve(false);
    const data = NWT.Model.serialize(project || NWT.Store.project);
    const work = async () => {
      const packed = await pack(data), db = await ready();
      const tx = db.transaction(['snapshots', 'assets'], 'readwrite');
      const finished = done(tx), snapshots = tx.objectStore('snapshots');
      const entry = { id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2),
        name: data.name, at: U.nowIso(), reason: reason, json: packed.json, assets: packed.assets.map(a => a.id) };
      packed.assets.forEach(a => tx.objectStore('assets').put(a));
      snapshots.put(entry);
      const allReq = snapshots.getAll();
      allReq.onsuccess = () => {
        const all = allReq.result.sort((a, b) => b.at.localeCompare(a.at));
        all.slice(30).forEach(e => snapshots.delete(e.id));
        const used = new Set();
        all.slice(0, 30).forEach(e => e.assets.forEach(id => used.add(id)));
        const cursor = tx.objectStore('assets').openKeyCursor();
        cursor.onsuccess = () => { const c = cursor.result; if (c) { if (!used.has(c.key)) tx.objectStore('assets').delete(c.key); c.continue(); } };
      };
      await finished;
      lastAuto = Date.now(); archiveError = '';
      NWT.emit('recovery:status');
      return true;
    };
    const result = queue.catch(() => {}).then(work);
    queue = result;
    result.catch(e => { archiveError = e.message; NWT.emit('recovery:status'); });
    return result;
  }
  async function list() {
    await queue.catch(() => {});
    const db = await ready();
    return (await request(db.transaction('snapshots').objectStore('snapshots').getAll())).sort((a, b) => b.at.localeCompare(a.at));
  }
  async function load(id) {
    const db = await ready(), tx = db.transaction(['snapshots', 'assets']);
    const entry = await request(tx.objectStore('snapshots').get(id));
    if (!entry) throw new Error('Die Sicherung wurde nicht gefunden.');
    // Neue Transaktion, da ein Browser die vorherige nach dem await abschließen darf.
    const assetTx = db.transaction('assets');
    const assets = await Promise.all(entry.assets.map(key => request(assetTx.objectStore('assets').get(key))));
    const raw = JSON.parse(entry.json, (key, value) => {
      if (value && typeof value === 'object' && Object.keys(value).length === 1 && Number.isInteger(value.__recoveryImage)) {
        const asset = assets[value.__recoveryImage];
        if (!asset) throw new Error('Ein Bild der Sicherung fehlt.');
        return asset.data;
      }
      return value;
    });
    return NWT.Model.validate(raw);
  }
  async function remove(id) {
    const db = await ready(), tx = db.transaction('snapshots', 'readwrite'), finished = done(tx);
    tx.objectStore('snapshots').delete(id); await finished;
  }
  async function open() {
    try {
      const entries = await list();
      let bytes = 0;
      try { Object.keys(localStorage).forEach(k => { if (k.startsWith('nwt.')) bytes += (k.length + localStorage.getItem(k).length) * 2; }); } catch (e) {}
      let capacity = '';
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        capacity = ' · Browserbudget: ' + NWT.Images.formatBytes(estimate.usage || 0) + ' / ' + NWT.Images.formatBytes(estimate.quota || 0);
      }
      const html = '<p>Bis zu 30 Wiederherstellungspunkte. Browser-Projekte: ca. ' + NWT.Images.formatBytes(bytes) + U.escapeHtml(capacity) +
        '. Eine JSON-Datei dient als unabhängige Sicherung.</p>' + (archiveError ? '<p>' + U.escapeHtml(archiveError) + '</p>' : '') +
        '<div class="review-scroll"><table class="review-table"><thead><tr><th>Projekt</th><th>Zeitpunkt</th><th>Anlass</th><th>Aktionen</th></tr></thead><tbody>' +
        entries.map(e => '<tr><td>' + U.escapeHtml(e.name) + '</td><td>' + U.escapeHtml(U.formatDate(e.at)) + '</td><td>' + U.escapeHtml(e.reason) +
          '</td><td><button type="button" data-restore="' + e.id + '">Wiederherstellen</button> <button type="button" data-remove="' + e.id + '">Löschen</button></td></tr>').join('') +
        '</tbody></table></div>';
      const action = await NWT.Modal.open({ title: 'Sicherungsverlauf', width: '1000px', bodyHtml: html,
        buttons: [{ label: 'Jetzt sichern', value: 'capture' }, { label: 'JSON exportieren', value: 'export' }, { label: 'Schließen', value: null }],
        onMount: (root, api) => {
          root.querySelectorAll('[data-restore]').forEach(b => b.onclick = () => api.close({ restore: b.dataset.restore }));
          root.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => api.close({ remove: b.dataset.remove }));
        } });
      if (!action) return;
      if (action === 'capture') { await capture('Manueller Wiederherstellungspunkt'); return open(); }
      if (action === 'export') return NWT.Exchange.exportJson();
      if (action.remove) {
        if (await NWT.Modal.confirm({ title: 'Sicherung löschen?', message: 'Diesen Wiederherstellungspunkt entfernen?', danger: true })) await remove(action.remove);
        return open();
      }
      if (action.restore) {
        const result = await load(action.restore);
        await NWT.ProjectFlow.replace(() => { NWT.Store.setProject(result.project); NWT.Persistence.markDirty(); }, 'Sicherung wiederherstellen');
      }
    } catch (e) { NWT.Modal.error('Der Sicherungsverlauf ist nicht verfügbar. Bitte JSON exportieren.', e.message); }
  }
  async function init() {
    try {
      const db = await ready();
      const migrated = await request(db.transaction('meta').objectStore('meta').get('legacyImported'));
      if (!migrated) {
        const keys = Object.keys(localStorage).filter(k => k === 'nwt.autosave' || k.startsWith('nwt.project.'));
        for (const key of keys) {
          let project;
          try { project = NWT.Model.validate(JSON.parse(localStorage.getItem(key))).project; }
          catch (e) { continue; /* Unlesbare Altdateien bleiben für manuelle Rettung erhalten. */ }
          // Schreibfehler brechen die Migration ab: beim nächsten Start erneut versuchen.
          await capture('Aus bisherigem Browser-Speicher übernommen', false, project);
        }
        const tx = db.transaction('meta', 'readwrite'), finished = done(tx);
        tx.objectStore('meta').put(true, 'legacyImported'); await finished;
      }
    } catch (e) { archiveError = e.message; NWT.emit('recovery:status'); }
  }
  return { init, capture, list, load, remove, open, ready, error: () => archiveError };
})();

NWT.ProjectFlow = (function () {
  let busy = false;
  async function replace(action, title) {
    if (busy) return false;
    busy = true;
    try {
      const P = NWT.Persistence, S = NWT.Store;
      if (P.status().dirty) {
        const choice = await NWT.Modal.open({ title: title || 'Projekt wechseln',
          bodyHtml: '<p>Das aktuelle Projekt enthält Änderungen. Vor dem Wechsel im Browser sichern?</p>',
          buttons: [{ label: 'Abbrechen', value: null }, { label: 'Verwerfen', value: 'discard' }, { label: 'Sichern', value: 'save', primary: true }] });
        if (!choice) return false;
        if (choice === 'save' && !await NWT.Commands.saveProject()) return false;
      }
      if (S.project.devices.length || S.project.areas.length || S.project.customTypes.length) {
        try { await NWT.Recovery.capture('Vor Projektwechsel'); }
        catch (e) {
          if (!await NWT.Modal.confirm({ title: 'Wiederherstellungskopie fehlgeschlagen', message: 'Bitte bei Bedarf zuvor JSON exportieren. Trotzdem wechseln?', confirmLabel: 'Wechseln' })) return false;
        }
      }
      P.autosave.cancel();
      await action();
      return true;
    } finally { busy = false; }
  }
  return { replace };
})();
