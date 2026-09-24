'use strict';
const fs = require('node:fs');
const path = require('node:path');

// A whitelist keeps the game server, tests and backups out of the public site.
const assets = ['neon-strike.html', 'shared.js', 'multiplayer.js', 'multiplayer.css', 'forest3d.bundle.js'];
function buildStatic({ output = path.join(__dirname, '..', 'dist') } = {}) {
  const root = path.join(__dirname, '..');
  require('./build-client').buildClient();
  fs.mkdirSync(output, { recursive: true });
  // Remove obsolete generated configuration files if this output directory is reused.
  for (const file of ['runtime-config.js', 'connection-config.js']) fs.rmSync(path.join(output, file), { force: true });
  for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(output, file));
  fs.copyFileSync(path.join(root, 'neon-strike.html'), path.join(output, 'index.html'));
  return output;
}
if (require.main === module) {
  try {
    buildStatic();
    console.log('Static game built in dist/. Multiplayer uses the same-site Vercel Function at /api/ws.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { buildStatic };
