/* ============================================================
   08 — Modal-Baukasten
   Alle Dialoge (Geräte, Verbindungen, Projekt, Hilfe, Meldungen)
   entstehen datengetrieben aus einer Feldliste.
   ============================================================ */

NWT.Modal = (function () {
  const U = NWT.Util;
  let dlg, current = null;

  function init() {
    dlg = U.el('#modal');
    dlg.addEventListener('cancel', e => {
      e.preventDefault();
      close(null);
    });
    dlg.addEventListener('click', e => {
      if (e.target === dlg) close(null);   // Klick auf Backdrop
    });
    dlg.addEventListener('close', () => { if (!dlg.open && current) close(null); });
  }

  function isOpen() { return dlg && dlg.open; }

  function close(value) {
    if (!current) { if (dlg && dlg.open) dlg.close(); return; }
    const resolve = current.resolve;
    current = null;
    if (dlg.open) dlg.close();
    dlg.innerHTML = '';
    resolve(value);
  }

  /**
   * Basisdialog.
   * opts: {title, subtitle, bodyHtml, buttons:[{label,value,kind,primary,left}],
   *        onMount(root, api), width}
   */
  function open(opts) {
    if (current) close(null);
    return new Promise(resolve => {
      const session = current = { resolve: resolve, busy: false };

      const buttons = opts.buttons || [{ label: 'Schließen', value: null, primary: true }];
      const html =
        '<form method="dialog" class="dlg-form">' +
          '<div class="dlg-head">' +
            '<div><h2>' + U.escapeHtml(opts.title || '') + '</h2>' +
            (opts.subtitle ? '<div class="dlg-sub">' + U.escapeHtml(opts.subtitle) + '</div>' : '') +
            '</div>' +
            '<button type="button" class="dlg-x" data-close aria-label="Schließen">✕</button>' +
          '</div>' +
          '<div class="dlg-body">' + (opts.bodyHtml || '') + '</div>' +
          '<div class="dlg-foot">' +
            buttons.map((b, i) =>
              '<button type="' + (b.submit ? 'submit' : 'button') + '" class="btn' + (b.primary ? ' primary' : '') + (b.kind ? ' ' + b.kind : '') +
              (b.left ? ' left' : '') + '" data-btn="' + i + '">' + U.escapeHtml(b.label) + '</button>').join('') +
          '</div>' +
        '</form>';

      dlg.innerHTML = html;
      if (opts.width) dlg.style.width = opts.width;
      else dlg.style.width = '';

      const api = {
        close: value => { if (current === session) close(value); },
        root: dlg,
        value(key) { const f = dlg.querySelector('[name="' + key + '"]'); return f ? f.value : ''; }
      };

      dlg.querySelector('[data-close]').addEventListener('click', () => close(null));
      const invoke = b => {
        if (!b || current !== session || session.busy) return;
        if (b.submit && !dlg.querySelector('form').reportValidity()) return;
        try {
          const res = b.onClick ? b.onClick(api) : b.value;
          if (res && typeof res.then === 'function') {
            session.busy = true;
            res.then(v => { session.busy = false; if (v !== false) api.close(v); }, err => {
              session.busy = false;
              if (current === session) error('Die Aktion ist fehlgeschlagen.', err.message);
            });
          } else if (res !== false || !b.onClick) api.close(res === undefined ? b.value : res);
        } catch (err) { error('Die Aktion ist fehlgeschlagen.', err.message); }
      };
      buttons.forEach((b, i) => {
        if (!b.submit) dlg.querySelector('[data-btn="' + i + '"]').addEventListener('click', () => invoke(b));
      });
      dlg.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        invoke(buttons.find(b => b.submit));
      });

      dlg.showModal();
      if (opts.onMount) opts.onMount(dlg, api);

      const first = dlg.querySelector('.dlg-body input, .dlg-body select, .dlg-body textarea');
      if (first) { try { first.focus(); first.select && first.select(); } catch (e) {} }
    });
  }

  /* ------------------------------------------------------------ Formular */

  function fieldHtml(f, values) {
    if (f.section) return '<div class="form-section">' + U.escapeHtml(f.section) + '</div>';
    const v = values && values[f.key] != null ? values[f.key] : (f.value != null ? f.value : '');
    const cls = 'field' + (f.wide ? ' wide' : '');
    const label = '<label for="fld_' + f.key + '">' + U.escapeHtml(f.label) + '</label>';
    let input = '';

    switch (f.type) {
      case 'textarea':
        input = '<textarea id="fld_' + f.key + '" name="' + f.key + '" rows="' + (f.rows || 3) + '"' +
          (f.placeholder ? ' placeholder="' + U.escapeHtml(f.placeholder) + '"' : '') + '>' + U.escapeHtml(v) + '</textarea>';
        break;
      case 'select': {
        const opts = f.options || [];
        const opt = o => '<option value="' + U.escapeHtml(o.value) + '"' +
          (String(o.value) === String(v) ? ' selected' : '') + '>' + U.escapeHtml(o.label) + '</option>';
        let body = '';
        if (opts.some(o => o.group)) {
          /* Gruppierte Auswahl: lange Listen bleiben nur mit optgroup lesbar. */
          let current = null;
          opts.forEach(o => {
            const g = o.group || '';
            if (g !== current) {
              if (current !== null) body += '</optgroup>';
              body += '<optgroup label="' + U.escapeHtml(g) + '">';
              current = g;
            }
            body += opt(o);
          });
          if (current !== null) body += '</optgroup>';
        } else {
          body = opts.map(opt).join('');
        }
        input = '<select id="fld_' + f.key + '" name="' + f.key + '">' + body + '</select>';
        break;
      }
      case 'number':
        input = '<input type="number" id="fld_' + f.key + '" name="' + f.key + '" value="' + U.escapeHtml(v) + '"' +
          (f.min != null ? ' min="' + f.min + '"' : '') +
          (f.max != null ? ' max="' + f.max + '"' : '') +
          (f.step != null ? ' step="' + f.step + '"' : '') + '>';
        break;
      case 'color':
        input = '<input type="color" id="fld_' + f.key + '" name="' + f.key + '" value="' + U.escapeHtml(v || '#2563eb') + '">';
        break;
      case 'checkbox':
        return '<div class="field field-check' + (f.wide ? ' wide' : '') + '">' +
          '<input type="checkbox" id="fld_' + f.key + '" name="' + f.key + '"' + (v ? ' checked' : '') + '>' +
          '<label for="fld_' + f.key + '">' + U.escapeHtml(f.label) + '</label></div>';
      case 'static':
        return '<div class="' + cls + '">' + label + '<div class="hintline">' + U.escapeHtml(v || '—') + '</div></div>';
      case 'custom':
        /* Vom Aufrufer gelieferter Inhalt; Werte werden nicht ausgelesen. */
        return '<div class="' + cls + '">' + label + (f.render ? f.render() : '') + '</div>';
      default:
        input = '<input type="text" id="fld_' + f.key + '" name="' + f.key + '" value="' + U.escapeHtml(v) + '"' +
          (f.placeholder ? ' placeholder="' + U.escapeHtml(f.placeholder) + '"' : '') +
          (f.mono ? ' spellcheck="false" autocomplete="off"' : '') + '>';
    }
    return '<div class="' + cls + '">' + label + input +
      (f.hint ? '<div class="hintline">' + U.escapeHtml(f.hint) + '</div>' : '') + '</div>';
  }

  function readFields(fields) {
    const out = {};
    fields.forEach(f => {
      if (f.section || f.type === 'static' || f.type === 'custom') return;
      const el = dlg.querySelector('[name="' + f.key + '"]');
      if (!el) return;
      out[f.key] = f.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  /**
   * form({title, subtitle, fields, values, submitLabel, extraButtons})
   * → Promise<values | {__action} | null>
   */
  function form(opts) {
    const fields = opts.fields || [];
    const bodyHtml = '<div class="form-grid">' + fields.map(f => fieldHtml(f, opts.values)).join('') + '</div>';
    const buttons = [];
    (opts.extraButtons || []).forEach(b => buttons.push(b));
    buttons.push({ label: 'Abbrechen', value: null });
    buttons.push({
      label: opts.submitLabel || 'Übernehmen', primary: true, submit: true,
      onClick: () => readFields(fields)
    });
    return open({
      title: opts.title, subtitle: opts.subtitle, bodyHtml: bodyHtml,
      width: opts.width, buttons: buttons, onMount: opts.onMount
    });
  }

  /* ------------------------------------------------------------ Meldungen */

  function confirm(opts) {
    return open({
      title: opts.title || 'Bestätigen',
      bodyHtml: '<div class="msg-body">' + (opts.html || U.escapeHtml(opts.message || '')) + '</div>',
      buttons: [
        { label: opts.cancelLabel || 'Abbrechen', value: false },
        { label: opts.confirmLabel || 'OK', value: true, primary: !opts.danger, kind: opts.danger ? 'danger' : '' }
      ]
    }).then(v => v === true);
  }

  function alert(opts) {
    return open({
      title: opts.title || 'Hinweis',
      bodyHtml: '<div class="msg-body">' + (opts.html || U.escapeHtml(opts.message || '')) + '</div>',
      buttons: [{ label: 'OK', value: true, primary: true }]
    });
  }

  function error(message, detail) {
    return alert({
      title: 'Fehler',
      html: '<div class="msg-body"><p>' + U.escapeHtml(message) + '</p>' +
            (detail ? '<p><code>' + U.escapeHtml(detail) + '</code></p>' : '') + '</div>'
    });
  }

  function prompt(opts) {
    return form({
      title: opts.title || 'Eingabe',
      subtitle: opts.subtitle,
      fields: [{ key: 'value', label: opts.label || 'Wert', wide: true, placeholder: opts.placeholder }],
      values: { value: opts.value || '' },
      submitLabel: opts.submitLabel || 'OK'
    }).then(v => (v && typeof v.value === 'string') ? v.value.trim() : null);
  }

  return { init, open, form, confirm, alert, error, prompt, close, isOpen };
})();
