/* ============================================================
   19 — Gerätefotos
   Echte Fotos werden als data:-URL im Gerät gespeichert und
   reisen dadurch automatisch in Projekt, Autosave, JSON-Export
   und Grafikexport mit.

   Entscheidend ist die Verkleinerung: ein Handyfoto mit 4 MB
   würde als Base64 rund 5,4 MB belegen und den Browser-Speicher
   (5–10 MB) sofort sprengen. Jedes Bild wird daher auf maximal
   MAX_EDGE Pixel skaliert und als JPEG neu kodiert — typisch
   30–70 KB pro Gerät.
   ============================================================ */

NWT.Images = (function () {
  const U = NWT.Util;
  const S = NWT.Store;

  const MAX_EDGE = 640;         // längste Kante nach der Verkleinerung
  const QUALITY = 0.82;         // JPEG-Qualität
  const MAX_SOURCE = 30 * 1024 * 1024;
  const WARN_TOTAL = 1.6 * 1024 * 1024;   // ab hier wird es im localStorage eng

  let fileInput = null;
  let pendingDeviceId = null;

  function init() {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      const id = pendingDeviceId;
      fileInput.value = '';
      pendingDeviceId = null;
      if (f && id) setFromFile(id, f);
    });

    /* Einfügen aus der Zwischenablage: Screenshot oder kopiertes Bild. */
    document.addEventListener('paste', e => {
      if (NWT.Modal.isOpen() || NWT.HelpDoc.isOpen()) return;
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          const ids = S.selectedDevices();
          if (!ids.length) {
            U.toast('Erst ein Gerät auswählen, dann das Bild einfügen.', 'warn');
            return;
          }
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) setFromFile(ids[0], file);
          return;
        }
      }
    });
  }

  /* ---------------------------------------------------- Verkleinern */

  /** Liest eine Bilddatei, skaliert sie und liefert eine data:-URL. */
  function processFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('Keine Datei übergeben.')); return; }
      if (file.type && file.type.indexOf('image/') !== 0) {
        reject(new Error('Die Datei ist kein Bild (' + (file.type || 'unbekannter Typ') + ').'));
        return;
      }
      if (file.size > MAX_SOURCE) {
        reject(new Error('Das Bild ist größer als 30 MB und wird nicht geladen.'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        try {
          const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve({ dataUrl: canvas.toDataURL('image/jpeg', QUALITY), w: w, h: h });
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Das Bildformat konnte nicht gelesen werden.'));
      };
      img.src = url;
    });
  }

  /* ------------------------------------------------------ Zuweisen */

  function setFromFile(deviceId, file) {
    const d = S.dev(deviceId);
    if (!d) return Promise.resolve(false);
    return processFile(file).then(res => {
      NWT.History.record('Gerätefoto zuweisen');
      d.image = res.dataUrl;
      S.touch();
      NWT.emit('change', { structural: true });
      const kb = Math.round(res.dataUrl.length * 0.75 / 1024);
      U.toast('Foto zu „' + d.name + '“ hinzugefügt (' + res.w + '×' + res.h + ', ~' + kb + ' KB)', 'ok');
      checkBudget();
      return true;
    }).catch(err => {
      NWT.Modal.error('Das Foto konnte nicht übernommen werden.', err.message);
      return false;
    });
  }

  /** Öffnet den Dateidialog für ein bestimmtes Gerät. */
  function pickFor(deviceId) {
    pendingDeviceId = deviceId;
    fileInput.click();
  }

  function remove(deviceId) {
    const d = S.dev(deviceId);
    if (!d || !d.image) return;
    NWT.History.record('Gerätefoto entfernen');
    d.image = '';
    S.touch();
    NWT.emit('change', { structural: true });
    U.toast('Foto entfernt');
  }

  /** Wird von der Zeichenfläche aufgerufen, wenn eine Bilddatei auf ein Gerät fällt. */
  function handleDroppedFiles(deviceId, files) {
    if (!files || !files.length) return false;
    const img = Array.prototype.slice.call(files).find(f => f.type && f.type.indexOf('image/') === 0);
    if (!img) return false;
    setFromFile(deviceId, img);
    return true;
  }

  /* -------------------------------------------------------- Bilanz */

  function stats() {
    let count = 0, bytes = 0;
    S.project.devices.forEach(d => {
      if (!d.image) return;
      count++;
      /* Base64 belegt 4 Zeichen je 3 Byte. */
      bytes += Math.round((d.image.length - (d.image.indexOf(',') + 1)) * 0.75);
    });
    return { count: count, bytes: bytes };
  }

  function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
  }

  let warned = false;
  function checkBudget() {
    const st = stats();
    if (st.bytes > WARN_TOTAL && !warned) {
      warned = true;
      NWT.Modal.alert({
        title: 'Viele Bilddaten im Projekt',
        html: '<div class="msg-body"><p>Die hinterlegten Gerätefotos belegen bereits <b>' +
          formatBytes(st.bytes) + '</b> in ' + st.count + ' Geräten.</p>' +
          '<p>Der Browser-Speicher fasst je nach Browser nur 5–10 MB für <i>alle</i> Projekte zusammen. ' +
          'Sichern Sie das Projekt zusätzlich über <b>Export → Projekt als JSON</b> und entfernen Sie ' +
          'Fotos, die Sie nicht brauchen.</p></div>'
      });
    }
    if (st.bytes <= WARN_TOTAL) warned = false;
  }

  return {
    init, processFile, setFromFile, pickFor, remove, handleDroppedFiles,
    stats, formatBytes, MAX_EDGE
  };
})();
