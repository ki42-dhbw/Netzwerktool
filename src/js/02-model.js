/* ============================================================
   02 — Datenmodell & Store
   project = { name, version, info, devices[], connections[],
               areas[], layers[], settings{}, counters{}, seq }
   ============================================================ */

NWT.Model = (function () {
  const U = NWT.Util;
  const C = NWT.Catalog;

  const SCHEMA_VERSION = 2;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const finite = (v, fallback, min, max) => Number.isFinite(Number(v))
    ? U.clamp(Number(v), min == null ? -1000000 : min, max == null ? 1000000 : max) : fallback;

  function defaultSettings() {
    return {
      grid: true,
      snap: true,
      gridSize: 20,
      routing: 'orthogonal',
      avoidObstacles: false,
      zoom: 1,
      panX: 60,
      panY: 60,
      defaultConnType: 'gigabit',
      activeLayer: 'lay_phys',
      photos: true,         /* Gerätefotos und Typbilder auf der Zeichenfläche */
      hardware: false,      /* gezeichnete Frontblenden statt Strichsymbol */
      minimap: true,
      /* Maskierung vertraulicher Angaben. Gehoert zum Netzplan, nicht
         zum Arbeitsplatz: ob dieser Plan Kundendaten enthaelt, weiss
         nur der Plan selbst. Siehe 28-privacy.js. */
      privacy: { on: false, style: 'dots', ip: true, mac: true, host: true,
                 names: false, ports: false, labels: false, notes: false }
    };
  }

  function defaultInfo() {
    return {
      description: '', author: '', company: '', location: '',
      created: U.nowIso(), modified: U.nowIso()
    };
  }

  function emptyProject(name) {
    return {
      name: name || 'Neues Netzwerk',
      version: SCHEMA_VERSION,
      info: defaultInfo(),
      devices: [],
      connections: [],
      areas: [],
      layers: U.clone(C.DEFAULT_LAYERS),
      customTypes: [],
      typeImages: {},       /* eigenes Bild je Gerätetyp: { router: 'data:…' } */
      libraryPicks: {},     /* gewähltes Bibliotheksbild je Gerätetyp:
                               { mb_intellibox: "Intellibox_3.jpg" } */
      connStyles: {},       /* eigene Darstellung je Verbindungsart:
                               { usb3: { color, width, dash } } */
      settings: defaultSettings(),
      counters: {},
      seq: 0
    };
  }

  function newDevice(project, typeId, x, y) {
    const t = C.type(typeId);
    const n = (project.counters[typeId] = (project.counters[typeId] || 0) + 1);
    const shape = C.shapeOf(typeId);
    const dev = {
      id: 'dev_' + U.pad(++project.seq, 3),
      type: typeId,
      name: shape === 'text' ? 'Beschriftung' : shape === 'note' ? 'Notiz ' + n : t.label + ' ' + n,
      x: Math.round(x),
      y: Math.round(y),
      layer: project.settings.activeLayer,
      status: 'unknown',
      ip: '', ipv6: '', mac: '', hostname: '',
      manufacturer: '', model: '',
      location: '', room: '', rack: '',
      vlan: '', os: '', protocol: '',
      description: '', notes: '',
      image: '',            /* Gerätefoto als data:-URL, wird mitgespeichert */
      ports: C.buildPorts(typeId),
      interfaces: [], observations: []
    };
    if (shape === 'shape') {
      /* Dekoration trägt ihre Größe und ihr Aussehen selbst; ein
         Rahmen ohne Füllung verdeckt nichts, deshalb fill: 'none'. */
      dev.name = '';
      dev.w = t.w || 200; dev.h = t.h || 140;
      dev.figure = t.figure || 'rect';
      dev.stroke = t.color || '#64748b';
      dev.strokeWidth = 2;
      dev.dash = '';
      dev.fill = 'none';
      dev.opacity = 1;
      dev.rot = 0;
      dev.front = false;
    }
    return dev;
  }

  function newConnection(project, sourceId, targetId, typeId) {
    const t = typeId || project.settings.defaultConnType || 'gigabit';
    return {
      id: 'con_' + U.pad(++project.seq, 3),
      source: sourceId,
      target: targetId,
      sourcePort: '',
      targetPort: '',
      type: t,
      speed: C.connType(t).speed,
      vlan: '',
      label: '',
      description: '',
      layer: project.settings.activeLayer
    };
  }

  function newArea(project, x, y, w, h) {
    const idx = project.areas.length % C.AREA_COLORS.length;
    return {
      id: 'area_' + U.pad(++project.seq, 3),
      label: 'Bereich ' + (project.areas.length + 1),
      sublabel: '',
      x: Math.round(x), y: Math.round(y),
      w: Math.max(120, Math.round(w)), h: Math.max(90, Math.round(h)),
      color: C.AREA_COLORS[idx],
      layer: project.settings.activeLayer
    };
  }

  /* ---------------------------------------------------------------- Store */

  const Store = {
    project: emptyProject(),
    /** Auswahl: Menge von IDs (dev_/con_/area_). */
    selection: new Set(),
    mode: 'select',
    index: { dev: new Map(), con: new Map(), area: new Map(), adj: new Map(), parallel: new Map() },

    batchDepth: 0,
    batch(fn) {
      this.batchDepth++;
      try { return fn(); }
      finally { if (--this.batchDepth === 0) this.reindex(); }
    },
    reindex() {
      if (this.batchDepth) return;
      const P = this.project;
      const ix = this.index;
      ix.dev.clear(); ix.con.clear(); ix.area.clear(); ix.adj.clear(); ix.parallel.clear();

      P.devices.forEach(d => { ix.dev.set(d.id, d); ix.adj.set(d.id, new Set()); });
      P.areas.forEach(a => ix.area.set(a.id, a));

      /* Parallele Verbindungen zwischen demselben Gerätepaar versetzt zeichnen. */
      const groups = new Map();
      P.connections.forEach(c => {
        ix.con.set(c.id, c);
        if (ix.adj.has(c.source)) ix.adj.get(c.source).add(c.id);
        if (ix.adj.has(c.target)) ix.adj.get(c.target).add(c.id);
        const key = [c.source, c.target].sort().join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c.id);
      });
      groups.forEach(ids => {
        const n = ids.length;
        ids.forEach((id, i) => ix.parallel.set(id, n === 1 ? 0 : (i - (n - 1) / 2) * 18));
      });
    },

    dev(id) { return this.index.dev.get(id) || null; },
    con(id) { return this.index.con.get(id) || null; },
    area(id) { return this.index.area.get(id) || null; },
    obj(id) {
      if (!id) return null;
      if (id.startsWith('dev_')) return this.dev(id);
      if (id.startsWith('con_')) return this.con(id);
      if (id.startsWith('area_')) return this.area(id);
      return null;
    },
    kindOf(id) {
      if (!id) return null;
      if (id.startsWith('dev_')) return 'device';
      if (id.startsWith('con_')) return 'connection';
      if (id.startsWith('area_')) return 'area';
      return null;
    },

    connectionsOf(deviceId) {
      const set = this.index.adj.get(deviceId);
      return set ? Array.from(set) : [];
    },

    /** Bestehende Leitung zwischen zwei Geräten, ungerichtet. */
    connectionBetween(a, b) {
      return this.project.connections.find(c =>
        (c.source === a && c.target === b) || (c.source === b && c.target === a)) || null;
    },

    layer(id) { return this.project.layers.find(l => l.id === id) || null; },
    layerVisible(id) {
      const l = this.layer(id);
      return !l || l.visible !== false;
    },
    isVisible(obj) {
      if (!obj) return false;
      return this.layerVisible(obj.layer);
    },

    /* --- Mutationen ------------------------------------------------- */

    setProject(p, opts) {
      this.project = p;
      if (!Array.isArray(p.customTypes)) p.customTypes = [];
      C.setCustom(p.customTypes);
      if (NWT.Symbols) NWT.Symbols.syncDefs();
      this.selection.clear();
      this.reindex();
      if (!opts || !opts.keepHistory) NWT.History.reset();
      if (NWT.Viewport) NWT.Viewport.apply();
      NWT.emit('project:replaced');
      NWT.emit('change', { structural: true });
    },

    touch() {
      this.project.info.modified = U.nowIso();
      if (NWT.Persistence) NWT.Persistence.markDirty();
    },

    addDevice(typeId, x, y) {
      const d = newDevice(this.project, typeId, x, y);
      this.project.devices.push(d);
      this.index.dev.set(d.id, d);
      this.index.adj.set(d.id, new Set());
      this.reindex();
      this.touch();
      return d;
    },

    addConnection(sourceId, targetId, typeId) {
      if (!sourceId || !targetId || sourceId === targetId) return null;
      if (!this.dev(sourceId) || !this.dev(targetId)) return null;
      const c = newConnection(this.project, sourceId, targetId, typeId);
      this.project.connections.push(c);
      this.index.con.set(c.id, c);
      this.index.adj.get(sourceId).add(c.id);
      this.index.adj.get(targetId).add(c.id);
      this.reindex();
      this.touch();
      return c;
    },

    addArea(x, y, w, h) {
      const a = newArea(this.project, x, y, w, h);
      this.project.areas.push(a);
      this.reindex();
      this.touch();
      return a;
    },

    /** Löscht IDs beliebigen Typs inkl. hängender Verbindungen. */
    remove(ids) {
      const P = this.project;
      const set = new Set(ids);
      const removedDevices = new Set(Array.from(set).filter(id => id.startsWith('dev_')));

      P.devices = P.devices.filter(d => !set.has(d.id));
      P.areas = P.areas.filter(a => !set.has(a.id));
      P.connections = P.connections.filter(c =>
        !set.has(c.id) && !removedDevices.has(c.source) && !removedDevices.has(c.target));

      set.forEach(id => this.selection.delete(id));
      this.reindex();
      this.touch();
    },

    duplicate(ids) {
      const P = this.project;
      const devIds = ids.filter(id => id.startsWith('dev_'));
      const map = new Map();
      const created = [];

      devIds.forEach(id => {
        const src = this.dev(id);
        if (!src) return;
        const copy = U.clone(src);
        copy.id = 'dev_' + U.pad(++P.seq, 3);
        copy.x += 28; copy.y += 28;
        const n = (P.counters[src.type] = (P.counters[src.type] || 0) + 1);
        copy.name = src.name.replace(/\s\d+$/, '') + ' ' + n;
        P.devices.push(copy);
        map.set(id, copy.id);
        created.push(copy.id);
      });

      /* Verbindungen zwischen kopierten Geräten mitkopieren. */
      P.connections.slice().forEach(c => {
        if (map.has(c.source) && map.has(c.target)) {
          const cc = U.clone(c);
          cc.id = 'con_' + U.pad(++P.seq, 3);
          cc.source = map.get(c.source);
          cc.target = map.get(c.target);
          P.connections.push(cc);
        }
      });

      ids.filter(id => id.startsWith('area_')).forEach(id => {
        const src = this.area(id);
        if (!src) return;
        const copy = U.clone(src);
        copy.id = 'area_' + U.pad(++P.seq, 3);
        copy.x += 28; copy.y += 28;
        P.areas.push(copy);
        created.push(copy.id);
      });

      this.reindex();
      this.touch();
      return created;
    },

    raise(ids, toFront) {
      const P = this.project;
      const set = new Set(ids);
      const moved = P.devices.filter(d => set.has(d.id));
      if (!moved.length) return;
      P.devices = P.devices.filter(d => !set.has(d.id));
      if (toFront) P.devices.push(...moved); else P.devices.unshift(...moved);
      this.reindex();
      this.touch();
    },

    /* --- Auswahl ---------------------------------------------------- */

    select(ids, additive) {
      if (!additive) this.selection.clear();
      (Array.isArray(ids) ? ids : [ids]).forEach(id => { if (id) this.selection.add(id); });
      NWT.emit('selection');
    },
    toggleSelect(id) {
      if (this.selection.has(id)) this.selection.delete(id); else this.selection.add(id);
      NWT.emit('selection');
    },
    clearSelection() {
      if (!this.selection.size) return;
      this.selection.clear();
      NWT.emit('selection');
    },
    selectedIds() { return Array.from(this.selection); },
    selectedDevices() { return this.selectedIds().filter(id => id.startsWith('dev_')); },

    setMode(mode) {
      if (this.mode === mode) return;
      this.mode = mode;
      NWT.emit('mode', mode);
    },

    /* --- Geometrie -------------------------------------------------- */

    /**
     * Bildquelle für den Streifen der Gerätekachel, in dieser Reihenfolge:
     *   1. individuelles Foto des Geräts
     *   2. Typbild (gilt für alle Geräte dieses Typs)
     *   3. gezeichnete Hardware-Ansicht, falls eingeschaltet
     * Liefert {kind:'image'|'symbol', href} oder null.
     */
    stripFor(d) {
      if (!d || C.shapeOf(d.type) !== 'device') return null;
      const st = this.project.settings;
      if (st.photos !== false) {
        if (d.image) return { kind: 'image', href: d.image };
        const ti = (this.project.typeImages || {})[d.type];
        if (ti) return { kind: 'image', href: ti };
        /* Bildbibliothek: gewähltes oder sicher zugeordnetes Bild aus bilder/ */
        if (NWT.Library) {
          const lib = NWT.Library.imageFor(d.type);
          if (lib) return { kind: 'image', href: lib };
        }
      }
      if (st.hardware) {
        const hw = C.hardwareFor(d.type);
        if (hw) return { kind: 'symbol', href: '#' + hw };
      }
      return null;
    },

    /** Zeigt dieses Gerät gerade einen Bildstreifen? */
    hasPhoto(d) { return !!this.stripFor(d); },

    /**
     * Darstellung einer Verbindung, in dieser Reihenfolge:
     *   1. c.style          — diese eine Leitung (die Ausnahme)
     *   2. connStyles[type]  — dieser Typ im Projekt (die Regel)
     *   3. Katalogvorgabe    — Auslieferungszustand
     * Eine Ebene setzt immer alle drei Werte gemeinsam; damit bleibt
     * „zurücksetzen“ ein Löschen statt einer Feld-für-Feld-Logik.
     */
    edgeStyle(c) {
      const base = C.connType(c.type);
      const src = (c && c.style) || (this.project.connStyles || {})[c.type] || base;
      const width = Number(src.width);
      return {
        color: src.color || base.color,
        width: width > 0 ? width : base.width,
        dash: src.dash === undefined || src.dash === null ? (base.dash || '') : String(src.dash)
      };
    },

    deviceRect(d) {
      const shape = C.shapeOf(d.type);
      if (shape === 'text') return { x: d.x, y: d.y, w: d.w || 180, h: d.h || 34 };
      if (shape === 'note') return { x: d.x, y: d.y, w: d.w || 170, h: d.h || 108 };
      if (shape === 'shape') {
        const t = C.type(d.type);
        return { x: d.x, y: d.y, w: d.w || t.w || 200, h: d.h || t.h || 140 };
      }
      if (shape === 'junction') return { x: d.x, y: d.y, w: C.JUNCTION, h: C.JUNCTION };
      return { x: d.x, y: d.y, w: C.NODE_W, h: C.NODE_H + (this.hasPhoto(d) ? C.STRIP_EXTRA : 0) };
    },
    deviceCenter(d) {
      const r = this.deviceRect(d);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    },

    /** Umschließendes Rechteck aller sichtbaren Inhalte (Weltkoordinaten). */
    contentBounds(pad) {
      const P = this.project;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const add = (x, y, w, h) => {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      };
      P.devices.forEach(d => { if (this.isVisible(d)) { const r = this.deviceRect(d); add(r.x, r.y, r.w, r.h); } });
      P.areas.forEach(a => { if (this.isVisible(a)) add(a.x, a.y, a.w, a.h); });
      if (minX === Infinity) return { x: 0, y: 0, w: 800, h: 600, empty: true };
      const p = pad == null ? 40 : pad;
      return { x: minX - p, y: minY - p, w: (maxX - minX) + p * 2, h: (maxY - minY) + p * 2, empty: false };
    }
  };

  /* -------------------------------------------- Validierung / Migration */

  /**
   * Prüft und repariert ein importiertes Projekt.
   * Wirft bei grundsätzlich unbrauchbaren Daten, meldet sonst Warnungen zurück.
   */
  function validate(raw) {
    const warnings = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Die Datei enthält kein Projektobjekt.');
    }
    if (!Array.isArray(raw.devices)) {
      throw new Error('Das Feld "devices" fehlt oder ist keine Liste.');
    }
    const version = raw.version == null ? 1 : Number(raw.version);
    if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
      throw new Error('Nicht unterstützte Projektversion: ' + String(raw.version) + '. Bitte eine passende Programmversion verwenden.');
    }
    if (raw.devices.length > 10000 || (raw.connections || []).length > 30000) throw new Error('Das Projekt überschreitet 10.000 Geräte oder 30.000 Verbindungen.');

    const base = emptyProject(typeof raw.name === 'string' && raw.name ? raw.name : 'Importiertes Projekt');
    const P = base;

    P.version = SCHEMA_VERSION;
    P.info = Object.assign(defaultInfo(), (raw.info && typeof raw.info === 'object') ? raw.info : {});
    P.settings = Object.assign(defaultSettings(), (raw.settings && typeof raw.settings === 'object') ? raw.settings : {});
    P.settings.zoom = U.clamp(Number(P.settings.zoom) || 1, 0.15, 5);
    P.settings.panX = finite(P.settings.panX, 0);
    P.settings.panY = finite(P.settings.panY, 0);
    P.settings.gridSize = U.clamp(Number(P.settings.gridSize) || 20, 5, 200);
    if (['orthogonal', 'straight', 'curved'].indexOf(P.settings.routing) < 0) P.settings.routing = 'orthogonal';
    P.settings.privacy = sanitizePrivacy(P.settings.privacy);

    P.layers = Array.isArray(raw.layers) && raw.layers.length
      ? raw.layers.filter(l => l && typeof l.id === 'string').map(l => ({
          id: l.id, name: String(l.name || l.id), visible: l.visible !== false
        }))
      : U.clone(C.DEFAULT_LAYERS);
    P.layers = P.layers.filter((l, i, arr) => l.id && arr.findIndex(x => x.id === l.id) === i);
    if (!P.layers.length) { P.layers = U.clone(C.DEFAULT_LAYERS); warnings.push('Ungültige Ebenen durch Standardebenen ersetzt.'); }
    const layerIds = new Set(P.layers.map(l => l.id));
    if (!layerIds.has(P.settings.activeLayer)) P.settings.activeLayer = P.layers[0].id;

    /* Eigene Symbole zuerst übernehmen — die Geräte verweisen darauf.
       Die SVG-Inhalte werden dabei erneut bereinigt (Fremddatei!). */
    P.customTypes = NWT.Symbols.sanitizeTypeList(
      Array.isArray(raw.customTypes) ? raw.customTypes : [], warnings);
    const importedTypes = new Map(P.customTypes.map(t => [t.id, t]));
    const known = k => own(C.DEVICE_TYPES, k) || importedTypes.has(k);
    const typeOf = k => own(C.DEVICE_TYPES, k) ? C.DEVICE_TYPES[k] : importedTypes.get(k);
    const portsFor = k => importedTypes.has(k) ? importedTypes.get(k).ports.map(name => ({ name: name })) : C.buildPorts(k);

    /* Typbilder: nur data:image-URLs für bekannte Typen übernehmen. */
    P.typeImages = {};
    if (raw.typeImages && typeof raw.typeImages === 'object') {
      Object.keys(raw.typeImages).forEach(k => {
        const v = String(raw.typeImages[k] || '');
        if (/^data:image\//i.test(v) && known(k)) P.typeImages[k] = v;
      });
    }

    /* Gewählte Bibliotheksbilder — nur Dateinamen, keine Bilddaten. */
    P.libraryPicks = {};
    if (raw.libraryPicks && typeof raw.libraryPicks === 'object') {
      Object.keys(raw.libraryPicks).forEach(k => {
        const v = String(raw.libraryPicks[k] || '');
        if (v && v.length < 260 && known(k)) P.libraryPicks[k] = v;
      });
    }

    /* Eigene Darstellung je Verbindungsart. */
    P.connStyles = {};
    if (raw.connStyles && typeof raw.connStyles === 'object') {
      Object.keys(raw.connStyles).forEach(k => {
        if (!own(C.CONNECTION_TYPES, k)) return;
        const st = sanitizeStyle(raw.connStyles[k]);
        if (st) P.connStyles[k] = st;
      });
    }

    const seenIds = new Set();
    let dropped = 0;

    P.devices = raw.devices.filter(d => d && typeof d === 'object').map(d => {
      const typeId = known(d.type) ? d.type : 'pc';
      if (d.type && !known(d.type)) warnings.push('Unbekannter Gerätetyp "' + d.type + '" → Desktop-PC');
      let id = typeof d.id === 'string' && d.id ? d.id : 'dev_' + U.pad(++P.seq, 3);
      if (!id.startsWith('dev_')) id = 'dev_' + id;
      while (seenIds.has(id)) id = id + '_x';
      seenIds.add(id);
      const dev = {
        id: id,
        type: typeId,
        name: String(d.name != null ? d.name : typeOf(typeId).label),
        x: finite(d.x, 0),
        y: finite(d.y, 0),
        layer: layerIds.has(d.layer) ? d.layer : P.layers[0].id,
        status: own(C.STATUS, d.status) ? d.status : 'unknown',
        ip: str(d.ip), ipv6: str(d.ipv6), mac: str(d.mac), hostname: str(d.hostname),
        manufacturer: str(d.manufacturer), model: str(d.model),
        location: str(d.location), room: str(d.room), rack: str(d.rack),
        vlan: str(d.vlan), os: str(d.os), protocol: str(d.protocol),
        description: str(d.description), notes: str(d.notes),
        image: /^data:image\//i.test(String(d.image || '')) ? String(d.image) : '',
        ports: Array.isArray(d.ports) && d.ports.length
          ? d.ports.map(p => ({ name: String(p && p.name != null ? p.name : p) }))
          : portsFor(typeId),
        interfaces: sanitizeInterfaces(d.interfaces),
        observations: sanitizeObservations(d.observations)
      };
      if (d.w != null) dev.w = finite(d.w, 180, 6, 10000);
      if (d.h != null) dev.h = finite(d.h, 100, 6, 10000);
      const sh = typeOf(typeId).shape || 'device';
      if (sh === 'shape') sanitizeDecor(d, dev);
      if (sh === 'shape' || sh === 'text' || sh === 'note') sanitizeText(d, dev);
      return dev;
    });

    const devIds = new Set(P.devices.map(d => d.id));

    P.connections = (Array.isArray(raw.connections) ? raw.connections : [])
      .filter(c => c && typeof c === 'object')
      .filter(c => {
        const ok = devIds.has(c.source) && devIds.has(c.target) && c.source !== c.target;
        if (!ok) dropped++;
        return ok;
      })
      .map(c => {
        let id = typeof c.id === 'string' && c.id ? c.id : 'con_' + U.pad(++P.seq, 3);
        if (!id.startsWith('con_')) id = 'con_' + id;
        while (seenIds.has(id)) id = id + '_x';
        seenIds.add(id);
        const typeId = own(C.CONNECTION_TYPES, c.type) ? c.type : 'custom';
        const conn = {
          id: id, source: c.source, target: c.target,
          sourcePort: str(c.sourcePort), targetPort: str(c.targetPort),
          type: typeId,
          speed: str(c.speed) || C.connType(typeId).speed,
          vlan: str(c.vlan), label: str(c.label), description: str(c.description),
          observations: sanitizeObservations(c.observations),
          layer: layerIds.has(c.layer) ? c.layer : P.layers[0].id
        };
        const st = sanitizeStyle(c.style);
        if (st) conn.style = st;
        /* Stützpunkte: höchstens 40 je Leitung. Eine Datei mit
           Tausenden Punkten wäre kein Netzplan mehr, sondern eine
           Bremse. */
        conn.points = (Array.isArray(c.points) ? c.points : [])
          .filter(pt => pt && isFinite(Number(pt.x)) && isFinite(Number(pt.y)))
          .slice(0, 40)
          .map(pt => ({ x: Math.round(Number(pt.x)), y: Math.round(Number(pt.y)) }));
        return conn;
      });

    P.areas = (Array.isArray(raw.areas) ? raw.areas : (Array.isArray(raw.groups) ? raw.groups : []))
      .filter(a => a && typeof a === 'object')
      .map((a, i) => {
        let id = typeof a.id === 'string' && a.id ? a.id : 'area_' + U.pad(++P.seq, 3);
        if (!id.startsWith('area_')) id = 'area_' + id;
        while (seenIds.has(id)) id = id + '_x';
        seenIds.add(id);
        return {
          id: id,
          label: String(a.label != null ? a.label : ('Bereich ' + (i + 1))),
          sublabel: str(a.sublabel),
          x: finite(a.x, 0), y: finite(a.y, 0),
          w: finite(a.w, 240, 60, 100000), h: finite(a.h, 180, 50, 100000),
          color: /^#[0-9a-f]{3,8}$/i.test(String(a.color)) ? a.color : C.AREA_COLORS[i % C.AREA_COLORS.length],
          layer: layerIds.has(a.layer) ? a.layer : P.layers[0].id
        };
      });

    P.counters = {};
    Object.keys(raw.counters || {}).filter(known).forEach(k => { P.counters[k] = Math.floor(finite(raw.counters[k], 0, 0, 1000000)); });
    /* Zähler mindestens auf die vorhandene Anzahl je Typ heben. */
    const perType = {};
    P.devices.forEach(d => { perType[d.type] = (perType[d.type] || 0) + 1; });
    Object.keys(perType).forEach(t => {
      P.counters[t] = Math.max(Number(P.counters[t]) || 0, perType[t]);
    });

    /* seq so setzen, dass neue IDs garantiert kollisionsfrei sind. */
    let maxSeq = Math.floor(finite(raw.seq, 0, 0, 1000000000));
    seenIds.forEach(id => {
      const m = /_(\d+)$/.exec(id);
      if (m) {
        const n = Number(m[1]);
        if (!Number.isSafeInteger(n) || n > 1000000000) throw new Error('Eine Objekt-ID überschreitet den gültigen Zahlenbereich.');
        maxSeq = Math.max(maxSeq, n);
      }
    });
    P.seq = maxSeq;

    if (dropped) warnings.push(dropped + ' Verbindung(en) ohne gültige Endpunkte wurden entfernt.');

    return { project: P, warnings: warnings };
  }

  function str(v) { return v == null ? '' : String(v); }

  function sanitizeInterfaces(list) {
    return (Array.isArray(list) ? list : []).slice(0, 128).filter(x => x && typeof x === 'object').map(x => ({
      name: str(x.name).slice(0, 80), ip: str(x.ip).slice(0, 100), ipv6: str(x.ipv6).slice(0, 100),
      mac: str(x.mac).slice(0, 40), vlan: str(x.vlan).slice(0, 100), port: str(x.port).slice(0, 80)
    }));
  }
  function sanitizeObservations(list) {
    return (Array.isArray(list) ? list : []).slice(-20).filter(x => x && typeof x === 'object').map(x => ({
      at: str(x.at).slice(0, 80), source: str(x.source).slice(0, 120), method: str(x.method).slice(0, 200),
      confidence: finite(x.confidence, 0, 0, 1), status: str(x.status).slice(0, 40)
    }));
  }

  function hex(v, fallback) {
    return /^#[0-9a-f]{3,8}$/i.test(String(v)) ? String(v) : fallback;
  }

  /**
   * Darstellung eines Dekorationselements aus fremder Datei übernehmen.
   * Farben nur als Hex, Strichmuster nur aus Ziffern, Trennern und
   * Leerzeichen — dieselbe Linie wie bei sanitizeStyle: nichts, was in
   * einem CSS-Wert weiterinterpretiert werden könnte.
   */
  function sanitizeDecor(src, dev) {
    const t = C.type(dev.type);
    dev.w = finite(src.w, t.w || 200, 6, 10000);
    dev.h = finite(src.h, t.h || 140, 6, 10000);
    dev.figure = own(NWT.Decor.FIGURES, src.figure) ? String(src.figure) : (t.figure || 'rect');
    dev.stroke = hex(src.stroke, t.color || '#64748b');
    dev.strokeWidth = U.clamp(Number(src.strokeWidth) || 2, 0.5, 24);
    dev.dash = /^[\d\s,.]*$/.test(String(src.dash == null ? '' : src.dash))
      ? String(src.dash == null ? '' : src.dash).trim() : '';
    dev.fill = String(src.fill) === 'none' ? 'none' : hex(src.fill, 'none');
    dev.opacity = U.clamp(Number(src.opacity) || 1, 0.05, 1);
    dev.rot = Math.round(U.clamp(Number(src.rot) || 0, -360, 360));
    dev.front = !!src.front;
  }

  /**
   * Schrift eines Text-, Notiz- oder Grafikelements prüfen.
   * Die Schriftart kommt als Schlüssel, nie als CSS-Wert — sonst
   * stünde in einer fremden Projektdatei beliebiges CSS.
   * Fehlt ein Wert, bleibt er weg: dann gilt die Vorgabe, und ein
   * Designwechsel darf die Farbe weiterhin bestimmen.
   */
  function sanitizeText(src, dev) {
    const D = NWT.Decor;
    if (own(D.FONTS, src.font)) dev.font = String(src.font);
    const size = Number(src.fontSize);
    if (size > 0) dev.fontSize = U.clamp(Math.round(size), 6, 200);
    if (/^#[0-9a-f]{3,8}$/i.test(String(src.color))) dev.color = String(src.color);
    if (src.bold !== undefined) dev.bold = !!src.bold;
    if (src.italic) dev.italic = true;
    if (D.ALIGNS.some(a => a.value === src.align)) dev.align = String(src.align);
  }

  /** Maskiereinstellung prüfen — unbekannte Stile fallen auf Punkte zurück. */
  function sanitizePrivacy(raw) {
    const d = defaultSettings().privacy;
    if (!raw || typeof raw !== 'object') return d;
    const out = Object.assign({}, d);
    Object.keys(d).forEach(k => {
      if (k === 'style') return;
      out[k] = raw[k] === undefined ? d[k] : !!raw[k];
    });
    out.style = ['dots', 'partial', 'blocks', 'hide'].indexOf(raw.style) >= 0 ? raw.style : 'dots';
    return out;
  }

  /** Prüft eine Darstellungsangabe; liefert null, wenn nichts Brauchbares bleibt. */
  function sanitizeStyle(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const color = /^#[0-9a-f]{3,8}$/i.test(String(raw.color)) ? String(raw.color) : '';
    const width = U.clamp(Number(raw.width) || 0, 0, 12);
    /* Nur Ziffern, Leerzeichen und Kommas — kein Einfallstor für fremde CSS-Werte. */
    const dash = /^[\d\s,.]*$/.test(String(raw.dash == null ? '' : raw.dash))
      ? String(raw.dash == null ? '' : raw.dash).trim() : '';
    if (!color && !width) return null;
    return { color: color, width: width, dash: dash };
  }

  /** Serialisierung für Export / localStorage. */
  function serialize(project) {
    const P = U.clone(project);
    P.version = SCHEMA_VERSION;
    P.info.modified = U.nowIso();
    return P;
  }

  return {
    SCHEMA_VERSION, Store, emptyProject, defaultSettings,
    newDevice, newConnection, newArea, validate, serialize, sanitizeInterfaces
  };
})();

NWT.Store = NWT.Model.Store;
