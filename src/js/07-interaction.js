/* ============================================================
   07 — Interaktion: Zeigergesten, Auswahl, Ziehen, Verbinden
   Ein expliziter Zustandsautomat statt verstreuter Flags.
   ============================================================ */

NWT.Interaction = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const V = NWT.Viewport;
  const R = NWT.Render;
  const C = NWT.Catalog;

  let svg;
  let act = null;              // laufende Geste
  let spaceDown = false;
  let connectSource = null;    // ID des ersten Geräts im Verbindungsmodus
  let previewLine = null;
  let dropGhost = null;
  let lastWorld = { x: 0, y: 0 };

  const CLICK_TOLERANCE = 3;

  function init() {
    svg = U.el('#canvas');

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
    svg.addEventListener('dblclick', onDblClick);
    svg.addEventListener('contextmenu', onContextMenu);
    svg.addEventListener('wheel', onWheel, { passive: false });

    svg.addEventListener('dragover', onDragOver);
    svg.addEventListener('dragleave', onDragLeave);
    svg.addEventListener('drop', onDrop);

    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        spaceDown = true;
        if (!act) svg.classList.add('mode-pan');
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space') {
        spaceDown = false;
        if (S.mode !== 'pan') svg.classList.remove('mode-pan');
      }
    });
    window.addEventListener('blur', () => { spaceDown = false; });

    NWT.on('mode', m => {
      svg.classList.toggle('mode-connect', m === 'connect');
      svg.classList.toggle('mode-pan', m === 'pan');
      cancelConnect();
    });
  }

  function isTyping(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  /* ------------------------------------------------------------ Treffer */

  function hitTest(target) {
    if (!target || !target.closest) return { kind: 'background' };
    if (target.closest('.area-handle')) {
      return { kind: 'area-handle', id: target.closest('.area').getAttribute('data-id') };
    }
    if (target.closest('.node-handle')) {
      return { kind: 'node-handle', id: target.closest('.node').getAttribute('data-id') };
    }
    const point = target.closest('.edge-point');
    if (point) {
      return { kind: 'edge-point', id: point.closest('.edge').getAttribute('data-id'),
               idx: Number(point.getAttribute('data-idx')) };
    }
    const node = target.closest('.node');
    if (node) return { kind: 'device', id: node.getAttribute('data-id') };
    const edge = target.closest('.edge');
    if (edge) return { kind: 'connection', id: edge.getAttribute('data-id') };
    const area = target.closest('.area');
    if (area) return { kind: 'area', id: area.getAttribute('data-id') };
    return { kind: 'background' };
  }

  /**
   * Treffer über Bildschirmkoordinaten bestimmen.
   * Nötig für click/dblclick: nach setPointerCapture liefert der Browser
   * diese Ereignisse am Capture-Element (dem SVG-Root) statt am Gerät.
   */
  function hitTestAt(clientX, clientY, fallback) {
    const el = document.elementFromPoint(clientX, clientY);
    return hitTest(el || fallback);
  }

  /* ------------------------------------------------------- Pointer Down */

  function onPointerDown(e) {
    if (e.button === 2) return;                 // Rechtsklick → contextmenu-Event
    NWT.emit('ui:closemenus');
    svg.focus({ preventScroll: true });

    const world = V.screenToWorld(e.clientX, e.clientY);
    const hit = hitTest(e.target);
    const wantPan = e.button === 1 || spaceDown || S.mode === 'pan';

    if (wantPan) {
      startPan(e);
      return;
    }

    if (S.mode === 'connect') {
      if (hit.kind === 'device') handleConnectClick(hit.id);
      else cancelConnect();
      return;
    }

    svg.setPointerCapture(e.pointerId);

    if (hit.kind === 'device') {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) {
        S.toggleSelect(hit.id);
        R.selection();
        return;
      }
      if (!S.selection.has(hit.id)) { S.select(hit.id); R.selection(); }
      startDragObjects(e, world);
      return;
    }

    if (hit.kind === 'connection') {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) S.toggleSelect(hit.id); else S.select(hit.id);
      R.selection();
      return;
    }

    if (hit.kind === 'edge-point') {
      const c = S.con(hit.id);
      if (!c || !c.points || !c.points[hit.idx]) return;
      S.select(hit.id); R.selection();
      NWT.History.begin('Knoten verschieben');
      act = { kind: 'dragPoint', id: hit.id, idx: hit.idx, moved: false };
      return;
    }

    if (hit.kind === 'node-handle') {
      const d = S.dev(hit.id);
      if (!d) return;
      const r = S.deviceRect(d);
      S.select(hit.id); R.selection();
      NWT.History.begin('Größe ändern');
      act = { kind: 'resizeNode', id: hit.id, start: world, w0: r.w, h0: r.h, moved: false };
      return;
    }

    if (hit.kind === 'area-handle') {
      const a = S.area(hit.id);
      if (!a) return;
      S.select(hit.id); R.selection();
      NWT.History.begin('Bereich anpassen');
      act = { kind: 'resizeArea', id: hit.id, start: world, w0: a.w, h0: a.h, moved: false };
      return;
    }

    if (hit.kind === 'area') {
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) { S.toggleSelect(hit.id); R.selection(); return; }
      if (!S.selection.has(hit.id)) { S.select(hit.id); R.selection(); }
      startDragObjects(e, world);
      return;
    }

    /* Hintergrund */
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) { S.clearSelection(); R.selection(); }
    act = {
      kind: 'marquee', start: world, additive: e.shiftKey || e.ctrlKey || e.metaKey,
      base: S.selectedIds(), el: R.overlayRect('marquee'), moved: false
    };
  }

  function startPan(e) {
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
    act = { kind: 'pan', sx: e.clientX, sy: e.clientY };
  }

  function startDragObjects(e, world) {
    const ids = S.selectedIds();
    const devIds = ids.filter(id => id.startsWith('dev_'));
    const areaIds = ids.filter(id => id.startsWith('area_'));

    /* Geräte innerhalb bewegter Bereiche mitnehmen. */
    const carried = new Set(devIds);
    areaIds.forEach(aid => {
      const a = S.area(aid);
      if (!a) return;
      S.project.devices.forEach(d => {
        if (!S.isVisible(d)) return;
        const c = S.deviceCenter(d);
        if (c.x >= a.x && c.x <= a.x + a.w && c.y >= a.y && c.y <= a.y + a.h) carried.add(d.id);
      });
    });

    const start = {};
    carried.forEach(id => { const d = S.dev(id); if (d) start[id] = { x: d.x, y: d.y }; });
    areaIds.forEach(id => { const a = S.area(id); if (a) start[id] = { x: a.x, y: a.y }; });

    const anchorId = devIds.length ? devIds[0] : areaIds[0];
    if (!anchorId) return;

    NWT.History.begin(carried.size + areaIds.length > 1 ? 'Objekte verschieben' : 'Objekt verschieben');
    act = {
      kind: 'dragObjects',
      start: world,
      anchor: anchorId,
      positions: start,
      devIds: Array.from(carried),
      areaIds: areaIds,
      moved: false
    };
  }

  /* ------------------------------------------------------- Pointer Move */

  function onPointerMove(e) {
    const world = V.screenToWorld(e.clientX, e.clientY);
    lastWorld = world;
    NWT.emit('ui:coords', world);

    if (connectSource && !act) updatePreview(world);

    if (!act) return;

    if (act.kind === 'pan') {
      V.panBy(e.clientX - act.sx, e.clientY - act.sy);
      act.sx = e.clientX; act.sy = e.clientY;
      return;
    }

    if (act.kind === 'dragObjects') {
      let dx = world.x - act.start.x;
      let dy = world.y - act.start.y;
      const z = S.project.settings.zoom;
      if (!act.moved && Math.hypot(dx * z, dy * z) < CLICK_TOLERANCE) return;
      act.moved = true;

      const base = act.positions[act.anchor];
      if (S.project.settings.snap) {
        const gs = S.project.settings.gridSize;
        dx = Math.round((base.x + dx) / gs) * gs - base.x;
        dy = Math.round((base.y + dy) / gs) * gs - base.y;
      } else {
        dx = Math.round(dx); dy = Math.round(dy);
      }

      act.devIds.forEach(id => {
        const d = S.dev(id), p = act.positions[id];
        if (!d || !p) return;
        d.x = p.x + dx; d.y = p.y + dy;
        R.moveNode(id);
      });
      act.areaIds.forEach(id => {
        const a = S.area(id), p = act.positions[id];
        if (!a || !p) return;
        a.x = p.x + dx; a.y = p.y + dy;
        R.moveArea(id);
      });
      R.updateEdgesFor(act.devIds);
      NWT.emit('ui:minimap');
      return;
    }

    if (act.kind === 'dragPoint') {
      const c = S.con(act.id);
      if (!c || !c.points || !c.points[act.idx]) return;
      c.points[act.idx] = { x: Math.round(V.snap(world.x)), y: Math.round(V.snap(world.y)) };
      act.moved = true;
      R.updateOne(act.id);
      NWT.emit('ui:minimap');
      return;
    }

    if (act.kind === 'resizeNode') {
      const d = S.dev(act.id);
      if (!d) return;
      let dx = world.x - act.start.x;
      let dy = world.y - act.start.y;
      /* Bei gedrehten Elementen zeigt der Griff in eine andere Richtung
         als die Maus sich bewegt — Verschiebung zurückdrehen. */
      const rot = Number(d.rot) || 0;
      if (rot) {
        const a = -rot * Math.PI / 180;
        const rx = dx * Math.cos(a) - dy * Math.sin(a);
        const ry = dx * Math.sin(a) + dy * Math.cos(a);
        dx = rx; dy = ry;
      }
      let w = act.w0 + dx, h = act.h0 + dy;
      if (S.project.settings.snap) {
        const gs = S.project.settings.gridSize;
        w = Math.round(w / gs) * gs;
        h = Math.round(h / gs) * gs;
      }
      d.w = Math.max(24, Math.round(w));
      d.h = Math.max(C.shapeOf(d.type) === 'text' ? 20 : 24, Math.round(h));
      act.moved = true;
      R.updateOne(act.id);
      R.updateEdgesFor([act.id]);
      NWT.emit('ui:minimap');
      return;
    }

    if (act.kind === 'resizeArea') {
      const a = S.area(act.id);
      if (!a) return;
      let w = act.w0 + (world.x - act.start.x);
      let h = act.h0 + (world.y - act.start.y);
      if (S.project.settings.snap) {
        const gs = S.project.settings.gridSize;
        w = Math.round((a.x + w) / gs) * gs - a.x;
        h = Math.round((a.y + h) / gs) * gs - a.y;
      }
      a.w = Math.max(80, Math.round(w));
      a.h = Math.max(60, Math.round(h));
      act.moved = true;
      R.moveArea(act.id);
      NWT.emit('ui:minimap');
      return;
    }

    if (act.kind === 'marquee') {
      const x = Math.min(act.start.x, world.x), y = Math.min(act.start.y, world.y);
      const w = Math.abs(world.x - act.start.x), h = Math.abs(world.y - act.start.y);
      act.moved = w > 3 || h > 3;
      act.el.setAttribute('x', x); act.el.setAttribute('y', y);
      act.el.setAttribute('width', w); act.el.setAttribute('height', h);

      const box = { x: x, y: y, w: w, h: h };
      const picked = [];
      S.project.devices.forEach(d => {
        if (S.isVisible(d) && U.rectsIntersect(S.deviceRect(d), box)) picked.push(d.id);
      });
      S.project.areas.forEach(a => {
        if (S.isVisible(a) && U.rectsIntersect({ x: a.x, y: a.y, w: a.w, h: a.h }, box)) picked.push(a.id);
      });
      S.selection = new Set(act.additive ? act.base.concat(picked) : picked);
      R.selection();
      NWT.emit('selection');
      return;
    }
  }

  /* --------------------------------------------------------- Pointer Up */

  function onPointerUp(e) {
    if (svg.hasPointerCapture && svg.hasPointerCapture(e.pointerId)) {
      svg.releasePointerCapture(e.pointerId);
    }
    svg.classList.remove('panning');
    if (!act) return;
    const a = act;
    act = null;

    if (a.kind === 'marquee') {
      a.el.remove();
      NWT.emit('selection');
      return;
    }
    if (a.kind === 'pan') { NWT.emit('change', { structural: false, viewOnly: true }); return; }

    if (a.kind === 'dragObjects' || a.kind === 'resizeArea' || a.kind === 'resizeNode' || a.kind === 'dragPoint') {
      NWT.History.end(!!a.moved);
      if (a.moved) {
        S.touch();
        NWT.emit('change', { structural: false });
      }
    }
  }

  /* ------------------------------------------------------ Verbindungsmodus */

  function handleConnectClick(deviceId) {
    /* Dekoration ist kein Netzobjekt — ein Rahmen hat keine Leitung. */
    const target = S.dev(deviceId);
    if (target && C.shapeOf(target.type) === 'shape') {
      U.toast('Dekorationselemente lassen sich nicht verbinden', 'warn');
      return;
    }
    if (!connectSource) {
      connectSource = deviceId;
      const el = R.nodeEl(deviceId);
      if (el) el.classList.add('connect-src');
      NWT.emit('ui:connecthint', 'Ziel wählen … (ESC bricht ab)');
      return;
    }
    if (connectSource === deviceId) { cancelConnect(); return; }

    NWT.History.record('Verbindung erstellen');
    const conn = S.addConnection(connectSource, deviceId);
    const src = connectSource;
    cancelConnect();
    if (conn) {
      NWT.emit('change', { structural: true });
      U.toast('Verbindung: ' + label(src) + ' → ' + label(deviceId), 'ok');
      /* Kette weiterziehen: Ziel wird neue Quelle. */
      connectSource = deviceId;
      const el = R.nodeEl(deviceId);
      if (el) el.classList.add('connect-src');
      NWT.emit('ui:connecthint', 'Weiter verbinden oder ESC');
    }
  }

  function label(id) { const d = S.dev(id); return d ? d.name : id; }

  function updatePreview(world) {
    const d = S.dev(connectSource);
    if (!d) { cancelConnect(); return; }
    const c = S.deviceCenter(d);
    if (!previewLine) previewLine = R.overlayPath('preview-line');
    previewLine.setAttribute('d', 'M' + c.x + ' ' + c.y + ' L' + world.x + ' ' + world.y);
  }

  function cancelConnect() {
    if (connectSource) {
      const el = R.nodeEl(connectSource);
      if (el) el.classList.remove('connect-src');
    }
    connectSource = null;
    if (previewLine) { previewLine.remove(); previewLine = null; }
    NWT.emit('ui:connecthint', S.mode === 'connect' ? 'Erstes Gerät wählen …' : null);
  }

  function startConnectFrom(id) {
    S.setMode('connect');
    connectSource = null;
    handleConnectClick(id);
  }

  /* --------------------------------------------------------- Drag & Drop */

  function onDragOver(e) {
    if (!e.dataTransfer) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    /* Beim Ziehen einer Datei keine Gerätevorschau zeigen. */
    const types = e.dataTransfer.types;
    if (types && Array.prototype.indexOf.call(types, 'Files') >= 0) { removeGhost(); return; }
    const w = V.screenToWorld(e.clientX, e.clientY);
    if (!dropGhost) dropGhost = R.overlayRect('drop-ghost');
    dropGhost.setAttribute('x', w.x - C.NODE_W / 2);
    dropGhost.setAttribute('y', w.y - C.NODE_H / 2);
    dropGhost.setAttribute('width', C.NODE_W);
    dropGhost.setAttribute('height', C.NODE_H);
  }

  function onDragLeave(e) {
    if (e.relatedTarget && svg.contains(e.relatedTarget)) return;
    removeGhost();
  }

  function removeGhost() {
    if (dropGhost) { dropGhost.remove(); dropGhost = null; }
  }

  function onDrop(e) {
    e.preventDefault();
    removeGhost();

    /* Bilddatei auf ein Gerät gezogen → Gerätefoto */
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) {
      const hit = hitTestAt(e.clientX, e.clientY, e.target);
      if (hit.kind === 'device') {
        if (NWT.Images.handleDroppedFiles(hit.id, files)) return;
      } else if (Array.prototype.some.call(files, f => f.type && f.type.indexOf('image/') === 0)) {
        U.toast('Bild bitte direkt auf ein Gerät ziehen, um es als Foto zu hinterlegen.', 'warn', 4000);
        return;
      }
    }

    let typeId = '';
    try { typeId = e.dataTransfer.getData('application/x-nwt-type') || e.dataTransfer.getData('text/plain'); }
    catch (err) { typeId = ''; }
    if (!typeId || !C.DEVICE_TYPES[typeId]) return;
    const w = V.screenToWorld(e.clientX, e.clientY);
    addDeviceAt(typeId, w.x, w.y);
  }

  /** Erzeugt ein Gerät zentriert auf (wx,wy) in Weltkoordinaten. */
  function addDeviceAt(typeId, wx, wy) {
    NWT.History.record('Gerät hinzufügen');
    const shape = C.shapeOf(typeId);
    const t = C.type(typeId);
    const w = shape === 'text' ? 180 : shape === 'note' ? 170 : shape === 'shape' ? (t.w || 200) : C.NODE_W;
    const h = shape === 'text' ? 34 : shape === 'note' ? 108 : shape === 'shape' ? (t.h || 140) : C.NODE_H;
    const d = S.addDevice(typeId, V.snap(wx - w / 2), V.snap(wy - h / 2));
    S.select(d.id);
    NWT.emit('change', { structural: true });
    NWT.emit('selection');
    U.toast((d.name || C.typeLabel(typeId)) + ' hinzugefügt');
    return d;
  }

  /** Gerät in der Mitte der sichtbaren Fläche einfügen (Klick in der Seitenleiste). */
  function addDeviceCentered(typeId) {
    const r = V.rect();
    const w = V.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    /* Leicht versetzen, damit mehrere Klicks nicht stapeln. */
    const n = S.project.devices.length % 6;
    return addDeviceAt(typeId, w.x + n * 26, w.y + n * 22);
  }

  /* --------------------------------------------------------- Sonstiges */

  function onDblClick(e) {
    const hit = hitTestAt(e.clientX, e.clientY, e.target);
    if (hit.kind === 'device') NWT.Dialogs.editDevice(hit.id);
    else if (hit.kind === 'connection') NWT.Dialogs.editConnection(hit.id);
    /* Doppelklick auf einen Knoten entfernt ihn — der schnellste Weg
       zurück zur automatischen Führung. */
    else if (hit.kind === 'edge-point') NWT.Commands.removeWaypoint(hit.id, hit.idx);
    else if (hit.kind === 'node-handle') NWT.Dialogs.editDevice(hit.id);
    else if (hit.kind === 'area' || hit.kind === 'area-handle') NWT.Dialogs.editArea(hit.id);
  }

  function onContextMenu(e) {
    e.preventDefault();
    const hit = hitTestAt(e.clientX, e.clientY, e.target);
    if (hit.id && !S.selection.has(hit.id)) { S.select(hit.id); R.selection(); }
    if (hit.kind === 'background') { S.clearSelection(); R.selection(); }
    NWT.emit('ui:contextmenu', { x: e.clientX, y: e.clientY, hit: hit, world: V.screenToWorld(e.clientX, e.clientY) });
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.pow(0.999, e.deltaY * (e.deltaMode === 1 ? 16 : 1));
      V.zoomAt(factor, e.clientX, e.clientY);
    } else {
      const m = e.deltaMode === 1 ? 16 : 1;
      V.panBy(-e.deltaX * m, -e.deltaY * m);
    }
  }

  function cancel() {
    if (act) {
      if (act.kind === 'marquee') act.el.remove();
      if (act.kind === 'dragObjects' || act.kind === 'resizeArea' || act.kind === 'resizeNode' || act.kind === 'dragPoint') {
        NWT.History.abort();
        NWT.emit('change', { structural: true });
      }
      act = null;
    }
    if (connectSource) { cancelConnect(); return true; }
    return false;
  }

  return {
    init, addDeviceAt, addDeviceCentered, startConnectFrom, cancel, cancelConnect,
    lastWorld: () => lastWorld,
    isBusy: () => !!act
  };
})();
