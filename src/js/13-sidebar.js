/* ============================================================
   13 — Seitenleiste: Komponentenkatalog, Suche, Ebenen
   ============================================================ */

NWT.Sidebar = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;

  let host, searchInput, layersHost, activeSelect;
  const collapsed = new Set();

  function init() {
    host = U.el('#catalog');
    searchInput = U.el('#catalog-search');
    layersHost = U.el('#layers');
    activeSelect = U.el('#active-layer');

    searchInput.addEventListener('input', () => renderCatalog(searchInput.value));
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { searchInput.value = ''; renderCatalog(''); e.stopPropagation(); }
    });

    U.el('#layer-add').addEventListener('click', addLayer);
    activeSelect.addEventListener('change', () => {
      S.project.settings.activeLayer = activeSelect.value;
      NWT.emit('change', { structural: false });
    });

    renderCatalog('');
    renderLayers();

    NWT.on('project:replaced', () => { renderLayers(); renderCatalog(searchInput.value); });
    NWT.on('customtypes', () => renderCatalog(searchInput.value));
    NWT.on('change', payload => { if (payload && payload.structural) renderLayers(); });
  }

  /* ------------------------------------------------------------ Katalog */

  function renderCatalog(filter) {
    const q = String(filter || '').trim().toLowerCase();
    host.innerHTML = '';
    let total = 0;

    C.CATEGORIES.forEach(cat => {
      const types = C.typesIn(cat.id).filter(id => {
        if (!q) return true;
        return C.type(id).label.toLowerCase().indexOf(q) >= 0 || id.indexOf(q) >= 0;
      });
      /* Die Kategorie „Eigene Symbole“ bleibt sichtbar — mit der Anlege-Kachel. */
      const isCustomCat = cat.id === 'custom';
      if (!types.length && !(isCustomCat && !q)) return;
      total += types.length;

      const group = document.createElement('div');
      group.className = 'cat-group' + (collapsed.has(cat.id) && !q ? ' collapsed' : '');

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'cat-head';
      head.innerHTML = '<span class="tw">▼</span><span>' + U.escapeHtml(cat.label) + '</span>';
      head.addEventListener('click', () => {
        if (collapsed.has(cat.id)) collapsed.delete(cat.id); else collapsed.add(cat.id);
        group.classList.toggle('collapsed');
      });
      group.appendChild(head);

      const items = document.createElement('div');
      items.className = 'cat-items';
      types.forEach(id => items.appendChild(catalogItem(id)));
      if (isCustomCat && !q) items.appendChild(newSymbolTile());
      group.appendChild(items);
      host.appendChild(group);
    });

    if (!total) {
      host.innerHTML = '<div class="cat-empty">Keine Komponente gefunden.</div>';
    }
  }

  /** Kachel „+ Neues Symbol“ am Ende der eigenen Symbole. */
  function newSymbolTile() {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cat-item cat-new';
    el.dataset.tip = 'Eigenes Symbol erstellen';
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 5v14M5 12h14"/></svg><span>Neues Symbol</span>';
    el.addEventListener('click', () => NWT.Symbols.open());
    return el;
  }

  function catalogItem(typeId) {
    const t = C.type(typeId);
    const custom = !!t.custom;
    const el = document.createElement('div');
    el.className = 'cat-item' + (custom ? ' cat-custom' : '');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-label', t.label + ' einfügen');
    el.addEventListener('keydown', e => {
      if (e.target !== el || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault(); e.stopPropagation(); NWT.Interaction.addDeviceCentered(typeId);
    });
    el.draggable = true;
    el.dataset.type = typeId;
    el.dataset.tip = t.label;          /* Rohtext; das Hinweisfenster zeigt mehr */
    el.style.color = t.color;
    const ic = NWT.Symbols.iconFor(typeId);
    const graphic = ic.kind === 'image'
      ? '<img class="cat-img" src="' + U.escapeHtml(ic.href) + '" alt="">'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="' + U.escapeHtml(ic.href) + '"></use></svg>';
    el.innerHTML = graphic + '<span>' + U.escapeHtml(t.label) + '</span>' +
      (custom ? '<button type="button" class="cat-edit" title="Symbol bearbeiten">✎</button>' : '');

    if (custom) {
      el.querySelector('.cat-edit').addEventListener('click', e => {
        e.stopPropagation();
        NWT.Symbols.open(typeId);
      });
      el.addEventListener('dblclick', () => NWT.Symbols.open(typeId));
    }

    el.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copy';
      try {
        e.dataTransfer.setData('application/x-nwt-type', typeId);
        e.dataTransfer.setData('text/plain', typeId);
      } catch (err) {
        e.dataTransfer.setData('text', typeId);
      }
    });
    el.addEventListener('click', () => NWT.Interaction.addDeviceCentered(typeId));
    return el;
  }

  /* ------------------------------------------------------------- Ebenen */

  function renderLayers() {
    if (!layersHost) return;
    const P = S.project;
    const counts = {};
    P.devices.forEach(d => { counts[d.layer] = (counts[d.layer] || 0) + 1; });
    P.areas.forEach(a => { counts[a.layer] = (counts[a.layer] || 0) + 1; });

    layersHost.innerHTML = '';
    P.layers.forEach(l => {
      const row = document.createElement('div');
      row.className = 'layer-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = l.visible !== false;
      cb.title = 'Ebene ein-/ausblenden';
      cb.addEventListener('change', () => {
        l.visible = cb.checked;
        NWT.emit('change', { structural: true });
      });

      const name = document.createElement('span');
      name.className = 'lname';
      name.textContent = l.name;
      name.title = 'Doppelklick zum Umbenennen';
      name.addEventListener('dblclick', () => renameLayer(l));

      const cnt = document.createElement('span');
      cnt.className = 'lcount';
      cnt.textContent = counts[l.id] || 0;

      const del = document.createElement('button');
      del.className = 'ldel';
      del.textContent = '✕';
      del.title = 'Ebene löschen';
      del.addEventListener('click', () => removeLayer(l));

      row.appendChild(cb); row.appendChild(name); row.appendChild(cnt); row.appendChild(del);
      layersHost.appendChild(row);
    });

    activeSelect.innerHTML = P.layers
      .map(l => '<option value="' + U.escapeHtml(l.id) + '">' + U.escapeHtml(l.name) + '</option>').join('');
    activeSelect.value = P.settings.activeLayer;
    if (!activeSelect.value && P.layers.length) {
      P.settings.activeLayer = P.layers[0].id;
      activeSelect.value = P.layers[0].id;
    }
  }

  function addLayer() {
    NWT.Modal.prompt({ title: 'Neue Ebene', label: 'Name der Ebene', placeholder: 'z. B. Gebäude B' })
      .then(name => {
        if (!name) return;
        NWT.History.record('Ebene hinzufügen');
        const id = 'lay_' + U.slugify(name) + '_' + (S.project.layers.length + 1);
        S.project.layers.push({ id: id, name: name, visible: true });
        S.project.settings.activeLayer = id;
        S.touch();
        NWT.emit('change', { structural: true });
      });
  }

  function renameLayer(layer) {
    NWT.Modal.prompt({ title: 'Ebene umbenennen', label: 'Name', value: layer.name })
      .then(name => {
        if (!name) return;
        NWT.History.record('Ebene umbenennen');
        layer.name = name;
        S.touch();
        NWT.emit('change', { structural: true });
      });
  }

  function removeLayer(layer) {
    const P = S.project;
    if (P.layers.length <= 1) {
      NWT.Modal.error('Die letzte Ebene kann nicht gelöscht werden.');
      return;
    }
    const used = P.devices.filter(d => d.layer === layer.id).length +
                 P.areas.filter(a => a.layer === layer.id).length;
    const fallback = P.layers.find(l => l.id !== layer.id).id;
    const msg = used
      ? 'Die Ebene „' + layer.name + '“ enthält ' + used + ' Objekt(e). Diese werden auf die Ebene „' +
        (S.layer(fallback) || {}).name + '“ verschoben.'
      : 'Ebene „' + layer.name + '“ löschen?';

    NWT.Modal.confirm({ title: 'Ebene löschen', message: msg, confirmLabel: 'Löschen', danger: true })
      .then(ok => {
        if (!ok) return;
        NWT.History.record('Ebene löschen');
        P.devices.forEach(d => { if (d.layer === layer.id) d.layer = fallback; });
        P.areas.forEach(a => { if (a.layer === layer.id) a.layer = fallback; });
        P.connections.forEach(c => { if (c.layer === layer.id) c.layer = fallback; });
        P.layers = P.layers.filter(l => l.id !== layer.id);
        if (P.settings.activeLayer === layer.id) P.settings.activeLayer = fallback;
        S.touch();
        NWT.emit('change', { structural: true });
      });
  }

  return { init, renderCatalog, renderLayers };
})();
