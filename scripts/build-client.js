'use strict';
const path = require('node:path');
function buildClient() {
  require('esbuild').buildSync({
    entryPoints: [path.join(__dirname, '..', 'forest3d.js')],
    outfile: path.join(__dirname, '..', 'forest3d.bundle.js'),
    bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['es2020'],
    legalComments: 'inline'
  });
}
if (require.main === module) buildClient();
module.exports = { buildClient };
