/* ============================================================
   21 — Dashboard
   Zwei Ansichten in einem Vollbild-Overlay:
     „Übersicht“  — Auswertung des Projekts
     „Erkennung“  — Ergebnis der letzten Netzwerkanalyse mit
                    Auswahl und Übernahme ins Projekt
   ============================================================ */

NWT.Dashboard = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;

  let overlay = null;
  let tab = 'overview';

  /* ------------------------------------------------------------ Gerüst */

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'dash-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Dashboard');
    overlay.innerHTML =
      '<div class="dash">' +
        '<header class="dash-top">' +
          '<div class="dash-brand"><b>Dashboard</b><span id="dash-sub"></span></div>' +
          '<div class="dash-tabs">' +
            '<button type="button" class="dash-tab" data-tab="overview">Übersicht</button>' +
            '<button type="button" class="dash-tab" data-tab="discovery">Erkennung</button>' +
          '</div>' +
          '<button type="button" class="help-btn primary" data-dash-close>Schließen (Esc)</button>' +
        '</header>' +
        '<div class="dash-body"></div>' +
      '</div>';
    overlay.querySelector('[data-dash-close]').addEventListener('click', close);
    overlay.querySelectorAll('.dash-tab').forEach(b => {
      b.addEventListener('click', () => { tab = b.getAttribute('data-tab'); render(); });
    });
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function open(which) {
    ensure();
    if (which) tab = which;
    overlay.classList.add('on');
    document.body.classList.add('help-open');
    NWT.Tooltip && NWT.Tooltip.hide();
    render();
    NWT.Focus.enter(overlay);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('on');
    document.body.classList.remove('help-open');
    NWT.Focus.leave(overlay);
  }

  function isOpen() { return !!overlay && overlay.classList.contains('on'); }

  function render() {
    if (!overlay) return;
    overlay.querySelectorAll('.dash-tab').forEach(b =>
      b.classList.toggle('on', b.getAttribute('data-tab') === tab));
    const body = overlay.querySelector('.dash-body');
    const sub = overlay.querySelector('#dash-sub');
    sub.textContent = S.project.name;
    body.innerHTML = tab === 'discovery' ? discoveryHtml() : overviewHtml();
    if (tab === 'discovery') wireDiscovery(body);
  }

  /* ------------------------------------------------------- Übersicht */

  function bar(label, value, max, color) {
    const pct = max > 0 ? Math.round(value / max * 100) : 0;
    return '<div class="bar-row">' +
      '<span class="bar-label">' + U.escapeHtml(label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%;background:' +
        (color || '#2563eb') + '"></span></span>' +
      '<span class="bar-value">' + value + '</span>' +
    '</div>';
  }

  function card(title, inner, note) {
    return '<section class="dash-card"><h3>' + U.escapeHtml(title) + '</h3>' + inner +
      (note ? '<div class="dash-note">' + note + '</div>' : '') + '</section>';
  }

  function overviewHtml() {
    const P = S.project;
    const devs = P.devices.filter(d => C.shapeOf(d.type) === 'device');
    const total = devs.length;

    /* Kennzahlen */
    const img = NWT.Images.stats();
    const kpis = [
      ['Geräte', total],
      ['Verbindungen', P.connections.length],
      ['Bereiche', P.areas.length],
      ['Ebenen', P.layers.length],
      ['Fotos', img.count],
      ['Bilddaten', NWT.Images.formatBytes(img.bytes)]
    ];
    const kpiHtml = '<div class="kpi-row">' + kpis.map(k =>
      '<div class="kpi"><b>' + U.escapeHtml(String(k[1])) + '</b><span>' + U.escapeHtml(k[0]) + '</span></div>'
    ).join('') + '</div>';

    /* Kategorien */
    const byCat = {};
    devs.forEach(d => { const c = C.type(d.type).cat; byCat[c] = (byCat[c] || 0) + 1; });
    const maxCat = Math.max(1, ...Object.values(byCat));
    const catHtml = C.CATEGORIES.filter(c => byCat[c.id])
      .map(c => bar(c.label, byCat[c.id], maxCat, '#2563eb')).join('') ||
      '<div class="dash-empty">Noch keine Geräte.</div>';

    /* Status */
    const byStatus = {};
    devs.forEach(d => { byStatus[d.status || 'unknown'] = (byStatus[d.status || 'unknown'] || 0) + 1; });
    const maxSt = Math.max(1, ...Object.values(byStatus));
    const stHtml = Object.keys(C.STATUS).filter(k => byStatus[k])
      .map(k => bar(C.STATUS[k].label, byStatus[k], maxSt, C.STATUS[k].color)).join('') ||
      '<div class="dash-empty">Kein Status gesetzt.</div>';

    /* Subnetze */
    const subnets = {};
    devs.forEach(d => {
      const ip = (d.ip || '').split('/')[0];
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return;
      const key = ip.split('.').slice(0, 3).join('.') + '.0/24';
      (subnets[key] = subnets[key] || []).push(ip);
    });
    const subKeys = Object.keys(subnets).sort();
    const subHtml = subKeys.length
      ? '<table class="dash-table"><thead><tr><th>Netz</th><th>Adressen</th><th>Bereich</th></tr></thead><tbody>' +
        subKeys.map(k => {
          const list = subnets[k].map(ip => Number(ip.split('.')[3])).sort((a, b) => a - b);
          return '<tr><td>' + U.escapeHtml(k) + '</td><td>' + list.length + '</td><td>.' +
            list[0] + ' – .' + list[list.length - 1] + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="dash-empty">Keine IP-Adressen erfasst.</div>';

    /* VLANs */
    const vlans = {};
    devs.forEach(d => { if (d.vlan) vlans[d.vlan] = (vlans[d.vlan] || 0) + 1; });
    P.connections.forEach(c => { if (c.vlan) vlans[c.vlan] = (vlans[c.vlan] || 0) + 1; });
    const vlanHtml = Object.keys(vlans).length
      ? '<div class="chip-row">' + Object.keys(vlans).sort((a, b) => Number(a) - Number(b))
          .map(v => '<span class="chip">VLAN ' + U.escapeHtml(v) + ' <b>' + vlans[v] + '</b></span>').join('') + '</div>'
      : '<div class="dash-empty">Keine VLANs vergeben.</div>';

    /* Verbindungstypen */
    const byType = {};
    P.connections.forEach(c => { byType[c.type] = (byType[c.type] || 0) + 1; });
    const maxCt = Math.max(1, ...Object.values(byType));
    const ctHtml = Object.keys(byType).length
      ? Object.keys(byType).map(t => bar(C.connType(t).label, byType[t], maxCt, S.edgeStyle({ type: t }).color)).join('')
      : '<div class="dash-empty">Noch keine Verbindungen.</div>';

    /* Dokumentationsgrad */
    const missing = {
      'IP-Adresse': devs.filter(d => !d.ip).length,
      'Hostname': devs.filter(d => !d.hostname).length,
      'MAC-Adresse': devs.filter(d => !d.mac).length,
      'Standort/Raum': devs.filter(d => !d.room && !d.location).length,
      'Hersteller/Modell': devs.filter(d => !d.manufacturer && !d.model).length,
      'Foto': devs.filter(d => !d.image).length
    };
    const docHtml = total
      ? Object.keys(missing).map(k => {
          const done = total - missing[k];
          const pct = Math.round(done / total * 100);
          return '<div class="bar-row"><span class="bar-label">' + k + '</span>' +
            '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%;background:' +
            (pct > 80 ? '#16a34a' : pct > 40 ? '#f59e0b' : '#dc2626') + '"></span></span>' +
            '<span class="bar-value">' + pct + ' %</span></div>';
        }).join('')
      : '<div class="dash-empty">Noch keine Geräte.</div>';

    /* Isolierte Geräte */
    const lonely = devs.filter(d => !S.connectionsOf(d.id).length);
    const lonelyHtml = lonely.length
      ? '<div class="chip-row">' + lonely.slice(0, 24).map(d =>
          '<button type="button" class="chip chip-btn" data-goto="' + d.id + '">' +
          U.escapeHtml(U.truncate(d.name, 22)) + '</button>').join('') +
        (lonely.length > 24 ? '<span class="chip">… ' + (lonely.length - 24) + ' weitere</span>' : '') + '</div>'
      : '<div class="dash-empty">Alle Geräte sind verbunden.</div>';

    /* Modellbahn */
    const mb = devs.filter(d => C.type(d.type).cat === 'mobra');
    let mbHtml = '';
    if (mb.length) {
      const proto = {};
      mb.forEach(d => {
        (d.protocol || '').split(/[,;/]/).map(s => s.trim()).filter(Boolean)
          .forEach(p => { proto[p] = (proto[p] || 0) + 1; });
      });
      mbHtml = card('Modellbahn-Digitalkomponenten',
        '<div class="kpi-row small">' +
          '<div class="kpi"><b>' + mb.length + '</b><span>Komponenten</span></div>' +
          '<div class="kpi"><b>' + mb.filter(d => /^mb_(ecos|cs3|z21|intellibox|dr5000|mx10|tams|dccex)$/.test(d.type)).length +
            '</b><span>Zentralen</span></div>' +
          '<div class="kpi"><b>' + mb.filter(d => d.type === 'mb_booster').length + '</b><span>Booster</span></div>' +
          '<div class="kpi"><b>' + mb.filter(d => d.type === 'mb_feedback').length + '</b><span>Rückmelder</span></div>' +
        '</div>' +
        (Object.keys(proto).length
          ? '<div class="chip-row">' + Object.keys(proto).map(p =>
              '<span class="chip">' + U.escapeHtml(p) + ' <b>' + proto[p] + '</b></span>').join('') + '</div>'
          : '<div class="dash-note">Tipp: Feld <b>Protokoll / Bus</b> füllen (z.&nbsp;B. „DCC, mfx“), dann erscheint hier eine Auswertung.</div>'));
    }

    return '<div class="dash-inner">' +
      kpiHtml +
      '<div class="dash-grid">' +
        card('Geräte nach Kategorie', catHtml) +
        card('Betriebsstatus', stHtml) +
        card('IP-Netze', subHtml) +
        card('VLANs', vlanHtml) +
        card('Verbindungsarten', ctHtml) +
        card('Dokumentationsgrad', docHtml, 'Anteil der Geräte, bei denen das Feld gefüllt ist.') +
        card('Nicht verbundene Geräte', lonelyHtml, 'Klick springt zum Gerät.') +
        mbHtml +
      '</div>' +
    '</div>';
  }

  /* ------------------------------------------------------- Erkennung */

  function discoveryHtml() {
    const r = NWT.Discovery.last();
    if (!r) {
      return '<div class="dash-inner"><div class="dash-placeholder">' +
        '<h3>Noch keine Analyse durchgeführt</h3>' +
        '<p>Ein Browser darf aus Sicherheitsgründen selbst keine Netzwerkscans ausführen — ' +
        'kein ICMP, keine Rohsockets, kein Portscan. Deshalb liest dieses Programm die Ausgabe ' +
        'der Werkzeuge, die auf Ihrem Rechner schon vorhanden sind.</p>' +
        '<p>Zwei Wege:</p>' +
        '<ol>' +
          '<li><b>Analyse-Skript ausführen.</b> Das mitgelieferte Skript ermittelt erreichbare Hosts, ' +
          'MAC-Adressen, Namen und offene Ports und schreibt eine JSON-Datei, die hier eingelesen wird.</li>' +
          '<li><b>Ausgabe einfügen.</b> Führen Sie z.&nbsp;B. <code>arp -a</code>, ' +
          '<code>nmap -sn 192.168.1.0/24</code> oder <code>show lldp neighbors detail</code> aus und ' +
          'fügen Sie die Ausgabe ein.</li>' +
        '</ol>' +
        '<div class="dash-actions">' +
          '<button type="button" class="btn primary" data-dash-paste>Netzwerkdaten einlesen …</button>' +
          '<button type="button" class="btn" data-dash-script>Analyse-Skript anzeigen …</button>' +
        '</div>' +
      '</div></div>';
    }

    const neu = r.hosts.filter(h => h.state === 'neu').length;
    const known = r.hosts.length - neu;
    const withMac = r.hosts.filter(h => h.mac).length;
    const withPorts = r.hosts.filter(h => h.ports.length).length;

    const devOptions = S.project.devices
      .filter(d => C.shapeOf(d.type) === 'device')
      .map(d => '<option value="' + d.id + '">' + U.escapeHtml(U.truncate(d.name, 34)) + '</option>').join('');

    const rows = r.hosts.map((h, i) => {
      const t = C.type(h.guessType);
      return '<tr class="' + (h.state === 'neu' ? 'is-new' : 'is-known') + '">' +
        '<td><input type="checkbox" data-host="' + i + '"' + (h.selected ? ' checked' : '') + '></td>' +
        '<td class="mono">' + U.escapeHtml(h.ip || '—') + '</td>' +
        '<td class="mono">' + U.escapeHtml(h.mac || '—') + '</td>' +
        '<td>' + U.escapeHtml(h.hostname || '—') + '</td>' +
        '<td>' + U.escapeHtml(h.vendor || '—') + '</td>' +
        '<td><span class="type-chip" style="color:' + t.color + '">' + U.escapeHtml(t.label) + '</span>' +
          '<div class="why">' + U.escapeHtml(h.guessReason) + ' · ' + h.confidence + '</div></td>' +
        '<td class="mono small">' + (h.ports.length
            ? U.escapeHtml(h.ports.slice(0, 6).map(p => p.port + '/' + p.proto).join(' ')) +
              (h.ports.length > 6 ? ' +' + (h.ports.length - 6) : '')
            : '—') + '</td>' +
        '<td>' + (h.state === 'neu'
            ? '<span class="tag tag-new">neu</span>'
            : '<span class="tag tag-known">bekannt (' + U.escapeHtml(h.matchedBy) + ')</span>') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="dash-inner">' +
      '<div class="kpi-row">' +
        '<div class="kpi"><b>' + r.hosts.length + '</b><span>Hosts gefunden</span></div>' +
        '<div class="kpi"><b>' + neu + '</b><span>neu</span></div>' +
        '<div class="kpi"><b>' + known + '</b><span>bereits im Projekt</span></div>' +
        '<div class="kpi"><b>' + withMac + '</b><span>mit MAC</span></div>' +
        '<div class="kpi"><b>' + withPorts + '</b><span>mit Portdaten</span></div>' +
        '<div class="kpi"><b>' + (r.subnets.length || '—') + '</b><span>Netze</span></div>' +
        '<div class="kpi"><b>' + ((r.ipLinks || []).length || '—') + '</b><span>Verbindungen</span></div>' +
      '</div>' +

      '<div class="dash-meta">' +
        'Quellen: <b>' + U.escapeHtml(r.sources.join(', ') || 'unbekannt') + '</b>' +
        (r.local.gateway ? ' · Gateway <b class="mono">' + U.escapeHtml(r.local.gateway) + '</b>' : '') +
        (r.subnets.length ? ' · Netze <b class="mono">' + U.escapeHtml(r.subnets.join(', ')) + '</b>' : '') +
        (r.links.length ? ' · ' + r.links.length + ' Nachbarschaften (LLDP/CDP)' : '') +
        (r.meta && r.meta.wifi ? ' · WLAN <b>' + U.escapeHtml(r.meta.wifi) + '</b>' : '') +
        (r.macTable.length ? ' · ' + r.macTable.length + ' Switchport-Zuordnungen' : '') +
        ' · Aufnahme: ' + U.formatDate(r.meta && r.meta.generated || r.at) + ' (keine Live-Überwachung)' +
      '</div>' +

      (r.warnings.length ? '<div class="dash-warn">' + r.warnings.map(U.escapeHtml).join('<br>') + '</div>' : '') +

      '<div class="dash-toolbar">' +
        '<button type="button" class="btn" data-sel="all">Alle</button>' +
        '<button type="button" class="btn" data-sel="none">Keine</button>' +
        '<button type="button" class="btn" data-sel="new">Nur neue</button>' +
        '<label class="dash-inline"><input type="checkbox" id="dash-area" checked> Bereich „Automatisch erkannt“ anlegen</label>' +
        '<label class="dash-inline"><input type="checkbox" id="dash-overwrite"> vorhandene Felder überschreiben</label>' +
        '<label class="dash-inline">Neue verbinden mit' +
          '<select id="dash-connect"><option value="">— nicht verbinden —</option>' + devOptions + '</select>' +
        '</label>' +
        '<span class="dash-spacer"></span>' +
        '<button type="button" class="btn" data-dash-paste>Weitere Daten einlesen …</button>' +
        '<button type="button" class="btn primary" data-dash-apply>Auswahl übernehmen</button>' +
      '</div>' +

      '<div class="dash-tablewrap"><table class="dash-table wide">' +
        '<thead><tr><th></th><th>IP</th><th>MAC</th><th>Hostname</th><th>Hersteller</th>' +
        '<th>Typ-Vorschlag</th><th>Offene Ports</th><th>Status</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +

      linkTableHtml(r) +

      '<div class="dash-note">Die Typ-Vorschläge sind Heuristiken aus Portnummern, Hostnamen und ' +
      'Herstellerkennungen — bitte vor der Übernahme prüfen. Nach dem Übernehmen lässt sich alles ' +
      'mit <b>Strg+Z</b> in einem Schritt zurücknehmen.</div>' +
    '</div>';
  }

  /**
   * Verbindungsvorschläge aus dem Analyse-Skript. Sie stehen bewusst
   * in einer eigenen Liste mit Methode und Zuverlässigkeit: welches
   * Kabel wo steckt, weiß ohne Auskunft der Switches niemand, und
   * eine falsche Leitung im Plan ist schlimmer als gar keine.
   */
  function linkTableHtml(r) {
    const links = r.ipLinks || [];
    if (!links.length) return '';
    const rows = links.map((l, i) => {
      const ct = C.connType(l.connType || 'logical');
      const pct = Math.round((l.confidence || 0) * 100);
      return '<tr>' +
        '<td><input type="checkbox" data-link="' + i + '"' + (l.selected ? ' checked' : '') + '></td>' +
        '<td class="mono">' + U.escapeHtml(l.a) + '<div class="why">' + U.escapeHtml(l.aName || '') + '</div></td>' +
        '<td class="mono">' + U.escapeHtml(l.b) + '<div class="why">' + U.escapeHtml(l.bName || '') + '</div></td>' +
        '<td><span class="type-chip" style="color:' + ct.color + '">' + U.escapeHtml(ct.label) + '</span></td>' +
        '<td>' + U.escapeHtml(l.methodLabel || l.method) + '<div class="why">' + pct + ' %</div></td>' +
        '<td class="small">' + U.escapeHtml(l.why || '') + '</td>' +
      '</tr>';
    }).join('');

    return '<h3 class="dash-subhead">Erkannte Verbindungen</h3>' +
      '<div class="dash-toolbar">' +
        '<button type="button" class="btn" data-lsel="all">Alle</button>' +
        '<button type="button" class="btn" data-lsel="none">Keine</button>' +
        '<span class="dash-spacer"></span>' +
        (r.ipLinksDropped ? '<span class="dash-inline">' + r.ipLinksDropped +
          ' schwächere Ableitung(en) für dieselben Geräte ausgelassen</span>' : '') +
      '</div>' +
      '<div class="dash-tablewrap"><table class="dash-table wide">' +
        '<thead><tr><th></th><th>von</th><th>nach</th><th>Leitungsart</th>' +
        '<th>Methode</th><th>Begründung</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>' +
      '<div class="dash-note">Ohne Auskunft der Switches (SNMP, LLDP) lässt sich nicht feststellen, ' +
      'welches Kabel wo steckt. Diese Verbindungen sind daher als <b>logische Verbindung</b> ' +
      'eingetragen — grau gestrichelt. Wo Sie es besser wissen, ändern Sie die Leitungsart ' +
      'hinterher per Doppelklick.</div>';
  }

  function wireDiscovery(body) {
    const r = NWT.Discovery.last();

    body.querySelectorAll('[data-dash-paste]').forEach(b =>
      b.addEventListener('click', () => NWT.Analysis.pasteDialog()));
    body.querySelectorAll('[data-dash-script]').forEach(b =>
      b.addEventListener('click', () => NWT.Analysis.showScript()));
    body.querySelectorAll('[data-goto]').forEach(b =>
      b.addEventListener('click', () => {
        close();
        NWT.Commands.focusDevice(b.getAttribute('data-goto'));
      }));

    if (!r) return;

    body.querySelectorAll('[data-host]').forEach(cb => {
      cb.addEventListener('change', () => {
        const h = r.hosts[Number(cb.getAttribute('data-host'))];
        if (h) h.selected = cb.checked;
      });
    });

    body.querySelectorAll('[data-link]').forEach(cb => {
      cb.addEventListener('change', () => {
        const l = (r.ipLinks || [])[Number(cb.getAttribute('data-link'))];
        if (l) l.selected = cb.checked;
      });
    });

    body.querySelectorAll('[data-lsel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('data-lsel') === 'all';
        (r.ipLinks || []).forEach(l => { l.selected = on; });
        render();
      });
    });

    body.querySelectorAll('[data-sel]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-sel');
        r.hosts.forEach(h => {
          h.selected = mode === 'all' ? true : mode === 'none' ? false : h.state === 'neu';
        });
        render();
      });
    });

    const applyBtn = body.querySelector('[data-dash-apply]');
    if (applyBtn) applyBtn.addEventListener('click', () => {
      const opts = {
        createArea: body.querySelector('#dash-area').checked,
        overwrite: body.querySelector('#dash-overwrite').checked,
        connectTo: body.querySelector('#dash-connect').value
      };
      const res = NWT.Discovery.apply(r.hosts, opts);
      if (!res.created && !res.updated) {
        U.toast('Nichts ausgewählt — es wurde nichts übernommen.', 'warn');
        return;
      }
      close();
      NWT.Viewport.zoomToFit();
      U.toast(res.created + ' Gerät(e) angelegt, ' + res.updated + ' aktualisiert' +
        (res.linked ? ', ' + res.linked + ' Verbindung(en)' : ''), 'ok', 5000);
    });
  }

  /* Nach einer Analyse automatisch die Erkennungsansicht zeigen. */
  NWT.on('discovery', () => open('discovery'));
  NWT.on('change', () => { if (isOpen() && tab === 'overview') render(); });

  return { open, close, isOpen, render };
})();
