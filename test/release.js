'use strict';
// Fertiges Paket: Prüfsummen, Offline-Start, neue Menüs und Bericht-Download.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');
const { launch, ROOT, outFile } = require('./browser');
async function main() {
  const dist = path.join(ROOT, 'dist');
  const directory = process.argv[2] ? path.resolve(process.argv[2]) :
    path.join(dist, fs.readdirSync(dist).filter(x => x.startsWith('netzwerktool-')).sort().pop());
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files.length, 8);
  for (const file of manifest.files) {
    assert.equal(path.basename(file.name), file.name);
    const bytes = fs.readFileSync(path.join(directory, file.name));
    assert.equal(bytes.length, file.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
    assert.deepEqual(bytes, fs.readFileSync(path.join(ROOT, file.name)));
  }
  console.log('OK Paket: alle acht Artefakte und SHA-256-Pruefsummen stimmen');
  const { browser } = await launch();
  try {
    const page = await browser.newPage();
    const errors = [], remote = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
    await page.goto(pathToFileURL(path.join(directory, 'netzwerk_topologie_tool.html')).href);
    await page.waitForFunction(() => window.NWT && NWT.Workbench);
    await page.evaluate(() => { NWT.Commands.loadExample(); });
    await page.waitForFunction(() => NWT.Store.project.devices.length === 8);
    for (const action of ['inventory', 'review', 'layout']) {
      await page.locator('[data-act="analysis-menu"]').click();
      await page.locator('[data-act="' + action + '"]').click();
      await page.locator('#modal[open]').waitFor();
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-act="export-menu"]').click();
    await page.locator('[data-act="report"]').click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportieren', exact: true }).click();
    const report = outFile('release-bericht.html');
    await (await downloading).saveAs(report);
    const reportPage = await browser.newPage();
    reportPage.on('pageerror', e => errors.push(e.message));
    await reportPage.goto(pathToFileURL(report).href);
    assert.equal(await reportPage.locator('svg').count(), 1);
    assert.equal(await reportPage.locator('table').count(), 5);
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    console.log('OK Paket: Offline-Start, Inventar, Pruefung, Anordnung und eigenstaendiger Bericht');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
