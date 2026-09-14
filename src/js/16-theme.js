/* ============================================================
   16 — Design (hell / dunkel / automatisch)

   Das Design ist eine Arbeitsplatzvorliebe und liegt in
   NWT.Prefs, nicht im Projekt: wer eine JSON-Datei weitergibt,
   zwingt dem Empfänger nicht sein dunkles Design auf.

   Das Attribut wird bereits beim Einlesen dieser Datei gesetzt,
   nicht erst in init() — sonst blitzt beim Start kurz die helle
   Oberfläche auf.
   ============================================================ */

NWT.Theme = (function () {
  const MODES = ['light', 'dark', 'auto'];
  const LABELS = { light: 'Hell', dark: 'Dunkel', auto: 'Automatisch (System)' };

  let media = null;

  function stored() {
    /* NWT.Prefs liegt in 10-persistence.js und ist hier noch nicht geladen —
       deshalb einmal direkt lesen. */
    try {
      const raw = window.localStorage.getItem('nwt.prefs');
      const obj = raw ? JSON.parse(raw) : null;
      const v = obj && obj.theme;
      return MODES.indexOf(v) >= 0 ? v : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function systemDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /** Der tatsächlich wirksame Zustand: 'light' oder 'dark'. */
  function effective(mode) {
    const m = mode || get();
    return m === 'auto' ? (systemDark() ? 'dark' : 'light') : m;
  }

  function paint(mode) {
    document.documentElement.setAttribute('data-theme', effective(mode));
  }

  function get() {
    if (NWT.Prefs) return NWT.Prefs.get('theme', 'light');
    return stored();
  }

  function set(mode) {
    const m = MODES.indexOf(mode) >= 0 ? mode : 'light';
    if (NWT.Prefs) NWT.Prefs.set('theme', m);
    paint(m);
    NWT.emit('theme', m);
    NWT.emit('settings');
  }

  /** Reihum hell → dunkel → automatisch. */
  function cycle() {
    const next = MODES[(MODES.indexOf(get()) + 1) % MODES.length];
    set(next);
    return next;
  }

  function toggle() {
    set(effective() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    paint(get());
    /* Im Modus „automatisch“ auf den Systemwechsel reagieren. */
    if (window.matchMedia) {
      media = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => { if (get() === 'auto') paint('auto'); };
      if (media.addEventListener) media.addEventListener('change', onChange);
      else if (media.addListener) media.addListener(onChange);
    }
  }

  /* Sofort anwenden, noch bevor die Oberfläche steht. */
  paint(stored());

  return { init, get, set, cycle, toggle, effective, MODES, LABELS };
})();
