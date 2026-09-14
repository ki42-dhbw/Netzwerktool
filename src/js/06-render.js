/* ============================================================
   06 — Rendering (SVG)
   all()      … strukturelle Synchronisation (Diff über IDs)
   moveNode() … schnelle Einzelaktualisierung beim Ziehen
   ============================================================ */

NWT.Render = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;
  const G = NWT.Geometry;
  const svgEl = U.svgEl;

  let lAreas, lEdges, lNodes, lOverlay, lDeco, lDecoFront;
  const nodeEls = new Map();
  const edgeEls = new Map();
  const areaEls = new Map();

  function init() {
    lAreas = U.el('#l-areas');
    lDeco = U.el('#l-deco');
    lEdges = U.el('#l-edges');
    lNodes = U.el('#l-nodes');
    lDecoFront = U.el('#l-deco-front');
    lOverlay = U.el('#l-overlay');
  }

  /** Maskierung vertraulicher Angaben — siehe 28-privacy.js. */
  function mask(kind, text, ctx) { return NWT.Privacy.mask(kind, text, ctx); }

  /* -------------------------------------------------- generischer Diff */
  function sync(layer, items, cache, create, update) {
    const alive = new Set();
    items.forEach(item => {
      let el = cache.get(item.id);
      if (!el || !el.isConnected) {
        el = create(item);
        el.setAttribute('data-id', item.id);
        cache.set(item.id, el);
        layer.appendChild(el);
      }
      update(el, item);
      alive.add(item.id);
    });
    cache.forEach((el, id) => {
      if (!alive.has(id)) { el.remove(); cache.delete(id); }
    });
    /* Z-Reihenfolge an die Datenreihenfolge angleichen. */
    items.forEach((item, i) => {
      const el = cache.get(item.id);
      if (layer.children[i] !== el) layer.insertBefore(el, layer.children[i] || null);
    });
  }

  /**
   * Wie sync(), verteilt die Elemente aber auf mehrere Ebenen aus einem
   * gemeinsamen Zwischenspeicher. Geräte liegen zwischen den beiden
   * Dekorationsebenen — Dekoration soll das Netz nicht verdecken.
   *
   * signature erzwingt einen Neuaufbau, wenn sich die Bauform geändert
   * hat: aus einem Gerät kann per Typwechsel eine Notiz werden, und
   * deren Aufbau ist ein völlig anderer.
   */
  function syncGroups(groups, cache, create, update, signature) {
    const alive = new Set();
    groups.forEach(g => g.items.forEach(item => {
      let el = cache.get(item.id);
      if (el && signature && el.getAttribute('data-shape') !== signature(item)) {
        el.remove(); cache.delete(item.id); el = null;
      }
      if (!el || !el.isConnected) {
        el = create(item);
        el.setAttribute('data-id', item.id);
        if (signature) el.setAttribute('data-shape', signature(item));
        cache.set(item.id, el);
      }
      if (el.parentNode !== g.layer) g.layer.appendChild(el);
      update(el, item);
      alive.add(item.id);
    }));
    cache.forEach((el, id) => {
      if (!alive.has(id)) { el.remove(); cache.delete(id); }
    });
    groups.forEach(g => g.items.forEach((item, i) => {
      const el = cache.get(item.id);
      if (g.layer.children[i] !== el) g.layer.insertBefore(el, g.layer.children[i] || null);
    }));
  }

  /* ----------------------------------------------------------- Geräte */

  function createNode(d) {
    const shape = C.shapeOf(d.type);
    const g = svgEl('g', { class: 'node' });
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.addEventListener('keydown', e => {
      const id = g.getAttribute('data-id');
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); e.stopPropagation(); S.select(id);
        if (e.key === 'Enter') NWT.Dialogs.editDevice(id);
      } else if (e.key.indexOf('Arrow') === 0 && !S.selection.has(id)) S.select(id);
    });
    if (shape === 'text') {
      g.classList.add('node-text');
      g.appendChild(svgEl('rect', { class: 'node-hit', fill: 'transparent', x: 0, y: 0 }));
      g.appendChild(svgEl('rect', { class: 'node-halo', rx: 8 }));
      g.appendChild(svgEl('text', { class: 'nt-body' }));
      /* Kein Ziehgriff: die Kachel folgt dem Text, nicht umgekehrt. */
    } else if (shape === 'note') {
      g.classList.add('node-note');
      g.appendChild(svgEl('rect', { class: 'node-halo', rx: 10 }));
      g.appendChild(svgEl('path', { class: 'note-box' }));
      g.appendChild(svgEl('text', { class: 'nt-body' }));
      g.appendChild(svgEl('rect', { class: 'node-handle', width: 12, height: 12, rx: 3 }));
    } else if (shape === 'junction') {
      g.classList.add('node-junction');
      /* Großzügige Trefferfläche: der sichtbare Punkt ist zu klein
         zum Greifen. */
      g.appendChild(svgEl('circle', { class: 'node-hit', fill: 'transparent', r: 13,
                                      cx: C.JUNCTION / 2, cy: C.JUNCTION / 2 }));
      g.appendChild(svgEl('circle', { class: 'node-halo', r: 12,
                                      cx: C.JUNCTION / 2, cy: C.JUNCTION / 2 }));
      g.appendChild(svgEl('circle', { class: 'junction-dot', r: C.JUNCTION / 2 - 2.5,
                                      cx: C.JUNCTION / 2, cy: C.JUNCTION / 2 }));
    } else if (shape === 'shape') {
      g.classList.add('node-decor');
      /* Trefferfläche getrennt vom sichtbaren Pfad: ein Rahmen ohne
         Füllung wäre sonst nur auf der Linie selbst anklickbar. */
      g.appendChild(svgEl('rect', { class: 'node-hit', fill: 'transparent', x: 0, y: 0 }));
      g.appendChild(svgEl('rect', { class: 'node-halo', rx: 8 }));
      g.appendChild(svgEl('path', { class: 'decor-shape' }));
      g.appendChild(svgEl('path', { class: 'decor-tip' }));
      g.appendChild(svgEl('text', { class: 'decor-label' }));
      g.appendChild(svgEl('rect', { class: 'node-handle', width: 12, height: 12, rx: 3 }));
    } else {
      g.appendChild(svgEl('rect', { class: 'node-halo', x: -5, y: -5, width: C.NODE_W + 10, height: C.NODE_H + 10, rx: 14 }));
      g.appendChild(svgEl('rect', { class: 'node-box', x: 0, y: 0, width: C.NODE_W, height: C.NODE_H, rx: 10 }));
      g.appendChild(svgEl('rect', { class: 'node-accent', x: 12, y: 0, width: C.NODE_W - 24, height: 3.5, rx: 1.75 }));
      /* Bildstreifen: Foto/Typbild als <image>, Hardware-Ansicht als <use>. */
      g.appendChild(svgEl('image', {
        class: 'node-photo', x: 6, y: 6, width: C.NODE_W - 12, height: C.PHOTO_H - 10,
        preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#clip-node-photo)'
      }));
      g.appendChild(svgEl('use', {
        class: 'node-hw', x: 6, y: 6, width: C.NODE_W - 12, height: C.PHOTO_H - 10,
        'clip-path': 'url(#clip-node-photo)'
      }));
      const body = svgEl('g', { class: 'node-body' });
      body.appendChild(svgEl('use', { class: 'node-icon', x: C.NODE_W / 2 - 13, y: 13, width: 26, height: 26 }));
      body.appendChild(svgEl('image', {
        class: 'node-icon-img', x: C.NODE_W / 2 - 14, y: 12, width: 28, height: 28,
        preserveAspectRatio: 'xMidYMid meet'
      }));
      body.appendChild(svgEl('text', { class: 'node-name', x: C.NODE_W / 2, y: 55 }));
      body.appendChild(svgEl('text', { class: 'node-type', x: C.NODE_W / 2, y: 68 }));
      body.appendChild(svgEl('text', { class: 'node-ip', x: C.NODE_W / 2, y: 81 }));
      g.appendChild(body);
      g.appendChild(svgEl('circle', { class: 'node-status', cx: C.NODE_W - 13, cy: 13, r: 4.5 }));
    }
    return g;
  }

  /** Lage und Drehung einer Kachel. Auch moveNode() geht hierüber. */
  function nodeTransform(d) {
    const base = 'translate(' + d.x + ' ' + d.y + ')';
    const rot = Number(d.rot) || 0;
    if (!rot || C.shapeOf(d.type) !== 'shape') return base;
    const r = S.deviceRect(d);
    return base + ' rotate(' + rot + ' ' + (r.w / 2) + ' ' + (r.h / 2) + ')';
  }

  function placeHandle(g, r) {
    const h = g.querySelector('.node-handle');
    if (h) { h.setAttribute('x', r.w - 6); h.setAttribute('y', r.h - 6); }
  }

  /**
   * Schrift auf ein <text> legen. Als Inline-Stil, nicht als Attribut:
   * eine Regel in styles.css würde ein Präsentationsattribut
   * überstimmen, ein Inline-Stil schlägt sie.
   *
   * Die Farbe wird nur gesetzt, wenn der Anwender eine gewählt hat —
   * sonst bleibt die des Designs, und ein Wechsel ins Dunkle ergibt
   * keine schwarze Schrift auf schwarzem Grund.
   */
  function applyTextStyle(el, d, fallbackColor) {
    const ts = NWT.Decor.textStyle(d);
    el.style.fontFamily = ts.family;
    el.style.fontSize = ts.size + 'px';
    el.style.fontWeight = ts.weight;
    el.style.fontStyle = ts.italic ? 'italic' : 'normal';
    el.style.textAnchor = ts.align;
    const color = ts.color || fallbackColor || '';
    if (color) el.style.fill = color;
    else el.style.removeProperty('fill');
    return ts;
  }

  /**
   * Kachelmaße eines Textfelds aus dem tatsächlich gesetzten Text.
   * Schreibt ins Modell zurück, damit Ankerpunkte, Auswahlrechteck und
   * Export dieselbe Größe sehen wie das Auge.
   */
  function fitTextBox(d, tx, ts) {
    let w;
    try { w = tx.getBBox().width; } catch (e) { return; }   /* unsichtbar */
    const nw = Math.max(40, Math.round(w + 14));
    const nh = Math.max(22, Math.round(ts.size * 1.9));
    if (Math.abs((d.w || 0) - nw) > 1) d.w = nw;
    if (Math.abs((d.h || 0) - nh) > 1) d.h = nh;
  }

  /** x-Lage einer Zeile aus der Ausrichtung, mit Innenabstand. */
  function anchorX(align, w, pad) {
    return align === 'start' ? pad : align === 'end' ? w - pad : w / 2;
  }

  function updateNode(g, d) {
    g.setAttribute('aria-label', mask('name', d.name || C.typeLabel(d.type), d) + ' – Enter: Eigenschaften, Leertaste: auswählen');
    const t = C.type(d.type);
    const shape = C.shapeOf(d.type);
    const r = S.deviceRect(d);
    g.setAttribute('transform', nodeTransform(d));
    g.style.color = t.color;
    g.style.display = S.isVisible(d) ? '' : 'none';
    g.classList.toggle('sel', S.selection.has(d.id));

    if (shape === 'text') {
      const tx = g.querySelector('.nt-body');
      const ts = applyTextStyle(tx, d);
      tx.textContent = mask('note', d.name || 'Beschriftung', d);
      /* Ein Textfeld ist einzeilig — seine Kachel folgt dem Text statt
         umgekehrt. Deshalb hat es keinen Ziehgriff: die Größe ergibt
         sich aus Inhalt und Schrift. */
      fitTextBox(d, tx, ts);
      const box = S.deviceRect(d);
      tx.setAttribute('x', anchorX(ts.align, box.w, 6));
      tx.setAttribute('y', box.h / 2 + ts.size * 0.35);
      const hit = g.querySelector('.node-hit');
      hit.setAttribute('width', box.w); hit.setAttribute('height', box.h);
      const halo = g.querySelector('.node-halo');
      halo.setAttribute('x', -4); halo.setAttribute('y', -4);
      halo.setAttribute('width', box.w + 8); halo.setAttribute('height', box.h + 8);
      return;
    }

    if (shape === 'note') {
      const fold = 20;
      const halo = g.querySelector('.node-halo');
      halo.setAttribute('x', -4); halo.setAttribute('y', -4);
      halo.setAttribute('width', r.w + 8); halo.setAttribute('height', r.h + 8);
      g.querySelector('.note-box').setAttribute('d',
        'M4 0 H' + (r.w - fold) + ' L' + r.w + ' ' + fold + ' V' + (r.h - 4) +
        ' a4 4 0 0 1 -4 4 H4 a4 4 0 0 1 -4 -4 V4 a4 4 0 0 1 4 -4 Z');
      const tx = g.querySelector('.nt-body');
      const ts = applyTextStyle(tx, d);
      tx.textContent = '';
      /* Umbruch und Zeilenhöhe wachsen mit der Schrift mit — sonst
         liefe größerer Text über den Zettelrand hinaus. */
      const lh = Math.round(ts.size * 1.32);
      const perLine = Math.max(6, Math.round((r.w - 18) / (ts.size * 0.54)));
      const maxLines = Math.max(1, Math.floor((r.h - 14) / lh));
      wrapText(tx, mask('note', d.name || '', d), perLine, maxLines,
               anchorX(ts.align, r.w, 10), 10 + ts.size, lh);
      placeHandle(g, r);
      return;
    }

    if (shape === 'shape') {
      updateDecor(g, d, r);
      return;
    }

    if (shape === 'junction') {
      /* Der Punkt trägt die Farbe der Leitungen, die an ihm hängen —
         so sieht man auf einen Blick, wozu der Abzweig gehört. */
      const cons = S.connectionsOf(d.id);
      const first = cons.length ? S.con(cons[0]) : null;
      g.style.color = first ? S.edgeStyle(first).color : t.color;
      return;
    }

    /* Bildstreifen ein-/ausblenden und Rumpf entsprechend verschieben. */
    const strip = S.stripFor(d);
    const photo = g.querySelector('.node-photo');
    const hw = g.querySelector('.node-hw');
    const body = g.querySelector('.node-body');
    const box = g.querySelector('.node-box');
    const halo = g.querySelector('.node-halo');
    const shift = strip ? C.STRIP_SHIFT : 0;

    if (strip && strip.kind === 'image') {
      photo.setAttribute('href', strip.href);
      photo.style.display = '';
      hw.style.display = 'none';
      hw.removeAttribute('href');
    } else if (strip) {
      hw.setAttribute('href', strip.href);
      hw.style.display = '';
      photo.style.display = 'none';
      photo.removeAttribute('href');
    } else {
      photo.style.display = 'none';
      photo.removeAttribute('href');
      hw.style.display = 'none';
      hw.removeAttribute('href');
    }
    box.setAttribute('height', r.h);
    halo.setAttribute('height', r.h + 10);
    body.setAttribute('transform', shift ? 'translate(0 ' + shift + ')' : '');

    /* Symbol oder Bildsymbol (eigene Symbole können beides sein).
       Zeigt die Kachel einen Bildstreifen, entfällt das Symbol. */
    const ic = NWT.Symbols.iconFor(d.type);
    const useEl = g.querySelector('.node-icon');
    const imgEl = g.querySelector('.node-icon-img');
    if (strip) {
      useEl.style.display = 'none';
      imgEl.style.display = 'none';
      useEl.removeAttribute('href');
      imgEl.removeAttribute('href');
    } else if (ic.kind === 'image') {
      imgEl.setAttribute('href', ic.href);
      imgEl.style.display = '';
      useEl.style.display = 'none';
      useEl.removeAttribute('href');
    } else {
      useEl.setAttribute('href', ic.href);
      useEl.style.display = '';
      imgEl.style.display = 'none';
      imgEl.removeAttribute('href');
    }

    g.querySelector('.node-name').textContent = U.truncate(mask('name', d.name || t.label, d), 18);
    g.querySelector('.node-type').textContent = U.truncate(t.label, 20);
    const ipEl = g.querySelector('.node-ip');
    ipEl.textContent = U.truncate(mask('ip', d.ip || d.hostname || '', d), 20);
    const st = C.STATUS[d.status] || C.STATUS.unknown;
    const dot = g.querySelector('.node-status');
    dot.setAttribute('fill', st.color);
    dot.setAttribute('cy', strip ? C.PHOTO_H + 10 : 13);
    dot.style.display = (d.status && d.status !== 'unknown') ? '' : 'none';
  }

  /* ------------------------------------------------------- Dekoration */

  /**
   * Aussehen kommt aus Attributen, nicht aus CSS: eine Regel wie
   * `.decor-shape{fill:none}` würde jede eingestellte Füllung
   * überstimmen — und im SVG-Export ginge sie verloren.
   */
  function updateDecor(g, d, r) {
    const D = NWT.Decor;
    const st = D.styleOf(d);

    const hit = g.querySelector('.node-hit');
    hit.setAttribute('width', r.w); hit.setAttribute('height', r.h);
    const halo = g.querySelector('.node-halo');
    halo.setAttribute('x', -4); halo.setAttribute('y', -4);
    halo.setAttribute('width', r.w + 8); halo.setAttribute('height', r.h + 8);

    const path = g.querySelector('.decor-shape');
    path.setAttribute('d', D.pathFor(d, r.w, r.h));
    path.setAttribute('fill', st.fill);
    path.setAttribute('stroke', st.stroke);
    path.setAttribute('stroke-width', st.strokeWidth);
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    if (st.dash) path.setAttribute('stroke-dasharray', st.dash);
    else path.removeAttribute('stroke-dasharray');

    /* Pfeilspitzen werden gefüllt gezeichnet — als Strich bliebe bei
       dünner Linie ein hohles Dreieck übrig. */
    const tip = g.querySelector('.decor-tip');
    const tipPath = D.tipFor(d, r.w, r.h);
    if (tipPath) {
      tip.setAttribute('d', tipPath);
      tip.setAttribute('fill', st.stroke);
      tip.setAttribute('stroke', 'none');
      tip.style.display = '';
    } else {
      tip.removeAttribute('d');
      tip.style.display = 'none';
    }

    g.setAttribute('opacity', st.opacity);
    g.style.color = st.stroke;

    const label = g.querySelector('.decor-label');
    label.textContent = '';
    const text = mask('note', d.name || '', d);
    if (text) {
      const fig = D.figure(st.figure);
      const ts = applyTextStyle(label, d, st.stroke);
      const lh = Math.round(ts.size * 1.2);
      const perLine = Math.max(6, Math.round(r.w / (ts.size * 0.55)));
      /* Drei Lagen: Rahmen beschriften oben, Marker mittig, offene
         Figuren über der Linie — auf ihr läge der Text sonst. */
      const y = fig.labelTop ? ts.size + 6 : fig.closed ? r.h / 2 + ts.size * 0.35 : -8;
      wrapText(label, text, perLine, fig.closed ? 6 : 2,
               anchorX(ts.align, r.w, 10), y, lh, fig.closed && !fig.labelTop);
    }

    placeHandle(g, r);
  }

  function wrapText(textEl, str, perLine, maxLines, x, y, lh, centerV) {
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    words.forEach(w => {
      if (!cur.length) { cur = w; return; }
      if ((cur + ' ' + w).length <= perLine) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    const shown = lines.slice(0, maxLines);
    /* Abgeschnitten? Dann sagen, dass da noch mehr steht — sonst liest
       man den Zettel zu Ende, ohne es zu merken. */
    if (lines.length > maxLines) {
      const last = U.truncate(shown[maxLines - 1], Math.max(3, perLine - 1));
      shown[maxLines - 1] = /…$/.test(last) ? last : last + ' …';
    }
    /* Mehrzeilig mittig: der Block wächst sonst nur nach unten. */
    const top = centerV ? y - (shown.length - 1) * lh / 2 : y;
    shown.forEach((line, i) => {
      const ts = svgEl('tspan', { x: x, y: top + i * lh });
      ts.textContent = line;
      textEl.appendChild(ts);
    });
  }

  /* ------------------------------------------------------- Verbindungen */

  function createEdge() {
    const g = svgEl('g', { class: 'edge' });
    g.appendChild(svgEl('path', { class: 'edge-hit' }));
    g.appendChild(svgEl('path', { class: 'edge-line' }));
    g.appendChild(svgEl('circle', { class: 'edge-cap ca', r: 3 }));
    g.appendChild(svgEl('circle', { class: 'edge-cap cb', r: 3 }));
    g.appendChild(svgEl('text', { class: 'edge-port ps' }));
    g.appendChild(svgEl('text', { class: 'edge-port pt' }));
    const lab = svgEl('g', { class: 'edge-label' });
    lab.appendChild(svgEl('rect', { class: 'edge-label-bg', rx: 4 }));
    lab.appendChild(svgEl('text', { class: 'edge-label-tx' }));
    g.appendChild(lab);
    /* Stützpunkte kommen zuletzt, damit sie über der Beschriftung
       greifbar bleiben. Sichtbar sind sie nur bei Auswahl (CSS). */
    g.appendChild(svgEl('g', { class: 'edge-points' }));
    return g;
  }

  /**
   * Griffe für die Stützpunkte. Sie werden bei jedem Aufbau neu
   * gesetzt — ihre Anzahl ändert sich mit jedem eingefügten Knoten,
   * ein Diff lohnte hier nicht.
   */
  function updatePoints(g, c) {
    const host = g.querySelector('.edge-points');
    while (host.firstChild) host.removeChild(host.firstChild);
    (c.points || []).forEach((p, i) => {
      const el = svgEl('rect', { class: 'edge-point', width: 10, height: 10, rx: 2.5,
                                 x: p.x - 5, y: p.y - 5, 'data-idx': i });
      host.appendChild(el);
    });
  }

  function updateEdge(g, c) {
    const r = G.route(c);
    const A = S.dev(c.source), B = S.dev(c.target);
    const visible = r && A && B && S.isVisible(c) && S.isVisible(A) && S.isVisible(B);
    g.style.display = visible ? '' : 'none';
    if (!visible) return;

    const st = S.edgeStyle(c);
    const line = g.querySelector('.edge-line');
    const hit = g.querySelector('.edge-hit');
    line.setAttribute('d', r.d);
    hit.setAttribute('d', r.d);
    line.style.stroke = st.color;
    line.style.strokeWidth = st.width;
    line.style.strokeDasharray = st.dash || 'none';
    g.classList.toggle('sel', S.selection.has(c.id));

    const capA = g.querySelector('.ca'), capB = g.querySelector('.cb');
    capA.setAttribute('cx', r.a.x); capA.setAttribute('cy', r.a.y);
    capB.setAttribute('cx', r.b.x); capB.setAttribute('cy', r.b.y);
    capA.style.fill = st.color; capB.style.fill = st.color;
    const capR = Math.max(2.4, Math.min(4.2, st.width * 1.35));
    capA.setAttribute('r', capR); capB.setAttribute('r', capR);

    /* Beschriftung in Pfadmitte */
    const lab = g.querySelector('.edge-label');
    const txt = g.querySelector('.edge-label-tx');
    const bg = g.querySelector('.edge-label-bg');
    const primary = mask('edgelabel', c.label || c.speed || '', c);
    const secondary = c.vlan ? mask('edgelabel', 'VLAN ' + c.vlan, c) : '';
    txt.textContent = '';
    if (primary || secondary) {
      let mid = { x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 };
      try {
        const len = line.getTotalLength();
        if (len > 0) mid = line.getPointAtLength(len / 2);
      } catch (e) { /* Fallback bleibt Mittelwert */ }
      const lines = [primary, secondary].filter(Boolean);
      lines.forEach((s, i) => {
        const ts = svgEl('tspan', { x: mid.x, y: mid.y + (i - (lines.length - 1) / 2) * 11 + 3.5 });
        ts.textContent = s;
        txt.appendChild(ts);
      });
      lab.style.display = '';
      try {
        const bb = txt.getBBox();
        bg.setAttribute('x', bb.x - 5); bg.setAttribute('y', bb.y - 2.5);
        bg.setAttribute('width', bb.width + 10); bg.setAttribute('height', bb.height + 5);
      } catch (e) { bg.setAttribute('width', 0); bg.setAttribute('height', 0); }
    } else {
      lab.style.display = 'none';
    }

    updatePoints(g, c);

    /* Portbeschriftungen nahe den Endpunkten */
    placePort(g.querySelector('.ps'), line, c.sourcePort, 0);
    placePort(g.querySelector('.pt'), line, c.targetPort, 1);
  }

  function placePort(el, line, text, atEnd) {
    if (!text) { el.textContent = ''; return; }
    el.textContent = U.truncate(mask('port', text, null), 12);
    let p = null, dir = null;
    try {
      const len = line.getTotalLength();
      const d0 = atEnd ? Math.max(0, len - 26) : Math.min(len, 26);
      p = line.getPointAtLength(d0);
      const q = line.getPointAtLength(atEnd ? Math.max(0, len - 34) : Math.min(len, 34));
      dir = { x: q.x - p.x, y: q.y - p.y };
    } catch (e) { el.textContent = ''; return; }
    const horiz = Math.abs(dir.x) >= Math.abs(dir.y);
    el.setAttribute('x', p.x);
    el.setAttribute('y', p.y + (horiz ? -6 : 3));
  }

  /* ------------------------------------------------------------ Bereiche */

  function createArea() {
    const g = svgEl('g', { class: 'area' });
    g.appendChild(svgEl('rect', { class: 'area-rect', 'pointer-events': 'stroke' }));
    g.appendChild(svgEl('rect', { class: 'area-head-hit' }));
    g.appendChild(svgEl('text', { class: 'area-title' }));
    g.appendChild(svgEl('text', { class: 'area-sub' }));
    g.appendChild(svgEl('rect', { class: 'area-handle', width: 12, height: 12, rx: 3 }));
    return g;
  }

  function updateArea(g, a) {
    g.style.color = a.color;
    g.style.display = S.isVisible(a) ? '' : 'none';
    g.classList.toggle('sel', S.selection.has(a.id));
    const rect = g.querySelector('.area-rect');
    rect.setAttribute('x', a.x); rect.setAttribute('y', a.y);
    rect.setAttribute('width', a.w); rect.setAttribute('height', a.h);
    const head = g.querySelector('.area-head-hit');
    head.setAttribute('x', a.x); head.setAttribute('y', a.y);
    head.setAttribute('width', a.w); head.setAttribute('height', a.sublabel ? 38 : 26);
    const title = g.querySelector('.area-title');
    title.setAttribute('x', a.x + 12); title.setAttribute('y', a.y + 18);
    title.textContent = U.truncate(mask('areatitle', a.label, a), 40);
    const sub = g.querySelector('.area-sub');
    sub.setAttribute('x', a.x + 12); sub.setAttribute('y', a.y + 32);
    sub.textContent = U.truncate(mask('areasub', a.sublabel || '', a), 40);
    const h = g.querySelector('.area-handle');
    h.setAttribute('x', a.x + a.w - 6); h.setAttribute('y', a.y + a.h - 6);
  }

  /* ---------------------------------------------------------------- API */

  function all() {
    const P = S.project;
    sync(lAreas, P.areas, areaEls, createArea, updateArea);
    /* Dekoration liegt hinter Leitungen und Geräten — sie soll den
       Netzplan schmücken, nicht verdecken. „Im Vordergrund" hebt ein
       einzelnes Element darüber. */
    const back = [], nodes = [], front = [];
    P.devices.forEach(d => {
      if (C.shapeOf(d.type) === 'shape') (d.front ? front : back).push(d);
      else nodes.push(d);
    });
    syncGroups([
      { layer: lDeco, items: back },
      { layer: lNodes, items: nodes },
      { layer: lDecoFront, items: front }
    ], nodeEls, createNode, updateNode, d => C.shapeOf(d.type));
    sync(lEdges, P.connections, edgeEls, createEdge, updateEdge);
  }

  function selection() {
    nodeEls.forEach((el, id) => el.classList.toggle('sel', S.selection.has(id)));
    edgeEls.forEach((el, id) => el.classList.toggle('sel', S.selection.has(id)));
    areaEls.forEach((el, id) => el.classList.toggle('sel', S.selection.has(id)));
  }

  /** Schnelles Positions-Update beim Ziehen (nur transform). */
  function moveNode(id) {
    const d = S.dev(id);
    const el = nodeEls.get(id);
    if (d && el) el.setAttribute('transform', nodeTransform(d));
  }

  function moveArea(id) {
    const a = S.area(id);
    const el = areaEls.get(id);
    if (a && el) updateArea(el, a);
  }

  /** Aktualisiert alle Leitungen an den angegebenen Geräten. */
  function updateEdgesFor(deviceIds) {
    const done = new Set();
    deviceIds.forEach(devId => {
      S.connectionsOf(devId).forEach(cid => {
        if (done.has(cid)) return;
        done.add(cid);
        const el = edgeEls.get(cid), c = S.con(cid);
        if (el && c) updateEdge(el, c);
      });
    });
  }

  function updateOne(id) {
    const kind = S.kindOf(id);
    if (kind === 'device' && nodeEls.has(id)) updateNode(nodeEls.get(id), S.dev(id));
    else if (kind === 'connection' && edgeEls.has(id)) updateEdge(edgeEls.get(id), S.con(id));
    else if (kind === 'area' && areaEls.has(id)) updateArea(areaEls.get(id), S.area(id));
  }

  function flash(id) {
    const el = nodeEls.get(id);
    if (!el) return;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1400);
  }

  /* -------------------------------------------------------------- Overlay */

  function clearOverlay() { while (lOverlay.firstChild) lOverlay.removeChild(lOverlay.firstChild); }

  function overlayRect(cls) {
    const r = svgEl('rect', { class: cls, rx: 3 });
    lOverlay.appendChild(r);
    return r;
  }

  function overlayPath(cls) {
    const p = svgEl('path', { class: cls });
    lOverlay.appendChild(p);
    return p;
  }

  function nodeEl(id) { return nodeEls.get(id) || null; }

  return {
    init, all, selection, moveNode, moveArea, updateEdgesFor, updateOne, flash,
    clearOverlay, overlayRect, overlayPath, nodeEl,
    layers: () => ({ areas: lAreas, edges: lEdges, nodes: lNodes, overlay: lOverlay })
  };
})();
