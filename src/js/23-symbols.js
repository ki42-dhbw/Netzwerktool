/* ============================================================
   23 — Symbol-Editor
   Eigene Komponenten für die linke Leiste: zeichnen, aus SVG
   übernehmen oder aus einer Bilddatei erzeugen.

   Eigene Symbole liegen im Projekt (project.customTypes) und
   reisen daher in Speicherung, Autosave, JSON- und Grafikexport
   automatisch mit.

   SICHERHEIT: eingefügtes bzw. importiertes SVG wird strikt
   gefiltert — nur Geometrie-Elemente und eine feste Liste von
   Attributen bleiben übrig. Skripte, Verweise auf externe
   Ressourcen und Ereignis-Attribute werden entfernt.
   ============================================================ */

NWT.Symbols = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;
  const M = NWT.Modal;

  const ALLOWED_TAGS = ['g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'];
  const ALLOWED_ATTRS = [
    'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
    'x1', 'y1', 'x2', 'y2', 'points', 'transform',
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'opacity'
  ];
  const MAX_MARKUP = 24000;

  /* ------------------------------------------------------- Bereinigung */

  /**
   * Filtert beliebiges SVG auf reine Geometrie.
   * Liefert { inner, viewBox } oder null, wenn nichts Zeichenbares übrig bleibt.
   */
  function sanitizeSvg(markup) {
    const src = String(markup || '').trim();
    if (!src) return null;
    if (src.length > MAX_MARKUP) throw new Error('Das SVG ist größer als 24 KB.');

    /* In ein <svg> hüllen, falls nur Elemente übergeben wurden. */
    const wrapped = /<svg[\s>]/i.test(src) ? src : '<svg xmlns="http://www.w3.org/2000/svg">' + src + '</svg>';
    let doc;
    try { doc = new DOMParser().parseFromString(wrapped, 'image/svg+xml'); }
    catch (e) { throw new Error('Das SVG konnte nicht gelesen werden.'); }
    if (!doc || doc.getElementsByTagName('parsererror').length) {
      throw new Error('Das SVG ist nicht wohlgeformt.');
    }
    const root = doc.documentElement;
    if (!root) throw new Error('Kein SVG-Inhalt gefunden.');

    /* viewBox übernehmen oder aus width/height ableiten. */
    let viewBox = root.getAttribute('viewBox') || '';
    if (!/^\s*-?[\d.]+\s+-?[\d.]+\s+[\d.]+\s+[\d.]+\s*$/.test(viewBox)) {
      const w = parseFloat(root.getAttribute('width')) || 24;
      const h = parseFloat(root.getAttribute('height')) || 24;
      viewBox = '0 0 ' + w + ' ' + h;
    }

    const out = [];
    const walk = (node, depth) => {
      if (depth > 8) return;
      Array.prototype.forEach.call(node.childNodes, child => {
        if (child.nodeType !== 1) return;
        const tag = String(child.nodeName).toLowerCase().replace(/^svg:/, '');
        if (tag === 'defs' || tag === 'symbol' || tag === 'use') { walk(child, depth + 1); return; }
        if (ALLOWED_TAGS.indexOf(tag) < 0) return;
        const attrs = [];
        Array.prototype.forEach.call(child.attributes, a => {
          const name = a.name.toLowerCase();
          if (ALLOWED_ATTRS.indexOf(name) < 0) return;
          const value = String(a.value);
          /* Keine Verweise auf externe oder interne Ressourcen. */
          if (/url\s*\(|javascript:|data:/i.test(value)) return;
          attrs.push(name + '="' + U.escapeHtml(value) + '"');
        });
        if (tag === 'g') {
          const before = out.length;
          walk(child, depth + 1);
          const collected = out.splice(before).join('');
          if (collected) out.push('<g ' + attrs.join(' ') + '>' + collected + '</g>');
          return;
        }
        out.push('<' + tag + (attrs.length ? ' ' + attrs.join(' ') : '') + '/>');
      });
    };
    walk(root, 0);

    const inner = out.join('');
    if (!inner) return null;
    return { inner: inner, viewBox: viewBox };
  }

  /** Prüft und bereinigt eine Liste eigener Typen (z. B. aus einer Fremddatei). */
  function sanitizeTypeList(list, warnings) {
    const out = [];
    const seen = {};
    (list || []).forEach((t, i) => {
      if (!t || typeof t !== 'object') return;
      let id = String(t.id || '');
      if (!/^custom_[a-z0-9_]{1,40}$/.test(id)) id = 'custom_' + (i + 1);
      while (seen[id]) id = id + '_x';
      seen[id] = true;

      const def = {
        id: id,
        label: String(t.label || 'Eigenes Symbol').slice(0, 60),
        cat: C.CATEGORIES.some(c => c.id === t.cat) ? t.cat : 'custom',
        color: /^#[0-9a-f]{3,8}$/i.test(String(t.color)) ? String(t.color) : '#0f172a',
        ports: Array.isArray(t.ports) ? t.ports.map(p => String(p && p.name ? p.name : p)).filter(Boolean).slice(0, 64) : [],
        iconViewBox: '0 0 24 24',
        iconInner: '',
        iconImage: ''
      };

      if (t.iconImage && /^data:image\//i.test(String(t.iconImage))) {
        def.iconImage = String(t.iconImage);
      }
      if (t.iconInner) {
        try {
          const clean = sanitizeSvg('<svg viewBox="' + (t.iconViewBox || '0 0 24 24') + '">' + t.iconInner + '</svg>');
          if (clean) { def.iconInner = clean.inner; def.iconViewBox = clean.viewBox; }
        } catch (e) {
          if (warnings) warnings.push('Symbol „' + def.label + '“: SVG verworfen (' + e.message + ')');
        }
      }
      if (!def.iconInner && !def.iconImage) {
        if (warnings) warnings.push('Symbol „' + def.label + '“ enthält keine verwertbare Grafik und wurde übersprungen.');
        return;
      }
      out.push(def);
    });
    return out;
  }

  /* ------------------------------------------------- Symbole einhängen */

  /** Schreibt alle eigenen Symbole als <symbol> in die <defs> des Canvas. */
  function syncDefs() {
    const host = document.getElementById('custom-defs');
    if (!host) return;
    const list = (S.project && S.project.customTypes) || [];
    host.innerHTML = list.filter(t => t.iconInner).map(t =>
      '<symbol id="' + U.escapeHtml(symbolId(t.id)) + '" viewBox="' + U.escapeHtml(t.iconViewBox) + '">' +
      t.iconInner + '</symbol>').join('');
  }

  function symbolId(typeId) { return 'ic-' + typeId.replace(/[^a-z0-9_]/gi, ''); }

  /** Liefert die Darstellungsart eines Typs für Katalog und Zeichenfläche. */
  function iconFor(typeId) {
    const t = C.type(typeId);
    if (t.iconImage) return { kind: 'image', href: t.iconImage };
    if (t.custom) return { kind: 'symbol', href: '#' + symbolId(typeId) };
    return { kind: 'symbol', href: '#' + t.icon };
  }

  /* ------------------------------------------------------- Verwaltung */

  function list() { return (S.project.customTypes || []).slice(); }

  function nextId() {
    let n = 1;
    const used = {};
    (S.project.customTypes || []).forEach(t => { used[t.id] = true; });
    while (used['custom_' + n]) n++;
    return 'custom_' + n;
  }

  function save(def) {
    const clean = sanitizeTypeList([def], null)[0];
    if (!clean) throw new Error('Das Symbol enthält keine verwertbare Grafik.');
    NWT.History.record('Eigenes Symbol speichern');
    const arr = S.project.customTypes;
    const i = arr.findIndex(t => t.id === clean.id);
    if (i >= 0) arr[i] = clean; else arr.push(clean);
    C.setCustom(arr);
    syncDefs();
    S.touch();
    NWT.emit('customtypes');
    NWT.emit('change', { structural: true });
    return clean;
  }

  function remove(typeId) {
    const used = S.project.devices.filter(d => d.type === typeId);
    const go = () => {
      NWT.History.record('Eigenes Symbol löschen');
      S.project.customTypes = S.project.customTypes.filter(t => t.id !== typeId);
      used.forEach(d => { d.type = 'pc'; });
      C.setCustom(S.project.customTypes);
      syncDefs();
      S.touch();
      NWT.emit('customtypes');
      NWT.emit('change', { structural: true });
      U.toast('Symbol gelöscht' + (used.length ? ' · ' + used.length + ' Gerät(e) auf „Desktop-PC“ gesetzt' : ''));
    };
    if (!used.length) { go(); return Promise.resolve(true); }
    return M.confirm({
      title: 'Symbol löschen',
      message: 'Das Symbol wird von ' + used.length + ' Gerät(en) verwendet. Diese Geräte erhalten den Typ „Desktop-PC“. Fortfahren?',
      confirmLabel: 'Löschen', danger: true
    }).then(ok => { if (ok) go(); return ok; });
  }

  /* ========================================================== Editor */

  /* Zustand des Zeichenwerkzeugs */
  let ed = null;

  const GRID = 24;         // logische Einheiten
  const PX = 15;           // Bildschirmpixel je Einheit
  const SIZE = GRID * PX;  // 360

  function open(typeId) {
    const existing = typeId ? (S.project.customTypes || []).find(t => t.id === typeId) : null;

    ed = {
      id: existing ? existing.id : nextId(),
      mode: 'draw',
      tool: 'poly',
      shapes: [],
      current: null,
      half: true,
      svgText: '',
      image: existing && existing.iconImage ? existing.iconImage : '',
      viewBox: existing ? existing.iconViewBox : '0 0 24 24',
      inner: existing ? existing.iconInner : '',
      isNew: !existing
    };
    /* Vorhandenes Symbol kommt als SVG-Text in den Reiter „SVG“. */
    if (existing && existing.iconInner) { ed.mode = 'svg'; ed.svgText = existing.iconInner; }
    if (existing && existing.iconImage) ed.mode = 'image';

    const values = {
      label: existing ? existing.label : '',
      cat: existing ? existing.cat : 'custom',
      color: existing ? existing.color : '#0f172a',
      ports: existing ? (existing.ports || []).join('\n') : 'LAN'
    };

    return M.open({
      title: existing ? 'Eigenes Symbol bearbeiten' : 'Eigenes Symbol erstellen',
      subtitle: 'Erscheint anschließend in der linken Leiste und wird mit dem Projekt gespeichert.',
      width: '960px',
      bodyHtml: editorHtml(values),
      buttons: [
        existing ? { label: 'Löschen', kind: 'ghost-danger', left: true, value: { __delete: true } } : null,
        { label: 'Abbrechen', value: null },
        {
          label: existing ? 'Änderungen speichern' : 'Symbol anlegen', primary: true,
          onClick: (api) => collect(api.root)
        }
      ].filter(Boolean),
      onMount: (root) => wireEditor(root)
    }).then(res => {
      if (!res) { ed = null; return null; }
      if (res.__delete) { ed = null; return remove(typeId); }
      try {
        const saved = save(res);
        U.toast('Symbol „' + saved.label + '“ gespeichert', 'ok');
        ed = null;
        return saved;
      } catch (e) {
        M.error('Das Symbol konnte nicht gespeichert werden.', e.message);
        ed = null;
        return null;
      }
    });
  }

  function editorHtml(v) {
    const cats = C.CATEGORIES.map(c =>
      '<option value="' + c.id + '"' + (c.id === v.cat ? ' selected' : '') + '>' +
      U.escapeHtml(c.label) + '</option>').join('');

    return '<div class="sym-editor">' +
      '<div class="sym-left">' +
        '<div class="sym-tabs">' +
          '<button type="button" class="btn" data-mode="draw">Zeichnen</button>' +
          '<button type="button" class="btn" data-mode="svg">SVG einfügen</button>' +
          '<button type="button" class="btn" data-mode="image">Bilddatei</button>' +
        '</div>' +

        '<div class="sym-pane" data-pane="draw">' +
          '<div class="sym-tools">' +
            '<button type="button" class="btn sym-tool" data-tool="poly">Linienzug</button>' +
            '<button type="button" class="btn sym-tool" data-tool="rect">Rechteck</button>' +
            '<button type="button" class="btn sym-tool" data-tool="circle">Kreis</button>' +
            '<span class="sym-spacer"></span>' +
            '<label class="dash-inline"><input type="checkbox" id="sym-half" checked> halbes Raster</label>' +
            '<button type="button" class="btn" data-act="close-shape">Form abschließen</button>' +
            '<button type="button" class="btn" data-act="undo-shape">Zurück</button>' +
            '<button type="button" class="btn ghost-danger" data-act="clear-shapes">Leeren</button>' +
          '</div>' +
          '<svg class="sym-grid" id="sym-grid" viewBox="0 0 ' + SIZE + ' ' + SIZE + '" width="' + SIZE + '" height="' + SIZE + '">' +
            '<g id="sym-grid-lines"></g>' +
            '<g id="sym-shapes"></g>' +
            '<g id="sym-guide"></g>' +
          '</svg>' +
          '<div class="hintline">Klicken setzt Punkte. <b>Doppelklick</b> oder <b>Form abschließen</b> beendet ' +
          'den Linienzug; für Rechteck und Kreis zwei Punkte setzen. Die Linien werden im Stil der ' +
          'eingebauten Symbole gezeichnet.</div>' +
        '</div>' +

        '<div class="sym-pane" data-pane="svg" hidden>' +
          '<textarea id="sym-svg" rows="14" spellcheck="false" placeholder="&lt;svg viewBox=&quot;0 0 24 24&quot;&gt; … &lt;/svg&gt;  oder nur die Elemente"></textarea>' +
          '<div class="sym-tools"><button type="button" class="btn" data-act="svg-file">SVG-Datei wählen …</button>' +
          '<button type="button" class="btn" data-act="svg-apply">Übernehmen &amp; Vorschau</button></div>' +
          '<div class="note-inline">Eingefügtes SVG wird auf reine Geometrie gefiltert: Skripte, ' +
          'externe Verweise und Ereignis-Attribute werden entfernt. Am besten funktionieren einfache, ' +
          'einfarbige Strichsymbole ohne Farbfüllung.</div>' +
        '</div>' +

        '<div class="sym-pane" data-pane="image" hidden>' +
          '<div class="sym-drop" id="sym-drop">Bilddatei hierher ziehen oder klicken …</div>' +
          '<div class="hintline">PNG, JPG, GIF oder WebP. Das Bild wird auf 128 Pixel verkleinert und ' +
          'als Symbol verwendet. Für die Zeichenfläche eignen sich freigestellte Bilder mit ' +
          'transparentem Hintergrund am besten; ein echtes Gerätefoto gehört eher an das Gerät selbst ' +
          '(Abschnitt <i>Gerätefoto</i> im Eigenschaftenfenster).</div>' +
        '</div>' +
      '</div>' +

      '<div class="sym-right">' +
        '<div class="form-grid sym-form">' +
          '<div class="field wide"><label for="sym-label">Bezeichnung</label>' +
            '<input type="text" id="sym-label" value="' + U.escapeHtml(v.label) + '" placeholder="z. B. Hutschienen-Netzteil"></div>' +
          '<div class="field"><label for="sym-cat">Kategorie</label><select id="sym-cat">' + cats + '</select></div>' +
          '<div class="field"><label for="sym-color">Farbe</label>' +
            '<input type="color" id="sym-color" value="' + U.escapeHtml(v.color) + '"></div>' +
          '<div class="field wide"><label for="sym-ports">Ports (eine Zeile je Port)</label>' +
            '<textarea id="sym-ports" rows="4">' + U.escapeHtml(v.ports) + '</textarea></div>' +
        '</div>' +
        '<div class="sym-preview-block">' +
          '<div class="sym-preview-label">Vorschau</div>' +
          '<div class="sym-previews">' +
            '<div class="sym-prev-tile"><div id="sym-prev-icon" class="sym-prev-icon"></div><span id="sym-prev-name">Symbol</span></div>' +
            '<svg id="sym-prev-node" viewBox="0 0 132 88" width="132" height="88"></svg>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------------------------------------------------- Editor-Logik */

  function wireEditor(root) {
    const gridLines = root.querySelector('#sym-grid-lines');
    const shapesG = root.querySelector('#sym-shapes');
    const guideG = root.querySelector('#sym-guide');
    const svgEl = root.querySelector('#sym-grid');

    /* Raster zeichnen */
    let g = '';
    for (let i = 0; i <= GRID; i++) {
      const p = i * PX;
      const major = i % 6 === 0;
      g += '<line x1="' + p + '" y1="0" x2="' + p + '" y2="' + SIZE + '" class="' + (major ? 'gl-major' : 'gl') + '"/>';
      g += '<line x1="0" y1="' + p + '" x2="' + SIZE + '" y2="' + p + '" class="' + (major ? 'gl-major' : 'gl') + '"/>';
    }
    gridLines.innerHTML = g;

    const setMode = mode => {
      ed.mode = mode;
      root.querySelectorAll('[data-mode]').forEach(b =>
        b.classList.toggle('primary', b.getAttribute('data-mode') === mode));
      root.querySelectorAll('[data-pane]').forEach(p =>
        p.hidden = p.getAttribute('data-pane') !== mode);
      preview(root);
    };
    root.querySelectorAll('[data-mode]').forEach(b =>
      b.addEventListener('click', () => setMode(b.getAttribute('data-mode'))));

    const setTool = t => {
      ed.tool = t;
      ed.current = null;
      root.querySelectorAll('.sym-tool').forEach(b =>
        b.classList.toggle('primary', b.getAttribute('data-tool') === t));
      drawShapes();
    };
    root.querySelectorAll('.sym-tool').forEach(b =>
      b.addEventListener('click', () => setTool(b.getAttribute('data-tool'))));

    root.querySelector('#sym-half').addEventListener('change', e => { ed.half = e.target.checked; });

    /* Zeichnen */
    const toUnits = e => {
      const r = svgEl.getBoundingClientRect();
      const step = ed.half ? 0.5 : 1;
      const x = U.clamp(Math.round(((e.clientX - r.left) / r.width * GRID) / step) * step, 0, GRID);
      const y = U.clamp(Math.round(((e.clientY - r.top) / r.height * GRID) / step) * step, 0, GRID);
      return { x: x, y: y };
    };

    svgEl.addEventListener('click', e => {
      const p = toUnits(e);
      if (ed.tool === 'poly') {
        if (!ed.current) { ed.current = { t: 'poly', pts: [[p.x, p.y]] }; }
        else ed.current.pts.push([p.x, p.y]);
      } else {
        if (!ed.current) ed.current = { t: ed.tool, a: [p.x, p.y] };
        else {
          ed.current.b = [p.x, p.y];
          ed.shapes.push(ed.current);
          ed.current = null;
        }
      }
      drawShapes();
      preview(root);
    });

    svgEl.addEventListener('dblclick', e => {
      e.preventDefault();
      closeShape();
    });

    svgEl.addEventListener('mousemove', e => {
      if (!ed.current) { guideG.innerHTML = ''; return; }
      const p = toUnits(e);
      if (ed.current.t === 'poly') {
        const last = ed.current.pts[ed.current.pts.length - 1];
        guideG.innerHTML = '<line class="sym-guide-line" x1="' + last[0] * PX + '" y1="' + last[1] * PX +
          '" x2="' + p.x * PX + '" y2="' + p.y * PX + '"/>';
      } else if (ed.current.a) {
        const a = ed.current.a;
        guideG.innerHTML = ed.current.t === 'rect'
          ? '<rect class="sym-guide-line" x="' + Math.min(a[0], p.x) * PX + '" y="' + Math.min(a[1], p.y) * PX +
            '" width="' + Math.abs(p.x - a[0]) * PX + '" height="' + Math.abs(p.y - a[1]) * PX + '"/>'
          : '<circle class="sym-guide-line" cx="' + a[0] * PX + '" cy="' + a[1] * PX + '" r="' +
            Math.hypot(p.x - a[0], p.y - a[1]) * PX + '"/>';
      }
    });
    svgEl.addEventListener('mouseleave', () => { guideG.innerHTML = ''; });

    function closeShape() {
      if (ed.current && ed.current.t === 'poly' && ed.current.pts.length >= 2) ed.shapes.push(ed.current);
      ed.current = null;
      guideG.innerHTML = '';
      drawShapes();
      preview(root);
    }

    root.querySelector('[data-act="close-shape"]').addEventListener('click', closeShape);
    root.querySelector('[data-act="undo-shape"]').addEventListener('click', () => {
      if (ed.current && ed.current.t === 'poly' && ed.current.pts.length > 1) ed.current.pts.pop();
      else if (ed.current) ed.current = null;
      else ed.shapes.pop();
      drawShapes();
      preview(root);
    });
    root.querySelector('[data-act="clear-shapes"]').addEventListener('click', () => {
      ed.shapes = []; ed.current = null;
      drawShapes();
      preview(root);
    });

    function drawShapes() {
      const all = ed.shapes.concat(ed.current ? [ed.current] : []);
      shapesG.innerHTML = all.map(s => shapeToSvg(s, PX, true)).join('') +
        all.filter(s => s.t === 'poly').map(s => s.pts.map(p =>
          '<circle class="sym-node" cx="' + p[0] * PX + '" cy="' + p[1] * PX + '" r="3"/>').join('')).join('');
    }

    /* SVG-Reiter */
    const svgArea = root.querySelector('#sym-svg');
    svgArea.value = ed.svgText || '';
    root.querySelector('[data-act="svg-apply"]').addEventListener('click', () => {
      ed.svgText = svgArea.value;
      preview(root, true);
    });
    svgArea.addEventListener('blur', () => { ed.svgText = svgArea.value; preview(root); });
    root.querySelector('[data-act="svg-file"]').addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.svg,image/svg+xml';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => { svgArea.value = String(rd.result); ed.svgText = svgArea.value; preview(root, true); };
        rd.readAsText(f);
      });
      inp.click();
    });

    /* Bild-Reiter */
    const drop = root.querySelector('#sym-drop');
    const takeImage = file => {
      NWT.Images.processFile(file).then(res => {
        /* Für ein Symbol reicht eine kleine Kantenlänge. */
        shrink(res.dataUrl, 128).then(small => {
          ed.image = small;
          preview(root);
        });
      }).catch(err => M.error('Das Bild konnte nicht gelesen werden.', err.message));
    };
    drop.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (f) takeImage(f);
      });
      inp.click();
    });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) takeImage(f);
    });

    ['#sym-label', '#sym-color', '#sym-cat'].forEach(sel => {
      const el = root.querySelector(sel);
      el.addEventListener('input', () => preview(root));
      el.addEventListener('change', () => preview(root));
    });

    setMode(ed.mode);
    setTool('poly');
    drawShapes();
    preview(root);
  }

  function shrink(dataUrl, maxEdge) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /* Zeichenform → SVG-Markup. scale = Einheiten→Pixel, editor = Editordarstellung */
  function shapeToSvg(s, scale, editor) {
    const cls = editor ? ' class="sym-draw"' : '';
    const style = editor ? '' : ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
    if (s.t === 'poly') {
      if (!s.pts || s.pts.length < 2) return '';
      const d = 'M' + s.pts.map(p => (p[0] * scale) + ' ' + (p[1] * scale)).join(' L');
      return '<path' + cls + style + ' d="' + d + '"/>';
    }
    if (s.t === 'rect') {
      if (!s.b) return '';
      const x = Math.min(s.a[0], s.b[0]) * scale, y = Math.min(s.a[1], s.b[1]) * scale;
      const w = Math.abs(s.b[0] - s.a[0]) * scale, h = Math.abs(s.b[1] - s.a[1]) * scale;
      if (w < 0.1 || h < 0.1) return '';
      return '<rect' + cls + style + ' x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
        '" rx="' + (1.5 * scale) + '"/>';
    }
    if (s.t === 'circle') {
      if (!s.b) return '';
      const r = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * scale;
      if (r < 0.5) return '';
      return '<circle' + cls + style + ' cx="' + (s.a[0] * scale) + '" cy="' + (s.a[1] * scale) + '" r="' + r + '"/>';
    }
    return '';
  }

  /** Aktuelles Symbol als bereinigtes Innen-Markup (24×24). */
  function currentGraphic(showError) {
    if (ed.mode === 'image') {
      return ed.image ? { iconImage: ed.image } : null;
    }
    if (ed.mode === 'svg') {
      if (!String(ed.svgText || '').trim()) return null;
      try {
        const clean = sanitizeSvg(ed.svgText);
        if (!clean) throw new Error('Es blieb kein zeichenbares Element übrig.');
        return { iconInner: clean.inner, iconViewBox: clean.viewBox };
      } catch (e) {
        if (showError) M.error('Das SVG konnte nicht übernommen werden.', e.message);
        return null;
      }
    }
    const shapes = ed.shapes.concat(ed.current && ed.current.t === 'poly' && ed.current.pts.length >= 2 ? [ed.current] : []);
    const inner = shapes.map(s => shapeToSvg(s, 1, false)).join('');
    return inner ? { iconInner: inner, iconViewBox: '0 0 ' + GRID + ' ' + GRID } : null;
  }

  function preview(root, showError) {
    const gfx = currentGraphic(showError);
    const color = root.querySelector('#sym-color').value || '#0f172a';
    const label = root.querySelector('#sym-label').value || 'Symbol';

    const iconHost = root.querySelector('#sym-prev-icon');
    iconHost.style.color = color;
    iconHost.innerHTML = !gfx ? '<span class="sym-none">—</span>'
      : gfx.iconImage ? '<img src="' + U.escapeHtml(gfx.iconImage) + '" alt="">'
      : '<svg viewBox="' + U.escapeHtml(gfx.iconViewBox) + '">' + gfx.iconInner + '</svg>';
    root.querySelector('#sym-prev-name').textContent = U.truncate(label, 18);

    /* Kachelvorschau in Originalgröße der Zeichenfläche */
    const node = root.querySelector('#sym-prev-node');
    const inner = !gfx ? ''
      : gfx.iconImage
        ? '<image x="53" y="13" width="26" height="26" href="' + U.escapeHtml(gfx.iconImage) + '"/>'
        : '<svg x="53" y="13" width="26" height="26" viewBox="' + U.escapeHtml(gfx.iconViewBox) + '">' + gfx.iconInner + '</svg>';
    /* Bewusst dieselben Klassen wie auf der Zeichenfläche: so folgt die
       Vorschau dem Design und zeigt wirklich, was später zu sehen ist. */
    node.innerHTML =
      '<rect class="node-box" x="0.7" y="0.7" width="130.6" height="86.6" rx="10"/>' +
      '<rect class="node-accent" x="12" y="0" width="108" height="3.5" rx="1.75" fill="' +
        U.escapeHtml(color) + '"/>' +
      '<g style="color:' + U.escapeHtml(color) + '">' + inner + '</g>' +
      '<text class="node-name" x="66" y="55">' + U.escapeHtml(U.truncate(label, 18)) + '</text>' +
      '<text class="node-type" x="66" y="68">eigenes Symbol</text>';
  }

  function collect(root) {
    const label = root.querySelector('#sym-label').value.trim();
    if (!label) { U.toast('Bitte eine Bezeichnung eingeben.', 'warn'); return false; }
    const gfx = currentGraphic(true);
    if (!gfx) { U.toast('Bitte zuerst ein Symbol zeichnen, einfügen oder wählen.', 'warn'); return false; }
    return Object.assign({
      id: ed.id,
      label: label,
      cat: root.querySelector('#sym-cat').value,
      color: root.querySelector('#sym-color').value,
      ports: root.querySelector('#sym-ports').value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    }, gfx);
  }

  return {
    open, save, remove, list, syncDefs, sanitizeSvg, sanitizeTypeList,
    symbolId, iconFor
  };
})();
