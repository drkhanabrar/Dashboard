'use strict';
const crypto = require('node:crypto');
function constantTimeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function normalizeKey(key) { return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function hashKey(key) { return crypto.createHash('sha256').update(normalizeKey(key)).digest('hex'); }
function createLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () => Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join('');
  return `MFORGE-${segment()}-${segment()}-${segment()}`;
}
function signPayload(payload, privateKey) {
  return crypto.sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('base64');
}
function verifyPayload(payload, signature, publicKey) {
  try { return crypto.verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(signature, 'base64')); }
  catch { return false; }
}
module.exports = { constantTimeEqual, normalizeKey, hashKey, createLicenseKey, signPayload, verifyPayload };
