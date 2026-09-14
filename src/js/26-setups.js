/* ============================================================
   26 — Setups: benannte Einstellungssätze

   Ein Setup ist eine Momentaufnahme der Einstellungen, nicht des
   Netzplans. Damit lässt sich zwischen Szenarien umschalten —
   „Arbeiten“, „Präsentation“, „Druck“ — ohne das Projekt oder
   die Zeichnung anzufassen.

   Setups liegen in NWT.Prefs, also am Arbeitsplatz und nicht im
   Projekt. Nur so gelten sie über alle Projekte hinweg; genau
   dafür sind sie gedacht.

   Bewusst NICHT enthalten: Geräte, Verbindungen, eigene Symbole
   und Typbilder. Das erste ist Inhalt, das letzte wäre zu groß.
   ============================================================ */

NWT.Setups = (function () {
  const U = NWT.Util;
  const S = NWT.Store;

  /* Welche Projekteinstellungen ein Setup mitnimmt. Absichtlich ohne
     zoom/panX/panY — ein Setup soll den Bildausschnitt nicht verreißen. */
  /* privacy ist ein Objekt und wird deshalb kopiert, nicht zugewiesen —
     sonst teilten sich Setup und Projekt denselben Datensatz. */
  const KEYS = ['grid', 'snap', 'gridSize', 'routing', 'avoidObstacles', 'photos', 'hardware',
                'minimap', 'defaultConnType', 'privacy'];

  function all() {
    const raw = NWT.Prefs.get('setups', {});
    return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  }

  function names() { return Object.keys(all()).sort((a, b) => a.localeCompare(b, 'de')); }

  function active() { return NWT.Prefs.get('activeSetup', ''); }

  /** Aktuellen Zustand als Setup-Objekt einsammeln. */
  function capture() {
    const st = S.project.settings;
    const settings = {};
    KEYS.forEach(k => {
      if (st[k] === undefined) return;
      settings[k] = (st[k] && typeof st[k] === 'object') ? U.clone(st[k]) : st[k];
    });
    return {
      settings: settings,
      connStyles: U.clone(S.project.connStyles || {}),
      libraryPicks: U.clone(S.project.libraryPicks || {}),
      prefs: {
        tooltips: NWT.Prefs.get('tooltips', true),
        theme: NWT.Theme.get()
      },
      saved: U.nowIso()
    };
  }

  function save(name) {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Bitte einen Namen angeben.');
    if (clean.length > 60) throw new Error('Der Name ist zu lang (höchstens 60 Zeichen).');
    const list = all();
    list[clean] = capture();
    NWT.Prefs.set('setups', list);
    NWT.Prefs.set('activeSetup', clean);
    NWT.emit('setups');
    return clean;
  }

  function remove(name) {
    const list = all();
    if (!list[name]) return false;
    delete list[name];
    NWT.Prefs.set('setups', list);
    if (active() === name) NWT.Prefs.set('activeSetup', '');
    NWT.emit('setups');
    return true;
  }

  function rename(oldName, newName) {
    const clean = String(newName || '').trim();
    const list = all();
    if (!list[oldName] || !clean) return false;
    if (list[clean] && clean !== oldName) throw new Error('Ein Setup mit diesem Namen gibt es bereits.');
    list[clean] = list[oldName];
    if (clean !== oldName) delete list[oldName];
    NWT.Prefs.set('setups', list);
    if (active() === oldName) NWT.Prefs.set('activeSetup', clean);
    NWT.emit('setups');
    return true;
  }

  /** Wendet ein Setup an. Ein einziger Undo-Schritt. */
  function apply(name) {
    const setup = all()[name];
    if (!setup) return false;

    NWT.History.record('Setup „' + name + '“');
    const st = S.project.settings;
    KEYS.forEach(k => {
      const v = setup.settings && setup.settings[k];
      if (v === undefined) return;
      st[k] = (v && typeof v === 'object') ? U.clone(v) : v;
    });
    if (setup.connStyles) S.project.connStyles = U.clone(setup.connStyles);
    if (setup.libraryPicks) S.project.libraryPicks = U.clone(setup.libraryPicks);

    if (setup.prefs) {
      if (setup.prefs.tooltips !== undefined) NWT.Tooltip.setEnabled(!!setup.prefs.tooltips);
      if (setup.prefs.theme) NWT.Theme.set(setup.prefs.theme);
    }

    NWT.Prefs.set('activeSetup', name);
    S.touch();
    NWT.Viewport.apply();
    NWT.emit('change', { structural: true });
    NWT.emit('settings');
    NWT.emit('setups');
    U.toast('Setup „' + name + '“ angewendet', 'ok');
    return true;
  }

  /** Kurzbeschreibung für die Liste. */
  function describe(name) {
    const s = all()[name];
    if (!s) return '';
    const st = s.settings || {};
    const bits = [];
    bits.push(st.hardware ? 'Hardware-Ansicht' : (st.photos === false ? 'ohne Bilder' : 'Bilder'));
    bits.push(st.grid === false ? 'ohne Raster' : 'Raster');
    if (st.minimap === false) bits.push('ohne Minimap');
    if (s.prefs && s.prefs.theme && s.prefs.theme !== 'light') {
      bits.push(NWT.Theme.LABELS[s.prefs.theme] || s.prefs.theme);
    }
    if (s.prefs && s.prefs.tooltips === false) bits.push('ohne Tipps');
    if (st.privacy && st.privacy.on) bits.push('maskiert');
    const n = Object.keys(s.connStyles || {}).length;
    if (n) bits.push(n + ' eigene Verbindungsart' + (n === 1 ? '' : 'en'));
    return bits.join(' · ');
  }

  /**
   * Legt drei gebrauchsfertige Setups an, wenn noch keine da sind.
   * Sie sind ganz normale Setups — änderbar und löschbar.
   */
  function createExamples() {
    const beforeTheme = NWT.Theme.get();
    const beforeTips = NWT.Prefs.get('tooltips', true);
    const st = S.project.settings;
    const list = all();

    const make = (name, settings, prefs) => {
      list[name] = {
        settings: Object.assign({}, KEYS.reduce((o, k) => {
          o[k] = st[k]; return o;
        }, {}), settings),
        connStyles: U.clone(S.project.connStyles || {}),
        libraryPicks: U.clone(S.project.libraryPicks || {}),
        prefs: Object.assign({ tooltips: beforeTips, theme: beforeTheme }, prefs || {}),
        saved: U.nowIso()
      };
    };

    make('Arbeiten', { grid: true, snap: true, photos: true, hardware: false, minimap: true },
      { tooltips: true, theme: 'light' });
    make('Präsentation', { grid: false, snap: true, photos: true, hardware: true, minimap: false },
      { tooltips: false, theme: 'dark' });
    make('Druck', { grid: false, snap: true, photos: false, hardware: false, minimap: false },
      { tooltips: false, theme: 'light' });
    /* Für Unterlagen, die das Haus verlassen: Adressen und Namen raus,
       Struktur bleibt. */
    make('Weitergabe', { grid: false, snap: true, photos: true, hardware: false, minimap: false,
        privacy: { on: true, style: 'dots', ip: true, mac: true, host: true,
                   names: false, ports: false, labels: false, notes: false } },
      { tooltips: false, theme: 'light' });

    NWT.Prefs.set('setups', list);
    NWT.emit('setups');
    return ['Arbeiten', 'Präsentation', 'Druck', 'Weitergabe'];
  }

  return { all, names, active, capture, save, remove, rename, apply, describe, createExamples, KEYS };
})();
