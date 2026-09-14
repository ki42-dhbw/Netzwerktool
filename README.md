# Netzwerk-Topologie-Tool

Ein offline nutzbarer Editor zum Planen, dokumentieren und prüfen von
Computernetzwerken. Die fertige Anwendung besteht aus einer einzigen HTML-Datei
und benötigt weder Webserver noch Installation.

**[Hier sofort ausprobieren](https://ki42-dhbw.github.io/Netzwerktool/)**

Direkt im Browser starten – ohne Download oder Installation.

## Schnellstart

### Windows

1. Repository oder Release-ZIP herunterladen und entpacken.
2. `start.bat` doppelklicken.

Alternativ `netzwerk_topologie_tool.html` direkt im Browser öffnen. Unter Linux
und macOS wird die HTML-Datei ebenfalls direkt im Browser geöffnet.

Die Anwendung speichert Projekte lokal im Browser. Für eine unabhängige
Sicherung regelmäßig **Export → Projekt als JSON** verwenden.

## Funktionen

- Geräte, Bereiche, Beschriftungen und zahlreiche Verbindungsarten zeichnen
- Ebenen, Raster, Zoom, Minimap, Hell-/Dunkelmodus und eigene Symbole
- Gerätebilder und eigene Bildbibliothek, vollständig in der HTML-Datei eingebettet
- Autosave, benannte Browserprojekte und bis zu 30 Wiederherstellungspunkte
- JSON-, SVG-, PNG-, CSV- und druckbarer HTML-Berichtsexport
- Inventar für Geräte, Schnittstellen, Ports und Verbindungen
- Netzplan-Prüfung, etwa auf doppelte IP-Adressen und Portkonflikte
- mehrere IPv4-/IPv6-Schnittstellen, MAC-Adressen und VLANs je Gerät
- automatische Anordnung und optionale Hindernisvermeidung
- Import von ARP-, Nmap-, LLDP-/CDP-, CSV- und Scanner-Ergebnissen
- integriertes sowie eigenständiges deutsches Handbuch
- Tastaturbedienung und Maskierung vertraulicher Angaben für Exporte

## Netzwerkanalyse

Mitgeliefert werden zwei lokale Analyseskripte:

- `netzwerk_analyse.ps1` für Windows PowerShell 5.1 oder PowerShell 7
- `netzwerk_analyse.sh` für Linux/macOS mit Python 3.9+

Zuerst lässt sich der geplante Bereich ohne Scan kontrollieren:

```powershell
powershell -ExecutionPolicy Bypass -File .\netzwerk_analyse.ps1 -ListInterfaces
powershell -ExecutionPolicy Bypass -File .\netzwerk_analyse.ps1 -Subnet 192.168.10.0/24 -PlanOnly
```

```bash
bash netzwerk_analyse.sh --subnet 192.168.10.0/24 --plan-only
```

Die Skripte senden Ping-, TCP- und Namensauflösungsanfragen und schreiben das
Ergebnis lokal als JSON. Nur Netze scannen, für die eine Freigabe vorliegt.
Details zu Bereichen, Parallelität, Abbruch und Teilergebnissen stehen im
[Handbuch](hilfe.html) und im [Umsetzungsprotokoll](doc/UMSETZUNG-2026-09-14.md).

## Keine Anaconda-Umgebung erforderlich

Das Frontend benötigt nur einen aktuellen Browser. Zum Bauen wird Node.js 18
oder neuer verwendet. Das Linux-/macOS-Analyseskript benötigt Python 3.9 oder
neuer aus dem System oder wahlweise aus einer vorhandenen Conda-Umgebung.
Eine projektspezifische Conda-Umgebung ist nicht erforderlich.

## Aus dem Quellcode bauen

```bash
node build.js
```

Der Build selbst hat keine Paketabhängigkeiten. Er erzeugt:

- `netzwerk_topologie_tool.html`
- `hilfe.html`
- `netzwerk_analyse.ps1`
- `netzwerk_analyse.sh`

Mit `node build.js --watch` wird bei Änderungen unter `src/` oder `bilder/`
automatisch neu gebaut. Generierte Dateien sollten nicht von Hand bearbeitet
werden.

Eigene JPG-, PNG-, WebP-, GIF- oder SVG-Dateien können in `bilder/` abgelegt
werden. Beim nächsten Build werden sie in die Offline-Anwendung eingebettet.
Nur Bilder veröffentlichen, für die die nötigen Nutzungsrechte vorliegen.

## Tests

```bash
npm ci
npm run browser:install
npm test
npm run test:contrast
npm run test:visual
npm run test:scanners
npm run test:repository
npm run test:all
```

Die Browsertests öffnen genau die erzeugte HTML-Datei über `file://`. Scanner-
Tests verwenden simulierte Antworten und führen keinen echten Netzwerkscan aus.
Die GitHub-Actions-Konfiguration führt die vollständige Prüfung bei Pushes und
Pull Requests aus.

Der geprüfte Stand umfasst:

- 195 bestehende Browser-Funktionsprüfungen
- 19 zusätzliche Regressionstests
- 5.535 Kontrastmessungen in hellem und dunklem Design
- visuelle Prüfungen bei 1.280, 1.500 und 1.920 Pixel Breite
- 15 Windows-Scanner- und 6 Python-Scanner-Prüfungen

## Release-Paket erstellen

```bash
npm run test:all
npm run release
node test/release.js
```

Das Paket wird unter `dist/netzwerktool-<Zeitstempel>/` erzeugt. Seine
`manifest.json` enthält Größe und SHA-256-Prüfsumme aller ausgelieferten Dateien.

## Auf GitHub veröffentlichen

Zuerst auf GitHub ein leeres Repository ohne automatisch erzeugte README anlegen.
Dann in diesem Ordner ausführen und Platzhalter ersetzen:

```bash
git init
git add .
git commit -m "Netzwerk-Topologie-Tool 1.0.0"
git branch -M main
git remote add origin https://github.com/BENUTZER/REPOSITORY.git
git push -u origin main
```

Das erzeugte Release-Paket aus `dist/` kann anschließend bei einem GitHub-Release
als ZIP angehängt werden. Vor dem öffentlichen Push die Lizenzentscheidung unten
treffen und `LICENSE-HINWEIS.md` gegebenenfalls durch die gewählte Lizenz ersetzen.

## Projektstruktur

```text
src/                 maßgebliche HTML-, CSS-, JavaScript- und Handbuchquellen
bilder/              optionale eigene Bildbibliothek
test/                Browser-, Kontrast-, Layout- und Scanner-Tests
doc/                 Anforderungen, Review und Umsetzungsstand
build.js             erzeugt die Offline-Artefakte
release.js           erzeugt das prüfbare Release-Paket
start.bat            Windows-Startdatei
```

Architektur und Erweiterungspunkte beschreibt das Kapitel „Für Entwickler“ im
[Handbuch](hilfe.html). Der aktuelle technische Stand steht in
[doc/STAND.md](doc/STAND.md).

## Datenschutz

Das Frontend ruft keine externen Dienste auf. Browserprojekte, Autosave und
Wiederherstellungspunkte bleiben im Browserprofil. Exportierte Projektdateien
können IP-Adressen, Gerätenamen, MAC-Adressen, Standorte und Bilder enthalten.
Solche Dateien nicht ungeprüft in öffentliche Issues oder Commits aufnehmen.

## Lizenz

Für diesen Stand wurde keine Open-Source-Lizenz festgelegt. Das Veröffentlichen
auf GitHub erteilt deshalb nicht automatisch Nutzungs-, Änderungs- oder
Weiterverbreitungsrechte. Vor einer Freigabe als Open-Source-Projekt eine
passende Lizenz ergänzen; siehe [LICENSE-HINWEIS.md](LICENSE-HINWEIS.md).
