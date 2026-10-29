'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }

test('legacy iOS native client targets iOS 9 and includes WKWebView', () => {
  const project = read('apps/mobile/legacy-ios/MirrorForgeLegacy.xcodeproj/project.pbxproj');
  const controller = read('apps/mobile/legacy-ios/LegacyViewController.m');
  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 9\.0/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.mirrorforge\.legacy/);
  assert.match(controller, /WKWebView/);
  assert.match(controller, /loadFileURL/);
});

test('legacy remote display renderer is ES5 syntax and served by an explicit route', () => {
  const renderer = read('apps/server/public/legacy-display.js');
  const server = read('apps/server/src/server.cjs');
  assert.doesNotMatch(renderer, /=>|\bconst\b|\blet\b|\basync\b|\?\.|`/);
  assert.doesNotMatch(renderer, /\bfetch\s*\(/);
  assert.match(server, /app\.get\('\/legacy-display\/:token'/);
  assert.ok(fs.existsSync(path.join(root, 'apps/server/public/legacy-display.html')));
  assert.ok(fs.existsSync(path.join(root, 'apps/server/public/legacy-display.css')));
});

test('legacy launcher accepts a complete display URL and rewrites it to the compatible renderer', () => {
  const launcher = read('apps/mobile/legacy-ios/Resources/legacy.js');
  assert.match(launcher, /display\|legacy-display/);
  assert.match(launcher, /\/legacy-display\//);
  assert.doesNotMatch(launcher, /=>|\bconst\b|\blet\b|\basync\b|\?\.|`/);
});
