'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const config = path.join(root, 'capacitor.config.ts');
if (!fs.existsSync(config)) { console.error('capacitor.config.ts is missing.'); process.exit(1); }
const webDir = path.join(root, 'apps', 'mobile', 'www');
for (const file of ['index.html', 'mobile.css', 'mobile.js']) {
  if (!fs.existsSync(path.join(webDir, file))) { console.error(`Missing mobile launcher file: ${file}`); process.exit(1); }
}
console.log('MirrorForge mobile launcher assets are ready.');
