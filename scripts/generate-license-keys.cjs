'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const secretDir = path.join(root, 'secrets');
const privatePath = path.join(secretDir, 'license-private.pem');
const publicPath = path.join(root, 'apps', 'server', 'config', 'license-public-key.pem');
const force = process.argv.includes('--force');
fs.mkdirSync(secretDir, { recursive: true });
if (fs.existsSync(privatePath) && !force) {
  console.error(`Refusing to overwrite ${privatePath}. Use --force only when you intend to rotate the issuer key.`);
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('Created an Ed25519 licence-signing key pair.');
console.log(`Private key (KEEP OUT OF GITHUB): ${privatePath}`);
console.log(`Public verification key: ${publicPath}`);
console.log('The public key must be committed/bundled into server builds. Keep the private key only on the issuer host or in a protected secret store.');
