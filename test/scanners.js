'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
function run(command, args) {
  const r = spawnSync(command, args, { stdio: 'inherit', cwd: path.join(__dirname, '..'), windowsHide: true });
  if (r.error || r.status !== 0) { console.error(r.error || 'Scanner-Test fehlgeschlagen'); process.exit(1); }
}
if (process.platform === 'win32') run('powershell', ['-NoProfile', '-File', 'test/scanner.ps1']);
else {
  const pwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { windowsHide: true });
  if (pwsh.status === 0) run('pwsh', ['-NoProfile', '-File', 'test/scanner.ps1']);
  else console.log('PowerShell-Tests: auf diesem System nicht verfuegbar.');
}
run(process.env.NWT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['test/scanner.py']);
