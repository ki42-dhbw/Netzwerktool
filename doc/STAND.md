# Arbeitsstand — 14.09.2026

Die Programmprüfung wurde umgesetzt. Einzelheiten, Prüfungen und verbleibende
praktische Grenzen: [Umsetzungsprotokoll](UMSETZUNG-2026-09-14.md).
Der Repository-Hauptordner mit `src/` ist die maßgebliche Quelle.
`npm run test:all` prüft Anwendung und Scanner, `npm run release` erstellt die Auslieferung.

Neu: zuverlässige Dialogabschlüsse und Projektwechsel, Speicherfehlerbehandlung,
IndexedDB-Sicherungsverlauf, bereinigte Importvalidierung, konsistentes Symbol-Undo,
duplikatfreie Scanübernahme, Schnittstellen, Inventar und Netzprüfung,
Berichtsexport, automatische Anordnung, Bildcache und überarbeitete Scanner.

Die folgenden Abschnitte dokumentieren den vorherigen Ausbau vom 20.08.2026.

Die Architektur und die wichtigsten Arbeitsbefehle stehen in der
[README](../README.md); die Erweiterungspunkte beschreibt das Handbuch.
Dieses Dokument hält fest, was zuletzt entstanden ist und wo es weitergehen könnte.

## Zuletzt entstanden

**Schrift für Text, Notiz und Beschriftung.** `NWT.Decor.textStyle()` ist die einzige Stelle,
die über Schriftart, Größe, Farbe, Schnitt und Ausrichtung entscheidet — für alle drei
Textarten gemeinsam. Die Schriftart kommt als Schlüssel aus einer festen Tabelle, nie als
CSS-Wert: eine freie Eingabe wäre in einer importierten Projektdatei nicht mehr
vertrauenswürdig. Vier Systemschriften mit Rückfallkette; eine Schriftdatei mitzuliefern
verbietet die Einzeldatei-Auslieferung ebenso wie die Lizenzlage.

Zwei Feinheiten, die im Betrieb zählen: Die Schriftfarbe wird nur gesetzt, wenn der Anwender
sie ausdrücklich anhakt — sonst folgt sie dem Design, und ein Wechsel ins Dunkle ergibt keine
schwarze Schrift auf schwarzem Grund. Und ein Textfeld bemisst sich am Text: `fitTextBox()`
schreibt die Maße beim Rendern zurück, damit Ankerpunkte, Auswahlrechteck und Export dieselbe
Größe sehen. Deshalb hat ein Textfeld keinen Ziehgriff, eine Notiz dagegen schon — dort
bestimmt die Box den Umbruch, der jetzt mit der Schriftgröße mitwächst.

**Knoten und Abzweige an Verbindungen.** Zwei verschiedene Dinge, bewusst getrennt gehalten:

*Knoten* (`conn.points`) steuern nur den Weg der Linie. Rechtsklick auf die Leitung →
„Knoten hier einfügen"; der Punkt landet im nächstgelegenen Abschnitt, sonst spränge die
Leitung woanders hin. Bei Auswahl erscheinen Griffe, Doppelklick entfernt einen. Alle drei
Linienführungen laufen darüber — orthogonal mit rechtwinkligen Zwischenwegen, gerade als
Streckenzug, gebogen weich gerundet. Eine Leitung mit eigenen Knoten wird nicht mehr gegen
parallele Leitungen versetzt.

*Abzweige* sind dagegen ein echtes Objekt: ein Gerät vom Typ `junction`, das als Punkt in der
Leitungsfarbe erscheint. „Abzweig hier einfügen" teilt die Leitung; die beiden Hälften erben
Art, Farbe, VLAN und Ebene. Weil ein Abzweig ein normales Objekt ist, gelten Auswahl, Ziehen,
Ebenen, Index und Löschen unverändert, und man kann von ihm aus mit den gewohnten Mitteln
weiterverbinden. Die Alternative — ein Verbindungsende, das auf eine Verbindung statt auf ein
Gerät zeigt — hätte Index, Validierung und Löschlogik gebrochen.

Ein Abzweig zählt nicht als Gerät: die Statusleiste führt ihn getrennt, das Dashboard lässt
ihn aus der Auswertung heraus. Ein T-Stück ist keine Komponente des Netzes.

**Text, Grafik und Dekoration** (`src/js/27-decor.js`). Zwölf neue Katalogeinträge in der
Kategorie *Text & Grafik*: Rahmen, abgerundeter Rahmen, Kreis, Ellipse, Raute, Dreieck,
Sechseck, Stern, Linie, Pfeil, Doppelpfeil, geschweifte Klammer — dazu die schon vorhandenen
Textfeld und Notiz. Jede Figur ist eine reine Funktion `(w, h) → Pfaddaten`; Render, Dialog
und Export greifen nur darauf zu.

Zwei Entscheidungen tragen das Ganze: Dekoration liegt in einer eigenen Ebene **hinter**
Leitungen und Geräten (`#l-deco`, mit `front:true` in `#l-deco-front`), und neue Formen sind
ungefüllt. Ein Rahmen um eine Gerätegruppe verdeckt damit nichts. Offene Figuren — Linie,
Pfeil, Klammer — werden nie gefüllt; dort ergäbe eine Füllung nur einen Klecks.

Das Aussehen steht als Attribut am Element, nicht in CSS: eine Regel `.decor-shape{fill:none}`
überstimmte jede eingestellte Füllung und ginge im SVG-Export verloren. Größe ändert man am
Anfasser unten rechts oder im Dialog; gedreht wird um die Mitte, und der Anfasser rechnet die
Drehung heraus.

Nebenbei behoben: Ein Typwechsel Gerät → Notiz baute die Kachel bisher nicht neu auf und
lief in einen Nullzugriff. `Render.syncGroups()` prüft jetzt die Bauform (`data-shape`).

**Maskierung vertraulicher Angaben** (`src/js/28-privacy.js`). `NWT.Privacy.mask(kind, text,
ctx)` ist die einzige Stelle, an der entschieden wird, ob eine sichtbare Angabe unkenntlich
wird — das Rendering ruft sie beim Setzen *jedes* Textes auf. Dadurch sind Zeichenfläche,
Ausdruck und Bildexport zwangsläufig gleich, und es kann kein Feld vergessen werden.

Maskiert wird der Text selbst, nie ein Balken darüber: ein Balken über echtem Text wäre im
SVG bloße Deko, die Adresse stünde weiter im Quelltext. Vier Stile (Punkte, teilweise, Balken,
weglassen), sieben Gruppen (IP, MAC, Hostname, Namen, Ports, Leitungsbeschriftungen, Notizen).
IP-, MAC- und Namenserkennung laufen über *einen* Ausdruck über alle Muster — nacheinander
angewandte Ausdrücke liefen über bereits Maskiertes.

Zwei Wege: `⚙ → Vertrauliche Angaben maskieren` schaltet die Zeichenfläche um (man sieht, was
später im Bild steht), `Export → Als Bild speichern (maskiert)` entscheidet je Export. Nicht
erfasst und im Handbuch benannt: Gerätefotos, Projektname, die JSON-Arbeitsdatei.

**Verbindungen aus dem Analyse-Skript.** Das mitgelieferte PowerShell-Skript ist jetzt die
Fassung 5: Sie findet die aktive Schnittstelle über die Standardroute, erkennt Geräte auch
ohne Ping-Antwort und leitet Verbindungen ab. `parseScanJson()` liest die neuen Felder
(`links`, `gateway`, `localAddress`, `wifi`, `discovery` je Host).

Der Knackpunkt war die Verdichtung. Für 20 Hosts lieferte das Skript 56 Ableitungen: dasselbe
Paar dreifach, dazu ein Stern vom Scan-Rechner zu jedem gesehenen Gerät. Ungefiltert wäre das
ein unlesbarer Filz. `reduceLinks()` macht daraus 19 Kanten — bestbelegte Ableitung je Paar,
dann je Gerät die beste Verbindung, bei Gleichstand zum stärker vernetzten Gegenüber. Aus
„ich habe alle gesehen“ wird so „ich hänge am selben Verteiler wie alle anderen“.

`planLayout()` nutzt dieselbe Auswertung für die Anordnung: Verteiler nach oben, was daran
hängt darunter. Eingetragen wird als **logische Verbindung** (grau gestrichelt) — welches
Kabel wo steckt, weiß ohne SNMP/LLDP niemand. Nur die Anbindung des Scan-Rechners wird als
WLAN geführt, wenn das Skript das meldet.

Zwei Erkennungsfehler fielen dabei auf und sind behoben: Namensregeln liefen über den
vollständigen DNS-Namen, sodass in einem FritzBox-Netz *jedes* Gerät als WLAN-Router galt
(jetzt zählt nur die erste Marke). Und das Standardgateway wurde von einer Portheuristik
überstimmt — jetzt schlägt die Auskunft des Betriebssystems jede Vermutung.

**Dunkles Design** (`src/js/16-theme.js`). Drei Zustände — hell, dunkel, automatisch (folgt
dem Betriebssystem). Umschalten über *⚙ → Design wechseln* oder auf der Einstellungsseite
unter *Bedienung*. Umgesetzt über `data-theme` am `<html>`-Element und CSS-Token; es gibt
keine zweite Farbliste im JavaScript.

Zwei Dinge daran sind Absicht und sollten so bleiben: Die dunklen Regeln stehen **oberhalb**
der Marker `/*__DIAGRAM_CSS_START__*/` in `src/styles.css`, damit sie nicht in den SVG-Export
wandern; und der Druck setzt vorübergehend `data-theme="light"` und stellt danach wieder her.
Export und Ausdruck sind deshalb immer hell — ein Netzplan auf schwarzem Grund ist auf Papier
unbrauchbar.

Bereichsfarben werden im dunklen Design über `color-mix()` aufgehellt, damit ihre Beschriftung
lesbar bleibt und der Farbton trotzdem erkennbar ist.

**Setups** (`src/js/26-setups.js`). Benannte Momentaufnahmen *der Einstellungen* — Raster,
Ausrichten, Linienführung, Übersichtskarte, Bilder, Hardware-Ansicht, Standard-Verbindungstyp,
eigene Verbindungsarten, Bildauswahl, Design und Hinweisfenster. Bewusst **nicht** enthalten:
Geräte, Verbindungen, Bereiche, eigene Symbole, Projektdaten und der Bildausschnitt — ein
Setup soll die Darstellung umstellen, nicht die Ansicht verreißen.

Setups liegen in `NWT.Prefs`, nicht im Projekt: „Präsentation“ gilt damit für jeden Netzplan,
und eine weitergegebene JSON-Datei zwingt dem Empfänger nichts auf. Anwenden ist ein einziger
Undo-Schritt. Drei Beispiele (*Arbeiten*, *Präsentation*, *Druck*) lassen sich auf Knopfdruck
anlegen; es sind normale Setups und dürfen geändert werden.

**Kontrastprüfung** (`test/contrast.js`). Misst jede sichtbare Schrift gegen ihren
tatsächlichen Hintergrund, in beiden Designs, auf Zeichenfläche, Einstellungsseite, Dashboard
und Handbuch. HTML über `color`, die Zeichenfläche gezielt über `fill` — dort trägt `color`
die Symbolfarbe des Geräts und ergäbe Fehlalarme. Die Prüfung schlägt auch fehl, wenn sie zu
wenige Elemente erfasst; eine Messung, die nichts findet, weil sie nichts misst, ist kein
bestandener Test.

Sie hat vier echte Fehler gefunden, die alle behoben sind: `src/help/help.css` war beim
Umbau auf Token vergessen worden (graue Schrift auf weißen Schaltflächen, 2.02), weiße Schrift
auf dem hellen Akzentblau (2.75), `--ink-3`/`--h-ink3` zu hell (3.3–4.34) und Bereichstitel
bei 2.94. Der letzte Lauf: 3754 Messungen, keine Beanstandung.

**Typwahl neben „Verbinden“.** In der Werkzeugleiste steht rechts neben der Schaltfläche eine
Auswahlliste mit allen 48 Verbindungsarten, gruppiert nach den sieben Kategorien, davor ein
Strichmuster in der wirksamen Farbe. Die Auswahl setzt `settings.defaultConnType` **und**
schaltet in den Verbindungsmodus — wer den Typ wählt, will zeichnen. Dieselbe Einstellung
steht auf der Einstellungsseite unter *Bedienung*; beide Stellen zeigen denselben Wert.

**Bildbibliothek** (`src/js/25-library.js`). Der Ordner `bilder/` wird beim Bauen eingebettet;
die Zuordnung Dateiname → Gerätetyp entsteht immer zur Laufzeit, damit Abgleich und
Alias-Tabelle nur an einer Stelle existieren. Zweiter Weg: Ordner in der Anwendung einlesen
(`webkitdirectory`), dort wird im Browser verkleinert.

Der Abgleich läuft in drei Stufen — Typkennung/Bezeichnung, Alias-Tabelle, unscharf — und
liefert je Datei Typ, Begründung und Zuverlässigkeit. Ziffern werden geprüft:
`Central_Station_2` wird nicht als CS3 durchgewinkt. Endungen wie `_small` oder `_a` gelten
als Bildvariante, nicht als anderes Gerät. Alle sieben vorhandenen Dateien treffen sicher,
seit `mb_cs2` und `mb_ms2` im Katalog sind.

**Verbindungsarten** — 48 Arten in sieben Gruppen (`CONN_CATEGORIES`): Netzwerk, Funk,
Peripherie, Feldbus & Industrie, Modellbahn, Strom, Sonstiges. Darstellung über
`NWT.Store.edgeStyle(conn)` in drei Ebenen.

**Hardware-Ansichten** — 28 gezeichnete Frontblenden (`src/hardware.svg`).

**Einstellungsseite** (`24-settings.js`) mit den breiten Karten *Bildbibliothek*,
*Verbindungsarten* und *Gerätebilder je Typ*.

**Handbuch** 23 Kapitel, 86 Unterabschnitte. Zuletzt neu: 5.6 Knoten, 5.7 Abzweige,
6.8 Schrift; davor 6.4–6.7 Text und Grafik, 10.4–10.6 Maskierung, 17.6 Erkannte
Verbindungen, 21.8 Design, 21.9 Setups.
Die beiden neuen Themen sind bewusst in bestehende Kapitel eingehängt statt als neue Kapitel
angelegt — eine Umnummerierung hätte alle Querverweise gebrochen.

## Bekannte Kleinigkeit

Bei **1280 px** Fensterbreite braucht die Werkzeugleiste durch die neue Typwahl **drei Zeilen**
statt zwei — alles bleibt erreichbar, kostet aber rund 35 px Höhe. Bei 1500 und 1920 px bleibt
es bei zwei Zeilen. Abhilfe wäre eine Zeile CSS: die Liste schmaler machen (aktuell bis 168 px,
`#opt-conntype` in `src/styles.css`) oder den Modus-Schaltflächen die Textbeschriftung nehmen.
Bewusst offengelassen, weil es Geschmackssache ist.

## Mögliche nächste Schritte

Alles Kür, nichts davon nötig:

- **Legende** auf der Zeichenfläche, die die tatsächlich verwendeten Verbindungsarten mit
  Farbe, Strich und Bezeichnung auflistet und sich mitdruckt. Bei 48 Arten der naheliegendste
  nächste Schritt — und mit den Grafikelementen wäre sie jetzt leicht zu bauen.
- **Analyse-Skript für Linux/macOS nachziehen.** Die Bash-Fassung liefert noch keine `links`;
  die Auswertung im Programm ist bereits darauf vorbereitet.
- **SNMP- oder LLDP-Auswertung** als eigene Analysequelle. Erst damit wären Verbindungen keine
  Ableitungen mehr, sondern Tatsachen.
- **Pfeilspitzen** als Eigenschaft je Verbindungsart — sinnvoll bei Strom und USB, unsinnig
  bei Ethernet, deshalb nicht global.
- `bilder/Intellibox_1_a.jpg` ist 1500 px breit und 107 KB; der Build warnt zu Recht.
  Ein Verkleinern der Quelldatei auf rund 600 px spart gut 90 KB in der Auslieferungsdatei.
- Weitere Frontblenden für Typen ohne Hardware-Ansicht (Cloud, VPN, WAN, Rack, Gebäude).
- Portbeschriftungen an Leitungen weichen einander noch nicht aus; bei dichten Plänen
  überlagern sie sich gelegentlich.
- **Setups exportieren/importieren.** Sie liegen im Browser und verschwinden mit den
  Website-Daten. Eine kleine JSON-Datei neben dem Projekt wäre denkbar — bislang bewusst
  nicht gebaut, weil sie die Einzeldatei-Auslieferung um eine Begleitdatei erweitert.

## Befehle

```bash
node build.js            # netzwerk_topologie_tool.html, hilfe.html, Analyse-Skripte
node build.js --watch
npm test                 # 195 Prüfungen im echten Browser
npm run test:contrast    # Kontrastmessung in beiden Designs
npm run test:visual      # Screenshots nach test/output/
npm run test:all         # alle drei
```
