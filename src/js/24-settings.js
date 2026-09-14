/* ============================================================
   24 — Einstellungsseite
   Sammelt alle Optionen an einem Ort: Ansicht, Bedienung,
   Projektdaten, Gerätebilder, eigene Symbole und Speicher.

   Unterscheidung, die hier wichtig ist:
     • Projekteinstellungen (Raster, Fotos, Hardware-Ansicht …)
       liegen im Projekt und reisen mit einer JSON-Datei mit.
     • Arbeitsplatzvorlieben (Hinweisfenster) liegen in NWT.Prefs
       und gelten nur für diesen Browser.
   ============================================================ */

NWT.Settings = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;

  let overlay = null;
  let showAllTypes = false;
  let pendingType = null;
  let fileInput = null;
  let folderInput = null;

  function init() {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      const t = pendingType;
      fileInput.value = '';
      pendingType = null;
      if (f && t) setTypeImage(t, f);
    });

    /* Ordnerauswahl für die Bildbibliothek. webkitdirectory ist der einzige
       Weg, im Browser einen ganzen Ordner zu übergeben. */
    folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.multiple = true;
    folderInput.accept = 'image/*';
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.hidden = true;
    document.body.appendChild(folderInput);
    folderInput.addEventListener('change', () => {
      const files = folderInput.files;
      folderInput.value = '';
      if (!files || !files.length) return;
      NWT.Library.importFiles(files).then(n => {
        if (!n) return;
        U.toast(n + ' Bild(er) eingelesen', 'ok');
        render();
        NWT.Library.reviewDialog(false).then(() => render());
      });
    });
  }

  /* -------------------------------------------------------- Typbilder */

  function setTypeImage(typeId, file) {
    NWT.Images.processFile(file).then(res => {
      NWT.History.record('Typbild zuweisen');
      if (!S.project.typeImages) S.project.typeImages = {};
      S.project.typeImages[typeId] = res.dataUrl;
      S.touch();
      NWT.emit('change', { structural: true });
      U.toast('Typbild für „' + C.typeLabel(typeId) + '“ gesetzt', 'ok');
      render();
    }).catch(err => NWT.Modal.error('Das Bild konnte nicht übernommen werden.', err.message));
  }

  function clearTypeImage(typeId) {
    if (!S.project.typeImages || !S.project.typeImages[typeId]) return;
    NWT.History.record('Typbild entfernen');
    delete S.project.typeImages[typeId];
    S.touch();
    NWT.emit('change', { structural: true });
    render();
  }

  function typeImageBytes() {
    const map = S.project.typeImages || {};
    return Object.keys(map).reduce((sum, k) =>
      sum + Math.round((map[k].length - map[k].indexOf(',') - 1) * 0.75), 0);
  }

  /* ------------------------------------------------------------ Gerüst */

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'set-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Einstellungen');
    overlay.innerHTML =
      '<div class="dash">' +
        '<header class="dash-top">' +
          '<div class="dash-brand"><b>Einstellungen</b><span id="set-sub"></span></div>' +
          '<button type="button" class="help-btn primary" data-set-close>Schließen (Esc)</button>' +
        '</header>' +
        '<div class="dash-body"></div>' +
      '</div>';
    overlay.querySelector('[data-set-close]').addEventListener('click', close);
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function open() {
    ensure();
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

  /* ------------------------------------------------------- Bausteine */

  function toggle(id, label, checked, hint) {
    return '<label class="set-row"><input type="checkbox" data-set="' + id + '"' +
      (checked ? ' checked' : '') + '>' +
      '<span class="set-text"><b>' + U.escapeHtml(label) + '</b>' +
      (hint ? '<small>' + hint + '</small>' : '') + '</span></label>';
  }

  function selectRow(id, label, options, value, hint) {
    const opt = o => '<option value="' + U.escapeHtml(o.value) + '"' +
      (String(o.value) === String(value) ? ' selected' : '') + '>' + U.escapeHtml(o.label) + '</option>';
    let body = '';
    if (options.some(o => o.group)) {
      let current = null;
      options.forEach(o => {
        if (o.group !== current) {
          if (current !== null) body += '</optgroup>';
          body += '<optgroup label="' + U.escapeHtml(o.group || '') + '">';
          current = o.group;
        }
        body += opt(o);
      });
      if (current !== null) body += '</optgroup>';
    } else {
      body = options.map(opt).join('');
    }
    return '<div class="set-row set-row-field">' +
      '<span class="set-text"><b>' + U.escapeHtml(label) + '</b>' +
      (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
      '<select data-set="' + id + '">' + body + '</select></div>';
  }

  function textRow(id, label, value, placeholder, hint) {
    return '<div class="set-row set-row-field">' +
      '<span class="set-text"><b>' + U.escapeHtml(label) + '</b>' +
      (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
      '<input type="text" data-set="' + id + '" value="' + U.escapeHtml(value || '') + '"' +
      (placeholder ? ' placeholder="' + U.escapeHtml(placeholder) + '"' : '') + '></div>';
  }

  function numberRow(id, label, value, min, max, hint) {
    return '<div class="set-row set-row-field">' +
      '<span class="set-text"><b>' + U.escapeHtml(label) + '</b>' +
      (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
      '<input type="number" data-set="' + id + '" value="' + Number(value) +
      '" min="' + min + '" max="' + max + '"></div>';
  }

  /* Zeigt die drei häufigsten Angaben so, wie sie im Bild stünden. */
  function privacySample() {
    return ['192.168.10.42', '00:1A:2B:3C:4D:5E', 'srv01.firma.local']
      .map(t => NWT.Privacy.preview(t)).join('  ·  ');
  }

  function updatePrivacySample() {
    const el = overlay && overlay.querySelector('.set-sample');
    if (el) el.textContent = privacySample();
  }

  function card(title, inner, note) {
    return '<section class="dash-card set-card"><h3>' + U.escapeHtml(title) + '</h3>' + inner +
      (note ? '<div class="dash-note">' + note + '</div>' : '') + '</section>';
  }

  /* --------------------------------------------------------- Aufbau */

  function render() {
    if (!overlay) return;
    const P = S.project;
    const st = P.settings;
    overlay.querySelector('#set-sub').textContent = P.name;

    /* --- Vertrauliche Angaben --- */
    const pv = NWT.Privacy.settings();
    const beispiel = privacySample();
    const maskCard =
      toggle('pv-on', 'Maskierung einschalten', pv.on,
        'Gilt für Zeichenfläche, Ausdruck und Bildexport zugleich. So sehen Sie vorher, was hinterher im Bild steht.') +
      selectRow('pv-style', 'Art der Maskierung', NWT.Privacy.STYLES, pv.style) +
      '<div class="set-row set-row-field"><span class="set-text"><b>Beispiel</b>' +
        '<small>mit den aktuellen Einstellungen</small></span>' +
        '<code class="set-sample">' + U.escapeHtml(beispiel) + '</code></div>' +
      NWT.Privacy.GROUPS.map(g => toggle('pv-' + g.key, g.label, pv[g.key])).join('');

    /* --- Ansicht --- */
    const ansicht =
      toggle('grid', 'Raster anzeigen', st.grid, 'Hilfslinien auf der Zeichenfläche. Taste <kbd>G</kbd>.') +
      toggle('avoidObstacles', 'Leitungen um Geräte führen', st.avoidObstacles, 'Rechtwinklige Umwege bei freier Strecke. Manuelle Leitungsknoten bleiben maßgeblich.') +
      toggle('snap', 'Am Raster ausrichten', st.snap, 'Neue und verschobene Objekte rasten ein.') +
      numberRow('gridSize', 'Rastergröße', st.gridSize, 5, 200, 'in Pixeln, Standard 20') +
      selectRow('routing', 'Linienführung', [
        { value: 'orthogonal', label: 'Orthogonal (rechtwinklig)' },
        { value: 'straight', label: 'Gerade' },
        { value: 'curved', label: 'Gebogen' }
      ], st.routing, 'Gilt für alle Verbindungen des Projekts.') +
      toggle('minimap', 'Übersichtskarte anzeigen', st.minimap !== false, 'Minimap unten rechts.');

    /* --- Gerätedarstellung --- */
    const hwCount = Object.keys(C.HARDWARE).length;
    const darstellung =
      toggle('photos', 'Bilder auf der Zeichenfläche', st.photos !== false,
        'Zeigt Gerätefotos und Typbilder. Ausgeschaltet bleiben sie im Projekt erhalten.') +
      toggle('hardware', 'Hardware-Ansicht statt Symbol', !!st.hardware,
        'Gezeichnete Frontblenden für ' + hwCount + ' Gerätetypen — Portreihen, LEDs, Displays. ' +
        'Ein eigenes Foto oder Typbild hat immer Vorrang.');

    /* --- Bedienung --- */
    const bedienung =
      selectRow('theme', 'Design',
        NWT.Theme.MODES.map(m => ({ value: m, label: NWT.Theme.LABELS[m] })), NWT.Theme.get(),
        'Hell, dunkel oder dem System folgend. Export und Ausdruck bleiben immer hell.') +
      toggle('tooltips', 'Hinweisfenster (Tipps)', NWT.Tooltip.isEnabled(),
        'Gilt nur für diesen Browser und wird <b>nicht</b> im Projekt gespeichert.') +
      selectRow('defaultConnType', 'Standard-Verbindungstyp', C.connTypeOptions(),
        st.defaultConnType, 'Typ für neu gezogene Verbindungen.') +
      selectRow('activeLayer', 'Ebene für neue Objekte',
        P.layers.map(l => ({ value: l.id, label: l.name })), st.activeLayer);

    /* --- Projekt --- */
    const info = P.info || {};
    const projekt =
      textRow('projectName', 'Projektname', P.name) +
      textRow('author', 'Autor', info.author) +
      textRow('company', 'Firma', info.company) +
      textRow('location', 'Standort', info.location) +
      '<div class="set-meta">Erstellt: ' + U.formatDate(info.created) +
      ' · Geändert: ' + U.formatDate(info.modified) + '</div>';

    /* --- Gerätebilder --- */
    const used = {};
    P.devices.forEach(d => { used[d.type] = (used[d.type] || 0) + 1; });
    const imgs = P.typeImages || {};
    let typeList = Object.keys(C.DEVICE_TYPES).concat(Object.keys(C.customTypes()));
    if (!showAllTypes) {
      typeList = typeList.filter(t => used[t] || imgs[t]);
    }
    typeList.sort((a, b) => C.typeLabel(a).localeCompare(C.typeLabel(b), 'de'));

    const tiles = typeList.length ? typeList.map(t => {
      const has = !!imgs[t];
      const hw = C.hardwareFor(t);
      return '<div class="ti-tile' + (has ? ' has' : '') + '" data-type="' + U.escapeHtml(t) + '">' +
        '<div class="ti-img">' +
          (has ? '<img src="' + U.escapeHtml(imgs[t]) + '" alt="">'
               : hw ? '<svg viewBox="0 0 120 48"><use href="#' + hw + '"></use></svg>'
                    : '<span class="ti-none">kein Bild</span>') +
        '</div>' +
        '<div class="ti-label">' + U.escapeHtml(U.truncate(C.typeLabel(t), 22)) +
          (used[t] ? ' <em>· ' + used[t] + '×</em>' : '') + '</div>' +
        '<div class="ti-actions">' +
          '<button type="button" class="btn" data-ti-pick="' + U.escapeHtml(t) + '">' +
            (has ? 'Ersetzen' : 'Bild wählen') + '</button>' +
          (has ? '<button type="button" class="btn ghost-danger" data-ti-del="' + U.escapeHtml(t) + '">✕</button>' : '') +
        '</div>' +
      '</div>';
    }).join('') : '<div class="dash-empty">Noch keine Gerätetypen im Projekt.</div>';

    const tiBytes = typeImageBytes();
    const gerätebilder =
      toggle('showAllTypes', 'Nur verwendete Typen zeigen', !showAllTypes,
        'Ein Typbild gilt für <i>alle</i> Geräte dieses Typs — einmal hinterlegen genügt. ' +
        'Ohne Bild zeigt die Kachel die gezeichnete Hardware-Ansicht.') +
      '<div class="ti-grid">' + tiles + '</div>' +
      '<div class="dash-note">Bilder werden auf ' + NWT.Images.MAX_EDGE +
      ' Pixel verkleinert und im Projekt gespeichert (aktuell ' +
      NWT.Images.formatBytes(tiBytes) + ' für ' + Object.keys(imgs).length + ' Typbilder). ' +
      'Verwenden Sie nur Bilder, an denen Sie die Rechte haben.</div>';

    /* --- Eigene Symbole --- */
    const custom = C.customTypes();
    const symKeys = Object.keys(custom);
    const symbole =
      (symKeys.length
        ? '<div class="sym-list">' + symKeys.map(id => {
            const t = custom[id];
            const ic = NWT.Symbols.iconFor(id);
            return '<div class="sym-list-item" style="color:' + U.escapeHtml(t.color) + '">' +
              '<span class="sym-list-icon">' +
                (ic.kind === 'image' ? '<img src="' + U.escapeHtml(ic.href) + '" alt="">'
                                     : '<svg viewBox="0 0 24 24"><use href="' + U.escapeHtml(ic.href) + '"></use></svg>') +
              '</span>' +
              '<span class="sym-list-name">' + U.escapeHtml(t.label) + '</span>' +
              '<button type="button" class="btn" data-sym-edit="' + U.escapeHtml(id) + '">Bearbeiten</button>' +
              '<button type="button" class="btn ghost-danger" data-sym-del="' + U.escapeHtml(id) + '">Löschen</button>' +
            '</div>';
          }).join('') + '</div>'
        : '<div class="dash-empty">Noch keine eigenen Symbole angelegt.</div>') +
      '<div class="dash-actions"><button type="button" class="btn primary" data-sym-new>Neues Symbol …</button></div>';

    /* --- Speicher --- */
    const imgStats = NWT.Images.stats();
    const projects = NWT.Persistence.available() ? NWT.Persistence.listProjects().length : 0;
    const speicher =
      '<table class="dash-table"><tbody>' +
        '<tr><td>Browser-Speicher</td><td>' +
          (NWT.Persistence.available() ? 'verfügbar' : '<b>nicht verfügbar</b> — bitte per Export sichern') + '</td></tr>' +
        '<tr><td>Gespeicherte Projekte</td><td>' + projects + '</td></tr>' +
        '<tr><td>Gerätefotos</td><td>' + imgStats.count + ' · ' + NWT.Images.formatBytes(imgStats.bytes) + '</td></tr>' +
        '<tr><td>Typbilder</td><td>' + Object.keys(imgs).length + ' · ' + NWT.Images.formatBytes(tiBytes) + '</td></tr>' +
        '<tr><td>Eigene Symbole</td><td>' + symKeys.length + '</td></tr>' +
      '</tbody></table>' +
      '<div class="dash-actions">' +
        '<button type="button" class="btn" data-act-projects>Projekte verwalten …</button>' +
        '<button type="button" class="btn" data-act-export>Als JSON sichern</button>' +
        '<button type="button" class="btn ghost-danger" data-act-clearauto>Automatische Sicherung löschen</button>' +
      '</div>';

    /* --- Hilfe --- */
    const hilfe =
      '<div class="dash-actions">' +
        '<button type="button" class="btn" data-act-help>Kurzhilfe &amp; Kürzel</button>' +
        '<button type="button" class="btn" data-act-handbook>Ausführliches Handbuch</button>' +
        '<button type="button" class="btn" data-act-example>Beispielnetzwerk laden</button>' +
      '</div>';

    /* --- Setups --- */
    const setupNames = NWT.Setups.names();
    const activeSetup = NWT.Setups.active();
    const setups = setupNames.length
      ? '<div class="setup-list">' + setupNames.map(n =>
          '<div class="setup-row' + (n === activeSetup ? ' active' : '') + '">' +
            '<span class="setup-name">' + (n === activeSetup ? '● ' : '') + U.escapeHtml(n) + '</span>' +
            '<span class="setup-desc">' + U.escapeHtml(NWT.Setups.describe(n)) + '</span>' +
            '<button type="button" class="btn primary" data-setup-apply="' + U.escapeHtml(n) + '">Anwenden</button>' +
            '<button type="button" class="btn" data-setup-over="' + U.escapeHtml(n) + '" ' +
              'title="Mit den aktuellen Einstellungen überschreiben">Aktualisieren</button>' +
            '<button type="button" class="btn" data-setup-rename="' + U.escapeHtml(n) + '">Umbenennen</button>' +
            '<button type="button" class="btn ghost-danger" data-setup-del="' + U.escapeHtml(n) + '">✕</button>' +
          '</div>').join('') + '</div>'
      : '<div class="dash-empty">Noch keine Setups gesichert.</div>';

    const setupCard = setups +
      '<div class="dash-actions">' +
        '<button type="button" class="btn primary" data-setup-new>Aktuelle Einstellungen sichern …</button>' +
        (setupNames.length ? '' :
          '<button type="button" class="btn" data-setup-examples>Vier Beispiel-Setups anlegen</button>') +
      '</div>' +
      '<div class="dash-note">Ein Setup hält <b>Einstellungen</b> fest, nicht den Netzplan: Ansicht, ' +
      'Gerätedarstellung, Standard-Verbindungstyp, eigene Verbindungsarten, Bildauswahl, Design und ' +
      'Hinweisfenster. So schalten Sie zwischen Szenarien um — Arbeiten, Präsentation, Druck — ohne ' +
      'die Zeichnung anzufassen. Setups gehören zum Arbeitsplatz und gelten über alle Projekte hinweg; ' +
      'sie reisen <b>nicht</b> in einer exportierten JSON-Datei mit. Das Anwenden ist ein einziger ' +
      'Schritt und mit <b>Strg+Z</b> zurücknehmbar. Schneller geht es über das Zahnrad-Menü in der ' +
      'Werkzeugleiste.</div>';

    /* --- Bildbibliothek --- */
    const lib = NWT.Library.analyze();
    const picks = P.libraryPicks || {};
    const sicher = lib.filter(x => x.confidence === 'hoch').length;
    const offen = lib.filter(x => !x.type).length;
    const abgedeckt = {};
    lib.forEach(x => { if (x.type && x.confidence === 'hoch') abgedeckt[x.type] = true; });
    Object.keys(picks).forEach(t => { abgedeckt[t] = true; });

    const libList = lib.length
      ? '<div class="lib-grid">' + lib.map(x => {
          const gewaehlt = picks[x.type] === x.name;
          return '<div class="lib-card' + (gewaehlt ? ' picked' : '') + '">' +
            '<img class="lib-thumb" src="' + U.escapeHtml(x.data) + '" alt="">' +
            '<div class="lib-file">' + U.escapeHtml(x.name) + '</div>' +
            '<div class="lib-type">' + (x.type
              ? U.escapeHtml(C.typeLabel(x.type)) +
                (x.variant ? ' <em>· ' + U.escapeHtml(x.variant) + '</em>' : '')
              : '<span class="lib-open">nicht zugeordnet</span>') + '</div>' +
            (x.type
              ? '<button type="button" class="btn lib-pick" data-lib-pick="' + U.escapeHtml(x.type) +
                '" data-lib-name="' + U.escapeHtml(x.name) + '">' +
                (gewaehlt ? 'gewählt' : 'als Typbild') + '</button>'
              : '') +
          '</div>';
        }).join('') + '</div>'
      : '<div class="dash-empty">Es sind keine Bilder eingebettet oder eingelesen.</div>';

    const bibliothek =
      '<div class="kpi-row small">' +
        '<div class="kpi"><b>' + lib.length + '</b><span>Bilder</span></div>' +
        '<div class="kpi"><b>' + sicher + '</b><span>sicher zugeordnet</span></div>' +
        '<div class="kpi"><b>' + offen + '</b><span>offen</span></div>' +
        '<div class="kpi"><b>' + Object.keys(abgedeckt).length + '</b><span>Gerätetypen abgedeckt</span></div>' +
        '<div class="kpi"><b>' + NWT.Library.runtimeCount() + '</b><span>eingelesen</span></div>' +
      '</div>' +
      '<div class="dash-actions">' +
        '<button type="button" class="btn primary" data-lib-review>Zuordnung prüfen …</button>' +
        '<button type="button" class="btn" data-lib-open>Bildordner einlesen …</button>' +
        (NWT.Library.runtimeCount()
          ? '<button type="button" class="btn ghost-danger" data-lib-clear>Eingelesene verwerfen</button>' : '') +
      '</div>' +
      libList +
      '<div class="dash-note">Bilder im Ordner <code>bilder/</code> werden beim Bauen eingebettet und ' +
      'stehen in <b>jedem</b> Projekt zur Verfügung, ohne die Projektdatei zu vergrößern — gespeichert ' +
      'wird nur der Dateiname der Auswahl. Eingelesene Ordner werden im Browser verkleinert und gelten ' +
      'nur für diese Sitzung, bis Sie sie einem Typ zuweisen. ' +
      'Ein Bild direkt am Gerät (Rechtsklick → Foto) hat immer Vorrang.</div>';

    /* --- Verbindungsarten --- */
    const styles = P.connStyles || {};
    const connRows = C.CONN_CATEGORIES.map(cat => {
      const ids = C.connTypesIn(cat.id);
      if (!ids.length) return '';
      return '<div class="cs-group"><h4>' + U.escapeHtml(cat.label) + '</h4>' +
        ids.map(id => {
          const eff = S.edgeStyle({ type: id });
          const own = !!styles[id];
          return '<div class="cs-row' + (own ? ' changed' : '') + '" data-conn="' + id + '">' +
            '<span class="cs-name" title="' + U.escapeHtml(C.connType(id).label) + '">' + U.escapeHtml(C.connType(id).label) + '</span>' +
            '<svg class="cs-preview" viewBox="0 0 90 14" preserveAspectRatio="none">' +
              '<line x1="2" y1="7" x2="88" y2="7" stroke-linecap="round" stroke="' + eff.color +
              '" stroke-width="' + eff.width + '"' +
              (eff.dash ? ' stroke-dasharray="' + U.escapeHtml(eff.dash) + '"' : '') + '></line>' +
            '</svg>' +
            '<input type="color" data-cs="color" value="' + U.escapeHtml(eff.color) + '" title="Farbe">' +
            '<input type="number" data-cs="width" value="' + eff.width + '" min="0.5" max="12" step="0.1" title="Linienstärke">' +
            '<select data-cs="dash" title="Strichmuster">' + C.DASH_PRESETS.map(p =>
              '<option value="' + U.escapeHtml(p.value) + '"' + (p.value === eff.dash ? ' selected' : '') + '>' +
              U.escapeHtml(p.label) + '</option>').join('') + '</select>' +
            '<button type="button" class="btn cs-reset"' + (own ? '' : ' disabled') +
              ' title="Auf Auslieferungszustand zurücksetzen">↺</button>' +
          '</div>';
        }).join('') + '</div>';
    }).join('');

    const changedCount = Object.keys(styles).length;
    const verbindungen =
      '<div class="cs-list">' + connRows + '</div>' +
      '<div class="dash-actions">' +
        '<button type="button" class="btn ghost-danger" data-cs-reset-all' +
        (changedCount ? '' : ' disabled') + '>Alle zurücksetzen' +
        (changedCount ? ' (' + changedCount + ')' : '') + '</button>' +
      '</div>' +
      '<div class="dash-note">Diese Vorgaben gelten für <b>alle</b> Leitungen des jeweiligen Typs im ' +
      'Projekt und werden mitgespeichert. Eine einzelne Leitung lässt sich davon abweichend im ' +
      'Verbindungsdialog gestalten — geänderte Typen sind hier markiert.</div>';

    overlay.querySelector('.dash-body').innerHTML =
      '<div class="dash-inner set-inner">' +
        '<div class="dash-grid">' +
          card('Ansicht', ansicht) +
          card('Gerätedarstellung', darstellung,
            'Reihenfolge: eigenes Foto → Typbild → Hardware-Ansicht → Strichsymbol.') +
          card('Bedienung', bedienung) +
          card('Projekt', projekt) +
          card('Eigene Symbole', symbole) +
          card('Speicher', speicher) +
          card('Hilfe', hilfe) +
        '</div>' +
        '<section class="dash-card set-card set-wide"><h3>Vertrauliche Angaben maskieren</h3>' + maskCard +
          '<div class="dash-note">Maskiert wird der Text selbst, nicht ein Balken darüber — in der ' +
          'exportierten Datei steht danach nichts anderes mehr. Was auf einem Gerätefoto zu lesen ist, ' +
          'kann das Programm nicht erkennen. Die Einstellung gehört zum Projekt und reist in der ' +
          'JSON-Datei mit; deren Inhalt bleibt unmaskiert, denn sie ist Ihre Arbeitsdatei.</div></section>' +
        '<section class="dash-card set-card set-wide"><h3>Setups — Einstellungen für Szenarien</h3>' + setupCard + '</section>' +
        '<section class="dash-card set-card set-wide"><h3>Bildbibliothek</h3>' + bibliothek + '</section>' +
        '<section class="dash-card set-card set-wide"><h3>Verbindungsarten</h3>' + verbindungen + '</section>' +
        '<section class="dash-card set-card set-wide"><h3>Gerätebilder je Typ</h3>' + gerätebilder + '</section>' +
      '</div>';

    wire();
  }

  /* ------------------------------------------------------- Verdrahten */

  function wire() {
    const body = overlay.querySelector('.dash-body');

    body.querySelectorAll('[data-set]').forEach(el => {
      el.addEventListener('change', () => apply(el.getAttribute('data-set'), el));
      if (el.tagName === 'INPUT' && el.type === 'text') {
        el.addEventListener('blur', () => apply(el.getAttribute('data-set'), el));
      }
    });

    body.querySelectorAll('[data-ti-pick]').forEach(b => b.addEventListener('click', () => {
      pendingType = b.getAttribute('data-ti-pick');
      fileInput.click();
    }));
    body.querySelectorAll('[data-ti-del]').forEach(b => b.addEventListener('click', () =>
      clearTypeImage(b.getAttribute('data-ti-del'))));

    /* Bild direkt auf eine Kachel ziehen */
    body.querySelectorAll('.ti-tile').forEach(tile => {
      tile.addEventListener('dragover', e => { e.preventDefault(); tile.classList.add('over'); });
      tile.addEventListener('dragleave', () => tile.classList.remove('over'));
      tile.addEventListener('drop', e => {
        e.preventDefault();
        tile.classList.remove('over');
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) setTypeImage(tile.getAttribute('data-type'), f);
      });
    });

    /* Setups */
    body.querySelectorAll('[data-setup-apply]').forEach(b => b.addEventListener('click', () => {
      NWT.Setups.apply(b.getAttribute('data-setup-apply'));
      render();
    }));
    body.querySelectorAll('[data-setup-over]').forEach(b => b.addEventListener('click', () => {
      const name = b.getAttribute('data-setup-over');
      NWT.Modal.confirm({
        title: 'Setup aktualisieren',
        message: 'Das Setup „' + name + '“ wird mit den aktuellen Einstellungen überschrieben.',
        confirmLabel: 'Überschreiben'
      }).then(ok => {
        if (!ok) return;
        NWT.Setups.save(name);
        U.toast('Setup „' + name + '“ aktualisiert', 'ok');
        render();
      });
    }));
    body.querySelectorAll('[data-setup-rename]').forEach(b => b.addEventListener('click', () => {
      const name = b.getAttribute('data-setup-rename');
      NWT.Modal.prompt({ title: 'Setup umbenennen', label: 'Neuer Name', value: name })
        .then(next => {
          if (!next || next === name) return;
          try { NWT.Setups.rename(name, next); render(); }
          catch (e) { NWT.Modal.error('Umbenennen nicht möglich.', e.message); }
        });
    }));
    body.querySelectorAll('[data-setup-del]').forEach(b => b.addEventListener('click', () => {
      const name = b.getAttribute('data-setup-del');
      NWT.Modal.confirm({
        title: 'Setup löschen',
        message: 'Das Setup „' + name + '“ endgültig löschen? Die aktuellen Einstellungen bleiben unverändert.',
        confirmLabel: 'Löschen', danger: true
      }).then(ok => { if (ok) { NWT.Setups.remove(name); render(); } });
    }));
    const setupNew = body.querySelector('[data-setup-new]');
    if (setupNew) setupNew.addEventListener('click', () => {
      NWT.Modal.prompt({
        title: 'Einstellungen als Setup sichern',
        subtitle: 'Ansicht, Darstellung, Verbindungsarten, Design und Hinweisfenster — ohne den Netzplan.',
        label: 'Name des Setups',
        value: NWT.Setups.active(),
        placeholder: 'z. B. Präsentation'
      }).then(name => {
        if (!name) return;
        try { NWT.Setups.save(name); U.toast('Setup „' + name.trim() + '“ gesichert', 'ok'); render(); }
        catch (e) { NWT.Modal.error('Das Setup konnte nicht gesichert werden.', e.message); }
      });
    });
    const setupEx = body.querySelector('[data-setup-examples]');
    if (setupEx) setupEx.addEventListener('click', () => {
      const made = NWT.Setups.createExamples();
      U.toast(made.length + ' Beispiel-Setups angelegt: ' + made.join(', '), 'ok', 4000);
      render();
    });

    /* Bildbibliothek */
    const act0 = (sel, fn) => {
      const el = body.querySelector(sel);
      if (el) el.addEventListener('click', fn);
    };
    act0('[data-lib-review]', () => NWT.Library.reviewDialog(false).then(() => render()));
    act0('[data-lib-open]', () => folderInput.click());
    act0('[data-lib-clear]', () => {
      NWT.Library.clearRuntime();
      U.toast('Eingelesene Bilder verworfen');
      render();
    });
    body.querySelectorAll('[data-lib-pick]').forEach(b => b.addEventListener('click', () => {
      const type = b.getAttribute('data-lib-pick');
      const name = b.getAttribute('data-lib-name');
      const current = (S.project.libraryPicks || {})[type];
      NWT.History.record('Bildauswahl');
      NWT.Library.pick(type, current === name ? '' : name);
      render();
    }));

    /* Verbindungsarten: jede Änderung schreibt alle drei Werte als Typvorgabe.
       Aktualisiert wird nur die betroffene Zeile — ein Neuaufbau der ganzen
       Seite würde beim Tippen den Fokus aus dem Feld reißen. */
    const refreshResetAll = () => {
      const btn = body.querySelector('[data-cs-reset-all]');
      if (!btn) return;
      const n = Object.keys(S.project.connStyles || {}).length;
      btn.disabled = n === 0;
      btn.textContent = 'Alle zurücksetzen' + (n ? ' (' + n + ')' : '');
    };

    body.querySelectorAll('.cs-row').forEach(row => {
      const id = row.getAttribute('data-conn');

      const refreshRow = () => {
        const eff = S.edgeStyle({ type: id });
        const line = row.querySelector('.cs-preview line');
        if (line) {
          line.setAttribute('stroke', eff.color);
          line.setAttribute('stroke-width', eff.width);
          if (eff.dash) line.setAttribute('stroke-dasharray', eff.dash);
          else line.removeAttribute('stroke-dasharray');
        }
        const own = !!(S.project.connStyles || {})[id];
        row.classList.toggle('changed', own);
        const rb = row.querySelector('.cs-reset');
        if (rb) rb.disabled = !own;
        refreshResetAll();
      };

      const store = () => {
        const base = C.connType(id);
        const chosen = {
          color: row.querySelector('[data-cs="color"]').value,
          width: Number(row.querySelector('[data-cs="width"]').value) || base.width,
          dash: row.querySelector('[data-cs="dash"]').value
        };
        if (!S.project.connStyles) S.project.connStyles = {};
        if (chosen.color.toLowerCase() === base.color.toLowerCase() &&
            Math.abs(chosen.width - base.width) < 0.001 && chosen.dash === (base.dash || '')) {
          delete S.project.connStyles[id];
        } else {
          S.project.connStyles[id] = chosen;
        }
        S.touch();
        NWT.emit('change', { structural: true });
        refreshRow();
      };

      row.querySelectorAll('[data-cs]').forEach(el => {
        el.addEventListener('change', store);
        /* Der Farbwähler meldet beim Ziehen nur input — sonst bliebe die
           Vorschau stehen, bis der Dialog geschlossen wird. */
        if (el.type === 'color') el.addEventListener('input', store);
      });

      const reset = row.querySelector('.cs-reset');
      if (reset) reset.addEventListener('click', () => {
        if (!S.project.connStyles || !S.project.connStyles[id]) return;
        NWT.History.record('Verbindungsart zurücksetzen');
        delete S.project.connStyles[id];
        const base = C.connType(id);
        row.querySelector('[data-cs="color"]').value = base.color;
        row.querySelector('[data-cs="width"]').value = base.width;
        row.querySelector('[data-cs="dash"]').value = base.dash || '';
        S.touch();
        NWT.emit('change', { structural: true });
        refreshRow();
      });
    });

    const resetAll = body.querySelector('[data-cs-reset-all]');
    if (resetAll) resetAll.addEventListener('click', () => {
      NWT.Modal.confirm({
        title: 'Verbindungsarten zurücksetzen',
        message: 'Alle eigenen Vorgaben für Farbe, Linienstärke und Strichmuster werden entfernt. ' +
                 'Abweichungen an einzelnen Leitungen bleiben erhalten.',
        confirmLabel: 'Zurücksetzen', danger: true
      }).then(ok => {
        if (!ok) return;
        NWT.History.record('Verbindungsarten zurücksetzen');
        S.project.connStyles = {};
        S.touch();
        NWT.emit('change', { structural: true });
        render();
      });
    });

    body.querySelectorAll('[data-sym-edit]').forEach(b => b.addEventListener('click', () => {
      NWT.Symbols.open(b.getAttribute('data-sym-edit')).then(() => render());
    }));
    body.querySelectorAll('[data-sym-del]').forEach(b => b.addEventListener('click', () => {
      NWT.Symbols.remove(b.getAttribute('data-sym-del')).then(() => render());
    }));
    const symNew = body.querySelector('[data-sym-new]');
    if (symNew) symNew.addEventListener('click', () => NWT.Symbols.open().then(() => render()));

    const act = (sel, fn) => {
      const el = body.querySelector(sel);
      if (el) el.addEventListener('click', fn);
    };
    act('[data-act-projects]', () => { close(); NWT.Commands.openProject(); });
    act('[data-act-export]', () => NWT.Exchange.exportJson());
    act('[data-act-clearauto]', () => {
      NWT.Modal.confirm({
        title: 'Automatische Sicherung löschen',
        message: 'Der zuletzt automatisch gesicherte Stand wird entfernt. Das aktuelle Projekt bleibt geöffnet.',
        confirmLabel: 'Löschen', danger: true
      }).then(ok => {
        if (!ok) return;
        NWT.Persistence.clearAutosave();
        U.toast('Automatische Sicherung gelöscht');
        render();
      });
    });
    act('[data-act-help]', () => { close(); NWT.Dialogs.help(); });
    act('[data-act-handbook]', () => { close(); NWT.HelpDoc.open(); });
    act('[data-act-example]', () => { close(); NWT.Commands.loadExample(); });
  }

  function apply(key, el) {
    const st = S.project.settings;
    const value = el.type === 'checkbox' ? el.checked : el.value;

    switch (key) {
      /* Nur der Stil ändert das Aussehen der ganzen Karte; die
         Gruppenhaken aktualisieren allein die Vorschauzeile — ein
         Vollaufbau würde hier den Fokus stehlen. */
      case 'pv-on': case 'pv-style':
        NWT.Privacy.set(key.slice(3), value);
        if (isOpen()) render();
        return;
      case 'pv-ip': case 'pv-mac': case 'pv-host': case 'pv-names':
      case 'pv-ports': case 'pv-labels': case 'pv-notes':
        NWT.Privacy.set(key.slice(3), value);
        updatePrivacySample();
        return;

      case 'grid': case 'snap': case 'photos': case 'hardware': case 'minimap': case 'avoidObstacles':
        st[key] = value;
        NWT.Viewport.apply();
        NWT.emit('change', { structural: true });
        NWT.emit('settings');
        break;
      case 'gridSize': {
        const n = U.clamp(parseInt(value, 10) || 20, 5, 200);
        st.gridSize = n;
        el.value = n;
        NWT.Viewport.apply();
        NWT.emit('change', { structural: false });
        break;
      }
      case 'routing':
        NWT.History.record('Linienführung');
        st.routing = value;
        NWT.emit('change', { structural: true });
        NWT.emit('settings');
        break;
      case 'defaultConnType':
      case 'activeLayer':
        st[key] = value;
        NWT.emit('change', { structural: false });
        NWT.emit('settings');
        break;
      case 'theme':
        NWT.Theme.set(value);
        break;
      case 'tooltips':
        NWT.Tooltip.setEnabled(value);
        NWT.emit('settings');
        break;
      case 'projectName':
        S.project.name = String(value).trim() || 'Unbenannt';
        S.touch();
        NWT.emit('project:meta');
        NWT.emit('change', { structural: false });
        overlay.querySelector('#set-sub').textContent = S.project.name;
        break;
      case 'author': case 'company': case 'location':
        S.project.info[key] = value;
        S.touch();
        NWT.emit('project:meta');
        NWT.emit('change', { structural: false });
        break;
      case 'showAllTypes':
        showAllTypes = !el.checked;
        render();
        break;
    }
  }

  /* Nach Projektwechsel neu aufbauen, damit die Werte stimmen. */
  NWT.on('project:replaced', () => { if (isOpen()) render(); });
  NWT.on('customtypes', () => { if (isOpen()) render(); });
  NWT.on('setups', () => { if (isOpen()) render(); });

  return { init, open, close, isOpen, render };
})();
