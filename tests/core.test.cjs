'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAuthToken, verifyAuthToken } = require('../apps/server/src/auth.cjs');
const { normalizeKey, hashKey, createLicenseKey, constantTimeEqual, signPayload, verifyPayload } = require('../apps/license-api/src/crypto.cjs');

test('session tokens verify, reject tampering and expire', () => {
  const now = 1_800_000_000_000;
  const secret = 'test-secret-that-is-long-enough';
  const token = createAuthToken(37, secret, now);
  assert.equal(verifyAuthToken(token, secret, now + 1000).sub, 37);
  assert.equal(verifyAuthToken(token, 'different-secret', now + 1000), null);
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyAuthToken(tampered, secret, now + 1000), null);
  assert.equal(verifyAuthToken(token, secret, now + 8 * 24 * 60 * 60 * 1000), null);
});

test('licence keys are random-format keys and are normalized consistently', () => {
  const a = createLicenseKey();
  const b = createLicenseKey();
  assert.match(a, /^MFORGE-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.notEqual(a, b);
  assert.equal(normalizeKey(a.toLowerCase()), normalizeKey(a.replaceAll('-', ' ')));
  assert.equal(hashKey(a), hashKey(a.toLowerCase().replaceAll('-', ' ')));
  assert.equal(constantTimeEqual('secret', 'secret'), true);
  assert.equal(constantTimeEqual('secret', 'not-secret'), false);
});

test('Ed25519 licence payload signatures validate and tampering is rejected', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const payload = { product: 'mirrorforge', tier: 'pro', deviceId: 'a'.repeat(36), maxScreens: 20 };
  const signature = signPayload(payload, privateKey);
  assert.equal(verifyPayload(payload, signature, publicKey), true);
  assert.equal(verifyPayload({ ...payload, tier: 'commercial' }, signature, publicKey), false);
  assert.equal(verifyPayload(payload, 'invalid-signature', publicKey), false);
});

test('server-side tier quotas are sensible and monotonic', () => {
  const { TIERS } = require('../apps/server/src/license.cjs');
  assert.ok(TIERS.free.maxScreens < TIERS.home.maxScreens);
  assert.ok(TIERS.home.maxScreens < TIERS.pro.maxScreens);
  assert.ok(TIERS.pro.maxScreens < TIERS.commercial.maxScreens);
  assert.ok(TIERS.commercial.maxDevices > TIERS.pro.maxDevices);
});
