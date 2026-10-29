'use strict';
const fs = require('node:fs');
const path = require('node:path');
const manifestPath = path.resolve('android/app/src/main/AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) { console.error(`Android manifest not found: ${manifestPath}`); process.exit(1); }
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android.software.leanback')) manifest = manifest.replace(/<application\b/, '<uses-feature android:name="android.software.leanback" android:required="false" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <application');
if (!manifest.includes('android:usesCleartextTraffic=')) manifest = manifest.replace(/<application\b/, '<application android:usesCleartextTraffic="true"');
if (!manifest.includes('android.intent.category.LEANBACK_LAUNCHER')) {
  manifest = manifest.replace(/(<action android:name="android\.intent\.action\.MAIN"\s*\/>\s*<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/, '$1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />');
}
fs.writeFileSync(manifestPath, manifest);
console.log('Configured Android cleartext access for trusted LAN servers and added Android TV launcher support.');
