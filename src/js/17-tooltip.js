/* ============================================================
   17 — Hinweisfenster (Tooltips), abschaltbar
   Ersetzt die nativen title-Tooltips durch eigene, inhaltlich
   reichere Fenster — auf der Zeichenfläche mit Gerätedaten.
   Der Schalter liegt in den Benutzereinstellungen, nicht im
   Projekt: er reist nicht mit einer exportierten Datei mit.
   ============================================================ */

NWT.Tooltip = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;

  const SHOW_DELAY = 420;
  const MOVE_DELAY = 120;   // schnellerer Wechsel, solange schon eins offen ist

  let box = null;
  let showTimer = null;
  let currentTarget = null;
  let enabled = true;

  /* Längere Erläuterungen für die Werkzeugleiste, nach data-act. */
  const ACTION_TIPS = {
    'new':          ['Neues Netzwerk', 'Verwirft die aktuelle Topologie und beginnt ein leeres Projekt.', 'Strg+N'],
    'save':         ['Projekt speichern', 'Legt das Projekt unter einem Namen im Browser-Speicher ab.', 'Strg+S'],
    'load':         ['Projekt laden', 'Zeigt alle im Browser gespeicherten Projekte mit Datum und Umfang.', 'Strg+O'],
    'export-menu':  ['Exportieren', 'Projekt als JSON-Datei sichern oder das Diagramm als SVG bzw. PNG ausgeben.'],
    'export-json':  ['Projekt als JSON', 'Vollständige Projektdatei mit allen Geräten, Verbindungen und Einstellungen.', 'Strg+E'],
    'export-svg':   ['Diagramm als SVG', 'Verlustfreie Vektorgrafik, beliebig skalierbar und weiterbearbeitbar.'],
    'export-png':   ['Diagramm als PNG', 'Pixelgrafik in doppelter Auflösung für Präsentationen und Berichte.'],
    'privacy':      ['Vertrauliche Angaben maskieren', 'Blendet IP-Adressen, MAC-Adressen und Hostnamen auf der Zeichenfläche aus — und damit auch in Ausdruck und Bildexport. Was genau maskiert wird, steht in den Einstellungen.'],
    'export-image': ['Als Bild speichern (maskiert)', 'Format und Größe wählen und dabei festlegen, was im Bild lesbar bleibt: IP-Adressen, MAC-Adressen, Hostnamen, Namen, Notizen. Maskiert wird der Text selbst, nicht ein Balken darüber.'],
    'import':       ['Projekt importieren', 'Liest eine zuvor exportierte JSON-Datei ein. Die Datei wird vorher geprüft.'],
    'print':        ['Drucken', 'Blendet alle Bedienelemente aus und passt das Diagramm auf die Seite ein.', 'Strg+P'],
    'mode-select':  ['Auswahlmodus', 'Markieren, verschieben und Auswahlrechteck aufziehen.', 'V'],
    'mode-connect': ['Verbindungsmodus', 'Quelle und Ziel nacheinander anklicken. Die Kette läuft weiter, bis Esc gedrückt wird.', 'C'],
    'mode-pan':     ['Hand-Werkzeug', 'Ziehen verschiebt den Bildausschnitt statt der Geräte.', 'H'],
    'undo':         ['Rückgängig', 'Nimmt den letzten Schritt zurück. Eine zusammenhängende Bewegung zählt als ein Schritt.', 'Strg+Z'],
    'redo':         ['Wiederholen', 'Stellt einen zurückgenommenen Schritt wieder her.', 'Strg+Y'],
    'zoom-in':      ['Vergrößern', 'Alternativ Strg + Mausrad — dabei bleibt der Punkt unter dem Zeiger stehen.', 'Strg++'],
    'zoom-out':     ['Verkleinern', '', 'Strg+-'],
    'zoom-reset':   ['Zoom zurücksetzen', 'Stellt die Ansicht auf 100 % ein.', 'Strg+0'],
    'zoom-fit':     ['Alles einpassen', 'Wählt Zoom und Ausschnitt so, dass das gesamte Diagramm sichtbar ist.', 'Strg+1'],
    'clear':        ['Zeichenfläche löschen', 'Entfernt nach Rückfrage alle Geräte, Verbindungen und Bereiche. Rückgängig machbar.'],
    'analysis-menu':   ['Netzwerkanalyse', 'Bestehendes Netz einlesen und das Dashboard automatisch füllen. Quellen: arp, nmap, LLDP/CDP, CSV oder das mitgelieferte Analyse-Skript.'],
    'analysis-paste':  ['Netzwerkdaten einlesen', 'Ausgabe eines Werkzeugs einfügen — das Format wird automatisch erkannt.'],
    'analysis-file':   ['Scan-Datei importieren', 'JSON des Analyse-Skripts, nmap-XML, CSV oder Textprotokoll.'],
    'analysis-script': ['Analyse-Skript', 'Fertiges Skript für Windows und Linux: erreichbare Hosts, MAC-Adressen, Namen und offene Ports.'],
    'dashboard':       ['Dashboard', 'Auswertung des Projekts: Kategorien, Status, IP-Netze, VLANs, Dokumentationsgrad.', 'Strg+Umschalt+D'],
    'settings-menu':   ['Einstellungen, Design und Setups', 'Öffnet das Menü: Einstellungsseite, Wechsel zwischen hellem und dunklem Design und die gesicherten Setups.', 'Strg+,'],
    'settings':        ['Einstellungen', 'Ansicht, Gerätedarstellung, Bildbibliothek, Verbindungsarten, Setups und Speicher — alles an einem Ort.', 'Strg+,'],
    'theme':           ['Design wechseln', 'Reihum hell, dunkel und dem System folgend. SVG-Export und Ausdruck bleiben immer hell.'],
    'setup-save':      ['Setup sichern', 'Legt die aktuellen Einstellungen unter einem Namen ab — Ansicht, Darstellung, Verbindungsarten, Design. Der Netzplan bleibt außen vor.'],
    'info':         ['Projektinformationen', 'Name, Beschreibung, Autor, Firma, Standort und Rastergröße.'],
    'help-menu':    ['Hilfe', 'Kurzübersicht mit Tastaturkürzeln, ausführliches Handbuch und Projektinformationen.', 'F1'],
    'help':         ['Hilfe', 'Kurzübersicht mit Tastaturkürzeln und Zugang zum ausführlichen Handbuch.', 'F1'],
    'handbook':     ['Ausführliches Handbuch', 'Vollständiges Handbuch mit Inhaltsverzeichnis und Volltextsuche.', 'Umschalt+F1']
  };

  const ELEMENT_TIPS = {
    'opt-grid':       ['Raster anzeigen', 'Blendet die Hilfslinien der Zeichenfläche ein oder aus.', 'G'],
    'opt-snap':       ['Am Raster ausrichten', 'Neue und verschobene Objekte rasten auf dem Raster ein.'],
    'opt-tips':       ['Hinweisfenster', 'Schaltet diese Hinweisfenster ab — dauerhaft für diesen Browser.'],
    'opt-photos':     ['Gerätefotos', 'Zeigt hinterlegte Fotos auf der Zeichenfläche. Ausgeschaltet bleiben sie im Projekt erhalten.'],
    'opt-routing':    ['Linienführung', 'Orthogonal, gerade oder gebogen. Gilt für alle Verbindungen im Projekt.'],
    'opt-conntype':   ['Art für neue Verbindungen', 'Bestimmt, welchen Typ frisch gezogene Leitungen bekommen — Ethernet, USB, 230 V und weitere. Die Auswahl schaltet zugleich in den Verbindungsmodus.', 'C'],
    'device-search':  ['Gerät suchen', 'Durchsucht Name, IP, IPv6, Hostname, MAC, Raum, Rack, Standort und VLAN.', 'Strg+F'],
    'catalog-search': ['Katalog filtern', 'Zeigt nur Komponenten, deren Bezeichnung zum Suchtext passt.'],
    'layer-add':      ['Ebene hinzufügen', 'Legt eine weitere Ebene an, etwa für eine geplante Ausbaustufe.'],
    'active-layer':   ['Zielebene', 'Bestimmt, auf welcher Ebene neu eingefügte Objekte landen.'],
    'minimap-toggle': ['Minimap', 'Klappt die Übersichtskarte ein oder aus.']
  };

  /* ------------------------------------------------------------- Aufbau */

  function init() {
    enabled = NWT.Prefs.get('tooltips', true);

    box = document.createElement('div');
    box.id = 'tooltip';
    box.setAttribute('role', 'tooltip');
    box.hidden = true;
    document.body.appendChild(box);

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    document.addEventListener('focusin', e => { if (enabled) onOver(e); });
    document.addEventListener('focusout', hide);
    NWT.on('ui:closemenus', hide);
  }

  function setEnabled(on) {
    enabled = !!on;
    NWT.Prefs.set('tooltips', enabled);
    if (!enabled) hide();
    NWT.emit('tooltips', enabled);
  }

  function isEnabled() { return enabled; }

  /* ----------------------------------------------------- Trefferauswahl */

  function suppressed() {
    if (!enabled) return true;
    if (NWT.Modal && NWT.Modal.isOpen()) return true;
    if (NWT.Interaction && NWT.Interaction.isBusy()) return true;
    const ctx = document.getElementById('contextmenu');
    if (ctx && !ctx.hidden) return true;
    return false;
  }

  /**
   * Sucht das nächstgelegene Element mit Hinweistext.
   * Native title-Attribute werden dabei einmalig übernommen, damit der
   * Browser nicht zusätzlich seinen eigenen Tooltip einblendet.
   */
  function findTarget(node) {
    let el = node;
    while (el && el.nodeType === 1 && el !== document.body) {
      if (el.hasAttribute && el.hasAttribute('title')) adoptTitle(el);
      if (el.dataset && el.dataset.tip !== undefined) return el;
      if (el.classList && (el.classList.contains('node') || el.classList.contains('edge') ||
                           el.classList.contains('area'))) return el;
      if (el.id && ELEMENT_TIPS[el.id]) return el;
      el = el.parentElement || (el.parentNode && el.parentNode.host) || null;
    }
    return null;
  }

  function adoptTitle(el) {
    const t = el.getAttribute('title');
    if (t == null) return;
    el.removeAttribute('title');
    if (!el.dataset.tip) el.dataset.tip = t;
    if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', t);
  }

  function onOver(e) {
    /* title-Attribute auch dann einsammeln, wenn Tipps aus sind —
       sonst zeigt der Browser stattdessen seine eigenen an. */
    const el = findTarget(e.target);
    if (suppressed()) { hide(); return; }
    if (!el || el === currentTarget) return;
    currentTarget = el;
    clearTimeout(showTimer);
    const delay = box.hidden ? SHOW_DELAY : MOVE_DELAY;
    showTimer = setTimeout(() => show(el), delay);
  }

  function onOut(e) {
    if (!currentTarget) return;
    const to = e.relatedTarget;
    if (to && currentTarget.contains && currentTarget.contains(to)) return;
    hide();
  }

  function hide() {
    clearTimeout(showTimer);
    showTimer = null;
    currentTarget = null;
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  /* ------------------------------------------------------------- Inhalt */

  function contentFor(el) {
    if (el.classList && el.classList.contains('node')) return deviceTip(el.getAttribute('data-id'));
    if (el.classList && el.classList.contains('edge')) return connectionTip(el.getAttribute('data-id'));
    if (el.classList && el.classList.contains('area')) return areaTip(el.getAttribute('data-id'));

    const act = el.getAttribute && el.getAttribute('data-act');
    if (act && ACTION_TIPS[act]) return simple(ACTION_TIPS[act]);
    if (el.id && ELEMENT_TIPS[el.id]) return simple(ELEMENT_TIPS[el.id]);

    const type = el.getAttribute && el.getAttribute('data-type');
    if (type && C.DEVICE_TYPES[type]) return catalogTip(type);

    const tip = el.dataset ? el.dataset.tip : '';
    if (!tip) return '';
    return '<div class="tt-title">' + U.escapeHtml(tip) + '</div>';
  }

  function simple(entry) {
    return '<div class="tt-title">' + U.escapeHtml(entry[0]) + '</div>' +
      (entry[1] ? '<div class="tt-desc">' + U.escapeHtml(entry[1]) + '</div>' : '') +
      (entry[2] ? '<div class="tt-meta"><kbd>' + U.escapeHtml(entry[2]) + '</kbd></div>' : '');
  }

  function rows(pairs) {
    const body = pairs.filter(p => p[1]).map(p =>
      '<tr><th>' + U.escapeHtml(p[0]) + '</th><td>' + U.escapeHtml(p[1]) + '</td></tr>').join('');
    return body ? '<table class="tt-rows">' + body + '</table>' : '';
  }

  function catalogTip(typeId) {
    const t = C.type(typeId);
    const cat = (C.CATEGORIES.find(c => c.id === t.cat) || {}).label || '';
    const ports = C.buildPorts(typeId);
    return '<div class="tt-title">' + U.escapeHtml(t.label) + (t.custom ? ' · eigenes Symbol' : '') + '</div>' +
      '<div class="tt-desc">Auf die Zeichenfläche ziehen — oder anklicken, um mittig einzufügen.</div>' +
      rows([
        ['Kategorie', cat],
        ['Ports', ports.length ? ports.length + ' (' + ports.slice(0, 3).map(p => p.name).join(', ') + (ports.length > 3 ? ' …' : '') + ')' : '—']
      ]) +
      (t.custom ? '<div class="tt-meta">✎ oder Doppelklick bearbeitet das Symbol</div>' : '');
  }

  function deviceTip(id) {
    const d = S.dev(id);
    if (!d) return '';
    const shape = C.shapeOf(d.type);
    if (shape === 'text' || shape === 'note') {
      const ts = NWT.Decor.textStyle(d);
      return '<div class="tt-title">' + U.escapeHtml(C.typeLabel(d.type)) + '</div>' +
        '<div class="tt-desc">' + U.escapeHtml(U.truncate(d.name, 160)) + '</div>' +
        rows([['Schrift', NWT.Decor.FONTS[ts.font].label + ' · ' + ts.size + ' px' +
                          (ts.weight >= 600 ? ' · fett' : '') + (ts.italic ? ' · kursiv' : '')]]);
    }
    if (shape === 'shape') {
      const st = NWT.Decor.styleOf(d);
      return '<div class="tt-title">' + U.escapeHtml(d.name || C.typeLabel(d.type)) + '</div>' +
        '<div class="tt-desc">' + U.escapeHtml(NWT.Decor.figure(st.figure).label) + ' · Grafikelement</div>' +
        rows([
          ['Größe', Math.round(S.deviceRect(d).w) + ' × ' + Math.round(S.deviceRect(d).h) + ' px'],
          ['Drehung', st.rot ? st.rot + '°' : ''],
          ['Lage', d.front ? 'im Vordergrund' : 'hinter dem Netz']
        ]);
    }
    if (shape === 'junction') {
      return '<div class="tt-title">' + U.escapeHtml(d.name || 'Abzweig') + '</div>' +
        '<div class="tt-desc">Knotenpunkt — kein Gerät, sondern eine Stelle im Kabel.</div>' +
        rows([
          ['Leitungen', String(S.connectionsOf(id).length)],
          ['Bemerkung', d.description]
        ]);
    }
    const st = C.STATUS[d.status] || C.STATUS.unknown;
    const layer = S.layer(d.layer);
    const place = [d.location, d.room, d.rack].filter(Boolean).join(' · ');
    const conns = S.connectionsOf(id).length;
    return (d.image ? '<img class="tt-photo" alt="" src="' + U.escapeHtml(d.image) + '">' : '') +
      '<div class="tt-title">' + U.escapeHtml(d.name) + '</div>' +
      '<div class="tt-desc">' + U.escapeHtml(C.typeLabel(d.type)) +
        (d.manufacturer || d.model ? ' · ' + U.escapeHtml([d.manufacturer, d.model].filter(Boolean).join(' ')) : '') +
      '</div>' +
      rows([
        ['Status', st.label],
        ['IP', d.ip],
        ['IPv6', d.ipv6],
        ['Hostname', d.hostname],
        ['MAC', d.mac],
        ['VLAN', d.vlan],
        ['Protokoll', d.protocol],
        ['Standort', place],
        ['System', d.os],
        ['Ebene', layer ? layer.name : ''],
        ['Ports', (d.ports || []).length ? (d.ports.length + ' Ports · ' + conns + ' verbunden') : ''],
        ['Weitere Schnittstellen', (d.interfaces || []).map(i => [i.name, i.ip || i.ipv6].filter(Boolean).join(': ')).join(' · ')],
        ['Letzte Beobachtung', (d.observations || []).length ? U.formatDate(d.observations[d.observations.length - 1].at) + ' (Momentaufnahme)' : ''],
        ['Notiz', U.truncate(d.description || d.notes || '', 90)]
      ]) +
      '<div class="tt-meta">Doppelklick öffnet die Eigenschaften' +
      (d.image ? '' : ' · Bild hierher ziehen für ein Foto') + '</div>';
  }

  function connectionTip(id) {
    const c = S.con(id);
    if (!c) return '';
    const A = S.dev(c.source), B = S.dev(c.target);
    const t = C.connType(c.type);
    const from = (A ? A.name : '?') + (c.sourcePort ? ' (' + c.sourcePort + ')' : '');
    const to = (B ? B.name : '?') + (c.targetPort ? ' (' + c.targetPort + ')' : '');
    return '<div class="tt-title">' + U.escapeHtml(c.label || t.label) + '</div>' +
      '<div class="tt-desc">' + U.escapeHtml(from) + ' &rarr; ' + U.escapeHtml(to) + '</div>' +
      rows([
        ['Typ', t.label],
        ['Kategorie', (C.CONN_CATEGORIES.find(x => x.id === (t.cat || 'misc')) || {}).label || ''],
        ['Geschwindigkeit', c.speed],
        ['VLAN', c.vlan],
        ['Darstellung', c.style ? 'eigene Farbe/Stärke' : ''],
        ['Führung', (c.points && c.points.length) ? c.points.length + ' Knoten' : 'automatisch'],
        ['Beschreibung', U.truncate(c.description || '', 90)]
      ]) +
      '<div class="tt-meta">Doppelklick öffnet die Eigenschaften · Rechtsklick setzt Knoten und Abzweige</div>';
  }

  function areaTip(id) {
    const a = S.area(id);
    if (!a) return '';
    const inside = S.project.devices.filter(d => {
      const c = S.deviceCenter(d);
      return c.x >= a.x && c.x <= a.x + a.w && c.y >= a.y && c.y <= a.y + a.h;
    }).length;
    return '<div class="tt-title">' + U.escapeHtml(a.label) + '</div>' +
      (a.sublabel ? '<div class="tt-desc">' + U.escapeHtml(a.sublabel) + '</div>' : '') +
      rows([['Enthält', inside + ' Gerät' + (inside === 1 ? '' : 'e')],
            ['Ebene', (S.layer(a.layer) || {}).name || '']]) +
      '<div class="tt-meta">Am Titel ziehen verschiebt den Bereich samt Inhalt</div>';
  }

  /* ---------------------------------------------------------- Anzeigen */

  function show(el) {
    if (suppressed() || !el.isConnected) { hide(); return; }
    const html = contentFor(el);
    if (!html) { hide(); return; }

    box.innerHTML = html;
    box.hidden = false;

    const r = el.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    const gap = 9;
    let left = r.left + r.width / 2 - w / 2;
    let top = r.bottom + gap;

    if (top + h > window.innerHeight - 6) {
      const above = r.top - h - gap;
      top = above >= 6 ? above : Math.max(6, window.innerHeight - h - 6);
    }
    left = U.clamp(left, 8, Math.max(8, window.innerWidth - w - 8));

    box.style.left = Math.round(left) + 'px';
    box.style.top = Math.round(top) + 'px';
  }

  return { init, setEnabled, isEnabled, hide };
})();
