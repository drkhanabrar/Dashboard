'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');
const fs = require('node:fs');
const path = require('node:path');
const releaseWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8');

test('Electron Builder config avoids the Linux custom schema that blocked all targets', () => {
  assert.ok(packageJson.build && typeof packageJson.build === 'object', 'build configuration must exist');
  assert.equal(Object.hasOwn(packageJson.build, 'linux'), false,
    'V1.1 deliberately leaves Linux-specific metadata out of build config to avoid cross-target schema validation');
 });

test('Linux package targets are explicit in the scripts instead of build.linux', () => {
  assert.match(packageJson.scripts['build:linux'], /electron-builder\s+--linux\s+AppImage\s+deb\s+--x64/);
  assert.match(packageJson.scripts['build:linux:arm64'], /electron-builder\s+--linux\s+AppImage\s+deb\s+--arm64/);
});

test('platform settings are kept under the build key', () => {
  for (const platform of ['win', 'mac']) {
    assert.ok(packageJson.build[platform] && typeof packageJson.build[platform] === 'object',
      `build.${platform} must be an object`);
    assert.equal(Object.hasOwn(packageJson, platform), false,
      `${platform} must not be configured at package.json root`);
  }
});


test('Every local desktop build script disables Electron Builder self-publishing', () => {
  for (const name of ['build:win', 'build:win:arm64', 'build:linux', 'build:linux:arm64', 'build:mac:intel', 'build:mac:arm']) {
    assert.match(packageJson.scripts[name], /--publish\s+never$/, `${name} must not publish from electron-builder`);
  }
});


test('GitHub Actions desktop builds never publish directly from electron-builder', () => {
  assert.match(releaseWorkflow, /electron-builder --linux AppImage deb --\$\{\{ matrix\.arch \}\} --publish never/);
  assert.match(releaseWorkflow, /electron-builder --\$\{\{ matrix\.platform \}\} --\$\{\{ matrix\.arch \}\} --publish never/);
  assert.match(releaseWorkflow, /token: \$\{\{ github\.token \}\}/);
  assert.match(releaseWorkflow, /contents: write/);
});
