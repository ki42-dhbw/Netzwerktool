# Mitwirken

Fehlerberichte und Änderungen sind willkommen. Bitte keine realen Scan- oder
Projektdateien mit vertraulichen Adressen, Namen, Standorten oder Bildern in
Issues und Pull Requests veröffentlichen.

## Entwicklung

1. Node.js 18 oder neuer installieren.
2. `npm ci` ausführen.
3. Quellen ausschließlich unter `src/` bearbeiten.
4. Mit `node build.js` die vier generierten Artefakte aktualisieren.
5. Mit `npm run test:all` prüfen.

Die Anwendung muss weiterhin als einzelne HTML-Datei vollständig offline über
`file://` funktionieren. Laufzeitabhängigkeiten, CDN-Dateien und Netzwerkaufrufe
im Frontend passen nicht zu diesem Auslieferungsmodell.

Neue Texte und Oberflächenelemente werden auf Deutsch ergänzt. Module unter
`src/js/` registrieren sich gekapselt am Namensraum `NWT` und werden in
Dateinamenreihenfolge gebaut.

