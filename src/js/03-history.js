/* ============================================================
   03 — Undo / Redo
   Snapshot-Stack mit Gesten-Zusammenfassung (Coalescing):
   Ein Drag über 200 Frames erzeugt genau einen Undo-Schritt.
   ============================================================ */

NWT.History = (function () {
  const U = NWT.Util;
  const LIMIT = 60;

  const undoStack = [];
  const redoStack = [];
  let pending = null;      // Snapshot vor einer laufenden Geste
  let pendingLabel = '';

  /* Bildstrings bleiben gemeinsam referenziert; jeder Schritt enthält nur
     das kleine JSON und Referenzen auf unveränderliche Bilddaten. */
  function snap() {
    const assets = [], indices = new Map();
    const json = JSON.stringify(NWT.Store.project, (key, value) => {
      if (typeof value !== 'string') return value;
      if (/^data:image\//i.test(value)) {
        if (!indices.has(value)) { indices.set(value, assets.length); assets.push(value); }
        return { __historyImage: indices.get(value) };
      }
      return value;
    });
    return { json: json, assets: assets };
  }
  function unpack(state) {
    return JSON.parse(state.json, (key, value) => value && typeof value === 'object' &&
      Object.keys(value).length === 1 && Number.isInteger(value.__historyImage)
      ? state.assets[value.__historyImage] : value);
  }

  function push(state, label) {
    undoStack.push({ state: state, label: label || 'Änderung' });
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
    NWT.emit('history');
  }

  const api = {
    /** Vor einer atomaren Änderung aufrufen. */
    record(label) {
      push(snap(), label);
    },

    /** Beginn einer Geste (Drag, Resize). Mehrfachaufrufe sind unschädlich. */
    begin(label) {
      if (pending) return;
      pending = snap();
      pendingLabel = label || 'Änderung';
    },

    /** Ende einer Geste — nur bei echter Änderung wird ein Schritt erzeugt. */
    end(changed) {
      if (!pending) return;
      const before = pending;
      pending = null;
      if (changed === false) return;
      if (changed === undefined && JSON.stringify(unpack(before)) === JSON.stringify(NWT.Store.project)) return;
      push(before, pendingLabel);
    },

    /** Geste ohne Historieneintrag verwerfen. */
    abort() { pending = null; },

    undo() {
      if (!undoStack.length) return false;
      const entry = undoStack.pop();
      redoStack.push({ state: snap(), label: entry.label });
      applyState(entry.state);
      NWT.emit('history');
      U.toast('Rückgängig: ' + entry.label);
      return true;
    },

    redo() {
      if (!redoStack.length) return false;
      const entry = redoStack.pop();
      undoStack.push({ state: snap(), label: entry.label });
      applyState(entry.state);
      NWT.emit('history');
      U.toast('Wiederholt: ' + entry.label);
      return true;
    },

    reset() {
      undoStack.length = 0;
      redoStack.length = 0;
      pending = null;
      NWT.emit('history');
    },

    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; }
  };

  function applyState(state) {
    const S = NWT.Store;
    const keepSel = S.selectedIds();
    S.setProject(unpack(state), { keepHistory: true });
    /* Auswahl auf noch existierende Objekte begrenzen. */
    S.selection = new Set(keepSel.filter(id => S.obj(id)));
    NWT.emit('change', { structural: true });
    NWT.emit('selection');
    NWT.emit('project:replaced');
  }

  return api;
})();
