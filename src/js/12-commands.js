/* ============================================================
   12 — Kommandos: alles, was Werkzeugleiste, Kontextmenü und
   Tastatur gemeinsam auslösen können.
   ============================================================ */

NWT.Commands = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;
  const M = NWT.Modal;
  const V = NWT.Viewport;
  const R = NWT.Render;
  const Model = NWT.Model;
  const P10 = NWT.Persistence;

  function isEmptyProject() {
    return !S.project.devices.length && !S.project.areas.length && !S.project.connections.length;
  }

  /* ------------------------------------------------------------ Projekt */

  function newProject() {
    const go = () => {
      S.setProject(Model.emptyProject());
      P10.clearAutosave();
      V.apply();
      NWT.emit('project:meta');
      NWT.emit('change', { structural: true });
      U.toast('Neues Netzwerk angelegt');
      P10.markSaved(false);
    };
    return NWT.ProjectFlow.replace(go, 'Neues Netzwerk');
  }

  async function saveProject() {
    const name = await M.prompt({
      title: 'Projekt speichern',
      subtitle: 'Das Projekt wird im Browser-Speicher abgelegt.',
      label: 'Projektname',
      value: S.project.name,
      placeholder: 'z. B. Netzwerk Labor 1',
      submitLabel: 'Speichern'
    });
      if (name == null) return false;
      const clean = name.trim();
      if (!clean) { M.error('Bitte einen Projektnamen eingeben.'); return false; }
      const exists = P10.listProjects().some(e => e.name === clean && clean !== S.project.name);
      const write = () => {
        if (P10.saveProject(clean)) {
          NWT.emit('project:meta');
          U.toast('Gespeichert: ' + clean, 'ok');
          return true;
        }
        return false;
      };
      if (exists) {
        const confirmed = await M.confirm({
          title: 'Projekt überschreiben?',
          message: 'Es existiert bereits ein Projekt mit dem Namen „' + clean + '“. Überschreiben?',
          confirmLabel: 'Überschreiben', danger: true
        });
        return confirmed ? write() : false;
      } else return write();
  }

  function openProject() {
    const list = P10.listProjects();
    const body = list.length
      ? '<div class="plist">' + list.map(e =>
          '<div class="plist-item" data-id="' + U.escapeHtml(e.id) + '">' +
            '<div class="pi-main">' +
              '<div class="pi-name">' + U.escapeHtml(e.name) + '</div>' +
              '<div class="pi-meta">' + U.formatDate(e.saved) + ' · ' + (e.devices || 0) + ' Geräte · ' +
                (e.connections || 0) + ' Verbindungen</div>' +
            '</div>' +
            '<button class="pi-del" data-del="' + U.escapeHtml(e.id) + '" title="Projekt löschen">🗑</button>' +
          '</div>').join('') + '</div>'
      : '<div class="empty-note">Es sind noch keine Projekte im Browser gespeichert.</div>';

    M.open({
      title: 'Projekt laden',
      subtitle: list.length ? list.length + ' gespeicherte Projekte' : '',
      bodyHtml: body,
      width: '560px',
      buttons: [{ label: 'Schließen', value: null }],
      onMount: (root, api) => {
        root.querySelectorAll('.plist-item').forEach(item => {
          item.addEventListener('click', e => {
            if (e.target.closest('[data-del]')) return;
            api.close({ open: item.getAttribute('data-id') });
          });
        });
        root.querySelectorAll('[data-del]').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = btn.getAttribute('data-del');
            const entry = list.find(x => x.id === id);
            api.close({ del: id, name: entry ? entry.name : '' });
          });
        });
      }
    }).then(res => {
      if (!res) return;
      if (res.del) {
        M.confirm({
          title: 'Projekt löschen',
          message: 'Das gespeicherte Projekt „' + res.name + '“ endgültig löschen?',
          confirmLabel: 'Löschen', danger: true
        }).then(ok => {
          if (ok && P10.deleteProject(res.del)) U.toast('Projekt gelöscht');
          openProject();
        });
        return;
      }
      if (res.open) doOpen(res.open);
    });
  }

  function doOpen(id) {
    let result;
    try {
      result = P10.loadProject(id);
    } catch (e) {
      M.error('Das Projekt konnte nicht geladen werden.', e.message);
      return;
    }
    if (!result) return;
    return NWT.ProjectFlow.replace(() => {
    S.setProject(result.project);
    V.apply();
    NWT.emit('project:meta');
    NWT.emit('change', { structural: true });
    if (result.warnings.length) {
      M.alert({
        title: 'Projekt geladen — mit Hinweisen',
        html: '<div class="msg-body"><ul>' + result.warnings.slice(0, 10)
          .map(s => '<li>' + U.escapeHtml(s) + '</li>').join('') + '</ul></div>'
      });
    } else {
      U.toast('Geladen: ' + result.project.name, 'ok');
    }
    P10.markSaved();
    }, 'Projekt laden');
  }

  function clearCanvas() {
    if (isEmptyProject()) { U.toast('Die Zeichenfläche ist bereits leer.'); return; }
    M.confirm({
      title: 'Zeichenfläche löschen',
      message: 'Möchten Sie wirklich alle Geräte und Verbindungen löschen?',
      confirmLabel: 'Alles löschen', danger: true
    }).then(ok => {
      if (!ok) return;
      NWT.History.record('Zeichenfläche löschen');
      S.project.devices = [];
      S.project.connections = [];
      S.project.areas = [];
      S.selection.clear();
      S.reindex();
      S.touch();
      NWT.emit('change', { structural: true });
      NWT.emit('selection');
      U.toast('Zeichenfläche geleert');
    });
  }

  /* ------------------------------------------------------------ Objekte */

  function deleteIds(ids) {
    const list = (ids && ids.length) ? ids.slice() : S.selectedIds();
    if (!list.length) return;
    const devCount = list.filter(id => id.startsWith('dev_')).length;
    const affected = new Set();
    list.filter(id => id.startsWith('dev_')).forEach(id => S.connectionsOf(id).forEach(c => affected.add(c)));
    list.filter(id => id.startsWith('con_')).forEach(id => affected.add(id));

    NWT.History.record(list.length > 1 ? 'Objekte löschen' : 'Objekt löschen');
    S.remove(list);
    NWT.emit('change', { structural: true });
    NWT.emit('selection');
    U.toast(list.length + ' Objekt(e) gelöscht' + (devCount && affected.size ? ' · ' + affected.size + ' Verbindung(en) entfernt' : ''));
  }

  /* ------------------------------------- Knoten und Abzweige */

  /**
   * Stützpunkt in eine Leitung einfügen. Er kommt in den Abschnitt,
   * der dem Klick am nächsten liegt — sonst spränge die Leitung an
   * eine völlig andere Stelle.
   */
  function addWaypoint(connId, world) {
    const c = S.con(connId);
    if (!c) return null;
    if (!Array.isArray(c.points)) c.points = [];
    if (c.points.length >= 40) { U.toast('Mehr als 40 Knoten je Leitung sind nicht vorgesehen.', 'warn'); return null; }
    NWT.History.record('Knoten einfügen');
    const at = NWT.Geometry.insertIndexFor(c, world);
    const pt = { x: Math.round(NWT.Viewport.snap(world.x)), y: Math.round(NWT.Viewport.snap(world.y)) };
    c.points.splice(at, 0, pt);
    S.touch();
    S.select(connId);
    NWT.emit('change', { structural: true });
    NWT.emit('selection');
    return pt;
  }

  function removeWaypoint(connId, idx) {
    const c = S.con(connId);
    if (!c || !c.points || !c.points[idx]) return;
    NWT.History.record('Knoten entfernen');
    c.points.splice(idx, 1);
    S.touch();
    NWT.emit('change', { structural: true });
  }

  function clearWaypoints(connId) {
    const c = S.con(connId);
    if (!c || !c.points || !c.points.length) return;
    NWT.History.record('Knoten entfernen');
    c.points = [];
    S.touch();
    NWT.emit('change', { structural: true });
    U.toast('Automatische Führung wiederhergestellt');
  }

  /**
   * Abzweig einfügen: An der Klickstelle entsteht ein Knotenpunkt,
   * die Leitung wird dort geteilt.
   *
   * Ein Abzweig ist bewusst ein echtes Objekt und keine Sonderform der
   * Verbindung. Dadurch gelten Auswahl, Ziehen, Ebenen, Löschen und
   * der Index unverändert — und ab dem Knoten lässt sich mit den
   * gewohnten Mitteln weiterverbinden.
   */
  function insertJunction(connId, world) {
    const c = S.con(connId);
    if (!c) return null;
    const half = NWT.Catalog.JUNCTION / 2;

    NWT.History.record('Abzweig einfügen');
    const j = S.addDevice('junction', Math.round(world.x - half), Math.round(world.y - half));
    j.layer = c.layer;

    /* Die beiden Hälften erben Art und Aussehen der geteilten Leitung —
       ein Abzweig ändert die Leitung nicht, er unterbricht sie nur. */
    const take = (n, isFirst) => {
      if (!n) return;
      n.speed = c.speed; n.vlan = c.vlan; n.layer = c.layer;
      n.description = c.description;
      if (c.style) n.style = U.clone(c.style);
      if (isFirst) { n.sourcePort = c.sourcePort; n.label = c.label; }
      else { n.targetPort = c.targetPort; }
    };
    const c1 = S.addConnection(c.source, j.id, c.type);
    const c2 = S.addConnection(j.id, c.target, c.type);
    take(c1, true);
    take(c2, false);

    S.remove([c.id]);
    S.touch();
    S.select(j.id);
    NWT.emit('change', { structural: true });
    NWT.emit('selection');
    U.toast('Abzweig eingefügt — jetzt mit „Verbinden" weiterzeichnen', 'ok', 4000);
    return j;
  }

  function duplicateSelection(ids) {
    const list = (ids && ids.length) ? ids : S.selectedIds();
    const dupable = list.filter(id => id.startsWith('dev_') || id.startsWith('area_'));
    if (!dupable.length) return;
    NWT.History.record('Duplizieren');
    const created = S.duplicate(dupable);
    S.select(created);
    NWT.emit('change', { structural: true });
    NWT.emit('selection');
    U.toast(created.length + ' Objekt(e) dupliziert');
  }

  function selectAll() {
    const ids = S.project.devices.filter(d => S.isVisible(d)).map(d => d.id)
      .concat(S.project.areas.filter(a => S.isVisible(a)).map(a => a.id));
    S.select(ids);
    R.selection();
  }

  function raise(toFront) {
    const ids = S.selectedDevices();
    if (!ids.length) return;
    NWT.History.record(toFront ? 'In den Vordergrund' : 'In den Hintergrund');
    S.raise(ids, toFront);
    NWT.emit('change', { structural: true });
  }

  /** Erzeugt einen Netzwerkbereich um die aktuelle Auswahl (oder frei). */
  function groupSelection() {
    const devIds = S.selectedDevices();
    let x, y, w, h;
    if (devIds.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      devIds.forEach(id => {
        const r = S.deviceRect(S.dev(id));
        minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
      });
      const pad = 34;
      x = minX - pad; y = minY - pad - 16; w = (maxX - minX) + pad * 2; h = (maxY - minY) + pad * 2 + 16;
    } else {
      const r = V.rect();
      const c = V.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
      x = c.x - 180; y = c.y - 120; w = 360; h = 240;
    }
    NWT.History.record('Bereich erstellen');
    const a = S.addArea(x, y, w, h);
    S.select(a.id);
    NWT.emit('change', { structural: true });
    NWT.emit('selection');
    NWT.Dialogs.editArea(a.id);
  }

  function focusDevice(id) {
    const d = S.dev(id);
    if (!d) return;
    const c = S.deviceCenter(d);
    V.centerOn(c.x, c.y);
    S.select(id);
    R.selection();
    R.flash(id);
  }

  /* --------------------------------------------------------- Ansicht */

  function toggleSetting(key, value) {
    const st = S.project.settings;
    st[key] = value !== undefined ? value : !st[key];
    V.apply();
    NWT.emit('change', { structural: false });
    NWT.emit('settings');
  }

  /* --------------------------------------------------- Beispielprojekt */

  function loadExample() {
    const build = () => {
      const P = Model.emptyProject('Beispielnetzwerk');
      S.setProject(P);
      P10.clearAutosave();

      const mk = (type, x, y, props) => {
        const d = S.addDevice(type, x, y);
        Object.assign(d, props || {});
        return d;
      };

      const internet = mk('internet', 434, 40, { name: 'Internet', status: 'active' });
      const fw = mk('firewall', 434, 210, { name: 'Firewall', ip: '192.168.1.254', hostname: 'fw01', manufacturer: 'pfSense', status: 'active', vlan: '1' });
      const rt = mk('router', 434, 380, { name: 'Router Zentrale', ip: '192.168.1.1', hostname: 'rt01', status: 'active' });
      const sw = mk('switch_managed', 434, 550, { name: 'Core Switch', ip: '192.168.1.2', hostname: 'sw01', status: 'active', room: 'Serverraum', rack: 'R1' });
      const ap = mk('accesspoint', 690, 550, { name: 'Access Point EG', ip: '192.168.1.20', status: 'active' });
      const pc = mk('pc', 190, 750, { name: 'Arbeitsplatz 1', ip: '192.168.1.50', hostname: 'pc01', os: 'Windows 11', status: 'active' });
      const srv = mk('server', 434, 750, { name: 'Server 1', ip: '192.168.1.10', hostname: 'srv01', os: 'Ubuntu 24.04', status: 'active', room: 'Serverraum', rack: 'R1' });
      const nas = mk('nas', 678, 750, { name: 'NAS Backup', ip: '192.168.1.11', hostname: 'nas01', status: 'warning', room: 'Serverraum', rack: 'R1' });

      const link = (a, b, type, sp, tp, vlan) => {
        const c = S.addConnection(a.id, b.id, type);
        if (!c) return null;
        c.sourcePort = sp || ''; c.targetPort = tp || '';
        if (vlan) c.vlan = vlan;
        return c;
      };

      link(internet, fw, 'wan', 'Uplink', 'WAN');
      link(fw, rt, 'gigabit', 'LAN', 'WAN');
      link(rt, sw, 'eth10g', 'Port 1', 'Uplink 1');
      link(sw, ap, 'gigabit', 'Port 8', 'LAN/PoE', '30');
      link(sw, pc, 'gigabit', 'Port 4', 'eth0', '10');
      link(sw, srv, 'eth10g', 'Uplink 2', 'eth0', '20');
      link(sw, nas, 'gigabit', 'Port 6', 'eth0', '20');

      const area = S.addArea(400, 712, 442, 180);
      area.label = 'Serverraum';
      area.sublabel = '192.168.1.0/24 · VLAN 20';
      area.color = '#7c3aed';

      S.reindex();
      S.touch();
      NWT.History.reset();
      NWT.emit('project:meta');
      NWT.emit('change', { structural: true });
      V.zoomToFit();
      U.toast('Beispielnetzwerk geladen', 'ok');
    };

    NWT.ProjectFlow.replace(build, 'Beispielnetzwerk laden');
  }

  return {
    newProject, saveProject, openProject, clearCanvas,
    deleteIds, duplicateSelection, selectAll, raise, groupSelection, focusDevice,
    toggleSetting, loadExample, isEmptyProject,
    addWaypoint, removeWaypoint, clearWaypoints, insertJunction
  };
})();
