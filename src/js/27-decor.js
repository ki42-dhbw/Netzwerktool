/* ============================================================
   27 — Text und Dekoration: Schrift, Rahmen, Kreise, Pfeile

   Jede Figur ist eine reine Funktion (w, h) → Pfaddaten. Damit
   bleibt die Form die einzige Stelle, die Geometrie kennt; Render,
   Dialog und Export greifen nur darauf zu. Ebenso ist textStyle()
   die einzige Stelle, die über Schriftart, Größe und Farbe eines
   Textes entscheidet — für Textfeld, Notiz und Formbeschriftung.

   Dekoration ist kein Netzobjekt: Sie zählt nicht als Gerät, hat
   keine Ports und lässt sich nicht verbinden.
   ============================================================ */

NWT.Decor = (function () {

  /* Rundung eines abgerundeten Rechtecks — nie mehr als die halbe
     kürzere Seite, sonst überschlägt sich der Pfad. */
  function corner(w, h) { return Math.min(18, w / 2, h / 2); }

  function rect(w, h) {
    return 'M0 0 H' + w + ' V' + h + ' H0 Z';
  }

  function round(w, h) {
    const r = corner(w, h);
    return 'M' + r + ' 0 H' + (w - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + w + ' ' + r +
           ' V' + (h - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (w - r) + ' ' + h +
           ' H' + r + ' A' + r + ' ' + r + ' 0 0 1 0 ' + (h - r) +
           ' V' + r + ' A' + r + ' ' + r + ' 0 0 1 ' + r + ' 0 Z';
  }

  function ellipse(w, h) {
    const rx = w / 2, ry = h / 2;
    return 'M0 ' + ry + ' A' + rx + ' ' + ry + ' 0 1 1 ' + w + ' ' + ry +
           ' A' + rx + ' ' + ry + ' 0 1 1 0 ' + ry + ' Z';
  }

  function diamond(w, h) {
    return 'M' + (w / 2) + ' 0 L' + w + ' ' + (h / 2) + ' L' + (w / 2) + ' ' + h + ' L0 ' + (h / 2) + ' Z';
  }

  function triangle(w, h) {
    return 'M' + (w / 2) + ' 0 L' + w + ' ' + h + ' L0 ' + h + ' Z';
  }

  function hexagon(w, h) {
    const q = Math.min(w / 4, h / 2);
    return 'M' + q + ' 0 H' + (w - q) + ' L' + w + ' ' + (h / 2) + ' L' + (w - q) + ' ' + h +
           ' H' + q + ' L0 ' + (h / 2) + ' Z';
  }

  function star(w, h) {
    const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const f = i % 2 ? 0.42 : 1;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push(round2(cx + Math.cos(a) * rx * f) + ' ' + round2(cy + Math.sin(a) * ry * f));
    }
    return 'M' + pts.join(' L') + ' Z';
  }

  /* Linie und Pfeile liegen waagerecht auf halber Höhe. Andere
     Richtungen entstehen über den Drehwinkel — ein Zahlenfeld
     statt vier fast gleicher Figuren. */
  function line(w, h) {
    return 'M0 ' + (h / 2) + ' H' + w;
  }

  function headSize(w, h, sw) {
    return Math.max(6, Math.min(h / 2, w / 3, 5 + sw * 2.6));
  }

  function arrow(w, h, sw) {
    const s = headSize(w, h, sw);
    return 'M0 ' + (h / 2) + ' H' + (w - s * 1.5);
  }

  function arrow2(w, h, sw) {
    const s = headSize(w, h, sw);
    return 'M' + (s * 1.5) + ' ' + (h / 2) + ' H' + (w - s * 1.5);
  }

  /* Spitzen werden gefüllt gezeichnet, nicht als Strich — sonst
     bliebe bei dünner Linie ein hohles Dreieck übrig. */
  function arrowTip(w, h, sw) {
    const s = headSize(w, h, sw), cy = h / 2;
    return 'M' + w + ' ' + cy + ' L' + (w - s * 1.7) + ' ' + (cy - s) + ' L' + (w - s * 1.7) + ' ' + (cy + s) + ' Z';
  }

  function arrow2Tip(w, h, sw) {
    const s = headSize(w, h, sw), cy = h / 2;
    return arrowTip(w, h, sw) +
           ' M0 ' + cy + ' L' + (s * 1.7) + ' ' + (cy - s) + ' L' + (s * 1.7) + ' ' + (cy + s) + ' Z';
  }

  /* Geschweifte Klammer, Spitze links auf halber Höhe. */
  function bracket(w, h) {
    const k = Math.min(w, h / 4), m = h / 2;
    return 'M' + w + ' 0' +
           ' C' + (w - k) + ' 0 ' + (w / 2) + ' ' + (k * 0.15) + ' ' + (w / 2) + ' ' + k +
           ' L' + (w / 2) + ' ' + (m - k * 0.6) +
           ' C' + (w / 2) + ' ' + (m - k * 0.15) + ' ' + (w / 3) + ' ' + m + ' 0 ' + m +
           ' C' + (w / 3) + ' ' + m + ' ' + (w / 2) + ' ' + (m + k * 0.15) + ' ' + (w / 2) + ' ' + (m + k * 0.6) +
           ' L' + (w / 2) + ' ' + (h - k) +
           ' C' + (w / 2) + ' ' + (h - k * 0.15) + ' ' + (w - k) + ' ' + h + ' ' + w + ' ' + h;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  /* closed: kann gefüllt werden. Offene Figuren (Linie, Pfeil,
     Klammer) setzen die Beschriftung darüber, damit sie nicht auf der
     Linie liegt.
     labelTop: Rechtecke sind Rahmen um etwas — ihre Beschriftung
     gehört wie bei einem Bereich nach oben, mittig verschwände sie
     hinter dem, was sie einrahmen. Marker wie Kreis, Raute oder Stern
     tragen sie dagegen in der Mitte. */
  const FIGURES = {
    rect:     { label: 'Rechteck',        closed: true,  path: rect,  labelTop: true },
    round:    { label: 'Abgerundet',      closed: true,  path: round, labelTop: true },
    ellipse:  { label: 'Ellipse / Kreis', closed: true,  path: ellipse },
    diamond:  { label: 'Raute',           closed: true,  path: diamond },
    triangle: { label: 'Dreieck',         closed: true,  path: triangle },
    hexagon:  { label: 'Sechseck',        closed: true,  path: hexagon },
    star:     { label: 'Stern',           closed: true,  path: star },
    line:     { label: 'Linie',           closed: false, path: line },
    arrow:    { label: 'Pfeil',           closed: false, path: arrow,  tip: arrowTip },
    arrow2:   { label: 'Doppelpfeil',     closed: false, path: arrow2, tip: arrow2Tip },
    bracket:  { label: 'Geschweifte Klammer', closed: false, path: bracket }
  };

  const DEFAULT_STROKE = '#64748b';   // trägt in hellem wie dunklem Design

  /* ------------------------------------------------------- Schrift */

  /**
   * Schriftfamilien als feste Auswahl, nicht als freie Eingabe: Der
   * Anwender wählt einen Schlüssel, das Programm setzt den Stapel.
   * Eine freie Eingabe wäre ein CSS-Wert aus fremder Hand — und in
   * einer importierten Projektdatei nicht mehr vertrauenswürdig.
   *
   * Alles sind Systemschriften mit Rückfallkette. Eine Schriftdatei
   * mitzuliefern verbietet die Einzeldatei-Auslieferung ebenso wie
   * die Lizenzlage; ein Verweis ins Netz die Offline-Anforderung.
   */
  const FONTS = {
    sans:   { label: 'Serifenlos (Standard)', css: '"Segoe UI", Inter, system-ui, sans-serif' },
    serif:  { label: 'Serifen',               css: 'Georgia, "Times New Roman", Times, serif' },
    mono:   { label: 'Feste Breite',          css: 'Consolas, "SF Mono", "Courier New", monospace' },
    narrow: { label: 'Schmal',                css: '"Arial Narrow", "Liberation Sans Narrow", "Segoe UI", sans-serif' }
  };

  /* Vorgaben je Bauform — dieselben Werte wie in styles.css. Steht ein
     Wert am Element, schlägt er die Vorgabe; „zurücksetzen" heißt
     löschen, wie bei Leitungen und Bildern auch. */
  const TEXT_DEFAULTS = {
    text:  { font: 'sans', size: 15, weight: 600, align: 'middle' },
    note:  { font: 'sans', size: 11, weight: 400, align: 'start' },
    shape: { font: 'sans', size: 13, weight: 600, align: 'middle' }
  };

  function fontOptions() {
    return Object.keys(FONTS).map(id => ({ value: id, label: FONTS[id].label }));
  }

  const ALIGNS = [
    { value: 'start',  label: 'linksbündig' },
    { value: 'middle', label: 'zentriert' },
    { value: 'end',    label: 'rechtsbündig' }
  ];

  /** Wirksame Textdarstellung eines Text-, Notiz- oder Grafikelements. */
  function textStyle(d) {
    const base = TEXT_DEFAULTS[NWT.Catalog.shapeOf(d.type)] || TEXT_DEFAULTS.shape;
    const size = Number(d.fontSize);
    return {
      font: FONTS[d.font] ? d.font : base.font,
      family: (FONTS[d.font] || FONTS[base.font]).css,
      size: size > 0 ? NWT.Util.clamp(size, 6, 200) : base.size,
      weight: d.bold === undefined ? base.weight : (d.bold ? 700 : 400),
      italic: !!d.italic,
      align: ALIGNS.some(a => a.value === d.align) ? d.align : base.align,
      /* Ohne eigene Farbe bleibt die des Designs — sonst stünde nach
         einem Wechsel ins dunkle Design schwarze Schrift auf schwarz. */
      color: /^#[0-9a-f]{3,8}$/i.test(String(d.color)) ? String(d.color) : ''
    };
  }

  /* Vorschlagsfarben: bewusst mitteltonig gewählt, damit eine
     Dekoration nach dem Designwechsel nicht verschwindet. */
  const PALETTE = [
    { value: '#64748b', label: 'Grau' },
    { value: '#2563eb', label: 'Blau' },
    { value: '#0d9488', label: 'Türkis' },
    { value: '#16a34a', label: 'Grün' },
    { value: '#ca8a04', label: 'Gelb' },
    { value: '#ea580c', label: 'Orange' },
    { value: '#dc2626', label: 'Rot' },
    { value: '#9333ea', label: 'Violett' }
  ];

  function figure(id) { return FIGURES[id] || FIGURES.rect; }
  function figureId(d) { return FIGURES[d && d.figure] ? d.figure : (NWT.Catalog.type(d && d.type).figure || 'rect'); }
  function isClosed(d) { return figure(figureId(d)).closed; }

  function figureOptions() {
    return Object.keys(FIGURES).map(id => ({ value: id, label: FIGURES[id].label }));
  }

  /**
   * Wirksame Darstellung eines Dekorationselements.
   * Wie bei Leitungen gilt: der Wert am Element schlägt die
   * Katalogvorgabe, und „zurücksetzen" heißt löschen.
   */
  function styleOf(d) {
    const t = NWT.Catalog.type(d.type);
    const sw = Number(d.strokeWidth);
    const id = figureId(d);
    return {
      figure: id,
      stroke: d.stroke || t.color || DEFAULT_STROKE,
      strokeWidth: sw > 0 ? Math.min(24, sw) : 2,
      dash: d.dash || '',
      /* Offene Figuren bleiben ungefüllt: Linie, Pfeil und Klammer
         sind keine Umrisse, eine Füllung ergäbe dort einen Klecks. */
      fill: figure(id).closed ? (d.fill || 'none') : 'none',
      opacity: d.opacity == null || d.opacity === '' ? 1 : NWT.Util.clamp(Number(d.opacity), 0.05, 1),
      rot: Number(d.rot) || 0
    };
  }

  function pathFor(d, w, h) {
    const st = styleOf(d);
    return figure(st.figure).path(w, h, st.strokeWidth);
  }

  function tipFor(d, w, h) {
    const st = styleOf(d);
    const f = figure(st.figure);
    return f.tip ? f.tip(w, h, st.strokeWidth) : '';
  }

  return { FIGURES, PALETTE, DEFAULT_STROKE, FONTS, ALIGNS, TEXT_DEFAULTS,
           figure, figureId, figureOptions, isClosed, styleOf, pathFor, tipFor,
           fontOptions, textStyle };
})();
