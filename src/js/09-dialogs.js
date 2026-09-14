/* ============================================================
   09 — Fachdialoge: Gerät, Verbindung, Bereich, Projektinfo, Hilfe
   ============================================================ */

NWT.Dialogs = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;
  const M = NWT.Modal;

  function layerOptions() {
    return S.project.layers.map(l => ({ value: l.id, label: l.name }));
  }

  /* ---------------------------------------------------------- Gerätefoto */

  function photoFieldHtml(d) {
    const has = !!d.image;
    const kb = has ? Math.round((d.image.length - (d.image.indexOf(',') + 1)) * 0.75 / 1024) : 0;
    return '<div class="photo-field" data-photo-for="' + d.id + '">' +
      '<div class="photo-preview">' +
        (has ? '<img alt="Gerätefoto" src="' + U.escapeHtml(d.image) + '">'
             : '<span class="photo-empty">Kein Foto hinterlegt</span>') +
      '</div>' +
      '<div class="photo-actions">' +
        '<button type="button" class="btn" data-photo-pick>' + (has ? 'Foto ersetzen …' : 'Foto wählen …') + '</button>' +
        (has ? '<button type="button" class="btn ghost-danger" data-photo-del>Entfernen</button>' : '') +
        '<div class="hintline">' +
          (has ? 'Verkleinert gespeichert, ca. ' + kb + ' KB. ' : '') +
          'Auch möglich: Bild auf das Gerät ziehen oder mit Strg+V einfügen.' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function wirePhotoField(root, deviceId) {
    const refresh = () => {
      const host = root.querySelector('[data-photo-for]');
      const dev = S.dev(deviceId);
      if (!host || !dev) return;
      host.outerHTML = photoFieldHtml(dev);
      wirePhotoField(root, deviceId);
    };
    const pick = root.querySelector('[data-photo-pick]');
    if (pick) pick.addEventListener('click', () => NWT.Images.pickFor(deviceId));
    const del = root.querySelector('[data-photo-del]');
    if (del) del.addEventListener('click', () => { NWT.Images.remove(deviceId); refresh(); });
    return refresh;
  }

  /** Vorschaulinie im Verbindungsdialog — zeigt Farbe, Stärke und Muster live. */
  function stylePreviewHtml() {
    return '<svg id="style-preview" viewBox="0 0 260 34" width="100%" height="34">' +
      '<line id="style-preview-line" x1="14" y1="17" x2="246" y2="17" stroke-linecap="round"></line>' +
      '<circle class="pv-cap" cx="14" cy="17" r="3.4"></circle>' +
      '<circle class="pv-cap" cx="246" cy="17" r="3.4"></circle>' +
      '</svg>';
  }

  function portsToText(ports) {
    return (ports || []).map(p => p.name).join('\n');
  }
  function textToPorts(text) {
    return String(text || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).map(n => ({ name: n }));
  }

  /* ------------------------------------------------------------- Gerät */

  function editDevice(id) {
    const d = S.dev(id);
    if (!d) return Promise.resolve(null);
    /* Dekoration und Text haben weder Netzwerkangaben noch Ports —
       sie bekommen ihre eigenen, viel kürzeren Dialoge. */
    const sh = C.shapeOf(d.type);
    if (sh === 'shape') return editDecor(id);
    if (sh === 'text' || sh === 'note') return editText(id);
    if (sh === 'junction') return editJunction(id);

    const fields = [
      { section: 'Identifikation' },
      { key: 'name', label: 'Name' },
      { key: 'type', label: 'Gerätetyp', type: 'select', options: C.typeOptions() },
      { key: 'hostname', label: 'Hostname', mono: true },
      { key: 'status', label: 'Status', type: 'select', options: C.statusOptions() },
      { key: 'manufacturer', label: 'Hersteller' },
      { key: 'model', label: 'Modell' },

      { section: 'Netzwerk' },
      { key: 'ip', label: 'IP-Adresse', mono: true, placeholder: '192.168.1.10' },
      { key: 'ipv6', label: 'IPv6-Adresse', mono: true, placeholder: 'fd00::10' },
      { key: 'mac', label: 'MAC-Adresse', mono: true, placeholder: '00:1A:2B:3C:4D:5E' },
      { key: 'vlan', label: 'VLAN', placeholder: '10' },

      { section: 'Standort' },
      { key: 'location', label: 'Standort' },
      { key: 'room', label: 'Raum' },
      { key: 'rack', label: 'Rack' },
      { key: 'layer', label: 'Ebene', type: 'select', options: layerOptions() },

      { section: 'Weitere Angaben' },
      { key: 'os', label: 'Betriebssystem' },
      { key: 'protocol', label: 'Protokoll / Bus', placeholder: 'DCC, mfx · PROFINET · Modbus TCP' },
      { key: 'description', label: 'Beschreibung', type: 'textarea', wide: true, rows: 2 },
      { key: 'notes', label: 'Bemerkungen', type: 'textarea', wide: true, rows: 2 },
      { key: 'portsText', label: 'Ports (eine Zeile je Port)', type: 'textarea', wide: true, rows: 4,
        hint: 'Diese Liste steht im Verbindungsdialog zur Auswahl.' },

      { section: 'Gerätefoto' },
      { key: '_photo', label: 'Foto', type: 'custom', wide: true, render: () => photoFieldHtml(d) }
    ];

    const values = Object.assign({}, d, { portsText: portsToText(d.ports) });
    const defaultPortsText = portsToText(C.buildPorts(d.type));
    let offChange = null;

    return M.form({
      title: 'Geräteeigenschaften',
      subtitle: d.name + ' · ' + C.typeLabel(d.type) + ' · ID ' + d.id,
      fields: fields,
      values: values,
      width: '760px',
      submitLabel: 'Übernehmen',
      extraButtons: [
        { label: 'Schnittstellen', value: { __interfaces: true } },
        { label: 'Löschen', kind: 'ghost-danger', left: true, value: { __delete: true } },
        { label: 'Duplizieren', left: true, value: { __duplicate: true } }
      ],
      onMount: (root) => {
        const refresh = wirePhotoField(root, id);
        /* Ein per Dateidialog gewähltes Foto trifft asynchron ein. */
        offChange = NWT.on('change', () => refresh());
      }
    }).then(res => {
      if (offChange) { offChange(); offChange = null; }
      if (!res) return null;
      if (res.__interfaces) return NWT.Workbench.editInterfaces(id);
      if (res.__delete) { NWT.Commands.deleteIds([id]); return null; }
      if (res.__duplicate) { NWT.Commands.duplicateSelection([id]); return null; }

      NWT.History.record('Geräteeigenschaften');
      const oldType = d.type;
      const portsTextChanged = res.portsText !== defaultPortsText;

      ['name', 'type', 'hostname', 'status', 'manufacturer', 'model', 'ip', 'ipv6', 'mac',
       'vlan', 'location', 'room', 'rack', 'layer', 'os', 'protocol', 'description', 'notes'].forEach(k => {
        if (res[k] !== undefined) d[k] = res[k];
      });

      if (!C.known(d.type)) d.type = oldType;
      /* Typ gewechselt und Portliste unverändert → Ports des neuen Typs übernehmen. */
      if (d.type !== oldType && !portsTextChanged) d.ports = C.buildPorts(d.type);
      else d.ports = textToPorts(res.portsText);

      S.touch();
      NWT.emit('change', { structural: true });
      return d;
    });
  }

  /* ---------------------------------------------------- Abzweig */

  /**
   * Ein Abzweig hat weder IP noch Ports — er ist eine Stelle im Kabel.
   * Der volle Gerätedialog mit zwanzig leeren Feldern wäre hier eine
   * Zumutung.
   */
  function editJunction(id) {
    const d = S.dev(id);
    if (!d) return Promise.resolve(null);
    const anzahl = S.connectionsOf(id).length;
    return M.form({
      title: 'Abzweig / Knotenpunkt',
      subtitle: 'ID ' + d.id + ' · ' + anzahl + ' Leitung(en)',
      width: '480px',
      fields: [
        { key: 'name', label: 'Bezeichnung', wide: true,
          hint: 'Erscheint nicht auf der Zeichenfläche, nur in Suche und Statusleiste.' },
        { key: 'description', label: 'Bemerkung', type: 'textarea', wide: true, rows: 2,
          placeholder: 'z. B. Abzweigdose im Kabelkanal, Schrank B' },
        { key: 'layer', label: 'Ebene', type: 'select', options: layerOptions() }
      ],
      values: d,
      submitLabel: 'Übernehmen',
      extraButtons: [
        { label: 'Löschen', kind: 'ghost-danger', left: true, value: { __delete: true } }
      ]
    }).then(res => {
      if (!res) return null;
      if (res.__delete) { NWT.Commands.deleteIds([id]); return null; }
      NWT.History.record('Abzweig bearbeiten');
      d.name = res.name; d.description = res.description; d.layer = res.layer;
      S.touch();
      NWT.emit('change', { structural: true });
      return d;
    });
  }

  /* ------------------------------------------------ Text und Notiz */

  /** Schriftfelder — dieselben für Textfeld, Notiz und Formbeschriftung. */
  function fontFields(prefixSection) {
    const D = NWT.Decor;
    return [
      { section: prefixSection },
      { key: 'font', label: 'Schriftart', type: 'select', options: D.fontOptions(),
        hint: 'Systemschriften mit Rückfallkette — mitgelieferte Schriftdateien verbietet die Einzeldatei-Auslieferung.' },
      { key: 'fontSize', label: 'Schriftgröße (px)', type: 'number', min: 6, max: 200, step: 1 },
      { key: 'color', label: 'Schriftfarbe', type: 'color' },
      { key: 'useColor', label: 'eigene Schriftfarbe verwenden', type: 'checkbox', wide: true,
        hint: 'Ohne Haken folgt die Schrift dem Design — im dunklen Design also hell.' },
      { key: 'bold', label: 'Fett', type: 'checkbox' },
      { key: 'italic', label: 'Kursiv', type: 'checkbox' },
      { key: 'align', label: 'Ausrichtung', type: 'select', options: D.ALIGNS }
    ];
  }

  function fontValues(d) {
    const ts = NWT.Decor.textStyle(d);
    return {
      font: ts.font, fontSize: ts.size,
      color: ts.color || (NWT.Theme.effective() === 'dark' ? '#e8eef8' : '#0f172a'),
      useColor: !!ts.color,
      bold: ts.weight >= 600, italic: ts.italic, align: ts.align
    };
  }

  function applyFont(d, res) {
    const D = NWT.Decor;
    d.font = D.FONTS[res.font] ? res.font : undefined;
    d.fontSize = U.clamp(Number(res.fontSize) || 0, 6, 200) || undefined;
    /* Ohne Haken kein Farbwert am Element — dann gilt das Design. */
    d.color = res.useColor ? res.color : undefined;
    d.bold = !!res.bold;
    d.italic = !!res.italic;
    d.align = D.ALIGNS.some(a => a.value === res.align) ? res.align : undefined;
  }

  function editText(id) {
    const d = S.dev(id);
    if (!d) return Promise.resolve(null);
    const istNotiz = C.shapeOf(d.type) === 'note';
    const r = S.deviceRect(d);

    const fields = [
      { section: 'Inhalt' },
      { key: 'name', label: istNotiz ? 'Notiztext' : 'Text', wide: true,
        type: istNotiz ? 'textarea' : 'text', rows: 4,
        placeholder: istNotiz ? 'Was hier noch zu tun ist …' : 'Beschriftung' }
    ];
    if (istNotiz) {
      fields.push({ key: 'w', label: 'Breite', type: 'number', min: 60, max: 2000, step: 10 });
      fields.push({ key: 'h', label: 'Höhe', type: 'number', min: 40, max: 2000, step: 10 });
    } else {
      fields.push({ key: '_gr', type: 'static', wide: true, label: 'Größe',
        value: 'Ein Textfeld ist einzeilig; seine Kachel folgt dem Text. Wird die Schrift '
             + 'größer, wächst das Feld mit.' });
    }
    fontFields('Schrift').forEach(f => fields.push(f));
    fields.push({ section: 'Lage' });
    fields.push({ key: 'layer', label: 'Ebene', type: 'select', options: layerOptions() });

    return M.form({
      title: istNotiz ? 'Freie Notiz' : 'Textfeld',
      subtitle: 'ID ' + d.id,
      width: '600px',
      fields: fields,
      values: Object.assign({ name: d.name || '', w: Math.round(r.w), h: Math.round(r.h),
                              layer: d.layer }, fontValues(d)),
      submitLabel: 'Übernehmen',
      extraButtons: [
        { label: 'Löschen', kind: 'ghost-danger', left: true, value: { __delete: true } },
        { label: 'Duplizieren', left: true, value: { __duplicate: true } }
      ]
    }).then(res => {
      if (!res) return null;
      if (res.__delete) { NWT.Commands.deleteIds([id]); return null; }
      if (res.__duplicate) { NWT.Commands.duplicateSelection([id]); return null; }

      NWT.History.record(istNotiz ? 'Notiz bearbeiten' : 'Textfeld bearbeiten');
      d.name = res.name;
      if (istNotiz) {
        d.w = Math.max(60, Number(res.w) || r.w);
        d.h = Math.max(40, Number(res.h) || r.h);
      }
      applyFont(d, res);
      d.layer = res.layer;
      S.touch();
      NWT.emit('change', { structural: true });
      return d;
    });
  }

  /* ------------------------------------------------------- Dekoration */

  function editDecor(id) {
    const d = S.dev(id);
    if (!d) return Promise.resolve(null);
    const D = NWT.Decor;
    const st = D.styleOf(d);
    const tsv = fontValues(d);
    const r = S.deviceRect(d);

    return M.form({
      title: 'Grafikelement',
      subtitle: C.typeLabel(d.type) + ' · ID ' + d.id,
      width: '620px',
      fields: [
        { section: 'Form' },
        { key: 'figure', label: 'Figur', type: 'select', options: D.figureOptions() },
        { key: 'name', label: 'Beschriftung', wide: true, placeholder: 'bleibt leer, wenn nichts hineingehört' },
        { key: 'w', label: 'Breite', type: 'number', min: 10, max: 4000, step: 5 },
        { key: 'h', label: 'Höhe', type: 'number', min: 10, max: 4000, step: 5 },
        { key: 'rot', label: 'Drehung (Grad)', type: 'number', min: -360, max: 360, step: 15,
          hint: 'Dreht um die Mitte. Für senkrechte Linien und Pfeile: 90.' },

        { section: 'Darstellung' },
        { key: 'stroke', label: 'Linienfarbe', type: 'color' },
        { key: 'strokeWidth', label: 'Linienstärke', type: 'number', min: 0.5, max: 24, step: 0.5 },
        { key: 'dash', label: 'Strichmuster', type: 'select', options: C.DASH_PRESETS },
        { key: 'fillOn', label: 'Fläche füllen', type: 'checkbox' },
        { key: 'fill', label: 'Füllfarbe', type: 'color' },
        { key: 'opacity', label: 'Deckkraft', type: 'number', min: 0.05, max: 1, step: 0.05,
          hint: '1 = deckend. Kleinere Werte legen die Fläche wie eine Folie über den Plan.' },

        { section: 'Beschriftung' },
        { key: 'font', label: 'Schriftart', type: 'select', options: D.fontOptions() },
        { key: 'fontSize', label: 'Schriftgröße (px)', type: 'number', min: 6, max: 200, step: 1 },
        { key: 'bold', label: 'Fett', type: 'checkbox' },
        { key: 'italic', label: 'Kursiv', type: 'checkbox' },
        { key: 'color', label: 'Schriftfarbe', type: 'color' },
        { key: 'useColor', label: 'eigene Schriftfarbe (sonst wie die Linie)', type: 'checkbox', wide: true },

        { section: 'Lage' },
        { key: 'front', label: 'Im Vordergrund (über Geräten und Leitungen)', type: 'checkbox', wide: true },
        { key: 'layer', label: 'Ebene', type: 'select', options: layerOptions() }
      ],
      values: {
        figure: st.figure, name: d.name || '',
        w: Math.round(r.w), h: Math.round(r.h), rot: st.rot,
        stroke: st.stroke, strokeWidth: st.strokeWidth, dash: st.dash,
        fillOn: st.fill !== 'none', fill: st.fill === 'none' ? st.stroke : st.fill,
        opacity: st.opacity, front: !!d.front, layer: d.layer,
        font: tsv.font, fontSize: tsv.fontSize, bold: tsv.bold,
        italic: tsv.italic, color: tsv.useColor ? tsv.color : st.stroke,
        useColor: tsv.useColor
      },
      submitLabel: 'Übernehmen',
      extraButtons: [
        { label: 'Löschen', kind: 'ghost-danger', left: true, value: { __delete: true } },
        { label: 'Duplizieren', left: true, value: { __duplicate: true } }
      ]
    }).then(res => {
      if (!res) return null;
      if (res.__delete) { NWT.Commands.deleteIds([id]); return null; }
      if (res.__duplicate) { NWT.Commands.duplicateSelection([id]); return null; }

      NWT.History.record('Grafikelement');
      d.figure = D.FIGURES[res.figure] ? res.figure : d.figure;
      d.name = res.name;
      d.w = Math.max(10, Number(res.w) || r.w);
      d.h = Math.max(10, Number(res.h) || r.h);
      d.rot = Math.round(U.clamp(Number(res.rot) || 0, -360, 360));
      d.stroke = res.stroke;
      d.strokeWidth = U.clamp(Number(res.strokeWidth) || 2, 0.5, 24);
      d.dash = res.dash;
      /* Ohne Haken keine Füllung — der Farbwähler bleibt trotzdem
         gesetzt, damit die Farbe beim nächsten Einschalten dasteht. */
      d.fill = res.fillOn ? res.fill : 'none';
      d.opacity = U.clamp(Number(res.opacity) || 1, 0.05, 1);
      d.front = !!res.front;
      applyFont(d, res);
      d.layer = res.layer;
      S.touch();
      NWT.emit('change', { structural: true });
      return d;
    });
  }

  /* -------------------------------------------------------- Verbindung */

  function portOptions(deviceId) {
    const d = S.dev(deviceId);
    const opts = [{ value: '', label: '— kein Port —' }];
    if (d) (d.ports || []).forEach(p => opts.push({ value: p.name, label: p.name }));
    return opts;
  }

  function editConnection(id) {
    const c = S.con(id);
    if (!c) return Promise.resolve(null);
    const A = S.dev(c.source), B = S.dev(c.target);

    const fields = [
      { section: 'Verbindung' },
      { key: 'label', label: 'Beschriftung', placeholder: 'z. B. Uplink Serverraum' },
      { key: 'type', label: 'Verbindungstyp', type: 'select', options: C.connTypeOptions() },
      { key: 'speed', label: 'Geschwindigkeit / Kennwert', placeholder: '1 Gbit/s · 30 W · 12 Mbit/s' },
      { key: 'vlan', label: 'VLAN', placeholder: '20' },

      { section: 'Endpunkte' },
      { key: '_src', label: 'Quelle', type: 'static', value: A ? A.name : '—' },
      { key: '_dst', label: 'Ziel', type: 'static', value: B ? B.name : '—' },
      { key: 'sourcePort', label: 'Port Quelle', type: 'select', options: portOptions(c.source) },
      { key: 'targetPort', label: 'Port Ziel', type: 'select', options: portOptions(c.target) },
      { key: 'layer', label: 'Ebene', type: 'select', options: layerOptions() },

      { section: 'Darstellung dieser Verbindung' },
      { key: 'styleColor', label: 'Farbe', type: 'color' },
      { key: 'styleWidth', label: 'Linienstärke', type: 'number', min: 0.5, max: 12, step: 0.1 },
      { key: 'styleDash', label: 'Strichmuster', type: 'select',
        options: C.DASH_PRESETS.map(p => ({ value: p.value, label: p.label })) },
      { key: '_preview', label: 'Vorschau', type: 'custom', render: () => stylePreviewHtml() },

      { section: 'Führung' },
      { key: '_pts', label: 'Knoten', type: 'static', wide: true,
        value: (c.points && c.points.length)
          ? c.points.length + ' Stützpunkt(e) gesetzt — Griffe erscheinen, sobald die Leitung '
            + 'ausgewählt ist. Doppelklick auf einen Griff entfernt ihn.'
          : 'Keine — die Leitung wird automatisch geführt. Rechtsklick auf die Leitung: '
            + '„Knoten hier einfügen" oder „Abzweig hier einfügen".' },
      { key: 'clearPoints', label: 'Knoten entfernen, automatisch führen', type: 'checkbox', wide: true },

      { section: 'Dokumentation' },
      { key: 'description', label: 'Beschreibung', type: 'textarea', wide: true, rows: 3 }
    ];

    const eff = S.edgeStyle(c);

    return M.form({
      title: 'Verbindungseigenschaften',
      subtitle: (A ? A.name : '?') + ' → ' + (B ? B.name : '?') + ' · ID ' + c.id,
      fields: fields,
      values: Object.assign({}, c, {
        styleColor: eff.color, styleWidth: eff.width, styleDash: eff.dash
      }),
      width: '720px',
      extraButtons: [
        { label: 'Löschen', kind: 'ghost-danger', left: true, value: { __delete: true } },
        { label: 'Richtung tauschen', left: true, value: { __swap: true } },
        { label: 'Darstellung zurücksetzen', left: true, value: { __resetStyle: true } }
      ],
      onMount: (root) => {
        const typeSel = root.querySelector('[name="type"]');
        const speedIn = root.querySelector('[name="speed"]');
        const colorIn = root.querySelector('[name="styleColor"]');
        const widthIn = root.querySelector('[name="styleWidth"]');
        const dashIn = root.querySelector('[name="styleDash"]');

        const paint = () => {
          const line = root.querySelector('#style-preview-line');
          if (!line) return;
          line.style.stroke = colorIn.value;
          line.style.strokeWidth = widthIn.value;
          line.style.strokeDasharray = dashIn.value || 'none';
          const caps = root.querySelectorAll('#style-preview .pv-cap');
          caps.forEach(el => { el.style.fill = colorIn.value; });
        };

        /* Typwechsel füllt Geschwindigkeit und Darstellung nach, solange der
           Anwender sie nicht selbst überschrieben hat. */
        typeSel.addEventListener('change', () => {
          const prev = C.connType(c.type).speed;
          if (!speedIn.value || speedIn.value === prev) speedIn.value = C.connType(typeSel.value).speed;
          if (!c.style) {
            const next = S.edgeStyle({ type: typeSel.value });
            colorIn.value = next.color;
            widthIn.value = next.width;
            dashIn.value = next.dash;
          }
          paint();
        });
        [colorIn, widthIn, dashIn].forEach(el => {
          el.addEventListener('input', paint);
          el.addEventListener('change', paint);
        });
        paint();
      }
    }).then(res => {
      if (!res) return null;
      if (res.__delete) { NWT.Commands.deleteIds([id]); return null; }
      if (res.__resetStyle) {
        NWT.History.record('Darstellung zurücksetzen');
        delete c.style;
        S.touch();
        NWT.emit('change', { structural: true });
        U.toast('Darstellung folgt wieder dem Verbindungstyp');
        return c;
      }
      if (res.__swap) {
        NWT.History.record('Richtung tauschen');
        const s = c.source, sp = c.sourcePort;
        c.source = c.target; c.sourcePort = c.targetPort;
        c.target = s; c.targetPort = sp;
        S.reindex(); S.touch();
        NWT.emit('change', { structural: true });
        return c;
      }
      NWT.History.record('Verbindungseigenschaften');
      if (res.clearPoints) c.points = [];
      ['label', 'type', 'speed', 'vlan', 'sourcePort', 'targetPort', 'layer', 'description'].forEach(k => {
        if (res[k] !== undefined) c[k] = res[k];
      });
      if (!C.CONNECTION_TYPES[c.type]) c.type = 'custom';

      /* Weicht die eingestellte Darstellung von der Vorgabe ab, wird sie an
         der Leitung festgehalten — sonst folgt sie weiter dem Typ. */
      const typeDefault = S.edgeStyle({ type: c.type });
      const chosen = {
        color: res.styleColor || typeDefault.color,
        width: Number(res.styleWidth) || typeDefault.width,
        dash: res.styleDash === undefined ? typeDefault.dash : res.styleDash
      };
      if (chosen.color.toLowerCase() !== typeDefault.color.toLowerCase() ||
          Math.abs(chosen.width - typeDefault.width) > 0.001 ||
          chosen.dash !== typeDefault.dash) {
        c.style = chosen;
      } else {
        delete c.style;
      }

      S.touch();
      NWT.emit('change', { structural: true });
      return c;
    });
  }

  /* ------------------------------------------------------------ Bereich */

  function editArea(id) {
    const a = S.area(id);
    if (!a) return Promise.resolve(null);
    return M.form({
      title: 'Netzwerkbereich / Gruppe',
      subtitle: 'ID ' + a.id,
      fields: [
        { key: 'label', label: 'Bezeichnung', wide: true, placeholder: 'z. B. Serverraum, DMZ, Gebäude A' },
        { key: 'sublabel', label: 'Zusatz (Netz, VLAN …)', wide: true, mono: true, placeholder: '192.168.10.0/24 · VLAN 10' },
        { key: 'color', label: 'Farbe', type: 'color' },
        { key: 'layer', label: 'Ebene', type: 'select', options: layerOptions() }
      ],
      values: a,
      width: '520px',
      extraButtons: [{ label: 'Löschen', kind: 'ghost-danger', left: true, value: { __delete: true } }]
    }).then(res => {
      if (!res) return null;
      if (res.__delete) { NWT.Commands.deleteIds([id]); return null; }
      NWT.History.record('Bereich bearbeiten');
      a.label = res.label; a.sublabel = res.sublabel; a.color = res.color; a.layer = res.layer;
      S.touch();
      NWT.emit('change', { structural: true });
      return a;
    });
  }

  /* ------------------------------------------------------- Projektinfos */

  function projectInfo() {
    const P = S.project;
    return M.form({
      title: 'Projektinformationen',
      fields: [
        { key: 'name', label: 'Projektname', wide: true },
        { key: 'description', label: 'Beschreibung', type: 'textarea', wide: true, rows: 3 },
        { key: 'author', label: 'Autor' },
        { key: 'company', label: 'Firma' },
        { key: 'location', label: 'Standort' },
        { key: 'gridSize', label: 'Rastergröße (px)' },
        { key: '_created', label: 'Erstellt', type: 'static', value: U.formatDate(P.info.created) },
        { key: '_modified', label: 'Zuletzt geändert', type: 'static', value: U.formatDate(P.info.modified) }
      ],
      values: {
        name: P.name, description: P.info.description, author: P.info.author,
        company: P.info.company, location: P.info.location, gridSize: P.settings.gridSize
      },
      width: '620px'
    }).then(res => {
      if (!res) return null;
      NWT.History.record('Projektinformationen');
      P.name = res.name || 'Unbenannt';
      P.info.description = res.description;
      P.info.author = res.author;
      P.info.company = res.company;
      P.info.location = res.location;
      const gs = parseInt(res.gridSize, 10);
      if (!isNaN(gs)) P.settings.gridSize = U.clamp(gs, 5, 200);
      S.touch();
      NWT.Viewport.apply();
      NWT.emit('change', { structural: false });
      NWT.emit('project:meta');
      return P;
    });
  }

  /* --------------------------------------------------------------- Hilfe */

  function help() {
    const rows = [
      ['Entf / Rücktaste', 'Auswahl löschen'],
      ['Strg + S', 'Projekt im Browser speichern'],
      ['Strg + O', 'Projekt laden'],
      ['Strg + Z', 'Rückgängig'],
      ['Strg + Y / Strg + Umschalt + Z', 'Wiederholen'],
      ['Strg + D', 'Auswahl duplizieren'],
      ['Strg + A', 'Alles auswählen'],
      ['Strg + G', 'Bereich um Auswahl erzeugen'],
      ['Strg + E', 'JSON exportieren'],
      ['Strg + P', 'Drucken'],
      ['Strg + F', 'Gerät suchen'],
      ['Strg + Mausrad', 'Zoomen'],
      ['Strg + Plus / Minus / 0', 'Zoom vergrößern / verkleinern / 100 %'],
      ['Strg + 1', 'Alles einpassen'],
      ['Leertaste + Ziehen', 'Zeichenfläche verschieben'],
      ['Mittlere Maustaste', 'Zeichenfläche verschieben'],
      ['V / C / H', 'Auswahl- / Verbindungs- / Hand-Modus'],
      ['Doppelklick', 'Eigenschaften öffnen'],
      ['Rechtsklick', 'Kontextmenü'],
      ['Umschalt / Strg + Klick', 'Auswahl erweitern'],
      ['F1 / Umschalt + F1', 'Diese Übersicht / ausführliches Handbuch'],
      ['ESC', 'Aktion abbrechen']
    ];
    const html =
      '<div class="help-cols">' +
        '<div>' +
          '<h3>Erste Schritte</h3>' +
          '<ul>' +
            '<li>Komponente aus der linken Leiste auf die Fläche <b>ziehen</b> — oder anklicken, dann wird sie mittig eingefügt.</li>' +
            '<li><b>Verbinden</b> in der Werkzeugleiste aktivieren, danach Quelle und Ziel anklicken. Die Kette läuft weiter, bis ESC gedrückt wird.</li>' +
            '<li><b>Doppelklick</b> auf Gerät oder Leitung öffnet die Eigenschaften mit allen Dokumentationsfeldern.</li>' +
            '<li>Mehrere Geräte per <b>Auswahlrechteck</b> oder Umschalt+Klick markieren und gemeinsam verschieben.</li>' +
            '<li>Mit <b>Strg+G</b> wird aus der Auswahl ein beschrifteter Netzwerkbereich (z. B. „DMZ, 192.168.10.0/24“).</li>' +
          '</ul>' +
          '<h3>Speichern</h3>' +
          '<ul>' +
            '<li><b>Speichern/Laden</b> legt benannte Projekte im Browser (localStorage) ab.</li>' +
            '<li><b>Export/Import</b> schreibt bzw. liest eine JSON-Datei — für Backup und Austausch.</li>' +
            '<li>Zusätzlich sichert die Anwendung automatisch den letzten Stand und stellt ihn beim nächsten Start wieder her.</li>' +
          '</ul>' +
          '<h3>Hinweisfenster</h3>' +
          '<ul>' +
            '<li>Beim Verweilen auf einem Gerät oder einer Leitung zeigt ein Hinweisfenster die hinterlegten Daten — ohne Dialog.</li>' +
            '<li>Das Kontrollkästchen <b>Tipps</b> in der Werkzeugleiste schaltet alle Hinweisfenster dauerhaft ab.</li>' +
          '</ul>' +
        '</div>' +
        '<div>' +
          '<h3>Tastaturkürzel</h3>' +
          '<table class="kbd-table">' +
            rows.map(r => '<tr><td><kbd>' + U.escapeHtml(r[0]) + '</kbd></td><td>' + U.escapeHtml(r[1]) + '</td></tr>').join('') +
          '</table>' +
        '</div>' +
      '</div>';

    return M.open({
      title: 'Hilfe & Tastaturkürzel',
      subtitle: 'Netzwerk-Topologie-Tool — läuft vollständig offline im Browser',
      bodyHtml: html,
      width: '880px',
      buttons: [
        { label: 'Beispielnetzwerk laden', value: 'example', left: true },
        { label: 'Ausführliches Handbuch …', value: 'handbook', left: true },
        { label: 'Schließen', value: null, primary: true }
      ]
    }).then(v => {
      if (v === 'example') NWT.Commands.loadExample();
      else if (v === 'handbook') NWT.HelpDoc.open();
    });
  }

  return { editDevice, editDecor, editText, editJunction, editConnection, editArea, projectInfo, help };
})();
