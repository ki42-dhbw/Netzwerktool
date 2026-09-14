/* ============================================================
   Verhalten des Hilfe-Dokuments: Inhaltsverzeichnis, Scrollspy,
   Suche im Text. Wird von hilfe.html und vom Hilfe-Overlay der
   Anwendung mit demselben Code verwendet.
   ============================================================ */
'use strict';

function NWT_HELP_UI(root) {
  if (!root || root.__helpReady) return;
  root.__helpReady = true;

  const main = root.querySelector('.help-main');
  const toc = root.querySelector('.help-toc');
  const search = root.querySelector('.help-search');
  const links = Array.prototype.slice.call(toc ? toc.querySelectorAll('a[href^="#"]') : []);
  const targets = links
    .map(a => ({ a: a, el: root.querySelector('#' + CSS.escape(a.getAttribute('href').slice(1))) }))
    .filter(t => t.el);

  /* --- Sprung über das Inhaltsverzeichnis --------------------------- */
  links.forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = root.querySelector('#' + CSS.escape(id));
      if (!el) return;
      e.preventDefault();
      scrollTo(el);
      setActive(a);
      history.replaceState && history.replaceState(null, '', '#' + id);
    });
  });

  function scrollTo(el) {
    if (!main) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 12;
    main.scrollTo({ top: top, behavior: 'smooth' });
  }

  function setActive(a) {
    links.forEach(l => l.classList.remove('on'));
    if (a) {
      a.classList.add('on');
      if (toc && a.offsetTop < toc.scrollTop || (toc && a.offsetTop > toc.scrollTop + toc.clientHeight - 40)) {
        toc.scrollTop = Math.max(0, a.offsetTop - toc.clientHeight / 2);
      }
    }
  }

  /* --- Mitlaufende Markierung beim Scrollen -------------------------- */
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const base = main ? main.getBoundingClientRect().top : 0;
      let current = targets.length ? targets[0].a : null;
      for (const t of targets) {
        if (t.el.getBoundingClientRect().top - base <= 90) current = t.a; else break;
      }
      setActive(current);
    });
  }
  (main || window).addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* --- Suche im Hilfetext ------------------------------------------- */
  if (search) {
    const sections = Array.prototype.slice.call(root.querySelectorAll('.help-main section'));
    search.addEventListener('input', () => applyFilter(search.value));
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { search.value = ''; applyFilter(''); search.blur(); }
      if (e.key === 'Enter') {
        const first = links.filter(l => !l.classList.contains('hidden'))[0];
        if (first) first.click();
      }
    });

    function applyFilter(q) {
      q = String(q || '').trim().toLowerCase();
      clearMarks();
      if (!q) {
        links.forEach(l => l.classList.remove('hidden'));
        sections.forEach(s => { s.style.display = ''; });
        removeEmptyNote();
        return;
      }
      let hits = 0;
      const visibleIds = new Set();
      sections.forEach(s => {
        const match = s.textContent.toLowerCase().indexOf(q) >= 0;
        s.style.display = match ? '' : 'none';
        if (match) {
          hits++;
          s.querySelectorAll('h2[id],h3[id]').forEach(h => visibleIds.add(h.id));
          markIn(s, q);
        }
      });
      links.forEach(l => {
        const id = l.getAttribute('href').slice(1);
        l.classList.toggle('hidden', !visibleIds.has(id));
      });
      if (!hits) showEmptyNote(q); else removeEmptyNote();
    }

    function showEmptyNote(q) {
      removeEmptyNote();
      const d = document.createElement('div');
      d.className = 'toc-empty';
      d.textContent = 'Kein Treffer für „' + q + '“.';
      toc && toc.appendChild(d);
    }
    function removeEmptyNote() {
      const d = toc && toc.querySelector('.toc-empty');
      if (d) d.remove();
    }
  }

  /* --- Treffer im Text hervorheben ---------------------------------- */
  function markIn(section, q) {
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentNode;
        if (!p || p.nodeName === 'PRE' || p.nodeName === 'MARK' || p.nodeName === 'SCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue.toLowerCase().indexOf(q) >= 0
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const found = [];
    let n;
    while ((n = walker.nextNode())) { found.push(n); if (found.length > 300) break; }
    found.forEach(node => {
      const text = node.nodeValue;
      const frag = document.createDocumentFragment();
      let i = 0, at;
      const low = text.toLowerCase();
      while ((at = low.indexOf(q, i)) >= 0) {
        if (at > i) frag.appendChild(document.createTextNode(text.slice(i, at)));
        const m = document.createElement('mark');
        m.className = 'hit';
        m.textContent = text.substr(at, q.length);
        frag.appendChild(m);
        i = at + q.length;
      }
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function clearMarks() {
    root.querySelectorAll('mark.hit').forEach(m => {
      const t = document.createTextNode(m.textContent);
      m.parentNode.replaceChild(t, m);
    });
    root.querySelectorAll('.help-main section').forEach(s => s.normalize());
  }

  /* --- Druckschaltfläche -------------------------------------------- */
  const printBtn = root.querySelector('[data-help-print]');
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  /* --- Anker aus der Adresszeile ------------------------------------ */
  if (location.hash && location.hash.length > 1) {
    const el = root.querySelector('#' + CSS.escape(location.hash.slice(1)));
    if (el) setTimeout(() => scrollTo(el), 60);
  }
}

if (typeof window !== 'undefined') window.NWT_HELP_UI = NWT_HELP_UI;
