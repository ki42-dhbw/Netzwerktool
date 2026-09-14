/* ============================================================
   28 — Maskierung vertraulicher Angaben

   NWT.Privacy.mask(kind, text, ctx) ist die einzige Stelle, an der
   entschieden wird, ob eine Angabe unkenntlich gemacht wird. Das
   Rendering ruft sie beim Setzen jedes sichtbaren Textes auf —
   dadurch sind Zeichenfläche, Druck und Bildexport zwangsläufig
   gleich, und es kann kein Feld vergessen werden.

   Wichtig: maskiert wird der Text selbst, nicht ein Balken darüber.
   Ein Balken über echtem Text wäre in der SVG-Datei nur Deko —
   die Angabe stünde weiterhin im Quelltext.
   ============================================================ */

NWT.Privacy = (function () {
  const U = NWT.Util;

  const DEFAULTS = {
    on: false,
    style: 'dots',
    ip: true, mac: true, host: true,
    names: false, ports: false, labels: false, notes: false
  };

  const STYLES = [
    { value: 'dots',    label: 'Punkte — 192.168.1.10 wird zu •••.•••.•.••' },
    { value: 'partial', label: 'Teilweise — 192.168.x.x, Herstellerkennung der MAC bleibt' },
    { value: 'blocks',  label: 'Balken — ██████' },
    { value: 'hide',    label: 'Weglassen — die Angabe verschwindet' }
  ];

  const GROUPS = [
    { key: 'ip',     label: 'IP-Adressen und Subnetze (IPv4, IPv6)' },
    { key: 'mac',    label: 'MAC-Adressen' },
    { key: 'host',   label: 'Hostnamen und DNS-Namen' },
    { key: 'names',  label: 'Geräte- und Bereichsnamen (durch Typ + Nummer ersetzen)' },
    { key: 'ports',  label: 'Portbezeichnungen an den Leitungen' },
    { key: 'labels', label: 'Leitungsbeschriftungen (Geschwindigkeit, VLAN, Text)' },
    { key: 'notes',  label: 'Notizen und Textfelder' }
  ];

  /* Ein einziger Ausdruck über alle vier Muster. Nacheinander
     angewandte Ausdrücke würden über bereits Maskiertes laufen:
     „192.168.x.x" sähe für die Hostnamen-Suche wie ein Rechnername
     aus und würde ein zweites Mal zerlegt.
     Reihenfolge zählt — MAC vor IPv6, beide bestehen aus Hex-Gruppen
     mit Trennern. Beim Hostnamen: erste Marke mindestens zwei
     Zeichen, Endung mindestens zwei Buchstaben, sonst gälte „1.OG"
     als Rechnername. Das bleibt eine Heuristik. */
  const RE_ALL = new RegExp([
    '\\b[0-9a-f]{2}([:-])(?:[0-9a-f]{2}\\1){4}[0-9a-f]{2}\\b',
    '\\b\\d{1,3}(?:\\.\\d{1,3}){3}(?:\\/\\d{1,2})?\\b',
    '\\b(?:[0-9a-f]{1,4}:){2,7}(?::|[0-9a-f]{1,4})(?:\\/\\d{1,3})?\\b',
    '\\b[a-z0-9][a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,}\\b'
  ].join('|'), 'gi');

  const RE_IS_MAC = /^[0-9a-f]{2}([:-])(?:[0-9a-f]{2}\1){4}[0-9a-f]{2}$/i;
  const RE_IS_IP4 = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/;

  function settings() {
    const p = NWT.Store.project.settings.privacy;
    return p && typeof p === 'object' ? p : DEFAULTS;
  }

  function active() { return !!settings().on; }

  /* -------------------------------------------------- Maskierstile */

  function dotted(s) { return s.replace(/[0-9a-z]/gi, '•'); }
  function blocked(s) { return new Array(U.clamp(s.length, 3, 14) + 1).join('█'); }

  function partial(kind, s) {
    if (kind === 'ip4') {
      const m = s.match(/^(\d{1,3})\.(\d{1,3})\./);
      return m ? m[1] + '.' + m[2] + '.x.x' : dotted(s);
    }
    if (kind === 'ip6') {
      const g = s.split(':');
      return g.length > 2 ? g[0] + ':' + g[1] + ':x' : dotted(s);
    }
    if (kind === 'mac') {
      const sep = s.indexOf('-') > -1 ? '-' : ':';
      const g = s.split(sep);
      /* Die ersten drei Bytes sind die Herstellerkennung — oft genau
         die Information, die im Plan bleiben soll. */
      return g.slice(0, 3).join(sep) + sep + 'xx' + sep + 'xx' + sep + 'xx';
    }
    return s.slice(0, 2) + '…';
  }

  function token(kind, s) {
    const st = settings().style;
    if (st === 'hide') return '';
    if (st === 'blocks') return blocked(s);
    if (st === 'partial') return partial(kind, s);
    return dotted(s);
  }

  /* ------------------------------------------------ Mustersuche */

  function kindOf(m) {
    if (RE_IS_MAC.test(m)) return 'mac';
    if (RE_IS_IP4.test(m)) return 'ip4';
    return m.indexOf(':') > -1 ? 'ip6' : 'host';
  }

  /** Ein Durchlauf über alle Muster; jede Fundstelle wird genau einmal ersetzt. */
  function scan(str) {
    const o = settings();
    if (!o.ip && !o.mac && !o.host) return String(str);
    return String(str).replace(RE_ALL, m => {
      const kind = kindOf(m);
      const wanted = kind === 'mac' ? o.mac : kind === 'host' ? o.host : o.ip;
      return wanted ? token(kind, m) : m;
    });
  }

  /** Fortlaufender Ersatzname aus Typ und laufender Nummer der ID. */
  function pseudonym(d) {
    const n = String(d.id || '').replace(/^[a-z]+_0*/, '') || '1';
    return NWT.Catalog.typeLabel(d.type) + ' ' + n;
  }

  /* ------------------------------------------------------ Zugang */

  /**
   * @param kind  name | ip | port | edgelabel | note | areatitle | areasub
   * @param text  der anzuzeigende Text
   * @param ctx   Gerät bzw. Bereich, für Ersatznamen
   */
  function mask(kind, text, ctx) {
    if (!active()) return text;
    const o = settings();
    const s = text == null ? '' : String(text);
    if (!s) return s;

    if (kind === 'name') return o.names && ctx ? pseudonym(ctx) : scan(s);
    if (kind === 'areatitle') {
      if (!o.names) return scan(s);
      const n = String(ctx && ctx.id || '').replace(/^[a-z]+_0*/, '') || '1';
      return 'Bereich ' + n;
    }
    if (kind === 'note') return o.notes ? s.replace(/\S/g, '•') : scan(s);
    if (kind === 'port') return o.ports ? token('host', s) : scan(s);
    if (kind === 'edgelabel') return o.labels ? '' : scan(s);
    return scan(s);
  }

  /** Enthält der Plan überhaupt etwas, das eine Maskierung lohnt? */
  function hasSensitive() {
    return NWT.Store.project.devices.some(d => d.ip || d.ipv6 || d.mac || d.hostname);
  }

  /**
   * Führt fn() mit vorübergehend ein- oder ausgeschalteter Maskierung
   * aus und stellt danach wieder her. fn muss synchron alles lesen,
   * was es aus dem DOM braucht — der Export baut deshalb erst die
   * SVG-Zeichenkette und rechnet danach weiter.
   */
  function withMasking(on, fn) {
    const st = NWT.Store.project.settings;
    if (!st.privacy) st.privacy = Object.assign({}, DEFAULTS);
    const before = st.privacy.on;
    if (before === !!on) return fn();
    st.privacy.on = !!on;
    NWT.Render.all();
    try {
      return fn();
    } finally {
      st.privacy.on = before;
      NWT.Render.all();
    }
  }

  /**
   * Wie eine Angabe im Bild aussähe — ohne die Zeichenfläche
   * anzufassen. Für die Vorschau auf der Einstellungsseite.
   */
  function preview(text) {
    const st = NWT.Store.project.settings;
    if (!st.privacy) st.privacy = Object.assign({}, DEFAULTS);
    const before = st.privacy.on;
    st.privacy.on = true;
    try { return mask('ip', text, null); } finally { st.privacy.on = before; }
  }

  function set(key, value) {
    const st = NWT.Store.project.settings;
    if (!st.privacy) st.privacy = Object.assign({}, DEFAULTS);
    st.privacy[key] = value;
    NWT.Store.touch();
    NWT.emit('settings');
    NWT.emit('change', { structural: true });
  }

  function toggle() {
    set('on', !active());
    U.toast(active() ? 'Vertrauliche Angaben werden maskiert' : 'Maskierung aufgehoben', 'ok');
  }

  return { DEFAULTS, STYLES, GROUPS, mask, preview, active, settings, set, toggle, withMasking, hasSensitive, pseudonym };
})();
