'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../apps/server/src/server.cjs');
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirrorforge-smoke-'));
  let started;
  try {
    started = await startServer({ host: '127.0.0.1', port: 0, dataDir });
    const response = await fetch(`http://127.0.0.1:${started.port}/api/health`);
    const result = await response.json();
    if (!response.ok || result.ok !== true || result.product !== 'MirrorForge') throw new Error(`Unexpected health response: ${JSON.stringify(result)}`);
    console.log(`Smoke test passed: MirrorForge server returned healthy response on port ${started.port}.`);
  } finally {
    if (started?.server) await new Promise((resolve) => started.server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exitCode = 1; });
