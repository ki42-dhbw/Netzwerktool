# Umsetzung der Programmprüfung — 14.09.2026

Die Änderungen sind vollständig in diesem Repository enthalten.
Das Frontend bleibt eine eigenständig offline nutzbare HTML-Datei. `start.bat` öffnet
sie unter Windows im Standardbrowser. Für das Frontend ist keine Conda-Umgebung nötig.

## Korrekturen aus dem Review

| Punkt | Umsetzung |
|---|---|
| 1: Enter in Dialogen | Enter und Schaltflächen verwenden dieselbe Validierung und Abschlusslogik; auch native Dialogabschlüsse lösen das Ergebnis auf. |
| 2: Projektwechsel | Sichern / Verwerfen / Abbrechen für Laden, Neu, Import, Beispiel und Wiederherstellung; zusätzliche Kopie vor dem Wechsel. |
| 3: Indexfehler | Speichern meldet erst nach Projekt- und Indexschreibvorgang Erfolg; ein fehlgeschlagener Indexschreibvorgang rollt die Projektdaten zurück. Ein beschädigter Index wird beim Lesen aus vorhandenen Projekten rekonstruiert. |
| 4: Speichererholung | Lesezugriff bleibt trotz Schreibfehler möglich. Folgeversuche können wieder speichern. Statusleiste zeigt Fehler, Änderungen und Sicherungszeitpunkt dauerhaft. |
| 5: Eigene Symbole | Validierung ohne Katalogänderung; gemeinsamer Zustandswechsel synchronisiert Katalog und SVG-Definitionen auch bei Undo/Redo. Eigene Typen sind im Gerätedialog wählbar. |
| 6: Importvalidierung | Endliche begrenzte Zahlen, sichere IDs, bereinigte Ebenen und eigene Tabellenschlüssel. Format 1 wird auf 2 migriert, unbekannte neuere Versionen werden abgewiesen. |
| 7: Scan-Duplikate | Vor jeder Übernahme neuer Abgleich mit dem aktuellen Projekt anhand MAC/IP einschließlich weiterer Schnittstellen; vorhandene Leitungen werden anhand ihrer Endpunkte und Ports erkannt. |
| 8: CIDR und CSV | Tatsächliche Präfixe bestimmen Netzzugehörigkeit. Fehlende Präfixe sind ausdrücklich als /24-Annahme gekennzeichnet. CSV unterstützt Anführungszeichen, Trennzeichen in Feldern und Zeilenumbrüche. |
| 9: Bildsuche | Cache je Typ mit gezielter Invalidierung; Bildimport mit höchstens vier gleichzeitigen Bilddekodierungen. |
| 10: Tastatur | Fokus innerhalb von Overlays und Rückgabe beim Schließen, inaktiver Hintergrund, Katalog per Enter/Leertaste, Geräteauswahl und Eigenschaften per Tastatur. |
| 11: Größere Projekte | Sammeländerungen mit einmaligem Indexaufbau, gemeinsame Bildstrings in Undo-Snapshots, IndexedDB-Archiv mit separaten, inhaltsadressierten Bildern und Kapazitätsanzeige. |
| 12: Scanner | Auswählbare Schnittstelle, CIDR und Startadresse, dokumentierter tatsächlicher Bereich, begrenzte Parallelität/Timeouts, ARP und TCP zusätzlich zu Ping, Abbruch mit Teilergebnis, konservative Gateway-Ableitungen und strukturierte Beobachtungen. |
| 13: Projektpflege | Hauptordner als Quelle dokumentiert; Watch berücksichtigt `bilder/`; Lockdatei versionierbar; `npm run release` liefert nur gebaute Dateien samt SHA-256-Manifest aus. |
| 14: Prüfungen | Separate Regressionstests einschließlich Fehlerinduktion, Bildarchiv nach Reload, Tastatur, Scanwiederholung, Layout und 500-Geräte-Test; Scanner-Tests ohne Zugriff auf reale Zielgeräte; Kontrastprüfungen auch für neue Tabellen und Sicherungsverwaltung. |

## Neue Funktionen und Bedienung

- **Sicherungsverlauf:** Einstellungen-Menü → Sicherungsverlauf. Bis zu 30 Punkte
  über alle Projekte, manuell, vor Projektwechseln und gedrosselt automatisch.
  Vorhandene Browserprojekte und Autosave werden einmalig kopiert; Originale bleiben.
  Bilddaten werden im Archiv gemeinsam gespeichert. Wiederherstellen, Löschen,
  manuelle Sicherung und JSON-Export sind direkt erreichbar.
- **Inventar:** Analyse → Inventar. Geräte, Schnittstellen, Ports und Verbindungen
  als filterbare Tabellen mit Bearbeitung und CSV-Ausgabe. CSV exportiert die gesamte
  gewählte Tabelle; der Suchfilter dient der Ansicht.
- **Netzplan-Prüfung:** Analyse → Netzplan-Prüfung. Unter anderem doppelte IPs,
  ungültige Adressen/Präfixe, MACs und VLANs, Portkonflikte und auffällige Netzzuordnung.
  Hinweise sperren die Bearbeitung nicht; bei Bussen, Trunks oder Routing können
  Abweichungen beabsichtigt sein.
- **Schnittstellen:** Geräteeigenschaften → Schnittstellen. Zusätzliche Anschlüsse
  mit Name, IPv4/CIDR, IPv6, MAC, VLAN und Port als CSV bearbeiten. Die bisherigen
  Hauptadressfelder bleiben kompatibel. JSON und Sicherungen enthalten alle Anschlüsse.
- **Anordnung:** Analyse → Automatisch anordnen. Gesamter sichtbarer Plan oder
  Auswahl; zusammenhängende Netze werden in Ebenen angeordnet. Die Änderung ist
  mit einem Undo-Schritt rückgängig zu machen. Manuelle Leitungsknoten können erhalten
  bleiben. Hindernisvermeidung für orthogonale Leitungen ist in Einstellungen schaltbar.
- **Bericht:** Export → Bericht exportieren. Eine eigenständige HTML-Datei enthält
  Zeichnung, Inventar, Verbindungen, Prüfhinweise und Scanzeitpunkt; über den Browser
  drucken oder als PDF speichern. Die maskierte Variante enthält die maskierte Zeichnung
  ohne Inventartabellen. Bilder können weiterhin eingebrannte vertrauliche Angaben enthalten.

## Scanner verwenden

Windows, zunächst ohne Scan die Auswahl prüfen:

```powershell
powershell -ExecutionPolicy Bypass -File .\netzwerk_analyse.ps1 -ListInterfaces
powershell -ExecutionPolicy Bypass -File .\netzwerk_analyse.ps1 -Subnet 10.0.0.0/16 -StartAddress 10.0.20.1 -MaxHosts 254 -PlanOnly
powershell -ExecutionPolicy Bypass -File .\netzwerk_analyse.ps1 -InterfaceIndex 12 -Subnet 10.0.20.0/24 -Concurrency 16 -Timeout 400
```

Linux/macOS (Python 3.9+ und übliche System-Netzwerkwerkzeuge):

```bash
bash netzwerk_analyse.sh --subnet 10.0.0.0/16 --start-address 10.0.20.1 --max-hosts 254 --plan-only
bash netzwerk_analyse.sh --interface eth0 --subnet 10.0.20.0/24 --concurrency 16 --timeout 400
```

Windows beendet mit **Q**, Linux/macOS mit **Strg+C** kontrolliert und schreibt die
abgeschlossenen Prüfungen. Alternativ `-CancelAfterSeconds` bzw. `--cancel-after-seconds`.
Beide Skripte dokumentieren ausgewählte, abgeschlossene und ausgelassene Adressen.
Ein begrenzter Scan großer Netze wird ohne explizite Startadresse um die lokale Adresse
angeordnet, sofern sie im Zielnetz liegt. Ein Fremdnetz übernimmt keine lokale
Gateway-Topologie. WLAN-Metadaten werden unter Windows nur der gewählten Schnittstelle
zugeordnet, soweit das System sie bereitstellt.

## Prüfung und praktische Grenzen

Abschlussprüfung:

| Prüfung | Ergebnis |
|---|---|
| Chrome, bestehende Funktionstests | 195/195 bestanden |
| Chrome, neue Regressionstests | 19/19 bestanden |
| Edge, neue Regressionstests | 19/19 bestanden |
| Kontrast in beiden Designs, einschließlich neuer Ansichten | 5.535 Messungen in der öffentlichen Ausgabe ohne Produktfotos bestanden |
| Visuelle Layoutprüfungen | 1.280, 1.500 und 1.920 Pixel bestanden; Screenshots erzeugt |
| Windows-Scanner | 15 Prüfungen einschließlich echtem Runspace-Ablauf mit simulierten Netzwerkantworten bestanden |
| Linux/macOS-Scanner, eingebetteter Python-Kern unter Windows | 6 Prüfungen mit simulierten Antworten bestanden |
| Auslieferung | Alle fünf Artefakte bytegleich zur Quelle und SHA-256 korrekt; Offline-Start, neue Menüs und Bericht-Download bestanden |

`npm run release` erzeugt ein Paket unter `dist/netzwerktool-<Zeitstempel>/`.
`node test/release.js` prüft das zuletzt erzeugte Paket; alternativ dessen Ordner als
Argument angeben. Der 500-Geräte-Vergleich benötigte für einen zusätzlichen
Renderdurchlauf lokal rund 3 ms; das ist keine garantierte Laufzeit für beliebige Pläne.

`npm run test:all` führt Funktionstests, Regressionen, Kontrastmessungen, visuelle
Layoutprüfungen und isolierte Scanner-Tests aus. Ergebnisse und Screenshots liegen
in `test/output/`. Die fertige HTML-Datei wird per `file://` in einem separaten
Browserkontext geprüft; bestehende Benutzerprofile werden nicht benutzt.

Die Scanner-Tests prüfen Berechnung, JSON, TCP-Erkennung bei fehlendem Ping,
Abbruch und Netzbezug mit simulierten Antworten. Ein echter Scan und eine Ausführung
auf Linux/macOS sind hier nicht Bestandteil der Validierung. Die zusätzliche
Testauswahl für Firefox/WebKit ist vorbereitet; ohne installierte Engine wird
ein verständlicher Fehler ausgegeben, kein bestandener Test vorgetäuscht.

Browser-Sicherungen sind an Browserprofil und gegebenenfalls den Pfad der HTML-Datei
gebunden. Das Entfernen von Browserdaten kann auch IndexedDB löschen. Vor einem
Browser- oder Dateipfadwechsel JSON exportieren. Autosave und benannte Projekte
verwenden weiter localStorage; bei großen Bildprojekten kann dessen Limit früher
als das Archivbudget erreicht werden. JSON bleibt der portable Sicherungsweg.

Die Anordnung ist eine deterministische Heuristik. Die Hindernisvermeidung sucht
einfache rechtwinklige Umwege; bei dicht verschachtelten Hindernissen kann eine
manuelle Leitungsführung nötig bleiben. Es wird keine kreuzungsfreie Zeichnung
für jeden Graphen garantiert. Scanstatus und Nachbarmeldungen bleiben Beobachtungen
zum angegebenen Zeitpunkt, keine laufende Überwachung oder Kabelverifikation.

Undo hält weiterhin Zustands-Snapshots, teilt aber Bildstrings zwischen den
Snapshots. Ein vollständiges Änderungsprotokoll als Ersatz für Snapshots wurde
angesichts der erreichten Verbesserung nicht eingeführt; das Review stellte es
ausdrücklich unter den Vorbehalt weiteren Bedarfs.
