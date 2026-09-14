/* ============================================================
   16 — Start: Initialisierung und Fehlerbehandlung
   ============================================================ */

(function () {
  const U = NWT.Util;
  const S = NWT.Store;

  let fatalShown = false;
  function fatal(message, detail) {
    console.error('[NWT]', message, detail);
    if (fatalShown) return;
    fatalShown = true;
    try {
      NWT.Modal.error('Es ist ein unerwarteter Fehler aufgetreten. ' +
        'Die zuletzt automatisch gesicherte Fassung bleibt erhalten.', detail);
    } catch (e) {
      window.alert('Unerwarteter Fehler: ' + message);
    }
    setTimeout(() => { fatalShown = false; }, 4000);
  }

  window.addEventListener('error', e => fatal(e.message, e.filename + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    fatal('Nicht behandelte Zusage', r && r.message ? r.message : String(r));
  });

  function boot() {
    try {
      NWT.Theme.init();
      NWT.Modal.init();
      NWT.Viewport.init();
      NWT.Render.init();
      NWT.Interaction.init();
      NWT.Exchange.init();
      NWT.Sidebar.init();
      NWT.Minimap.init();
      NWT.Images.init();
      NWT.Analysis.init();
      NWT.Settings.init();
      NWT.Tooltip.init();
      NWT.UI.init();
      NWT.Persistence.init();
      NWT.Recovery.init();
    } catch (e) {
      fatal('Initialisierung fehlgeschlagen', e.message);
      return;
    }

    /* Zentrale Render-Kopplung: strukturelle Änderungen zeichnen alles neu. */
    NWT.on('change', payload => {
      if (!payload || payload.structural) NWT.Render.all();
    });
    NWT.on('selection', () => NWT.Render.selection());
    NWT.on('project:replaced', () => {
      NWT.Render.clearOverlay();
      NWT.Render.all();
    });

    NWT.Catalog.setCustom(S.project.customTypes || []);
    NWT.Symbols.syncDefs();
    S.reindex();

    /* Automatisch gesicherten Stand wiederherstellen. */
    let restored = false;
    try {
      if (NWT.Persistence.hasAutosave()) {
        const result = NWT.Persistence.restoreAutosave();
        if (result) {
          S.setProject(result.project);
          restored = true;
        }
      }
    } catch (e) {
      console.warn('[NWT] Wiederherstellung übersprungen.', e);
    }

    NWT.Viewport.apply();
    NWT.Render.all();
    NWT.UI.updateTitle();
    NWT.UI.updateStatus();
    NWT.emit('ui:minimap');
    if (!restored) NWT.Persistence.markSaved(false);

    if (restored) {
      U.toast('Automatisch gesicherter Stand wiederhergestellt: ' + S.project.name, 'ok', 4000);
    } else if (!S.project.devices.length) {
      /* Erststart: kurzer Hinweis statt leerer Fläche. */
      setTimeout(() => {
        U.toast('Komponenten aus der linken Leiste auf die Fläche ziehen — oder F1 für Hilfe.', '', 6000);
      }, 700);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
