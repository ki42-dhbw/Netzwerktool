/* ============================================================
   00 — Kern: Namespace, Event-Bus, Hilfsfunktionen
   ============================================================ */
'use strict';

var NWT = (function () {
  const api = {};

  /* --- Event-Bus ------------------------------------------------------- */
  const listeners = new Map();
  api.on = function (evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn);
  };
  api.emit = function (evt, payload) {
    const set = listeners.get(evt);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); }
      catch (err) { console.error('[NWT] Listener-Fehler bei "' + evt + '"', err); }
    }
  };

  return api;
})();

NWT.Util = (function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function el(sel) { return document.querySelector(sel); }
  function els(sel) { return Array.from(document.querySelectorAll(sel)); }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function clone(obj) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(obj); } catch (e) { /* fällt unten durch */ }
    }
    return JSON.parse(JSON.stringify(obj));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let t = null;
    const wrapped = function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(self, args); }, ms);
    };
    wrapped.cancel = () => { clearTimeout(t); t = null; };
    wrapped.flush = function () { if (t) { clearTimeout(t); t = null; fn.apply(this, arguments); } };
    return wrapped;
  }

  /** requestAnimationFrame-Drosselung: mehrere Aufrufe pro Frame => ein Aufruf. */
  function rafThrottle(fn) {
    let queued = false, lastArgs = null;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn.apply(null, lastArgs); });
    };
  }

  function truncate(text, max) {
    text = String(text == null ? '' : text);
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function pad(n, width) { return String(n).padStart(width, '0'); }

  function nowIso() { return new Date().toISOString(); }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'projekt';
  }

  function rectsIntersect(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  function pointInRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  /** Kleines Toast-Feedback unten links. */
  function toast(message, kind, ms) {
    const host = el('#toasts');
    if (!host) return;
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = message;
    host.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(6px)';
      setTimeout(() => t.remove(), 260);
    }, ms || 2600);
  }

  return {
    SVG_NS, svgEl, el, els, clamp, clone, escapeHtml, debounce, rafThrottle,
    truncate, pad, nowIso, formatDate, downloadBlob, slugify,
    rectsIntersect, pointInRect, toast
  };
})();
