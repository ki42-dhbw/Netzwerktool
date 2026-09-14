# Prompt: Interaktives Netzwerk-Topologie-Tool als einzelne HTML-Datei

## Aufgabe

Entwickle eine vollständige, moderne und direkt nutzbare Webanwendung zur grafischen Planung und Dokumentation von Computernetzwerken.

Die Anwendung muss als **eine einzige HTML-Datei** ausgeliefert werden.

Es dürfen keine zusätzlichen lokalen Dateien notwendig sein.

Die Datei soll beispielsweise heißen:

`netzwerk_topologie_tool.html`

Nach einem Doppelklick auf die Datei muss die Anwendung direkt in einem modernen Browser funktionieren.

---

## 1. Ziel der Anwendung

Der Anwender soll Netzwerk-Topologien grafisch erstellen können.

Dazu gibt es eine linke Seitenleiste mit verschiedenen Netzwerkkomponenten.

Diese Komponenten können per Drag-and-Drop auf eine große Zeichenfläche gezogen werden.

Anschließend können die Geräte miteinander verbunden, verschoben, bearbeitet, beschriftet und gelöscht werden.

Die erstellte Netzwerk-Topologie muss gespeichert und später wieder geladen werden können.

Die Anwendung soll sich wie ein kleines professionelles Netzwerkdiagramm- oder Netzwerkplanungstool verhalten.

---

## 2. Grundaufbau der Benutzeroberfläche

Die Oberfläche soll aus folgenden Hauptbereichen bestehen:

### Kopfzeile

Oben befindet sich eine Werkzeugleiste mit mindestens folgenden Funktionen:

- Neues Netzwerk
- Speichern
- Laden
- Exportieren
- Importieren
- Zeichenfläche löschen
- Auswahlmodus
- Verbindungsmodus
- Zoom +
- Zoom -
- Zoom zurücksetzen
- Rückgängig
- Wiederholen
- Hilfe

### Linke Seitenleiste

Die linke Seitenleiste enthält grafische Netzwerkkomponenten.

Die Geräte müssen per Drag-and-Drop auf die Zeichenfläche gezogen werden können.

Folgende Komponenten sollen mindestens vorhanden sein:

#### Netzwerkgeräte

- Router
- Switch
- Managed Switch
- Layer-3-Switch
- Firewall
- Access Point
- WLAN-Router
- Modem
- Gateway

#### Server

- Server
- Webserver
- Datenbankserver
- Fileserver
- Backupserver
- NAS
- Virtualisierungsserver
- KI-Server
- GPU-Server

#### Clients

- Desktop-PC
- Notebook
- Tablet
- Smartphone
- Thin Client
- Industrie-PC

#### IoT und Embedded

- Raspberry Pi
- NVIDIA Jetson
- Mikrocontroller
- IoT-Sensor
- Kamera
- SPS / PLC

#### Netzwerk / Internet

- Internet
- Cloud
- VPN
- WAN
- LAN
- VLAN

#### Sonstige Elemente

- Drucker
- Netzwerkdrucker
- Speicher
- Gebäude
- Raum
- Rack
- Textfeld
- freie Notiz

Die Seitenleiste soll scrollbar sein.

Geräte sollen nach Kategorien gruppiert werden.

Optional kann eine Suchfunktion integriert werden.

---

## 3. Darstellung der Komponenten

Jede Komponente soll auf der Zeichenfläche grafisch dargestellt werden.

Eine Komponente besteht mindestens aus:

- Symbol oder Icon
- Gerätename
- Gerätetyp
- optional IP-Adresse

Beispiel:

```text
┌─────────────────┐
│      ROUTER     │
│    [ Symbol ]   │
│ Router Zentrale │
│ 192.168.1.1     │
└─────────────────┘
```

Verwende möglichst moderne, verständliche Netzwerk-Icons.

Da alles in einer einzelnen HTML-Datei funktionieren soll, können Icons beispielsweise verwendet werden über:

- eingebettete SVG-Grafiken
- Unicode-Symbole
- CSS-generierte Symbole

Die Anwendung darf nicht davon abhängig sein, dass externe Bilddateien vorhanden sind.

---

## 4. Drag-and-Drop

Der Anwender muss ein Element aus der linken Seitenleiste auf die Zeichenfläche ziehen können.

Beim Loslassen wird eine neue Instanz dieses Gerätetyps erzeugt.

Beispiel:

Der Anwender zieht dreimal einen Switch auf die Zeichenfläche.

Es entstehen:

- Switch 1
- Switch 2
- Switch 3

Geräte sollen automatisch durchnummeriert werden.

Der Anwender kann die Namen anschließend verändern.

---

## 5. Geräte bewegen

Alle Geräte auf der Zeichenfläche müssen frei verschoben werden können.

Beim Verschieben müssen bestehende Netzwerkverbindungen automatisch mitgeführt werden.

Die Linien dürfen nicht ihre Verbindung zum Gerät verlieren.

---

## 6. Geräte verbinden

Es muss einen Verbindungsmodus geben.

Beispiel:

1. Anwender aktiviert „Verbinden“.
2. Anwender klickt Router A an.
3. Anwender klickt Switch B an.
4. Zwischen beiden Geräten wird eine Verbindung erzeugt.

Alternativ können Verbindungspunkte an den Geräten dargestellt werden.

---

## 7. Verbindungstypen

Beim Erstellen oder Bearbeiten einer Verbindung soll der Typ ausgewählt werden können.

Mindestens:

- Ethernet
- Gigabit Ethernet
- 2.5 Gbit Ethernet
- 10 Gigabit Ethernet
- Glasfaser
- WLAN
- WAN
- VPN
- seriell
- benutzerdefiniert

Optional:

- 25 Gbit
- 40 Gbit
- 100 Gbit

---

## 8. Darstellung der Leitungen

Verbindungen sollen als Linien zwischen den Geräten dargestellt werden.

Möglich sind:

- gerade Linien
- orthogonale Linien
- automatisch geführte Linien

Die Verbindung soll optional beschriftet werden können.

Beispiele:

```text
1 Gbit/s
```

oder

```text
10 GbE
```

oder

```text
VLAN 20
```

---

## 9. Eigenschaften eines Geräts

Durch Doppelklick oder über ein Kontextmenü soll ein Gerät bearbeitet werden können.

Folgende Eigenschaften sollen vorhanden sein:

- Name
- Gerätetyp
- Hersteller
- Modell
- IP-Adresse
- IPv6-Adresse
- MAC-Adresse
- Hostname
- Standort
- Raum
- Rack
- Beschreibung
- VLAN
- Betriebssystem
- Bemerkungen

Nicht alle Felder müssen zwingend ausgefüllt werden.

---

## 10. Eigenschaften von Verbindungen

Eine Verbindung soll ebenfalls bearbeitet werden können.

Eigenschaften:

- Name
- Verbindungstyp
- Geschwindigkeit
- VLAN
- Quelle
- Ziel
- Port Quelle
- Port Ziel
- Beschreibung

Beispiel:

```text
Switch01
Port 5

→

Server01
eth0

1 Gbit/s
VLAN 20
```

---

## 11. Geräte löschen

Ein Gerät muss gelöscht werden können über:

- Entf-Taste
- Kontextmenü
- Eigenschaftenfenster

Beim Löschen eines Geräts sollen automatisch alle dazugehörigen Verbindungen entfernt werden.

---

## 12. Verbindungen löschen

Auch einzelne Leitungen müssen markiert und gelöscht werden können.

---

## 13. Zeichenfläche komplett löschen

Es muss einen deutlich sichtbaren Button geben:

`Zeichenfläche löschen`

Vor dem Löschen erscheint eine Sicherheitsabfrage:

```text
Möchten Sie wirklich alle Geräte und Verbindungen löschen?
```

Erst nach Bestätigung wird die Topologie entfernt.

---

## 14. Speichern

Die aktuelle Netzwerk-Topologie muss gespeichert werden können.

Es sollen zwei Speicherarten unterstützt werden.

### Browser-Speicher

Die Topologie kann im Browser über `localStorage` gespeichert werden.

Beispiel:

```text
Projekt speichern
```

Der Anwender gibt einen Projektnamen ein.

Beispiel:

```text
Netzwerk Labor 1
```

---

## 15. Projekt laden

Gespeicherte Projekte können wieder geladen werden.

Eine Liste gespeicherter Projekte soll angezeigt werden.

Beispiel:

```text
Netzwerk Labor 1
Netzwerk Gebäude A
KI-Labor
Produktionsnetz
```

---

## 16. Export in Datei

Das komplette Netzwerkprojekt muss zusätzlich als Datei exportiert werden können.

Verwende beispielsweise JSON.

Beispiel:

`netzwerk_labor.json`

Gespeichert werden müssen mindestens:

- Geräte
- Positionen
- Gerätetypen
- Eigenschaften
- Verbindungen
- Verbindungstypen
- Beschriftungen
- Zoom
- Zeichenflächeneinstellungen

---

## 17. Import einer Projektdatei

Eine zuvor exportierte JSON-Datei muss wieder eingelesen werden können.

Der Anwender wählt beispielsweise:

`netzwerk_labor.json`

Danach wird die komplette Topologie rekonstruiert.

---

## 18. Automatische Speicherung

Optional soll die Anwendung Änderungen regelmäßig automatisch in `localStorage` sichern.

Zum Beispiel nach:

- Gerät hinzufügen
- Gerät verschieben
- Verbindung erstellen
- Eigenschaft verändern
- Gerät löschen

Dadurch sollen Daten bei einem versehentlichen Schließen des Browsers nicht verloren gehen.

---

## 19. Undo / Redo

Die Anwendung soll nach Möglichkeit eine Historie führen.

Buttons:

```text
↶ Rückgängig
↷ Wiederholen
```

Mindestens folgende Aktionen sollen rückgängig gemacht werden können:

- Gerät hinzufügen
- Gerät löschen
- Gerät verschieben
- Verbindung erstellen
- Verbindung löschen

---

## 20. Zoom

Die Zeichenfläche muss gezoomt werden können.

Buttons:

```text
+
-
100 %
```

Zusätzlich soll das Mausrad mit Strg-Taste verwendet werden können.

Beispiel:

`CTRL + Mausrad`

---

## 21. Zeichenfläche verschieben

Bei großen Netzwerkdiagrammen muss die Zeichenfläche verschoben werden können.

Zum Beispiel über:

- mittlere Maustaste
- Leertaste + Maus
- spezielles Hand-Werkzeug

---

## 22. Raster

Die Zeichenfläche soll optional ein Raster anzeigen.

Beispiel:

```text
Raster anzeigen ☑
```

Geräte können optional am Raster ausgerichtet werden.

Option:

```text
Am Raster ausrichten ☑
```

---

## 23. Auswahl mehrerer Geräte

Der Anwender soll mehrere Geräte markieren können.

Zum Beispiel:

- STRG + Klick
- Auswahlrechteck

Danach können mehrere Elemente gemeinsam:

- verschoben
- gelöscht
- gruppiert

werden.

---

## 24. Gruppierungen

Netzwerkgeräte sollen optional logisch gruppiert werden können.

Beispiele:

- Gebäude A
- Serverraum
- Produktionshalle
- Büro
- DMZ
- VLAN 10
- VLAN 20
- Cloud
- Außenstelle

Gruppen können beispielsweise als transparente farbige Rechtecke dargestellt werden.

---

## 25. Layer

Optional sollen unterschiedliche Ebenen möglich sein.

Beispiele:

```text
Physisches Netzwerk
Logisches Netzwerk
VLAN
WLAN
Server
IoT
```

Die Ebenen können ein- und ausgeblendet werden.

---

## 26. Netzwerkbereiche

Es soll möglich sein, Netzwerkbereiche einzufügen.

Beispiel:

```text
192.168.10.0/24

VLAN 10
Office Network
```

Diese Bereiche können als große beschriftete Flächen dargestellt werden.

---

## 27. Kontextmenü

Ein Rechtsklick auf ein Gerät soll ein Kontextmenü öffnen.

Beispiel:

```text
Eigenschaften
Duplizieren
Verbinden
In den Vordergrund
In den Hintergrund
Löschen
```

Bei einer Verbindung:

```text
Eigenschaften
Beschriftung ändern
Verbindungstyp ändern
Löschen
```

---

## 28. Duplizieren

Ein Gerät soll einfach dupliziert werden können.

Beispiel:

```text
Rechtsklick → Duplizieren
```

oder:

```text
CTRL + D
```

---

## 29. Tastaturkürzel

Implementiere sinnvolle Tastenkombinationen.

Mindestens:

```text
ENTF       Gerät löschen
CTRL + S   speichern
CTRL + Z   rückgängig
CTRL + Y   wiederholen
CTRL + D   duplizieren
ESC        Auswahl / Aktion abbrechen
```

Verhindere bei `CTRL + S`, dass der Browser seine normale „Webseite speichern“-Funktion öffnet.

---

## 30. Netzwerkgeräte automatisch benennen

Neue Geräte sollen automatisch benannt werden.

Beispiele:

```text
Router 1
Router 2

Switch 1
Switch 2
Switch 3

Server 1
Server 2
```

---

## 31. Ports

Optional soll ein Gerät Netzwerkports verwalten können.

Beispiel Switch:

```text
Port 1
Port 2
Port 3
...
Port 24
```

Beim Verbinden können Ports ausgewählt werden.

Beispiel:

```text
Switch01 Port 4
→
Server01 eth0
```

---

## 32. Status der Geräte

Geräte sollen optional einen Status besitzen:

- aktiv
- inaktiv
- Warnung
- Fehler
- unbekannt

Der Status kann grafisch mit einem kleinen Indikator dargestellt werden.

---

## 33. Suchfunktion

Bei größeren Diagrammen soll ein Gerät gesucht werden können.

Beispiel:

```text
Suche: Server01
```

Die Anwendung springt anschließend zum Gerät und markiert es.

---

## 34. Minimap

Optional soll unten rechts eine kleine Übersichtskarte der gesamten Netzwerktopologie angezeigt werden.

Dadurch kann der Anwender bei großen Diagrammen leichter navigieren.

---

## 35. Export als Bild

Die erstellte Netzwerk-Topologie soll möglichst exportiert werden können als:

- PNG
- SVG

Falls dies ohne zusätzliche Bibliotheken sinnvoll umgesetzt werden kann.

Wichtig ist vor allem SVG, da das Netzwerkdiagramm dadurch verlustfrei exportiert werden kann.

---

## 36. Druckfunktion

Eine Druckansicht soll vorhanden sein.

Beim Drucken sollen:

- Seitenleiste
- Werkzeugleisten
- Dialogfenster

ausgeblendet werden.

Es soll möglichst nur das Netzwerkdiagramm gedruckt werden.

---

## 37. Projektinformationen

Ein Projekt soll allgemeine Informationen speichern können:

- Projektname
- Beschreibung
- Autor
- Firma
- Standort
- Erstellungsdatum
- Änderungsdatum

---

## 38. Beispielprojekt

Die Anwendung soll optional ein Beispielnetzwerk laden können.

Zum Beispiel:

```text
                    Internet
                       │
                    Firewall
                       │
                     Router
                       │
                     Switch
                  ┌────┼─────┐
                  │    │     │
                 PC  Server  NAS
```

Damit kann der Anwender die Funktionen direkt ausprobieren.

---

## 39. Design

Verwende ein modernes, professionelles UI.

Bevorzugt:

- heller Hintergrund
- übersichtliche Oberfläche
- dezente Farben
- klare Linien
- große Zeichenfläche
- moderne Buttons
- responsive Seitenleiste
- abgerundete Panels
- leichte Schatten
- professionelle Netzwerk-Icons

Die Oberfläche sollte optisch an moderne Engineering-Tools erinnern.

---

## 40. Technische Anforderungen

Die Anwendung muss vollständig clientseitig funktionieren.

Bevorzugte Technologien:

```text
HTML5
CSS3
JavaScript
SVG
Canvas nur wenn sinnvoll
localStorage
File API
Drag and Drop API
```

Für die eigentliche Netzwerkgrafik ist SVG besonders geeignet, da Geräte, Texte und Verbindungslinien dadurch leicht verwaltet werden können.

---

## 41. Einzeldatei zwingend

Sehr wichtig:

Das komplette Programm muss als **eine einzige HTML-Datei** ausgegeben werden.

Struktur:

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* gesamtes CSS */
    </style>
</head>

<body>

    <!-- komplette Oberfläche -->

    <script>
        // komplette Anwendung
    </script>

</body>
</html>
```

Keine zusätzlichen lokalen Dateien.

Keine zusätzlichen JavaScript-Dateien.

Keine zusätzlichen CSS-Dateien.

Keine Icons als externe Dateien.

---

## 42. Offline-Fähigkeit

Nach Erstellung muss die HTML-Datei vollständig offline funktionieren.

Das bedeutet:

```text
Keine Serveranwendung
kein Python-Backend
kein Node.js
keine Datenbank
keine Installation
```

Die Anwendung wird ausschließlich über den Browser gestartet.

---

## 43. Datenmodell

Verwende ein klar strukturiertes JavaScript-Datenmodell.

Beispiel:

```javascript
project = {
    name: "Netzwerk Labor",
    version: 1,
    devices: [],
    connections: [],
    groups: [],
    settings: {}
}
```

Gerät:

```javascript
device = {
    id: "device_001",
    type: "switch",
    name: "Switch 1",
    x: 500,
    y: 300,
    ip: "192.168.1.10",
    hostname: "switch01",
    manufacturer: "",
    model: "",
    description: ""
}
```

Verbindung:

```javascript
connection = {
    id: "connection_001",
    source: "device_001",
    target: "device_002",
    sourcePort: "1",
    targetPort: "eth0",
    type: "ethernet",
    speed: "1 Gbit/s",
    vlan: "10",
    label: ""
}
```

---

## 44. Architektur des JavaScript-Codes

Obwohl alles in einer Datei enthalten ist, soll der JavaScript-Code sauber strukturiert werden.

Zum Beispiel:

```text
State Management
Device Management
Connection Management
Canvas Management
Drag & Drop
Selection
Property Dialog
Persistence
Import / Export
Undo / Redo
Keyboard Shortcuts
Rendering
Utility Functions
```

Vermeide unnötig global verteilte Variablen.

---

## 45. Robustheit

Das Programm soll Fehler sinnvoll behandeln.

Beispiele:

- ungültige JSON-Datei
- beschädigtes Projekt
- fehlende Geräte einer Verbindung
- localStorage nicht verfügbar
- Browser unterstützt eine Funktion nicht

Fehler sollen in verständlichen Dialogen angezeigt werden.

---

## 46. Keine Demo oder vereinfachte Version

Wichtig:

Erstelle keine reine Konzeptdemo.

Erstelle eine tatsächlich benutzbare Anwendung.

Alle wesentlichen Funktionen müssen implementiert sein.

Insbesondere müssen wirklich funktionieren:

- Drag-and-Drop
- Geräte verschieben
- Geräte markieren
- Geräte löschen
- Geräte bearbeiten
- Verbindungen erstellen
- Verbindungen aktualisieren
- Projekt speichern
- Projekt laden
- JSON exportieren
- JSON importieren
- Zeichenfläche löschen
- Zoom
- Undo / Redo

---

## 47. Direkte Ausgabe

Gib am Ende **die vollständige fertige HTML-Datei** aus.

Keine Pseudocode-Version.

Keine Ausschnitte.

Keine Platzhalter wie:

```javascript
// Implementierung hier ergänzen
```

oder:

```text
Restlicher Code ausgelassen
```

Die Antwort muss den kompletten Quellcode enthalten.

---

## 48. Qualitätsprüfung

Prüfe deinen eigenen Code vor der Ausgabe gedanklich auf:

- JavaScript-Syntaxfehler
- nicht definierte Funktionen
- falsche Event-Handler
- Drag-and-Drop-Fehler
- falsche SVG-Koordinaten
- Fehler beim Zoom
- fehlerhafte Verbindungen nach Geräteverschiebung
- JSON-Importfehler
- localStorage-Probleme
- falsche IDs
- Probleme beim Löschen von Geräten
- Probleme mit Undo / Redo

Korrigiere erkannte Probleme vor der endgültigen Ausgabe.

---

## 49. Erweiterbarkeit

Der Code soll später leicht erweitert werden können, beispielsweise um:

- automatische Netzwerkerkennung
- Ping
- SNMP
- LLDP
- CDP
- SSH
- REST API
- MQTT
- Netzwerkmonitoring
- Portscanner
- IP-Scanner
- VLAN-Planung
- DHCP-Planung
- Subnetzrechner
- KI-Assistent
- automatische Topologieerkennung

Daher auf ein möglichst klares Datenmodell und modularen JavaScript-Code achten.

---

## 50. Zielzustand

Das Ergebnis soll sich ungefähr wie eine Mischung aus

- Netzwerkdiagramm-Editor
- einfacher Visio-/draw.io-Anwendung
- Netzwerkdokumentation
- Topologieplaner

anfühlen.

Der Anwender soll ohne Installation eine HTML-Datei öffnen und sofort ein Netzwerkdiagramm erstellen können.

### Priorität

1. Stabilität
2. Bedienbarkeit
3. Speicherung
4. Drag-and-Drop
5. Netzwerkverbindungen
6. gute Darstellung
7. Erweiterbarkeit

**Erzeuge jetzt die vollständige Anwendung.**
