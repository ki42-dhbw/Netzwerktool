/* Inventar, Plausibilitätsprüfung und portabler HTML-Bericht. */
NWT.Workbench = (function () {
  const U = NWT.Util, S = NWT.Store, C = NWT.Catalog, Net = NWT.Net;
  const esc = U.escapeHtml;
  const TABS = { devices: 'Geräte', interfaces: 'Schnittstellen', ports: 'Ports', connections: 'Verbindungen', checks: 'Netzplan-Prüfung' };
  function devices() { return S.project.devices.filter(d => C.shapeOf(d.type) === 'device'); }
  function check() {
    const findings = [], addresses = new Map(), occupied = new Map();
    const add = (kind, message, ids) => findings.push({ kind: kind, message: message, ids: ids || [] });
    devices().forEach(d => {
      Net.interfaces(d).forEach(i => {
        [i.ip, i.ipv6].filter(Boolean).forEach(value => {
          const normalized = Net.normalizeIp(value);
          if (!normalized || (String(value).includes('/') && !validPrefix(value))) add('Warnung', d.name + ': ungültige IP-Adresse „' + value + '“.', [d.id]);
          else {
            if (!addresses.has(normalized)) addresses.set(normalized, []);
            addresses.get(normalized).push({ device: d, iface: i });
          }
        });
        if (i.mac && !/^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(i.mac)) add('Warnung', d.name + ': MAC-Adresse prüfen („' + i.mac + '“).', [d.id]);
        if (i.vlan && !String(i.vlan).split(/[,;\s]+/).every(v => {
          const range = v.split('-').map(Number); return range.length <= 2 && range.every(n => Number.isInteger(n) && n >= 1 && n <= 4094) && (range.length === 1 || range[0] <= range[1]);
        })) add('Hinweis', d.name + ': VLAN-Angabe „' + i.vlan + '“ ist keine Liste aus IDs 1–4094.', [d.id]);
        if (i.port && !d.ports.some(p => p.name === i.port)) add('Warnung', d.name + ': Schnittstelle verweist auf unbekannten Port „' + i.port + '“.', [d.id]);
      });
      const names = new Set();
      d.ports.forEach(p => { if (names.has(p.name)) add('Warnung', d.name + ': Portname „' + p.name + '“ ist doppelt.', [d.id]); names.add(p.name); });
      if (!S.connectionsOf(d.id).length) add('Hinweis', d.name + ': keine Verbindung dokumentiert.', [d.id]);
    });
    addresses.forEach((entries, ip) => {
      const ids = Array.from(new Set(entries.map(e => e.device.id)));
      if (entries.length > 1) add('Warnung', 'IP-Adresse ' + ip + ' mehrfach vergeben: ' + entries.map(e => e.device.name + ' / ' + e.iface.name).join(', '), ids);
    });
    S.project.connections.forEach(c => {
      const a = S.dev(c.source), b = S.dev(c.target);
      if (!a || !b) { add('Fehler', 'Verbindung ' + c.id + ': Endpunkt fehlt.', [c.id]); return; }
      [[a, c.sourcePort], [b, c.targetPort]].forEach(pair => {
        const d = pair[0], port = pair[1]; if (!port) return;
        if (!d.ports.some(p => p.name === port)) add('Warnung', d.name + ': Verbindung nutzt unbekannten Port „' + port + '“.', [d.id, c.id]);
        const key = JSON.stringify([d.id, port]);
        if (!occupied.has(key)) occupied.set(key, []);
        occupied.get(key).push(c.id);
      });
      if (c.type !== 'logical') {
        const ai = Net.interfaces(a).find(i => i.port === c.sourcePort && i.ip) || Net.interfaces(a)[0];
        const bi = Net.interfaces(b).find(i => i.port === c.targetPort && i.ip) || Net.interfaces(b)[0];
        const na = Net.cidr(ai.ip), nb = Net.cidr(bi.ip);
        if (na && nb && na.text !== nb.text) add('Hinweis', a.name + ' ↔ ' + b.name + ': unterschiedliche IP-Netze; Routing oder Netzzuordnung prüfen.', [c.id]);
        if (c.vlan && [ai, bi].some(i => /^\d+$/.test(i.vlan) && /^\d+$/.test(c.vlan) && i.vlan !== c.vlan)) add('Hinweis', a.name + ' ↔ ' + b.name + ': VLAN der Leitung weicht von einer Schnittstelle ab.', [c.id]);
      }
    });
    occupied.forEach((ids, key) => { if (ids.length > 1) { const parts = JSON.parse(key); add('Warnung', S.dev(parts[0]).name + ': Port „' + parts[1] + '“ ist mit ' + ids.length + ' Leitungen belegt.', ids); } });
    return findings;
  }
  function validPrefix(value) {
    const parts = String(value).split('/');
    return parts.length === 2 && /^\d{1,3}$/.test(parts[1]) && Number(parts[1]) <= (parts[0].includes(':') ? 128 : 32);
  }
  function rows(tab) {
    if (tab === 'devices') return { headers: ['Name', 'Typ', 'IP', 'Hostname', 'Status', 'Standort', 'Letzte Beobachtung'], rows: devices().map(d => ({
      id: d.id, cells: [d.name, C.typeLabel(d.type), d.ip, d.hostname, (C.STATUS[d.status] || {}).label || d.status, [d.location, d.room, d.rack].filter(Boolean).join(' / '),
        (d.observations || []).length ? U.formatDate(d.observations[d.observations.length - 1].at) : '—'] })) };
    if (tab === 'interfaces') return { headers: ['Gerät', 'Schnittstelle', 'IPv4 / Präfix', 'IPv6 / Präfix', 'MAC', 'VLAN', 'Port'], rows: devices().reduce((list, d) => list.concat(Net.interfaces(d).map(i => ({ id: d.id, cells: [d.name, i.name, i.ip, i.ipv6, i.mac, i.vlan, i.port] }))), []) };
    if (tab === 'ports') return { headers: ['Gerät', 'Port', 'Verbindungen', 'Gegenstellen'], rows: devices().reduce((list, d) => list.concat(d.ports.map(p => {
      const links = S.project.connections.filter(c => (c.source === d.id && c.sourcePort === p.name) || (c.target === d.id && c.targetPort === p.name));
      return { id: d.id, cells: [d.name, p.name, links.length, links.map(c => { const other = S.dev(c.source === d.id ? c.target : c.source); return other ? other.name : 'Fehlend'; }).join(', ')] };
    })), []) };
    if (tab === 'connections') return { headers: ['Quelle', 'Port', 'Ziel', 'Port', 'Art', 'VLAN', 'Beschreibung'], rows: S.project.connections.map(c => ({ id: c.id,
      cells: [(S.dev(c.source) || {}).name || c.source, c.sourcePort, (S.dev(c.target) || {}).name || c.target, c.targetPort, C.connType(c.type).label, c.vlan, c.description] })) };
    return { headers: ['Einstufung', 'Befund'], rows: check().map(f => ({ id: f.ids[0], cells: [f.kind, f.message] })) };
  }
  function table(data, actions) {
    return '<div class="review-scroll"><table class="review-table"><thead><tr>' + data.headers.map(h => '<th scope="col">' + esc(h) + '</th>').join('') +
      (actions ? '<th scope="col">Aktion</th>' : '') + '</tr></thead><tbody>' + data.rows.map(r => '<tr data-search="' + esc(r.cells.join(' ').toLowerCase()) + '">' +
        r.cells.map(v => '<td>' + esc(v) + '</td>').join('') + (actions ? '<td><button type="button" data-edit="' + esc(r.id || '') + '">' + (actions === 'checks' ? 'Zeigen' : 'Bearbeiten') + '</button></td>' : '') + '</tr>').join('') + '</tbody></table></div>';
  }
  async function open(tab) {
    tab = Object.prototype.hasOwnProperty.call(TABS, tab) ? tab : 'devices';
    const data = rows(tab);
    const body = '<nav class="review-tabs" aria-label="Inventaransichten">' + Object.keys(TABS).map(k => '<button type="button" data-tab="' + k + '" aria-pressed="' + (k === tab) + '">' + TABS[k] + '</button>').join('') + '</nav>' +
      '<p>Die Prüfung liefert Hinweise zur Dokumentation. Busse, Trunks und geroutete Verbindungen können berechtigte Ausnahmen sein.</p>' +
      '<label>Filtern <input type="search" id="review-filter" autocomplete="off"></label><p role="status" id="review-count">' + data.rows.length + ' Einträge</p>' + table(data, tab);
    const result = await NWT.Modal.open({ title: TABS[tab], width: '1250px', bodyHtml: body,
      buttons: [{ label: 'Tabelle als CSV', value: 'csv' }, { label: 'Bericht exportieren', value: 'report' }, { label: 'Schließen', value: null }],
      onMount: (root, api) => {
        root.querySelector('#review-filter').oninput = e => {
          const query = e.target.value.toLowerCase(); let count = 0;
          root.querySelectorAll('tr[data-search]').forEach(row => { row.hidden = !row.dataset.search.includes(query); if (!row.hidden) count++; });
          root.querySelector('#review-count').textContent = count + ' Einträge';
        };
        root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => api.close({ tab: b.dataset.tab }));
        root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => api.close({ edit: b.dataset.edit }));
      } });
    if (!result) return;
    if (result.tab) return open(result.tab);
    if (result === 'csv') {
      U.downloadBlob(new Blob([Net.csvString([data.headers].concat(data.rows.map(r => r.cells)))], { type: 'text/csv;charset=utf-8' }), U.slugify(S.project.name) + '_' + tab + '.csv');
      return open(tab);
    }
    if (result === 'report') return exportReport();
    if (result.edit) {
      if (tab === 'checks') { S.select(result.edit); if (S.dev(result.edit)) NWT.Commands.focusDevice(result.edit); return; }
      if (tab === 'interfaces') await editInterfaces(result.edit);
      else if (tab === 'connections') await NWT.Dialogs.editConnection(result.edit);
      else await NWT.Dialogs.editDevice(result.edit);
      return open(tab);
    }
  }
  async function editInterfaces(id) {
    const d = S.dev(id); if (!d) return;
    const headings = ['Name', 'IPv4', 'IPv6', 'MAC', 'VLAN', 'Port'];
    const fields = ['name', 'ip', 'ipv6', 'mac', 'vlan', 'port'];
    const result = await NWT.Modal.form({ title: 'Weitere Schnittstellen: ' + d.name, width: '900px',
      subtitle: 'Die Hauptadresse bearbeiten Sie in den Geräteeigenschaften. Hier zusätzliche Anschlüsse ergänzen; eine Zeile pro Schnittstelle.',
      fields: [{ key: 'csv', label: 'Name; IPv4 / Präfix; IPv6 / Präfix; MAC; VLAN; Port', type: 'textarea', rows: 12, wide: true }],
      values: { csv: Net.csvString([headings].concat((d.interfaces || []).map(i => fields.map(k => i[k])))).replace(/^\uFEFF/, '') } });
    if (!result) return;
    try {
      const parsed = Net.csv(result.csv, ';');
      const body = parsed.length && parsed[0][0].toLowerCase() === 'name' ? parsed.slice(1) : parsed;
      if (body.length > 128 || body.some(row => row.length !== 6)) throw new Error('Bitte höchstens 128 Schnittstellen mit jeweils sechs Spalten eingeben.');
      const values = body.map(row => { const i = {}; fields.forEach((k, n) => i[k] = row[n]); return i; });
      if (S.dev(id) !== d) throw new Error('Das Projekt wurde während der Bearbeitung gewechselt.');
      NWT.History.record('Schnittstellen bearbeiten'); d.interfaces = NWT.Model.sanitizeInterfaces(values);
      S.touch(); NWT.emit('change', { structural: true });
    } catch (e) { await NWT.Modal.error('Schnittstellen konnten nicht übernommen werden.', e.message); }
  }
  function reportHtml(masked) {
    const body = NWT.Privacy.withMasking(!!masked, () => NWT.Exchange.buildSvgString());
    const svg = body.replace(/^<\?xml[^>]*>\s*/, '');
    // Inventartabellen enthalten Arbeitsdaten. Im maskierten Bericht wird nur
    // die maskierte Zeichnung ausgegeben, damit keine Metadaten hindurchrutschen.
    const title = masked ? 'Netzwerkbericht (maskiert)' : S.project.name;
    const tables = masked ? '<p>Inventar und Projektdaten sind in dieser maskierten Ausgabe ausgelassen.</p>' :
      '<p>' + esc(S.project.info.description) + '</p>' + ['devices', 'interfaces', 'ports', 'connections', 'checks'].map(tab => '<h2>' + TABS[tab] + '</h2>' + table(rows(tab), false)).join('');
    const safeSvg = masked ? svg.replace(/<title>[\s\S]*?<\/title>/, '<title>Netzwerkbericht</title>') : svg;
    return '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
      '<style>body{font:14px system-ui;color:#172033;background:white;margin:28px}h1{font-size:24px}h2{margin-top:32px}.diagram svg{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #64748b;padding:6px;text-align:left;overflow-wrap:anywhere}tr{break-inside:avoid}thead{display:table-header-group}@media print{body{margin:0}.diagram{break-after:page}h2{break-after:avoid}}</style>' +
      '<h1>' + esc(title) + '</h1><p>Erstellt: ' + esc(U.formatDate(U.nowIso())) + ' · Beobachtungen sind Momentaufnahmen, keine Live-Überwachung.</p><div class="diagram">' + safeSvg + '</div>' + tables + '</html>';
  }
  async function exportReport() {
    const result = await NWT.Modal.form({ title: 'Bericht exportieren', fields: [{ key: 'masked', label: 'Maskierte Zeichnung ohne Inventartabellen', type: 'checkbox', wide: true }],
      subtitle: 'Der HTML-Bericht lässt sich offline öffnen und über den Browser drucken oder als PDF speichern. Gerätefotos können weiterhin Angaben enthalten.',
      values: { masked: NWT.Privacy.active() }, submitLabel: 'Exportieren' });
    if (!result) return;
    U.downloadBlob(new Blob([reportHtml(result.masked)], { type: 'text/html;charset=utf-8' }), (result.masked ? 'netzwerk_maskiert' : U.slugify(S.project.name)) + '_bericht.html');
  }
  return { open, check, rows, editInterfaces, reportHtml, exportReport };
})();
