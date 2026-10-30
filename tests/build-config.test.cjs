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


test('Capacitor TypeScript config dependency is installed at repository root', () => {
  assert.ok(packageJson.devDependencies.typescript, 'Capacitor needs TypeScript to parse capacitor.config.ts');
});

test('Linux AppImage uses the static runtime toolset for Ubuntu 24.04+ compatibility', () => {
  assert.equal(packageJson.build.toolsets?.appimage, '1.0.3');
});

test('Modern hosted iOS IPA uses iOS 15 target and is not mislabeled iOS 13', () => {
  assert.match(releaseWorkflow, /name: Modern iOS 15\+ unsigned IPA/);
  assert.match(releaseWorkflow, /IPHONEOS_DEPLOYMENT_TARGET=15\.0/);
  assert.match(releaseWorkflow, /ios15plus-unsigned\.ipa/);
});

test('Legacy iOS 9 IPA uses opt-in Xcode 12.5.1 self-hosted runner', () => {
  assert.match(releaseWorkflow, /MIRRORFORGE_IOS9_RUNNER_READY == 'true'/);
  assert.match(releaseWorkflow, /runs-on: \[self-hosted, macOS, ios9-xcode12\]/);
  assert.match(releaseWorkflow, /Xcode 12\.5\.1/);
  assert.match(releaseWorkflow, /needs\['ios-legacy'\]\.result == 'skipped'/);
});
