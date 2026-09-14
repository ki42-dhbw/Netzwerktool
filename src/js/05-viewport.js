/* ============================================================
   05 — Viewport: Zoom, Pan, Raster, Koordinatenumrechnung
   Ein einziges transform am <g id="viewport"> steuert die Ansicht.
   ============================================================ */

NWT.Viewport = (function () {
  const U = NWT.Util;
  const S = NWT.Store;

  const MIN_ZOOM = 0.15, MAX_ZOOM = 5;
  let svg, gViewport, gridBg, gridMinor, gridMajor, zoomLabel;

  function init() {
    svg = U.el('#canvas');
    gViewport = U.el('#viewport');
    gridBg = U.el('#grid-bg');
    gridMinor = U.el('#grid-minor');
    gridMajor = U.el('#grid-major');
    zoomLabel = U.el('#zoom-value');
    apply();
  }

  function set() { return S.project.settings; }

  function rect() { return svg.getBoundingClientRect(); }

  function screenToWorld(clientX, clientY) {
    const r = rect(), st = set();
    return {
      x: (clientX - r.left - st.panX) / st.zoom,
      y: (clientY - r.top - st.panY) / st.zoom
    };
  }

  function worldToScreen(x, y) {
    const r = rect(), st = set();
    return { x: x * st.zoom + st.panX + r.left, y: y * st.zoom + st.panY + r.top };
  }

  const apply = U.rafThrottle(function () {
    const st = set();
    gViewport.setAttribute('transform', 'translate(' + st.panX + ' ' + st.panY + ') scale(' + st.zoom + ')');

    const p1 = U.el('#p-grid'), p2 = U.el('#p-grid-major');
    const gs = st.gridSize;
    p1.setAttribute('width', gs); p1.setAttribute('height', gs);
    gridMinor.setAttribute('d', 'M' + gs + ' 0H0V' + gs);
    p2.setAttribute('width', gs * 5); p2.setAttribute('height', gs * 5);
    p2.firstElementChild.setAttribute('width', gs * 5);
    p2.firstElementChild.setAttribute('height', gs * 5);
    gridMajor.setAttribute('d', 'M' + (gs * 5) + ' 0H0V' + (gs * 5));
    const tf = 'translate(' + st.panX + ' ' + st.panY + ') scale(' + st.zoom + ')';
    p2.setAttribute('patternTransform', tf);
    gridMinor.setAttribute('stroke-width', 1 / st.zoom);
    gridMajor.setAttribute('stroke-width', 1 / st.zoom);
    gridBg.classList.toggle('hidden', !st.grid);

    if (zoomLabel) zoomLabel.textContent = Math.round(st.zoom * 100) + ' %';
    NWT.emit('view');
  });

  function clampZoom(z) { return U.clamp(z, MIN_ZOOM, MAX_ZOOM); }

  /** Zoomt um einen Bildschirmpunkt herum (Punkt unter dem Cursor bleibt stehen). */
  function zoomAt(factor, clientX, clientY) {
    const st = set();
    const before = screenToWorld(clientX, clientY);
    st.zoom = clampZoom(st.zoom * factor);
    const r = rect();
    st.panX = clientX - r.left - before.x * st.zoom;
    st.panY = clientY - r.top - before.y * st.zoom;
    apply();
  }

  function zoomBy(factor) {
    const r = rect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  function setZoom(z) {
    const st = set();
    zoomBy(clampZoom(z) / st.zoom);
  }

  function resetZoom() {
    const st = set();
    const r = rect();
    const centerWorld = screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    st.zoom = 1;
    st.panX = r.width / 2 - centerWorld.x;
    st.panY = r.height / 2 - centerWorld.y;
    apply();
  }

  function panBy(dx, dy) {
    const st = set();
    st.panX += dx; st.panY += dy;
    apply();
  }

  function centerOn(wx, wy) {
    const st = set(), r = rect();
    st.panX = r.width / 2 - wx * st.zoom;
    st.panY = r.height / 2 - wy * st.zoom;
    apply();
  }

  function zoomToFit(padding) {
    const b = S.contentBounds(padding == null ? 60 : padding);
    const r = rect();
    const st = set();
    if (b.empty) { st.zoom = 1; st.panX = 60; st.panY = 60; apply(); return; }
    const usableH = Math.max(120, r.height - 30);
    const z = clampZoom(Math.min(r.width / b.w, usableH / b.h));
    st.zoom = z;
    st.panX = (r.width - b.w * z) / 2 - b.x * z;
    st.panY = (usableH - b.h * z) / 2 - b.y * z;
    apply();
  }

  function snap(v) {
    const st = set();
    return st.snap ? Math.round(v / st.gridSize) * st.gridSize : Math.round(v);
  }

  return {
    init, apply, screenToWorld, worldToScreen, zoomAt, zoomBy, setZoom,
    resetZoom, zoomToFit, panBy, centerOn, snap, rect,
    MIN_ZOOM, MAX_ZOOM
  };
})();
