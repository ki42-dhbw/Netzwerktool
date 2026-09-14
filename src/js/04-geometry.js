/* ============================================================
   04 — Geometrie: Ankerpunkte und Linienführung
   ============================================================ */

NWT.Geometry = (function () {
  const S = NWT.Store;

  function sign(v) { return v < 0 ? -1 : 1; }

  /** Schnittpunkt des Strahls von (cx,cy) Richtung (tx,ty) mit dem Rechteck. */
  function edgePoint(cx, cy, hw, hh, tx, ty) {
    const dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };
    const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
    const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
    const s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s };
  }

  /** Polyline mit abgerundeten Ecken. */
  function roundedPolyline(pts, r) {
    if (pts.length < 3) return 'M' + pts.map(p => p.x + ' ' + p.y).join(' L');
    let d = 'M' + pts[0].x + ' ' + pts[0].y;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
      const d1 = Math.hypot(p.x - prev.x, p.y - prev.y);
      const d2 = Math.hypot(next.x - p.x, next.y - p.y);
      const rr = Math.min(r, d1 / 2, d2 / 2);
      if (rr < 1.5) { d += ' L' + p.x + ' ' + p.y; continue; }
      const a = { x: p.x + (prev.x - p.x) / d1 * rr, y: p.y + (prev.y - p.y) / d1 * rr };
      const b = { x: p.x + (next.x - p.x) / d2 * rr, y: p.y + (next.y - p.y) / d2 * rr };
      d += ' L' + a.x + ' ' + a.y + ' Q' + p.x + ' ' + p.y + ' ' + b.x + ' ' + b.y;
    }
    const last = pts[pts.length - 1];
    d += ' L' + last.x + ' ' + last.y;
    return d;
  }

  /* ------------------------------------------------ Stützpunkte */

  /**
   * Anker für eine orthogonale Führung: die Kante, die dem Ziel am
   * nächsten liegt. edgePoint() träfe die Kachelecke schräg an und
   * ergäbe einen Knick direkt am Gerät.
   */
  function orthoAnchor(r, target) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dx = target.x - cx, dy = target.y - cy;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: cx + sign(dx) * r.w / 2, y: cy };
    return { x: cx, y: cy + sign(dy) * r.h / 2 };
  }

  /** Rechtwinklige Kette durch alle Punkte, je Abschnitt ein Knick. */
  function orthoChain(chain) {
    const out = [chain[0]];
    for (let i = 1; i < chain.length; i++) {
      const p = out[out.length - 1], q = chain[i];
      const dx = Math.abs(q.x - p.x), dy = Math.abs(q.y - p.y);
      if (dx > 0.5 && dy > 0.5) {
        out.push(dx >= dy ? { x: q.x, y: p.y } : { x: p.x, y: q.y });
      }
      out.push(q);
    }
    return out;
  }

  /**
   * Führung über vom Anwender gesetzte Stützpunkte.
   *
   * Der Versatz paralleler Leitungen entfällt hier bewusst: wer die
   * Führung selbst bestimmt, will sie genau so — nicht um ein paar
   * Pixel verschoben.
   */
  function routeVia(conn, routing, pts) {
    const A = S.dev(conn.source), B = S.dev(conn.target);
    const ra = S.deviceRect(A), rb = S.deviceRect(B);
    const first = pts[0], last = pts[pts.length - 1];

    if (routing === 'orthogonal') {
      const a = orthoAnchor(ra, first);
      const b = orthoAnchor(rb, last);
      const chain = orthoChain([a].concat(pts, [b]));
      return { d: roundedPolyline(chain, 10), a: a, b: b };
    }

    const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
    const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
    const a = edgePoint(ca.x, ca.y, ra.w / 2, ra.h / 2, first.x, first.y);
    const b = edgePoint(cb.x, cb.y, rb.w / 2, rb.h / 2, last.x, last.y);
    const chain = [a].concat(pts, [b]);
    if (routing === 'curved') return { d: roundedPolyline(chain, 26), a: a, b: b };
    return { d: 'M' + chain.map(p => p.x + ' ' + p.y).join(' L'), a: a, b: b };
  }

  /** Abstand eines Punktes zur Strecke p→q, für das Einfügen von Knoten. */
  function distToSegment(pt, p, q) {
    const vx = q.x - p.x, vy = q.y - p.y;
    const len2 = vx * vx + vy * vy;
    if (!len2) return Math.hypot(pt.x - p.x, pt.y - p.y);
    let t = ((pt.x - p.x) * vx + (pt.y - p.y) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(pt.x - (p.x + vx * t), pt.y - (p.y + vy * t));
  }

  /**
   * An welcher Stelle in conn.points gehört ein neuer Knoten?
   * Bestimmt über den nächstgelegenen Abschnitt der Kette
   * Startgerät → Stützpunkte → Zielgerät.
   */
  function insertIndexFor(conn, world) {
    const A = S.dev(conn.source), B = S.dev(conn.target);
    if (!A || !B) return 0;
    const ra = S.deviceRect(A), rb = S.deviceRect(B);
    const chain = [{ x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 }]
      .concat(conn.points || [])
      .concat([{ x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 }]);
    let best = 0, bestD = Infinity;
    for (let i = 0; i < chain.length - 1; i++) {
      const dd = distToSegment(world, chain[i], chain[i + 1]);
      if (dd < bestD) { bestD = dd; best = i; }
    }
    return best;
  }

  /**
   * Liefert Pfaddaten und Endpunkte einer Verbindung.
   * mode: 'orthogonal' | 'straight' | 'curved'
   */
  function route(conn, mode) {
    const A = S.dev(conn.source), B = S.dev(conn.target);
    if (!A || !B) return null;

    const via = Array.isArray(conn.points) ? conn.points.filter(p => p && isFinite(p.x) && isFinite(p.y)) : [];
    if (via.length) return routeVia(conn, mode || S.project.settings.routing || 'orthogonal', via);

    const ra = S.deviceRect(A), rb = S.deviceRect(B);
    const ca = { x: ra.x + ra.w / 2, y: ra.y + ra.h / 2 };
    const cb = { x: rb.x + rb.w / 2, y: rb.y + rb.h / 2 };
    const off = S.index.parallel.get(conn.id) || 0;
    const routing = mode || S.project.settings.routing || 'orthogonal';

    const dx = cb.x - ca.x, dy = cb.y - ca.y;

    if (routing === 'orthogonal') {
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      let a, b, pts;
      if (horizontal) {
        const oy = clampOffset(off, ra.h, rb.h);
        a = { x: ca.x + sign(dx) * ra.w / 2, y: ca.y + oy };
        b = { x: cb.x - sign(dx) * rb.w / 2, y: cb.y + oy };
        const midX = (a.x + b.x) / 2;
        pts = (Math.abs(a.y - b.y) < 0.5)
          ? [a, b]
          : [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
      } else {
        const ox = clampOffset(off, ra.w, rb.w);
        a = { x: ca.x + ox, y: ca.y + sign(dy) * ra.h / 2 };
        b = { x: cb.x + ox, y: cb.y - sign(dy) * rb.h / 2 };
        const midY = (a.y + b.y) / 2;
        pts = (Math.abs(a.x - b.x) < 0.5)
          ? [a, b]
          : [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b];
      }
      if (NWT.Layout) pts = NWT.Layout.avoid(conn, pts);
      return { d: roundedPolyline(pts, 10), a: a, b: b };
    }

    const a = edgePoint(ca.x, ca.y, ra.w / 2, ra.h / 2, cb.x, cb.y);
    const b = edgePoint(cb.x, cb.y, rb.w / 2, rb.h / 2, ca.x, ca.y);

    if (routing === 'curved') {
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const k = Math.max(40, Math.min(160, Math.hypot(dx, dy) * 0.4));
      const c1 = horizontal ? { x: a.x + sign(dx) * k, y: a.y + off } : { x: a.x + off, y: a.y + sign(dy) * k };
      const c2 = horizontal ? { x: b.x - sign(dx) * k, y: b.y + off } : { x: b.x + off, y: b.y - sign(dy) * k };
      return { d: 'M' + a.x + ' ' + a.y + ' C' + c1.x + ' ' + c1.y + ' ' + c2.x + ' ' + c2.y + ' ' + b.x + ' ' + b.y, a: a, b: b };
    }

    /* straight */
    if (off === 0) {
      return { d: 'M' + a.x + ' ' + a.y + ' L' + b.x + ' ' + b.y, a: a, b: b };
    }
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2 + nx * off * 2;
    const my = (a.y + b.y) / 2 + ny * off * 2;
    return { d: 'M' + a.x + ' ' + a.y + ' Q' + mx + ' ' + my + ' ' + b.x + ' ' + b.y, a: a, b: b };
  }

  /* Versatz paralleler Leitungen so begrenzen, dass er auf der Gerätekante bleibt. */
  function clampOffset(off, sizeA, sizeB) {
    const lim = Math.max(6, Math.min(sizeA, sizeB) / 2 - 10);
    return Math.max(-lim, Math.min(lim, off));
  }

  return { route, edgePoint, roundedPolyline, insertIndexFor, distToSegment };
})();
