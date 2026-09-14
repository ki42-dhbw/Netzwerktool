/* Hierarchische Anordnung und rechtwinklige Umwege um Gerätekacheln. */
NWT.Layout = (function () {
  const S = NWT.Store, U = NWT.Util, C = NWT.Catalog;
  function arrange(options) {
    const opts = options || {};
    const chosen = S.project.devices.filter(d => (C.shapeOf(d.type) === 'device' || C.shapeOf(d.type) === 'junction') && S.isVisible(d) && (!opts.selection || S.selection.has(d.id)));
    if (!chosen.length) return 0;
    const ids = new Set(chosen.map(d => d.id)), adjacent = new Map(chosen.map(d => [d.id, new Set()]));
    S.project.connections.forEach(c => { if (ids.has(c.source) && ids.has(c.target)) { adjacent.get(c.source).add(c.target); adjacent.get(c.target).add(c.source); } });
    const membership = S.project.areas.map(a => ({ area: a, members: S.project.devices.filter(d => {
      const r = S.deviceRect(d); return U.pointInRect(r.x + r.w / 2, r.y + r.h / 2, a);
    }) }));
    const waiting = new Set(ids), placements = new Map();
    let componentX = 80;
    while (waiting.size) {
      const order = Array.from(waiting).sort((a, b) => {
        const score = id => (['router', 'firewall', 'internet', 'switch_l3'].includes(S.dev(id).type) ? 10000 : 0) + adjacent.get(id).size;
        return score(b) - score(a) || a.localeCompare(b);
      });
      const queue = [{ id: order[0], depth: 0 }], levels = [];
      waiting.delete(order[0]);
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (!levels[item.depth]) levels[item.depth] = [];
        levels[item.depth].push(S.dev(item.id));
        adjacent.get(item.id).forEach(id => { if (waiting.delete(id)) queue.push({ id: id, depth: item.depth + 1 }); });
      }
      const widths = levels.map(level => level.reduce((n, d) => n + S.deviceRect(d).w + 70, -70));
      const componentWidth = Math.max.apply(null, widths);
      let y = 80;
      levels.forEach((level, depth) => {
        let x = componentX + (componentWidth - widths[depth]) / 2, height = 0;
        level.forEach(d => { const r = S.deviceRect(d); placements.set(d.id, { x: Math.round(x / 20) * 20, y: y }); x += r.w + 70; height = Math.max(height, r.h); });
        y += Math.ceil((height + 100) / 20) * 20;
      });
      componentX += componentWidth + 160;
    }
    NWT.History.record('Netzplan automatisch anordnen');
    chosen.forEach(d => Object.assign(d, placements.get(d.id)));
    membership.forEach(group => {
      if (!group.members.length || group.members.some(d => !ids.has(d.id))) return;
      const rects = group.members.map(d => S.deviceRect(d));
      const x = Math.min.apply(null, rects.map(r => r.x)) - 30, y = Math.min.apply(null, rects.map(r => r.y)) - 50;
      Object.assign(group.area, { x: x, y: y, w: Math.max.apply(null, rects.map(r => r.x + r.w)) - x + 30, h: Math.max.apply(null, rects.map(r => r.y + r.h)) - y + 30 });
    });
    if (opts.clearPoints !== false) S.project.connections.forEach(c => { if (ids.has(c.source) && ids.has(c.target)) c.points = []; });
    S.project.settings.avoidObstacles = true;
    S.touch(); NWT.emit('change', { structural: true }); NWT.Viewport.zoomToFit();
    return chosen.length;
  }
  function crosses(a, b, r) {
    if (Math.abs(a.x - b.x) < 0.01) return a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h;
    if (Math.abs(a.y - b.y) < 0.01) return a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w;
    return true;
  }
  function avoid(conn, original) {
    if (!S.project.settings.avoidObstacles || original.length < 2) return original;
    const obstacles = S.project.devices.filter(d => d.id !== conn.source && d.id !== conn.target && S.isVisible(d) && C.shapeOf(d.type) === 'device')
      .map(d => { const r = S.deviceRect(d); return { x: r.x - 14, y: r.y - 14, w: r.w + 28, h: r.h + 28 }; });
    const clear = points => points.every((p, i) => !i || !obstacles.some(r => crosses(points[i - 1], p, r)));
    if (clear(original)) return original;
    const a = original[0], b = original[original.length - 1];
    const blocking = obstacles.filter(r => original.some((p, i) => i && crosses(original[i - 1], p, r)));
    const candidates = [];
    blocking.slice(0, 40).forEach(r => {
      [r.y - 4, r.y + r.h + 4].forEach(y => candidates.push([a, { x: a.x, y: y }, { x: b.x, y: y }, b]));
      [r.x - 4, r.x + r.w + 4].forEach(x => candidates.push([a, { x: x, y: a.y }, { x: x, y: b.y }, b]));
    });
    const length = p => p.reduce((sum, v, i) => sum + (i ? Math.abs(v.x - p[i - 1].x) + Math.abs(v.y - p[i - 1].y) : 0), 0);
    const result = candidates.filter(clear).sort((x, y) => length(x) - length(y))[0];
    return result || original;
  }
  async function open() {
    const result = await NWT.Modal.form({ title: 'Netzplan automatisch anordnen', subtitle: 'Verbundene Geräte werden in Ebenen angeordnet. Die Änderung lässt sich mit einem Undo-Schritt zurücknehmen.',
      fields: [{ key: 'selection', label: 'Nur ausgewählte Geräte anordnen', type: 'checkbox', wide: true },
        { key: 'clearPoints', label: 'Manuelle Leitungsknoten zwischen angeordneten Geräten zurücksetzen', type: 'checkbox', wide: true }],
      values: { selection: false, clearPoints: true }, submitLabel: 'Anordnen' });
    if (result) U.toast(arrange(result) + ' Geräte angeordnet');
  }
  return { arrange, avoid, open };
})();
