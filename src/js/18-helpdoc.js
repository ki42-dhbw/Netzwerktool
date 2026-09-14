/* ============================================================
   18 — Ausführliches Handbuch im Programm
   Zeigt denselben Text wie hilfe.html als Vollbild-Overlay,
   damit die Einzeldatei auch ohne Begleitdatei vollständig ist.
   ============================================================ */

NWT.HelpDoc = (function () {
  const U = NWT.Util;
  let overlay = null;

  function available() {
    return typeof window.__NWT_HELP_BODY__ === 'string' && window.__NWT_HELP_BODY__.length > 0;
  }

  function build() {
    const host = document.createElement('div');
    host.id = 'help-overlay';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Handbuch');
    host.innerHTML =
      '<div class="nwt-help">' +
        '<header class="help-top">' +
          '<div class="help-brand">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2.5h6v5H9zM2 16.5h6v5H2zM16 16.5h6v5h-6z"/>' +
            '<path d="M12 7.5v3.5M5 16.5v-3.2h14v3.2M12 11v2.3"/></svg>' +
            '<div><b>Handbuch</b><span>Netzwerk-Topologie-Tool</span></div>' +
          '</div>' +
          '<input type="search" class="help-search" placeholder="Im Handbuch suchen …" autocomplete="off" aria-label="Im Handbuch suchen">' +
          '<button type="button" class="help-btn" data-help-print>Drucken</button>' +
          '<button type="button" class="help-btn primary" data-help-close>Schließen (Esc)</button>' +
        '</header>' +
        '<div class="help-shell">' +
          '<nav class="help-toc" aria-label="Inhaltsverzeichnis"><h4>Inhalt</h4>' +
            (window.__NWT_HELP_TOC__ || '') +
          '</nav>' +
          '<div class="help-main">' +
            '<div class="help-inner">' + window.__NWT_HELP_BODY__ + '</div>' +
            '<div class="help-foot">Dieses Handbuch liegt zusätzlich als eigenständige Datei ' +
            '<code>hilfe.html</code> neben dem Programm — zum Ausdrucken oder Weitergeben.</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    host.querySelector('[data-help-close]').addEventListener('click', close);
    host.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    document.body.appendChild(host);
    if (typeof window.NWT_HELP_UI === 'function') {
      window.NWT_HELP_UI(host.querySelector('.nwt-help'));
    }
    return host;
  }

  function open(anchor) {
    if (!available()) {
      NWT.Modal.error('Das ausführliche Handbuch ist in dieser Fassung nicht eingebettet.');
      return;
    }
    if (!overlay) overlay = build();
    overlay.classList.add('on');
    document.body.classList.add('help-open');
    NWT.Focus.enter(overlay);
    NWT.Tooltip && NWT.Tooltip.hide();

    const main = overlay.querySelector('.help-main');
    if (anchor) {
      const el = overlay.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(anchor) : anchor));
      if (el && main) {
        main.scrollTop = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 12;
      }
    }
    const search = overlay.querySelector('.help-search');
    if (search) setTimeout(() => search.focus(), 60);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('on');
    document.body.classList.remove('help-open');
    NWT.Focus.leave(overlay);
  }

  function isOpen() { return !!overlay && overlay.classList.contains('on'); }

  return { open, close, isOpen, available };
})();
