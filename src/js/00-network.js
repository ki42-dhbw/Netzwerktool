/* Gemeinsame Parser für Inventar, Analyse und Netzplanprüfung. */
NWT.Net = (function () {
  function ipv4(value) {
    const parts = String(value || '').split('.');
    if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
    return parts.reduce((n, p) => n * 256 + Number(p), 0);
  }
  function address(n) { return [24, 16, 8, 0].map(shift => Math.floor(n / Math.pow(2, shift)) % 256).join('.'); }
  function cidr(value) {
    const parts = String(value || '').split('/'), ip = ipv4(parts[0]);
    const prefix = Number(parts[1]);
    if (parts.length !== 2 || ip === null || !/^\d{1,2}$/.test(parts[1]) || prefix > 32) return null;
    const size = Math.pow(2, 32 - prefix), start = Math.floor(ip / size) * size;
    return { start: start, end: start + size - 1, prefix: prefix, text: address(start) + '/' + prefix };
  }
  function subnet(ip, subnets) {
    const n = ipv4(String(ip || '').split('/')[0]);
    if (n === null) return '';
    const matches = (subnets || []).map(cidr).filter(c => c && n >= c.start && n <= c.end).sort((a, b) => b.prefix - a.prefix);
    return matches.length ? matches[0].text : '';
  }
  function normalizeIp(value) {
    const ip = String(value || '').trim().split('/')[0];
    const n = ipv4(ip);
    if (n !== null) return address(n);
    if (!ip.includes(':') || /[%\s]/.test(ip)) return '';
    try { return new URL('http://[' + ip + ']/').hostname.replace(/^\[|\]$/g, '').toLowerCase(); } catch (e) { return ''; }
  }
  function csv(text, separator) {
    text = String(text || '').replace(/^\uFEFF/, '');
    function parse(sep) {
      const rows = [], row = []; let cell = '', quoted = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
          if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
          else if (quoted || !cell.trim()) quoted = !quoted;
          else cell += c;
        } else if (!quoted && c === sep) { row.push(cell.trim()); cell = ''; }
        else if (!quoted && (c === '\n' || c === '\r')) {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(cell.trim()); if (row.some(Boolean)) rows.push(row.splice(0)); else row.length = 0;
          cell = '';
        } else cell += c;
      }
      if (quoted) throw new Error('CSV: Ein zitiertes Feld wurde nicht geschlossen.');
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
      return rows;
    }
    if (separator) return parse(separator);
    const candidates = [';', ',', '\t'].map(sep => { try { return parse(sep); } catch (e) { return null; } }).filter(Boolean);
    if (!candidates.length) throw new Error('CSV: Ungültige Anführungszeichen.');
    return candidates.sort((a, b) => ((b[0] || []).length - (a[0] || []).length))[0];
  }
  function csvString(rows) { return '\uFEFF' + rows.map(row => row.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n'); }
  function interfaces(device) {
    const primary = { name: 'Hauptadresse', ip: device.ip || '', ipv6: device.ipv6 || '', mac: device.mac || '', vlan: device.vlan || '', port: '' };
    return [primary].concat(device.interfaces || []);
  }
  return { ipv4, address, cidr, subnet, normalizeIp, csv, csvString, interfaces };
})();

NWT.Focus = (function () {
  const stack = [], baseline = new Map();
  function top() { return stack.length ? stack[stack.length - 1].el : null; }
  function sync() {
    const active = top();
    Array.from(document.body.children).forEach(el => {
      if (!baseline.has(el)) baseline.set(el, el.inert);
      el.inert = active ? (el !== active && el.id !== 'modal' && el.id !== 'toasts') : baseline.get(el);
    });
    if (!active) baseline.clear();
    document.body.classList.toggle('help-open', !!active);
  }
  function enter(el) {
    if (stack.some(x => x.el === el)) return;
    stack.push({ el: el, previous: document.activeElement });
    el.setAttribute('aria-modal', 'true'); el.tabIndex = -1;
    sync();
    const target = el.querySelector('button, input, select, textarea, [tabindex="0"]');
    (target || el).focus();
  }
  function leave(el) {
    const index = stack.findIndex(x => x.el === el);
    if (index < 0) return;
    const entry = stack.splice(index, 1)[0];
    sync();
    if (entry.previous && entry.previous.isConnected && !entry.previous.closest('[inert]')) entry.previous.focus();
  }
  document.addEventListener('keydown', e => {
    const active = top();
    if (!active || e.key !== 'Tab' || (NWT.Modal && NWT.Modal.isOpen())) return;
    const targets = Array.from(active.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')).filter(el => !el.disabled && el.getClientRects().length);
    if (!targets.length) { e.preventDefault(); active.focus(); return; }
    const first = targets[0], last = targets[targets.length - 1];
    if (e.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }, true);
  return { enter, leave };
})();
