/* ============================================================
   20 — Netzwerkanalyse (Discovery)

   Ein Browser darf aus Sicherheitsgründen weder ICMP senden noch
   ARP-Tabellen lesen, keine Rohsockets öffnen und keine Ports
   scannen. Ein Scanner „im HTML“ wäre daher entweder unwirksam
   oder würde geraten — beides ist für eine Dokumentation wertlos.

   Dieses Modul geht deshalb den belastbaren Weg: es liest die
   Ausgabe der Werkzeuge, die auf dem Rechner ohnehin vorhanden
   sind, und leitet daraus Geräte, Typen und Verbindungen ab.

   Unterstützte Quellen:
     • arp -a · arp -n · ip neigh · Get-NetNeighbor
     • ipconfig /all · ip addr
     • nmap  (normal, -oG grepable, -oX XML)
     • show cdp/lldp neighbors [detail] · lldpctl
     • show mac address-table  (verbindet Geräte mit Switchports)
     • CSV/Semikolon-Listen aus Inventar oder DHCP-Leases
     • netzwerk_analyse.ps1 / .sh  (mitgeliefertes Skript → JSON)

   Alle Parser laufen gemeinsam über den Text; kombinierte
   Einfügungen (z. B. ipconfig + arp + nmap) werden zusammengeführt.
   ============================================================ */

NWT.Discovery = (function () {
  const U = NWT.Util;
  const S = NWT.Store;
  const C = NWT.Catalog;

  /* Kleine, bewusst kurze OUI-Liste: nur Präfixe, die eindeutig sind.
     Herstellernamen liefern nmap und das Analyse-Skript ohnehin mit. */
  const OUI = {
    'B8:27:EB': 'Raspberry Pi Foundation', 'DC:A6:32': 'Raspberry Pi Trading',
    'E4:5F:01': 'Raspberry Pi Trading', '28:CD:C1': 'Raspberry Pi Trading',
    'D8:3A:DD': 'Raspberry Pi Trading', '2C:CF:67': 'Raspberry Pi Trading',
    '24:0A:C4': 'Espressif (ESP32)', '30:AE:A4': 'Espressif (ESP32)',
    '84:F3:EB': 'Espressif (ESP8266)', 'A0:20:A6': 'Espressif (ESP8266)',
    '7C:9E:BD': 'Espressif', 'EC:FA:BC': 'Espressif',
    '24:A4:3C': 'Ubiquiti Networks',
    '00:0C:29': 'VMware (virtuell)', '00:50:56': 'VMware (virtuell)', '00:1C:14': 'VMware (virtuell)',
    '08:00:27': 'VirtualBox (virtuell)', '00:15:5D': 'Hyper-V (virtuell)',
    '00:16:3E': 'Xen (virtuell)', '52:54:00': 'QEMU/KVM (virtuell)'
  };

  /* Portsignaturen. Modellbahnzentralen sind an ihren Steuerports gut
     erkennbar; die Zuordnung bleibt eine Heuristik und wird als solche
     angezeigt. Reihenfolge = Priorität. */
  const PORT_HINTS = [
    { port: 15471, proto: 'tcp', type: 'mb_ecos',   why: 'Port 15471 — ESU-ECoS-Steuerprotokoll' },
    { port: 15731, proto: 'udp', type: 'mb_cs3',    why: 'Port 15731 — Märklin CAN über Ethernet' },
    { port: 15730, proto: 'udp', type: 'mb_cs3',    why: 'Port 15730 — Märklin CAN über Ethernet' },
    { port: 21105, proto: 'udp', type: 'mb_z21',    why: 'Port 21105 — Z21-LAN-Protokoll' },
    { port: 12090, proto: 'tcp', type: 'mb_pc',     why: 'Port 12090 — WiThrottle (JMRI)' },
    { port: 12080, proto: 'tcp', type: 'mb_pc',     why: 'Port 12080 — JMRI-Webserver' },
    { port: 2560,  proto: 'tcp', type: 'mb_dccex',  why: 'Port 2560 — DCC-EX Zentrale' },
    { port: 1234,  proto: 'tcp', type: 'mb_gateway', why: 'Port 1234 — LocoNet über TCP' },
    { port: 9100,  proto: 'tcp', type: 'netprinter', why: 'Port 9100 — Netzwerkdruck (JetDirect)' },
    { port: 631,   proto: 'tcp', type: 'netprinter', why: 'Port 631 — IPP-Druckdienst' },
    { port: 554,   proto: 'tcp', type: 'camera',    why: 'Port 554 — RTSP-Videostream' },
    { port: 5001,  proto: 'tcp', type: 'nas',       why: 'Port 5001 — NAS-Weboberfläche' },
    { port: 1883,  proto: 'tcp', type: 'server',    why: 'Port 1883 — MQTT-Broker' },
    { port: 3306,  proto: 'tcp', type: 'dbserver',  why: 'Port 3306 — MySQL/MariaDB' },
    { port: 5432,  proto: 'tcp', type: 'dbserver',  why: 'Port 5432 — PostgreSQL' },
    { port: 3389,  proto: 'tcp', type: 'pc',        why: 'Port 3389 — Windows-Remotedesktop' },
    { port: 445,   proto: 'tcp', type: 'server',    why: 'Port 445 — SMB-Dateidienst' },
    { port: 161,   proto: 'udp', type: 'switch_managed', why: 'Port 161 — SNMP-Verwaltung' }
  ];

  const NAME_HINTS = [
    [/ecos/i,                          'mb_ecos',      'Hostname enthält „ECoS“'],
    [/(^|\W)(cs3|cs2)(\W|$)|central.?station/i, 'mb_cs3', 'Hostname deutet auf Märklin Central Station'],
    [/z21/i,                           'mb_z21',       'Hostname enthält „Z21“'],
    [/intellibox|ib.?com|uhlenbrock/i, 'mb_intellibox','Hostname deutet auf Uhlenbrock Intellibox'],
    [/dr5000|digikeijs|dr50/i,         'mb_dr5000',    'Hostname deutet auf Digikeijs DR5000'],
    [/mx10|zimo/i,                     'mb_mx10',      'Hostname deutet auf ZIMO MX10'],
    [/tams|mastercontrol/i,            'mb_tams',      'Hostname deutet auf Tams MasterControl'],
    [/dcc.?ex|dccpp|commandstation/i,  'mb_dccex',     'Hostname deutet auf DCC-EX'],
    [/booster/i,                       'mb_booster',   'Hostname enthält „Booster“'],
    [/rueckmelder|rückmelder|s88|feedback/i, 'mb_feedback', 'Hostname deutet auf ein Rückmeldemodul'],
    [/loconet|xpressnet|lbserver/i,    'mb_gateway',   'Hostname deutet auf ein Bus-Gateway'],
    [/wlanmaus|multimaus|throttle|handregler/i, 'mb_throttle', 'Hostname deutet auf einen Handregler'],
    [/rocrail|jmri|itrain|traincontroller|windigipet/i, 'mb_pc', 'Hostname deutet auf Steuerungssoftware'],

    [/fritz|speedport|easybox|vodafone.?station/i, 'wlan_router', 'Hostname deutet auf einen Router'],
    [/(^|\W)(gw|gateway)(\W|$)/i,      'gateway',      'Hostname deutet auf ein Gateway'],
    [/(^|\W)rt\d|router/i,             'router',       'Hostname enthält „Router“'],
    [/(^|\W)sw\d|switch/i,             'switch_managed','Hostname enthält „Switch“'],
    [/unifi|(^|\W)ap\d|accesspoint|access.?point/i, 'accesspoint', 'Hostname deutet auf einen Access Point'],
    [/firewall|pfsense|opnsense|(^|\W)fw\d/i, 'firewall', 'Hostname deutet auf eine Firewall'],
    [/synology|qnap|diskstation|(^|\W)nas/i, 'nas',    'Hostname deutet auf ein NAS'],
    [/proxmox|esxi|hyperv|vmhost/i,    'vmserver',     'Hostname deutet auf einen Virtualisierungshost'],
    [/raspberrypi|(^|\W)rpi|octopi|pi-?hole/i, 'raspberrypi', 'Hostname deutet auf einen Raspberry Pi'],
    [/jetson|xavier|orin/i,            'jetson',       'Hostname deutet auf ein NVIDIA-Jetson-Board'],
    [/esp|tasmota|shelly|esphome|sonoff/i, 'sensor',   'Hostname deutet auf ein IoT-Modul'],
    [/cam(era)?\d?|ipcam|reolink|hikvision/i, 'camera','Hostname deutet auf eine Kamera'],
    [/printer|drucker|brother|epson|kyocera|(^|\W)hp[0-9a-f]{6}/i, 'netprinter', 'Hostname deutet auf einen Drucker'],
    [/(^|\W)srv|server/i,              'server',       'Hostname enthält „Server“'],
    [/(^|\W)nb\d|laptop|notebook/i,    'notebook',     'Hostname deutet auf ein Notebook'],
    [/(^|\W)pc\d|desktop|workstation/i,'pc',           'Hostname deutet auf einen PC']
  ];

  let lastResult = null;

  /* ------------------------------------------------------------ Helfer */

  function normMac(mac) {
    if (!mac) return '';
    let m = String(mac).toUpperCase().replace(/[^0-9A-F]/g, '');
    if (m.length !== 12) return '';
    return m.match(/.{2}/g).join(':');
  }

  function isUsableIp(ip) {
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return false;
    const p = ip.split('.').map(Number);
    if (p.some(n => n > 255)) return false;
    if (p[0] === 0 || p[0] === 127) return false;
    if (p[0] >= 224) return false;                       // Multicast/Broadcast
    if (ip === '255.255.255.255') return false;
    return true;
  }

  function isUsableMac(mac) {
    if (!mac) return true;                               // MAC ist optional
    if (mac === 'FF:FF:FF:FF:FF:FF') return false;
    if (mac.indexOf('01:00:5E') === 0) return false;      // IPv4-Multicast
    if (mac.indexOf('33:33') === 0) return false;         // IPv6-Multicast
    return true;
  }

  function vendorFor(mac) {
    const pre = mac.slice(0, 8);
    if (OUI[pre]) return OUI[pre];
    /* Zweites Halbbyte mit gesetztem Bit 1 = lokal verwaltete Adresse. */
    const second = parseInt(mac.charAt(1), 16);
    if (!isNaN(second) && (second & 2)) return 'lokal verwaltet / zufällig';
    return '';
  }

  function blankHost(ip) {
    return { ip: ip || '', mac: '', hostname: '', vendor: '', os: '', ports: [], sources: [], notes: [] };
  }

  /** Führt Hosts über MAC, sonst IP, sonst Hostname zusammen. */
  function mergeHosts(target, incoming) {
    incoming.forEach(h => {
      if (!h.ip && !h.mac) return;
      let found = null;
      if (h.mac) found = target.find(t => t.mac && t.mac === h.mac);
      if (!found && h.ip) found = target.find(t => t.ip === h.ip);
      if (!found && h.hostname) found = target.find(t => t.hostname && t.hostname.toLowerCase() === h.hostname.toLowerCase());
      if (!found) { target.push(h); return; }
      if (!found.ip) found.ip = h.ip;
      if (!found.mac) found.mac = h.mac;
      if (!found.hostname) found.hostname = h.hostname;
      if (!found.vendor) found.vendor = h.vendor;
      if (!found.os) found.os = h.os;
      h.ports.forEach(p => {
        if (!found.ports.some(q => q.port === p.port && q.proto === p.proto)) found.ports.push(p);
      });
      h.sources.forEach(s => { if (found.sources.indexOf(s) < 0) found.sources.push(s); });
      h.notes.forEach(n => { if (found.notes.indexOf(n) < 0) found.notes.push(n); });
    });
    return target;
  }

  /* ------------------------------------------------------------ Parser */

  /* ARP / Nachbartabellen: IP und MAC in derselben Zeile. */
  function parseArp(text) {
    const out = [];
    const re = /(\d{1,3}(?:\.\d{1,3}){3})[^\n\r]*?([0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5})/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const ip = m[1], mac = normMac(m[2]);
      if (!isUsableIp(ip) || !isUsableMac(mac)) continue;
      const h = blankHost(ip);
      h.mac = mac;
      h.vendor = vendorFor(mac);
      h.sources.push('ARP');
      out.push(h);
    }
    return out;
  }

  /* nmap, grepable (-oG) */
  function parseNmapGrep(text) {
    const out = [];
    text.split(/\r?\n/).forEach(line => {
      if (line.indexOf('Host: ') !== 0) return;
      const head = /^Host:\s+(\S+)\s*(?:\(([^)]*)\))?/.exec(line);
      if (!head || !isUsableIp(head[1])) return;
      const h = blankHost(head[1]);
      if (head[2]) h.hostname = head[2].trim();
      h.sources.push('nmap -oG');
      const pm = /Ports:\s*(.+?)(?:\s+Ignored State|$)/.exec(line);
      if (pm) {
        pm[1].split(',').forEach(part => {
          const f = part.trim().split('/');
          if (f.length >= 5 && f[1] === 'open') {
            h.ports.push({ port: Number(f[0]), proto: f[2] || 'tcp', service: f[4] || '' });
          }
        });
      }
      out.push(h);
    });
    return out;
  }

  /* nmap, XML (-oX) */
  function parseNmapXml(text) {
    const out = [];
    if (text.indexOf('<nmaprun') < 0) return out;
    let doc;
    try { doc = new DOMParser().parseFromString(text, 'application/xml'); }
    catch (e) { return out; }
    if (!doc || doc.getElementsByTagName('parsererror').length) return out;

    Array.prototype.forEach.call(doc.getElementsByTagName('host'), host => {
      const h = blankHost('');
      h.sources.push('nmap -oX');
      Array.prototype.forEach.call(host.getElementsByTagName('address'), a => {
        const kind = a.getAttribute('addrtype');
        if (kind === 'ipv4') h.ip = a.getAttribute('addr') || '';
        if (kind === 'mac') {
          h.mac = normMac(a.getAttribute('addr'));
          h.vendor = a.getAttribute('vendor') || vendorFor(h.mac);
        }
      });
      const hn = host.getElementsByTagName('hostname')[0];
      if (hn) h.hostname = hn.getAttribute('name') || '';
      Array.prototype.forEach.call(host.getElementsByTagName('port'), p => {
        const state = p.getElementsByTagName('state')[0];
        if (!state || state.getAttribute('state') !== 'open') return;
        const svc = p.getElementsByTagName('service')[0];
        h.ports.push({
          port: Number(p.getAttribute('portid')),
          proto: p.getAttribute('protocol') || 'tcp',
          service: svc ? (svc.getAttribute('name') || '') : ''
        });
      });
      const osm = host.getElementsByTagName('osmatch')[0];
      if (osm) h.os = osm.getAttribute('name') || '';
      if (isUsableIp(h.ip) && isUsableMac(h.mac)) out.push(h);
    });
    return out;
  }

  /* nmap, normale Textausgabe */
  function parseNmapNormal(text) {
    const out = [];
    if (text.indexOf('Nmap scan report for') < 0) return out;
    const blocks = text.split(/Nmap scan report for\s+/).slice(1);
    blocks.forEach(block => {
      const first = block.split(/\r?\n/)[0].trim();
      let ip = '', name = '';
      const paren = /^(\S+)\s+\((\d{1,3}(?:\.\d{1,3}){3})\)/.exec(first);
      if (paren) { name = paren[1]; ip = paren[2]; }
      else if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(first)) ip = first;
      if (!isUsableIp(ip)) return;

      const h = blankHost(ip);
      h.hostname = name;
      h.sources.push('nmap');
      const pre = /MAC Address:\s*([0-9A-Fa-f:.-]{12,17})\s*(?:\(([^)]*)\))?/.exec(block);
      if (pre) {
        h.mac = normMac(pre[1]);
        h.vendor = (pre[2] || '').trim() || vendorFor(h.mac);
      }
      const osm = /(?:Running|OS details|Service Info):\s*([^\r\n]+)/.exec(block);
      if (osm) h.os = osm[1].trim();
      const pr = /^(\d+)\/(tcp|udp)\s+open\s*(\S+)?/gm;
      let pm;
      while ((pm = pr.exec(block)) !== null) {
        h.ports.push({ port: Number(pm[1]), proto: pm[2], service: pm[3] || '' });
      }
      if (isUsableMac(h.mac)) out.push(h);
    });
    return out;
  }

  /* LLDP / CDP — liefert Nachbarschaften, also echte Verbindungen. */
  function parseNeighbors(text) {
    const links = [];
    const hosts = [];

    /* Cisco: show cdp/lldp neighbors detail */
    const blocks = text.split(/(?=Device ID:|System Name:|Local Intf:)/);
    blocks.forEach(b => {
      const name = (/(?:Device ID|System Name):\s*(\S+)/.exec(b) || [])[1];
      if (!name) return;
      const ip = (/(?:IP address|Management Addresses?|IPv4 address)[^\d]*(\d{1,3}(?:\.\d{1,3}){3})/i.exec(b) || [])[1];
      const local = (/(?:Interface|Local Intf):\s*([^\s,]+)/.exec(b) || [])[1];
      const remote = (/(?:Port ID \(outgoing port\)|Port id|Port ID):\s*([^\s,]+)/i.exec(b) || [])[1];
      links.push({ remoteName: name, remoteIp: ip || '', localPort: local || '', remotePort: remote || '', source: 'LLDP/CDP' });
      if (ip && isUsableIp(ip)) {
        const h = blankHost(ip);
        h.hostname = name;
        h.sources.push('LLDP/CDP');
        hosts.push(h);
      }
    });

    /* lldpctl */
    const lldpctl = text.split(/(?=Interface:\s)/);
    lldpctl.forEach(b => {
      const sys = (/SysName:\s*(\S+)/.exec(b) || [])[1];
      if (!sys) return;
      const ip = (/MgmtIP:\s*(\d{1,3}(?:\.\d{1,3}){3})/.exec(b) || [])[1];
      const local = (/Interface:\s*([^\s,]+)/.exec(b) || [])[1];
      const remote = (/PortID:\s*\S*\s*(\S+)/.exec(b) || [])[1];
      links.push({ remoteName: sys, remoteIp: ip || '', localPort: local || '', remotePort: remote || '', source: 'lldpctl' });
      if (ip && isUsableIp(ip)) {
        const h = blankHost(ip);
        h.hostname = sys;
        h.sources.push('lldpctl');
        hosts.push(h);
      }
    });

    return { links: links, hosts: hosts };
  }

  /* show mac address-table — ordnet MAC-Adressen Switchports zu. */
  function parseMacTable(text) {
    const map = [];
    const re = /(\d{1,4})\s+([0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4})\s+\S+\s+(\S+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const mac = normMac(m[2]);
      if (!mac || !isUsableMac(mac)) continue;
      map.push({ vlan: m[1], mac: mac, port: m[3] });
    }
    return map;
  }

  /* CSV / Semikolonliste mit Kopfzeile */
  function parseCsv(text) {
    const rows = NWT.Net.csv(text);
    if (rows.length < 2 || rows[0].length < 2) return [];
    const head = rows[0].map(h => h.toLowerCase());
    const col = names => head.findIndex(h => names.some(n => h.indexOf(n) >= 0));
    const iIp = col(['ip-adresse', 'ipaddress', 'ip address', 'ip']);
    const iMac = col(['mac']);
    const iName = col(['hostname', 'name', 'gerät', 'geraet', 'host']);
    const iRoom = col(['raum', 'room']);
    const iRack = col(['rack', 'schrank']);
    const iVendor = col(['hersteller', 'vendor', 'manufacturer']);
    if (iIp < 0 && iMac < 0) return [];

    const out = [];
    rows.slice(1).forEach(f => {
      const ip = iIp >= 0 ? f[iIp] : '';
      const mac = iMac >= 0 ? normMac(f[iMac]) : '';
      if (!isUsableIp(ip) && !mac) return;
      const h = blankHost(isUsableIp(ip) ? ip : '');
      h.mac = mac;
      h.hostname = iName >= 0 ? (f[iName] || '') : '';
      h.vendor = (iVendor >= 0 ? f[iVendor] : '') || vendorFor(mac);
      if (iRoom >= 0 && f[iRoom]) h.room = f[iRoom];
      if (iRack >= 0 && f[iRack]) h.rack = f[iRack];
      h.sources.push('CSV');
      out.push(h);
    });
    return out;
  }

  /* Ausgabe des mitgelieferten Analyse-Skripts */
  function parseScanJson(obj) {
    const out = { hosts: [], subnets: [], meta: null, ipLinks: [], local: {} };
    if (!obj || obj.tool !== 'nwt-scan' || !Array.isArray(obj.hosts)) return out;
    out.meta = {
      generated: obj.generated || '', host: obj.scannedFrom || '',
      version: Number(obj.version) || 1,
      iface: String(obj.interface || ''),
      wifi: obj.wifi && obj.wifi.ssid ? String(obj.wifi.ssid) : ''
    };
    if (obj.scan && typeof obj.scan === 'object') {
      const scan = obj.scan;
      out.meta.scan = { first: String(scan.first || ''), last: String(scan.last || ''),
        selected: Number(scan.selected) || 0, completed: Number(scan.completed) || 0,
        omitted: Number(scan.omitted) || 0, cancelled: !!scan.cancelled, error: String(scan.error || '') };
    }
    out.subnets = Array.isArray(obj.subnets) ? obj.subnets : [];
    if (isUsableIp(String(obj.gateway || ''))) out.local.gateway = String(obj.gateway);
    if (isUsableIp(String(obj.localAddress || ''))) out.local.self = String(obj.localAddress);

    obj.hosts.forEach(x => {
      if (!x || typeof x !== 'object') return;
      const ip = String(x.ip || '');
      if (!isUsableIp(ip)) return;
      const h = blankHost(ip);
      h.mac = normMac(x.mac);
      h.hostname = String(x.hostname || '');
      h.vendor = String(x.vendor || '') || vendorFor(h.mac);
      h.os = String(x.os || '');
      if (Array.isArray(x.ports)) {
        x.ports.filter(p => p != null && Number(p.port || p) > 0 && Number(p.port || p) <= 65535).forEach(p => h.ports.push({
          port: Number(p.port || p), proto: String(p.proto || 'tcp'), service: String(p.service || '')
        }));
      }
      if (x.rtt != null) h.notes.push('Antwortzeit ' + x.rtt + ' ms');
      /* Ab Version 5 sagt das Skript, wie ein Host gefunden wurde.
         Das ist für den Anwender die eigentliche Begründung. */
      if (Array.isArray(x.discovery) && x.discovery.length) {
        h.discovery = x.discovery.map(String);
        h.notes.push('Gefunden über ' + h.discovery.join(', '));
      }
      if (x.ping === false) h.notes.push('antwortet nicht auf Ping');
      if (x.neighborState) h.notes.push('ARP-Zustand ' + String(x.neighborState));
      h.sources.push('Analyse-Skript');
      h.observation = { at: String(obj.generated || ''), source: 'Analyse-Skript',
        method: (Array.isArray(x.discovery) ? x.discovery : []).map(String).join(', '), confidence: x.ping || (x.ports || []).length ? 1 : 0.5,
        status: x.ping || (x.ports || []).length ? 'active' : 'unknown' };
      out.hosts.push(h);
    });

    if (Array.isArray(obj.links)) {
      obj.links.forEach(l => {
        const a = String(l && l.source || ''), b = String(l && l.target || '');
        if (!isUsableIp(a) || !isUsableIp(b) || a === b) return;
        out.ipLinks.push({
          a: a, b: b,
          type: String(l.type || 'logical'),
          method: String(l.method || ''),
          confidence: Number(l.confidence) || 0,
          why: String(l.description || '')
        });
      });
    }
    return out;
  }

  /* ---------------------------------------------------- Verbindungen */

  const LINK_METHODS = {
    'arp':             { label: 'ARP-Nachbar',        conn: 'logical' },
    'local-discovery': { label: 'selbst beobachtet',  conn: 'logical' },
    'same-subnet':     { label: 'gleiches Subnetz',   conn: 'logical' },
    'lldp':            { label: 'LLDP',               conn: 'gigabit' },
    'cdp':             { label: 'CDP',                conn: 'gigabit' }
  };

  function methodLabel(m) { return (LINK_METHODS[m] || {}).label || m || 'unbekannt'; }
  function connTypeFor(m) { return (LINK_METHODS[m] || {}).conn || 'logical'; }

  /**
   * Aus vielen Vermutungen einen brauchbaren Plan machen.
   *
   * Das Skript liefert bewusst jede Ableitung einzeln — für 20 Hosts
   * waren das zuletzt 56 Einträge, meist dreifach dasselbe Paar und
   * dazu ein Stern vom Scan-Rechner zu jedem gesehenen Gerät. Würde
   * man das ungefiltert übernehmen, entstünde ein unlesbarer Filz.
   *
   * Zwei Regeln reichen:
   *   1. Je Gerätepaar bleibt die bestbelegte Ableitung.
   *   2. Jedes Gerät behält genau seine beste Verbindung. Bei
   *      Gleichstand gewinnt das stärker vernetzte Gegenüber —
   *      der Verteiler, an dem tatsächlich alles hängt.
   *
   * Aus dem Stern „ich habe alle gesehen" wird so „ich hänge am
   * selben Verteiler wie alle anderen". Das ist die Aussage, die die
   * Daten hergeben — nicht mehr.
   */
  function reduceLinks(raw) {
    const best = new Map();
    raw.forEach(l => {
      const key = l.a < l.b ? l.a + '|' + l.b : l.b + '|' + l.a;
      const cur = best.get(key);
      if (!cur || l.confidence > cur.confidence) {
        best.set(key, { a: key.split('|')[0], b: key.split('|')[1], key: key,
                        type: l.type, method: l.method, confidence: l.confidence, why: l.why });
      }
    });

    const degree = {};
    best.forEach(l => { degree[l.a] = (degree[l.a] || 0) + 1; degree[l.b] = (degree[l.b] || 0) + 1; });

    const perHost = {};
    best.forEach(l => {
      (perHost[l.a] = perHost[l.a] || []).push(l);
      (perHost[l.b] = perHost[l.b] || []).push(l);
    });

    const keep = new Map();
    Object.keys(perHost).forEach(ip => {
      const sorted = perHost[ip].slice().sort((x, y) => {
        if (y.confidence !== x.confidence) return y.confidence - x.confidence;
        const ox = x.a === ip ? x.b : x.a, oy = y.a === ip ? y.b : y.a;
        if ((degree[oy] || 0) !== (degree[ox] || 0)) return (degree[oy] || 0) - (degree[ox] || 0);
        return x.key < y.key ? -1 : 1;
      });
      keep.set(sorted[0].key, sorted[0]);
    });

    const out = [];
    keep.forEach(l => out.push(l));
    out.sort((x, y) => (ipNum(x.a) - ipNum(y.a)) || (ipNum(x.b) - ipNum(y.b)));
    out.forEach(l => { l.selected = true; });
    return { links: out, dropped: raw.length - out.length };
  }

  /* ipconfig /all bzw. ip addr — liefert eigene Adresse und Gateway. */
  function parseLocal(text) {
    const info = {};
    const gw = /(?:Standardgateway|Default Gateway|default via)[^\d]*(\d{1,3}(?:\.\d{1,3}){3})/i.exec(text);
    if (gw) info.gateway = gw[1];
    const dns = /(?:DNS-Server|DNS Servers)[^\d]*(\d{1,3}(?:\.\d{1,3}){3})/i.exec(text);
    if (dns) info.dns = dns[1];
    const mask = /(?:Subnetzmaske|Subnet Mask)[^\d]*(\d{1,3}(?:\.\d{1,3}){3})/i.exec(text);
    if (mask) info.mask = mask[1];
    return info;
  }

  /* -------------------------------------------------------- Erkennung */

  function classify(host) {
    const ports = host.ports || [];
    for (const hint of PORT_HINTS) {
      if (ports.some(p => p.port === hint.port && (!hint.proto || p.proto === hint.proto))) {
        return { type: hint.type, reason: hint.why, confidence: 'hoch' };
      }
    }
    /* Nur der eigene Name zählt, nicht die Domäne: in einem
       FritzBox-Netz endet jeder Rechner auf .fritz.box — daraus
       würde sonst ein Netz voller WLAN-Router. */
    const shortName = String(host.hostname || '').split('.')[0];
    const name = shortName + ' ' + (host.vendor || '');
    for (const [re, type, why] of NAME_HINTS) {
      if (re.test(name)) return { type: type, reason: why, confidence: 'mittel' };
    }
    if (/raspberry/i.test(host.vendor)) return { type: 'raspberrypi', reason: 'Hersteller Raspberry Pi', confidence: 'hoch' };
    if (/espressif/i.test(host.vendor)) return { type: 'sensor', reason: 'Hersteller Espressif (ESP)', confidence: 'mittel' };
    /* Eine virtuelle Netzwerkkarte gehört einem Gastsystem, nicht dem
       Virtualisierungshost — daher „Server“ und nicht „Virtualisierungsserver“. */
    if (/virtuell|vmware|virtualbox|hyper-v|qemu|xen/i.test(host.vendor)) {
      return { type: 'server', reason: 'virtuelle Netzwerkkarte — vermutlich ein Gastsystem', confidence: 'mittel' };
    }
    if (ports.some(p => p.port === 80 || p.port === 443)) {
      return { type: 'server', reason: 'Webdienst erreichbar', confidence: 'niedrig' };
    }
    if (ports.some(p => p.port === 22)) {
      return { type: 'server', reason: 'SSH erreichbar', confidence: 'niedrig' };
    }
    return { type: 'pc', reason: 'keine eindeutigen Merkmale', confidence: 'niedrig' };
  }

  /** Vergleicht einen erkannten Host mit dem Projekt. */
  function matchExisting(host) {
    const devs = S.project.devices;
    if (host.mac) {
      const byMac = devs.find(d => NWT.Net.interfaces(d).some(i => normMac(i.mac) && normMac(i.mac) === host.mac));
      if (byMac) return { device: byMac, by: 'MAC' };
    }
    if (host.ip) {
      const byIp = devs.find(d => NWT.Net.interfaces(d).some(i => NWT.Net.normalizeIp(i.ip) === NWT.Net.normalizeIp(host.ip)));
      if (byIp) return { device: byIp, by: 'IP' };
    }
    if (host.hostname) {
      const hn = host.hostname.toLowerCase().split('.')[0];
      const byName = devs.find(d =>
        (d.hostname || '').toLowerCase().split('.')[0] === hn ||
        (d.name || '').toLowerCase() === host.hostname.toLowerCase());
      if (byName) return { device: byName, by: 'Name' };
    }
    return null;
  }

  /* ------------------------------------------------------------ Analyse */

  /** Hauptfunktion: beliebiger Text oder JSON → Analyseergebnis. */
  function analyze(input) {
    const text = String(input || '');
    if (!text.trim()) throw new Error('Es wurde kein Text übergeben.');

    const warnings = [];
    let hosts = [];
    let links = [];
    let macTable = [];
    let subnets = [];
    let meta = null;
    let rawIpLinks = [];
    let scanLocal = {};

    /* 1. Versuch: JSON (Analyse-Skript oder Datensatzliste) */
    const trimmed = text.trim();
    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      try {
        const obj = JSON.parse(trimmed);
        if (obj && obj.tool === 'nwt-scan') {
          const r = parseScanJson(obj);
          hosts = r.hosts; subnets = r.subnets; meta = r.meta;
          rawIpLinks = r.ipLinks; scanLocal = r.local;
        } else if (Array.isArray(obj)) {
          obj.forEach(x => {
            if (!x || typeof x !== 'object') return;
            const ip = String(x.ip || x.IPAddress || x.address || '');
            const mac = normMac(x.mac || x.MACAddress || x.LinkLayerAddress);
            if (!isUsableIp(ip) && !mac) return;
            const h = blankHost(isUsableIp(ip) ? ip : '');
            h.mac = mac;
            h.hostname = String(x.hostname || x.name || x.Name || '');
            h.vendor = String(x.vendor || '') || vendorFor(mac);
            h.sources.push('JSON');
            hosts.push(h);
          });
        } else {
          warnings.push('Die JSON-Struktur ist unbekannt und wurde übersprungen.');
        }
      } catch (e) {
        warnings.push('Der Text beginnt wie JSON, ließ sich aber nicht auswerten: ' + e.message);
      }
    }

    /* 2. Textparser laufen immer mit — kombinierte Einfügungen sind üblich. */
    if (!hosts.length || trimmed.charAt(0) !== '{') {
      mergeHosts(hosts, parseNmapXml(text));
      mergeHosts(hosts, parseNmapNormal(text));
      mergeHosts(hosts, parseNmapGrep(text));
      mergeHosts(hosts, parseArp(text));
      mergeHosts(hosts, parseCsv(text));
      const nb = parseNeighbors(text);
      mergeHosts(hosts, nb.hosts);
      links = nb.links;
      macTable = parseMacTable(text);
    }

    const local = Object.assign({}, scanLocal.gateway ? { gateway: scanLocal.gateway } : {}, parseLocal(text));
    if (scanLocal.gateway) local.gateway = scanLocal.gateway;
    if (scanLocal.self) local.self = scanLocal.self;

    if (!hosts.length) {
      throw new Error('Im Text wurden keine IP- oder MAC-Adressen gefunden. ' +
        'Unterstützt werden u. a. arp -a, ip neigh, nmap, LLDP/CDP, CSV und die Ausgabe des Analyse-Skripts.');
    }

    /* Anreichern: Typvorschlag, Abgleich mit dem Projekt, Switchport */
    hosts.forEach(h => {
      const g = classify(h);
      h.guessType = g.type;
      h.guessReason = g.reason;
      h.confidence = g.confidence;
      const m = matchExisting(h);
      h.existingId = m ? m.device.id : '';
      h.matchedBy = m ? m.by : '';
      h.state = m ? 'bekannt' : 'neu';
      h.selected = true;
      if (h.mac) {
        const mt = macTable.find(x => x.mac === h.mac);
        if (mt) { h.switchPort = mt.port; h.switchVlan = mt.vlan; }
      }
      /* Das Standardgateway ist keine Vermutung, sondern eine Auskunft
         des Betriebssystems — sie schlägt jede Porthäufigkeit. Nur
         wenn der Name bereits eine genauere Bauform nennt (etwa
         WLAN-Router), bleibt diese stehen. */
      if (local.gateway && h.ip === local.gateway) {
        h.isGateway = true;
        const routerish = ['router', 'wlan_router', 'firewall', 'gateway', 'modem', 'switch_l3'];
        if (routerish.indexOf(h.guessType) < 0) {
          h.guessType = 'router';
          h.guessReason = 'Standardgateway dieses Netzes';
          h.confidence = 'hoch';
        } else if (h.confidence !== 'hoch') {
          h.guessReason = h.guessReason + ', zugleich Standardgateway';
          h.confidence = 'hoch';
        }
      }
      h.subnet = NWT.Net.subnet(h.ip, subnets);
      h.subnetAssumed = !h.subnet && !!h.ip;
      if (h.subnetAssumed) h.subnet = h.ip.split('.').slice(0, 3).join('.') + '.0/24';
    });

    hosts.sort((a, b) => ipNum(a.ip) - ipNum(b.ip));
    if (hosts.some(h => h.subnetAssumed)) warnings.push('Für Hosts ohne Präfixangabe wird /24 nur als Annahme zur Gruppierung verwendet.');
    if (meta && meta.scan) {
      const scan = meta.scan;
      warnings.push('Scanbereich ' + scan.first + ' – ' + scan.last + ': ' + scan.completed + ' von ' + scan.selected + ' Adressen geprüft; ' + scan.omitted + ' Adressen außerhalb der Auswahl.');
      if (scan.cancelled) warnings.push('Die Aufnahme wurde vorzeitig beendet. Fehlende Geräte sind damit nicht als offline nachgewiesen.');
      if (scan.error) warnings.push('Scanner meldet: ' + scan.error);
    }

    /* Verbindungen aus dem Scan verdichten und benennen. Der eigene
       Rechner hängt per WLAN am Netz, wenn das Skript es so meldet —
       das ist belegt und darf in die Leitungsart einfließen. */
    const reduced = reduceLinks(rawIpLinks);
    const byIp = {};
    hosts.forEach(h => { if (h.ip) byIp[h.ip] = h; });
    reduced.links.forEach(l => {
      const wifi = meta && meta.wifi && local.self && (l.a === local.self || l.b === local.self);
      l.connType = wifi ? 'wlan' : connTypeFor(l.method);
      l.methodLabel = methodLabel(l.method);
      l.aName = byIp[l.a] ? (byIp[l.a].hostname || byIp[l.a].ip) : l.a;
      l.bName = byIp[l.b] ? (byIp[l.b].hostname || byIp[l.b].ip) : l.b;
      if (wifi) l.why = (l.why ? l.why + ' ' : '') + 'Scan-Rechner über WLAN „' + meta.wifi + '“.';
    });

    lastResult = {
      hosts: hosts,
      links: links,
      ipLinks: reduced.links,
      ipLinksDropped: reduced.dropped,
      macTable: macTable,
      subnets: subnets.length ? subnets : uniqueSubnets(hosts),
      local: local,
      meta: meta,
      warnings: warnings,
      sources: uniqueSources(hosts),
      at: U.nowIso()
    };
    NWT.emit('discovery', lastResult);
    return lastResult;
  }

  function ipNum(ip) {
    if (!ip) return 0;
    return ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
  }

  function uniqueSubnets(hosts) {
    const set = [];
    hosts.forEach(h => { if (h.subnet && set.indexOf(h.subnet) < 0) set.push(h.subnet); });
    return set;
  }

  function uniqueSources(hosts) {
    const set = [];
    hosts.forEach(h => h.sources.forEach(s => { if (set.indexOf(s) < 0) set.push(s); }));
    return set;
  }

  /* ------------------------------------------------------- Übernehmen */

  /**
   * Übernimmt ausgewählte Hosts ins Projekt.
   * opts: { connectTo: deviceId|'', createArea: bool, overwrite: bool }
   */
  /**
   * Anordnung aus den erkannten Verbindungen.
   *
   * Ein Raster reiht Geräte nach IP-Adresse auf; die Leitungen laufen
   * dann kreuz und quer. Kennt man den Sternmittelpunkt, wird daraus
   * ein lesbarer Plan: Verteiler oben, was daran hängt darunter.
   *
   * Liefert eine Zuordnung IP → {x,y} oder null, wenn die Daten keinen
   * Verteiler hergeben — dann bleibt es beim Raster.
   */
  function planLayout(chosen, links, startX, startY) {
    const sel = (links || []).filter(l => l.selected);
    if (!sel.length) return null;

    const deg = {};
    sel.forEach(l => { deg[l.a] = (deg[l.a] || 0) + 1; deg[l.b] = (deg[l.b] || 0) + 1; });

    /* Nur neu angelegte Geräte werden gesetzt — vorhandene stehen,
       wo der Anwender sie hingestellt hat. */
    const placeable = {};
    chosen.forEach(h => { if (h.ip && !h.existingId) placeable[h.ip] = true; });

    const hubs = Object.keys(deg)
      .filter(ip => deg[ip] >= 3 && placeable[ip])
      .sort((a, b) => deg[b] - deg[a] || ipNum(a) - ipNum(b));
    if (!hubs.length) return null;

    const hubOf = {};
    sel.forEach(l => {
      [[l.a, l.b], [l.b, l.a]].forEach(pair => {
        const ip = pair[0], other = pair[1];
        if (!placeable[ip] || hubs.indexOf(ip) >= 0) return;
        if (!hubOf[ip] || (deg[other] || 0) > (deg[hubOf[ip]] || 0)) hubOf[ip] = other;
      });
    });

    const stepX = C.NODE_W + 44;
    const stepY = C.NODE_H + 74;
    const pos = {};
    let cursorX = startX;

    hubs.forEach(hub => {
      const leaves = Object.keys(hubOf).filter(ip => hubOf[ip] === hub).sort((a, b) => ipNum(a) - ipNum(b));
      const cols = Math.max(2, Math.min(6, Math.ceil(Math.sqrt(leaves.length || 1))));
      const width = cols * stepX;
      pos[hub] = { x: cursorX + Math.round((width - stepX) / 2), y: startY };
      leaves.forEach((ip, i) => {
        pos[ip] = { x: cursorX + (i % cols) * stepX, y: startY + stepY + Math.floor(i / cols) * stepY };
      });
      delete hubOf[hub];
      cursorX += width + stepX;
    });

    /* Was an keinem erkannten Verteiler hängt, kommt in eine eigene
       Reihe darunter — sichtbar, aber ohne falsche Nachbarschaft. */
    const rest = chosen.filter(h => h.ip && placeable[h.ip] && !pos[h.ip]).map(h => h.ip);
    if (rest.length) {
      const bottom = Math.max.apply(null, Object.keys(pos).map(ip => pos[ip].y)) + stepY * 2;
      const cols = Math.max(4, Math.min(8, rest.length));
      rest.forEach((ip, i) => {
        pos[ip] = { x: startX + (i % cols) * stepX, y: bottom + Math.floor(i / cols) * stepY };
      });
    }
    return pos;
  }

  function apply(hosts, opts) {
    opts = opts || {};
    const chosen = hosts.filter(h => h.selected);
    if (!chosen.length) return { created: 0, updated: 0 };

    NWT.History.record('Netzwerkanalyse übernehmen');

    const P = S.project;
    let created = 0, updated = 0;
    const newIds = [];

    /* Platzierung: freies Feld unterhalb des bisherigen Inhalts. */
    const b = S.contentBounds(0);
    const startX = b.empty ? 80 : Math.round(b.x / 20) * 20;
    const startY = b.empty ? 80 : Math.round((b.y + b.h + 90) / 20) * 20;
    const perRow = Math.max(4, Math.min(8, Math.ceil(Math.sqrt(chosen.length))));
    const stepX = C.NODE_W + 44;
    const stepY = C.NODE_H + 74;
    const plan = planLayout(chosen, (lastResult || {}).ipLinks || [], startX, startY);

    S.batch(() => chosen.forEach((h, i) => {
      const match = matchExisting(h);
      const existing = match ? match.device : null;
      h.existingId = existing ? existing.id : '';
      if (existing) {
        let changed = false;
        /* Vorhandene Angaben nur ergänzen, nicht überschreiben. */
        const fill = (key, value) => {
          if (!value) return;
          if (!existing[key] || opts.overwrite) {
            if (existing[key] !== value) { existing[key] = value; changed = true; }
          }
        };
        fill('ip', h.ip);
        fill('mac', h.mac);
        fill('hostname', h.hostname);
        fill('manufacturer', h.vendor);
        fill('os', h.os);
        if (existing.status === 'unknown' && (!h.observation || h.observation.status === 'active')) { existing.status = 'active'; changed = true; }
        if (h.observation) {
          if (!existing.observations) existing.observations = [];
          if (!existing.observations.some(o => o.at === h.observation.at && o.method === h.observation.method)) {
            existing.observations.push(U.clone(h.observation)); existing.observations = existing.observations.slice(-20); changed = true;
          }
        }
        if (changed) updated++;
        h.appliedId = existing.id;
        return;
      }

      const p = plan && h.ip ? plan[h.ip] : null;
      const x = p ? p.x : startX + (i % perRow) * stepX;
      const y = p ? p.y : startY + Math.floor(i / perRow) * stepY;
      const d = S.addDevice(h.guessType, x, y);
      d.name = h.hostname ? h.hostname.split('.')[0] : (h.ip || 'Unbekannt');
      d.ip = h.ip;
      d.mac = h.mac;
      d.hostname = h.hostname;
      d.manufacturer = h.vendor;
      d.os = h.os;
      d.status = h.observation ? h.observation.status : 'unknown';
      if (h.observation) d.observations = [U.clone(h.observation)];
      d.description = 'Automatisch erkannt (' + h.sources.join(', ') + ') — ' + h.guessReason +
        '. Zuverlässigkeit: ' + h.confidence + '.';
      if (h.ports && h.ports.length) {
        d.notes = 'Offene Ports: ' + h.ports.slice(0, 24)
          .map(p => p.port + '/' + p.proto + (p.service ? ' ' + p.service : '')).join(', ');
      }
      if (h.room) d.room = h.room;
      if (h.rack) d.rack = h.rack;
      created++;
      newIds.push(d.id);
      h.appliedId = d.id;
      h.existingId = d.id;
      h.state = 'bekannt';
    }));

    /* Verbindungen: erst die aus dem Scan abgeleiteten, dann echte
       Nachbarschaften aus LLDP/CDP, zuletzt gegen den Sammelpunkt. */
    let linked = 0;
    const result = lastResult || { links: [] };

    /* IP → Gerät: frisch angelegte und im Projekt vorhandene zusammen,
       sonst hängen Verbindungen zu bereits bekannten Geräten in der
       Luft. */
    const ipMap = {};
    P.devices.forEach(d => { if (d.ip) ipMap[String(d.ip).split('/')[0]] = d.id; });
    chosen.forEach(h => { if (h.ip && h.appliedId) ipMap[h.ip] = h.appliedId; });

    S.batch(() => {
    (result.ipLinks || []).forEach(l => {
      if (!l.selected) return;
      const from = ipMap[l.a], to = ipMap[l.b];
      if (!from || !to || from === to) return;
      if (S.connectionBetween && S.connectionBetween(from, to)) return;
      const c = S.addConnection(from, to, l.connType || 'logical');
      if (!c) return;
      c.description = (l.why || '') + ' Methode: ' + (l.methodLabel || l.method) +
        ', Zuverlässigkeit ' + Math.round((l.confidence || 0) * 100) + ' %.';
      c.observations = [{ at: (result.meta || {}).generated || result.at, source: 'Analyse', method: l.method,
        confidence: U.clamp(Number(l.confidence) || 0, 0, 1), status: 'observed' }];
      linked++;
    });

    (result.links || []).forEach(l => {
      const a = findDeviceByNameOrIp(l.remoteName, l.remoteIp);
      if (!a) return;
      const target = opts.connectTo ? S.dev(opts.connectTo) : null;
      if (!target || target.id === a.id) return;
      if (P.connections.some(c => c.source === target.id && c.target === a.id && c.sourcePort === (l.localPort || '') && c.targetPort === (l.remotePort || ''))) return;
      const c = S.addConnection(target.id, a.id, 'gigabit');
      if (c) {
        c.sourcePort = l.localPort || '';
        c.targetPort = l.remotePort || '';
        c.description = 'Aus ' + l.source + ' erkannt';
        linked++;
      }
    });

    if (opts.connectTo && S.dev(opts.connectTo)) {
      newIds.forEach(id => {
        if (S.connectionsOf(id).length) return;
        const c = S.addConnection(opts.connectTo, id, 'gigabit');
        if (c) {
          const h = chosen.find(x => x.appliedId === id);
          if (h && h.switchPort) { c.sourcePort = h.switchPort; if (h.switchVlan) c.vlan = h.switchVlan; }
          linked++;
        }
      });
    }
    });

    if (opts.createArea && newIds.length) {
      const rects = newIds.map(id => S.deviceRect(S.dev(id)));
      const minX = Math.min.apply(null, rects.map(r => r.x));
      const minY = Math.min.apply(null, rects.map(r => r.y));
      const maxX = Math.max.apply(null, rects.map(r => r.x + r.w));
      const maxY = Math.max.apply(null, rects.map(r => r.y + r.h));
      const a = S.addArea(minX - 34, minY - 50, (maxX - minX) + 68, (maxY - minY) + 84);
      a.label = 'Automatisch erkannt';
      a.sublabel = (result.subnets || []).join(' · ') + ' · ' + U.formatDate(result.at);
      a.color = '#0891b2';
    }

    S.reindex();
    S.touch();
    NWT.emit('change', { structural: true });
    if (newIds.length) { S.select(newIds); NWT.emit('selection'); }

    return { created: created, updated: updated, linked: linked, ids: newIds };
  }

  function findDeviceByNameOrIp(name, ip) {
    const devs = S.project.devices;
    if (ip) {
      const d = devs.find(x => (x.ip || '').split('/')[0] === ip);
      if (d) return d;
    }
    if (name) {
      const n = String(name).toLowerCase().split('.')[0];
      return devs.find(x => (x.hostname || '').toLowerCase().split('.')[0] === n ||
                            (x.name || '').toLowerCase() === n) || null;
    }
    return null;
  }

  function last() { return lastResult; }

  return {
    analyze, apply, classify, last, normMac, vendorFor,
    PORT_HINTS, NAME_HINTS, OUI
  };
})();
