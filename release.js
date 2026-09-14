'use strict';
// Ausschließlich Artefakte aus dem maßgeblichen Projektordner ausliefern.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = __dirname;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'dist', 'netzwerktool-' + stamp);
fs.mkdirSync(output, { recursive: true });
const files = ['start.bat', 'STARTEN.txt', 'README.md', 'LICENSE-HINWEIS.md',
  'netzwerk_topologie_tool.html', 'hilfe.html', 'netzwerk_analyse.ps1', 'netzwerk_analyse.sh'];
const manifest = { created: new Date().toISOString(), schemaVersion: 2, files: [] };
for (const name of files) {
  const bytes = fs.readFileSync(path.join(root, name));
  fs.writeFileSync(path.join(output, name), bytes);
  manifest.files.push({ name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Auslieferung erstellt: ' + output);
