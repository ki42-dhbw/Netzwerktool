/* ============================================================
   11 — Austausch: JSON-Export/Import, SVG, PNG, Druck
   ============================================================ */

NWT.Exchange = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const Model = NWT.Model;

  /* --------------------------------------------------------------- JSON */

  function exportJson() {
    const data = Model.serialize(S.project);
    S.project.info.modified = data.info.modified;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    U.downloadBlob(blob, U.slugify(S.project.name) + '.json');
    NWT.Persistence.markSaved();
    U.toast('Projekt als JSON exportiert', 'ok');
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      NWT.Modal.error('Die Datei ist zu groß (> 25 MB) und wird nicht geladen.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => NWT.Modal.error('Die Datei konnte nicht gelesen werden.');
    reader.onload = () => {
      let raw;
      try {
        raw = JSON.parse(String(reader.result));
      } catch (e) {
        NWT.Modal.error('Die Datei enthält kein gültiges JSON.', e.message);
        return;
      }
      let result;
      try {
        result = Model.validate(raw);
      } catch (e) {
        NWT.Modal.error('Die Datei ist keine gültige Projektdatei.', e.message);
        return;
      }
      applyImported(result, file.name);
    };
    reader.readAsText(file);
  }

  function applyImported(result, filename) {
    const doIt = () => {
      S.setProject(result.project);
      NWT.Viewport.apply();
      if (result.project.devices.length) NWT.Viewport.zoomToFit();
      NWT.emit('project:meta');
      NWT.emit('change', { structural: true });
      const w = result.warnings || [];
      if (w.length) {
        NWT.Modal.alert({
          title: 'Projekt importiert — mit Hinweisen',
          html: '<div class="msg-body"><p>Die Datei wurde geladen, dabei wurden Korrekturen vorgenommen:</p><ul>' +
                w.slice(0, 12).map(s => '<li>' + U.escapeHtml(s) + '</li>').join('') +
                (w.length > 12 ? '<li>… und ' + (w.length - 12) + ' weitere</li>' : '') + '</ul></div>'
        });
      } else {
        U.toast('Projekt importiert: ' + result.project.name, 'ok');
      }
    };

    return NWT.ProjectFlow.replace(doIt, 'Projekt importieren: ' + (filename || result.project.name));
  }

  /* ---------------------------------------------------------------- SVG */

  function diagramBounds(pad) {
    const vp = document.getElementById('viewport');
    try {
      const b = vp.getBBox();
      if (b.width > 0 && b.height > 0) {
        return { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2, empty: false };
      }
    } catch (e) { /* Fallback unten */ }
    return S.contentBounds(pad);
  }

  function buildSvgString() {
    NWT.Render.clearOverlay();
    const b = diagramBounds(40);
    const ser = new XMLSerializer();

    /* Icon-Symbole UND der Zuschnitt der Gerätefotos müssen mit in die
       <defs>, sonst bleiben im Export Symbole leer bzw. Fotos unbeschnitten. */
    const defs = ['clip-node-photo', 'icon-defs', 'hw-defs', 'custom-defs']
      .map(id => {
        const el = document.getElementById(id);
        return el ? ser.serializeToString(el) : '';
      }).join('');

    const parts = [];
    ['#l-areas', '#l-deco', '#l-edges', '#l-nodes', '#l-deco-front'].forEach(sel => {
      const src = document.querySelector(sel);
      if (!src) return;
      const copy = src.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[tabindex], [role], [aria-label]').forEach(el => {
        el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-label');
      });
      /* Auswahl- und Interaktionszustände gehören nicht in den Export. */
      copy.querySelectorAll('.sel, .connect-src, .flash').forEach(el => {
        el.classList.remove('sel', 'connect-src', 'flash');
      });
      copy.querySelectorAll('.node-halo, .area-handle, .node-handle, .edge-point, .edge-hit, .node-hit')
        .forEach(el => el.remove());
      /* Ausgeblendete Alternativen (Symbol vs. Bildstreifen) gehören nicht
         in den Export — sonst stünden beide Varianten in der Datei. */
      copy.querySelectorAll('[style*="display: none"], [style*="display:none"]')
        .forEach(el => el.remove());
      parts.push(ser.serializeToString(copy));
    });

    const css = (window.__NWT_DIAGRAM_CSS__ || '').replace(/]]>/g, '');
    const w = Math.max(1, Math.round(b.w));
    const h = Math.max(1, Math.round(b.h));

    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + w + '" height="' + h + '" viewBox="' + b.x + ' ' + b.y + ' ' + b.w + ' ' + b.h + '">\n' +
      '<title>' + U.escapeHtml(S.project.name) + '</title>\n' +
      '<style type="text/css"><![CDATA[\n' + css + '\n]]></style>\n' +
      '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" fill="#ffffff"/>\n' +
      '<defs>' + defs + '</defs>\n' +
      parts.join('\n') + '\n</svg>\n';
  }

  /**
   * Baut die SVG-Zeichenkette und die Maße in einem Zug — beides muss
   * denselben Zustand sehen. Maskierter Text ist unterschiedlich breit;
   * würde man die Maße danach ermitteln, passte der Rahmen nicht mehr.
   */
  function snapshot(masked) {
    return NWT.Privacy.withMasking(masked, () => ({
      svg: buildSvgString(), bounds: diagramBounds(40)
    }));
  }

  function nothingToExport() {
    if (S.project.devices.length) return false;
    NWT.Modal.alert({ title: 'Nichts zu exportieren', message: 'Die Zeichenfläche ist leer.' });
    return true;
  }

  function saveSvg(shot) {
    const blob = new Blob([shot.svg], { type: 'image/svg+xml;charset=utf-8' });
    U.downloadBlob(blob, U.slugify(S.project.name) + '.svg');
    U.toast('Diagramm als SVG exportiert', 'ok');
  }

  function exportSvg() {
    if (nothingToExport()) return;
    try {
      saveSvg(snapshot(NWT.Privacy.active()));
    } catch (e) {
      NWT.Modal.error('Der SVG-Export ist fehlgeschlagen.', e.message);
    }
  }

  /* ---------------------------------------------------------------- PNG */

  function exportPng(scale) {
    if (nothingToExport()) return;
    let shot;
    try { shot = snapshot(NWT.Privacy.active()); }
    catch (e) { NWT.Modal.error('Das Diagramm konnte nicht aufbereitet werden.', e.message); return; }
    savePng(shot, scale || 2);
  }

  function savePng(shot, factor) {
    const svgString = shot.svg;
    const b = shot.bounds;
    const w = Math.max(1, Math.round(b.w * factor));
    const h = Math.max(1, Math.round(b.h * factor));
    if (w * h > 40e6) {
      NWT.Modal.error('Das Diagramm ist für einen PNG-Export zu groß. Bitte SVG verwenden.');
      return;
    }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = function () {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (png) {
          URL.revokeObjectURL(url);
          if (!png) { NWT.Modal.error('Das PNG konnte nicht erzeugt werden.'); return; }
          U.downloadBlob(png, U.slugify(S.project.name) + '.png');
          U.toast('Diagramm als PNG exportiert (' + w + '×' + h + ')', 'ok');
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        NWT.Modal.error('Das PNG konnte nicht erzeugt werden.', e.message);
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      NWT.Modal.error('Das Diagramm konnte für den PNG-Export nicht gerendert werden. Bitte SVG verwenden.');
    };
    img.src = url;
  }

  /* ------------------------------------------- Bild mit Maskierung */

  /**
   * Ein Bild speichern und dabei entscheiden, was darin lesbar bleibt.
   * Die Maskierung greift in das Rendering ein, nicht in die fertige
   * Datei: ein Balken über echtem Text wäre in einer SVG-Datei bloße
   * Deko — die Angabe stünde weiterhin im Quelltext.
   */
  function exportImage() {
    if (nothingToExport()) return;
    const P = NWT.Privacy;
    const pv = P.settings();
    const fields = [
      { key: 'format', label: 'Format', type: 'select', options: [
        { value: 'png', label: 'PNG — Rastergrafik für Bericht, Folie, E-Mail' },
        { value: 'svg', label: 'SVG — beliebig skalierbar, Text bleibt Text' }
      ] },
      { key: 'scale', label: 'PNG-Größe', type: 'select', options: [
        { value: '1', label: 'einfach (Bildschirm)' },
        { value: '2', label: 'doppelt (empfohlen)' },
        { value: '3', label: 'dreifach (Druck)' }
      ] },
      { section: 'Vertrauliche Angaben' },
      { key: 'mask', label: 'Unkenntlich machen', type: 'checkbox', wide: true },
      { key: 'style', label: 'Art', type: 'select', options: P.STYLES, wide: true }
    ];
    P.GROUPS.forEach(g => fields.push({ key: 'g_' + g.key, label: g.label, type: 'checkbox', wide: true }));
    fields.push({ key: '_hint', type: 'static', wide: true, label: '',
      value: 'Maskiert wird der Text selbst, nicht ein Balken darüber — in der Datei steht danach ' +
             'nichts anderes mehr. Was auf einem Gerätefoto zu lesen ist, kann das Programm nicht ' +
             'erkennen; solche Bilder bleiben unverändert.' });

    const values = { format: 'png', scale: '2', mask: !!pv.on, style: pv.style };
    P.GROUPS.forEach(g => { values['g_' + g.key] = !!pv[g.key]; });

    return NWT.Modal.form({
      title: 'Als Bild speichern',
      subtitle: P.hasSensitive() ? 'Der Plan enthält Adressangaben.' : '',
      fields: fields,
      values: values,
      width: '640px',
      submitLabel: 'Speichern'
    }).then(res => {
      if (!res) return null;
      /* Die getroffene Wahl bleibt am Projekt stehen — beim nächsten
         Export steht sie wieder da, und die Zeichenfläche zeigt sie,
         sobald die Maskierung eingeschaltet ist. */
      const st = S.project.settings;
      st.privacy = Object.assign({}, st.privacy || P.DEFAULTS, { style: res.style });
      P.GROUPS.forEach(g => { st.privacy[g.key] = !!res['g_' + g.key]; });
      S.touch();

      let shot;
      try { shot = snapshot(!!res.mask); }
      catch (e) { NWT.Modal.error('Das Diagramm konnte nicht aufbereitet werden.', e.message); return null; }

      if (res.format === 'svg') saveSvg(shot);
      else savePng(shot, Number(res.scale) || 2);
      return true;
    });
  }

  /* -------------------------------------------------------------- Druck */

  let printState = null;

  function print() {
    window.print();
  }

  function init() {
    window.addEventListener('beforeprint', () => {
      const st = S.project.settings;
      printState = { zoom: st.zoom, panX: st.panX, panY: st.panY,
                     theme: document.documentElement.getAttribute('data-theme') };
      /* Gedruckt wird immer hell — ein Netzplan auf Schwarz ist auf Papier
         unbrauchbar und kostet zudem sinnlos Toner. */
      document.documentElement.setAttribute('data-theme', 'light');
      NWT.Render.clearOverlay();
      NWT.Viewport.zoomToFit(30);
    });
    window.addEventListener('afterprint', () => {
      if (!printState) return;
      const st = S.project.settings;
      st.zoom = printState.zoom; st.panX = printState.panX; st.panY = printState.panY;
      if (printState.theme) document.documentElement.setAttribute('data-theme', printState.theme);
      printState = null;
      NWT.Viewport.apply();
    });
  }

  return { init, exportJson, importFile, exportSvg, exportPng, exportImage, buildSvgString, print };
})();
