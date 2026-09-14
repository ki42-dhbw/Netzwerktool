/* ============================================================
   01 — Katalog: Gerätetypen, Verbindungstypen, Status, Ebenen
   Alles hier ist datengetrieben: Sidebar, Suche, Auto-Benennung,
   Icons und Portlisten werden aus diesen Tabellen erzeugt.
   Ein neuer Gerätetyp = ein Eintrag in DEVICE_TYPES.
   ============================================================ */

NWT.Catalog = (function () {

  /* Feste Kachelmaße auf der Zeichenfläche. */
  const NODE_W = 132;
  const NODE_H = 88;
  const JUNCTION = 16;      // Kantenlänge des Abzweigknotens
  /* Bildstreifen der Kachel: 120 × 48 zzgl. Rand.
     Zeigt die Kachel ein Bild, entfällt das Strichsymbol — der Streifen
     sagt bereits, worum es geht. Die Kachel wächst deshalb nur um
     STRIP_EXTRA statt um die volle Streifenhöhe. */
  const PHOTO_H = 58;
  const STRIP_EXTRA = 20;
  const STRIP_SHIFT = 19;   // Verschiebung des Textblocks unter den Streifen

  const CATEGORIES = [
    { id: 'net',    label: 'Netzwerkgeräte' },
    { id: 'server', label: 'Server' },
    { id: 'client', label: 'Clients' },
    { id: 'iot',    label: 'IoT & Embedded' },
    { id: 'wan',    label: 'Netzwerk / Internet' },
    { id: 'mobra',  label: 'Modellbahn (Digital)' },
    { id: 'misc',   label: 'Sonstige Elemente' },
    { id: 'deco',   label: 'Text & Grafik' },
    { id: 'custom', label: 'Eigene Symbole' }
  ];

  /* ports: {count,prefix} erzeugt "Port 1..n"; ports:{names:[…]} nimmt die Liste. */
  const DEVICE_TYPES = {
    /* --- Netzwerkgeräte --- */
    router:          { label: 'Router',              cat: 'net',    icon: 'ic-router',          color: '#2563eb', ports: { count: 4, prefix: 'Port ', extra: ['WAN'] } },
    switch:          { label: 'Switch',              cat: 'net',    icon: 'ic-switch',          color: '#0ea5e9', ports: { count: 8, prefix: 'Port ' } },
    switch_managed:  { label: 'Managed Switch',      cat: 'net',    icon: 'ic-switch-managed',  color: '#0ea5e9', ports: { count: 24, prefix: 'Port ', extra: ['Uplink 1', 'Uplink 2'] } },
    switch_l3:       { label: 'Layer-3-Switch',      cat: 'net',    icon: 'ic-switch-l3',       color: '#0284c7', ports: { count: 24, prefix: 'Port ', extra: ['SFP+ 1', 'SFP+ 2'] } },
    firewall:        { label: 'Firewall',            cat: 'net',    icon: 'ic-firewall',        color: '#dc2626', ports: { names: ['WAN', 'LAN', 'DMZ', 'MGMT'] } },
    accesspoint:     { label: 'Access Point',        cat: 'net',    icon: 'ic-ap',              color: '#0891b2', ports: { names: ['LAN/PoE', 'wlan0', 'wlan1'] } },
    wlan_router:     { label: 'WLAN-Router',         cat: 'net',    icon: 'ic-wifi-router',     color: '#0891b2', ports: { count: 4, prefix: 'LAN ', extra: ['WAN', 'wlan0'] } },
    modem:           { label: 'Modem',               cat: 'net',    icon: 'ic-modem',           color: '#64748b', ports: { names: ['LINE', 'LAN'] } },
    /* Ein Abzweig ist kein Gerät, aber ein Netzobjekt: er wird
       verbunden, zählt aber nicht in der Gerätestatistik mit. */
    junction:        { label: 'Abzweig / Knotenpunkt', cat: 'net', icon: 'ic-junction', color: '#475569', shape: 'junction', ports: { names: [] } },
    gateway:         { label: 'Gateway',             cat: 'net',    icon: 'ic-gateway',         color: '#475569', ports: { names: ['WAN', 'LAN'] } },

    /* --- Server --- */
    server:          { label: 'Server',              cat: 'server', icon: 'ic-server',          color: '#7c3aed', ports: { names: ['eth0', 'eth1', 'iDRAC'] } },
    webserver:       { label: 'Webserver',           cat: 'server', icon: 'ic-webserver',       color: '#7c3aed', ports: { names: ['eth0', 'eth1'] } },
    dbserver:        { label: 'Datenbankserver',     cat: 'server', icon: 'ic-database',        color: '#6d28d9', ports: { names: ['eth0', 'eth1'] } },
    fileserver:      { label: 'Fileserver',          cat: 'server', icon: 'ic-fileserver',      color: '#6d28d9', ports: { names: ['eth0', 'eth1'] } },
    backupserver:    { label: 'Backupserver',        cat: 'server', icon: 'ic-backup',          color: '#5b21b6', ports: { names: ['eth0', 'eth1'] } },
    nas:             { label: 'NAS',                 cat: 'server', icon: 'ic-nas',             color: '#8b5cf6', ports: { names: ['eth0', 'eth1'] } },
    vmserver:        { label: 'Virtualisierungsserver', cat: 'server', icon: 'ic-vm',           color: '#7c3aed', ports: { names: ['vmnic0', 'vmnic1', 'vmnic2', 'vmnic3'] } },
    aiserver:        { label: 'KI-Server',           cat: 'server', icon: 'ic-ai',              color: '#c026d3', ports: { names: ['eth0', 'eth1', 'ib0'] } },
    gpuserver:       { label: 'GPU-Server',          cat: 'server', icon: 'ic-gpu',             color: '#c026d3', ports: { names: ['eth0', 'eth1', 'ib0'] } },

    /* --- Clients --- */
    pc:              { label: 'Desktop-PC',          cat: 'client', icon: 'ic-pc',              color: '#059669', ports: { names: ['eth0'] } },
    notebook:        { label: 'Notebook',            cat: 'client', icon: 'ic-laptop',          color: '#059669', ports: { names: ['eth0', 'wlan0'] } },
    tablet:          { label: 'Tablet',              cat: 'client', icon: 'ic-tablet',          color: '#10b981', ports: { names: ['wlan0'] } },
    smartphone:      { label: 'Smartphone',          cat: 'client', icon: 'ic-phone',           color: '#10b981', ports: { names: ['wlan0'] } },
    thinclient:      { label: 'Thin Client',         cat: 'client', icon: 'ic-thinclient',      color: '#047857', ports: { names: ['eth0'] } },
    ipc:             { label: 'Industrie-PC',        cat: 'client', icon: 'ic-ipc',             color: '#047857', ports: { names: ['eth0', 'eth1'] } },

    /* --- IoT & Embedded --- */
    raspberrypi:     { label: 'Raspberry Pi',        cat: 'iot',    icon: 'ic-rpi',             color: '#d97706', ports: { names: ['eth0', 'wlan0'] } },
    jetson:          { label: 'NVIDIA Jetson',       cat: 'iot',    icon: 'ic-jetson',          color: '#d97706', ports: { names: ['eth0', 'wlan0'] } },
    mcu:             { label: 'Mikrocontroller',     cat: 'iot',    icon: 'ic-mcu',             color: '#b45309', ports: { names: ['UART', 'SPI', 'I2C'] } },
    sensor:          { label: 'IoT-Sensor',          cat: 'iot',    icon: 'ic-sensor',          color: '#ca8a04', ports: { names: ['wlan0'] } },
    camera:          { label: 'Kamera',              cat: 'iot',    icon: 'ic-camera',          color: '#ca8a04', ports: { names: ['eth0/PoE'] } },
    plc:             { label: 'SPS / PLC',           cat: 'iot',    icon: 'ic-plc',             color: '#b45309', ports: { names: ['X1', 'X2', 'PROFINET'] } },

    /* --- Netzwerk / Internet --- */
    internet:        { label: 'Internet',            cat: 'wan',    icon: 'ic-internet',        color: '#475569', ports: { names: ['Uplink'] } },
    cloud:           { label: 'Cloud',               cat: 'wan',    icon: 'ic-cloud',           color: '#475569', ports: { names: ['Uplink'] } },
    vpn:             { label: 'VPN',                 cat: 'wan',    icon: 'ic-vpn',             color: '#7c3aed', ports: { names: ['Tunnel'] } },
    wan:             { label: 'WAN',                 cat: 'wan',    icon: 'ic-wan',             color: '#16a34a', ports: { names: ['Uplink'] } },
    lan:             { label: 'LAN',                 cat: 'wan',    icon: 'ic-lan',             color: '#0ea5e9', ports: { names: ['Uplink'] } },
    vlan:            { label: 'VLAN',                cat: 'wan',    icon: 'ic-vlan',            color: '#0891b2', ports: { names: ['Tagged'] } },

    /* --- Modellbahn: Komponenten mit Netzwerkschnittstelle ---
       Die Portnamen sind bearbeitbare Vorschläge, keine Herstellerangaben. */
    mb_ecos:         { label: 'ESU ECoS',            cat: 'mobra',  icon: 'ic-mb-ecos',         color: '#be123c', ports: { names: ['LAN', 'ECoSlink', 'Gleisausgang', 'Programmiergleis', 'S88'] } },
    mb_cs3:          { label: 'Märklin CS3',         cat: 'mobra',  icon: 'ic-mb-cs3',          color: '#be123c', ports: { names: ['LAN 1', 'LAN 2', 'WLAN', 'CAN 1', 'CAN 2', 'Gleisausgang'] } },
    mb_cs2:          { label: 'Märklin CS2',         cat: 'mobra',  icon: 'ic-mb-cs3',          color: '#9f1239', ports: { names: ['LAN', 'CAN', 'Gleisausgang', 'Programmiergleis', 'S88'] } },
    mb_ms2:          { label: 'Märklin Mobile Station', cat: 'mobra', icon: 'ic-mb-throttle',   color: '#f43f5e', ports: { names: ['Anschlusskabel', 'Gleisbox'] } },
    mb_z21:          { label: 'Roco/Fleischmann Z21', cat: 'mobra', icon: 'ic-mb-z21',          color: '#e11d48', ports: { names: ['LAN', 'WLAN', 'Gleisausgang', 'Programmiergleis', 'X-Bus', 'LocoNet'] } },
    mb_intellibox:   { label: 'Uhlenbrock Intellibox', cat: 'mobra', icon: 'ic-mb-intellibox',  color: '#e11d48', ports: { names: ['LAN', 'LocoNet T', 'LocoNet B', 'Gleisausgang', 'Booster'] } },
    mb_dr5000:       { label: 'Digikeijs DR5000',    cat: 'mobra',  icon: 'ic-mb-dr5000',       color: '#f43f5e', ports: { names: ['LAN', 'WLAN', 'LocoNet B', 'XpressNet', 'S88', 'Gleisausgang'] } },
    mb_mx10:         { label: 'ZIMO MX10',           cat: 'mobra',  icon: 'ic-mb-mx10',         color: '#be123c', ports: { names: ['LAN', 'CAN', 'XNET', 'Schiene 1', 'Schiene 2'] } },
    mb_tams:         { label: 'Tams MasterControl',  cat: 'mobra',  icon: 'ic-mb-tams',         color: '#e11d48', ports: { names: ['LAN', 'Gleisausgang', 'Booster', 'S88'] } },
    mb_dccex:        { label: 'DCC-EX Zentrale',     cat: 'mobra',  icon: 'ic-mb-dccex',        color: '#f43f5e', ports: { names: ['WLAN', 'LAN', 'Gleis Haupt', 'Gleis Programmier'] } },
    mb_booster:      { label: 'Booster',             cat: 'mobra',  icon: 'ic-mb-booster',      color: '#9f1239', ports: { names: ['Eingang', 'Gleisausgang', 'CDE'] } },
    mb_feedback:     { label: 'Rückmeldemodul',      cat: 'mobra',  icon: 'ic-mb-feedback',     color: '#9f1239', ports: { names: ['LAN', 'S88 In', 'S88 Out', 'Melder 1–16'] } },
    mb_gateway:      { label: 'Bus-Gateway (LocoNet/XpressNet)', cat: 'mobra', icon: 'ic-mb-gateway', color: '#9f1239', ports: { names: ['LAN', 'LocoNet', 'XpressNet', 'S88'] } },
    mb_throttle:     { label: 'WLAN-Handregler',     cat: 'mobra',  icon: 'ic-mb-throttle',     color: '#e11d48', ports: { names: ['WLAN'] } },
    mb_pc:           { label: 'Steuerrechner (JMRI/Rocrail)', cat: 'mobra', icon: 'ic-mb-pc',   color: '#be123c', ports: { names: ['eth0', 'wlan0', 'USB'] } },

    /* --- Sonstige --- */
    printer:         { label: 'Drucker',             cat: 'misc',   icon: 'ic-printer',         color: '#64748b', ports: { names: ['USB'] } },
    netprinter:      { label: 'Netzwerkdrucker',     cat: 'misc',   icon: 'ic-netprinter',      color: '#64748b', ports: { names: ['eth0', 'wlan0'] } },
    storage:         { label: 'Speicher',            cat: 'misc',   icon: 'ic-storage',         color: '#64748b', ports: { names: ['SAS', 'FC'] } },
    building:        { label: 'Gebäude',             cat: 'misc',   icon: 'ic-building',        color: '#334155', ports: { names: [] } },
    room:            { label: 'Raum',                cat: 'misc',   icon: 'ic-room',            color: '#334155', ports: { names: [] } },
    rack:            { label: 'Rack',                cat: 'misc',   icon: 'ic-rack',            color: '#334155', ports: { names: [] } },
    /* --- Text & Grafik ---
       shape 'shape' heißt: Dekoration. Kein Netzobjekt, keine Ports,
       nicht verbindbar, zählt nicht als Gerät. figure/w/h sind die
       Vorgaben beim Anlegen; der Anwender ändert sie danach frei. */
    text:            { label: 'Textfeld',            cat: 'deco',   icon: 'ic-text',            color: '#0f172a', shape: 'text', ports: { names: [] } },
    note:            { label: 'Freie Notiz',         cat: 'deco',   icon: 'ic-note',            color: '#a16207', shape: 'note', ports: { names: [] } },
    deco_rect:       { label: 'Rahmen',              cat: 'deco',   icon: 'ic-shape-rect',      color: '#64748b', shape: 'shape', figure: 'rect',     w: 240, h: 160, ports: { names: [] } },
    deco_round:      { label: 'Rahmen abgerundet',   cat: 'deco',   icon: 'ic-shape-round',     color: '#64748b', shape: 'shape', figure: 'round',    w: 240, h: 160, ports: { names: [] } },
    deco_circle:     { label: 'Kreis',               cat: 'deco',   icon: 'ic-shape-circle',    color: '#64748b', shape: 'shape', figure: 'ellipse',  w: 160, h: 160, ports: { names: [] } },
    deco_ellipse:    { label: 'Ellipse',             cat: 'deco',   icon: 'ic-shape-ellipse',   color: '#64748b', shape: 'shape', figure: 'ellipse',  w: 240, h: 150, ports: { names: [] } },
    deco_diamond:    { label: 'Raute',               cat: 'deco',   icon: 'ic-shape-diamond',   color: '#64748b', shape: 'shape', figure: 'diamond',  w: 190, h: 150, ports: { names: [] } },
    deco_triangle:   { label: 'Dreieck',             cat: 'deco',   icon: 'ic-shape-triangle',  color: '#64748b', shape: 'shape', figure: 'triangle', w: 190, h: 160, ports: { names: [] } },
    deco_hexagon:    { label: 'Sechseck',            cat: 'deco',   icon: 'ic-shape-hexagon',   color: '#64748b', shape: 'shape', figure: 'hexagon',  w: 210, h: 160, ports: { names: [] } },
    deco_star:       { label: 'Stern',               cat: 'deco',   icon: 'ic-shape-star',      color: '#ca8a04', shape: 'shape', figure: 'star',     w: 140, h: 140, ports: { names: [] } },
    deco_line:       { label: 'Linie',               cat: 'deco',   icon: 'ic-shape-line',      color: '#64748b', shape: 'shape', figure: 'line',     w: 240, h: 24,  ports: { names: [] } },
    deco_arrow:      { label: 'Pfeil',               cat: 'deco',   icon: 'ic-shape-arrow',     color: '#64748b', shape: 'shape', figure: 'arrow',    w: 220, h: 40,  ports: { names: [] } },
    deco_arrow2:     { label: 'Doppelpfeil',         cat: 'deco',   icon: 'ic-shape-arrow2',    color: '#64748b', shape: 'shape', figure: 'arrow2',   w: 220, h: 40,  ports: { names: [] } },
    deco_bracket:    { label: 'Geschweifte Klammer', cat: 'deco',   icon: 'ic-shape-bracket',   color: '#64748b', shape: 'shape', figure: 'bracket',  w: 34,  h: 220, ports: { names: [] } }
  };

  /* Verbindungsarten, nach Kategorien gruppiert. Die Auswahlliste im Dialog
     baut daraus optgroup-Blöcke — flach wären 48 Einträge unbenutzbar.
     speed ist ein bearbeitbarer Vorschlag und bleibt leer, wo es keinen
     belegten Standardwert gibt. */
  const CONN_CATEGORIES = [
    { id: 'net',   label: 'Netzwerk' },
    { id: 'radio', label: 'Funk' },
    { id: 'peri',  label: 'Peripherie' },
    { id: 'bus',   label: 'Feldbus & Industrie' },
    { id: 'mobra', label: 'Modellbahn' },
    { id: 'power', label: 'Strom' },
    { id: 'misc',  label: 'Sonstiges' }
  ];

  /* Strichmuster zur Auswahl. Freie stroke-dasharray-Eingaben gibt es
     bewusst nicht — fünf Muster decken jeden lesbaren Netzplan ab. */
  const DASH_PRESETS = [
    { value: '',         label: 'durchgezogen' },
    { value: '6 4',      label: 'gestrichelt' },
    { value: '1 4',      label: 'gepunktet' },
    { value: '10 4 2 4', label: 'Strich-Punkt' },
    { value: '14 5',     label: 'lang gestrichelt' }
  ];

  const CONNECTION_TYPES = {
    /* --- Netzwerk --- */
    ethernet:  { label: 'Ethernet',              cat: 'net',   speed: '100 Mbit/s', color: '#64748b', width: 1.6, dash: '' },
    gigabit:   { label: 'Gigabit Ethernet',      cat: 'net',   speed: '1 Gbit/s',   color: '#2563eb', width: 1.8, dash: '' },
    eth25:     { label: '2.5 Gbit Ethernet',     cat: 'net',   speed: '2.5 Gbit/s', color: '#4f46e5', width: 2.0, dash: '' },
    eth10g:    { label: '10 Gigabit Ethernet',   cat: 'net',   speed: '10 Gbit/s',  color: '#7c3aed', width: 2.4, dash: '' },
    eth25g:    { label: '25 Gbit Ethernet',      cat: 'net',   speed: '25 Gbit/s',  color: '#9333ea', width: 2.6, dash: '' },
    eth40g:    { label: '40 Gbit Ethernet',      cat: 'net',   speed: '40 Gbit/s',  color: '#c026d3', width: 2.8, dash: '' },
    eth100g:   { label: '100 Gbit Ethernet',     cat: 'net',   speed: '100 Gbit/s', color: '#db2777', width: 3.2, dash: '' },
    fiber:     { label: 'Glasfaser',             cat: 'net',   speed: '10 Gbit/s',  color: '#ea580c', width: 2.2, dash: '' },
    wan:       { label: 'WAN',                   cat: 'net',   speed: '250 Mbit/s', color: '#16a34a', width: 2.0, dash: '' },
    vpn:       { label: 'VPN',                   cat: 'net',   speed: '',           color: '#7c3aed', width: 1.8, dash: '2 5' },

    /* --- Funk: durchweg gestrichelt, damit Kabel und Funk auf einen Blick
           unterscheidbar bleiben --- */
    wlan:      { label: 'WLAN',                  cat: 'radio', speed: '866 Mbit/s', color: '#0891b2', width: 1.8, dash: '6 4' },
    bluetooth: { label: 'Bluetooth',             cat: 'radio', speed: '',           color: '#0e7490', width: 1.6, dash: '6 4' },
    zigbee:    { label: 'Zigbee',                cat: 'radio', speed: '250 kbit/s', color: '#14b8a6', width: 1.5, dash: '6 4' },
    lora:      { label: 'LoRaWAN',               cat: 'radio', speed: '',           color: '#0d9488', width: 1.5, dash: '6 4' },
    mobile:    { label: 'Mobilfunk (LTE/5G)',    cat: 'radio', speed: '',           color: '#06b6d4', width: 2.0, dash: '6 4' },
    dect:      { label: 'DECT',                  cat: 'radio', speed: '',           color: '#22d3ee', width: 1.5, dash: '6 4' },

    /* --- Peripherie --- */
    usb2:      { label: 'USB 2.0',               cat: 'peri',  speed: '480 Mbit/s', color: '#b45309', width: 1.6, dash: '' },
    usb3:      { label: 'USB 3.x',               cat: 'peri',  speed: '5 Gbit/s',   color: '#d97706', width: 1.9, dash: '' },
    usb4:      { label: 'USB4 / Thunderbolt',    cat: 'peri',  speed: '40 Gbit/s',  color: '#f59e0b', width: 2.2, dash: '' },
    hdmi:      { label: 'HDMI',                  cat: 'peri',  speed: '',           color: '#92400e', width: 2.0, dash: '' },
    displayport: { label: 'DisplayPort',         cat: 'peri',  speed: '',           color: '#78350f', width: 2.0, dash: '' },
    serial:    { label: 'Seriell (RS-232)',      cat: 'peri',  speed: '115200 Baud',color: '#a16207', width: 1.4, dash: '' },
    rs485:     { label: 'RS-485',                cat: 'peri',  speed: '',           color: '#854d0e', width: 1.4, dash: '' },
    sas:       { label: 'SAS',                   cat: 'peri',  speed: '',           color: '#a8a29e', width: 2.2, dash: '' },
    fc:        { label: 'Fibre Channel',         cat: 'peri',  speed: '',           color: '#f97316', width: 2.2, dash: '' },
    kvm:       { label: 'KVM',                   cat: 'peri',  speed: '',           color: '#78716c', width: 1.6, dash: '' },

    /* --- Feldbus & Industrie --- */
    can:         { label: 'CAN',                 cat: 'bus',   speed: 'bis 1 Mbit/s',  color: '#65a30d', width: 1.6, dash: '' },
    profinet:    { label: 'PROFINET',            cat: 'bus',   speed: '100 Mbit/s',    color: '#4d7c0f', width: 1.9, dash: '' },
    profibus:    { label: 'PROFIBUS DP',         cat: 'bus',   speed: 'bis 12 Mbit/s', color: '#84cc16', width: 1.7, dash: '' },
    modbus_rtu:  { label: 'Modbus RTU',          cat: 'bus',   speed: '',              color: '#3f6212', width: 1.5, dash: '' },
    modbus_tcp:  { label: 'Modbus TCP',          cat: 'bus',   speed: '100 Mbit/s',    color: '#166534', width: 1.7, dash: '' },
    knx:         { label: 'KNX (TP)',            cat: 'bus',   speed: '9600 Baud',     color: '#15803d', width: 1.5, dash: '' },
    dali:        { label: 'DALI',                cat: 'bus',   speed: '1200 Baud',     color: '#a3e635', width: 1.5, dash: '' },
    mbus:        { label: 'M-Bus',               cat: 'bus',   speed: '',              color: '#365314', width: 1.4, dash: '' },
    iolink:      { label: 'IO-Link',             cat: 'bus',   speed: '',              color: '#22c55e', width: 1.5, dash: '' },

    /* --- Modellbahn --- */
    track:       { label: 'Gleisanschluss',      cat: 'mobra', speed: '',              color: '#be123c', width: 2.8, dash: '' },
    booster_cde: { label: 'Booster (CDE)',       cat: 'mobra', speed: '',              color: '#9f1239', width: 2.2, dash: '' },
    loconet:     { label: 'LocoNet',             cat: 'mobra', speed: '16,66 kBaud',   color: '#e11d48', width: 1.7, dash: '' },
    xpressnet:   { label: 'XpressNet',           cat: 'mobra', speed: '62,5 kBaud',    color: '#f43f5e', width: 1.7, dash: '' },
    s88:         { label: 'S88-Rückmeldebus',    cat: 'mobra', speed: '',              color: '#fb7185', width: 1.5, dash: '' },
    can_mb:      { label: 'CAN (Zentrale)',      cat: 'mobra', speed: '',              color: '#881337', width: 1.7, dash: '' },
    ecoslink:    { label: 'ECoSlink',            cat: 'mobra', speed: '',              color: '#e11d48', width: 1.7, dash: '1 4' },

    /* --- Strom: kräftiger gezeichnet, 230 V zusätzlich als Strich-Punkt --- */
    ac230:     { label: '230 V AC',              cat: 'power', speed: '',           color: '#b91c1c', width: 3.4, dash: '10 4 2 4' },
    dc24:      { label: '24 V DC',               cat: 'power', speed: '',           color: '#f97316', width: 3.0, dash: '' },
    poe:       { label: 'PoE',                   cat: 'power', speed: '',           color: '#eab308', width: 2.6, dash: '' },
    ups:       { label: 'USV-Versorgung',        cat: 'power', speed: '',           color: '#7f1d1d', width: 3.0, dash: '10 4 2 4' },

    /* --- Sonstiges --- */
    logical:   { label: 'Logische Verbindung',   cat: 'misc',  speed: '',           color: '#94a3b8', width: 1.6, dash: '5 4' },
    custom:    { label: 'Benutzerdefiniert',     cat: 'misc',  speed: '',           color: '#94a3b8', width: 1.8, dash: '5 4' }
  };

  const STATUS = {
    unknown:  { label: 'Unbekannt', color: '#cbd5e1' },
    active:   { label: 'Aktiv',     color: '#16a34a' },
    inactive: { label: 'Inaktiv',   color: '#94a3b8' },
    warning:  { label: 'Warnung',   color: '#f59e0b' },
    error:    { label: 'Fehler',    color: '#dc2626' }
  };

  const DEFAULT_LAYERS = [
    { id: 'lay_phys',  name: 'Physisches Netzwerk', visible: true },
    { id: 'lay_log',   name: 'Logisches Netzwerk',  visible: true },
    { id: 'lay_vlan',  name: 'VLAN',                visible: true },
    { id: 'lay_wlan',  name: 'WLAN',                visible: true },
    { id: 'lay_srv',   name: 'Server',              visible: true },
    { id: 'lay_iot',   name: 'IoT',                 visible: true }
  ];

  const AREA_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#64748b', '#db2777'];

  /* Gezeichnete Frontblenden (src/hardware.svg, Format 120 × 48).
     Mehrere Typen dürfen sich eine Ansicht teilen — ein 19-Zoll-Server
     sieht nun einmal aus wie ein 19-Zoll-Server. Typen ohne Eintrag
     zeigen weiter ihr Strichsymbol. */
  const HARDWARE = {
    router: 'hw-router', switch: 'hw-switch', switch_managed: 'hw-switch-managed',
    switch_l3: 'hw-switch-l3', firewall: 'hw-firewall', accesspoint: 'hw-ap',
    wlan_router: 'hw-wlan-router', modem: 'hw-modem', gateway: 'hw-gateway',

    server: 'hw-server', webserver: 'hw-server', dbserver: 'hw-server',
    fileserver: 'hw-server', backupserver: 'hw-server', nas: 'hw-nas',
    vmserver: 'hw-vmserver', aiserver: 'hw-gpuserver', gpuserver: 'hw-gpuserver',

    pc: 'hw-pc', notebook: 'hw-notebook', tablet: 'hw-tablet',
    smartphone: 'hw-smartphone', thinclient: 'hw-pc', ipc: 'hw-gateway',

    raspberrypi: 'hw-raspberrypi', jetson: 'hw-raspberrypi', mcu: 'hw-mcu',
    sensor: 'hw-mcu', camera: 'hw-camera', plc: 'hw-gateway',

    netprinter: 'hw-netprinter', printer: 'hw-netprinter', storage: 'hw-nas',

    mb_ecos: 'hw-mb-ecos', mb_cs3: 'hw-mb-cs3', mb_cs2: 'hw-mb-cs3',
    mb_ms2: 'hw-mb-handheld', mb_z21: 'hw-mb-z21',
    mb_intellibox: 'hw-mb-ecos', mb_dr5000: 'hw-mb-z21', mb_mx10: 'hw-mb-ecos',
    mb_tams: 'hw-mb-ecos', mb_dccex: 'hw-mcu', mb_booster: 'hw-mb-booster',
    mb_feedback: 'hw-mb-feedback', mb_gateway: 'hw-mb-feedback',
    mb_throttle: 'hw-mb-handheld', mb_pc: 'hw-mb-pc'
  };

  function own(map, key) { return Object.prototype.hasOwnProperty.call(map, key); }
  function hardwareFor(typeId) { return own(HARDWARE, typeId) ? HARDWARE[typeId] : ''; }

  /* Eigene, vom Anwender im Symbol-Editor erzeugte Typen.
     Sie liegen im Projekt (project.customTypes) und werden hier zur
     Laufzeit registriert, damit Katalog, Suche, Ports, Rendering und
     Dialoge sie wie eingebaute Typen behandeln. */
  let CUSTOM = {};

  function setCustom(list) {
    CUSTOM = {};
    (list || []).forEach(t => {
      if (!t || !t.id) return;
      CUSTOM[t.id] = {
        label: t.label || t.id,
        cat: t.cat && CATEGORIES.some(c => c.id === t.cat) ? t.cat : 'custom',
        icon: t.icon ? t.icon : '',
        iconInner: t.iconInner || '',
        iconViewBox: t.iconViewBox || '0 0 24 24',
        iconImage: t.iconImage || '',
        color: /^#[0-9a-f]{3,8}$/i.test(String(t.color)) ? t.color : '#0f172a',
        ports: { names: Array.isArray(t.ports) ? t.ports.slice() : [] },
        custom: true
      };
    });
  }

  function customTypes() { return CUSTOM; }
  function isCustom(t) { return own(CUSTOM, t); }
  function known(t) { return own(DEVICE_TYPES, t) || own(CUSTOM, t); }

  function type(t) { return own(DEVICE_TYPES, t) ? DEVICE_TYPES[t] : own(CUSTOM, t) ? CUSTOM[t] : DEVICE_TYPES.pc; }
  function typeLabel(t) { return known(t) ? type(t).label : t; }
  function connType(t) { return own(CONNECTION_TYPES, t) ? CONNECTION_TYPES[t] : CONNECTION_TYPES.custom; }
  function shapeOf(t) { return type(t).shape || 'device'; }

  /** Baut die Portliste eines Gerätetyps. */
  function buildPorts(typeId) {
    const spec = type(typeId).ports || {};
    const out = [];
    if (Array.isArray(spec.names)) spec.names.forEach(n => out.push({ name: n }));
    if (spec.count) {
      for (let i = 1; i <= spec.count; i++) out.push({ name: (spec.prefix || 'Port ') + i });
    }
    if (Array.isArray(spec.extra)) spec.extra.forEach(n => out.push({ name: n }));
    return out;
  }

  function typeOptions() {
    return Object.keys(DEVICE_TYPES).map(id => ({ value: id, label: DEVICE_TYPES[id].label }))
      .concat(Object.keys(CUSTOM).map(id => ({ value: id, label: CUSTOM[id].label + ' (eigenes)' })));
  }

  /** Alle Typ-IDs einer Kategorie, eingebaute und eigene. */
  function typesIn(catId) {
    return Object.keys(DEVICE_TYPES).filter(id => DEVICE_TYPES[id].cat === catId)
      .concat(Object.keys(CUSTOM).filter(id => CUSTOM[id].cat === catId));
  }
  /** Auswahloptionen mit Gruppenzuordnung — das Formular baut daraus optgroups. */
  function connTypeOptions() {
    const out = [];
    CONN_CATEGORIES.forEach(cat => {
      Object.keys(CONNECTION_TYPES)
        .filter(id => (CONNECTION_TYPES[id].cat || 'misc') === cat.id)
        .forEach(id => out.push({ value: id, label: CONNECTION_TYPES[id].label, group: cat.label }));
    });
    return out;
  }

  function connTypesIn(catId) {
    return Object.keys(CONNECTION_TYPES).filter(id => (CONNECTION_TYPES[id].cat || 'misc') === catId);
  }

  function dashLabel(dash) {
    const p = DASH_PRESETS.find(x => x.value === (dash || ''));
    return p ? p.label : 'benutzerdefiniert';
  }
  function statusOptions() {
    return Object.keys(STATUS).map(id => ({ value: id, label: STATUS[id].label }));
  }

  return {
    NODE_W, NODE_H, JUNCTION, PHOTO_H, STRIP_EXTRA, STRIP_SHIFT, CATEGORIES, CONN_CATEGORIES, DASH_PRESETS, DEVICE_TYPES, CONNECTION_TYPES, STATUS, HARDWARE, hardwareFor,
    DEFAULT_LAYERS, AREA_COLORS,
    type, typeLabel, connType, shapeOf, buildPorts,
    typeOptions, typesIn, connTypeOptions, connTypesIn, dashLabel, statusOptions,
    setCustom, customTypes, isCustom, known
  };
})();
