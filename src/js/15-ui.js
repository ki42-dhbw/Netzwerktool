/* ============================================================
   15 — Bedienoberfläche: Werkzeugleiste, Kontextmenü,
   Tastaturkürzel, Suche, Statusleiste
   ============================================================ */

NWT.UI = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;
  const V = NWT.Viewport;
  const R = NWT.Render;
  const Cmd = NWT.Commands;

  let ctxEl, searchEl, resultsEl, exportMenu, helpMenu, fileInput;
  let searchIndexActive = -1;
  let searchMatches = [];

  function init() {
    ctxEl = U.el('#contextmenu');
    searchEl = U.el('#device-search');
    resultsEl = U.el('#search-results');
    exportMenu = U.el('#export-menu');
    helpMenu = U.el('#help-menu');
    fileInput = U.el('#file-input');

    bindToolbar();
    bindOptions();
    bindSearch();
    bindKeyboard();
    bindContextMenu();

    NWT.on('mode', updateModeButtons);
    NWT.on('history', updateHistoryButtons);
    NWT.on('selection', updateStatus);
    NWT.on('change', updateStatus);
    NWT.on('project:meta', updateTitle);
    NWT.on('project:replaced', () => { updateTitle(); updateOptions(); });
    NWT.on('settings', updateOptions);
    NWT.on('setups', renderSetupMenu);
    NWT.on('theme', updateOptions);
    NWT.on('ui:coords', w => {
      U.el('#st-coords').textContent = 'x ' + Math.round(w.x) + ' · y ' + Math.round(w.y);
    });
    NWT.on('ui:connecthint', text => {
      const h = U.el('#connect-hint');
      if (!text) { h.hidden = true; return; }
      h.textContent = text;
      h.hidden = false;
    });
    NWT.on('ui:closemenus', closeMenus);
    const storageStatus = () => {
      const el = U.el('#st-storage');
      const st = NWT.Persistence.status();
      el.textContent = st.failure || (st.dirty ? 'Änderungen · ' : '') + (st.lastSaved ? 'Sicherung ' + new Date(st.lastSaved).toLocaleTimeString('de-DE') : 'Noch nicht gesichert');
      el.dataset.failed = st.failure ? 'true' : 'false';
    };
    NWT.on('storage:status', storageStatus);
    storageStatus();

    window.addEventListener('resize', U.rafThrottle(() => { V.apply(); NWT.emit('ui:minimap'); }));
    document.addEventListener('click', e => {
      if (!e.target.closest('#contextmenu')) hideContext();
      if (!e.target.closest('.tb-menu-wrap')) hideDropdowns();
      if (!e.target.closest('.tb-search')) resultsEl.hidden = true;
    });

    updateModeButtons(S.mode);
    updateHistoryButtons();
    updateStatus();
    updateTitle();
    updateOptions();
    renderSetupMenu();
    if (!NWT.Persistence.available()) {
      U.el('#st-storage').textContent = 'Browser-Speicher nicht verfügbar — bitte per Export sichern';
    }
  }

  /* ------------------------------------------------------ Werkzeugleiste */

  const ACTIONS = {
    'new': () => Cmd.newProject(),
    'save': () => Cmd.saveProject(),
    'load': () => Cmd.openProject(),
    'import': () => fileInput.click(),
    'print': () => NWT.Exchange.print(),
    'export-menu': () => toggleDropdown(exportMenu),
    'help-menu': () => toggleDropdown(helpMenu),
    'analysis-menu': () => toggleDropdown(U.el('#analysis-menu')),
    'analysis-paste': () => NWT.Analysis.pasteDialog(),
    'analysis-file': () => NWT.Analysis.pickFile(),
    'analysis-script': () => NWT.Analysis.showScript(),
    'dashboard': () => NWT.Dashboard.open('overview'),
    'export-json': () => NWT.Exchange.exportJson(),
    'recovery': () => NWT.Recovery.open(),
    'review': () => NWT.Workbench.open('checks'),
    'inventory': () => NWT.Workbench.open('devices'),
    'layout': () => NWT.Layout.open(),
    'report': () => NWT.Workbench.exportReport(),
    'export-svg': () => NWT.Exchange.exportSvg(),
    'export-png': () => NWT.Exchange.exportPng(2),
    'export-image': () => NWT.Exchange.exportImage(),
    'clear': () => Cmd.clearCanvas(),
    'mode-select': () => S.setMode('select'),
    'mode-connect': () => S.setMode('connect'),
    'mode-pan': () => S.setMode('pan'),
    'undo': () => NWT.History.undo(),
    'redo': () => NWT.History.redo(),
    'zoom-in': () => V.zoomBy(1.2),
    'zoom-out': () => V.zoomBy(1 / 1.2),
    'zoom-reset': () => V.resetZoom(),
    'zoom-fit': () => V.zoomToFit(),
    'info': () => NWT.Dialogs.projectInfo(),
    'handbook': () => NWT.HelpDoc.open(),
    'settings-menu': () => toggleDropdown(U.el('#settings-menu')),
    'settings': () => NWT.Settings.open(),
    'theme': () => {
      const next = NWT.Theme.cycle();
      U.toast('Design: ' + NWT.Theme.LABELS[next]);
    },
    'privacy': () => NWT.Privacy.toggle(),
    'setup-save': () => saveSetupDialog(),
    'help': () => NWT.Dialogs.help()
  };

  /** Fragt nach einem Namen und sichert die aktuellen Einstellungen. */
  function saveSetupDialog() {
    NWT.Modal.prompt({
      title: 'Einstellungen als Setup sichern',
      subtitle: 'Ansicht, Darstellung, Verbindungsarten, Design und Hinweisfenster — ohne den Netzplan.',
      label: 'Name des Setups',
      value: NWT.Setups.active(),
      placeholder: 'z. B. Präsentation',
      submitLabel: 'Sichern'
    }).then(name => {
      if (!name) return;
      const exists = NWT.Setups.names().indexOf(name.trim()) >= 0;
      const write = () => {
        try {
          NWT.Setups.save(name);
          U.toast('Setup „' + name.trim() + '“ gesichert', 'ok');
        } catch (e) {
          NWT.Modal.error('Das Setup konnte nicht gesichert werden.', e.message);
        }
      };
      if (!exists) { write(); return; }
      NWT.Modal.confirm({
        title: 'Setup überschreiben?',
        message: 'Es gibt bereits ein Setup namens „' + name.trim() + '“. Überschreiben?',
        confirmLabel: 'Überschreiben', danger: true
      }).then(ok => { if (ok) write(); });
    });
  }

  /** Baut die Setup-Einträge im Zahnrad-Menü. */
  function renderSetupMenu() {
    const host = U.el('#setup-list');
    if (!host) return;
    const names = NWT.Setups.names();
    const act = NWT.Setups.active();
    host.innerHTML = names.length
      ? names.map(n => '<button data-setup="' + U.escapeHtml(n) + '">' +
          (n === act ? '● ' : '') + U.escapeHtml(n) + '</button>').join('')
      : '<div class="tb-menu-empty">noch keine gesichert</div>';
    host.querySelectorAll('[data-setup]').forEach(b =>
      b.addEventListener('click', () => {
        hideDropdowns();
        NWT.Setups.apply(b.getAttribute('data-setup'));
      }));
  }

  const DROPDOWN_ACTS = { 'export-menu': 1, 'help-menu': 1, 'analysis-menu': 1, 'settings-menu': 1 };

  function hideDropdowns() {
    U.els('.tb-menu').forEach(m => { m.hidden = true; });
  }

  function toggleDropdown(menu) {
    const wasHidden = menu.hidden;
    hideDropdowns();
    menu.hidden = !wasHidden;
  }

  function bindToolbar() {
    U.el('#toolbar').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      /* Ein Menüeintrag schließt sein Menü, ein Menüknopf schaltet nur um. */
      if (!DROPDOWN_ACTS[act]) hideDropdowns();
      const fn = ACTIONS[act];
      if (fn) fn();
    });

    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) NWT.Exchange.importFile(f);
      fileInput.value = '';
    });
  }

  /** Füllt die Typliste neben „Verbinden“ — gruppiert wie im Dialog. */
  function fillConnTypes() {
    const sel = U.el('#opt-conntype');
    let html = '';
    let group = null;
    C.connTypeOptions().forEach(o => {
      if (o.group !== group) {
        if (group !== null) html += '</optgroup>';
        html += '<optgroup label="' + U.escapeHtml(o.group) + '">';
        group = o.group;
      }
      html += '<option value="' + U.escapeHtml(o.value) + '">' + U.escapeHtml(o.label) + '</option>';
    });
    if (group !== null) html += '</optgroup>';
    sel.innerHTML = html;
  }

  function bindOptions() {
    fillConnTypes();
    U.el('#opt-conntype').addEventListener('change', e => {
      S.project.settings.defaultConnType = e.target.value;
      /* Wer hier auswählt, will gleich zeichnen. */
      S.setMode('connect');
      NWT.emit('change', { structural: false });
      NWT.emit('settings');
    });

    U.el('#opt-grid').addEventListener('change', e => Cmd.toggleSetting('grid', e.target.checked));
    U.el('#opt-snap').addEventListener('change', e => Cmd.toggleSetting('snap', e.target.checked));
    U.el('#opt-photos').addEventListener('change', e => {
      NWT.History.record('Fotoanzeige');
      S.project.settings.photos = e.target.checked;
      NWT.emit('change', { structural: true });
    });
    U.el('#opt-tips').addEventListener('change', e => {
      NWT.Tooltip.setEnabled(e.target.checked);
      U.toast(e.target.checked ? 'Hinweisfenster eingeschaltet' : 'Hinweisfenster ausgeschaltet');
    });
    U.el('#opt-routing').addEventListener('change', e => {
      NWT.History.record('Linienführung');
      S.project.settings.routing = e.target.value;
      NWT.emit('change', { structural: true });
    });
  }

  function updateOptions() {
    const st = S.project.settings;
    U.el('#opt-grid').checked = !!st.grid;
    U.el('#opt-snap').checked = !!st.snap;
    U.el('#opt-routing').value = st.routing;
    U.el('#opt-photos').checked = st.photos !== false;
    U.el('#opt-tips').checked = NWT.Tooltip.isEnabled();
    const pb = U.el('#settings-menu [data-act="privacy"]');
    if (pb) pb.textContent = (NWT.Privacy.active() ? '● ' : '') + 'Vertrauliche Angaben maskieren';

    const type = C.CONNECTION_TYPES[st.defaultConnType] ? st.defaultConnType : 'gigabit';
    U.el('#opt-conntype').value = type;
    const eff = S.edgeStyle({ type: type });
    const line = U.el('#conn-swatch');
    line.setAttribute('stroke', eff.color);
    line.setAttribute('stroke-width', Math.min(6, eff.width));
    if (eff.dash) line.setAttribute('stroke-dasharray', eff.dash);
    else line.removeAttribute('stroke-dasharray');
  }

  function updateModeButtons(mode) {
    U.els('.tb-btn.mode').forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === mode));
    const names = { select: 'Auswahl', connect: 'Verbinden', pan: 'Hand' };
    U.el('#st-mode').textContent = names[mode] || mode;
    NWT.emit('ui:connecthint', mode === 'connect' ? 'Erstes Gerät wählen …' : null);
  }

  function updateHistoryButtons() {
    U.el('[data-act="undo"]').disabled = !NWT.History.canUndo();
    U.el('[data-act="redo"]').disabled = !NWT.History.canRedo();
  }

  function updateTitle() {
    U.el('#project-title').textContent = S.project.name || 'Unbenannt';
    const info = S.project.info || {};
    const bits = [info.company, info.location].filter(Boolean).join(' · ');
    U.el('#project-sub').textContent = bits || 'Netzwerk-Topologie-Tool';
    document.title = (S.project.name || 'Unbenannt') + ' — Netzwerk-Topologie-Tool';
  }

  const updateStatus = U.rafThrottle(function () {
    const P = S.project;
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    /* Text, Grafik und Abzweige sind keine Geräte — sie getrennt zu
       zählen hält die Gerätezahl aussagekräftig. */
    let geraete = 0, deco = 0, abzweige = 0;
    P.devices.forEach(d => {
      const sh = C.shapeOf(d.type);
      if (sh === 'device') geraete++;
      else if (sh === 'junction') abzweige++;
      else deco++;
    });
    const parts = [
      plural(geraete, 'Gerät', 'Geräte'),
      plural(P.connections.length, 'Verbindung', 'Verbindungen'),
      plural(P.areas.length, 'Bereich', 'Bereiche')
    ];
    if (abzweige) parts.push(plural(abzweige, 'Abzweig', 'Abzweige'));
    if (deco) parts.push(plural(deco, 'Text/Grafik', 'Text/Grafik'));
    if (NWT.Privacy.active()) parts.push('maskiert');
    U.el('#st-counts').textContent = parts.join(' · ');
    const sel = S.selectedIds();
    let text = 'Keine Auswahl';
    if (sel.length === 1) {
      const o = S.obj(sel[0]);
      if (o) {
        const kind = S.kindOf(sel[0]);
        text = kind === 'device' ? (o.name + ' · ' + C.typeLabel(o.type) + (o.ip ? ' · ' + o.ip : ''))
             : kind === 'connection' ? ('Verbindung ' + C.connType(o.type).label + (o.vlan ? ' · VLAN ' + o.vlan : ''))
             : ('Bereich ' + o.label);
      }
    } else if (sel.length > 1) {
      text = sel.length + ' Objekte ausgewählt';
    }
    U.el('#st-selection').textContent = text;
    updateHistoryButtons();
  });

  /* --------------------------------------------------------------- Suche */

  function bindSearch() {
    searchEl.addEventListener('input', () => runSearch(searchEl.value));
    searchEl.addEventListener('focus', () => { if (searchEl.value) runSearch(searchEl.value); });
    searchEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchEl.value = ''; resultsEl.hidden = true; searchEl.blur(); return; }
      if (!searchMatches.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSearch(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSearch(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = searchMatches[Math.max(0, searchIndexActive)];
        if (pick) { Cmd.focusDevice(pick.id); resultsEl.hidden = true; }
      }
    });
  }

  function moveSearch(delta) {
    searchIndexActive = U.clamp(searchIndexActive + delta, 0, searchMatches.length - 1);
    Array.from(resultsEl.children).forEach((el, i) => el.classList.toggle('on', i === searchIndexActive));
  }

  function runSearch(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) { resultsEl.hidden = true; searchMatches = []; return; }
    searchMatches = S.project.devices.filter(d => {
      return [d.name, d.ip, d.ipv6, d.hostname, d.mac, d.room, d.rack, d.location, d.vlan,
              d.protocol, d.manufacturer, d.model, C.typeLabel(d.type)]
        .some(v => String(v || '').toLowerCase().indexOf(q) >= 0);
    }).slice(0, 40);
    searchIndexActive = searchMatches.length ? 0 : -1;

    resultsEl.innerHTML = searchMatches.length
      ? searchMatches.map((d, i) =>
          '<div class="sr-item' + (i === 0 ? ' on' : '') + '" data-id="' + d.id + '">' +
            '<b>' + U.escapeHtml(d.name) + '</b>' +
            '<small>' + U.escapeHtml(C.typeLabel(d.type)) +
            (d.ip ? ' · ' + U.escapeHtml(d.ip) : '') +
            (d.room ? ' · ' + U.escapeHtml(d.room) : '') + '</small>' +
          '</div>').join('')
      : '<div class="sr-empty">Kein Gerät gefunden.</div>';
    resultsEl.hidden = false;

    Array.from(resultsEl.querySelectorAll('.sr-item')).forEach(item => {
      item.addEventListener('click', () => {
        Cmd.focusDevice(item.getAttribute('data-id'));
        resultsEl.hidden = true;
      });
    });
  }

  /* -------------------------------------------------------- Kontextmenü */

  function bindContextMenu() {
    NWT.on('ui:contextmenu', showContext);
  }

  function closeMenus() {
    hideContext();
    hideDropdowns();
    if (resultsEl) resultsEl.hidden = true;
  }

  function hideContext() { if (ctxEl) ctxEl.hidden = true; }

  function item(label, kbd, fn, danger) {
    return { label: label, kbd: kbd, fn: fn, danger: danger };
  }

  function showContext(ev) {
    const hit = ev.hit;
    const sel = S.selectedIds();
    let title = '';
    let entries = [];

    if (hit.kind === 'device') {
      const d = S.dev(hit.id);
      title = sel.length > 1 ? sel.length + ' Objekte' : (d ? d.name : 'Gerät');
      const hasPhoto = !!(d && d.image);
      /* Fotos ergeben nur auf einer Gerätekachel Sinn — ein Abzweig,
         ein Textfeld oder ein Rahmen tragen keines. */
      const shape = d ? C.shapeOf(d.type) : 'device';
      const echtesGeraet = shape === 'device';
      entries = [
        item('Eigenschaften …', '⏎⏎', () => NWT.Dialogs.editDevice(hit.id)),
        shape === 'shape' ? false : item('Verbinden ab hier', 'C', () => NWT.Interaction.startConnectFrom(hit.id)),
        item('Duplizieren', 'Strg+D', () => Cmd.duplicateSelection()),
        null,
        echtesGeraet ? item(hasPhoto ? 'Foto ersetzen …' : 'Foto hinzufügen …', '', () => NWT.Images.pickFor(hit.id)) : false,
        hasPhoto ? item('Foto entfernen', '', () => NWT.Images.remove(hit.id)) : false,
        item('In den Vordergrund', '', () => Cmd.raise(true)),
        item('In den Hintergrund', '', () => Cmd.raise(false)),
        item('Bereich um Auswahl', 'Strg+G', () => Cmd.groupSelection()),
        null,
        item('Löschen', 'Entf', () => Cmd.deleteIds(), true)
      ];
    } else if (hit.kind === 'connection') {
      const c = S.con(hit.id);
      title = c ? C.connType(c.type).label : 'Verbindung';
      const hatKnoten = !!(c && c.points && c.points.length);
      entries = [
        item('Eigenschaften …', '⏎⏎', () => NWT.Dialogs.editConnection(hit.id)),
        item('Beschriftung ändern …', '', () => changeLabel(hit.id)),
        item('Verbindungstyp ändern …', '', () => changeConnType(hit.id)),
        item('Darstellung ändern …', '', () => changeConnStyle(hit.id)),
        null,
        item('Knoten hier einfügen', '', () => Cmd.addWaypoint(hit.id, ev.world)),
        item('Abzweig hier einfügen', '', () => Cmd.insertJunction(hit.id, ev.world))
      ];
      /* Nur anbieten, wenn es etwas zu entfernen gibt — ein toter
         Eintrag im Menü ist schlimmer als ein fehlender. */
      if (hatKnoten) {
        entries.push(item('Alle Knoten entfernen (' + c.points.length + ')', '',
                          () => Cmd.clearWaypoints(hit.id)));
      }
      entries.push(null);
      entries.push(item('Löschen', 'Entf', () => Cmd.deleteIds([hit.id]), true));
    } else if (hit.kind === 'area' || hit.kind === 'area-handle') {
      const a = S.area(hit.id);
      title = a ? a.label : 'Bereich';
      entries = [
        item('Eigenschaften …', '⏎⏎', () => NWT.Dialogs.editArea(hit.id)),
        item('Duplizieren', 'Strg+D', () => Cmd.duplicateSelection([hit.id])),
        null,
        item('Löschen', 'Entf', () => Cmd.deleteIds([hit.id]), true)
      ];
    } else {
      title = 'Zeichenfläche';
      entries = [
        item('Alles auswählen', 'Strg+A', () => Cmd.selectAll()),
        item('Netzwerkbereich einfügen', 'Strg+G', () => Cmd.groupSelection()),
        null,
        item('Alles einpassen', 'Strg+1', () => V.zoomToFit()),
        item('Zoom 100 %', 'Strg+0', () => V.resetZoom()),
        null,
        item('Raster ' + (S.project.settings.grid ? 'ausblenden' : 'anzeigen'), '', () => Cmd.toggleSetting('grid')),
        item('Am Raster ausrichten ' + (S.project.settings.snap ? 'aus' : 'ein'), '', () => Cmd.toggleSetting('snap')),
        null,
        item('Zeichenfläche löschen', '', () => Cmd.clearCanvas(), true)
      ];
    }

    /* Doppelte oder führende Trenner entfernen. */
    /* false heißt „gibt es hier nicht", null heißt Trennlinie. Erst
       das Nichtvorhandene raus, dann doppelte und führende Trenner. */
    entries = entries.filter(e => e !== false);
    entries = entries.filter((e, i, a) => e !== null || (i > 0 && a[i - 1] !== null));
    while (entries.length && entries[entries.length - 1] === null) entries.pop();

    ctxEl.innerHTML = '<div class="ctx-title">' + U.escapeHtml(title) + '</div>' +
      entries.map((e, i) => e
        ? '<button data-i="' + i + '"' + (e.danger ? ' class="danger"' : '') + '>' +
          '<span>' + U.escapeHtml(e.label) + '</span>' +
          (e.kbd ? '<kbd>' + U.escapeHtml(e.kbd) + '</kbd>' : '') + '</button>'
        : '<div class="sep"></div>').join('');

    ctxEl.hidden = false;
    /* Innerhalb des Fensters halten. */
    const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
    ctxEl.style.left = Math.min(ev.x, window.innerWidth - w - 8) + 'px';
    ctxEl.style.top = Math.min(ev.y, window.innerHeight - h - 8) + 'px';

    ctxEl.querySelectorAll('button[data-i]').forEach(btn => {
      btn.addEventListener('click', () => {
        const e = entries[parseInt(btn.getAttribute('data-i'), 10)];
        hideContext();
        if (e && e.fn) e.fn();
      });
    });
  }

  function changeLabel(id) {
    const c = S.con(id);
    if (!c) return;
    NWT.Modal.prompt({ title: 'Beschriftung ändern', label: 'Beschriftung', value: c.label })
      .then(v => {
        if (v == null) return;
        NWT.History.record('Beschriftung ändern');
        c.label = v;
        S.touch();
        NWT.emit('change', { structural: true });
      });
  }

  /** Schnellzugriff aus dem Kontextmenü: nur Farbe, Stärke und Muster. */
  function changeConnStyle(id) {
    const c = S.con(id);
    if (!c) return;
    const eff = S.edgeStyle(c);
    NWT.Modal.form({
      title: 'Darstellung der Verbindung',
      subtitle: C.connType(c.type).label,
      fields: [
        { key: 'color', label: 'Farbe', type: 'color' },
        { key: 'width', label: 'Linienstärke', type: 'number', min: 0.5, max: 12, step: 0.1 },
        { key: 'dash', label: 'Strichmuster', wide: true, type: 'select',
          options: C.DASH_PRESETS.map(p => ({ value: p.value, label: p.label })) }
      ],
      values: { color: eff.color, width: eff.width, dash: eff.dash },
      width: '460px',
      extraButtons: [{ label: 'Auf Typ zurücksetzen', left: true, value: { __reset: true } }]
    }).then(res => {
      if (!res) return;
      NWT.History.record('Darstellung ändern');
      if (res.__reset) {
        delete c.style;
      } else {
        const base = S.edgeStyle({ type: c.type });
        const chosen = { color: res.color, width: Number(res.width) || base.width, dash: res.dash };
        if (chosen.color.toLowerCase() === base.color.toLowerCase() &&
            Math.abs(chosen.width - base.width) < 0.001 && chosen.dash === base.dash) {
          delete c.style;
        } else {
          c.style = chosen;
        }
      }
      S.touch();
      NWT.emit('change', { structural: true });
    });
  }

  function changeConnType(id) {
    const c = S.con(id);
    if (!c) return;
    NWT.Modal.form({
      title: 'Verbindungstyp ändern',
      fields: [{ key: 'type', label: 'Typ', wide: true, type: 'select', options: C.connTypeOptions() }],
      values: { type: c.type },
      width: '420px'
    }).then(res => {
      if (!res) return;
      NWT.History.record('Verbindungstyp ändern');
      const prevSpeed = C.connType(c.type).speed;
      c.type = res.type;
      if (!c.speed || c.speed === prevSpeed) c.speed = C.connType(c.type).speed;
      S.touch();
      NWT.emit('change', { structural: true });
    });
  }

  /* ---------------------------------------------------- Tastaturkürzel */

  function isTyping(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  function bindKeyboard() {
    window.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape') {
        if (NWT.Modal.isOpen()) return;          // Dialog behandelt ESC selbst
        if (NWT.Settings.isOpen()) { NWT.Settings.close(); return; }
        if (NWT.Dashboard.isOpen()) { NWT.Dashboard.close(); return; }
        if (NWT.HelpDoc.isOpen()) { NWT.HelpDoc.close(); return; }
        if (!ctxEl.hidden) { hideContext(); return; }
        if (NWT.Interaction.cancel()) return;
        S.clearSelection();
        R.selection();
        return;
      }

      if (e.key === 'F1') {
        e.preventDefault();
        if (e.shiftKey) NWT.HelpDoc.open(); else NWT.Dialogs.help();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (NWT.Dashboard.isOpen()) NWT.Dashboard.close(); else NWT.Dashboard.open('overview');
        return;
      }
      if (mod && (e.key === ',' || e.code === 'Comma')) {
        e.preventDefault();
        if (NWT.Settings.isOpen()) NWT.Settings.close(); else NWT.Settings.open();
        return;
      }
      if (NWT.Modal.isOpen() || NWT.HelpDoc.isOpen() ||
          NWT.Dashboard.isOpen() || NWT.Settings.isOpen()) return;

      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); Cmd.saveProject(); return; }
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); Cmd.openProject(); return; }
      if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); searchEl.focus(); searchEl.select(); return; }

      if (isTyping(e.target)) return;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) NWT.History.redo(); else NWT.History.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); NWT.History.redo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); Cmd.duplicateSelection(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); Cmd.selectAll(); return; }
      if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); Cmd.groupSelection(); return; }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); NWT.Exchange.exportJson(); return; }
      if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); Cmd.newProject(); return; }

      if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); V.zoomBy(1.2); return; }
      if (mod && e.key === '-') { e.preventDefault(); V.zoomBy(1 / 1.2); return; }
      if (mod && e.key === '0') { e.preventDefault(); V.resetZoom(); return; }
      if (mod && e.key === '1') { e.preventDefault(); V.zoomToFit(); return; }

      if (mod) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (S.selection.size) { e.preventDefault(); Cmd.deleteIds(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'v') S.setMode('select');
      else if (k === 'c') S.setMode('connect');
      else if (k === 'h') S.setMode('pan');
      else if (k === 'g') Cmd.toggleSetting('grid');
      else if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].indexOf(k) >= 0) {
        const ids = S.selectedIds().filter(id => id.startsWith('dev_') || id.startsWith('area_'));
        if (!ids.length) return;
        e.preventDefault();
        const step = e.shiftKey ? S.project.settings.gridSize : 1;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        NWT.History.record('Objekt verschieben');
        ids.forEach(id => {
          const o = S.obj(id);
          if (o) { o.x += dx; o.y += dy; }
        });
        S.touch();
        NWT.emit('change', { structural: false });
        ids.forEach(id => { if (id.startsWith('dev_')) R.moveNode(id); else R.moveArea(id); });
        R.updateEdgesFor(ids.filter(id => id.startsWith('dev_')));
      }
    });
  }

  return { init, updateStatus, updateTitle, closeMenus };
})();
