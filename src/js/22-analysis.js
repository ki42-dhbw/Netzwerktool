/* ============================================================
   22 — Bedienung der Netzwerkanalyse
   Einlesedialog, Dateiimport und Anzeige der Analyse-Skripte.
   ============================================================ */

NWT.Analysis = (function () {
  const U = NWT.Util;

  let fileInput = null;

  function init() {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,.xml,.txt,.csv,.log,application/json,text/xml,text/plain,text/csv';
    fileInput.hidden = true;
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) importFile(f);
    });
  }

  /* ------------------------------------------------------- Einlesen */

  const EXAMPLES = [
    ['Windows', 'arp -a', 'ipconfig /all'],
    ['Linux/macOS', 'ip neigh', 'arp -n'],
    ['nmap (Hosts)', 'nmap -sn 192.168.1.0/24'],
    ['nmap (Dienste, empfohlen)', 'nmap -sV -oX scan.xml 192.168.1.0/24'],
    ['nmap (UDP, Modellbahn)', 'nmap -sU -p 15730,15731,21105 192.168.1.0/24'],
    ['Switch (Nachbarn)', 'show lldp neighbors detail', 'show cdp neighbors detail'],
    ['Switch (Portbelegung)', 'show mac address-table']
  ];

  function pasteDialog() {
    const cmds = '<table class="cmd-table"><tbody>' + EXAMPLES.map(e =>
      '<tr><th>' + U.escapeHtml(e[0]) + '</th><td>' +
      e.slice(1).map(c => '<code>' + U.escapeHtml(c) + '</code>').join(' &nbsp;·&nbsp; ') +
      '</td></tr>').join('') + '</tbody></table>';

    return NWT.Modal.open({
      title: 'Netzwerkdaten einlesen',
      subtitle: 'Ausgabe eines Werkzeugs einfügen — das Format wird automatisch erkannt.',
      width: '820px',
      bodyHtml:
        '<div class="analysis-dlg">' +
          '<p class="msg-body">Führen Sie einen der folgenden Befehle aus und fügen Sie die ' +
          'komplette Ausgabe unten ein. Mehrere Ausgaben dürfen zusammen eingefügt werden.</p>' +
          cmds +
          '<textarea id="an-input" rows="12" spellcheck="false" placeholder="Ausgabe hier einfügen (Strg+V) …"></textarea>' +
          '<div class="hintline">Erkannt werden: ARP-/Nachbartabellen, nmap (normal, -oG, -oX), ' +
          'LLDP/CDP-Nachbarschaften, MAC-Adresstabellen, CSV-Listen und die JSON-Datei des Analyse-Skripts.</div>' +
        '</div>',
      buttons: [
        { label: 'Analyse-Skript …', value: 'script', left: true },
        { label: 'Datei wählen …', value: 'file', left: true },
        { label: 'Abbrechen', value: null },
        {
          label: 'Analysieren', primary: true,
          onClick: (api) => {
            const text = api.root.querySelector('#an-input').value;
            if (!text.trim()) {
              U.toast('Bitte zuerst eine Ausgabe einfügen.', 'warn');
              return false;
            }
            return { text: text };
          }
        }
      ],
      onMount: (root) => {
        const ta = root.querySelector('#an-input');
        setTimeout(() => ta.focus(), 40);
      }
    }).then(res => {
      if (!res) return;
      if (res === 'script') { showScript(); return; }
      if (res === 'file') { fileInput.click(); return; }
      runAnalysis(res.text);
    });
  }

  function importFile(file) {
    if (file.size > 20 * 1024 * 1024) {
      NWT.Modal.error('Die Datei ist größer als 20 MB und wird nicht gelesen.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => NWT.Modal.error('Die Datei konnte nicht gelesen werden.');
    reader.onload = () => runAnalysis(String(reader.result), file.name);
    reader.readAsText(file);
  }

  function pickFile() { fileInput.click(); }

  function runAnalysis(text, filename) {
    let result;
    try {
      result = NWT.Discovery.analyze(text);
    } catch (e) {
      NWT.Modal.error('Die Daten konnten nicht ausgewertet werden.', e.message);
      return null;
    }
    U.toast(result.hosts.length + ' Host(s) erkannt' + (filename ? ' aus ' + filename : '') +
      ' · Quelle: ' + (result.sources.join(', ') || 'unbekannt'), 'ok', 4000);
    return result;
  }

  /* --------------------------------------------------------- Skripte */

  function scriptText(kind) {
    return kind === 'sh' ? (window.__NWT_SCRIPT_SH__ || '') : (window.__NWT_SCRIPT_PS1__ || '');
  }

  function showScript(kind) {
    let current = kind || 'ps1';
    const body = () =>
      '<div class="script-dlg">' +
        '<div class="script-tabs">' +
          '<button type="button" class="btn' + (current === 'ps1' ? ' primary' : '') + '" data-k="ps1">Windows · PowerShell</button>' +
          '<button type="button" class="btn' + (current === 'sh' ? ' primary' : '') + '" data-k="sh">Linux / macOS · Bash</button>' +
        '</div>' +
        '<div class="script-how">' +
          (current === 'ps1'
            ? '<ol><li>Skript herunterladen oder kopieren und als <code>netzwerk_analyse.ps1</code> speichern.</li>' +
              '<li>PowerShell im selben Ordner öffnen und ausführen:<br>' +
              '<code>powershell -ExecutionPolicy Bypass -File .\\netzwerk_analyse.ps1</code></li>' +
              '<li>Die erzeugte <code>netzwerk_scan.json</code> hier importieren.</li></ol>' +
              '<p class="script-note">Die Windows-Fassung findet Geräte auch dann, wenn sie ' +
              'nicht auf Ping antworten, und leitet aus den Fundstellen Verbindungen ab. ' +
              'Diese werden im Dashboard einzeln zur Prüfung angeboten.</p>'
            : '<ol><li>Skript herunterladen oder kopieren und als <code>netzwerk_analyse.sh</code> speichern.</li>' +
              '<li>Ausführbar machen und starten:<br><code>chmod +x netzwerk_analyse.sh &amp;&amp; ./netzwerk_analyse.sh</code></li>' +
              '<li>Die erzeugte <code>netzwerk_scan.json</code> hier importieren.</li></ol>' +
              '<p>Voraussetzung: Python 3.9+ sowie ping und die Netzwerkwerkzeuge des Betriebssystems. Es werden keine Python-Pakete benötigt.</p>') +
          '<p>Vorab den Bereich prüfen: <code>-PlanOnly</code> (Windows) bzw. <code>--plan-only</code> (Linux/macOS). ' +
          'Schnittstelle, Startadresse, maximale Hostzahl, Parallelität und Timeout sind einstellbar. Abbruch mit Q (Windows) bzw. Strg+C (Linux/macOS) schreibt ein Teilergebnis.</p>' +
        '</div>' +
        '<div class="note-inline">Das Skript sendet Prüfanfragen an den gewählten Adressbereich und fragt die konfigurierte Namensauflösung ab. ' +
        'Es verändert keine Gerätekonfiguration. Setzen Sie es ausschließlich in Netzwerken ein, für die Sie zuständig sind.</div>' +
        '<pre class="script-code">' + U.escapeHtml(scriptText(current)) + '</pre>' +
      '</div>';

    const wire = (root, api) => {
      root.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
        current = b.getAttribute('data-k');
        root.querySelector('.dlg-body').innerHTML = body();
        wire(root, api);
      }));
    };

    return NWT.Modal.open({
      title: 'Analyse-Skript',
      subtitle: 'Ermittelt erreichbare Hosts, MAC-Adressen, Namen und offene Ports',
      width: '880px',
      bodyHtml: body(),
      buttons: [
        {
          label: 'Kopieren', left: true,
          onClick: () => {
            copyText(scriptText(current));
            return false;
          }
        },
        {
          label: 'Herunterladen', left: true,
          onClick: () => {
            const name = current === 'ps1' ? 'netzwerk_analyse.ps1' : 'netzwerk_analyse.sh';
            U.downloadBlob(new Blob([scriptText(current)], { type: 'text/plain;charset=utf-8' }), name);
            U.toast(name + ' gespeichert', 'ok');
            return false;
          }
        },
        { label: 'Scan-Datei importieren …', value: 'import' },
        { label: 'Schließen', value: null, primary: true }
      ],
      onMount: wire
    }).then(v => { if (v === 'import') pickFile(); });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => U.toast('Skript in die Zwischenablage kopiert', 'ok'))
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    U.toast(ok ? 'Skript in die Zwischenablage kopiert' : 'Kopieren nicht möglich — bitte manuell markieren.',
      ok ? 'ok' : 'warn');
  }

  return { init, pasteDialog, importFile, pickFile, showScript, runAnalysis };
})();
