'use strict';
// Prüft, dass ein sauberer GitHub-Checkout vollständig und veröffentlichbar ist.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const required = [
  'README.md', 'LICENSE-HINWEIS.md', 'CONTRIBUTING.md', 'SECURITY.md',
  'CHANGELOG.md', '.gitignore', '.gitattributes', '.github/workflows/ci.yml',
  'package.json', 'package-lock.json', 'build.js', 'release.js', 'start.bat',
  'netzwerk_topologie_tool.html', 'hilfe.html', 'netzwerk_analyse.ps1',
  'netzwerk_analyse.sh', 'src/index.html', 'src/styles.css', 'test/smoke.js'
];
required.forEach(name => assert.ok(fs.existsSync(path.join(ROOT, name)), 'Fehlt: ' + name));

const app = fs.readFileSync(path.join(ROOT, 'netzwerk_topologie_tool.html'), 'utf8');
assert.match(app, /window\.__NWT_IMAGE_LIBRARY__\s*=\s*\[\]/,
  'Das GitHub-Paket muss ohne ungeklärte Produktfotos gebaut sein.');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['node_modules', 'dist', 'output'].includes(entry.name) ? [] : files(full);
    return [full];
  });
}
const all = files(ROOT);
for (const file of all.filter(name => name.endsWith('.md'))) {
  const markdown = fs.readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    const pathname = decodeURIComponent(target.split('#')[0]);
    assert.ok(fs.existsSync(path.resolve(path.dirname(file), pathname)),
      path.relative(ROOT, file) + ': Linkziel fehlt: ' + target);
  }
}

const publicText = all.filter(name => /\.(?:md|js|json|html|css|svg|ps1|sh|bat|txt|yml)$/.test(name));
for (const file of publicText) {
  const content = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(content, /C:\\Users\\|C:\\Projekte\\KI\\Netzwerktool/i,
    'Lokaler absoluter Pfad in ' + path.relative(ROOT, file));
}

console.log('OK Repository: Dateien, Links, lokale Pfade und öffentliche Bildbibliothek geprüft');
