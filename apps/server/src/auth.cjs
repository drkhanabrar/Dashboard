'use strict';
const crypto = require('node:crypto');
function createAuthToken(userId, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: now + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function verifyAuthToken(tokenValue, secret, now = Date.now()) {
  if (!tokenValue || typeof tokenValue !== 'string') return null;
  const [payload, signature] = tokenValue.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(data.sub) || data.exp < now) return null;
    return data;
  } catch { return null; }
}
module.exports = { createAuthToken, verifyAuthToken };
