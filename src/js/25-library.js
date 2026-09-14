/* ============================================================
   25 — Bildbibliothek
   Ordnet Bilddateien automatisch Gerätetypen zu — für die beim
   Bauen eingebettete Sammlung aus bilder/ ebenso wie für einen
   Ordner, den der Anwender zur Laufzeit einliest.

   Beide Wege nutzen denselben Abgleich; deshalb macht der Build
   nur das Einbetten, die Zuordnung entsteht immer hier.

   Der Abgleich rät nicht: jeder Vorschlag trägt eine Begründung
   und eine Zuverlässigkeit, und nichts wird ohne Prüfliste
   übernommen. Ein falsch zugeordnetes Gerätebild ist in einer
   Dokumentation schlimmer als gar keins.
   ============================================================ */

NWT.Library = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;
  const imageCache = new Map();
  let cachedBuilt = null, cachedCustom = null;
  function invalidate() { imageCache.clear(); }
  NWT.on('library', invalidate);
  NWT.on('customtypes', invalidate);
  NWT.on('project:replaced', invalidate);

  /* Synonyme und Produktnamen → Typkennung. Hier entsteht der
     eigentliche Nutzen: „Central_Station_3“ heißt nirgends „mb_cs3“. */
  const ALIASES = {
    mb_ecos:       ['ecos', 'esuecos', 'esu', 'ecos2', 'ecosniffer'],
    mb_cs3:        ['cs3', 'centralstation3', 'cs3plus', 'centralstationplus'],
    mb_cs2:        ['cs2', 'centralstation2', 'centralstation'],
    mb_ms2:        ['ms2', 'ms1', 'mobilestation', 'mobilestation2', 'ms2009'],
    mb_z21:        ['z21', 'roco z21', 'z21start', 'z21single'],
    mb_intellibox: ['intellibox', 'ib1', 'ib2', 'ib3', 'ibcom', 'ibbasic', 'uhlenbrock'],
    mb_dr5000:     ['dr5000', 'digikeijs', 'dr5000ib'],
    mb_mx10:       ['mx10', 'zimo', 'mx10ec'],
    mb_tams:       ['mastercontrol', 'tams', 'mc2'],
    mb_dccex:      ['dccex', 'dccpp', 'commandstation'],
    mb_booster:    ['booster', 'verstaerker', 'b4', 'poweri'],
    mb_feedback:   ['rueckmelder', 'rueckmeldemodul', 's88', 'belegtmelder', 'lissy'],
    mb_gateway:    ['loconet', 'xpressnet', 'lbserver', 'busgateway'],
    mb_throttle:   ['wlanmaus', 'multimaus', 'handregler', 'throttle', 'fred'],
    mb_pc:         ['rocrail', 'jmri', 'itrain', 'traincontroller', 'windigipet', 'steuerrechner'],

    router:        ['router', 'rt'],
    wlan_router:   ['fritzbox', 'fritz', 'speedport', 'easybox', 'wlanrouter'],
    switch:        ['switch', 'sw'],
    switch_managed:['managedswitch', 'poeswitch', 'switch24', 'switch16', 'switch8'],
    switch_l3:     ['layer3', 'l3switch', 'coreswitch'],
    firewall:      ['firewall', 'pfsense', 'opnsense', 'fw'],
    accesspoint:   ['accesspoint', 'ap', 'unifi', 'wlanap'],
    modem:         ['modem', 'dslmodem', 'kabelmodem'],
    gateway:       ['gateway', 'gw'],
    server:        ['server', 'srv'],
    nas:           ['nas', 'synology', 'qnap', 'diskstation'],
    vmserver:      ['proxmox', 'esxi', 'hyperv', 'vmhost'],
    raspberrypi:   ['raspberrypi', 'raspi', 'rpi', 'pi4', 'pi5', 'pizero'],
    jetson:        ['jetson', 'nano', 'xavier', 'orin'],
    mcu:           ['esp32', 'esp8266', 'arduino', 'mikrocontroller', 'nodemcu'],
    sensor:        ['sensor', 'shelly', 'tasmota', 'sonoff'],
    camera:        ['kamera', 'camera', 'ipcam', 'reolink'],
    netprinter:    ['drucker', 'printer', 'netzwerkdrucker'],
    plc:           ['sps', 'plc', 'simatic', 's7'],
    pc:            ['pc', 'desktop', 'workstation'],
    notebook:      ['notebook', 'laptop'],
    tablet:        ['tablet', 'ipad'],
    smartphone:    ['smartphone', 'handy', 'iphone']
  };

  /* Dateiendungen, die als Bild in Frage kommen. */
  const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;

  let runtime = [];   // zur Laufzeit eingelesene Bilder, gleiche Struktur wie die eingebauten

  /* ------------------------------------------------------- Textnormalisierung */

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '');
  }

  function baseName(filename) {
    return String(filename || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  }

  /* Zerlegt den Dateinamen in Wortteile. Ziffern bleiben erhalten —
     bei „Central_Station_2“ ist die 2 Teil des Produktnamens, nicht Beiwerk. */
  function tokens(name) {
    return baseName(name)
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .split(/[^a-zA-Z0-9äöüÄÖÜß]+/)
      .map(t => normalize(t))
      .filter(Boolean);
  }

  /* Endungen, die eine Bildvariante kennzeichnen und keine Gerätevariante. */
  const VARIANT_TOKENS = ['small', 'klein', 'gross', 'big', 'a', 'b', 'c', 'v2', 'neu', 'alt',
                          'front', 'vorne', 'rueckseite', 'hinten', 'detail', 'kopie', 'copy'];

  /* --------------------------------------------------------------- Abgleich */

  /**
   * Ordnet einen Dateinamen einem Gerätetyp zu.
   * Liefert { type, confidence: 'hoch'|'mittel'|'niedrig'|'', why, variant }.
   */
  function match(filename) {
    const norm = normalize(baseName(filename));
    const tk = tokens(filename);
    const meaningful = tk.filter(t => VARIANT_TOKENS.indexOf(t) < 0);
    const variant = tk.filter(t => VARIANT_TOKENS.indexOf(t) >= 0).join(' ');
    const none = { type: '', confidence: '', why: 'kein passender Typ gefunden', variant: variant };
    if (!norm) return none;

    /* 1. Typkennung oder Bezeichnung direkt getroffen */
    const allTypes = Object.keys(C.DEVICE_TYPES).concat(Object.keys(C.customTypes()));
    for (const id of allTypes) {
      if (norm === normalize(id)) {
        return { type: id, confidence: 'hoch', why: 'Dateiname entspricht der Typkennung', variant: variant };
      }
    }
    for (const id of allTypes) {
      const label = normalize(C.typeLabel(id));
      if (label && (norm === label || norm.indexOf(label) === 0)) {
        return { type: id, confidence: 'hoch', why: 'Dateiname entspricht der Bezeichnung', variant: variant };
      }
    }

    /* 2. Alias-Tabelle — längster Treffer gewinnt, damit „cs3“ nicht von „cs“ verdeckt wird */
    let best = null;
    Object.keys(ALIASES).forEach(id => {
      if (!C.known(id)) return;
      ALIASES[id].forEach(alias => {
        const a = normalize(alias);
        if (!a || norm.indexOf(a) < 0) return;
        if (!best || a.length > best.alias.length) best = { type: id, alias: a };
      });
    });
    if (best) {
      /* Ziffernprobe: „Central_Station_2“ darf nicht stillschweigend als CS3 durchgehen. */
      const fileDigits = (norm.match(/\d+/g) || []).join(',');
      const aliasDigits = (best.alias.match(/\d+/g) || []).join(',');
      const labelDigits = (normalize(C.typeLabel(best.type)).match(/\d+/g) || []).join(',');
      const digitsAgree = !fileDigits || !labelDigits || fileDigits.indexOf(labelDigits) >= 0 ||
                          aliasDigits === fileDigits;
      return {
        type: best.type,
        confidence: digitsAgree ? 'hoch' : 'mittel',
        why: digitsAgree
          ? 'über bekannte Bezeichnung „' + best.alias + '“'
          : 'ähnliche Bezeichnung, aber abweichende Ziffer — bitte prüfen',
        variant: variant
      };
    }

    /* 3. Unscharf: gemeinsame Wortteile mit der Bezeichnung */
    let fuzzy = null;
    allTypes.forEach(id => {
      const labelTokens = tokens(C.typeLabel(id));
      if (!labelTokens.length) return;
      let hits = 0;
      labelTokens.forEach(lt => {
        if (lt.length < 3) return;
        if (meaningful.some(t => t === lt || (t.length > 3 && lt.indexOf(t) === 0) ||
                                  (lt.length > 3 && t.indexOf(lt) === 0))) hits++;
      });
      if (!hits) return;
      const score = hits / labelTokens.length;
      if (!fuzzy || score > fuzzy.score) fuzzy = { type: id, score: score };
    });
    if (fuzzy && fuzzy.score >= 0.5) {
      return {
        type: fuzzy.type, confidence: 'niedrig',
        why: 'nur teilweise Übereinstimmung (' + Math.round(fuzzy.score * 100) + ' %) — bitte prüfen',
        variant: variant
      };
    }
    return none;
  }

  /* ------------------------------------------------------------ Bestand */

  /** Eingebaute Sammlung aus bilder/ plus zur Laufzeit eingelesene Bilder. */
  function all() {
    const built = Array.isArray(window.__NWT_IMAGE_LIBRARY__) ? window.__NWT_IMAGE_LIBRARY__ : [];
    return built.map(e => ({ name: e.name, data: e.data, source: 'eingebaut' }))
      .concat(runtime.map(e => ({ name: e.name, data: e.data, source: 'eingelesen' })));
  }

  function isEmpty() { return all().length === 0; }

  /** Alle Bilder mit ihrem Zuordnungsvorschlag. */
  function analyze() {
    return all().map(e => {
      const m = match(e.name);
      return {
        name: e.name, data: e.data, source: e.source,
        type: m.type, confidence: m.confidence, why: m.why, variant: m.variant
      };
    });
  }

  /** Bilder, die einem Typ zugeordnet würden. */
  function candidates(typeId) {
    return analyze().filter(x => x.type === typeId);
  }

  /**
   * Bild aus der Bibliothek für einen Typ — erst die Auswahl des Anwenders
   * (project.libraryPicks), sonst der sicherste automatische Treffer.
   */
  function imageFor(typeId) {
    const picks = S.project.libraryPicks || {};
    if (cachedBuilt !== window.__NWT_IMAGE_LIBRARY__ || cachedCustom !== C.customTypes()) {
      invalidate(); cachedBuilt = window.__NWT_IMAGE_LIBRARY__; cachedCustom = C.customTypes();
    }
    const key = JSON.stringify([typeId, picks[typeId] || '']);
    if (imageCache.has(key)) return imageCache.get(key);
    const list = all();
    if (picks[typeId]) {
      const chosen = list.find(e => e.name === picks[typeId]);
      const value = chosen ? chosen.data : '';
      imageCache.set(key, value); return value;
    }
    const rank = { hoch: 3, mittel: 2, niedrig: 1 };
    let best = null;
    analyze().forEach(x => {
      if (x.type !== typeId || !x.confidence) return;
      const r = rank[x.confidence] || 0;
      /* Nur sichere Treffer werden ungefragt verwendet. */
      if (r < 3) return;
      if (!best || r > best.r) best = { r: r, data: x.data };
    });
    const value = best ? best.data : '';
    imageCache.set(key, value); return value;
  }

  function pick(typeId, filename) {
    if (!S.project.libraryPicks) S.project.libraryPicks = {};
    if (filename) S.project.libraryPicks[typeId] = filename;
    else delete S.project.libraryPicks[typeId];
    S.touch();
    NWT.emit('change', { structural: true });
  }

  /* --------------------------------------------------- Ordner einlesen */

  /** Liest eine Dateiliste (Ordnerauswahl oder Ablage) ein und verkleinert sie. */
  function importFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || [])
      .filter(f => IMAGE_RE.test(f.name) || (f.type && f.type.indexOf('image/') === 0));
    if (!files.length) {
      NWT.Modal.error('In der Auswahl waren keine Bilddateien.');
      return Promise.resolve(0);
    }
    if (files.length > 400) {
      NWT.Modal.error('Es wurden ' + files.length + ' Dateien übergeben. Bitte höchstens 400 auf einmal.');
      return Promise.resolve(0);
    }

    U.toast(files.length + ' Bild(er) werden verkleinert …');
    const results = new Array(files.length);
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++, f = files[i];
        try { const res = await NWT.Images.processFile(f); results[i] = { name: f.name, data: res.dataUrl }; }
        catch (e) { results[i] = null; }
      }
    };
    return Promise.all([worker(), worker(), worker(), worker()]).then(() => {
      const good = results.filter(Boolean);
      good.forEach(entry => {
        const i = runtime.findIndex(x => x.name === entry.name);
        if (i >= 0) runtime[i] = entry; else runtime.push(entry);
      });
      const failed = results.length - good.length;
      if (failed) U.toast(failed + ' Datei(en) konnten nicht gelesen werden.', 'warn');
      NWT.emit('library');
      return good.length;
    });
  }

  function clearRuntime() {
    runtime = [];
    NWT.emit('library');
  }

  function runtimeCount() { return runtime.length; }

  /* ------------------------------------------------------- Prüfliste */

  /**
   * Zeigt alle Bilder mit ihrem Vorschlag und lässt jede Zeile ändern.
   * onlyOpen: nur Bilder ohne sichere Zuordnung.
   */
  function reviewDialog(onlyOpen) {
    const entries = analyze();
    if (!entries.length) {
      return NWT.Modal.alert({
        title: 'Keine Bilder vorhanden',
        html: '<div class="msg-body"><p>Es sind weder Bilder eingebettet noch eingelesen.</p>' +
          '<p>Legen Sie Bilder in den Ordner <code>bilder/</code> und bauen Sie mit ' +
          '<code>node build.js</code> neu — oder lesen Sie einen Ordner über ' +
          '<b>Bildordner einlesen …</b> ein.</p></div>'
      });
    }

    const shown = onlyOpen ? entries.filter(e => e.confidence !== 'hoch') : entries;
    const opts = typeOptionsGrouped();
    const state = shown.map(e => ({ name: e.name, type: e.type, use: !!e.type }));

    const rows = shown.map((e, i) => {
      const tag = e.confidence === 'hoch' ? '<span class="tag tag-new">hoch</span>'
        : e.confidence === 'mittel' ? '<span class="tag tag-warn">mittel</span>'
        : e.confidence === 'niedrig' ? '<span class="tag tag-warn">niedrig</span>'
        : '<span class="tag tag-known">offen</span>';
      return '<tr>' +
        '<td><input type="checkbox" data-lib-use="' + i + '"' + (e.type ? ' checked' : '') + '></td>' +
        '<td><img class="lib-thumb" src="' + U.escapeHtml(e.data) + '" alt=""></td>' +
        '<td><div class="lib-file">' + U.escapeHtml(e.name) + '</div>' +
          '<div class="why">' + U.escapeHtml(e.source) +
          (e.variant ? ' · Variante ' + U.escapeHtml(e.variant) : '') + '</div></td>' +
        '<td><select data-lib-type="' + i + '">' +
          '<option value="">— nicht zuordnen —</option>' +
          buildTypeOptions(opts, e.type) + '</select></td>' +
        '<td>' + tag + '<div class="why">' + U.escapeHtml(e.why) + '</div></td>' +
      '</tr>';
    }).join('');

    return NWT.Modal.open({
      title: 'Bilder zuordnen',
      subtitle: shown.length + ' von ' + entries.length + ' Bildern' +
        (onlyOpen ? ' · nur unsichere und offene' : ''),
      width: '960px',
      bodyHtml:
        '<div class="lib-review">' +
          '<table class="dash-table wide"><thead><tr>' +
            '<th></th><th>Bild</th><th>Datei</th><th>Gerätetyp</th><th>Zuordnung</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table>' +
          '<div class="dash-note">Übernommen werden nur angehakte Zeilen. Die Zuordnung wird als ' +
          'Auswahl gespeichert, die Bilddaten bleiben in der Bibliothek — die Projektdatei wächst ' +
          'dadurch nicht.</div>' +
        '</div>',
      buttons: [
        { label: onlyOpen ? 'Alle Bilder zeigen' : 'Nur unsichere zeigen', value: { __toggle: true }, left: true },
        { label: 'Abbrechen', value: null },
        {
          label: 'Zuordnung übernehmen', primary: true,
          onClick: (api) => {
            state.forEach((s, i) => {
              const cb = api.root.querySelector('[data-lib-use="' + i + '"]');
              const sel = api.root.querySelector('[data-lib-type="' + i + '"]');
              s.use = cb ? cb.checked : false;
              s.type = sel ? sel.value : '';
            });
            return { picks: state.filter(s => s.use && s.type) };
          }
        }
      ],
      onMount: (root) => {
        /* Häkchen automatisch setzen, sobald ein Typ gewählt wird. */
        root.querySelectorAll('[data-lib-type]').forEach(sel => {
          sel.addEventListener('change', () => {
            const cb = root.querySelector('[data-lib-use="' + sel.getAttribute('data-lib-type') + '"]');
            if (cb) cb.checked = !!sel.value;
          });
        });
      }
    }).then(res => {
      if (!res) return null;
      if (res.__toggle) return reviewDialog(!onlyOpen);

      NWT.History.record('Bilder zuordnen');
      if (!S.project.libraryPicks) S.project.libraryPicks = {};
      res.picks.forEach(p => { S.project.libraryPicks[p.type] = p.name; });
      S.touch();
      NWT.emit('change', { structural: true });
      U.toast(res.picks.length + ' Zuordnung(en) übernommen', 'ok');
      return res.picks.length;
    });
  }

  function buildTypeOptions(opts, selected) {
    let out = '';
    let current = null;
    opts.forEach(o => {
      const g = o.group || '';
      if (g !== current) {
        if (current !== null) out += '</optgroup>';
        out += '<optgroup label="' + U.escapeHtml(g) + '">';
        current = g;
      }
      out += '<option value="' + U.escapeHtml(o.value) + '"' +
        (o.value === selected ? ' selected' : '') + '>' + U.escapeHtml(o.label) + '</option>';
    });
    if (current !== null) out += '</optgroup>';
    return out;
  }

  /** Gerätetypen als nach Kategorie gruppierte Auswahloptionen. */
  function typeOptionsGrouped() {
    const out = [];
    C.CATEGORIES.forEach(cat => {
      C.typesIn(cat.id).forEach(id =>
        out.push({ value: id, label: C.typeLabel(id), group: cat.label }));
    });
    return out;
  }

  return {
    ALIASES, match, normalize, tokens,
    all, isEmpty, analyze, candidates, imageFor, pick,
    importFiles, clearRuntime, runtimeCount, reviewDialog, typeOptionsGrouped
  };
})();
