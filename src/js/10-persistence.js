/* ============================================================
   10 — Persistenz: localStorage, Projektliste, Autosave
   ============================================================ */

NWT.Persistence = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const Model = NWT.Model;

  const K_INDEX = 'nwt.index';
  const K_PREFIX = 'nwt.project.';
  const K_AUTOSAVE = 'nwt.autosave';
  const K_PREFS = 'nwt.prefs';

  let dirty = false, lastSaved = '', failure = '', revision = 0;
  function status() { return { dirty: dirty, lastSaved: lastSaved, failure: failure, revision: revision }; }
  function publish() { NWT.emit('storage:status', status()); }
  function markDirty() { dirty = true; revision++; publish(); }
  function markSaved(recordTime) { dirty = false; failure = ''; lastSaved = recordTime === false ? '' : U.nowIso(); publish(); }

  function available() {
    try {
      const probe = '__nwt_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  function warnUnavailable() {
    NWT.Modal.alert({
      title: 'Browser-Speicher nicht verfügbar',
      html: '<div class="msg-body"><p>Dieser Browser erlaubt keinen Zugriff auf <code>localStorage</code> ' +
            '(z. B. im privaten Modus oder bei geblockten Website-Daten).</p>' +
            '<p>Speichern und automatische Sicherung sind deaktiviert. ' +
            'Nutzen Sie stattdessen <b>Export</b>, um das Projekt als JSON-Datei zu sichern.</p></div>'
    });
  }

  function readIndex() {
    try {
      const raw = window.localStorage.getItem(K_INDEX);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) throw new Error('Ungültiger Index');
      return list.filter(e => e && typeof e.id === 'string' && typeof e.name === 'string');
    } catch (e) {
      const recovered = [];
      try {
        Object.keys(localStorage).filter(k => k.startsWith(K_PREFIX)).forEach(k => {
          try {
            const p = JSON.parse(localStorage.getItem(k));
            const meta = projectMeta(k.slice(K_PREFIX.length), String(p.name || 'Wiederhergestellt'), p);
            recovered.push(meta);
          } catch (err) { /* Einzelne beschädigte Projekte beeinflussen die übrigen nicht. */ }
        });
        writeIndex(recovered);
      } catch (err) { /* Lesen bleibt auch bei erschöpfter Schreibquote erlaubt. */ }
      return recovered;
    }
  }

  function writeIndex(list) {
    window.localStorage.setItem(K_INDEX, JSON.stringify(list));
  }

  function handleQuota(e) {
    failure = 'Speichern fehlgeschlagen — bitte JSON exportieren'; publish();
    const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    NWT.Modal.alert({
      title: quota ? 'Speicherplatz erschöpft' : 'Speichern fehlgeschlagen',
      html: '<div class="msg-body"><p>' +
        (quota
          ? 'Der Browser-Speicher ist voll. Löschen Sie nicht mehr benötigte Projekte in der Ladeliste.'
          : 'Das Projekt konnte nicht im Browser gespeichert werden.') +
        '</p><p>Das Projekt lässt sich weiterhin über <b>Export → Projekt als JSON</b> sichern.</p>' +
        (e && e.message ? '<p><code>' + U.escapeHtml(e.message) + '</code></p>' : '') + '</div>'
    });
    return false;
  }

  function projectMeta(id, name, data) {
    return {
      id: id, name: name,
      saved: U.nowIso(),
      devices: data.devices.length,
      connections: data.connections.length
    };
  }

  /** Speichert das aktuelle Projekt unter einem Namen. */
  function saveProject(name) {
    const P = S.project;
    name = String(name || '').trim();
    if (!name) return false;
    const data = Model.serialize(P);
    data.name = name;

    const index = readIndex();
    let entry = index.find(e => e.name === name);
    const id = entry ? entry.id : (U.slugify(name) + '_' + Date.now().toString(36));

    let previous = null;
    const meta = projectMeta(id, name, data);
    if (entry) Object.assign(entry, meta);
    else index.push(meta);
    index.sort((a, b) => (b.saved || '').localeCompare(a.saved || ''));
    try {
      previous = window.localStorage.getItem(K_PREFIX + id);
      window.localStorage.setItem(K_PREFIX + id, JSON.stringify(data));
      try { writeIndex(index); }
      catch (err) {
        if (previous === null) window.localStorage.removeItem(K_PREFIX + id);
        else window.localStorage.setItem(K_PREFIX + id, previous);
        throw err;
      }
    } catch (e) {
      return handleQuota(e);
    }

    P.name = name;
    P.info.modified = data.info.modified;
    markSaved();
    if (NWT.Recovery) NWT.Recovery.capture('Manuell gespeichert').catch(() => {});
    NWT.emit('project:meta');
    return true;
  }

  function listProjects() { return readIndex(); }

  function loadProject(id) {
    const raw = window.localStorage.getItem(K_PREFIX + id);
    if (!raw) throw new Error('Das gespeicherte Projekt wurde nicht gefunden.');
    const result = Model.validate(JSON.parse(raw));
    return result;
  }

  function deleteProject(id) {
    try {
      const list = readIndex();
      writeIndex(list.filter(e => e.id !== id));
      try { window.localStorage.removeItem(K_PREFIX + id); }
      catch (e) { writeIndex(list); throw e; }
      failure = ''; publish();
      return true;
    } catch (e) { return handleQuota(e); }
  }

  /* ------------------------------------------------------------ Autosave */

  const autosave = U.debounce(function () {
    try {
      window.localStorage.setItem(K_AUTOSAVE, JSON.stringify(Model.serialize(S.project)));
      NWT.emit('ui:autosaved');
      failure = ''; lastSaved = U.nowIso(); publish();
      if (NWT.Recovery) NWT.Recovery.capture('Automatische Sicherung', true).catch(() => {});
    } catch (e) {
      failure = 'Automatische Sicherung fehlgeschlagen — bitte JSON exportieren'; publish();
      if (NWT.Recovery) NWT.Recovery.capture('Sicherung bei Speicherfehler').catch(() => {});
    }
  }, 900);

  function hasAutosave() {
    try { return !!window.localStorage.getItem(K_AUTOSAVE); } catch (e) { return false; }
  }

  function restoreAutosave() {
    try {
      const raw = window.localStorage.getItem(K_AUTOSAVE);
      if (!raw) return null;
      return Model.validate(JSON.parse(raw));
    } catch (e) {
      console.warn('[NWT] Automatische Sicherung unbrauchbar.', e);
      return null;
    }
  }

  function clearAutosave() {
    try { window.localStorage.removeItem(K_AUTOSAVE); } catch (e) { /* egal */ }
  }

  function init() {
    /* Jede inhaltliche Änderung stößt die verzögerte Sicherung an. */
    NWT.on('change', payload => {
      if (payload && payload.viewOnly) return;
      markDirty();
      autosave();
    });
    NWT.on('view', autosave);
    window.addEventListener('beforeunload', e => {
      autosave.flush();
      if (dirty && failure) { e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) autosave.flush(); });
    window.addEventListener('storage', e => {
      if (e.key === K_AUTOSAVE && dirty) { failure = 'Anderes Fenster hat gesichert — eigene Änderungen bitte als JSON exportieren'; publish(); }
    });
  }

  /* --------------------------------------------------- Benutzereinstellungen
     Bedienvorlieben (z. B. Hinweisfenster) gehören zum Arbeitsplatz, nicht zum
     Projekt — sie werden getrennt abgelegt und nicht mit exportiert. */

  let prefsCache = null;

  function readPrefs() {
    if (prefsCache) return prefsCache;
    prefsCache = {};
    {
      try {
        const raw = window.localStorage.getItem(K_PREFS);
        const obj = raw ? JSON.parse(raw) : null;
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) prefsCache = obj;
      } catch (e) {
        console.warn('[NWT] Benutzereinstellungen unlesbar, Standardwerte werden verwendet.', e);
      }
    }
    return prefsCache;
  }

  const Prefs = {
    get(key, fallback) {
      const p = readPrefs();
      return Object.prototype.hasOwnProperty.call(p, key) ? p[key] : fallback;
    },
    set(key, value) {
      const p = readPrefs();
      p[key] = value;
      try { window.localStorage.setItem(K_PREFS, JSON.stringify(p)); }
      catch (e) { /* Vorlieben sind entbehrlich — keine Meldung nötig */ }
    }
  };

  return {
    init, available, saveProject, listProjects, loadProject, deleteProject,
    hasAutosave, restoreAutosave, clearAutosave, autosave, warnUnavailable, Prefs,
    status, markDirty, markSaved
  };
})();

NWT.Prefs = NWT.Persistence.Prefs;
