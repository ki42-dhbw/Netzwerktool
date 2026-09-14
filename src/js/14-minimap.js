/* ============================================================
   14 — Minimap: Übersicht und Schnellnavigation
   ============================================================ */

NWT.Minimap = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const V = NWT.Viewport;

  const W = 200, H = 130;
  let svg, content, viewRect, box, transform = null, dragging = false;

  function init() {
    box = U.el('#minimap');
    svg = U.el('#minimap-svg');
    content = U.el('#mm-content');
    viewRect = U.el('#mm-view');

    U.el('#minimap-toggle').addEventListener('click', () => {
      box.classList.toggle('collapsed');
      U.el('#minimap-toggle').textContent = box.classList.contains('collapsed') ? '▴' : '▾';
    });

    svg.addEventListener('pointerdown', e => {
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      jump(e);
    });
    svg.addEventListener('pointermove', e => { if (dragging) jump(e); });
    svg.addEventListener('pointerup', e => {
      dragging = false;
      if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    });

    const redraw = U.rafThrottle(render);
    NWT.on('change', redraw);
    NWT.on('view', redraw);
    NWT.on('ui:minimap', redraw);
    NWT.on('project:replaced', () => { applyVisibility(); redraw(); });
    NWT.on('settings', () => { applyVisibility(); redraw(); });
    applyVisibility();
    render();
  }

  /** Die Übersichtskarte lässt sich in den Einstellungen ganz abschalten. */
  function applyVisibility() {
    if (!box) return;
    box.hidden = S.project.settings.minimap === false;
  }

  function bounds() {
    const b = S.contentBounds(60);
    const r = V.rect();
    const st = S.project.settings;
    /* Auch den aktuellen Ausschnitt einbeziehen, damit der Rahmen sichtbar bleibt. */
    const vx = -st.panX / st.zoom, vy = -st.panY / st.zoom;
    const vw = r.width / st.zoom, vh = Math.max(50, r.height - 24) / st.zoom;
    const minX = Math.min(b.x, vx), minY = Math.min(b.y, vy);
    const maxX = Math.max(b.x + b.w, vx + vw), maxY = Math.max(b.y + b.h, vy + vh);
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  function render() {
    if (!svg || box.hidden || box.classList.contains('collapsed')) return;
    const b = bounds();
    const k = Math.min(W / b.w, H / b.h);
    const ox = (W - b.w * k) / 2, oy = (H - b.h * k) / 2;
    transform = { k: k, ox: ox, oy: oy, b: b };

    const mx = x => (x - b.x) * k + ox;
    const my = y => (y - b.y) * k + oy;

    let html = '';
    S.project.areas.forEach(a => {
      if (!S.isVisible(a)) return;
      html += '<rect class="mm-area" x="' + mx(a.x) + '" y="' + my(a.y) +
              '" width="' + (a.w * k) + '" height="' + (a.h * k) + '" rx="2"/>';
    });
    S.project.devices.forEach(d => {
      if (!S.isVisible(d)) return;
      const r = S.deviceRect(d);
      html += '<rect class="mm-node" x="' + mx(r.x) + '" y="' + my(r.y) +
              '" width="' + Math.max(1.5, r.w * k) + '" height="' + Math.max(1.5, r.h * k) +
              '" rx="1" fill="' + (S.selection.has(d.id) ? '#2563eb' : '#94a3b8') + '"/>';
    });
    content.innerHTML = html;

    const r = V.rect();
    const st = S.project.settings;
    const vx = -st.panX / st.zoom, vy = -st.panY / st.zoom;
    const vw = r.width / st.zoom, vh = Math.max(50, r.height - 24) / st.zoom;
    viewRect.setAttribute('x', mx(vx));
    viewRect.setAttribute('y', my(vy));
    viewRect.setAttribute('width', Math.max(2, vw * k));
    viewRect.setAttribute('height', Math.max(2, vh * k));
  }

  function jump(e) {
    if (!transform) return;
    const r = svg.getBoundingClientRect();
    /* Bildschirmkoordinaten → viewBox-Koordinaten (preserveAspectRatio: meet). */
    const scale = Math.min(r.width / W, r.height / H);
    const offX = (r.width - W * scale) / 2, offY = (r.height - H * scale) / 2;
    const vbX = (e.clientX - r.left - offX) / scale;
    const vbY = (e.clientY - r.top - offY) / scale;
    const wx = (vbX - transform.ox) / transform.k + transform.b.x;
    const wy = (vbY - transform.oy) / transform.k + transform.b.y;
    V.centerOn(wx, wy);
  }

  return { init, render };
})();
