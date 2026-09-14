**Programmprüfung und Verbesserungsvorschläge — 14.09.2026**

Dieser Bericht dokumentiert den Zustand vor den Änderungen. Die anschließende
Umsetzung steht im [Umsetzungsprotokoll](UMSETZUNG-2026-09-14.md).

Das Netzwerktool besitzt eine solide Grundlage: 30 JavaScript-Module, ein gemeinsames Datenmodell, Undo/Redo, mehrere Importformate, SVG-/PNG-Export, eigene Symbole, Gerätebilder, Maskierung und ein eingebettetes Handbuch. Die offline lauffähige Einzeldatei ist für diesen Einsatzzweck sinnvoll und sollte erhalten bleiben. Der größte Verbesserungsbedarf liegt bei Datensicherheit, konsistenten Zustandswechseln und belastbarer Netzwerkübernahme.

Untersucht wurden die zentralen Abläufe über die Module in `src/js/`, Oberfläche und Styles, Handbuchanbindung, Build, Tests sowie beide ausgelieferten Analyseskripte. Die folgenden Befunde unterscheiden reproduzierte Fehler, Beobachtungen im Quellcode und mögliche Erweiterungen. Der Text dokumentiert den Zustand vor der anschließenden Umsetzung.

**Prüfergebnis**

| Prüfung | Ergebnis |
|---|---|
| Vorhandene Funktionstests, `node test/smoke.js` | 195/195 bestanden |
| Kontrasttests, `node test/contrast.js` | 4.548 Messungen bestanden |
| Visuelle Tests, `node test/visual.js` | Bestanden; Ansichten bei 1.280, 1.500 und 1.920 Pixeln erzeugt |
| JavaScript-Syntax | 36 Dateien ohne Syntaxfehler |
| Build-Konsistenz | Alle vier im Speicher erzeugten Ausgabedateien stimmen bytegenau mit der Auslieferung überein |
| Zusätzliche Review-Prüfungen | Zwölf isolierte Fälle einschließlich eines Leistungsexperiments; Befunde unten |

Die Browserprüfungen liefen im installierten Chrome mit separaten Testkontexten. Bestehende Benutzerprofile und deren gespeicherte Projekte wurden nicht verwendet. Es wurden keine echten Netzwerkscans ausgeführt; die Analyseskripte wurden statisch untersucht. Die Ergebnisse sind keine vollständige Prüfung aller Browser oder Betriebssysteme.

Die zusätzlichen Fälle wurden ursprünglich mit einem einmaligen Prüfskript untersucht.
Dieses historische Skript dokumentierte das fehlerhafte Verhalten und ist deshalb nicht
Teil der veröffentlichten Regressionssuite. Die dauerhaften Erwartungen stehen nun in
`test/regression.js`.

**Priorität 1 — Speichern und Projektwechsel zuverlässig machen**

1. **Enter im Speicherdialog speichert nicht.** Reproduziert: Enter im Namensfeld schließt den Dialog, während dessen Promise unerledigt bleibt. Der anschließende Speichercode wird nicht ausgeführt. Ursache: Das native Formular verwendet `method="dialog"`, aber nur die Schaltflächen führen durch die eigene Abschlusslogik. Ein Handler für `submit` fehlt. Empfehlung: Einen gemeinsamen Submit-Pfad für Enter und den Speichern-Knopf einführen, Werte prüfen und jedes Dialog-Promise genau einmal auflösen. Native Dialogabschlüsse ebenfalls berücksichtigen. Akzeptanzprüfung: Name eingeben, Enter drücken, Projekt wieder laden; Name und Inhalt müssen erhalten sein. [Fundstelle](../src/js/08-modal.js#L38)

2. **Laden verwirft Änderungen ohne Rückfrage und ohne Undo.** Reproduziert: Ein Projekt mit einem Gerät speichern, ein weiteres Gerät hinzufügen und die gespeicherte Fassung laden. Das zweite Gerät verschwindet, es erscheint keine Bestätigung, und Undo ist anschließend leer. Empfehlung: Änderungen seit dem letzten gesicherten Stand verfolgen und vor Projektwechsel eine Auswahl „Sichern / Verwerfen / Abbrechen“ anbieten. Browser-Sicherung und Dateiexport sollten dabei klar unterscheidbar sein. Eine Wiederherstellungskopie vor dem Wechsel ergänzt diesen Schutz. [Fundstelle](../src/js/12-commands.js#L124)

3. **Fehlschlag des Projektindex wird als erfolgreicher Speichervorgang zurückgemeldet.** Reproduziert durch einen gezielten Schreibfehler ausschließlich für `nwt.index`: Das Projektobjekt wird gespeichert, `saveProject()` liefert `true`, aber die Ladeliste bleibt leer. `writeIndex()` zeigt einen Fehler, gibt ihn jedoch nicht an den Aufrufer weiter. Empfehlung: Erfolg nur melden, wenn Projekt und Index erfolgreich geschrieben wurden; fehlgeschlagene Teilschritte zurückrollen oder beim nächsten Start reparieren. Längerfristig bietet sich transaktionale Speicherung an. [Fundstelle](../src/js/10-persistence.js#L52), [Aufrufer](../src/js/10-persistence.js#L102)

4. **Ein Autosave-Speicherfehler sperrt den Speicherzugriff bis zum Neuladen.** Reproduziert: Nach einem simulierten Quotenfehler ist der Speicher wieder beschreibbar, aber `available()` liefert weiter `false` und die Anwendung listet vorhandene Projekte nicht mehr. Die Daten sind dabei weiterhin vorhanden. Ursache ist das dauerhafte Setzen von `storageOk = false`. Empfehlung: Lesbarkeit und Schreibbarkeit getrennt behandeln, Lese- und Löschzugriffe weiter erlauben, Schreibfähigkeit nach Entlastung erneut prüfen und den Sicherungsstatus dauerhaft sichtbar anzeigen. Ein nur kurz sichtbarer Toast reicht für einen anhaltenden Ausfall nicht aus. [Fundstelle](../src/js/10-persistence.js#L125)

**Priorität 2 — Import, Symbole und Analyse konsistent halten**

5. **Eigene Symbole geraten bei mehreren Bedienwegen aus dem Takt.** Drei Fälle sind reproduziert:

   - Eine fremde Projektdatei ohne eigene Symbole importieren und abbrechen: Das aktuelle Projekt enthält sein Symbol weiterhin, der globale Katalog kennt es anschließend nicht mehr. Bereits `Model.validate()` verändert den aktiven Katalog.
   - Ein eigenes Symbol anlegen und rückgängig machen: Es verschwindet aus den Projektdaten, bleibt jedoch im Katalog und in den SVG-Definitionen registriert.
   - Ein vorhandenes PC-Gerät im Eigenschaftsdialog auf einen eigenen Typ umstellen: Der Typ wird angeboten, beim Übernehmen aber still auf `pc` zurückgesetzt.

   Empfehlung: Validierung ohne Seiteneffekte implementieren und importierte Typen lokal auflösen. Einen gemeinsamen Ablauf zum Anwenden eines Projektzustands verwenden, der auch Katalog, SVG-Definitionen, Auswahl und Ansicht synchronisiert. Eigene Typen über dieselbe Gültigkeitsprüfung wie eingebaute Typen akzeptieren. [Validierung](../src/js/02-model.js#L466), [Undo](../src/js/03-history.js#L82), [Typwechsel](../src/js/09-dialogs.js#L147)

6. **Projektvalidierung akzeptiert problematische Werte und scheitert an reparierbaren Daten.** Reproduziert: `layers: [null]` verursacht einen internen Zugriff auf eine nicht vorhandene Ebene. Gültiges JSON mit `1e309` übernimmt nicht endliche Koordinaten und einen nicht endlichen ID-Zähler. Eine Datei mit `version: 999` wird ohne Warnung zu Version 1. Außerdem gilt `toString` wegen geerbter Objekteigenschaften als bekannter Gerätetyp. Empfehlung: Nach dem Filtern der Ebenen einen gültigen Standard sicherstellen; Zahlen auf Endlichkeit, Grenzen und bei IDs auf sichere Ganzzahlen prüfen; Tabellenzugriffe auf eigene Schlüssel begrenzen. Unbekannte neuere Dateiversionen verständlich zurückweisen, bekannte ältere Versionen ausdrücklich migrieren. [Ebenen](../src/js/02-model.js#L454), [Zahlen](../src/js/02-model.js#L510), [Version](../src/js/02-model.js#L444), [Typprüfung](../src/js/01-catalog.js#L295)

7. **Wiederholte Übernahme eines Scanergebnisses erzeugt Duplikate.** Reproduziert: Dasselbe Analyseergebnis zweimal übernehmen erzeugt aus einem Host zwei Geräte. Beim ersten Übernehmen wird `appliedId` gesetzt; die zweite Übernahme prüft weiterhin das ursprüngliche `existingId`. Das erneute Öffnen der Erkennungsansicht verwendet das gespeicherte Analyseergebnis. Empfehlung: Vor jeder Übernahme den aktuellen Bestand erneut abgleichen und das Ergebnis danach aktualisieren. Geräte und Verbindungen sollten bei unverändertem Input nur einmal entstehen. Den Fall zusätzlich nach Projektwechsel und Undo prüfen. [Fundstelle](../src/js/20-discovery.js#L809)

8. **Subnetze und CSV-Felder werden unzuverlässig übernommen.** Reproduziert: Ein Scan mit `10.20.0.0/16` ordnet den Host `10.20.5.10` intern `10.20.5.0/24` zu. Eine CSV-Zeile `10.20.0.10;"server;backup";R1` wird als Hostname `server` und Raum `backup` gelesen. Empfehlung: Subnetzzuordnung aus tatsächlichem Präfix und Adresszugehörigkeit ableiten; fehlen Präfixdaten, eine Annahme ausdrücklich kennzeichnen. CSV mit Unterstützung für zitierte Felder, enthaltene Trennzeichen, doppelte Anführungszeichen und Zeilenumbrüche parsen. [Subnetze](../src/js/20-discovery.js#L662), [CSV](../src/js/20-discovery.js#L339)

**Priorität 2 — Leistung und Bedienung verbessern**

9. **Bildzuordnung verursacht unnötig hohe Kosten beim Rendern.** Gemessen mit einfachen PC-Knoten ohne Verbindungen und der eingebauten Bibliothek: Ein bereits aufgebautes Diagramm benötigte im Median dreier weiterer Renderdurchläufe rund 62 ms für 100 Geräte und 285 ms für 500 Geräte. Bei vorübergehend deaktivierter Bildsuche waren es ungefähr 1 bzw. 2 ms. Dies ist eine lokale Vergleichsmessung, keine garantierte Zielgeschwindigkeit. `imageFor()` analysiert die Bibliothek immer wieder; die Geometrie- und Renderpfade rufen diese Funktion vielfach auf. Empfehlung: Zuordnungen je Typ zwischenspeichern und bei Änderungen an Bibliothek, Typen oder Auswahl gezielt verwerfen. Anschließend größere Pläne mit Verbindungen und Bildern messen. [Fundstelle](../src/js/25-library.js#L209)

10. **Die Tastaturbedienung ist unvollständig.** Reproduziert: Einstellungen über `Strg+,` öffnen lässt den Fokus auf der dahinterliegenden Zeichenfläche. Tab wechselt anschließend zur verdeckten Minimap-Schaltfläche. Außerdem sind die normalen Katalogkacheln klickbare `div`-Elemente ohne Tastaturaktivierung. Empfehlung: Fokus beim Öffnen in das Overlay setzen, innerhalb halten und beim Schließen zurückgeben. Hintergrundelemente währenddessen aus der Bedienung nehmen. Katalogeinträge als passende interaktive Elemente umsetzen; Auswahl und Geräteeigenschaften auch ohne Maus erreichbar machen. Die vorhandenen guten Kontraste lösen diese Bedienlücken nicht. [Overlay](../src/js/24-settings.js#L91), [Katalog](../src/js/13-sidebar.js#L93)

11. **Speicher- und Änderungsverarbeitung für größere Projekte vorbereiten.** Im Quellcode beobachtet: Undo hält bis zu 60 vollständige Projektkopien einschließlich Bilddaten; Autosave kopiert und serialisiert das Gesamtprojekt. Beim Hinzufügen jedes einzelnen Geräts werden die Indizes vollständig neu aufgebaut, auch während einer größeren Scanübernahme. Empfehlung: Zunächst Sammeländerungen mit einmaligem Indexaufbau einführen und realistische Belastungsfälle messen. Danach bei Bedarf Änderungen statt kompletter Snapshots speichern, Bilder zentral referenzieren und eine Speicherverwaltung mit Kapazitätsanzeige ergänzen. Eine IndexedDB-basierte Speicherung ist als separate Verbesserung mit Migration, Fehlerbehandlung und Prüfung des lokalen Dateibetriebs zu bewerten. JSON-Export bleibt der portable Sicherungsweg. [Historie](../src/js/03-history.js#L9), [Store](../src/js/02-model.js#L225), [Autosave](../src/js/10-persistence.js#L125)

**Priorität 2/3 — Analyseskripte und Projektpflege**

12. **Analyseskripte angleichen und ihre Ergebnisse genauer beschreiben.** Statische Befunde: Das Windows-Skript prüft Ping und viele TCP-Verbindungen nacheinander. Bei großen Netzen begrenzt es auf die ersten `MaxHosts` Adressen; diese Auswahl kann den relevanten Netzbereich verfehlen. Auch bei ausdrücklich anderem Subnetz verwendet es die automatisch bestimmte lokale Schnittstelle und das lokale Gateway für abgeleitete Links. Das Shell-Skript behandelt ausschließlich `/24`, übernimmt nur Ping-Antworter und prüft deren Ports; sein `/dev/tcp`-Ersatzpfad besitzt keinen ausdrücklich gesetzten Timeout. Beide Skripte haben deutlich unterschiedliche Ausgabeumfänge.

   Empfehlung: Schnittstelle und Scanbereich ausdrücklich wählbar machen, tatsächlich geprüfte Bereiche und ausgelassene Adressen im Ergebnis dokumentieren, begrenzte Parallelität und einheitliche Timeouts verwenden und unterbrochene Scans mit Teilergebnis abschließen. ARP-/TCP-Erkennung auch im Shell-Skript unterstützen. Abgeleitete Links nur mit passendem Netzbezug erzeugen. Beobachtungszeitpunkt und Nachweismethode als strukturierte Daten bis in das Frontend erhalten; ein importierter Status ist eine Aufnahme zum Scanzeitpunkt. Für diese Skripte fehlen in der vorhandenen Testsuite entsprechende Ausführungstests. [Windows-Skript](../src/analyse/netzwerk_analyse.ps1), [Shell-Skript](../src/analyse/netzwerk_analyse.sh)

13. **Einen verbindlichen Arbeits- und Repository-Ordner festlegen.** Im geprüften Arbeitsstand existierte eine zusätzliche, nicht immer synchronisierte Projektkopie. Empfehlung: Einen einzigen maßgeblichen Projektordner verwenden und Releases daraus erzeugen. Im Watch-Modus zusätzlich `bilder/` überwachen; der damalige Build beobachtete nur Quellverzeichnisse. Die Dokumentation nannte außerdem unterschiedliche Testzahlen: README 147, Arbeitsstand 195. Solche Angaben möglichst aus einem gemeinsamen Stand ableiten. [Watch](../build.js#L202), [README](../README.md)

14. **Die Tests um Fehlerfälle ergänzen.** Die vorhandenen 195 Prüfungen sichern viele reguläre Abläufe ab, übersehen aber die oben reproduzierten Fälle. Empfehlung: Die bestätigten Fehler als gezielte Regressionstests aufnehmen: Enter, Projektwechsel, Indexfehler, Speichererholung, Import-Abbruch, Symbol-Undo, Typwechsel, wiederholte Scanübernahme und zitierte CSV-Felder. Dazu getrennte Prüfungen für Scanner, größere Topologien und vollständig per Tastatur bediente Abläufe. Weitere Browser gezielt nach den tatsächlich unterstützten Plattformen prüfen. Screenshot-Erzeugung und einige Layoutprüfungen ersetzen keine automatische Prüfung jeder Bildänderung.

**Sinnvolle funktionale Erweiterungen nach den Fehlerkorrekturen**

| Erweiterung | Konkreter Nutzen |
|---|---|
| Sichtbarer Sicherungsstatus und Sicherungshistorie | Zeigt letzten erfolgreichen Sicherungszeitpunkt, offene Änderungen und Wiederherstellungsmöglichkeiten |
| Netzplan-Prüfung | Meldet doppelte IPs, widersprüchliche Portbelegung, fehlende Endpunkte und auffällige Netz-/VLAN-Zuordnungen; Hinweise bleiben übersteuerbar |
| Bessere automatische Anordnung | Ergänzt das vorhandene Layout bei der Scanübernahme um eine Anordnung des gesamten Plans und um Leitungsführung mit Hindernisvermeidung |
| Port- und Verbindungsübersicht als Tabelle | Erleichtert Suche, Vergleich und Bearbeitung größerer Bestände sowie die Dokumentation |
| Berichtsexport | Verbindet Zeichnung, Geräteliste, Verbindungsliste und Scanzeitpunkt in einer druckbaren Ausgabe |
| Mehrere Netzwerkschnittstellen pro Gerät | Bildet mehrere IPs, Netzanschlüsse und unterschiedliche Netzzugehörigkeiten eines Servers oder Routers genauer ab |

**Empfohlene Umsetzung:** Zuerst Punkte 1–4 samt Regressionstests bearbeiten. Danach die Zustandswechsel und Datenübernahme aus Punkten 5–8 korrigieren. Anschließend Bildsuche, Tastaturbedienung und Sammelverarbeitung verbessern. Scanner und zusätzliche Funktionen lassen sich darauf aufbauend in getrennten Schritten erweitern.
